-- Legacy recovery through ep_request_login: an address with only contact-less
-- (pre-endpoint) bookings gets a contact and its rows are linked.
-- Concurrent requests for the same address: 08-concurrency.sql.

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
  r_e     uuid;
  r_late  uuid;
  r_race  uuid;
  r_past  uuid;
  r_dup1  uuid;
  r_dup2  uuid;
  v_id    uuid;
  v_tok   text;
  l   record;
  a   record;
  c   record;
  v   jsonb;
  v_n int;
begin
  -- Four legacy rows for one person, typed with different casing/spaces.
  select reservation_id into r_e from underclub.create_public_reservation(
    E, N_UNL, 'Old Name One', '1985-01-01', 'old@example.com');
  select reservation_id into r_late from underclub.create_public_reservation(
    E_LATE, N_LATE, ' Old Name Two ', '1986-02-02', 'OLD@example.com ');
  select reservation_id, ticket_token into r_race, v_tok from underclub.create_public_reservation(
    E_RACE, N_RACE, 'Old Name Three', '1987-03-03', 'Old@Example.com');
  update underclub.reservations set status = 'cancelled' where id = r_race;
  insert into underclub.reservations (event_id, entry_id, full_name, date_of_birth, email, status)
  values (E_PAST, N_PAST, 'Old Name Past', '1984-04-04', 'old@example.com', 'confirmed')
  returning id into r_past;
  -- Distinct creation times: the most recent qualifying row is E_LATE's.
  update underclub.reservations set created_at = now() - interval '3 days' where id = r_e;
  update underclub.reservations set created_at = now() - interval '2 days' where id = r_late;
  update underclub.reservations set created_at = now() - interval '1 day'  where id = r_race;  -- cancelled: ignored
  update underclub.reservations set created_at = now()                     where id = r_past;  -- past: ignored

  select * into l from underclub.ep_request_login('  Old@Example.COM ');
  assert l.outcome = 'sent' and l.activation_token is not null, format('legacy login %s', l.outcome);
  assert l.contact_full_name = 'Old Name Two', format('name from the latest confirmed future row: %s', l.contact_full_name);

  select * into c from underclub.contacts where email = 'old@example.com';
  assert found, 'contact created, email normalized';
  assert c.full_name = 'Old Name Two' and c.date_of_birth = '1986-02-02', 'contact data from that row';
  assert c.verified_at is null and c.marketing_consent_at is null and c.profiling_consent_at is null,
    'not verified, no consents';
  select count(*) into v_n from underclub.reservations
   where id in (r_e, r_late, r_race, r_past) and contact_id = c.id;
  assert v_n = 4, format('every legacy row of the address linked (any status/date): %s', v_n);
  assert (select reservation_id from underclub.activation_tokens
           where token_hash = underclub.hash_ticket_token(l.activation_token)) is null, 'it is a log-in link';

  -- Idempotent: second request, same contact, nothing re-created or changed.
  select * into l from underclub.ep_request_login('old@example.com');
  assert l.outcome = 'sent' and l.contact_full_name = 'Old Name Two', 'second login sent';
  assert (select count(*) from underclub.contacts where email = 'old@example.com') = 1, 'one contact';
  assert (select id from underclub.contacts where email = 'old@example.com') = c.id, 'same contact';
  assert (select updated_at from underclub.contacts where id = c.id) = c.updated_at, 'contact untouched';

  -- The link works; "my bookings" lists the legacy rows without a ticket
  -- link (their token is random: the ticket stays in the original email).
  select * into a from underclub.ep_activate(l.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'none' and a.contact_id = c.id, 'legacy login activates';
  v := underclub.ep_session_overview(a.session_token, test.secret());
  assert jsonb_array_length(v -> 'reservations') = 2, format('future confirmed legacy rows listed: %s', v -> 'reservations');
  assert not exists (select 1 from jsonb_array_elements(v -> 'reservations') x
                      where (x -> 'ticket_token') <> 'null'::jsonb), 'legacy rows -> ticket_token null';
  -- The original ticket keeps working (only the contact link changed).
  assert (select ticket_access_token_hash from underclub.reservations where id = r_race)
       = underclub.hash_ticket_token(v_tok), 'legacy token untouched';

  -- Past-event-only legacy address: unknown, nothing written.
  insert into underclub.reservations (event_id, entry_id, full_name, date_of_birth, email, status)
  values (E_PAST, N_PAST, 'Past Only', '1980-01-01', 'pastonly@example.com', 'confirmed');
  select * into l from underclub.ep_request_login('pastonly@example.com');
  assert l.outcome = 'unknown' and l.activation_token is null, format('past-only legacy -> %s', l.outcome);
  assert (select count(*) from underclub.contacts where email = 'pastonly@example.com') = 0, 'no contact (past only)';
  assert (select contact_id from underclub.reservations where email = 'pastonly@example.com') is null, 'row not linked';

  -- Cancelled-only future legacy address: unknown.
  select reservation_id into v_id from underclub.create_public_reservation(
    E_LATE, N_LATE, 'Cancelled Only', '1980-01-01', 'cancelonly@example.com');
  update underclub.reservations set status = 'cancelled' where id = v_id;
  assert (select outcome from underclub.ep_request_login('cancelonly@example.com')) = 'unknown', 'cancelled-only -> unknown';
  assert (select count(*) from underclub.contacts where email = 'cancelonly@example.com') = 0, 'no contact (cancelled only)';

  -- Two active legacy rows on ONE event differing only in casing (the legacy
  -- unique index is on the raw email): recovery links the latest, no error.
  select reservation_id into r_dup1 from underclub.create_public_reservation(
    E, N_UNL, 'Dup One', '1990-01-01', 'Dup@example.com');
  select reservation_id into r_dup2 from underclub.create_public_reservation(
    E, N_UNL, 'Dup Two', '1990-01-01', 'dup@example.com');
  update underclub.reservations set created_at = now() - interval '1 hour' where id = r_dup1;
  select * into l from underclub.ep_request_login('dup@example.com');
  assert l.outcome = 'sent' and l.contact_full_name = 'Dup Two', format('dup recovery %s', l.outcome);
  select id into v_id from underclub.contacts where email = 'dup@example.com';
  assert (select contact_id from underclub.reservations where id = r_dup2) = v_id, 'latest dup linked';
  assert (select contact_id from underclub.reservations where id = r_dup1) is null, 'older dup left contact-less';

  -- An address that already has a contact: plain log-in link, no recovery
  -- (contract: recovery only when no contact exists).
  perform test.new_session('both@example.com', 'Both Contact');
  select reservation_id into v_id from underclub.create_public_reservation(
    E_LATE, N_LATE, 'Both Legacy', '1980-01-01', 'both@example.com');
  select * into l from underclub.ep_request_login('both@example.com');
  assert l.outcome = 'sent' and l.contact_full_name = 'Both Contact', 'existing contact -> sent';
  assert (select contact_id from underclub.reservations where id = v_id) is null, 'existing contact: rows not linked';

  -- Malformed input never recovers anything.
  assert (select outcome from underclub.ep_request_login('')) = 'unknown', 'empty email';
  assert (select outcome from underclub.ep_request_login('@example.com')) = 'unknown', 'no local part';
end $$;

rollback;
