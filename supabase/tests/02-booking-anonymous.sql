-- ep_request_booking without a session: pending path, re-booking, refusals.

begin;
set local role service_role;

do $$
declare
  E       constant uuid := '10000000-0000-0000-0000-000000000001';
  E_PAST  constant uuid := '10000000-0000-0000-0000-000000000002';
  E_DRAFT constant uuid := '10000000-0000-0000-0000-000000000003';
  N_Q1    constant uuid := '20000000-0000-0000-0000-000000000011';
  N_UNL   constant uuid := '20000000-0000-0000-0000-000000000012';
  N_PAST  constant uuid := '20000000-0000-0000-0000-000000000021';
  N_DRAFT constant uuid := '20000000-0000-0000-0000-000000000031';
  r  record;
  r2 record;
  c  record;
  res record;
  t  record;
begin
  -- First booking: contact created from the form (normalized), pending row,
  -- activation token, no ticket token, consents NOT applied yet.
  select * into r from underclub.ep_request_booking(
    null, E, N_UNL, '  Mario Rossi ', '1990-05-01', '  Mario@Example.COM ', true, true, 'meta-ads', test.secret());

  assert r.outcome = 'pending', format('outcome %s', r.outcome);
  assert r.reservation_id is not null, 'reservation id';
  assert r.ticket_token is null, 'no ticket token on pending';
  assert r.activation_token is not null and length(r.activation_token) = 43, 'activation token shape';
  assert r.contact_email = 'mario@example.com', 'contact email normalized';
  assert r.contact_full_name = 'Mario Rossi', 'contact name trimmed';
  assert r.event_title = 'Future Night' and r.event_date = test.today() + 7
     and r.event_time = '23:00' and r.entry_name = 'Intero', 'event/entry labels';

  select * into c from underclub.contacts where email = 'mario@example.com';
  assert found, 'contact created';
  assert c.full_name = 'Mario Rossi' and c.date_of_birth = '1990-05-01', 'contact data';
  assert c.verified_at is null, 'contact not verified yet';
  assert c.marketing_consent_at is null and c.profiling_consent_at is null, 'consents not applied before activation';

  select * into res from underclub.reservations where id = r.reservation_id;
  assert res.status = 'pending', 'status pending';
  assert res.pending_expires_at = now() + interval '30 minutes', 'pending 30 min';
  assert res.contact_id = c.id, 'linked to contact';
  assert res.ticket_access_token_hash is null, 'pending has no QR';
  assert res.source = 'meta-ads', 'valid source kept';
  assert res.full_name = 'Mario Rossi' and res.email = 'mario@example.com'
     and res.date_of_birth = '1990-05-01', 'legacy columns filled from the contact';
  assert res.confirmed_at is null, 'not confirmed';

  select * into t from underclub.activation_tokens
   where token_hash = underclub.hash_ticket_token(r.activation_token);
  assert found, 'activation token stored as hash';
  assert t.reservation_id = r.reservation_id and t.contact_id = c.id, 'token links';
  assert t.consent_marketing and t.consent_profiling, 'consents carried by the token';
  assert t.expires_at = now() + interval '30 minutes' and t.used_at is null, 'token 30 min, unused';
  assert (select count(*) from underclub.activation_tokens
           where token_hash = r.activation_token) = 0, 'token never stored in clear';

  -- Booking again while pending: same row, entry updated, old link burned,
  -- name/dob from the form ignored, invalid source does not clear the old one.
  select * into r2 from underclub.ep_request_booking(
    null, E, N_Q1, 'Impostor Name', '2001-01-01', 'mario@example.com', false, false, 'Not A Slug!', test.secret());

  assert r2.outcome = 'pending', format('rebook outcome %s', r2.outcome);
  assert r2.reservation_id = r.reservation_id, 'pending reused';
  assert r2.activation_token <> r.activation_token, 'new activation token';
  assert r2.contact_full_name = 'Mario Rossi', 'existing contact name returned';
  assert r2.entry_name = 'Ridotto', 'new entry label';
  assert (select count(*) from underclub.reservations where contact_id = c.id and event_id = E) = 1, 'single row';
  select * into res from underclub.reservations where id = r.reservation_id;
  assert res.entry_id = N_Q1, 'entry updated';
  assert res.source = 'meta-ads', 'source kept when new one is invalid';
  assert (select used_at from underclub.activation_tokens
           where token_hash = underclub.hash_ticket_token(r.activation_token)) is not null, 'old token burned';
  select * into t from underclub.activation_tokens
   where token_hash = underclub.hash_ticket_token(r2.activation_token);
  assert t.used_at is null and t.consent_marketing = false and t.consent_profiling = false, 'new token fresh';
  select * into c from underclub.contacts where email = 'mario@example.com';
  assert c.full_name = 'Mario Rossi' and c.date_of_birth = '1990-05-01', 'contact not overwritten';

  -- Stale pending is reused too, with a fresh deadline.
  update underclub.reservations set pending_expires_at = now() - interval '1 hour'
   where id = r.reservation_id;
  select * into r2 from underclub.ep_request_booking(
    null, E, N_UNL, 'Mario Rossi', '1990-05-01', 'mario@example.com', null, null, 'pr-giulia', test.secret());
  assert r2.outcome = 'pending' and r2.reservation_id = r.reservation_id, 'stale pending reused';
  select * into res from underclub.reservations where id = r.reservation_id;
  assert res.pending_expires_at = now() + interval '30 minutes', 'deadline refreshed';
  assert res.source = 'pr-giulia', 'valid new source replaces the old one';

  -- Three links already sent to this address in the last hour: age them
  -- out of the rate-limit window (covered in 11-rate-limits.sql).
  perform test.age_tokens('mario@example.com');

  -- Existing contact + anonymous booking on another event: name/dob untouched.
  select * into r2 from underclub.ep_request_booking(
    null, '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000051',
    'Someone Else', '1970-01-01', 'MARIO@example.com', true, true, null, test.secret());
  assert r2.outcome = 'pending' and r2.contact_full_name = 'Mario Rossi', 'other event pending';
  select * into c from underclub.contacts where email = 'mario@example.com';
  assert c.full_name = 'Mario Rossi' and c.date_of_birth = '1990-05-01'
     and c.marketing_consent_at is null, 'contact untouched by anonymous booking';
  assert (select count(*) from underclub.contacts where email = 'mario@example.com') = 1, 'no duplicate contact';

  -- Invalid source slug on a fresh booking becomes null, never an error.
  select * into r from underclub.ep_request_booking(
    null, E, N_UNL, 'Luisa Bianchi', '1995-02-02', 'luisa@example.com', null, null, 'Volantino X', test.secret());
  assert r.outcome = 'pending', 'luisa pending';
  assert (select source from underclub.reservations where id = r.reservation_id) is null, 'invalid slug -> null';
  select * into r from underclub.ep_request_booking(
    null, '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000051',
    'Luisa Bianchi', '1995-02-02', 'luisa@example.com', null, null, 'x', test.secret());
  assert (select source from underclub.reservations where id = r.reservation_id) is null, 'too short slug -> null';

  -- A bogus session token falls back to the form path.
  select * into r from underclub.ep_request_booking(
    'not-a-session', E, N_UNL, 'Gino', '1999-09-09', 'gino@example.com', false, false, null, test.secret());
  assert r.outcome = 'pending', 'invalid session -> form path';

  -- invalid_input: missing or malformed form data, no contact created.
  select * into r from underclub.ep_request_booking(null, E, N_UNL, null, '1990-01-01', 'x1@example.com', null, null, null, test.secret());
  assert r.outcome = 'invalid_input' and r.event_title = 'Future Night' and r.entry_name = 'Intero', 'missing name';
  select * into r from underclub.ep_request_booking(null, E, N_UNL, '   ', '1990-01-01', 'x2@example.com', null, null, null, test.secret());
  assert r.outcome = 'invalid_input', 'blank name';
  select * into r from underclub.ep_request_booking(null, E, N_UNL, 'X', null, 'x3@example.com', null, null, null, test.secret());
  assert r.outcome = 'invalid_input', 'missing dob';
  select * into r from underclub.ep_request_booking(null, E, N_UNL, 'X', '1990-01-01', null, null, null, null, test.secret());
  assert r.outcome = 'invalid_input', 'missing email';
  select * into r from underclub.ep_request_booking(null, E, N_UNL, 'X', '1990-01-01', 'no-at-sign', null, null, null, test.secret());
  assert r.outcome = 'invalid_input', 'malformed email';
  select * into r from underclub.ep_request_booking(null, E, N_UNL, 'X', '1990-01-01', '@example.com', null, null, null, test.secret());
  assert r.outcome = 'invalid_input', 'empty local part';
  assert r.reservation_id is null and r.activation_token is null, 'nothing issued on invalid_input';
  assert (select count(*) from underclub.contacts where email like 'x_@example.com') = 0, 'no contact on invalid_input';

  -- not_bookable: past, draft, unknown event. Labels still returned when known.
  select * into r from underclub.ep_request_booking(null, E_PAST, N_PAST, 'A', '1990-01-01', 'p@example.com', null, null, null, test.secret());
  assert r.outcome = 'not_bookable' and r.event_title = 'Past Night' and r.entry_name = 'Past entry', 'past event';
  select * into r from underclub.ep_request_booking(null, E_DRAFT, N_DRAFT, 'A', '1990-01-01', 'p@example.com', null, null, null, test.secret());
  assert r.outcome = 'not_bookable' and r.event_title = 'Draft Night', 'draft event';
  select * into r from underclub.ep_request_booking(null, gen_random_uuid(), N_UNL, 'A', '1990-01-01', 'p@example.com', null, null, null, test.secret());
  assert r.outcome = 'not_bookable' and r.event_title is null and r.entry_name is null, 'unknown event';
  select * into r from underclub.ep_request_booking(null, null, null, null, null, null, null, null, null, test.secret());
  assert r.outcome = 'not_bookable', 'all nulls';

  -- invalid_entry: entry of another event, or unknown.
  select * into r from underclub.ep_request_booking(null, E, N_PAST, 'A', '1990-01-01', 'p@example.com', null, null, null, test.secret());
  assert r.outcome = 'invalid_entry' and r.event_title = 'Future Night' and r.entry_name is null, 'foreign entry';
  select * into r from underclub.ep_request_booking(null, E, gen_random_uuid(), 'A', '1990-01-01', 'p@example.com', null, null, null, test.secret());
  assert r.outcome = 'invalid_entry', 'unknown entry';
  assert (select count(*) from underclub.contacts where email = 'p@example.com') = 0, 'no contact on refusals';
end $$;

rollback;
