-- open_public_ticket, scan_ticket_check_in (as the admin role), legacy RPC,
-- and all of them (plus the log-in link) surviving the cleanup's column drop.

begin;

-- Setup as the endpoints would do it; tokens handed to later blocks through
-- transaction-local settings.
set local role service_role;
do $$
declare
  E       constant uuid := '10000000-0000-0000-0000-000000000001';
  N_UNL   constant uuid := '20000000-0000-0000-0000-000000000012';
  N_EARLY constant uuid := '20000000-0000-0000-0000-000000000013';
  E_LATE  constant uuid := '10000000-0000-0000-0000-000000000005';
  N_LATE  constant uuid := '20000000-0000-0000-0000-000000000051';
  s text;
  b record;
  l record;
begin
  s := test.new_session('mario@example.com', 'Mario Rossi');

  select * into b from underclub.ep_request_booking(s, E, N_UNL, null, null, null, null, null, null, test.secret());
  perform set_config('test.ok_id', b.reservation_id::text, true);
  perform set_config('test.ok_tok', b.ticket_token, true);

  select * into b from underclub.ep_request_booking(
    test.new_session('early@example.com', 'Early Bird'), E, N_EARLY, null, null, null, null, null, null, test.secret());
  perform set_config('test.early_id', b.reservation_id::text, true);
  perform set_config('test.early_tok', b.ticket_token, true);

  -- Never opened before the column-drop rehearsal below.
  select * into b from underclub.ep_request_booking(
    test.new_session('late@example.com', 'Late Larry'), E_LATE, N_LATE, null, null, null, null, null, null, test.secret());
  perform set_config('test.late_id', b.reservation_id::text, true);
  perform set_config('test.late_tok', b.ticket_token, true);

  s := test.new_session('cancel@example.com', 'Cancel Me');
  select * into b from underclub.ep_request_booking(s, E_LATE, N_LATE, null, null, null, null, null, null, test.secret());
  assert underclub.ep_cancel_reservation(s, b.reservation_id) = 'ok', 'cancelled through the endpoint';
  perform set_config('test.cancel_id', b.reservation_id::text, true);
  perform set_config('test.cancel_tok', b.ticket_token, true);

  -- A pending row that somehow holds a ticket token (never issued by the
  -- endpoints, but the door must not treat it as "already in").
  select * into b from underclub.ep_request_booking(
    null, E_LATE, N_LATE, 'Pending Pia', '1990-01-01', 'pia@example.com', null, null, null, test.secret());
  assert b.outcome = 'pending', 'pia pending';
  perform set_config('test.pending_id', b.reservation_id::text, true);

  -- Legacy anon RPC still works (additive guarantee).
  select * into l from underclub.create_public_reservation(
    E, N_UNL, 'Legacy Guy', '1980-01-01', 'legacy@example.com');
  assert l.reservation_status = 'confirmed' and l.ticket_token is not null, 'legacy RPC works';
  perform set_config('test.legacy_id', l.reservation_id::text, true);
  perform set_config('test.legacy_tok', l.ticket_token, true);
end $$;
reset role;

-- As owner: give the pending row a token, and make the legacy name on a
-- contact row differ (it must NOT win over the contact).
update underclub.reservations set full_name = 'STALE LEGACY NAME'
 where id = current_setting('test.ok_id')::uuid;
select set_config('test.pending_tok',
  (select underclub.issue_ticket_access_token(current_setting('test.pending_id')::uuid)), true);

-- open_public_ticket, as anon (the ticket page).
set local role anon;
do $$
declare
  r  record;
  r2 record;
  n  int;
begin
  -- Wrong tokens first: zero rows and nothing marked.
  select count(*) into n from underclub.open_public_ticket(current_setting('test.ok_id')::uuid, 'wrong');
  assert n = 0, 'wrong token';
  select count(*) into n from underclub.open_public_ticket(current_setting('test.ok_id')::uuid, null);
  assert n = 0, 'null token';
  select count(*) into n from underclub.open_public_ticket(
    current_setting('test.legacy_id')::uuid, current_setting('test.ok_tok'));
  assert n = 0, 'token of another reservation';
  select count(*) into n from underclub.open_public_ticket(null, current_setting('test.ok_tok'));
  assert n = 0, 'null id';

  -- First opening: row returned with the value BEFORE the update (null).
  select * into r from underclub.open_public_ticket(
    current_setting('test.ok_id')::uuid, current_setting('test.ok_tok'));
  assert found, 'ticket found with right token';
  assert r.reservation_id = current_setting('test.ok_id')::uuid and r.status = 'confirmed', 'ticket row';
  assert r.full_name = 'Mario Rossi' and r.email = 'mario@example.com', format('name from contacts: %s', r.full_name);
  assert r.event_title = 'Future Night' and r.event_date = test.today() + 7 and r.entry_name = 'Intero', 'labels';
  assert r.ticket_opened_at is null and r.qr_scanned_at is null, 'first opening reports not-yet-opened';

  -- Second opening: sees the first one's mark.
  select * into r2 from underclub.open_public_ticket(
    current_setting('test.ok_id')::uuid, current_setting('test.ok_tok'));
  assert r2.ticket_opened_at = now(), 'second opening reports the mark';

  select * into r from underclub.open_public_ticket(
    current_setting('test.legacy_id')::uuid, current_setting('test.legacy_tok'));
  assert r.full_name = 'Legacy Guy' and r.email = 'legacy@example.com', 'name from legacy row';

  -- Cancelled and pending rows: readable with their token, never marked.
  select * into r from underclub.open_public_ticket(
    current_setting('test.cancel_id')::uuid, current_setting('test.cancel_tok'));
  assert found and r.status = 'cancelled' and r.ticket_opened_at is null, 'cancelled readable';
  select * into r from underclub.open_public_ticket(
    current_setting('test.pending_id')::uuid, current_setting('test.pending_tok'));
  assert found and r.status = 'pending', 'pending readable';
end $$;
reset role;

do $$
begin
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.ok_id')::uuid) = now(), 'confirmed marked opened';
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.legacy_id')::uuid) = now(), 'legacy confirmed marked opened';
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.cancel_id')::uuid) is null, 'cancelled not marked';
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.pending_id')::uuid) is null, 'pending not marked';
end $$;

-- Marked once: a later opening never moves the first timestamp.
update underclub.reservations set ticket_opened_at = '2026-01-01'
 where id = current_setting('test.legacy_id')::uuid;
set local role anon;
do $$
begin
  assert (select ticket_opened_at from underclub.open_public_ticket(
            current_setting('test.legacy_id')::uuid, current_setting('test.legacy_tok'))) = '2026-01-01',
    'opened-at reported';
end $$;
reset role;
do $$
begin
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.legacy_id')::uuid) = '2026-01-01', 'first mark never overwritten';
end $$;

-- scan_ticket_check_in, as the logged-in admin.
select test.as_admin();
set local role authenticated;
do $$
declare
  r  record;
  r2 record;
begin
  select * into r from underclub.scan_ticket_check_in(current_setting('test.ok_tok'));
  assert r.result_code = 'ok', format('scan ok: %s', r.result_code);
  assert r.reservation_id = current_setting('test.ok_id')::uuid and r.full_name = 'Mario Rossi'
     and r.entry_name = 'Intero' and r.event_title = 'Future Night' and r.event_date = test.today() + 7, 'scan row';
  assert r.scanned_at is not null and r.formula_expired = false, 'scanned, formula valid';

  select * into r2 from underclub.scan_ticket_check_in(current_setting('test.ok_tok'));
  assert r2.result_code = 'already_scanned' and r2.scanned_at = r.scanned_at
     and r2.formula_expired = false and r2.full_name = 'Mario Rossi', 'already_scanned';

  -- Never opened, scanned at the door.
  select * into r from underclub.scan_ticket_check_in(current_setting('test.early_tok'));
  assert r.result_code = 'ok' and r.formula_expired = true and r.entry_name = 'Early', 'formula expired flag';
  select * into r from underclub.scan_ticket_check_in(current_setting('test.early_tok'));
  assert r.result_code = 'already_scanned' and r.formula_expired = true, 'formula expired on already_scanned';

  select * into r from underclub.scan_ticket_check_in(current_setting('test.cancel_tok'));
  assert r.result_code = 'cancelled' and r.scanned_at is null and r.full_name = 'Cancel Me', 'cancelled';

  select * into r from underclub.scan_ticket_check_in(current_setting('test.pending_tok'));
  assert r.result_code = 'pending' and r.scanned_at is null and r.full_name = 'Pending Pia', 'pending';

  select * into r from underclub.scan_ticket_check_in('nope');
  assert r.result_code = 'invalid' and r.reservation_id is null and r.formula_expired is null, 'invalid';
  assert (select result_code from underclub.scan_ticket_check_in('')) = 'invalid', 'empty';
  assert (select result_code from underclub.scan_ticket_check_in(null)) = 'invalid', 'null';

  select * into r from underclub.scan_ticket_check_in(current_setting('test.legacy_tok'));
  assert r.result_code = 'ok' and r.full_name = 'Legacy Guy', 'legacy row scans with its own name';
end $$;
reset role;

-- A scanned ticket opened afterwards is shown but not marked.
set local role anon;
do $$
declare
  r record;
begin
  select * into r from underclub.open_public_ticket(
    current_setting('test.early_id')::uuid, current_setting('test.early_tok'));
  assert found and r.qr_scanned_at is not null and r.ticket_opened_at is null, 'scanned readable';
end $$;
reset role;

do $$
begin
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.early_id')::uuid) is null, 'scanned not marked';
  assert (select qr_scanned_at from underclub.reservations
           where id = current_setting('test.pending_id')::uuid) is null, 'pending not scanned';
  assert (select qr_scanned_at from underclub.reservations
           where id = current_setting('test.cancel_id')::uuid) is null, 'cancelled not scanned';
end $$;

-- Cleanup step 5 rehearsal: drop the legacy columns, everything keeps working.
alter table underclub.reservations
  drop column full_name,
  drop column date_of_birth,
  drop column email;

set local role anon;
do $$
declare
  r record;
begin
  select * into r from underclub.open_public_ticket(
    current_setting('test.ok_id')::uuid, current_setting('test.ok_tok'));
  assert r.full_name = 'Mario Rossi' and r.ticket_opened_at = now(), 'open_public_ticket after column drop (contact)';
  select * into r from underclub.open_public_ticket(
    current_setting('test.legacy_id')::uuid, current_setting('test.legacy_tok'));
  assert found and r.full_name is null and r.email is null, 'open_public_ticket after column drop (legacy)';
  -- Marking still works on a ticket never opened before the drop.
  select * into r from underclub.open_public_ticket(
    current_setting('test.late_id')::uuid, current_setting('test.late_tok'));
  assert found and r.full_name = 'Late Larry' and r.ticket_opened_at is null, 'first opening after column drop';
end $$;
reset role;

do $$
begin
  assert (select ticket_opened_at from underclub.reservations
           where id = current_setting('test.late_id')::uuid) = now(), 'marked after column drop';
end $$;

select test.as_admin();
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from underclub.scan_ticket_check_in(current_setting('test.ok_tok'));
  assert r.result_code = 'already_scanned' and r.full_name = 'Mario Rossi', 'scan after column drop';
  select * into r from underclub.scan_ticket_check_in(current_setting('test.pending_tok'));
  assert r.result_code = 'pending', 'pending after column drop';
end $$;
reset role;

-- The log-in link reads legacy rows through to_jsonb: after the drop it finds
-- nothing to recover instead of failing.
set local role service_role;
do $$
declare
  l record;
begin
  select * into l from underclub.ep_request_login('legacy@example.com');
  assert l.outcome = 'unknown', format('legacy address after column drop: %s', l.outcome);
  select * into l from underclub.ep_request_login('mario@example.com');
  assert l.outcome = 'sent' and l.activation_token is not null, 'known contact after column drop';
end $$;

rollback;
