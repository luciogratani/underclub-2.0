-- ep_session, ep_logout, ep_my_reservations, ep_cancel_reservation.

begin;
set local role service_role;

do $$
declare
  E      constant uuid := '10000000-0000-0000-0000-000000000001';
  E_PAST constant uuid := '10000000-0000-0000-0000-000000000002';
  E_RACE constant uuid := '10000000-0000-0000-0000-000000000004';
  E_LATE constant uuid := '10000000-0000-0000-0000-000000000005';
  N_UNL  constant uuid := '20000000-0000-0000-0000-000000000012';
  N_PAST constant uuid := '20000000-0000-0000-0000-000000000021';
  N_RACE constant uuid := '20000000-0000-0000-0000-000000000042';
  N_LATE constant uuid := '20000000-0000-0000-0000-000000000051';
  s_mario text;
  s_other text;
  v_mario uuid;
  r   record;
  b   record;
  b_late record;
  b_race record;
  v_ids uuid[];
  v_past uuid;
  v_n int;
begin
  s_mario := test.new_session('mario@example.com', 'Mario Rossi');
  select id into v_mario from underclub.contacts where email = 'mario@example.com';

  -- ep_session: valid -> one row, renewed.
  update underclub.contact_sessions
     set expires_at = now() + interval '1 day', last_used_at = '2026-01-01'
   where token_hash = underclub.hash_ticket_token(s_mario);
  update underclub.contacts
     set marketing_consent_at = '2026-01-01', marketing_consent_revoked_at = null,
         profiling_consent_at = '2026-01-01', profiling_consent_revoked_at = '2026-02-01'
   where id = v_mario;

  select * into r from underclub.ep_session(s_mario);
  assert found, 'session row';
  assert r.contact_id = v_mario and r.email = 'mario@example.com' and r.full_name = 'Mario Rossi'
     and r.date_of_birth = '1990-01-01', 'session contact data';
  assert r.marketing_consent = true, 'active consent';
  assert r.profiling_consent = false, 'revoked consent';
  assert r.session_expires_at = now() + interval '12 months', 'session_expires_at renewed';
  assert (select last_used_at from underclub.contact_sessions
           where token_hash = underclub.hash_ticket_token(s_mario)) = now(), 'last_used_at';

  -- Revoked BEFORE the latest grant = active again.
  update underclub.contacts
     set profiling_consent_at = '2026-03-01', profiling_consent_revoked_at = '2026-02-01'
   where id = v_mario;
  assert (select profiling_consent from underclub.ep_session(s_mario)), 'regranted after revocation';

  -- Unknown, null, expired, revoked: zero rows.
  select count(*) into v_n from underclub.ep_session('nope');
  assert v_n = 0, 'unknown session';
  select count(*) into v_n from underclub.ep_session(null);
  assert v_n = 0, 'null session';
  s_other := test.new_session('other@example.com', 'Other');
  update underclub.contact_sessions set expires_at = now() - interval '1 second'
   where token_hash = underclub.hash_ticket_token(s_other);
  select count(*) into v_n from underclub.ep_session(s_other);
  assert v_n = 0, 'expired session';
  assert (select expires_at from underclub.contact_sessions
           where token_hash = underclub.hash_ticket_token(s_other)) < now(), 'expired session not revived';

  -- ep_logout.
  s_other := test.new_session('other@example.com', 'Other');
  assert underclub.ep_logout(s_other) = true, 'logout revokes';
  select count(*) into v_n from underclub.ep_session(s_other);
  assert v_n = 0, 'revoked session';
  assert underclub.ep_logout(s_other) = false, 'second logout: nothing to revoke';
  assert underclub.ep_logout('nope') = false, 'unknown logout';
  assert underclub.ep_logout(null) = false, 'null logout';
  assert (select outcome from underclub.ep_request_booking(
            s_other, E, N_UNL, null, null, null, null, null, null)) = 'invalid_input',
    'revoked session + no form data -> invalid_input';

  -- ep_my_reservations: confirmed + live pending on future events, ordered by
  -- date; stale pending, cancelled and past events excluded.
  select * into b_late from underclub.ep_request_booking(s_mario, E_LATE, N_LATE, null, null, null, null, null, null);
  assert b_late.outcome = 'confirmed', 'late confirmed';
  select * into b from underclub.ep_request_booking(s_mario, E, N_UNL, null, null, null, null, null, null);
  assert b.outcome = 'confirmed', 'future confirmed';
  -- live pending on Race Night (via the form path, same contact)
  select * into b_race from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Mario Rossi', '1990-01-01', 'mario@example.com', null, null, null);
  assert b_race.outcome = 'pending', 'race pending';
  -- past event row, inserted directly (bookings on past events are refused)
  insert into underclub.reservations (event_id, entry_id, contact_id, full_name, date_of_birth, email, status, confirmed_at)
  values (E_PAST, N_PAST, v_mario, 'Mario Rossi', '1990-01-01', 'mario@example.com', 'confirmed', now())
  returning id into v_past;

  select array_agg(reservation_id order by ord) into v_ids
    from (select reservation_id, row_number() over () as ord
            from underclub.ep_my_reservations(s_mario)) x;
  assert v_ids = array[b.reservation_id, b_race.reservation_id, b_late.reservation_id],
    format('my reservations order/content: %s', v_ids);
  select * into r from underclub.ep_my_reservations(s_mario) where reservation_id = b_late.reservation_id;
  assert r.status = 'confirmed' and r.event_id = E_LATE and r.event_title = 'Later Night'
     and r.event_date = test.today() + 21 and r.event_time = '23:30' and r.entry_name = 'Later entry'
     and r.entry_price = 12 and r.entry_valid_until = '2099-01-01' and r.qr_scanned_at is null
     and r.created_at is not null, 'my reservation columns';
  assert (select status from underclub.ep_my_reservations(s_mario)
           where reservation_id = b_race.reservation_id) = 'pending', 'pending listed';

  update underclub.reservations set pending_expires_at = now() - interval '1 minute' where id = b_race.reservation_id;
  select count(*) into v_n from underclub.ep_my_reservations(s_mario);
  assert v_n = 2, 'stale pending hidden';
  select count(*) into v_n from underclub.ep_my_reservations('nope');
  assert v_n = 0, 'invalid session -> no rows';

  -- ep_cancel_reservation.
  assert underclub.ep_cancel_reservation('nope', b.reservation_id) = 'invalid_session', 'invalid session';
  s_other := test.new_session('other@example.com', 'Other');
  assert underclub.ep_cancel_reservation(s_other, b.reservation_id) = 'not_found', 'someone else''s -> not_found';
  assert underclub.ep_cancel_reservation(s_mario, gen_random_uuid()) = 'not_found', 'unknown id';
  assert underclub.ep_cancel_reservation(s_mario, v_past) = 'not_cancellable', 'past event';

  assert underclub.ep_cancel_reservation(s_mario, b.reservation_id) = 'ok', 'cancel ok';
  select * into r from underclub.reservations where id = b.reservation_id;
  assert r.status = 'cancelled' and r.cancelled_at = now() and r.pending_expires_at is null, 'cancelled row';
  assert underclub.ep_cancel_reservation(s_mario, b.reservation_id) = 'not_cancellable', 'already cancelled';
  select count(*) into v_n from underclub.ep_my_reservations(s_mario);
  assert v_n = 1, 'cancelled hidden';

  -- A pending can be cancelled too (deadline cleared for the CHECK).
  assert underclub.ep_cancel_reservation(s_mario, b_race.reservation_id) = 'ok', 'cancel pending';
  assert (select pending_expires_at from underclub.reservations where id = b_race.reservation_id) is null,
    'pending deadline cleared';

  -- Scanned at the door: not cancellable.
  update underclub.reservations set qr_scanned_at = now() where id = b_late.reservation_id;
  assert underclub.ep_cancel_reservation(s_mario, b_late.reservation_id) = 'not_cancellable', 'scanned';

  -- Cancel then rebook works (partial unique index frees the slot).
  select * into r from underclub.ep_request_booking(s_mario, E, N_UNL, null, null, null, null, null, null);
  assert r.outcome = 'confirmed' and r.reservation_id <> b.reservation_id, format('rebook after cancel: %s', r.outcome);
  select * into r from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Mario Rossi', '1990-01-01', 'mario@example.com', null, null, null);
  assert r.outcome = 'pending' and r.reservation_id <> b_race.reservation_id, 'pending rebook after cancel';
end $$;

rollback;
