-- Underclub 2.0 — RLS History
-- Version: 2026-10-02 (retire the anon booking path)
--
-- Purpose: steps 1c, 2 and 3 of the 2026-10-01 "NEXT STEP" cleanup. The site
-- books only through the serverless endpoints (VITE_BOOKING_API=1 since the
-- first production deploy) and reads tickets only through
-- `open_public_ticket`, so anon no longer needs the reservations table:
--   - before this file anon could INSERT reservations directly (policy
--     `anon_insert_reservation`) or through `create_public_reservation`,
--     skipping the email confirmation, the 18+ check, the quota lock and
--     every rate limit;
--   - the x-ticket-token policies (read / mark opened) are dead weight.
--
-- Not done here (steps 1b, 4, 5: drop the legacy name/email/date-of-birth
-- columns): they need the admin to read names from `contacts` first.
--
-- Run AFTER 2026-10-02-night-end-booking-close.sql. Re-runnable. After it,
-- rls.sql no longer creates `anon_insert_reservation` (replaying it is safe).
--
-- Breaks on purpose: any client still built with VITE_BOOKING_API unset
-- (direct RPC booking, x-ticket-token ticket page). None is deployed.

-- 1c) Ticket read / first-open tracking by header: replaced by open_public_ticket.
drop policy if exists "anon_read_own_reservation_token"      on underclub.reservations;
drop policy if exists "anon_update_ticket_opened_token_once" on underclub.reservations;

-- 2) Direct insert.
drop policy if exists "anon_insert_reservation" on underclub.reservations;

-- No table privilege left for anon on reservations (defense in depth: even a
-- future permissive policy would not open it).
revoke all on underclub.reservations from anon;

-- 3) The legacy booking RPC: kept for the owner (test fixtures build legacy
-- rows with it), closed to the API roles.
revoke all on function underclub.create_public_reservation(uuid, uuid, text, date, text)
  from public, anon, authenticated;

-- PostgREST: forget the dropped grants now.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--   select has_table_privilege('anon', 'underclub.reservations', 'select,insert,update');  -- false
--   select has_function_privilege('anon',
--     'underclub.create_public_reservation(uuid, uuid, text, date, text)', 'execute');    -- false
--   select polname from pg_policy where polrelid = 'underclub.reservations'::regclass;   -- admin_all_reservations only
