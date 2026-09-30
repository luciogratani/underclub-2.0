-- Underclub 2.0 — RLS History
-- Version: 2026-10-01 (contacts, passwordless sessions, entry formulas)
--
-- Purpose:
--   1) Introduce `contacts`: the person, separate from the single reservation.
--      Holds name, date of birth, email and the two GDPR consents.
--   2) Add proprietary passwordless auth: single-use activation tokens and
--      long-lived rolling sessions. Both stored as hashes, never in clear.
--   3) Turn `event_entries` into the configurable "formule d'ingresso":
--      name, price, offer text, optional quota, optional entry deadline.
--   4) Add the `pending` reservation state (booked without a session) and the
--      link from a reservation to its contact.
--
-- Run AFTER:
--   - schema.sql
--   - rls.sql
--   - 2026-04-17-ultra-strict-ticket-token.sql
--   - 2026-04-17-ultra-strict-ticket-token-v2.sql
--   - 2026-04-21-ticket-check-in.sql
--
-- This step is ADDITIVE on purpose: the current anon booking path
-- (`anon_insert_reservation` + `create_public_reservation` granted to anon)
-- keeps working, so the site does not break between this migration and the
-- serverless endpoints. The cleanup is a separate, later step, listed at the
-- bottom of this file under "NEXT STEP (do not run yet)".
--
-- Trust model: the new tables are fail-closed. No anon policy is created for
-- them; the serverless endpoints reach them with the service role, which
-- bypasses RLS. Admin (authenticated) gets read access to contacts only.
--
-- Not enforced in SQL, by design:
--   - 18+ check. `now()` is not immutable, so it cannot be a table CHECK.
--     Enforced in the endpoint that creates the contact (and already in the
--     web form, client-side).
--   - Quota. Counted on CONFIRMED reservations only when a booking is
--     created: pending reservations do NOT hold a spot (decision 2026-10-01,
--     minimal overbooking accepted in exchange for a trivial count).

-- ---------------------------------------------------------------------------
-- 1) Contacts — the person behind the reservations
-- ---------------------------------------------------------------------------

create table if not exists underclub.contacts (
  id                            uuid primary key default gen_random_uuid(),
  -- Stored already normalized (lower + trimmed) so the unique index is the
  -- real identity check; the CHECK keeps any other writer honest.
  email                         text not null unique
                                  check (email = lower(btrim(email)) and position('@' in email) > 1),
  -- Single field, as entered in the booking form: no first/last split.
  full_name                     text not null check (btrim(full_name) <> ''),
  date_of_birth                 date not null,
  -- GDPR: service messages need no consent, these two do. A revoked consent
  -- keeps its original timestamp, so the history stays readable.
  marketing_consent_at          timestamptz,
  marketing_consent_revoked_at  timestamptz,
  profiling_consent_at          timestamptz,
  profiling_consent_revoked_at  timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create or replace function underclub.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_contacts_touch on underclub.contacts;
create trigger trg_contacts_touch
  before update on underclub.contacts
  for each row execute function underclub.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Passwordless auth: activation tokens + sessions
-- ---------------------------------------------------------------------------

-- Single-use link sent by email. Short lived (15-30 min, set by the endpoint).
-- `reservation_id` is the pending reservation this link confirms; null when the
-- link is a plain log-in. Only that reservation is confirmed, so an old link
-- can never resurrect a forgotten one.
create table if not exists underclub.activation_tokens (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references underclub.contacts (id) on delete cascade,
  reservation_id uuid references underclub.reservations (id) on delete cascade,
  -- sha256 hex of the random token, same helper as the ticket token.
  token_hash     text not null unique,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_activation_tokens_contact
  on underclub.activation_tokens (contact_id);
create index if not exists idx_activation_tokens_expires
  on underclub.activation_tokens (expires_at);

-- Rolling 12-month session behind an httpOnly cookie. The cookie carries the
-- clear token, the row keeps only its hash; every use pushes `expires_at`
-- forward and updates `last_used_at`.
create table if not exists underclub.contact_sessions (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references underclub.contacts (id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_contact_sessions_contact
  on underclub.contact_sessions (contact_id);
create index if not exists idx_contact_sessions_expires
  on underclub.contact_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 3) Event entries become the bookable "formule d'ingresso"
-- ---------------------------------------------------------------------------

-- `name` and `sort_order` already exist. `note` already holds the offer text
-- shown under the name in the web form (BookNow) — kept as is, it IS the
-- "offerta" field. `quota` stays nullable: null means unlimited.
alter table underclub.event_entries
  add column if not exists price numeric(6, 2);

-- Existing rows are test data with no price: backfill, then make it required.
update underclub.event_entries set price = 0 where price is null;

alter table underclub.event_entries
  drop constraint if exists event_entries_price_non_negative;

alter table underclub.event_entries
  alter column price set not null,
  add constraint event_entries_price_non_negative check (price >= 0);

-- Entry deadline, not a booking deadline: the formula can always be booked,
-- but past this moment it no longer applies at the door (e.g. reduced price
-- valid only for who gets in by 02:00). Null means no deadline.
-- Full timestamptz on purpose: the deadline falls on the night AFTER the event
-- date, so a bare time-of-day would look earlier than the opening hour.
alter table underclub.event_entries
  add column if not exists valid_until timestamptz;

-- ---------------------------------------------------------------------------
-- 4) Reservations: contact link + pending state
-- ---------------------------------------------------------------------------

-- Nullable for now: rows created by the current anon path have no contact.
-- Becomes NOT NULL in the cleanup step, once every booking goes through the
-- serverless endpoints.
alter table underclub.reservations
  add column if not exists contact_id uuid references underclub.contacts (id);

alter table underclub.reservations
  add column if not exists pending_expires_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_reservations_contact
  on underclub.reservations (contact_id);
create index if not exists idx_reservations_pending_expires
  on underclub.reservations (pending_expires_at)
  where pending_expires_at is not null;

-- Where the booking came from, for the future admin analytics: a flyer batch,
-- a poster, a Meta campaign, a promoter, a sponsor. Null means direct or
-- unknown, which is a legitimate and frequent answer — do not backfill it with
-- 'direct', or "we don't know" and "they typed the address" become the same row.
--
-- A normalized slug, not free text: analytics group by this column, and
-- 'Volantino X' / 'volantino-x' / 'volantino x' would silently split one source
-- into three. Convention: lowercase, digits, dash or underscore, 2-64 chars.
--   meta-ads  volantino-ottobre  manifesto-corso-vico  pr-giulia  sponsor-xyz
--
-- Written by the booking endpoint, which reads it from the landing URL
-- (?src=... or the utm_* params) and keeps it for the visit. Nothing populates
-- it before those endpoints exist.
--
-- No index: a full season is a few thousand rows, a sequential scan beats the
-- write cost. Add one when the analytics queries actually feel slow.
alter table underclub.reservations
  add column if not exists source text;

alter table underclub.reservations
  drop constraint if exists reservations_source_slug;

alter table underclub.reservations
  add constraint reservations_source_slug
  check (source is null or source ~ '^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$');

-- Add 'pending' to the status union. A pending reservation holds the booking
-- for 30 minutes while the person opens the activation link; it never holds
-- quota, and it is treated as expired once `pending_expires_at` has passed.
alter table underclub.reservations
  drop constraint if exists reservations_status_check;

alter table underclub.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'confirmed', 'cancelled'));

-- A pending row must always carry its deadline, and only a pending row can.
alter table underclub.reservations
  drop constraint if exists reservations_pending_has_deadline;

alter table underclub.reservations
  add constraint reservations_pending_has_deadline
  check (
    (status = 'pending' and pending_expires_at is not null)
    or (status <> 'pending' and pending_expires_at is null)
  );

-- One reservation per person per event, but a cancelled one frees the slot so
-- the same person can book again.
create unique index if not exists uq_reservations_event_contact_active
  on underclub.reservations (event_id, contact_id)
  where contact_id is not null and status <> 'cancelled';

-- Same rule for the legacy, contact-less rows: `unique (event_id, email)` from
-- schema.sql also matched CANCELLED rows, so a cancelled booking blocked the
-- same email forever. Replaced by the partial version, which keeps the
-- duplicate guard on the current anon path while cancel-then-rebook works.
-- Dropped in the cleanup step, together with the email column itself.
alter table underclub.reservations
  drop constraint if exists reservations_event_id_email_key;

create unique index if not exists uq_reservations_event_email_active
  on underclub.reservations (event_id, email)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 5) RLS — fail-closed on everything new
-- ---------------------------------------------------------------------------

alter table underclub.contacts           enable row level security;
alter table underclub.activation_tokens  enable row level security;
alter table underclub.contact_sessions   enable row level security;

-- No anon policy anywhere above: the public never touches these tables
-- directly. The serverless endpoints use the service role and bypass RLS.

-- Defence in depth, same approach as the 2026-04-17 hardening on reservations.
-- Exposing a schema in the Supabase dashboard also sets DEFAULT PRIVILEGES on
-- it, so tables created later are granted to anon and authenticated
-- automatically: without this revoke, RLS is the only thing standing between
-- anon and the sessions table. Verified: with the grant in place RLS already
-- holds (insert refused, select empty), but a missing policy would then be the
-- single point of failure, and anon's writes fail silently as "UPDATE 0"
-- instead of being refused outright.
--
-- service_role is left alone on purpose: the serverless endpoints reach these
-- tables through it.
revoke all on underclub.contacts          from anon, authenticated;
revoke all on underclub.activation_tokens from anon, authenticated;
revoke all on underclub.contact_sessions  from anon, authenticated;

-- Admin needs the guest list and the reservation detail, so it reads contacts.
-- Writes stay with the endpoints; tokens and sessions stay invisible to admin.
grant select on underclub.contacts to authenticated;

drop policy if exists "admin_read_contacts" on underclub.contacts;
create policy "admin_read_contacts"
  on underclub.contacts for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--   select column_name, is_nullable, data_type
--     from information_schema.columns
--    where table_schema = 'underclub' and table_name = 'reservations';
--
--   -- fail-closed check: must return 0 rows for anon
--   select * from pg_policies
--    where schemaname = 'underclub'
--      and tablename in ('contacts', 'activation_tokens', 'contact_sessions')
--      and 'anon' = any (roles);

-- ---------------------------------------------------------------------------
-- NEXT STEP (do not run yet) — cleanup, once the endpoints are live
-- ---------------------------------------------------------------------------
-- Run only after booking, activation, session and cancellation all go through
-- the serverless endpoints, and the web/admin code reads the contact.
--
-- STEP 1 IS NOT OPTIONAL AND MUST COME FIRST. Measured on a throwaway
-- database: dropping the columns while the old function is in place makes every
-- scan fail with `record "v_reservation" has no field "full_name"`, i.e. the
-- door stops working, not just the analytics.
--
--   1. rewrite `scan_ticket_check_in`:
--        - read the name from `contacts` instead of the reservation;
--        - add a branch for `status = 'pending'`. Today a pending row holding a
--          ticket token answers `already_scanned` with an empty timestamp
--          (measured), which reads as "already in" for someone who never
--          confirmed. Belt and braces: the endpoint must also issue the ticket
--          token only on confirmation, so a pending has no QR at all;
--        - add the expired-formula outcome, so the door charges full price past
--          `event_entries.valid_until`.
--   2. drop policy "anon_insert_reservation" on underclub.reservations;
--   3. revoke execute on function
--        underclub.create_public_reservation(uuid, uuid, text, date, text)
--        from anon, authenticated;  -- replaced by the endpoint
--   4. drop index underclub.uq_reservations_event_email_active;
--   5. alter table underclub.reservations
--        drop column full_name,
--        drop column date_of_birth,
--        drop column email,
--        alter column contact_id set not null;
--      (any leftover contact-less rows must be migrated or deleted first, or
--       the `set not null` fails)
