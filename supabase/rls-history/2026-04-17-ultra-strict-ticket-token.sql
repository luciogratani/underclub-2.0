-- Underclub 2.0 — RLS History
-- Version: 2026-04-17 (ultra-strict ticket token ownership)
--
-- Goal:
--   - Keep public browsing and booking behavior.
--   - Remove permissive anon access on reservations.
--   - Enforce "only own reservation" via per-reservation token.
--   - Allow anon update only for first ticket open timestamp.
--
-- This script is additive/versioned and does not replace supabase/rls.sql.
-- Run AFTER schema.sql and rls.sql.

-- ---------------------------------------------------------------------------
-- 0) Prerequisites
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Token storage
-- ---------------------------------------------------------------------------

alter table underclub.reservations
  add column if not exists ticket_access_token_hash text;

create unique index if not exists uq_reservations_ticket_access_token_hash
  on underclub.reservations (ticket_access_token_hash)
  where ticket_access_token_hash is not null;

-- ---------------------------------------------------------------------------
-- 2) Helper functions
-- ---------------------------------------------------------------------------

create or replace function underclub.hash_ticket_token(p_token text)
returns text
language sql
immutable
strict
as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

create or replace function underclub.current_ticket_token()
returns text
language plpgsql
stable
as $$
declare
  headers jsonb;
begin
  -- PostgREST request headers (available in RLS context)
  headers := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  return nullif(headers ->> 'x-ticket-token', '');
end;
$$;

create or replace function underclub.ticket_token_matches(p_reservation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = underclub, public
as $$
  select exists (
    select 1
    from underclub.reservations r
    where r.id = p_reservation_id
      and r.ticket_access_token_hash is not null
      and r.ticket_access_token_hash = underclub.hash_ticket_token(underclub.current_ticket_token())
  );
$$;

create or replace function underclub.can_mark_ticket_opened_once(
  p_reservation_id uuid,
  p_new_ticket_opened_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = underclub, public
as $$
  select exists (
    select 1
    from underclub.reservations r
    where r.id = p_reservation_id
      and r.ticket_opened_at is null
      and p_new_ticket_opened_at is not null
  );
$$;

create or replace function underclub.issue_ticket_access_token(p_reservation_id uuid)
returns text
language plpgsql
security definer
set search_path = underclub, public
as $$
declare
  v_token text;
begin
  -- URL-safe random token (43 chars-ish after trim)
  v_token := replace(replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');

  update underclub.reservations
  set ticket_access_token_hash = underclub.hash_ticket_token(v_token)
  where id = p_reservation_id;

  if not found then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Tighten table privileges (defense in depth)
-- ---------------------------------------------------------------------------

revoke all on underclub.reservations from anon;

grant insert (event_id, entry_id, full_name, date_of_birth, email, status)
  on underclub.reservations to anon;

grant select on underclub.reservations to anon;
grant update (ticket_opened_at) on underclub.reservations to anon;

-- ---------------------------------------------------------------------------
-- 4) Replace permissive anon policies on reservations
-- ---------------------------------------------------------------------------

drop policy if exists "anon_read_own_reservation" on underclub.reservations;
drop policy if exists "anon_update_ticket_opened" on underclub.reservations;

create policy "anon_read_own_reservation_token"
  on underclub.reservations for select
  to anon
  using (underclub.ticket_token_matches(id));

create policy "anon_update_ticket_opened_token_once"
  on underclub.reservations for update
  to anon
  using (underclub.ticket_token_matches(id))
  with check (
    underclub.ticket_token_matches(id)
    and status = 'confirmed'
    and qr_scanned_at is null
    and underclub.can_mark_ticket_opened_once(id, ticket_opened_at)
  );

-- ---------------------------------------------------------------------------
-- 5) Optional rotation helper (manual usage)
-- ---------------------------------------------------------------------------
-- select underclub.issue_ticket_access_token('<reservation-uuid>');
--
-- Client access requirement:
--   - Keep path param /ticket/:reservationId
--   - Add header: x-ticket-token: <plain token>
