-- Underclub 2.0 — Row Level Security policies
-- Run this AFTER schema.sql has been applied.
-- Enables public (anon) read of published events and reservation creation.
--
-- ORDER OF EXECUTION (all steps are mandatory on a fresh database):
--   1. supabase/schema.sql
--   2. supabase/rls.sql                                        <- this file
--   3. supabase/rls-history/2026-04-17-ultra-strict-ticket-token.sql
--   4. supabase/rls-history/2026-04-17-ultra-strict-ticket-token-v2.sql
--   5. supabase/rls-history/2026-04-21-ticket-check-in.sql
--
-- This file is deliberately FAIL-CLOSED on `reservations`: anon gets no
-- select/update policy here. Ticket read + "first open" tracking are granted
-- only by step 3, scoped to the per-reservation token (x-ticket-token header).
-- Stopping after step 2 leaves the ticket page non-functional; it never leaves
-- reservations publicly readable.

-- Enable RLS on all tables
alter table underclub.events enable row level security;
alter table underclub.event_artists enable row level security;
alter table underclub.event_entries enable row level security;
alter table underclub.reservations enable row level security;

-- =========================================================================
-- PUBLIC (anon) policies
-- =========================================================================

-- Events: read only published events
create policy "anon_read_published_events"
  on underclub.events for select
  to anon
  using (status = 'published');

-- Event artists: readable if parent event is published
create policy "anon_read_event_artists"
  on underclub.event_artists for select
  to anon
  using (
    exists (
      select 1 from underclub.events e
      where e.id = event_id and e.status = 'published'
    )
  );

-- Event entries: readable if parent event is published
create policy "anon_read_event_entries"
  on underclub.event_entries for select
  to anon
  using (
    exists (
      select 1 from underclub.events e
      where e.id = event_id and e.status = 'published'
    )
  );

-- Reservations: anon can INSERT (book a spot)
create policy "anon_insert_reservation"
  on underclub.reservations for insert
  to anon
  with check (
    exists (
      select 1 from underclub.events e
      where e.id = event_id and e.status = 'published'
    )
  );

-- Reservations: NO anon select/update policy is created here.
--
-- Earlier revisions of this file shipped permissive `using (true)` policies
-- ("anon_read_own_reservation" / "anon_update_ticket_opened"), which let anon
-- read every reservation and write any column on it — including `status` and
-- `qr_scanned_at`. They are replaced by the token-scoped policies in
-- rls-history/2026-04-17-ultra-strict-ticket-token.sql (step 3 above), which
-- also drops them by name if an old database still has them.
--
-- Do not reintroduce them here.

-- =========================================================================
-- AUTHENTICATED (admin) policies — full CRUD
-- =========================================================================

create policy "admin_all_events"
  on underclub.events for all
  to authenticated
  using (true)
  with check (true);

create policy "admin_all_event_artists"
  on underclub.event_artists for all
  to authenticated
  using (true)
  with check (true);

create policy "admin_all_event_entries"
  on underclub.event_entries for all
  to authenticated
  using (true)
  with check (true);

create policy "admin_all_reservations"
  on underclub.reservations for all
  to authenticated
  using (true)
  with check (true);
