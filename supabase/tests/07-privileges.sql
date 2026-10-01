-- Who can call what. Every `ep_*` is service_role only; the new tables are
-- closed to anon; ticket read is public by token; scan is admin only.

-- Catalog view first: has_function_privilege covers every role at once.
do $$
declare
  f text;
  ep text[] := array[
    'underclub.ep_request_booking(text, uuid, uuid, text, date, text, boolean, boolean, text)',
    'underclub.ep_activate(text)',
    'underclub.ep_request_login(text)',
    'underclub.ep_session(text)',
    'underclub.ep_logout(text)',
    'underclub.ep_my_reservations(text)',
    'underclub.ep_cancel_reservation(text, uuid)'];
  helpers text[] := array[
    'underclub.new_opaque_token()',
    'underclub.renew_contact_session(text)',
    'underclub.issue_activation_token(uuid, uuid, boolean, boolean)',
    'underclub.lock_booking(text, uuid)'];
begin
  foreach f in array ep loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon on ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated on ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role on ' || f;
  end loop;
  foreach f in array helpers loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon on ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated on ' || f;
    assert not has_function_privilege('service_role', f, 'execute'), 'service_role on ' || f;
  end loop;

  assert has_function_privilege('anon', 'underclub.get_public_ticket(uuid, text)', 'execute'), 'anon ticket';
  assert has_function_privilege('authenticated', 'underclub.get_public_ticket(uuid, text)', 'execute'), 'auth ticket';
  assert not has_function_privilege('anon', 'underclub.scan_ticket_check_in(text)', 'execute'), 'anon scan';
  assert has_function_privilege('authenticated', 'underclub.scan_ticket_check_in(text)', 'execute'), 'auth scan';
  assert not has_function_privilege('anon', 'underclub.issue_ticket_access_token(uuid)', 'execute'), 'anon issue token';
  assert not has_function_privilege('authenticated', 'underclub.issue_ticket_access_token(uuid)', 'execute'), 'auth issue token';
  -- Legacy path untouched (additive).
  assert has_function_privilege('anon', 'underclub.create_public_reservation(uuid, uuid, text, date, text)', 'execute'), 'anon legacy rpc';
  assert has_function_privilege('anon', 'underclub.get_public_entry_counts(uuid)', 'execute'), 'anon counts';

  -- No anon policy on the new tables.
  assert not exists (
    select 1 from pg_policies
     where schemaname = 'underclub'
       and tablename in ('contacts', 'activation_tokens', 'contact_sessions')
       and 'anon' = any (roles)), 'no anon policies on new tables';
end $$;

-- Real calls as anon and as authenticated: every ep_* is refused.
begin;
set local role anon;
do $$
declare
  role_name text := current_user;
  stmt text;
  stmts text[] := array[
    $q$select * from underclub.ep_request_booking(null, null, null, null, null, null, null, null, null)$q$,
    $q$select * from underclub.ep_activate('x')$q$,
    $q$select * from underclub.ep_request_login('x@example.com')$q$,
    $q$select * from underclub.ep_session('x')$q$,
    $q$select underclub.ep_logout('x')$q$,
    $q$select * from underclub.ep_my_reservations('x')$q$,
    $q$select underclub.ep_cancel_reservation('x', gen_random_uuid())$q$,
    $q$select underclub.issue_ticket_access_token('20000000-0000-0000-0000-000000000012')$q$,
    $q$select underclub.new_opaque_token()$q$,
    $q$select underclub.issue_activation_token(gen_random_uuid(), null, null, null)$q$,
    $q$select * from underclub.scan_ticket_check_in('x')$q$,
    $q$select * from underclub.contacts$q$,
    $q$select * from underclub.activation_tokens$q$,
    $q$select * from underclub.contact_sessions$q$,
    $q$insert into underclub.contacts (email, full_name, date_of_birth) values ('a@b.it', 'A', '1990-01-01')$q$];
begin
  foreach stmt in array stmts loop
    begin
      execute stmt;
      raise exception 'anon was allowed: %', stmt using errcode = 'P0001';
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  assert role_name = 'anon', 'ran as anon';
end $$;
rollback;

begin;
set local role authenticated;
do $$
declare
  stmt text;
  stmts text[] := array[
    $q$select * from underclub.ep_request_booking(null, null, null, null, null, null, null, null, null)$q$,
    $q$select * from underclub.ep_activate('x')$q$,
    $q$select * from underclub.ep_request_login('x@example.com')$q$,
    $q$select * from underclub.ep_session('x')$q$,
    $q$select underclub.ep_logout('x')$q$,
    $q$select * from underclub.ep_my_reservations('x')$q$,
    $q$select underclub.ep_cancel_reservation('x', gen_random_uuid())$q$,
    $q$select underclub.issue_ticket_access_token(gen_random_uuid())$q$,
    $q$select * from underclub.activation_tokens$q$,
    $q$select * from underclub.contact_sessions$q$,
    $q$insert into underclub.contacts (email, full_name, date_of_birth) values ('a@b.it', 'A', '1990-01-01')$q$];
begin
  foreach stmt in array stmts loop
    begin
      execute stmt;
      raise exception 'authenticated was allowed: %', stmt using errcode = 'P0001';
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  -- What the admin is supposed to have.
  perform count(*) from underclub.contacts;
  assert (select result_code from underclub.scan_ticket_check_in('nope')) = 'invalid', 'admin can scan';
end $$;
rollback;

-- Ticket page as anon, end to end: legacy booking via the anon RPC, read
-- through get_public_ticket and through the April x-ticket-token policy.
begin;
set local role anon;
do $$
declare
  l record;
  n int;
begin
  select * into l from underclub.create_public_reservation(
    '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000012',
    'Anon Booker', '1990-01-01', 'anon@example.com');
  assert l.reservation_status = 'confirmed' and l.ticket_token is not null, 'anon legacy booking';

  select count(*) into n from underclub.get_public_ticket(l.reservation_id, l.ticket_token);
  assert n = 1, 'anon reads ticket via RPC';
  select count(*) into n from underclub.get_public_ticket(l.reservation_id, 'wrong');
  assert n = 0, 'anon wrong token';

  -- April policy path (PostgREST header), still matching the same hash.
  perform set_config('request.headers', json_build_object('x-ticket-token', l.ticket_token)::text, true);
  select count(*) into n from underclub.reservations where id = l.reservation_id;
  assert n = 1, 'x-ticket-token policy still works';
  perform set_config('request.headers', '{"x-ticket-token":"wrong"}', true);
  select count(*) into n from underclub.reservations;
  assert n = 0, 'x-ticket-token policy hides everything else';
end $$;
rollback;
