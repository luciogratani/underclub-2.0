-- Underclub 2.0 — RLS History
-- Version: 2026-04-21 (ticket check-in RPC, token-only)
--
-- Goal:
--   - Add an authorized, atomic check-in flow for QR ticket scanning.
--   - QR payload is the plain per-reservation token only (no URL, no id).
--   - Lookup is done by matching the stored SHA-256 hash of the token.
--   - Single UPDATE guarantees "already_scanned" detection is race-safe.
--
-- Run AFTER:
--   - schema.sql
--   - rls.sql
--   - 2026-04-17-ultra-strict-ticket-token.sql
--   - 2026-04-17-ultra-strict-ticket-token-v2.sql
--
-- Authorization:
--   - EXECUTE granted only to `authenticated` (admin panel must be logged in).
--   - `anon` is explicitly not granted.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Check-in RPC: scan by raw token and mark qr_scanned_at atomically
-- ---------------------------------------------------------------------------

create or replace function underclub.scan_ticket_check_in(
  p_token text
)
returns table (
  result_code     text,
  reservation_id  uuid,
  full_name       text,
  entry_name      text,
  event_title     text,
  event_date      date,
  scanned_at      timestamptz
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_hash        text;
  v_reservation underclub.reservations%rowtype;
  v_entry       underclub.event_entries%rowtype;
  v_event       underclub.events%rowtype;
  v_updated     timestamptz;
begin
  if p_token is null or length(btrim(p_token)) = 0 then
    return query select
      'invalid'::text, null::uuid, null::text, null::text,
      null::text, null::date, null::timestamptz;
    return;
  end if;

  v_hash := underclub.hash_ticket_token(p_token);

  select *
    into v_reservation
  from underclub.reservations r
  where r.ticket_access_token_hash = v_hash
  limit 1;

  if not found then
    return query select
      'invalid'::text, null::uuid, null::text, null::text,
      null::text, null::date, null::timestamptz;
    return;
  end if;

  select * into v_entry from underclub.event_entries where id = v_reservation.entry_id;
  select * into v_event from underclub.events          where id = v_reservation.event_id;

  if v_reservation.status = 'cancelled' then
    return query select
      'cancelled'::text,
      v_reservation.id,
      v_reservation.full_name,
      coalesce(v_entry.name, null),
      coalesce(v_event.title, null),
      coalesce(v_event.date,  null),
      v_reservation.qr_scanned_at;
    return;
  end if;

  -- Atomic transition: only one scan will succeed on first "not scanned" row.
  update underclub.reservations
     set qr_scanned_at = now()
   where id = v_reservation.id
     and qr_scanned_at is null
     and status = 'confirmed'
  returning qr_scanned_at into v_updated;

  if not found then
    -- Someone else already scanned: surface existing timestamp.
    return query select
      'already_scanned'::text,
      v_reservation.id,
      v_reservation.full_name,
      coalesce(v_entry.name, null),
      coalesce(v_event.title, null),
      coalesce(v_event.date,  null),
      v_reservation.qr_scanned_at;
    return;
  end if;

  return query select
    'ok'::text,
    v_reservation.id,
    v_reservation.full_name,
    coalesce(v_entry.name, null),
    coalesce(v_event.title, null),
    coalesce(v_event.date,  null),
    v_updated;
end;
$$;

-- Only authenticated admins (logged into the admin panel) can execute this.
revoke all on function underclub.scan_ticket_check_in(text) from public;
revoke all on function underclub.scan_ticket_check_in(text) from anon;
grant execute on function underclub.scan_ticket_check_in(text) to authenticated;
