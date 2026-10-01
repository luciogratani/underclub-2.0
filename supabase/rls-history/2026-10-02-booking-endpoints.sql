-- Underclub 2.0 — RLS History
-- Version: 2026-10-02 (passwordless booking endpoints)
--
-- Purpose:
--   1) The SQL side of the serverless endpoints (Vercel, service key):
--      booking, activation link, log-in link, session, my reservations,
--      cancellation. One `ep_*` function per operation, so every multi-step
--      write is a single transaction and the endpoints stay thin.
--   2) `get_public_ticket`: the ticket page reads its row by id + token
--      through one RPC, with the name coming from `contacts`.
--   3) Rewrite `scan_ticket_check_in` (step 1 of the 2026-10-01 cleanup):
--      name from `contacts`, a `pending` outcome, the expired-formula flag.
--
-- Run AFTER:
--   - schema.sql
--   - rls.sql
--   - 2026-04-17-ultra-strict-ticket-token.sql
--   - 2026-04-17-ultra-strict-ticket-token-v2.sql
--   - 2026-04-21-ticket-check-in.sql
--   - 2026-10-01-contacts-sessions-formulas.sql
--
-- Re-runnable: `add column if not exists`, `create or replace`, and a
-- drop-then-create for the one function whose return type changes. Once this
-- file has run, 2026-04-21 must NOT be replayed: it would fail on the changed
-- return type of `scan_ticket_check_in` (fail-safe, nothing is altered).
--
-- Still ADDITIVE: the anon booking path (`anon_insert_reservation`,
-- `create_public_reservation`) and the x-ticket-token policies keep working.
--
-- Trust model:
--   - `ep_*`: service_role only. Revoked from public, anon AND authenticated
--     explicitly: exposing the schema sets default privileges that grant
--     every new function to anon and authenticated directly, so revoking from
--     `public` alone would leave them callable from the browser.
--   - `get_public_ticket`: anon + authenticated. Possession of the ticket
--     token is the authorization, exactly as with the x-ticket-token policy.
--   - `scan_ticket_check_in`: authenticated (admin) only, as before.
--   - Every token (activation, session, ticket) is 32 random bytes from
--     pgcrypto, handed out once in clear and stored only as
--     `hash_ticket_token(token)`.
--   - Time: "today" is the date in Europe/Rome, not the server's UTC date, so
--     an event stays bookable until midnight in Italy.

-- ---------------------------------------------------------------------------
-- 1) New columns
-- ---------------------------------------------------------------------------

-- First successful activation. Null = the email was never proven, i.e. the
-- contact exists only because someone typed that address in the form.
alter table underclub.contacts
  add column if not exists verified_at timestamptz;

-- Consents ticked in the form travel with the activation token and are applied
-- only when the link is opened: a consent recorded for an address nobody
-- controls is not a consent. Null on log-in tokens.
alter table underclub.activation_tokens
  add column if not exists consent_marketing boolean,
  add column if not exists consent_profiling boolean;

-- ---------------------------------------------------------------------------
-- 2) Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------------

-- Same recipe as `issue_ticket_access_token`: 32 random bytes, base64url, no
-- padding.
create or replace function underclub.new_opaque_token()
returns text
language sql
volatile
set search_path = underclub, public, extensions
as $$
  select replace(
    replace(
      replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'),
      '/',
      '_'
    ),
    '=',
    ''
  );
$$;

-- Validates a session token and, if valid, pushes it forward 12 months in the
-- same statement (rolling session). Both out params are null when the token is
-- unknown, revoked or expired.
create or replace function underclub.renew_contact_session(
  p_token text,
  out contact_id uuid,
  out expires_at timestamptz
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
begin
  if p_token is null or btrim(p_token) = '' then
    return;
  end if;

  update underclub.contact_sessions s
     set last_used_at = now(),
         expires_at   = now() + interval '12 months'
   where s.token_hash = underclub.hash_ticket_token(p_token)
     and s.revoked_at is null
     and s.expires_at > now()
  returning s.contact_id, s.expires_at
       into renew_contact_session.contact_id, renew_contact_session.expires_at;
end;
$$;

-- Single-use link, 30 minutes. `p_reservation_id` null = plain log-in link.
create or replace function underclub.issue_activation_token(
  p_contact_id uuid,
  p_reservation_id uuid,
  p_consent_marketing boolean,
  p_consent_profiling boolean
)
returns text
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_token text := underclub.new_opaque_token();
begin
  insert into underclub.activation_tokens
    (contact_id, reservation_id, token_hash, expires_at,
     consent_marketing, consent_profiling)
  values
    (p_contact_id, p_reservation_id, underclub.hash_ticket_token(v_token),
     now() + interval '30 minutes', p_consent_marketing, p_consent_profiling);
  return v_token;
end;
$$;

-- Serializes everything one person does on one event (booking, re-booking,
-- activation), so check-then-write sequences cannot interleave. Keyed on the
-- normalized email, not the contact id, because a first booking must be
-- serialized BEFORE its contact row exists. Two-key form: the first key
-- namespaces the lock away from any other advisory lock user.
create or replace function underclub.lock_booking(p_email text, p_event_id uuid)
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(
    hashtext('underclub.booking'),
    hashtext(p_email || ':' || p_event_id::text)
  );
$$;

revoke all on function underclub.new_opaque_token() from public, anon, authenticated, service_role;
revoke all on function underclub.renew_contact_session(text) from public, anon, authenticated, service_role;
revoke all on function underclub.issue_activation_token(uuid, uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function underclub.lock_booking(text, uuid) from public, anon, authenticated, service_role;

-- Pre-existing exposure closed here: `issue_ticket_access_token` was never
-- revoked, so with the schema exposed anon could call it with any reservation
-- id, rotate that ticket (killing the owner's QR) and receive a valid token
-- for it. It is only ever called from inside security definer functions.
revoke all on function underclub.issue_ticket_access_token(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) ep_request_booking
-- ---------------------------------------------------------------------------
-- With a valid session the booking is confirmed on the spot. Without one the
-- form data identifies (or creates) the contact, the booking is `pending` for
-- 30 minutes and the activation link confirms it.

create or replace function underclub.ep_request_booking(
  p_session_token text,
  p_event_id uuid,
  p_entry_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_email text,
  p_consent_marketing boolean,
  p_consent_profiling boolean,
  p_source text
)
returns table (
  outcome           text,
  reservation_id    uuid,
  ticket_token      text,
  activation_token  text,
  contact_email     text,
  contact_full_name text,
  event_title       text,
  event_date        date,
  event_time        time,
  entry_name        text
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_today         date := (now() at time zone 'Europe/Rome')::date;
  v_event_found   boolean;
  v_event_status  text;
  v_event_title   text;
  v_event_date    date;
  v_event_time    time;
  v_entry_found   boolean;
  v_entry_name    text;
  v_entry_quota   int;
  v_has_session   boolean := false;
  v_contact_id    uuid;
  v_contact_email text;
  v_contact_name  text;
  v_contact_dob   date;
  v_email         text := lower(btrim(p_email));
  v_name          text := btrim(p_full_name);
  v_source        text;
  v_res_id        uuid;
  v_ticket        text;
  v_activation    text;
begin
  -- 1. Event and entry. Looked up first so their labels are returned even
  --    when the answer is a refusal.
  select true, e.status, e.title, e.date, e.time
    into v_event_found, v_event_status, v_event_title, v_event_date, v_event_time
    from underclub.events e
   where e.id = p_event_id;

  select true, ee.name, ee.quota
    into v_entry_found, v_entry_name, v_entry_quota
    from underclub.event_entries ee
   where ee.id = p_entry_id
     and ee.event_id = p_event_id;

  if v_event_found is null or v_event_status <> 'published' or v_event_date < v_today then
    return query select 'not_bookable'::text, null::uuid, null::text, null::text,
      null::text, null::text, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

  if v_entry_found is null then
    return query select 'invalid_entry'::text, null::uuid, null::text, null::text,
      null::text, null::text, v_event_title, v_event_date, v_event_time, null::text;
    return;
  end if;

  -- 2. Who is booking: the session if valid, otherwise the form.
  v_contact_id := (underclub.renew_contact_session(p_session_token)).contact_id;
  v_has_session := v_contact_id is not null;

  if not v_has_session then
    -- Same shape the contacts CHECKs enforce, answered as `invalid_input`
    -- instead of a constraint error.
    if v_name is null or v_name = ''
       or p_date_of_birth is null
       or v_email is null or position('@' in v_email) <= 1 then
      return query select 'invalid_input'::text, null::uuid, null::text, null::text,
        null::text, null::text, v_event_title, v_event_date, v_event_time, v_entry_name;
      return;
    end if;
    v_contact_email := v_email;
  else
    select c.email into v_contact_email from underclub.contacts c where c.id = v_contact_id;
  end if;

  -- Lock order everywhere: person+event first, then entry.
  perform underclub.lock_booking(v_contact_email, p_event_id);

  -- Without a session the contact may not exist yet; it is created only once
  -- the request is known to lead somewhere (below), never on a refusal.
  select c.id, c.full_name, c.date_of_birth
    into v_contact_id, v_contact_name, v_contact_dob
    from underclub.contacts c
   where c.email = v_contact_email;

  -- Keep the source only if it already is a valid slug; never fail on it.
  v_source := case
    when p_source ~ '^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$' then p_source
  end;

  -- 3. Already booked? A confirmed row always counts; a live pending counts
  --    only with a session (without one, re-booking refreshes the pending).
  --    Contact-less legacy rows with the same address count too.
  select r.id into v_res_id
    from underclub.reservations r
   where r.event_id = p_event_id
     and (
       (r.contact_id = v_contact_id
         and (r.status = 'confirmed'
              or (v_has_session and r.status = 'pending' and r.pending_expires_at > now())))
       or (r.contact_id is null
           and r.status = 'confirmed'
           and lower(btrim(r.email)) = v_contact_email)
     )
   order by r.created_at
   limit 1;

  if v_res_id is not null then
    if not v_has_session then
      -- "You're already in": the email carries a log-in link instead. A
      -- legacy-only address has no contact yet: create it to hang the link on.
      if v_contact_id is null then
        insert into underclub.contacts (email, full_name, date_of_birth)
        values (v_contact_email, v_name, p_date_of_birth)
        returning id, full_name, date_of_birth into v_contact_id, v_contact_name, v_contact_dob;
      end if;
      v_activation := underclub.issue_activation_token(v_contact_id, null, null, null);
    end if;
    return query select 'already_booked'::text, v_res_id, null::text, v_activation,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

  -- 4. Quota counts confirmed rows only; the entry lock makes count + insert
  --    atomic against other confirmations on the same entry.
  perform pg_advisory_xact_lock(hashtext('underclub.entry_quota'), hashtext(p_entry_id::text));

  if v_entry_quota is not null and (
       select count(*)
         from underclub.reservations r
        where r.entry_id = p_entry_id
          and r.status = 'confirmed'
     ) >= v_entry_quota then
    return query select 'sold_out'::text, null::uuid, null::text, null::text,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

  -- First booking from this address: create the contact from the form. An
  -- existing contact is never modified here: whoever types an address must
  -- not be able to rename its owner or touch their consents. The booking lock
  -- already serializes same-address requests, so no conflict is expected.
  if v_contact_id is null then
    insert into underclub.contacts (email, full_name, date_of_birth)
    values (v_contact_email, v_name, p_date_of_birth)
    returning id, full_name, date_of_birth into v_contact_id, v_contact_name, v_contact_dob;
  end if;

  -- Any pending row of this contact for this event (live or stale) is reused:
  -- the partial unique index allows only one non-cancelled row per pair.
  select r.id into v_res_id
    from underclub.reservations r
   where r.event_id = p_event_id
     and r.contact_id = v_contact_id
     and r.status = 'pending'
   for update;

  -- Links of a superseded pending must die before a new one is issued. Done
  -- before touching the reservation, the same order ep_activate uses.
  if v_res_id is not null then
    update underclub.activation_tokens t
       set used_at = now()
     where t.reservation_id = v_res_id
       and t.used_at is null;
  end if;

  begin
    if v_has_session then
      -- 5. Confirmed immediately. Legacy NOT NULL columns are filled from the
      --    contact. CLEANUP: drop them from these writes before the column
      --    drop in the 2026-10-01 "NEXT STEP" list.
      if v_res_id is not null then
        -- Only a stale pending can get here (a live one is already_booked).
        update underclub.reservations r
           set entry_id = p_entry_id,
               source = coalesce(v_source, r.source),
               status = 'confirmed',
               confirmed_at = now(),
               pending_expires_at = null
         where r.id = v_res_id;
      else
        insert into underclub.reservations
          (event_id, entry_id, contact_id, full_name, date_of_birth, email,
           status, confirmed_at, source)
        values
          (p_event_id, p_entry_id, v_contact_id, v_contact_name, v_contact_dob, v_contact_email,
           'confirmed', now(), v_source)
        returning id into v_res_id;
      end if;

      v_ticket := underclub.issue_ticket_access_token(v_res_id);

      return query select 'confirmed'::text, v_res_id, v_ticket, null::text,
        v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
      return;
    end if;

    -- 6. Pending, no ticket token: the QR exists only after confirmation.
    if v_res_id is not null then
      update underclub.reservations r
         set entry_id = p_entry_id,
             source = coalesce(v_source, r.source),
             pending_expires_at = now() + interval '30 minutes'
       where r.id = v_res_id;
    else
      -- CLEANUP: same legacy columns as above.
      insert into underclub.reservations
        (event_id, entry_id, contact_id, full_name, date_of_birth, email,
         status, pending_expires_at, source)
      values
        (p_event_id, p_entry_id, v_contact_id, v_contact_name, v_contact_dob, v_contact_email,
         'pending', now() + interval '30 minutes', v_source)
      returning id into v_res_id;
    end if;
  exception when unique_violation then
    -- Only reachable through the legacy anon path racing us on the same
    -- address (the advisory lock covers every ep_* writer). The other
    -- booking won: answer as already booked.
    select r.id into v_res_id
      from underclub.reservations r
     where r.event_id = p_event_id
       and r.status <> 'cancelled'
       and (r.contact_id = v_contact_id or lower(btrim(r.email)) = v_contact_email)
     order by r.created_at
     limit 1;
    if not v_has_session then
      v_activation := underclub.issue_activation_token(v_contact_id, null, null, null);
    end if;
    return query select 'already_booked'::text, v_res_id, null::text, v_activation,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end;

  v_activation := underclub.issue_activation_token(
    v_contact_id, v_res_id, p_consent_marketing, p_consent_profiling);

  return query select 'pending'::text, v_res_id, null::text, v_activation,
    v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) ep_activate
-- ---------------------------------------------------------------------------
-- Opens an activation link: proves the email, applies the consents carried by
-- the token, starts a session and confirms the ONE pending reservation the
-- link was issued for. No quota check here (overbooking accepted, 2026-10-01).

create or replace function underclub.ep_activate(p_token text)
returns table (
  outcome            text,
  reservation_outcome text,
  session_token      text,
  contact_id         uuid,
  reservation_id     uuid,
  ticket_token       text,
  contact_email      text,
  contact_full_name  text
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_hash        text;
  v_token_id    uuid;
  v_contact_id  uuid;
  v_res_id      uuid;
  v_expires     timestamptz;
  v_used        timestamptz;
  v_consent_m   boolean;
  v_consent_p   boolean;
  v_event_id    uuid;
  v_res_status  text;
  v_res_outcome text := 'none';
  v_session     text;
  v_ticket      text;
  v_email       text;
  v_name        text;
begin
  if p_token is null or btrim(p_token) = '' then
    return query select 'invalid'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  v_hash := underclub.hash_ticket_token(p_token);

  -- Peek without consuming: an expired link must stay distinguishable from a
  -- used one, and the contact/event are needed to take the lock.
  select t.id, t.contact_id, t.reservation_id, t.expires_at, t.used_at
    into v_token_id, v_contact_id, v_res_id, v_expires, v_used
    from underclub.activation_tokens t
   where t.token_hash = v_hash;

  if v_token_id is null or v_used is not null then
    return query select 'invalid'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if v_expires <= now() then
    return query select 'expired'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if v_res_id is not null then
    select r.event_id into v_event_id from underclub.reservations r where r.id = v_res_id;
    if v_event_id is not null then
      -- Same lock as ep_request_booking: a re-booking that burns this link
      -- and this activation cannot interleave.
      perform underclub.lock_booking(
        (select c.email from underclub.contacts c where c.id = v_contact_id), v_event_id);
    end if;
  end if;

  -- Atomic consumption: of two concurrent openings exactly one gets the row.
  update underclub.activation_tokens t
     set used_at = now()
   where t.id = v_token_id
     and t.used_at is null
     and t.expires_at > now()
  returning t.consent_marketing, t.consent_profiling
       into v_consent_m, v_consent_p;

  if not found then
    -- Lost the race, or burned by a re-booking while we waited on the lock.
    return query select 'invalid'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  -- A consent is (re)granted only if not currently active; false/null never
  -- revokes (revocation has its own path).
  update underclub.contacts c
     set verified_at = coalesce(c.verified_at, now()),
         marketing_consent_at = case
           when v_consent_m is true
            and not (c.marketing_consent_at is not null
                     and (c.marketing_consent_revoked_at is null
                          or c.marketing_consent_revoked_at < c.marketing_consent_at))
           then now() else c.marketing_consent_at end,
         marketing_consent_revoked_at = case
           when v_consent_m is true
            and not (c.marketing_consent_at is not null
                     and (c.marketing_consent_revoked_at is null
                          or c.marketing_consent_revoked_at < c.marketing_consent_at))
           then null else c.marketing_consent_revoked_at end,
         profiling_consent_at = case
           when v_consent_p is true
            and not (c.profiling_consent_at is not null
                     and (c.profiling_consent_revoked_at is null
                          or c.profiling_consent_revoked_at < c.profiling_consent_at))
           then now() else c.profiling_consent_at end,
         profiling_consent_revoked_at = case
           when v_consent_p is true
            and not (c.profiling_consent_at is not null
                     and (c.profiling_consent_revoked_at is null
                          or c.profiling_consent_revoked_at < c.profiling_consent_at))
           then null else c.profiling_consent_revoked_at end
   where c.id = v_contact_id
  returning c.email, c.full_name into v_email, v_name;

  v_session := underclub.new_opaque_token();
  insert into underclub.contact_sessions (contact_id, token_hash, expires_at)
  values (v_contact_id, underclub.hash_ticket_token(v_session), now() + interval '12 months');

  if v_res_id is not null then
    -- Only the reservation this link was issued for, only if still a live
    -- pending of this same contact.
    update underclub.reservations r
       set status = 'confirmed',
           confirmed_at = now(),
           pending_expires_at = null
     where r.id = v_res_id
       and r.contact_id = v_contact_id
       and r.status = 'pending'
       and r.pending_expires_at > now();

    if found then
      v_ticket := underclub.issue_ticket_access_token(v_res_id);
      v_res_outcome := 'confirmed';
    else
      select r.status into v_res_status from underclub.reservations r where r.id = v_res_id;
      -- A stale pending stays pending: booking again sends a fresh link.
      v_res_outcome := case when v_res_status = 'pending' then 'expired' else 'unavailable' end;
    end if;
  end if;

  return query select 'ok'::text, v_res_outcome, v_session, v_contact_id,
    v_res_id, v_ticket, v_email, v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) ep_request_login
-- ---------------------------------------------------------------------------
-- The endpoint answers "check your email" either way (no enumeration); the
-- outcome only tells it whether there is an email to send.

create or replace function underclub.ep_request_login(p_email text)
returns table (
  outcome           text,
  activation_token  text,
  contact_full_name text
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_contact_id uuid;
  v_name       text;
begin
  select c.id, c.full_name into v_contact_id, v_name
    from underclub.contacts c
   where c.email = lower(btrim(p_email));

  if v_contact_id is null then
    return query select 'unknown'::text, null::text, null::text;
    return;
  end if;

  return query select 'sent'::text,
    underclub.issue_activation_token(v_contact_id, null, null, null),
    v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) ep_session / ep_logout
-- ---------------------------------------------------------------------------

create or replace function underclub.ep_session(p_token text)
returns table (
  contact_id         uuid,
  email              text,
  full_name          text,
  date_of_birth      date,
  marketing_consent  boolean,
  profiling_consent  boolean,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_session record;
begin
  v_session := underclub.renew_contact_session(p_token);
  if v_session.contact_id is null then
    return;
  end if;

  return query
  select c.id, c.email, c.full_name, c.date_of_birth,
         (c.marketing_consent_at is not null
           and (c.marketing_consent_revoked_at is null
                or c.marketing_consent_revoked_at < c.marketing_consent_at)),
         (c.profiling_consent_at is not null
           and (c.profiling_consent_revoked_at is null
                or c.profiling_consent_revoked_at < c.profiling_consent_at)),
         v_session.expires_at
    from underclub.contacts c
   where c.id = v_session.contact_id;
end;
$$;

create or replace function underclub.ep_logout(p_token text)
returns boolean
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
begin
  update underclub.contact_sessions s
     set revoked_at = now()
   where s.token_hash = underclub.hash_ticket_token(p_token)
     and s.revoked_at is null;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) ep_my_reservations / ep_cancel_reservation
-- ---------------------------------------------------------------------------

create or replace function underclub.ep_my_reservations(p_token text)
returns table (
  reservation_id    uuid,
  status            text,
  event_id          uuid,
  event_title       text,
  event_date        date,
  event_time        time,
  entry_name        text,
  entry_price       numeric,
  entry_valid_until timestamptz,
  qr_scanned_at     timestamptz,
  created_at        timestamptz
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_contact_id uuid;
begin
  v_contact_id := (underclub.renew_contact_session(p_token)).contact_id;
  if v_contact_id is null then
    return;
  end if;

  return query
  select r.id, r.status, e.id, e.title, e.date, e.time,
         ee.name, ee.price, ee.valid_until, r.qr_scanned_at, r.created_at
    from underclub.reservations r
    join underclub.events e         on e.id = r.event_id
    join underclub.event_entries ee on ee.id = r.entry_id
   where r.contact_id = v_contact_id
     and e.date >= (now() at time zone 'Europe/Rome')::date
     and (r.status = 'confirmed'
          or (r.status = 'pending' and r.pending_expires_at > now()))
   order by e.date, e.time, r.created_at;
end;
$$;

create or replace function underclub.ep_cancel_reservation(p_token text, p_reservation_id uuid)
returns text
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_contact_id uuid;
  v_status     text;
  v_scanned    timestamptz;
  v_event_date date;
begin
  v_contact_id := (underclub.renew_contact_session(p_token)).contact_id;
  if v_contact_id is null then
    return 'invalid_session';
  end if;

  -- Someone else's reservation answers exactly like a missing one.
  select r.status, r.qr_scanned_at, e.date
    into v_status, v_scanned, v_event_date
    from underclub.reservations r
    join underclub.events e on e.id = r.event_id
   where r.id = p_reservation_id
     and r.contact_id = v_contact_id;

  if v_status is null then
    return 'not_found';
  end if;

  if v_status = 'cancelled'
     or v_scanned is not null
     or v_event_date < (now() at time zone 'Europe/Rome')::date then
    return 'not_cancellable';
  end if;

  -- Re-checked in the write itself: a scan or a concurrent cancel landing
  -- between the read and here makes it a no-op.
  update underclub.reservations r
     set status = 'cancelled',
         cancelled_at = now(),
         pending_expires_at = null
   where r.id = p_reservation_id
     and r.contact_id = v_contact_id
     and r.status <> 'cancelled'
     and r.qr_scanned_at is null;

  if not found then
    return 'not_cancellable';
  end if;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Grants for the endpoints: service_role only
-- ---------------------------------------------------------------------------

revoke all on function underclub.ep_request_booking(text, uuid, uuid, text, date, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function underclub.ep_activate(text)                    from public, anon, authenticated;
revoke all on function underclub.ep_request_login(text)               from public, anon, authenticated;
revoke all on function underclub.ep_session(text)                     from public, anon, authenticated;
revoke all on function underclub.ep_logout(text)                      from public, anon, authenticated;
revoke all on function underclub.ep_my_reservations(text)             from public, anon, authenticated;
revoke all on function underclub.ep_cancel_reservation(text, uuid)    from public, anon, authenticated;

grant execute on function underclub.ep_request_booking(text, uuid, uuid, text, date, text, boolean, boolean, text) to service_role;
grant execute on function underclub.ep_activate(text)                 to service_role;
grant execute on function underclub.ep_request_login(text)            to service_role;
grant execute on function underclub.ep_session(text)                  to service_role;
grant execute on function underclub.ep_logout(text)                   to service_role;
grant execute on function underclub.ep_my_reservations(text)          to service_role;
grant execute on function underclub.ep_cancel_reservation(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9) get_public_ticket — ticket page, by id + token
-- ---------------------------------------------------------------------------
-- Legacy name/email are read through to_jsonb(r) on purpose: a direct
-- `r.full_name` would make this function fail the moment the cleanup drops
-- those columns; the jsonb lookup just yields null for contact rows.

create or replace function underclub.get_public_ticket(p_reservation_id uuid, p_token text)
returns table (
  reservation_id   uuid,
  status           text,
  full_name        text,
  email            text,
  event_title      text,
  event_date       date,
  entry_name       text,
  ticket_opened_at timestamptz,
  qr_scanned_at    timestamptz
)
language plpgsql
security definer
stable
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
begin
  return query
  select r.id,
         r.status,
         coalesce(c.full_name, to_jsonb(r) ->> 'full_name'),
         coalesce(c.email,     to_jsonb(r) ->> 'email'),
         e.title,
         e.date,
         ee.name,
         r.ticket_opened_at,
         r.qr_scanned_at
    from underclub.reservations r
    join underclub.events e         on e.id = r.event_id
    join underclub.event_entries ee on ee.id = r.entry_id
    left join underclub.contacts c  on c.id = r.contact_id
   where r.id = p_reservation_id
     and r.ticket_access_token_hash is not null
     and r.ticket_access_token_hash = underclub.hash_ticket_token(p_token);
end;
$$;

revoke all on function underclub.get_public_ticket(uuid, text) from public;
grant execute on function underclub.get_public_ticket(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) scan_ticket_check_in — rewritten (cleanup step 1 of 2026-10-01)
-- ---------------------------------------------------------------------------
-- Return type gains `formula_expired`, which `create or replace` cannot do:
-- drop and recreate, then restore the grants (authenticated only).

drop function if exists underclub.scan_ticket_check_in(text);

create function underclub.scan_ticket_check_in(p_token text)
returns table (
  result_code     text,
  reservation_id  uuid,
  full_name       text,
  entry_name      text,
  event_title     text,
  event_date      date,
  scanned_at      timestamptz,
  formula_expired boolean
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_id          uuid;
  v_status      text;
  v_scanned     timestamptz;
  v_name        text;
  v_entry_name  text;
  v_valid_until timestamptz;
  v_event_title text;
  v_event_date  date;
  v_expired     boolean;
  v_updated     timestamptz;
begin
  if p_token is null or btrim(p_token) = '' then
    return query select 'invalid'::text, null::uuid, null::text, null::text,
      null::text, null::date, null::timestamptz, null::boolean;
    return;
  end if;

  -- No %rowtype and no direct r.full_name: the legacy column is reached only
  -- through to_jsonb, so this survives the cleanup's column drop.
  select r.id, r.status, r.qr_scanned_at,
         coalesce(c.full_name, to_jsonb(r) ->> 'full_name'),
         ee.name, ee.valid_until, e.title, e.date
    into v_id, v_status, v_scanned, v_name,
         v_entry_name, v_valid_until, v_event_title, v_event_date
    from underclub.reservations r
    left join underclub.contacts c        on c.id = r.contact_id
    left join underclub.event_entries ee  on ee.id = r.entry_id
    left join underclub.events e          on e.id = r.event_id
   where r.ticket_access_token_hash = underclub.hash_ticket_token(p_token)
   limit 1;

  if v_id is null then
    return query select 'invalid'::text, null::uuid, null::text, null::text,
      null::text, null::date, null::timestamptz, null::boolean;
    return;
  end if;

  -- Past the formula's deadline the door charges full price.
  v_expired := v_valid_until is not null and v_valid_until < now();

  if v_status = 'confirmed' then
    -- Atomic transition: of two simultaneous scans only one gets the row.
    update underclub.reservations r
       set qr_scanned_at = now()
     where r.id = v_id
       and r.qr_scanned_at is null
       and r.status = 'confirmed'
    returning r.qr_scanned_at into v_updated;

    if found then
      return query select 'ok'::text, v_id, v_name, v_entry_name,
        v_event_title, v_event_date, v_updated, v_expired;
      return;
    end if;

    -- Lost to another scan or a cancellation: re-read the committed state.
    select r.status, r.qr_scanned_at into v_status, v_scanned
      from underclub.reservations r
     where r.id = v_id;
  end if;

  return query select
    case v_status
      when 'cancelled' then 'cancelled'
      -- Never confirmed via email: no valid ticket, do not scan.
      when 'pending'   then 'pending'
      else 'already_scanned'
    end,
    v_id, v_name, v_entry_name, v_event_title, v_event_date, v_scanned, v_expired;
end;
$$;

revoke all on function underclub.scan_ticket_check_in(text) from public;
revoke all on function underclub.scan_ticket_check_in(text) from anon;
grant execute on function underclub.scan_ticket_check_in(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--   -- must be false for anon/authenticated, true for service_role
--   select has_function_privilege('anon', 'underclub.ep_session(text)', 'execute');
--   select has_function_privilege('anon', 'underclub.get_public_ticket(uuid, text)', 'execute');  -- true
--   select has_function_privilege('anon', 'underclub.scan_ticket_check_in(text)', 'execute');     -- false
--
-- Full behavioural suite: supabase/tests/run.sh (throwaway local cluster).
