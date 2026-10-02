-- Night end (06:00 Europe/Rome of the day after the date) and the online
-- booking close (`booking_closes_at`, default 18:00 Rome of the date).
-- Deterministic: exact instants for the pure rules; behaviour on nights
-- dated so that the answer never depends on the time of day the suite runs.

begin;

-- The two rules, as anon (the public site reads them as computed fields).
set local role anon;
do $$
begin
  -- Summer time (CEST, UTC+2).
  assert underclub.event_ends_at('2026-07-04') = '2026-07-05 04:00:00+00', 'ends_at CEST';
  -- Clocks go back on 2026-10-25 at 03:00: the night of the 24th ends at 06:00 CET.
  assert underclub.event_ends_at('2026-10-24') = '2026-10-25 05:00:00+00', 'ends_at autumn DST night';
  -- Clocks go forward on 2027-03-28 at 02:00: 06:00 CEST.
  assert underclub.event_ends_at('2027-03-27') = '2027-03-28 04:00:00+00', 'ends_at spring DST night';

  assert underclub.event_booking_deadline('2026-10-24', null) = '2026-10-24 16:00:00+00',
    'default deadline 18:00 Rome (CEST)';
  assert underclub.event_booking_deadline('2026-12-05', null) = '2026-12-05 17:00:00+00',
    'default deadline 18:00 Rome (CET)';
  assert underclub.event_booking_deadline('2026-10-24', '2026-10-23 20:00:00+00') = '2026-10-23 20:00:00+00',
    'explicit deadline';
  assert underclub.event_booking_deadline('2026-10-24', '2026-10-27 00:00:00+00') = '2026-10-25 05:00:00+00',
    'deadline capped at the night end';
end $$;

-- Computed fields on /events, as anon (RLS: published only).
do $$
declare
  r record;
begin
  select e.date, underclub.is_over(e) as over, underclub.ends_at(e) as ends,
         underclub.booking_deadline(e) as deadline
    into r
    from underclub.events e where e.id = '10000000-0000-0000-0000-000000000001';
  assert r.over = false, 'future night not over';
  assert r.ends = underclub.event_ends_at(r.date), 'ends_at computed field';
  assert r.deadline = underclub.event_booking_deadline(r.date, null), 'booking_deadline computed field';

  select underclub.is_over(e) as over into r
    from underclub.events e where e.id = '10000000-0000-0000-0000-000000000002';
  assert r.over = true, 'night of 3 days ago is over';
end $$;
reset role;

-- Nights for this file (owner, rolled back at the end):
--   ...0006 Tonight     today     open until now + 1h (the night itself never ends today)
--   ...0007 Closed      today+2   closed a minute ago
--   ...0008 Closing     today+2   open until now + 1h
insert into underclub.events (id, title, date, time, status, booking_closes_at) values
  ('10000000-0000-0000-0000-000000000006', 'Tonight', test.today(),     '00:30', 'published', now() + interval '1 hour'),
  ('10000000-0000-0000-0000-000000000007', 'Closed',  test.today() + 2, '00:30', 'published', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000008', 'Closing', test.today() + 2, '00:30', 'published', now() + interval '1 hour');
insert into underclub.event_entries (id, event_id, name, quota, price, sort_order) values
  ('20000000-0000-0000-0000-000000000061', '10000000-0000-0000-0000-000000000006', 'Tonight entry', null, 10, 1),
  ('20000000-0000-0000-0000-000000000071', '10000000-0000-0000-0000-000000000007', 'Closed entry',  null, 10, 1),
  ('20000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000008', 'Closing entry', null, 10, 1);

set local role service_role;
do $$
declare
  E_TONIGHT constant uuid := '10000000-0000-0000-0000-000000000006';
  E_CLOSED  constant uuid := '10000000-0000-0000-0000-000000000007';
  E_CLOSING constant uuid := '10000000-0000-0000-0000-000000000008';
  E_FUTURE  constant uuid := '10000000-0000-0000-0000-000000000001';
  N_TONIGHT constant uuid := '20000000-0000-0000-0000-000000000061';
  N_CLOSED  constant uuid := '20000000-0000-0000-0000-000000000071';
  N_CLOSING constant uuid := '20000000-0000-0000-0000-000000000081';
  N_FUTURE  constant uuid := '20000000-0000-0000-0000-000000000012';
  s   text;
  b   record;
  a   record;
  t   record;
  v   jsonb;
begin
  s := test.new_session('night@example.com', 'Night Owl');

  -- A night dated today is on all day (it ends tomorrow at 06:00): bookable
  -- before its deadline, listed, cancellable.
  select * into b from underclub.ep_request_booking(s, E_TONIGHT, N_TONIGHT,
    null, null, null, null, null, null, test.secret());
  assert b.outcome = 'confirmed', format('tonight bookable, got %s', b.outcome);
  v := underclub.ep_session_overview(s, test.secret());
  assert exists (select 1 from jsonb_array_elements(v -> 'reservations') x
                  where (x ->> 'reservation_id')::uuid = b.reservation_id), 'tonight listed';
  assert underclub.ep_cancel_reservation(s, b.reservation_id) = 'ok', 'tonight cancellable';

  -- Past the deadline: refused on both paths, nothing written.
  select * into b from underclub.ep_request_booking(s, E_CLOSED, N_CLOSED,
    null, null, null, null, null, null, test.secret());
  assert b.outcome = 'not_bookable', format('closed (session), got %s', b.outcome);
  select * into b from underclub.ep_request_booking(null, E_CLOSED, N_CLOSED,
    'Late Comer', '1990-01-01', 'late.comer@example.com', null, null, null, test.secret());
  assert b.outcome = 'not_bookable', format('closed (form), got %s', b.outcome);
  assert not exists (select 1 from underclub.reservations where event_id = E_CLOSED), 'nothing written';
  assert not exists (select 1 from underclub.contacts where email = 'late.comer@example.com'),
    'no contact created on a refusal';

  -- Requested before the close, link opened after it: still confirmed.
  select * into b from underclub.ep_request_booking(null, E_CLOSING, N_CLOSING,
    'Just In Time', '1990-01-01', 'just.in.time@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', format('pending before the close, got %s', b.outcome);
  update underclub.events set booking_closes_at = now() - interval '1 minute' where id = E_CLOSING;
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'confirmed',
    format('pending confirmed after the close, got %s/%s', a.outcome, a.reservation_outcome);

  -- ...but not once the night is over.
  update underclub.events set booking_closes_at = now() + interval '1 hour' where id = E_CLOSING;
  select * into b from underclub.ep_request_booking(null, E_CLOSING, N_CLOSING,
    'Too Late', '1990-01-01', 'too.late@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', 'second pending';
  update underclub.events set date = test.today() - 2, booking_closes_at = null where id = E_CLOSING;
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.reservation_outcome = 'unavailable',
    format('pending on a night over -> unavailable, got %s', a.reservation_outcome);

  -- A night over: not listed, not cancellable, ticket flagged as ended.
  s := test.new_session('ticket@example.com', 'Ticket Holder');
  select * into b from underclub.ep_request_booking(s, E_FUTURE, N_FUTURE,
    null, null, null, null, null, null, test.secret());
  assert b.outcome = 'confirmed', 'future booking';
  perform set_config('test.ended_id', b.reservation_id::text, true);
  perform set_config('test.ended_tok', b.ticket_token, true);
  perform set_config('test.ended_sess', s, true);
end $$;
reset role;

-- Ticket page before the night ends: QR shown, marked opened.
set local role anon;
do $$
declare
  t record;
begin
  select * into t from underclub.open_public_ticket(
    current_setting('test.ended_id')::uuid, current_setting('test.ended_tok'));
  assert t.event_ended = false, 'night not over yet';
  assert t.ticket_opened_at is null, 'first opening';
end $$;
reset role;

-- The night goes by (owner): move it two days back, clear the opening.
update underclub.events set date = test.today() - 2
 where id = '10000000-0000-0000-0000-000000000001';
update underclub.reservations set ticket_opened_at = null
 where id = current_setting('test.ended_id')::uuid;

set local role anon;
do $$
declare
  t record;
begin
  select * into t from underclub.open_public_ticket(
    current_setting('test.ended_id')::uuid, current_setting('test.ended_tok'));
  assert t.event_ended = true, 'night over';
  assert t.status = 'confirmed', 'status unchanged';
end $$;
reset role;

do $$
begin
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.ended_id')::uuid) is null,
    'an ended ticket is not marked opened';
end $$;

set local role service_role;
do $$
declare
  v jsonb;
begin
  v := underclub.ep_session_overview(current_setting('test.ended_sess'), test.secret());
  assert jsonb_array_length(v -> 'reservations') = 0, 'night over: not listed';
  assert underclub.ep_cancel_reservation(current_setting('test.ended_sess'),
    current_setting('test.ended_id')::uuid) = 'not_cancellable', 'night over: not cancellable';
end $$;
reset role;

rollback;
