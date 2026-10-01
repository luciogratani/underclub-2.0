-- get_public_ticket, scan_ticket_check_in (as the admin role), legacy RPC,
-- and both functions surviving the cleanup's column drop.

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

  select * into b from underclub.ep_request_booking(s, E, N_UNL, null, null, null, null, null, null);
  perform set_config('test.ok_id', b.reservation_id::text, true);
  perform set_config('test.ok_tok', b.ticket_token, true);

  select * into b from underclub.ep_request_booking(
    test.new_session('early@example.com', 'Early Bird'), E, N_EARLY, null, null, null, null, null, null);
  perform set_config('test.early_tok', b.ticket_token, true);

  s := test.new_session('cancel@example.com', 'Cancel Me');
  select * into b from underclub.ep_request_booking(s, E_LATE, N_LATE, null, null, null, null, null, null);
  assert underclub.ep_cancel_reservation(s, b.reservation_id) = 'ok', 'cancelled through the endpoint';
  perform set_config('test.cancel_id', b.reservation_id::text, true);
  perform set_config('test.cancel_tok', b.ticket_token, true);

  -- A pending row that somehow holds a ticket token (never issued by the
  -- endpoints, but the door must not treat it as "already in").
  select * into b from underclub.ep_request_booking(
    null, E_LATE, N_LATE, 'Pending Pia', '1990-01-01', 'pia@example.com', null, null, null);
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

-- get_public_ticket, as anon (the ticket page).
set local role anon;
do $$
declare
  r record;
  n int;
begin
  select * into r from underclub.get_public_ticket(
    current_setting('test.ok_id')::uuid, current_setting('test.ok_tok'));
  assert found, 'ticket found with right token';
  assert r.reservation_id = current_setting('test.ok_id')::uuid and r.status = 'confirmed', 'ticket row';
  assert r.full_name = 'Mario Rossi' and r.email = 'mario@example.com', format('name from contacts: %s', r.full_name);
  assert r.event_title = 'Future Night' and r.event_date = test.today() + 7 and r.entry_name = 'Intero', 'labels';
  assert r.ticket_opened_at is null and r.qr_scanned_at is null, 'timestamps';

  select count(*) into n from underclub.get_public_ticket(current_setting('test.ok_id')::uuid, 'wrong');
  assert n = 0, 'wrong token';
  select count(*) into n from underclub.get_public_ticket(current_setting('test.ok_id')::uuid, null);
  assert n = 0, 'null token';
  select count(*) into n from underclub.get_public_ticket(
    current_setting('test.legacy_id')::uuid, current_setting('test.ok_tok'));
  assert n = 0, 'token of another reservation';

  select * into r from underclub.get_public_ticket(
    current_setting('test.legacy_id')::uuid, current_setting('test.legacy_tok'));
  assert r.full_name = 'Legacy Guy' and r.email = 'legacy@example.com', 'name from legacy row';
end $$;
reset role;

-- scan_ticket_check_in, as the logged-in admin.
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

do $$
begin
  assert (select qr_scanned_at from underclub.reservations
           where id = current_setting('test.pending_id')::uuid) is null, 'pending not scanned';
  assert (select qr_scanned_at from underclub.reservations
           where id = current_setting('test.cancel_id')::uuid) is null, 'cancelled not scanned';
end $$;

-- Cleanup step 5 rehearsal: drop the legacy columns, both functions keep working.
alter table underclub.reservations
  drop column full_name,
  drop column date_of_birth,
  drop column email;

set local role anon;
do $$
declare
  r record;
begin
  select * into r from underclub.get_public_ticket(
    current_setting('test.ok_id')::uuid, current_setting('test.ok_tok'));
  assert r.full_name = 'Mario Rossi', 'get_public_ticket after column drop (contact)';
  select * into r from underclub.get_public_ticket(
    current_setting('test.legacy_id')::uuid, current_setting('test.legacy_tok'));
  assert found and r.full_name is null and r.email is null, 'get_public_ticket after column drop (legacy)';
end $$;
reset role;

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

rollback;
