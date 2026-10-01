-- ep_request_booking with a session, already_booked, quota.

begin;
set local role service_role;

do $$
declare
  E      constant uuid := '10000000-0000-0000-0000-000000000001';
  E_RACE constant uuid := '10000000-0000-0000-0000-000000000004';
  N_Q1   constant uuid := '20000000-0000-0000-0000-000000000011';
  N_UNL  constant uuid := '20000000-0000-0000-0000-000000000012';
  N_RACE constant uuid := '20000000-0000-0000-0000-000000000042';
  s_mario text;
  s_luisa text;
  s_paolo text;
  b   record;
  b2  record;
  a   record;
  res record;
  t   record;
  v_tokens bigint;
  v_legacy uuid;
begin
  s_mario := test.new_session('mario@example.com', 'Mario Rossi');
  -- Last renewed two days ago: the next use renews it (at most once a day).
  update underclub.contact_sessions
     set expires_at = now() + interval '1 day', last_used_at = now() - interval '2 days'
   where token_hash = underclub.hash_ticket_token(s_mario);

  -- With a session: confirmed on the spot, ticket token, no activation link,
  -- form fields ignored, session renewed.
  select count(*) into v_tokens from underclub.activation_tokens;
  select * into b from underclub.ep_request_booking(
    s_mario, E, N_UNL, null, null, null, true, true, 'meta-ads', test.secret());
  assert b.outcome = 'confirmed', format('session booking %s', b.outcome);
  assert b.ticket_token is not null and b.activation_token is null, 'ticket yes, link no';
  assert b.contact_email = 'mario@example.com' and b.contact_full_name = 'Mario Rossi', 'contact from session';
  assert b.event_title = 'Future Night' and b.entry_name = 'Intero', 'labels';
  select * into res from underclub.reservations where id = b.reservation_id;
  assert res.status = 'confirmed' and res.confirmed_at = now() and res.pending_expires_at is null, 'confirmed row';
  assert res.ticket_access_token_hash = underclub.hash_ticket_token(b.ticket_token), 'ticket hash';
  assert res.source = 'meta-ads' and res.email = 'mario@example.com' and res.full_name = 'Mario Rossi', 'row data';
  assert (select count(*) from underclub.activation_tokens) = v_tokens, 'no activation token issued';
  assert (select expires_at from underclub.contact_sessions
           where token_hash = underclub.hash_ticket_token(s_mario)) = now() + interval '12 months', 'session renewed';
  assert (select marketing_consent_at from underclub.contacts where email = 'mario@example.com') is null,
    'form consents ignored with a session';

  -- Same event again with the session: already_booked, nothing issued.
  select * into b2 from underclub.ep_request_booking(s_mario, E, N_Q1, null, null, null, null, null, null, test.secret());
  assert b2.outcome = 'already_booked' and b2.reservation_id = b.reservation_id, 'already_booked (session)';
  assert b2.ticket_token is null and b2.activation_token is null, 'nothing issued';

  -- Same contact, no session: already_booked + a LOG-IN link.
  select * into b2 from underclub.ep_request_booking(
    null, E, N_UNL, 'Whoever', '2000-01-01', 'Mario@Example.com', true, true, null, test.secret());
  assert b2.outcome = 'already_booked' and b2.reservation_id = b.reservation_id, 'already_booked (no session)';
  assert b2.activation_token is not null and b2.ticket_token is null, 'login link issued';
  select * into t from underclub.activation_tokens
   where token_hash = underclub.hash_ticket_token(b2.activation_token);
  assert t.reservation_id is null and t.consent_marketing is null and t.consent_profiling is null, 'it is a login token';
  select * into a from underclub.ep_activate(b2.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'none', 'login token works';

  -- Live pending + session: already_booked on the pending.
  s_luisa := test.new_session('luisa@example.com', 'Luisa Bianchi');
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Luisa Bianchi', '1990-01-01', 'luisa@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', 'luisa pending';
  select * into b2 from underclub.ep_request_booking(s_luisa, E, N_UNL, null, null, null, null, null, null, test.secret());
  assert b2.outcome = 'already_booked' and b2.reservation_id = b.reservation_id, 'live pending counts with session';

  -- Stale pending + session: the same row becomes confirmed, its link dies.
  update underclub.reservations set pending_expires_at = now() - interval '1 minute' where id = b.reservation_id;
  select * into b2 from underclub.ep_request_booking(s_luisa, E, N_Q1, null, null, null, null, null, 'pr-giulia', test.secret());
  assert b2.outcome = 'confirmed' and b2.reservation_id = b.reservation_id and b2.ticket_token is not null,
    format('stale pending confirmed with session: %s', b2.outcome);
  select * into res from underclub.reservations where id = b.reservation_id;
  assert res.status = 'confirmed' and res.entry_id = N_Q1 and res.pending_expires_at is null
     and res.source = 'pr-giulia', 'stale row converted';
  assert (select outcome from underclub.ep_activate(b.activation_token, test.secret())) = 'invalid', 'old pending link burned';

  -- Quota on Ridotto (1) is now used by Luisa. Pending rows never count,
  -- confirmed ones do.
  select * into b from underclub.ep_request_booking(
    null, E, N_Q1, 'Anna', '1990-01-01', 'anna@example.com', null, null, null, test.secret());
  assert b.outcome = 'sold_out', format('sold_out without session: %s', b.outcome);
  assert b.reservation_id is null and b.activation_token is null and b.entry_name = 'Ridotto', 'nothing issued';
  assert (select count(*) from underclub.contacts where email = 'anna@example.com') = 0, 'no contact on sold_out';
  s_paolo := test.new_session('paolo@example.com', 'Paolo');
  select * into b from underclub.ep_request_booking(s_paolo, E, N_Q1, null, null, null, null, null, null, test.secret());
  assert b.outcome = 'sold_out', 'sold_out with session';

  -- Free the slot: cancelled rows do not count; pendings do not hold it.
  update underclub.reservations
     set status = 'cancelled', cancelled_at = now()
   where id = b2.reservation_id;
  select * into b from underclub.ep_request_booking(
    null, E, N_Q1, 'Anna', '1990-01-01', 'anna@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', 'pending allowed under quota';
  select * into b from underclub.ep_request_booking(
    null, E, N_Q1, 'Bruno', '1990-01-01', 'bruno@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', 'second pending allowed (pending does not hold quota)';
  select * into b from underclub.ep_request_booking(s_paolo, E, N_Q1, null, null, null, null, null, null, test.secret());
  assert b.outcome = 'confirmed', format('confirmed despite two pendings: %s', b.outcome);
  select * into b from underclub.ep_request_booking(
    null, E, N_Q1, 'Carla', '1990-01-01', 'carla@example.com', null, null, null, test.secret());
  assert b.outcome = 'sold_out', 'full again';
  -- Unlimited entry never sells out.
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Carla', '1990-01-01', 'carla@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', 'unlimited entry';

  -- Legacy contact-less row with the same address counts as already booked.
  select reservation_id into v_legacy from underclub.create_public_reservation(
    E_RACE, N_RACE, 'Legacy Guy', '1980-01-01', 'Legacy@Example.com ');
  -- Form data differs on purpose: the contact is recovered from the legacy
  -- row (same as ep_request_login), not from whatever was typed.
  select * into b from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Typed Name', '2001-01-01', 'legacy@example.com', true, true, null, test.secret());
  assert b.outcome = 'already_booked' and b.reservation_id = v_legacy and b.activation_token is not null,
    format('legacy row -> already_booked: %s', b.outcome);
  assert b.contact_email = 'legacy@example.com' and b.contact_full_name = 'Legacy Guy',
    'contact recovered from the legacy row to carry the login link';
  assert (select date_of_birth from underclub.contacts where email = 'legacy@example.com') = '1980-01-01',
    'dob from the legacy row';
  assert (select contact_id from underclub.reservations where id = v_legacy)
       = (select id from underclub.contacts where email = 'legacy@example.com'), 'legacy row linked';
  assert (select count(*) from underclub.reservations r
            join underclub.contacts c on c.id = r.contact_id
           where c.email = 'legacy@example.com') = 1, 'no pending created next to the legacy row';
  assert (select outcome from underclub.ep_activate(b.activation_token, test.secret())) = 'ok', 'legacy login link works';
  select * into b from underclub.ep_request_booking(
    test.new_session('legacy@example.com', 'Legacy Guy'), E_RACE, N_RACE, null, null, null, null, null, null, test.secret());
  assert b.outcome = 'already_booked' and b.reservation_id = v_legacy, 'legacy row -> already_booked (session)';
end $$;

rollback;
