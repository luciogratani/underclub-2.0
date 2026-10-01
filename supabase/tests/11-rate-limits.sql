-- Per-address cap on activation links (3/hour, 10/day per contact) and the
-- per-IP fixed-window throttle (ep_throttle). Concurrency: 08-concurrency.sql.

begin;
set local role service_role;

-- 1) Per-address cap.
do $$
declare
  E      constant uuid := '10000000-0000-0000-0000-000000000001';
  E_RACE constant uuid := '10000000-0000-0000-0000-000000000004';
  E_LATE constant uuid := '10000000-0000-0000-0000-000000000005';
  N_Q1   constant uuid := '20000000-0000-0000-0000-000000000011';
  N_UNL  constant uuid := '20000000-0000-0000-0000-000000000012';
  N_RACE constant uuid := '20000000-0000-0000-0000-000000000042';
  N_LATE constant uuid := '20000000-0000-0000-0000-000000000051';
  b    record;
  b3   record;
  res  record;
  res2 record;
  l    record;
  s    text;
  v_c  uuid;
  v_tokens bigint;
  v_contacts bigint;
  v_rows bigint;
  i int;
begin
  -- Three links in the hour: allowed (first one creates the contact).
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Rita Limit', '1990-01-01', 'rl@example.com', null, null, 'meta-ads', test.secret());
  assert b.outcome = 'pending', 'link 1';
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Rita Limit', '1990-01-01', 'rl@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', 'link 2';
  select * into b3 from underclub.ep_request_booking(
    null, E, N_UNL, 'Rita Limit', '1990-01-01', 'rl@example.com', null, null, null, test.secret());
  assert b3.outcome = 'pending', 'link 3';
  select id into v_c from underclub.contacts where email = 'rl@example.com';

  -- Fourth within the hour: rate_limited, and NOTHING written.
  select * into res from underclub.reservations where id = b3.reservation_id;
  select count(*) into v_tokens from underclub.activation_tokens;
  select count(*) into v_contacts from underclub.contacts;
  select count(*) into v_rows from underclub.reservations;
  select * into b from underclub.ep_request_booking(
    null, E, N_Q1, 'Rita Limit', '1990-01-01', 'RL@example.com', true, true, 'pr-giulia', test.secret());
  assert b.outcome = 'rate_limited', format('4th link -> %s', b.outcome);
  assert b.reservation_id is null and b.activation_token is null and b.ticket_token is null, 'nothing issued';
  assert b.event_title = 'Future Night' and b.entry_name = 'Ridotto', 'labels still returned';
  select * into res2 from underclub.reservations where id = b3.reservation_id;
  assert res2.entry_id = res.entry_id and res2.pending_expires_at = res.pending_expires_at
     and res2.source is not distinct from res.source, 'pending not refreshed';
  assert (select used_at from underclub.activation_tokens
           where token_hash = underclub.hash_ticket_token(b3.activation_token)) is null, 'last link not burned';
  assert (select count(*) from underclub.activation_tokens) = v_tokens, 'no token written';
  assert (select count(*) from underclub.contacts) = v_contacts, 'no contact written';
  assert (select count(*) from underclub.reservations) = v_rows, 'no reservation written';

  -- Other events and the log-in link share the same per-contact cap.
  select * into b from underclub.ep_request_booking(
    null, E_LATE, N_LATE, 'Rita Limit', '1990-01-01', 'rl@example.com', null, null, null, test.secret());
  assert b.outcome = 'rate_limited', 'other event limited too';
  select * into l from underclub.ep_request_login('rl@example.com');
  assert l.outcome = 'rate_limited' and l.activation_token is null and l.contact_full_name is null, 'login limited';
  assert (select count(*) from underclub.activation_tokens) = v_tokens, 'still no token written';

  -- The session path is never limited (no link is sent).
  s := test.new_session('rl@example.com');
  select * into b from underclub.ep_request_booking(s, E_LATE, N_LATE, null, null, null, null, null, null, test.secret());
  assert b.outcome = 'confirmed', format('session path not limited: %s', b.outcome);

  -- already_booked without a session would send a log-in link: limited too.
  select * into b from underclub.ep_request_booking(
    null, E_LATE, N_LATE, 'Rita Limit', '1990-01-01', 'rl@example.com', null, null, null, test.secret());
  assert b.outcome = 'rate_limited' and b.activation_token is null, format('already_booked path: %s', b.outcome);

  -- An address without a contact is never limited here.
  for i in 1..5 loop
    select * into b from underclub.ep_request_booking(
      null, E, N_UNL, 'New Person', '1990-01-01', format('new%s@example.com', i), null, null, null, test.secret());
    assert b.outcome = 'pending', 'new address not limited';
  end loop;

  -- Out of the hour but within the day: allowed again...
  update underclub.activation_tokens set created_at = now() - interval '2 hours' where contact_id = v_c;
  select * into b from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Rita Limit', '1990-01-01', 'rl@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', format('after the hour: %s', b.outcome);

  -- ...until the daily cap: 10 links in 24h (none in the last hour) block.
  update underclub.activation_tokens set created_at = now() - interval '2 hours' where contact_id = v_c;
  insert into underclub.activation_tokens (contact_id, token_hash, expires_at, created_at)
  select v_c, 'rl-filler-' || g, now() - interval '1 hour', now() - interval '3 hours'
    from generate_series(1, 10 - (select count(*) from underclub.activation_tokens where contact_id = v_c)) g;
  assert (select count(*) from underclub.activation_tokens where contact_id = v_c) = 10, 'ten in the day';
  assert (select outcome from underclub.ep_request_login('rl@example.com')) = 'rate_limited', 'daily cap (login)';
  select * into b from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Rita Limit', '1990-01-01', 'rl@example.com', null, null, null, test.secret());
  assert b.outcome = 'rate_limited', format('daily cap (booking): %s', b.outcome);

  -- Older than 24h no longer count.
  update underclub.activation_tokens set created_at = now() - interval '25 hours' where contact_id = v_c;
  assert (select outcome from underclub.ep_request_login('rl@example.com')) = 'sent', 'after the day';

  -- Log-in links alone: 3 sent, the 4th limited, no row written.
  perform test.new_session('rl2@example.com', 'Rocco Limit');
  for i in 1..3 loop
    assert (select outcome from underclub.ep_request_login('rl2@example.com')) = 'sent', format('login %s', i);
  end loop;
  select count(*) into v_tokens from underclub.activation_tokens;
  assert (select outcome from underclub.ep_request_login('rl2@example.com')) = 'rate_limited', '4th login';
  assert (select count(*) from underclub.activation_tokens) = v_tokens, 'no token on 4th login';
end $$;

-- 2) ep_throttle: fixed, aligned window; counts every hit.
do $$
declare
  v_ws timestamptz;
  v_hits int;
begin
  assert underclub.ep_throttle('k1', 'booking', 2, 600) = true,  'hit 1 within limit';
  assert underclub.ep_throttle('k1', 'booking', 2, 600) = true,  'hit 2 within limit';
  assert underclub.ep_throttle('k1', 'booking', 2, 600) = false, 'hit 3 over limit';
  assert underclub.ep_throttle('k1', 'booking', 2, 600) = false, 'hit 4 over limit';

  select window_start, hits into v_ws, v_hits from underclub.request_throttle
   where key_hash = 'k1' and action = 'booking';
  assert v_hits = 4, format('every hit counted: %s', v_hits);
  assert v_ws <= now() and v_ws > now() - interval '600 seconds', 'current window';
  assert extract(epoch from v_ws)::numeric % 600 = 0, 'window aligned on the epoch';
  assert v_ws = to_timestamp(floor(extract(epoch from now()) / 600) * 600), 'floor(epoch / window) * window';

  -- Independent per action and per key.
  assert underclub.ep_throttle('k1', 'login_link', 2, 600) = true, 'other action';
  assert underclub.ep_throttle('k2', 'booking', 2, 600) = true, 'other key';
  -- Same key/action, other window length: other window row.
  assert underclub.ep_throttle('k1', 'booking', 2, 7) = true, 'other window size';

  -- A previous window does not count.
  insert into underclub.request_throttle (key_hash, action, window_start, hits)
  values ('k3', 'booking', to_timestamp(floor(extract(epoch from now()) / 600) * 600) - interval '600 seconds', 100);
  assert underclub.ep_throttle('k3', 'booking', 1, 600) = true, 'new window starts from zero';
  assert (select hits from underclub.request_throttle
           where key_hash = 'k3' and action = 'booking' and window_start > now() - interval '600 seconds') = 1,
    'current window row';

  assert underclub.ep_throttle('k4', 'booking', 0, 600) = false, 'limit 0 always refuses';

  -- Bad arguments are a programming error.
  begin
    perform underclub.ep_throttle('k5', 'booking', 1, 0);
    raise exception 'window 0 accepted' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform underclub.ep_throttle(null, 'booking', 1, 60);
    raise exception 'null key accepted' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform underclub.ep_throttle('k5', 'booking', null, 60);
    raise exception 'null limit accepted' using errcode = 'P0001';
  exception when invalid_parameter_value then null;
  end;
end $$;

rollback;
