-- Underclub 2.0 — RLS History
-- Version: 2026-10-02 (passwordless booking endpoints)
--
-- Purpose:
--   1) The SQL side of the serverless endpoints (Vercel, service key):
--      booking, activation link, log-in link, session overview, log-out,
--      cancellation. One `ep_*` function per operation, so every multi-step
--      write is a single transaction and the endpoints stay thin.
--   2) Derived ticket token: a reservation confirmed by the endpoints gets
--      HMAC(reservation id, TICKET_SECRET) as its ticket token, so "my
--      bookings" can rebuild the ticket link without ever storing it. The
--      secret lives in the endpoint's env, never in the database.
--   3) `ep_session_overview`: contact + upcoming reservations (with the
--      rebuilt ticket links) in one call; the session is renewed at most once
--      a day.
--   4) `ep_request_login` recovers legacy bookings: an address that only has
--      contact-less (pre-endpoint) confirmed reservations gets a contact,
--      built from its latest booking, and those rows are linked to it.
--   5) Abuse limits: at most N activation links per contact per hour / day
--      (`rate_limited` outcome), and a per-IP fixed-window counter
--      (`request_throttle` + `ep_throttle`) the endpoints call before working.
--   6) `ep_cleanup`: the daily cron's purge (expired links, dead sessions, old
--      throttle windows, contacts never verified).
--   7) `open_public_ticket`: the ticket page reads its row by id + token and
--      marks it opened in one RPC, with the name coming from `contacts`.
--   8) Rewrite `scan_ticket_check_in` (step 1 of the 2026-10-01 cleanup):
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
-- Re-runnable: `if not exists`, `create or replace`, and drop-then-create for
-- every function whose signature or return type changed (functions replaced
-- by this version are dropped too). Once this file has run, 2026-04-21 must
-- NOT be replayed: it would fail on the changed return type of
-- `scan_ticket_check_in` (fail-safe, nothing is altered).
--
-- Still ADDITIVE: the anon booking path (`anon_insert_reservation`,
-- `create_public_reservation`) and the x-ticket-token policies keep working.
--
-- Trust model:
--   - `ep_*`: service_role only. Revoked from public, anon AND authenticated
--     explicitly: exposing the schema sets default privileges that grant
--     every new function to anon and authenticated directly, so revoking from
--     `public` alone would leave them callable from the browser.
--   - `open_public_ticket`: anon + authenticated. Possession of the ticket
--     token is the authorization, exactly as with the x-ticket-token policy.
--   - `scan_ticket_check_in`: authenticated (admin) only, as before.
--   - Activation and session tokens are 32 random bytes from pgcrypto. Ticket
--     tokens are derived (HMAC-SHA256 of the reservation id, keyed with the
--     endpoint's TICKET_SECRET) for reservations confirmed by the endpoints,
--     random for the legacy anon path. Every token is handed out in clear and
--     stored only as `hash_ticket_token(token)`.
--   - Time: "today" is the date in Europe/Rome, not the server's UTC date, so
--     an event stays bookable until midnight in Italy.

-- ---------------------------------------------------------------------------
-- 0) Tunables — the numbers behind the limits and the purge
-- ---------------------------------------------------------------------------
-- Tiny immutable functions instead of literals scattered in the code: change
-- the number here and re-run the file. Not callable through the API.

-- Activation links (booking + log-in, used or not) one contact may receive in
-- the last hour / the last 24 hours. Past either cap the request answers
-- `rate_limited` and nothing is written or sent. Counted per CONTACT: an
-- address without a contact is never limited here (the per-IP throttle covers
-- it). Keeps a stranger from flooding someone's inbox through the form.
create or replace function underclub.cfg_tokens_per_hour()
returns int language sql immutable as $$ select 3 $$;

create or replace function underclub.cfg_tokens_per_day()
returns int language sql immutable as $$ select 10 $$;

-- A session is pushed forward (last_used_at, expires_at = now + 12 months) at
-- most once per this interval; in between it is only validated. Saves a write
-- on every page view; the 12-month window loses at most a day.
create or replace function underclub.cfg_session_renew_every()
returns interval language sql immutable as $$ select interval '1 day' $$;

-- ep_cleanup retention. Activation links are deleted this long after their
-- expiry; with a 30-minute link that is always past the 24h rate-limit
-- window, so the purge never lowers a live count.
create or replace function underclub.cfg_token_retention()
returns interval language sql immutable as $$ select interval '1 day' $$;

-- Sessions revoked, or expired, longer ago than this are deleted.
create or replace function underclub.cfg_session_retention()
returns interval language sql immutable as $$ select interval '30 days' $$;

-- Per-IP throttle windows that started longer ago than this are deleted (the
-- longest window the endpoints use is minutes).
create or replace function underclub.cfg_throttle_retention()
returns interval language sql immutable as $$ select interval '1 day' $$;

-- A contact never verified (no activation link ever opened) and without any
-- confirmed reservation is deleted this long after creation, together with
-- its pending/cancelled reservations. Stated in the privacy notice.
create or replace function underclub.cfg_unverified_contact_ttl()
returns interval language sql immutable as $$ select interval '7 days' $$;

revoke all on function underclub.cfg_tokens_per_hour()        from public, anon, authenticated, service_role;
revoke all on function underclub.cfg_tokens_per_day()         from public, anon, authenticated, service_role;
revoke all on function underclub.cfg_session_renew_every()    from public, anon, authenticated, service_role;
revoke all on function underclub.cfg_token_retention()        from public, anon, authenticated, service_role;
revoke all on function underclub.cfg_session_retention()      from public, anon, authenticated, service_role;
revoke all on function underclub.cfg_throttle_retention()     from public, anon, authenticated, service_role;
revoke all on function underclub.cfg_unverified_contact_ttl() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) New columns and tables
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

-- The per-contact rate limit counts recent tokens of one contact.
create index if not exists idx_activation_tokens_contact_created
  on underclub.activation_tokens (contact_id, created_at);

-- Per-IP fixed-window counters. `key_hash` is HMAC-SHA256(IP, IP_HASH_SECRET)
-- in hex, computed by the endpoint: the clear IP never reaches the database.
-- `action` names the endpoint ('booking', 'login_link'); `window_start` is the
-- aligned start of the window. Purged by ep_cleanup.
create table if not exists underclub.request_throttle (
  key_hash     text        not null,
  action       text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (key_hash, action, window_start)
);

create index if not exists idx_request_throttle_window
  on underclub.request_throttle (window_start);

-- Fail-closed, same as the 2026-10-01 tables: RLS on, no policy, and the
-- default grants of the exposed schema taken back. Only ep_throttle and
-- ep_cleanup (security definer) touch it.
alter table underclub.request_throttle enable row level security;
revoke all on underclub.request_throttle from anon, authenticated;

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

-- TICKET_SECRET arrives as a parameter on every call that may need it. A
-- missing or short secret is a deployment error, not an outcome: raise, so the
-- endpoint fails loudly (500) instead of minting guessable tickets.
create or replace function underclub.require_ticket_secret(p_secret text)
returns void
language plpgsql
immutable
as $$
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'ticket secret missing or shorter than 32 characters'
      using errcode = '22023';  -- invalid_parameter_value
  end if;
end;
$$;

-- Ticket token of a reservation confirmed by the endpoints. Exact recipe:
--   base64url_nopad( hmac_sha256( key = UTF-8 bytes of p_secret,
--                                 msg = UTF-8 bytes of p_reservation_id::text ) )
-- i.e. pgcrypto's bytea overload `hmac(data bytea, key bytea, 'sha256')`, the
-- uuid in its canonical lowercase text form, standard base64 with
-- '+' → '-', '/' → '_' and the '=' padding stripped (43 chars). Deterministic:
-- the same reservation and secret always give the same token, so the token
-- never needs to be stored to be shown again. Only the database computes it;
-- the endpoint just passes the secret.
create or replace function underclub.derive_ticket_token(p_reservation_id uuid, p_secret text)
returns text
language plpgsql
immutable
set search_path = underclub, public, extensions
as $$
begin
  perform underclub.require_ticket_secret(p_secret);
  if p_reservation_id is null then
    return null;
  end if;
  return replace(
    replace(
      replace(
        encode(
          extensions.hmac(
            convert_to(p_reservation_id::text, 'UTF8'),
            convert_to(p_secret, 'UTF8'),
            'sha256'::text
          ),
          'base64'
        ),
        '+', '-'
      ),
      '/', '_'
    ),
    '=', ''
  );
end;
$$;

-- Stores the hash of the derived token on the reservation and returns the
-- token. Replaces `issue_ticket_access_token` for the endpoints' confirmations.
create or replace function underclub.issue_derived_ticket_token(p_reservation_id uuid, p_secret text)
returns text
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_token text := underclub.derive_ticket_token(p_reservation_id, p_secret);
begin
  update underclub.reservations r
     set ticket_access_token_hash = underclub.hash_ticket_token(v_token)
   where r.id = p_reservation_id;

  if not found then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  return v_token;
end;
$$;

-- Validates a session token. Both out params are null when the token is
-- unknown, revoked or expired. A valid session is pushed forward 12 months
-- (rolling) only if its last renewal is older than `cfg_session_renew_every`;
-- otherwise it is just validated (same output, no write).
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
declare
  v_hash text;
begin
  if p_token is null or btrim(p_token) = '' then
    return;
  end if;

  v_hash := underclub.hash_ticket_token(p_token);

  update underclub.contact_sessions s
     set last_used_at = now(),
         expires_at   = now() + interval '12 months'
   where s.token_hash = v_hash
     and s.revoked_at is null
     and s.expires_at > now()
     and s.last_used_at < now() - underclub.cfg_session_renew_every()
  returning s.contact_id, s.expires_at
       into renew_contact_session.contact_id, renew_contact_session.expires_at;

  if not found then
    select s.contact_id, s.expires_at
      into renew_contact_session.contact_id, renew_contact_session.expires_at
      from underclub.contact_sessions s
     where s.token_hash = v_hash
       and s.revoked_at is null
       and s.expires_at > now();
  end if;
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

-- True when the contact already received the maximum number of activation
-- links in the last hour or day (see the tunables at the top). Exact only
-- under `lock_contact` on that contact's address, which every issuer holds.
create or replace function underclub.activation_rate_limited(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = underclub, public, extensions
as $$
  select count(*) filter (where t.created_at > now() - interval '1 hour')
           >= underclub.cfg_tokens_per_hour()
      or count(*) >= underclub.cfg_tokens_per_day()
    from underclub.activation_tokens t
   where t.contact_id = p_contact_id
     and t.created_at > now() - interval '24 hours';
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

-- Serializes everything that creates, links, deletes or issues links for the
-- contact of one address, across events: contact creation (booking, legacy
-- recovery), the per-contact rate limit, the purge. Lock order everywhere:
-- person+event (lock_booking) first, then this, then the entry lock.
create or replace function underclub.lock_contact(p_email text)
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(hashtext('underclub.contact'), hashtext(p_email));
$$;

-- The contact of a normalized address: the existing one, or one recovered
-- from legacy bookings. Recovery happens only when no contact exists and the
-- address has at least one contact-less `confirmed` reservation for an event
-- dated today or later: the contact is created from the most recent such row
-- (name, date of birth; never verified) and EVERY contact-less row with that
-- address is linked to it. Null when there is neither.
--
-- Legacy columns are read through to_jsonb(r): once the cleanup drops them
-- this simply finds nothing, instead of failing every log-in request.
-- Caller must hold lock_contact(p_email) (taken again here, re-entrant).
create or replace function underclub.adopt_legacy_contact(p_email text)
returns uuid
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_id   uuid;
  v_name text;
  v_dob  date;
begin
  if p_email is null or p_email <> lower(btrim(p_email)) or position('@' in p_email) <= 1 then
    return null;
  end if;

  perform underclub.lock_contact(p_email);

  select c.id into v_id from underclub.contacts c where c.email = p_email;
  if v_id is not null then
    return v_id;
  end if;

  select btrim(x.j ->> 'full_name'), (x.j ->> 'date_of_birth')::date
    into v_name, v_dob
    from underclub.reservations r
    join underclub.events e on e.id = r.event_id
    cross join lateral (select to_jsonb(r) as j) x
   where r.contact_id is null
     and r.status = 'confirmed'
     and e.date >= (now() at time zone 'Europe/Rome')::date
     and lower(btrim(x.j ->> 'email')) = p_email
     and nullif(btrim(x.j ->> 'full_name'), '') is not null
     and x.j ->> 'date_of_birth' is not null
   order by r.created_at desc
   limit 1;

  if v_name is null then
    return null;
  end if;

  insert into underclub.contacts (email, full_name, date_of_birth)
  values (p_email, v_name, v_dob)
  returning id into v_id;

  -- All contact-less rows of the address, any status or date. The legacy
  -- unique index is on the RAW email, so 'A@x.it' and 'a@x.it' may both be
  -- active on one event; the contact index allows one, so only the latest
  -- active row per event is linked (cancelled rows never collide).
  update underclub.reservations r
     set contact_id = v_id
   where r.contact_id is null
     and lower(btrim(to_jsonb(r) ->> 'email')) = p_email
     and (r.status = 'cancelled'
          or r.id in (
            select distinct on (x.event_id) x.id
              from underclub.reservations x
             where x.contact_id is null
               and x.status <> 'cancelled'
               and lower(btrim(to_jsonb(x) ->> 'email')) = p_email
             order by x.event_id, x.created_at desc));

  return v_id;
end;
$$;

revoke all on function underclub.new_opaque_token() from public, anon, authenticated, service_role;
revoke all on function underclub.require_ticket_secret(text) from public, anon, authenticated, service_role;
revoke all on function underclub.derive_ticket_token(uuid, text) from public, anon, authenticated, service_role;
revoke all on function underclub.issue_derived_ticket_token(uuid, text) from public, anon, authenticated, service_role;
revoke all on function underclub.renew_contact_session(text) from public, anon, authenticated, service_role;
revoke all on function underclub.issue_activation_token(uuid, uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function underclub.activation_rate_limited(uuid) from public, anon, authenticated, service_role;
revoke all on function underclub.lock_booking(text, uuid) from public, anon, authenticated, service_role;
revoke all on function underclub.lock_contact(text) from public, anon, authenticated, service_role;
revoke all on function underclub.adopt_legacy_contact(text) from public, anon, authenticated, service_role;

-- Pre-existing exposure closed here: `issue_ticket_access_token` was never
-- revoked, so with the schema exposed anon could call it with any reservation
-- id, rotate that ticket (killing the owner's QR) and receive a valid token
-- for it. It is only ever called from inside security definer functions.
revoke all on function underclub.issue_ticket_access_token(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Functions replaced by this version
-- ---------------------------------------------------------------------------
-- New signatures (the ticket secret) or merged into one call. Dropped so a
-- stale overload can never be called by mistake.

drop function if exists underclub.ep_request_booking(text, uuid, uuid, text, date, text, boolean, boolean, text);
drop function if exists underclub.ep_activate(text);
drop function if exists underclub.ep_session(text);
drop function if exists underclub.ep_my_reservations(text);
drop function if exists underclub.get_public_ticket(uuid, text);

-- ---------------------------------------------------------------------------
-- 4) ep_request_booking
-- ---------------------------------------------------------------------------
-- With a valid session the booking is confirmed on the spot. Without one the
-- form data identifies (or creates) the contact, the booking is `pending` for
-- 30 minutes and the activation link confirms it.
--
-- outcome: confirmed | pending | already_booked | sold_out | not_bookable |
--          invalid_entry | invalid_input | rate_limited (form path only)

create or replace function underclub.ep_request_booking(
  p_session_token text,
  p_event_id uuid,
  p_entry_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_email text,
  p_consent_marketing boolean,
  p_consent_profiling boolean,
  p_source text,
  p_ticket_secret text
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
  -- 0. Configuration error, not an outcome.
  perform underclub.require_ticket_secret(p_ticket_secret);

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

  -- Lock order everywhere: person+event, then contact, then entry.
  perform underclub.lock_booking(v_contact_email, p_event_id);
  if not v_has_session then
    -- The form path may create the contact and issues links: both must be
    -- exact against requests for the same address on OTHER events and
    -- against log-in requests.
    perform underclub.lock_contact(v_contact_email);
  end if;

  -- Without a session the contact may not exist yet; it is created only once
  -- the request is known to lead somewhere (below), never on a refusal.
  select c.id, c.full_name, c.date_of_birth
    into v_contact_id, v_contact_name, v_contact_dob
    from underclub.contacts c
   where c.email = v_contact_email;

  -- 2b. Per-address cap on activation links (tunables at the top). Checked
  --     under the locks so the count is exact; nothing is written or issued.
  if not v_has_session and v_contact_id is not null
     and underclub.activation_rate_limited(v_contact_id) then
    return query select 'rate_limited'::text, null::uuid, null::text, null::text,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

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
      -- legacy-only address has no contact yet: recover it from its legacy
      -- bookings (same as ep_request_login), so the link leads to them.
      if v_contact_id is null then
        v_contact_id := underclub.adopt_legacy_contact(v_contact_email);
        if v_contact_id is null then
          -- Defensive only: a confirmed legacy row on a bookable event always
          -- qualifies for recovery.
          insert into underclub.contacts (email, full_name, date_of_birth)
          values (v_contact_email, v_name, p_date_of_birth)
          returning id into v_contact_id;
        end if;
        select c.full_name, c.date_of_birth into v_contact_name, v_contact_dob
          from underclub.contacts c where c.id = v_contact_id;
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
  -- not be able to rename its owner or touch their consents. The contact lock
  -- serializes every creator of this address, so no conflict is expected.
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

      v_ticket := underclub.issue_derived_ticket_token(v_res_id, p_ticket_secret);

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
-- 5) ep_activate
-- ---------------------------------------------------------------------------
-- Opens an activation link: proves the email, applies the consents carried by
-- the token, starts a session and confirms the ONE pending reservation the
-- link was issued for. No quota check here (overbooking accepted, 2026-10-01).

create or replace function underclub.ep_activate(p_token text, p_ticket_secret text)
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
  v_res_stale   boolean;
  v_res_outcome text := 'none';
  v_session     text;
  v_ticket      text;
  v_email       text;
  v_name        text;
begin
  perform underclub.require_ticket_secret(p_ticket_secret);

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
    -- pending of this same contact, and only while its event is still
    -- bookable (unpublished or past since the booking → `unavailable`).
    update underclub.reservations r
       set status = 'confirmed',
           confirmed_at = now(),
           pending_expires_at = null
     where r.id = v_res_id
       and r.contact_id = v_contact_id
       and r.status = 'pending'
       and r.pending_expires_at > now()
       and exists (
         select 1 from underclub.events e
          where e.id = r.event_id
            and e.status = 'published'
            and e.date >= (now() at time zone 'Europe/Rome')::date
       );

    if found then
      v_ticket := underclub.issue_derived_ticket_token(v_res_id, p_ticket_secret);
      v_res_outcome := 'confirmed';
    else
      -- A stale pending stays pending: booking again sends a fresh link. A
      -- live pending whose event is no longer bookable is `unavailable`.
      select r.status, r.pending_expires_at <= now()
        into v_res_status, v_res_stale
        from underclub.reservations r where r.id = v_res_id;
      v_res_outcome := case when v_res_status = 'pending' and v_res_stale then 'expired' else 'unavailable' end;
    end if;
  end if;

  return query select 'ok'::text, v_res_outcome, v_session, v_contact_id,
    v_res_id, v_ticket, v_email, v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) ep_request_login
-- ---------------------------------------------------------------------------
-- The endpoint answers "check your email" either way (no enumeration); the
-- outcome only tells it whether there is an email to send.
--   sent         contact exists (or was just recovered from legacy bookings)
--   unknown      no contact and nothing to recover; nothing written
--   rate_limited per-address cap reached; nothing written, nothing to send

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
  v_email      text := lower(btrim(p_email));
  v_contact_id uuid;
  v_name       text;
begin
  if v_email is null or position('@' in v_email) <= 1 then
    return query select 'unknown'::text, null::text, null::text;
    return;
  end if;

  -- Two log-in requests for the same never-seen legacy address must not both
  -- create the contact: serialized here, the second finds the first's row.
  perform underclub.lock_contact(v_email);

  v_contact_id := underclub.adopt_legacy_contact(v_email);

  if v_contact_id is null then
    return query select 'unknown'::text, null::text, null::text;
    return;
  end if;

  -- A freshly recovered contact has no tokens yet, so a limited answer never
  -- follows a write.
  if underclub.activation_rate_limited(v_contact_id) then
    return query select 'rate_limited'::text, null::text, null::text;
    return;
  end if;

  select c.full_name into v_name from underclub.contacts c where c.id = v_contact_id;

  return query select 'sent'::text,
    underclub.issue_activation_token(v_contact_id, null, null, null),
    v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) ep_session_overview / ep_logout
-- ---------------------------------------------------------------------------
-- One call for the account area: the contact and its upcoming reservations.
-- Null when the session is not valid. Shape (snake_case keys, always present):
--   { "contact": { "email", "full_name", "marketing_consent",
--                  "profiling_consent", "session_expires_at" },
--     "reservations": [ { "reservation_id", "status", "event_id",
--                         "event_title", "event_date", "event_time",
--                         "entry_name", "entry_price", "entry_valid_until",
--                         "qr_scanned_at", "created_at", "ticket_token" } ] }
-- reservations: events dated today or later (Europe/Rome), `confirmed` or a
-- live `pending`, by event date/time. `ticket_token` is the derived token
-- only when the row is confirmed AND its stored hash is the hash of that
-- derived token; otherwise null (legacy random ticket, pending, or a ticket
-- issued under another secret: its link stays the one in the email).

create or replace function underclub.ep_session_overview(p_token text, p_ticket_secret text)
returns jsonb
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_session      record;
  v_contact      jsonb;
  v_reservations jsonb;
begin
  perform underclub.require_ticket_secret(p_ticket_secret);

  v_session := underclub.renew_contact_session(p_token);
  if v_session.contact_id is null then
    return null;
  end if;

  select jsonb_build_object(
           'email',              c.email,
           'full_name',          c.full_name,
           'marketing_consent',  (c.marketing_consent_at is not null
                                   and (c.marketing_consent_revoked_at is null
                                        or c.marketing_consent_revoked_at < c.marketing_consent_at)),
           'profiling_consent',  (c.profiling_consent_at is not null
                                   and (c.profiling_consent_revoked_at is null
                                        or c.profiling_consent_revoked_at < c.profiling_consent_at)),
           'session_expires_at', v_session.expires_at)
    into v_contact
    from underclub.contacts c
   where c.id = v_session.contact_id;

  if v_contact is null then
    return null;
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'reservation_id',    r.id,
               'status',            r.status,
               'event_id',          e.id,
               'event_title',       e.title,
               'event_date',        e.date,
               'event_time',        e.time,
               'entry_name',        ee.name,
               'entry_price',       ee.price,
               'entry_valid_until', ee.valid_until,
               'qr_scanned_at',     r.qr_scanned_at,
               'created_at',        r.created_at,
               'ticket_token',      case
                                      when r.status = 'confirmed'
                                       and r.ticket_access_token_hash = underclub.hash_ticket_token(d.token)
                                      then d.token
                                    end)
             order by e.date, e.time, r.created_at),
           '[]'::jsonb)
    into v_reservations
    from underclub.reservations r
    join underclub.events e         on e.id = r.event_id
    join underclub.event_entries ee on ee.id = r.entry_id
    cross join lateral (select underclub.derive_ticket_token(r.id, p_ticket_secret) as token) d
   where r.contact_id = v_session.contact_id
     and e.date >= (now() at time zone 'Europe/Rome')::date
     and (r.status = 'confirmed'
          or (r.status = 'pending' and r.pending_expires_at > now()));

  return jsonb_build_object('contact', v_contact, 'reservations', v_reservations);
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
-- 8) ep_cancel_reservation
-- ---------------------------------------------------------------------------

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
-- 9) ep_throttle — per-IP fixed window
-- ---------------------------------------------------------------------------
-- One hit for (key, action) in the current window; true while the window's
-- hits, this one included, are within `p_limit`. Windows are aligned on the
-- epoch (`floor(epoch / window) * window`), so every caller agrees on where a
-- window starts. The upsert is atomic: concurrent hits on the same window
-- serialize on the primary key and each sees its own count.

create or replace function underclub.ep_throttle(
  p_key_hash text,
  p_action text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_window timestamptz;
  v_hits   int;
begin
  if p_key_hash is null or p_key_hash = ''
     or p_action is null or p_action = ''
     or p_limit is null or p_limit < 0
     or p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'ep_throttle: invalid arguments' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::double precision);

  insert into underclub.request_throttle as t (key_hash, action, window_start, hits)
  values (p_key_hash, p_action, v_window, 1)
  on conflict (key_hash, action, window_start)
  do update set hits = t.hits + 1
  returning t.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) ep_cleanup — daily purge (Vercel Cron → /api/cron/cleanup)
-- ---------------------------------------------------------------------------
-- Returns the deleted counts:
--   { "activation_tokens", "contact_sessions", "request_throttle",
--     "reservations", "contacts" }
-- Retention numbers are the tunables at the top. `activation_tokens` and
-- `contact_sessions` count only the rows deleted directly; those of a purged
-- contact go with it by cascade and are not counted.
--
-- Unverified contacts: never verified, older than the TTL, no `confirmed`
-- reservation (any date), and no activation link still usable (someone may
-- be opening it right now). Their pending/cancelled reservations go first,
-- then the contact. Each one is taken under its contact lock with a TRY
-- (a busy address is simply left for tomorrow) and re-checked under it, so a
-- booking running for that address cannot lose its contact mid-way.

create or replace function underclub.ep_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_tokens   bigint;
  v_sessions bigint;
  v_throttle bigint;
  v_res      bigint := 0;
  v_contacts bigint := 0;
  v_n        bigint;
  v_c        record;
begin
  delete from underclub.activation_tokens t
   where t.expires_at < now() - underclub.cfg_token_retention();
  get diagnostics v_tokens = row_count;

  delete from underclub.contact_sessions s
   where s.revoked_at < now() - underclub.cfg_session_retention()
      or s.expires_at < now() - underclub.cfg_session_retention();
  get diagnostics v_sessions = row_count;

  delete from underclub.request_throttle t
   where t.window_start < now() - underclub.cfg_throttle_retention();
  get diagnostics v_throttle = row_count;

  for v_c in
    select c.id, c.email
      from underclub.contacts c
     where c.verified_at is null
       and c.created_at < now() - underclub.cfg_unverified_contact_ttl()
       and not exists (select 1 from underclub.reservations r
                        where r.contact_id = c.id and r.status = 'confirmed')
       and not exists (select 1 from underclub.activation_tokens t
                        where t.contact_id = c.id and t.used_at is null and t.expires_at > now())
     order by c.created_at
  loop
    continue when not pg_try_advisory_xact_lock(hashtext('underclub.contact'), hashtext(v_c.email));

    -- Re-check under the lock: a request may have committed in between.
    continue when exists (
      select 1 from underclub.contacts c
       where c.id = v_c.id
         and (c.verified_at is not null
              or exists (select 1 from underclub.reservations r
                          where r.contact_id = c.id and r.status = 'confirmed')
              or exists (select 1 from underclub.activation_tokens t
                          where t.contact_id = c.id and t.used_at is null and t.expires_at > now())));

    delete from underclub.reservations r
     where r.contact_id = v_c.id
       and r.status in ('pending', 'cancelled');
    get diagnostics v_n = row_count;
    v_res := v_res + v_n;

    delete from underclub.contacts c where c.id = v_c.id;
    get diagnostics v_n = row_count;
    v_contacts := v_contacts + v_n;
  end loop;

  return jsonb_build_object(
    'activation_tokens', v_tokens,
    'contact_sessions',  v_sessions,
    'request_throttle',  v_throttle,
    'reservations',      v_res,
    'contacts',          v_contacts);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11) Grants for the endpoints: service_role only
-- ---------------------------------------------------------------------------

revoke all on function underclub.ep_request_booking(text, uuid, uuid, text, date, text, boolean, boolean, text, text) from public, anon, authenticated;
revoke all on function underclub.ep_activate(text, text)              from public, anon, authenticated;
revoke all on function underclub.ep_request_login(text)               from public, anon, authenticated;
revoke all on function underclub.ep_session_overview(text, text)      from public, anon, authenticated;
revoke all on function underclub.ep_logout(text)                      from public, anon, authenticated;
revoke all on function underclub.ep_cancel_reservation(text, uuid)    from public, anon, authenticated;
revoke all on function underclub.ep_throttle(text, text, int, int)    from public, anon, authenticated;
revoke all on function underclub.ep_cleanup()                         from public, anon, authenticated;

grant execute on function underclub.ep_request_booking(text, uuid, uuid, text, date, text, boolean, boolean, text, text) to service_role;
grant execute on function underclub.ep_activate(text, text)           to service_role;
grant execute on function underclub.ep_request_login(text)            to service_role;
grant execute on function underclub.ep_session_overview(text, text)   to service_role;
grant execute on function underclub.ep_logout(text)                   to service_role;
grant execute on function underclub.ep_cancel_reservation(text, uuid) to service_role;
grant execute on function underclub.ep_throttle(text, text, int, int) to service_role;
grant execute on function underclub.ep_cleanup()                      to service_role;

-- ---------------------------------------------------------------------------
-- 12) open_public_ticket — ticket page, by id + token, marks it opened
-- ---------------------------------------------------------------------------
-- Replaces `get_public_ticket` + the client-side `ticket_opened_at` update
-- (which went through the April RLS policies): one call, no dependency on
-- those policies. Zero rows when the token does not match.
--
-- Marks the ticket opened (`ticket_opened_at = now()`) when it is confirmed,
-- not scanned and not opened yet. The returned `ticket_opened_at` is the value
-- BEFORE this call's update: null means "this is the first opening". The row
-- is read `for update`, so of two simultaneous first openings exactly one sees
-- null and the other sees the first one's timestamp.
--
-- Legacy name/email are read through to_jsonb(r) on purpose: a direct
-- `r.full_name` would make this function fail the moment the cleanup drops
-- those columns; the jsonb lookup just yields null for contact rows.

create or replace function underclub.open_public_ticket(p_reservation_id uuid, p_token text)
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
volatile
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_row record;
begin
  select r.id,
         r.status,
         coalesce(c.full_name, to_jsonb(r) ->> 'full_name') as full_name,
         coalesce(c.email,     to_jsonb(r) ->> 'email')     as email,
         e.title as event_title,
         e.date  as event_date,
         ee.name as entry_name,
         r.ticket_opened_at,
         r.qr_scanned_at
    into v_row
    from underclub.reservations r
    join underclub.events e         on e.id = r.event_id
    join underclub.event_entries ee on ee.id = r.entry_id
    left join underclub.contacts c  on c.id = r.contact_id
   where r.id = p_reservation_id
     and r.ticket_access_token_hash is not null
     and r.ticket_access_token_hash = underclub.hash_ticket_token(p_token)
     for update of r;

  if v_row.id is null then
    return;
  end if;

  if v_row.status = 'confirmed' and v_row.qr_scanned_at is null and v_row.ticket_opened_at is null then
    update underclub.reservations r
       set ticket_opened_at = now()
     where r.id = v_row.id;
  end if;

  return query select v_row.id, v_row.status, v_row.full_name, v_row.email,
    v_row.event_title, v_row.event_date, v_row.entry_name,
    v_row.ticket_opened_at, v_row.qr_scanned_at;
end;
$$;

revoke all on function underclub.open_public_ticket(uuid, text) from public;
grant execute on function underclub.open_public_ticket(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13) scan_ticket_check_in — rewritten (cleanup step 1 of 2026-10-01)
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
--   select has_function_privilege('anon', 'underclub.ep_session_overview(text, text)', 'execute');
--   select has_function_privilege('anon', 'underclub.open_public_ticket(uuid, text)', 'execute');  -- true
--   select has_function_privilege('anon', 'underclub.scan_ticket_check_in(text)', 'execute');      -- false
--   select has_table_privilege('anon', 'underclub.request_throttle', 'select');                     -- false
--
-- Full behavioural suite: supabase/tests/run.sh (throwaway local cluster).
