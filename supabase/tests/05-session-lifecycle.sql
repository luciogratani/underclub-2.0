-- ep_session_overview (incl. the once-a-day renewal), ep_logout,
-- ep_cancel_reservation.

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
  v   jsonb;
  j   jsonb;
  r   record;
  b   record;
  b_late record;
  b_race record;
  v_ids uuid[];
  v_past uuid;
  v_keys text[];
begin
  s_mario := test.new_session('mario@example.com', 'Mario Rossi');
  select id into v_mario from underclub.contacts where email = 'mario@example.com';

  -- Valid session, last renewed long ago -> contact block, renewed now.
  update underclub.contact_sessions
     set expires_at = now() + interval '1 day', last_used_at = '2026-01-01'
   where token_hash = underclub.hash_ticket_token(s_mario);
  update underclub.contacts
     set marketing_consent_at = '2026-01-01', marketing_consent_revoked_at = null,
         profiling_consent_at = '2026-01-01', profiling_consent_revoked_at = '2026-02-01'
   where id = v_mario;

  v := underclub.ep_session_overview(s_mario, test.secret());
  assert v is not null, 'overview for a valid session';
  select array_agg(k order by k) into v_keys from jsonb_object_keys(v) k;
  assert v_keys = array['contact', 'reservations'], format('top-level keys %s', v_keys);
  select array_agg(k order by k) into v_keys from jsonb_object_keys(v -> 'contact') k;
  assert v_keys = array['email', 'full_name', 'marketing_consent', 'profiling_consent', 'session_expires_at'],
    format('contact keys %s', v_keys);
  assert v #>> '{contact,email}' = 'mario@example.com' and v #>> '{contact,full_name}' = 'Mario Rossi', 'contact data';
  assert (v #> '{contact,marketing_consent}') = 'true'::jsonb, 'active consent';
  assert (v #> '{contact,profiling_consent}') = 'false'::jsonb, 'revoked consent';
  assert (v #>> '{contact,session_expires_at}')::timestamptz = now() + interval '12 months', 'session_expires_at renewed';
  assert jsonb_typeof(v -> 'reservations') = 'array' and jsonb_array_length(v -> 'reservations') = 0,
    'no reservations -> empty array';
  select * into r from underclub.contact_sessions where token_hash = underclub.hash_ticket_token(s_mario);
  assert r.last_used_at = now() and r.expires_at = now() + interval '12 months', 'renewed in the row';

  -- Renewed less than a day ago: validated only, nothing written.
  update underclub.contact_sessions
     set expires_at = now() + interval '5 days', last_used_at = now() - interval '23 hours'
   where token_hash = underclub.hash_ticket_token(s_mario);
  v := underclub.ep_session_overview(s_mario, test.secret());
  assert v is not null, 'still valid inside the renewal interval';
  assert (v #>> '{contact,session_expires_at}')::timestamptz = now() + interval '5 days',
    'expiry reported as stored, not pushed';
  select * into r from underclub.contact_sessions where token_hash = underclub.hash_ticket_token(s_mario);
  assert r.last_used_at = now() - interval '23 hours' and r.expires_at = now() + interval '5 days',
    'last_used_at / expires_at untouched within a day';
  -- Same for the other session users.
  assert underclub.ep_cancel_reservation(s_mario, gen_random_uuid()) = 'not_found', 'cancel validates';
  assert (select last_used_at from underclub.contact_sessions
           where token_hash = underclub.hash_ticket_token(s_mario)) = now() - interval '23 hours',
    'cancel does not renew within a day';

  -- Older than a day: renewed again.
  update underclub.contact_sessions set last_used_at = now() - interval '25 hours'
   where token_hash = underclub.hash_ticket_token(s_mario);
  v := underclub.ep_session_overview(s_mario, test.secret());
  select * into r from underclub.contact_sessions where token_hash = underclub.hash_ticket_token(s_mario);
  assert r.last_used_at = now() and r.expires_at = now() + interval '12 months', 'renewed after a day';
  assert (v #>> '{contact,session_expires_at}')::timestamptz = now() + interval '12 months', 'renewed expiry reported';

  -- Revoked BEFORE the latest grant = active again.
  update underclub.contacts
     set profiling_consent_at = '2026-03-01', profiling_consent_revoked_at = '2026-02-01'
   where id = v_mario;
  assert (underclub.ep_session_overview(s_mario, test.secret()) #> '{contact,profiling_consent}') = 'true'::jsonb,
    'regranted after revocation';

  -- Unknown, null, expired, revoked: null.
  assert underclub.ep_session_overview('nope', test.secret()) is null, 'unknown session';
  assert underclub.ep_session_overview(null, test.secret()) is null, 'null session';
  s_other := test.new_session('other@example.com', 'Other');
  update underclub.contact_sessions
     set expires_at = now() - interval '1 second', last_used_at = now() - interval '1 year'
   where token_hash = underclub.hash_ticket_token(s_other);
  assert underclub.ep_session_overview(s_other, test.secret()) is null, 'expired session';
  assert (select expires_at from underclub.contact_sessions
           where token_hash = underclub.hash_ticket_token(s_other)) < now(), 'expired session not revived';

  -- ep_logout.
  s_other := test.new_session('other@example.com', 'Other');
  assert underclub.ep_logout(s_other) = true, 'logout revokes';
  assert underclub.ep_session_overview(s_other, test.secret()) is null, 'revoked session';
  assert underclub.ep_logout(s_other) = false, 'second logout: nothing to revoke';
  assert underclub.ep_logout('nope') = false, 'unknown logout';
  assert underclub.ep_logout(null) = false, 'null logout';
  assert (select outcome from underclub.ep_request_booking(
            s_other, E, N_UNL, null, null, null, null, null, null, test.secret())) = 'invalid_input',
    'revoked session + no form data -> invalid_input';

  -- Reservations: confirmed + live pending on future events, ordered by
  -- date; stale pending, cancelled and past events excluded.
  select * into b_late from underclub.ep_request_booking(s_mario, E_LATE, N_LATE, null, null, null, null, null, null, test.secret());
  assert b_late.outcome = 'confirmed', 'late confirmed';
  select * into b from underclub.ep_request_booking(s_mario, E, N_UNL, null, null, null, null, null, null, test.secret());
  assert b.outcome = 'confirmed', 'future confirmed';
  -- live pending on Race Night (via the form path, same contact)
  select * into b_race from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Mario Rossi', '1990-01-01', 'mario@example.com', null, null, null, test.secret());
  assert b_race.outcome = 'pending', 'race pending';
  -- past event row, inserted directly (bookings on past events are refused)
  insert into underclub.reservations (event_id, entry_id, contact_id, full_name, date_of_birth, email, status, confirmed_at)
  values (E_PAST, N_PAST, v_mario, 'Mario Rossi', '1990-01-01', 'mario@example.com', 'confirmed', now())
  returning id into v_past;

  v := underclub.ep_session_overview(s_mario, test.secret());
  select array_agg((x ->> 'reservation_id')::uuid order by ord) into v_ids
    from jsonb_array_elements(v -> 'reservations') with ordinality as t(x, ord);
  assert v_ids = array[b.reservation_id, b_race.reservation_id, b_late.reservation_id],
    format('reservations order/content: %s', v_ids);

  select x into j from jsonb_array_elements(v -> 'reservations') x
   where x ->> 'reservation_id' = b_late.reservation_id::text;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(j) k;
  assert v_keys = array['created_at', 'entry_name', 'entry_price', 'entry_valid_until', 'event_date',
                        'event_id', 'event_time', 'event_title', 'qr_scanned_at', 'reservation_id',
                        'status', 'ticket_token'], format('reservation keys %s', v_keys);
  assert j ->> 'status' = 'confirmed' and (j ->> 'event_id')::uuid = E_LATE and j ->> 'event_title' = 'Later Night'
     and (j ->> 'event_date')::date = test.today() + 21 and (j ->> 'event_time')::time = '23:30'
     and j ->> 'entry_name' = 'Later entry' and (j -> 'entry_price') = '12.00'::jsonb
     and (j ->> 'entry_valid_until')::timestamptz = '2099-01-01'
     and (j -> 'qr_scanned_at') = 'null'::jsonb and (j ->> 'created_at') is not null, 'reservation values';
  assert j ->> 'ticket_token' = b_late.ticket_token, 'confirmed (derived) -> ticket_token present';

  select x into j from jsonb_array_elements(v -> 'reservations') x
   where x ->> 'reservation_id' = b_race.reservation_id::text;
  assert j ->> 'status' = 'pending', 'pending listed';
  assert j ? 'ticket_token' and (j -> 'ticket_token') = 'null'::jsonb, 'pending -> ticket_token null (key present)';

  -- A confirmed row whose ticket is NOT the derived one (a legacy random
  -- token, or a secret since rotated): no link offered.
  update underclub.reservations
     set ticket_access_token_hash = underclub.hash_ticket_token('some-random-legacy-token')
   where id = b.reservation_id;
  v := underclub.ep_session_overview(s_mario, test.secret());
  select x into j from jsonb_array_elements(v -> 'reservations') x
   where x ->> 'reservation_id' = b.reservation_id::text;
  assert (j -> 'ticket_token') = 'null'::jsonb, 'random-token confirmed row -> ticket_token null';
  -- Another secret derives another token: nothing matches, nothing leaks.
  v := underclub.ep_session_overview(s_mario, test.other_secret());
  assert not exists (select 1 from jsonb_array_elements(v -> 'reservations') x
                      where (x -> 'ticket_token') <> 'null'::jsonb), 'other secret -> no ticket_token';
  update underclub.reservations
     set ticket_access_token_hash = underclub.hash_ticket_token(b.ticket_token)
   where id = b.reservation_id;

  update underclub.reservations set pending_expires_at = now() - interval '1 minute' where id = b_race.reservation_id;
  assert jsonb_array_length(underclub.ep_session_overview(s_mario, test.secret()) -> 'reservations') = 2,
    'stale pending hidden';

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
  assert jsonb_array_length(underclub.ep_session_overview(s_mario, test.secret()) -> 'reservations') = 1,
    'cancelled hidden';

  -- A pending can be cancelled too (deadline cleared for the CHECK).
  assert underclub.ep_cancel_reservation(s_mario, b_race.reservation_id) = 'ok', 'cancel pending';
  assert (select pending_expires_at from underclub.reservations where id = b_race.reservation_id) is null,
    'pending deadline cleared';

  -- Scanned at the door: not cancellable.
  update underclub.reservations set qr_scanned_at = now() where id = b_late.reservation_id;
  assert underclub.ep_cancel_reservation(s_mario, b_late.reservation_id) = 'not_cancellable', 'scanned';

  -- Cancel then rebook works (partial unique index frees the slot), and the
  -- new row has its own ticket token.
  select * into r from underclub.ep_request_booking(s_mario, E, N_UNL, null, null, null, null, null, null, test.secret());
  assert r.outcome = 'confirmed' and r.reservation_id <> b.reservation_id, format('rebook after cancel: %s', r.outcome);
  assert r.ticket_token <> b.ticket_token, 'new reservation, new ticket token';
  select * into r from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Mario Rossi', '1990-01-01', 'mario@example.com', null, null, null, test.secret());
  assert r.outcome = 'pending' and r.reservation_id <> b_race.reservation_id, 'pending rebook after cancel';
end $$;

rollback;
