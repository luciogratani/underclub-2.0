-- Underclub 2.0 — Database Schema
-- Run this in the Supabase SQL Editor to create all tables.

-- 1. Events
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  date       date not null,
  time       time not null,
  status     text not null default 'draft'
               check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);

-- 2. Event Artists (lineup)
create table if not exists event_artists (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events (id) on delete cascade,
  name       text not null,
  origin     text,
  sort_order int  not null default 0
);

-- 3. Event Entries (ticket tiers)
create table if not exists event_entries (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events (id) on delete cascade,
  name       text not null,
  note       text,
  quota      int,
  sort_order int  not null default 0
);

-- 4. Reservations
create table if not exists reservations (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events (id),
  entry_id         uuid not null references event_entries (id),
  full_name        text not null,
  date_of_birth    date not null,
  email            text not null,
  status           text not null default 'confirmed'
                     check (status in ('confirmed', 'cancelled')),
  ticket_opened_at timestamptz,
  qr_scanned_at   timestamptz,
  created_at       timestamptz not null default now(),

  unique (event_id, email)
);

-- Indexes for common queries
create index if not exists idx_event_artists_event  on event_artists (event_id);
create index if not exists idx_event_entries_event   on event_entries (event_id);
create index if not exists idx_reservations_event    on reservations (event_id);
create index if not exists idx_reservations_entry    on reservations (entry_id);
create index if not exists idx_events_status_date    on events (status, date);
