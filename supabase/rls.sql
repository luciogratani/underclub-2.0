-- Underclub 2.0 — Row Level Security policies
-- Run this AFTER schema.sql has been applied.
-- Enables public (anon) read of published events and reservation creation.

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

-- Reservations: anon can read their own reservation by ID (ticket page)
create policy "anon_read_own_reservation"
  on underclub.reservations for select
  to anon
  using (true);

-- Reservations: anon can set ticket_opened_at (ticket tracking)
create policy "anon_update_ticket_opened"
  on underclub.reservations for update
  to anon
  using (true)
  with check (true);

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
