-- ep_activate and ep_request_login.

begin;
set local role service_role;

do $$
declare
  E      constant uuid := '10000000-0000-0000-0000-000000000001';
  E_RACE constant uuid := '10000000-0000-0000-0000-000000000004';
  E_LATE constant uuid := '10000000-0000-0000-0000-000000000005';
  N_UNL  constant uuid := '20000000-0000-0000-0000-000000000012';
  N_RACE constant uuid := '20000000-0000-0000-0000-000000000042';
  N_LATE constant uuid := '20000000-0000-0000-0000-000000000051';
  b   record;
  b2  record;
  a   record;
  c   record;
  res record;
  s   record;
  l   record;
  v_old_token text;
begin
  -- Happy path: pending -> confirmed, ticket issued, session created,
  -- contact verified, only the TRUE consent applied.
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Mario Rossi', '1990-05-01', 'mario@example.com', true, false, null, test.secret());
  assert b.outcome = 'pending', 'setup pending';

  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'ok', format('activate outcome %s', a.outcome);
  assert a.reservation_outcome = 'confirmed', format('reservation_outcome %s', a.reservation_outcome);
  assert a.session_token is not null and length(a.session_token) = 43, 'session token';
  assert a.reservation_id = b.reservation_id, 'reservation id';
  assert a.ticket_token is not null, 'ticket token issued on confirmation';
  assert a.contact_email = 'mario@example.com' and a.contact_full_name = 'Mario Rossi', 'contact echoed';

  select * into c from underclub.contacts where email = 'mario@example.com';
  assert a.contact_id = c.id, 'contact id';
  assert c.verified_at = now(), 'verified_at set';
  assert c.marketing_consent_at = now() and c.marketing_consent_revoked_at is null, 'marketing applied';
  assert c.profiling_consent_at is null, 'false consent not applied';

  select * into res from underclub.reservations where id = b.reservation_id;
  assert res.status = 'confirmed' and res.confirmed_at = now() and res.pending_expires_at is null, 'confirmed row';
  assert res.ticket_access_token_hash = underclub.hash_ticket_token(a.ticket_token), 'ticket hash matches';

  select * into s from underclub.contact_sessions
   where token_hash = underclub.hash_ticket_token(a.session_token);
  assert found and s.contact_id = c.id, 'session row';
  assert s.expires_at = now() + interval '12 months' and s.revoked_at is null, 'session 12 months';

  -- Same link again: invalid, nothing else returned.
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'invalid' and a.session_token is null and a.contact_id is null, 'token reuse -> invalid';
  assert (select count(*) from underclub.contact_sessions where contact_id = c.id) = 1, 'no second session';

  -- Unknown / empty tokens.
  assert (select outcome from underclub.ep_activate('nope', test.secret())) = 'invalid', 'unknown token';
  assert (select outcome from underclub.ep_activate('', test.secret())) = 'invalid', 'empty token';
  assert (select outcome from underclub.ep_activate(null, test.secret())) = 'invalid', 'null token';

  -- Expired link: `expired`, and it is NOT consumed.
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Luisa Bianchi', '1995-02-02', 'luisa@example.com', true, true, null, test.secret());
  update underclub.activation_tokens set expires_at = now() - interval '1 second'
   where token_hash = underclub.hash_ticket_token(b.activation_token);
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'expired' and a.session_token is null, 'expired token';
  assert (select used_at from underclub.activation_tokens
           where token_hash = underclub.hash_ticket_token(b.activation_token)) is null, 'expired token not consumed';
  assert (select verified_at from underclub.contacts where email = 'luisa@example.com') is null, 'not verified on expired';

  -- Burned link (superseded by a re-booking): invalid.
  v_old_token := b.activation_token;
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Luisa Bianchi', '1995-02-02', 'luisa@example.com', null, null, null, test.secret());
  update underclub.activation_tokens set expires_at = now() + interval '5 minutes'
   where token_hash = underclub.hash_ticket_token(v_old_token);
  assert (select outcome from underclub.ep_activate(v_old_token, test.secret())) = 'invalid', 'burned token -> invalid';

  -- Link valid but the pending behind it is stale: session yes, ticket no.
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Gino Verdi', '1999-09-09', 'gino@example.com', null, null, null, test.secret());
  update underclub.reservations set pending_expires_at = now() - interval '1 minute'
   where id = b.reservation_id;
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'expired', format('stale pending %s', a.reservation_outcome);
  assert a.ticket_token is null and a.session_token is not null, 'session but no ticket';
  select * into res from underclub.reservations where id = b.reservation_id;
  assert res.status = 'pending' and res.ticket_access_token_hash is null, 'stays pending without QR';

  -- Link whose reservation was cancelled meanwhile: unavailable.
  select * into b from underclub.ep_request_booking(
    null, E_LATE, N_LATE, 'Gino Verdi', '1999-09-09', 'gino@example.com', null, null, null, test.secret());
  update underclub.reservations
     set status = 'cancelled', cancelled_at = now(), pending_expires_at = null
   where id = b.reservation_id;
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'unavailable' and a.ticket_token is null, 'cancelled -> unavailable';

  -- Live pending whose event was unpublished meanwhile: unavailable, no QR.
  select * into b from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Lia Neri', '1998-08-08', 'lia@example.com', null, null, null, test.secret());
  update underclub.events set status = 'draft' where id = E_RACE;
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'unavailable' and a.ticket_token is null,
    format('unpublished event -> %s', a.reservation_outcome);
  select * into res from underclub.reservations where id = b.reservation_id;
  assert res.status = 'pending' and res.ticket_access_token_hash is null, 'unpublished: stays pending without QR';
  update underclub.events set status = 'published' where id = E_RACE;

  -- Consent rules: re-grant a revoked one, leave an active one alone, and a
  -- false never revokes. verified_at keeps its first value.
  update underclub.contacts
     set verified_at = '2026-01-01',
         marketing_consent_at = '2026-01-01', marketing_consent_revoked_at = '2026-02-01',
         profiling_consent_at = '2026-01-01', profiling_consent_revoked_at = null
   where email = 'mario@example.com';
  select * into b from underclub.ep_request_booking(
    null, E_RACE, N_RACE, 'Mario Rossi', '1990-05-01', 'mario@example.com', true, true, null, test.secret());
  select * into a from underclub.ep_activate(b.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'confirmed', 'second booking confirmed';
  select * into c from underclub.contacts where email = 'mario@example.com';
  assert c.verified_at = '2026-01-01', 'verified_at keeps first value';
  assert c.marketing_consent_at = now() and c.marketing_consent_revoked_at is null, 'revoked consent re-granted';
  assert c.profiling_consent_at = '2026-01-01' and c.profiling_consent_revoked_at is null, 'active consent untouched';

  update underclub.contacts set marketing_consent_at = '2026-01-01', marketing_consent_revoked_at = null
   where email = 'mario@example.com';
  select * into b from underclub.ep_request_booking(
    null, E_LATE, N_LATE, 'Mario Rossi', '1990-05-01', 'mario@example.com', false, null, null, test.secret());
  perform underclub.ep_activate(b.activation_token, test.secret());
  select * into c from underclub.contacts where email = 'mario@example.com';
  assert c.marketing_consent_at = '2026-01-01' and c.marketing_consent_revoked_at is null, 'false does not revoke';

  -- Three links already sent to this address in the last hour: age them
  -- out of the rate-limit window (covered in 11-rate-limits.sql).
  perform test.age_tokens('mario@example.com');

  -- Log-in link: known address.
  select * into l from underclub.ep_request_login('  MARIO@example.com ');
  assert l.outcome = 'sent' and l.activation_token is not null and l.contact_full_name = 'Mario Rossi', 'login sent';
  select * into b2 from underclub.activation_tokens
   where token_hash = underclub.hash_ticket_token(l.activation_token);
  assert b2.reservation_id is null and b2.consent_marketing is null and b2.consent_profiling is null, 'login token shape';
  assert b2.expires_at = now() + interval '30 minutes', 'login token 30 min';
  select * into a from underclub.ep_activate(l.activation_token, test.secret());
  assert a.outcome = 'ok' and a.reservation_outcome = 'none' and a.reservation_id is null
     and a.ticket_token is null and a.session_token is not null, 'login activation';

  -- Unknown address: nothing issued.
  select * into l from underclub.ep_request_login('nobody@example.com');
  assert l.outcome = 'unknown' and l.activation_token is null and l.contact_full_name is null, 'login unknown';
  assert (select outcome from underclub.ep_request_login(null)) = 'unknown', 'login null';
  assert (select count(*) from underclub.contacts where email = 'nobody@example.com') = 0, 'no contact created by login';
end $$;

rollback;
