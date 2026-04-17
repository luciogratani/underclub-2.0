-- Underclub 2.0 — RLS History
-- Version: 2026-04-17 v2 (strict token + safe create RPC)
--
-- Purpose:
--   1) Fix extension-qualified crypto functions for self-hosted Supabase.
--   2) Add one-shot public reservation RPC compatible with strict RLS.
--
-- Run AFTER:
--   - schema.sql
--   - rls.sql
--   - 2026-04-17-ultra-strict-ticket-token.sql

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Fix helper functions with explicit extensions schema
-- ---------------------------------------------------------------------------

create or replace function underclub.hash_ticket_token(p_token text)
returns text
language sql
immutable
strict
as $$
  select encode(
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text),
    'hex'
  );
$$;

create or replace function underclub.issue_ticket_access_token(p_reservation_id uuid)
returns text
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_token text;
begin
  v_token := replace(
    replace(
      replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'),
      '/',
      '_'
    ),
    '=',
    ''
  );

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
-- 2) Public create RPC compatible with strict ownership model
-- ---------------------------------------------------------------------------

create or replace function underclub.create_public_reservation(
  p_event_id uuid,
  p_entry_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_email text
)
returns table (
  reservation_id uuid,
  reservation_status text,
  ticket_token text
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_id uuid;
  v_status text;
  v_token text;
begin
  -- Event must be bookable
  if not exists (
    select 1
    from underclub.events e
    where e.id = p_event_id
      and e.status = 'published'
  ) then
    raise exception 'event not bookable' using errcode = '42501';
  end if;

  -- Entry must belong to event
  if not exists (
    select 1
    from underclub.event_entries ee
    where ee.id = p_entry_id
      and ee.event_id = p_event_id
  ) then
    raise exception 'entry does not belong to event' using errcode = '23514';
  end if;

  insert into underclub.reservations (
    event_id,
    entry_id,
    full_name,
    date_of_birth,
    email
  )
  values (
    p_event_id,
    p_entry_id,
    p_full_name,
    p_date_of_birth,
    p_email
  )
  returning id, status into v_id, v_status;

  v_token := underclub.issue_ticket_access_token(v_id);

  return query
  select v_id, v_status, v_token;
end;
$$;

grant execute on function underclub.create_public_reservation(uuid, uuid, text, date, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Public availability aggregation (no raw reservations exposure)
-- ---------------------------------------------------------------------------

create or replace function underclub.get_public_entry_counts(
  p_event_id uuid
)
returns table (
  entry_id uuid,
  confirmed_count bigint
)
language sql
security definer
set search_path = underclub, public
as $$
  select
    r.entry_id,
    count(*)::bigint as confirmed_count
  from underclub.reservations r
  where r.event_id = p_event_id
    and r.status = 'confirmed'
  group by r.entry_id;
$$;

grant execute on function underclub.get_public_entry_counts(uuid)
  to anon, authenticated;
