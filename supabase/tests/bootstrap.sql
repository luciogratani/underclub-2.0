-- Test bootstrap: the minimum of a Supabase project the migrations rely on.
-- Applied once, by run.sh, before the migration chain. Never run on Supabase.

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

-- Supabase keeps pgcrypto in `extensions`, not in `public`.
create schema extensions;
create extension pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Same database default as Supabase.
alter database postgres set search_path = "$user", public, extensions;

-- Exposing a schema from the Supabase dashboard grants usage on it and sets
-- DEFAULT PRIVILEGES so every table/function created later is granted to the
-- three API roles. The 2026-10-01 migration's revokes exist because of this,
-- so it must be in place BEFORE the chain runs.
-- Production (self-hosted, checked 2026-10-01) grants usage on `underclub` to
-- anon and authenticated only: service_role must get it from the migrations.
create schema underclub;
grant usage on schema underclub to anon, authenticated;
alter default privileges in schema underclub
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema underclub
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema underclub
  grant all on sequences to anon, authenticated, service_role;

-- The slice of Supabase Auth the migrations use: `auth.users` (referenced by
-- underclub.admin_users) and `auth.uid()`, same definition as Supabase: the
-- `sub` of the request JWT, which PostgREST puts in `request.jwt.claims`.
-- Tests act as a given user with set_config('request.jwt.claims', ...).
create schema auth;
create table auth.users (
  id    uuid primary key,
  email text
);
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Only for the concurrency tests (two real sessions from inside SQL).
create extension dblink schema extensions;
