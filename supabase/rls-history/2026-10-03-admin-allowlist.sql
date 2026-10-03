-- Underclub 2.0 — RLS History
-- Version: 2026-10-03 (admin allowlist)
--
-- Purpose: an Underclub admin is a user listed in `underclub.admin_users`,
-- not just any logged-in user.
--
-- Why: this Supabase instance is shared with other projects (foras /
-- University, alex_akashi), and so is Supabase Auth. Until this file every
-- policy for admins was `to authenticated using (true)`: any account of the
-- instance (e.g. the University owner logging into the foras admin) could use
-- Underclub's public anon key and read contacts and reservations, edit nights
-- and check tickets in. Same idea as foras' `public.is_tenant_owner()` (the
-- request's `auth.uid()` decides), kept inside this schema on purpose:
-- registering `underclub` in `public.tenants` would make the foras migration
-- runner apply foras migrations to it, and allow one owner only.
--
-- What changes:
--   - `underclub.admin_users` (user_id → auth.users, role) + `underclub.is_admin()`;
--   - admin_all_events / _event_artists / _event_entries / _reservations and
--     admin_read_contacts: `using (underclub.is_admin())`;
--   - scan_ticket_check_in refuses non-admins (42501, which the admin app
--     already shows as "not authorized").
--
-- After applying it, NO account is admin until one is added (see the end).
--
-- Run AFTER 2026-10-02-retire-anon-booking.sql. Re-runnable. rls.sql and
-- 2026-10-01-contacts-sessions-formulas.sql define the same policies with
-- is_admin(), so replaying them never reopens access.

-- ---------------------------------------------------------------------------
-- 1) Allowlist + check (same text as rls.sql, which defines them first on a
--    fresh database)
-- ---------------------------------------------------------------------------

create table if not exists underclub.admin_users (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  -- Only 'admin' for now (full access). A door-staff role (check-in only)
  -- will come with the admin app.
  role       text        not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

-- Fail-closed: managed in SQL only. The exposed schema's default privileges
-- grant every new table to the API roles: take them back.
alter table underclub.admin_users enable row level security;
revoke all on underclub.admin_users from anon, authenticated;

-- True when the request's user is in the allowlist. Security definer so it
-- can read the table the caller cannot; it only ever answers true/false.
create or replace function underclub.is_admin()
returns boolean
language sql
stable
security definer
set search_path = underclub, public
as $$
  select exists (select 1 from underclub.admin_users a where a.user_id = auth.uid())
$$;

-- anon too: the policies below call it for any role that touches the tables
-- (without EXECUTE anon would get 42501 instead of 0 rows), as in foras' 004.
revoke all on function underclub.is_admin() from public;
grant execute on function underclub.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Admin policies: allowlisted users only
-- ---------------------------------------------------------------------------

drop policy if exists "admin_all_events" on underclub.events;
create policy "admin_all_events"
  on underclub.events for all
  to authenticated
  using (underclub.is_admin())
  with check (underclub.is_admin());

drop policy if exists "admin_all_event_artists" on underclub.event_artists;
create policy "admin_all_event_artists"
  on underclub.event_artists for all
  to authenticated
  using (underclub.is_admin())
  with check (underclub.is_admin());

drop policy if exists "admin_all_event_entries" on underclub.event_entries;
create policy "admin_all_event_entries"
  on underclub.event_entries for all
  to authenticated
  using (underclub.is_admin())
  with check (underclub.is_admin());

drop policy if exists "admin_all_reservations" on underclub.reservations;
create policy "admin_all_reservations"
  on underclub.reservations for all
  to authenticated
  using (underclub.is_admin())
  with check (underclub.is_admin());

drop policy if exists "admin_read_contacts" on underclub.contacts;
create policy "admin_read_contacts"
  on underclub.contacts for select
  to authenticated
  using (underclub.is_admin());

-- ---------------------------------------------------------------------------
-- 3) scan_ticket_check_in — the 2026-10-02 text plus the admin check
-- ---------------------------------------------------------------------------
-- Same signature and return type: `create or replace` keeps the grants
-- (authenticated only).


create or replace function underclub.scan_ticket_check_in(p_token text)
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
  -- Logged in is not enough: only allowlisted Underclub admins check in.
  if not underclub.is_admin() then
    raise exception 'not an Underclub admin' using errcode = '42501';
  end if;

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

-- ---------------------------------------------------------------------------
-- 4) Adding an admin (run by hand, AFTER this file; the user must exist in
--    Supabase Auth: Authentication → Add user)
-- ---------------------------------------------------------------------------
--   insert into underclub.admin_users (user_id)
--   select id from auth.users where email = 'info@underclub.it'
--   on conflict (user_id) do nothing;
--
-- Verification
--   select u.email, a.role, a.created_at
--     from underclub.admin_users a join auth.users u on u.id = a.user_id;
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--    where polname like 'admin_%';   -- every one: underclub.is_admin()

-- PostgREST: pick up the new function now.
notify pgrst, 'reload schema';
