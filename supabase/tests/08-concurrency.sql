-- Races, with two real sessions (dblink). Data here is COMMITTED, because the
-- second session must see what the first one commits; it uses its own
-- addresses and the Race Night entries, which no other file commits to.
--
-- Pattern: c1 runs inside an open transaction (holding its locks), c2 is sent
-- asynchronously and must be BLOCKED; then c1 commits and c2's answer is read.

select set_config('test.dsn', :'dsn', false) is not null as dsn_set \gset

create function test.open2() returns void language plpgsql as $$
begin
  perform extensions.dblink_connect('c1', current_setting('test.dsn'));
  perform extensions.dblink_connect('c2', current_setting('test.dsn'));
  perform extensions.dblink_exec('c1', 'begin');
  perform extensions.dblink_exec('c2', 'begin');
end $$;

create function test.close2() returns void language plpgsql as $$
begin
  -- Drain the async connection (libpq needs the final empty result).
  perform * from extensions.dblink_get_result('c2') as t(x text);
  perform extensions.dblink_exec('c2', 'commit');
  perform extensions.dblink_disconnect('c1');
  perform extensions.dblink_disconnect('c2');
end $$;

-- 1) Two openings of the same activation link: exactly one wins.
do $$
declare
  b record;
begin
  select * into b from underclub.ep_request_booking(
    null, '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000042',
    'Race One', '1990-01-01', 'race1@example.com', null, null, null, test.secret());
  perform set_config('test.race1_tok', b.activation_token, false);
  perform set_config('test.race1_res', b.reservation_id::text, false);
end $$;

do $$
declare
  q   text := format('select outcome || '':'' || coalesce(reservation_outcome, '''') from underclub.ep_activate(%L, test.secret())',
                     current_setting('test.race1_tok'));
  o1  text;
  o2  text;
begin
  perform test.open2();
  select x into o1 from extensions.dblink('c1', q) as t(x text);
  perform extensions.dblink_send_query('c2', q);
  perform pg_sleep(0.3);
  assert extensions.dblink_is_busy('c2') = 1, 'second activation must wait for the first';
  perform extensions.dblink_exec('c1', 'commit');
  select x into o2 from extensions.dblink_get_result('c2') as t(x text);
  perform test.close2();

  assert o1 = 'ok:confirmed', format('first activation %s', o1);
  assert o2 = 'invalid:', format('second activation %s', o2);
  assert (select count(*) from underclub.contact_sessions s
            join underclub.contacts c on c.id = s.contact_id
           where c.email = 'race1@example.com') = 1, 'one session only';
  assert (select status from underclub.reservations
           where id = current_setting('test.race1_res')::uuid) = 'confirmed', 'confirmed once';
end $$;

-- 2) Two confirmations on a quota-1 entry: one confirmed, one sold_out.
-- Setup committed first (each top-level DO is its own transaction).
select set_config('test.s2a', test.new_session('race2a@example.com', 'Race Two A'), false) is not null as s2a \gset
select set_config('test.s2b', test.new_session('race2b@example.com', 'Race Two B'), false) is not null as s2b \gset

do $$
declare
  s1 text := current_setting('test.s2a');
  s2 text := current_setting('test.s2b');
  q1 text;
  q2 text;
  o1 text;
  o2 text;
begin
  q1 := format($f$select outcome from underclub.ep_request_booking(%L,
    '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000041',
    null, null, null, null, null, null, test.secret())$f$, s1);
  q2 := format($f$select outcome from underclub.ep_request_booking(%L,
    '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000041',
    null, null, null, null, null, null, test.secret())$f$, s2);

  perform test.open2();
  select x into o1 from extensions.dblink('c1', q1) as t(x text);
  perform extensions.dblink_send_query('c2', q2);
  perform pg_sleep(0.3);
  assert extensions.dblink_is_busy('c2') = 1, 'second confirmation must wait on the entry lock';
  perform extensions.dblink_exec('c1', 'commit');
  select x into o2 from extensions.dblink_get_result('c2') as t(x text);
  perform test.close2();

  assert o1 = 'confirmed', format('first %s', o1);
  assert o2 = 'sold_out', format('second %s', o2);
  assert (select count(*) from underclub.reservations
           where entry_id = '20000000-0000-0000-0000-000000000041' and status = 'confirmed') = 1,
    'quota respected';
end $$;

-- 3) Same new address booking twice at once without a session: one contact,
--    one pending row, the first link burned by the second request.
do $$
declare
  q  text := $f$select reservation_id::text || '|' || activation_token
    from underclub.ep_request_booking(null,
      '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000042',
      'Race Three', '1990-01-01', 'Race3@example.com', true, false, null, test.secret())$f$;
  o1 text;
  o2 text;
begin
  perform test.open2();
  select x into o1 from extensions.dblink('c1', q) as t(x text);
  perform extensions.dblink_send_query('c2', q);
  perform pg_sleep(0.3);
  assert extensions.dblink_is_busy('c2') = 1, 'second booking must wait on the booking lock';
  perform extensions.dblink_exec('c1', 'commit');
  select x into o2 from extensions.dblink_get_result('c2') as t(x text);
  perform test.close2();

  assert split_part(o1, '|', 1) = split_part(o2, '|', 1), format('same pending row: %s vs %s', o1, o2);
  assert (select count(*) from underclub.contacts where email = 'race3@example.com') = 1, 'one contact';
  assert (select count(*) from underclub.reservations r
            join underclub.contacts c on c.id = r.contact_id
           where c.email = 'race3@example.com') = 1, 'one reservation';
  assert (select outcome from underclub.ep_activate(split_part(o1, '|', 2), test.secret())) = 'invalid', 'first link burned';
  assert (select reservation_outcome from underclub.ep_activate(split_part(o2, '|', 2), test.secret())) = 'confirmed',
    'second link confirms';
end $$;

-- 4) Activation racing a re-booking of the same pending: serialized by the
--    booking lock, so either order is consistent (no deadlock, no orphan link).
select set_config('test.race4_tok', activation_token, false) is not null as race4
  from underclub.ep_request_booking(
    null, '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000042',
    'Race Four', '1990-01-01', 'race4@example.com', null, null, null, test.secret()) \gset

do $$
declare
  qa text := format('select outcome || '':'' || coalesce(reservation_outcome, '''') from underclub.ep_activate(%L, test.secret())',
                    current_setting('test.race4_tok'));
  qb text := $f$select outcome from underclub.ep_request_booking(null,
      '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000042',
      'Race Four', '1990-01-01', 'race4@example.com', null, null, null, test.secret())$f$;
  oa text;
  ob text;
begin

  perform test.open2();
  select x into oa from extensions.dblink('c1', qa) as t(x text);
  perform extensions.dblink_send_query('c2', qb);
  perform pg_sleep(0.3);
  assert extensions.dblink_is_busy('c2') = 1, 're-booking must wait for the activation';
  perform extensions.dblink_exec('c1', 'commit');
  select x into ob from extensions.dblink_get_result('c2') as t(x text);
  perform test.close2();

  assert oa = 'ok:confirmed', format('activation %s', oa);
  -- The re-booking saw the confirmed row: already in, log-in link instead.
  assert ob = 'already_booked', format('re-booking after activation %s', ob);
end $$;

-- 5) Two log-in requests for the same never-seen legacy address: the second
--    waits on the contact lock, then finds the contact the first created.
--    One contact, the legacy row linked once, both answered `sent`.
select reservation_id is not null as legacy5
  from underclub.create_public_reservation(
    '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000042',
    'Race Five', '1990-01-01', 'Race5@example.com') \gset

do $$
declare
  q  text := $f$select outcome from underclub.ep_request_login('race5@example.com')$f$;
  o1 text;
  o2 text;
begin
  perform test.open2();
  select x into o1 from extensions.dblink('c1', q) as t(x text);
  perform extensions.dblink_send_query('c2', q);
  perform pg_sleep(0.3);
  assert extensions.dblink_is_busy('c2') = 1, 'second log-in request must wait on the contact lock';
  perform extensions.dblink_exec('c1', 'commit');
  select x into o2 from extensions.dblink_get_result('c2') as t(x text);
  perform test.close2();

  assert o1 = 'sent' and o2 = 'sent', format('both sent: %s / %s', o1, o2);
  assert (select count(*) from underclub.contacts where email = 'race5@example.com') = 1, 'one contact';
  assert (select count(*) from underclub.reservations r
            join underclub.contacts c on c.id = r.contact_id
           where c.email = 'race5@example.com') = 1, 'legacy row linked';
end $$;

-- 6) Concurrent hits on the same throttle window: the upsert serializes on
--    the primary key, each hit sees its own count (no lost update).
do $$
declare
  q  text := $f$select underclub.ep_throttle('race-ip', 'booking', 1, 3600)::text$f$;
  o1 text;
  o2 text;
begin
  perform test.open2();
  select x into o1 from extensions.dblink('c1', q) as t(x text);
  perform extensions.dblink_send_query('c2', q);
  perform pg_sleep(0.3);
  assert extensions.dblink_is_busy('c2') = 1, 'second hit must wait on the first one''s row';
  perform extensions.dblink_exec('c1', 'commit');
  select x into o2 from extensions.dblink_get_result('c2') as t(x text);
  perform test.close2();

  assert o1 = 'true' and o2 = 'false', format('first within, second over the limit: %s / %s', o1, o2);
  assert (select sum(hits) from underclub.request_throttle where key_hash = 'race-ip') = 2, 'both hits counted';
end $$;
