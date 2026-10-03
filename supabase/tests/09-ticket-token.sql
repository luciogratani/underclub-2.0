-- Derived ticket token: HMAC-SHA256(reservation id, TICKET_SECRET), base64url
-- without padding. Deterministic, secret-dependent, stored only as a hash,
-- and the secret is mandatory (>= 32 chars) on every ep_* that takes it.

begin;

-- The helper is internal (no API role can call it): checked as the owner.
do $$
declare
  ID1 constant uuid := '30000000-0000-0000-0000-0000000000aa';
  ID2 constant uuid := '30000000-0000-0000-0000-0000000000bb';
  t1 text;
begin
  t1 := underclub.derive_ticket_token(ID1, test.secret());
  -- Known answer, computed outside Postgres (Python hmac + urlsafe_b64encode,
  -- '=' stripped): pins the exact recipe documented in the migration.
  assert t1 = 'vmkTFqR1OYuXGE61Q546G1BGrIM7FYNqqv6h9xrd7Vw', format('known-answer vector: %s', t1);
  assert t1 ~ '^[A-Za-z0-9_-]{43}$', 'base64url, no padding, 43 chars';
  assert underclub.derive_ticket_token(ID1, test.secret()) = t1, 'same reservation + secret -> same token';
  assert underclub.derive_ticket_token(ID1, test.other_secret()) <> t1, 'other secret -> other token';
  assert underclub.derive_ticket_token(ID2, test.secret()) <> t1, 'other reservation -> other token';
  assert underclub.derive_ticket_token(ID1, repeat('k', 32)) is not null, 'exactly 32 chars accepted';
  assert underclub.derive_ticket_token(null, test.secret()) is null, 'null id -> null';

  begin
    perform underclub.derive_ticket_token(ID1, repeat('k', 31));
    raise exception 'short secret accepted by derive_ticket_token' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;
end $$;

set local role service_role;
do $$
declare
  E      constant uuid := '10000000-0000-0000-0000-000000000001';
  E_LATE constant uuid := '10000000-0000-0000-0000-000000000005';
  N_UNL  constant uuid := '20000000-0000-0000-0000-000000000012';
  N_LATE constant uuid := '20000000-0000-0000-0000-000000000051';
  s   text;
  b   record;
  a   record;
  l   record;
  v_hash text;
  stmt text;
  bad  text;
  bads text[] := array[null, '', repeat('k', 31)];
  stmts text[] := array[
    $q$select * from underclub.ep_request_booking(null, null, null, null, null, null, null, null, null, %L)$q$,
    $q$select * from underclub.ep_request_booking('x', '10000000-0000-0000-0000-000000000001',
         '20000000-0000-0000-0000-000000000012', 'A', '1990-01-01', 'a@example.com', null, null, null, %L)$q$,
    $q$select * from underclub.ep_activate('no-such-token', %L)$q$,
    $q$select * from underclub.ep_activate(null, %L)$q$,
    $q$select underclub.ep_session_overview('no-such-session', %L)$q$];
begin
  -- Session booking: the returned token IS the derived one, stored as hash.
  s := test.new_session('derive@example.com', 'Derive Me');
  select * into b from underclub.ep_request_booking(s, E, N_UNL, null, null, null, null, null, null, test.secret());
  assert b.outcome = 'confirmed', format('setup %s', b.outcome);
  select ticket_access_token_hash into v_hash from underclub.reservations where id = b.reservation_id;
  assert v_hash = underclub.hash_ticket_token(b.ticket_token), 'stored hash = hash(returned token)';
  assert v_hash <> b.ticket_token, 'never stored in clear';
  perform set_config('test.sess_id', b.reservation_id::text, true);
  perform set_config('test.sess_tok', b.ticket_token, true);

  -- Activation path: same recipe.
  select * into b from underclub.ep_request_booking(
    null, E_LATE, N_LATE, 'Derive Me', '1990-01-01', 'derive2@example.com', null, null, null, test.secret());
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.reservation_outcome = 'confirmed' and a.ticket_token is not null, 'activation confirmed';
  assert (select ticket_access_token_hash from underclub.reservations where id = a.reservation_id)
       = underclub.hash_ticket_token(a.ticket_token), 'activation: stored hash matches';
  perform set_config('test.act_id', a.reservation_id::text, true);
  perform set_config('test.act_tok', a.ticket_token, true);

  -- Legacy anon RPC: still a random token (not derived).
  select * into l from underclub.create_public_reservation(
    E_LATE, N_LATE, 'Legacy Lou', '1980-01-01', 'lou@example.com');
  perform set_config('test.legacy_id', l.reservation_id::text, true);
  perform set_config('test.legacy_tok', l.ticket_token, true);

  -- Missing / empty / short secret: exception 22023 on every ep_* taking it,
  -- whatever path the call would otherwise take. Nothing written.
  foreach stmt in array stmts loop
    foreach bad in array bads loop
      begin
        execute format(stmt, bad);
        raise exception 'accepted secret %: %', coalesce(bad, 'NULL'), stmt using errcode = 'P0001';
      exception when invalid_parameter_value then null;
      end;
    end loop;
  end loop;
  assert (select count(*) from underclub.contacts where email = 'a@example.com') = 0, 'nothing written on secret error';
end $$;
reset role;

-- As owner: compare with the helper directly.
do $$
begin
  assert current_setting('test.sess_tok')
       = underclub.derive_ticket_token(current_setting('test.sess_id')::uuid, test.secret()),
    'session booking token = derive(reservation id, secret)';
  assert current_setting('test.act_tok')
       = underclub.derive_ticket_token(current_setting('test.act_id')::uuid, test.secret()),
    'activation token = derive(reservation id, secret)';
  assert current_setting('test.legacy_tok')
       <> underclub.derive_ticket_token(current_setting('test.legacy_id')::uuid, test.secret()),
    'legacy token is random, not derived';
  assert (select ticket_access_token_hash from underclub.reservations
           where id = current_setting('test.legacy_id')::uuid)
       <> underclub.hash_ticket_token(
            underclub.derive_ticket_token(current_setting('test.legacy_id')::uuid, test.secret())),
    'legacy hash does not match the derived token';
end $$;

-- The door accepts the derived tokens as any other.
select test.as_admin();
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from underclub.scan_ticket_check_in(current_setting('test.sess_tok'));
  assert r.result_code = 'ok' and r.reservation_id = current_setting('test.sess_id')::uuid
     and r.full_name = 'Derive Me', format('scan derived (session): %s', r.result_code);
  select * into r from underclub.scan_ticket_check_in(current_setting('test.act_tok'));
  assert r.result_code = 'ok' and r.reservation_id = current_setting('test.act_id')::uuid,
    format('scan derived (activation): %s', r.result_code);
end $$;
reset role;

-- And the ticket page too.
set local role anon;
do $$
begin
  assert (select count(*) from underclub.open_public_ticket(
            current_setting('test.act_id')::uuid, current_setting('test.act_tok'))) = 1, 'ticket page, derived token';
end $$;

rollback;
