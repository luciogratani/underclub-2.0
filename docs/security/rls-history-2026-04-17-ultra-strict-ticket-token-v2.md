# RLS History — 2026-04-17 v2

File SQL:

- `supabase/rls-history/2026-04-17-ultra-strict-ticket-token-v2.sql`

## Why v2 exists

The first strict token rollout surfaced two real runtime issues:

1. `digest(...)` and `gen_random_bytes(...)` were not resolved in some self-hosted environments unless schema-qualified (`extensions.*`).
2. Public reservation creation used `insert(...).select(...)`, which conflicts with strict `SELECT` ownership rules during the create flow.

## What v2 changes

- Replaces crypto helper functions with `extensions.digest` and `extensions.gen_random_bytes`.
- Adds `underclub.create_public_reservation(...)` as a `security definer` RPC that:
  - validates published event
  - validates entry ownership
  - inserts reservation
  - issues ticket token
  - returns `reservation_id`, `reservation_status`, `ticket_token`

## Frontend impact

The web app now calls `rpc('create_public_reservation', ...)` for booking.

This keeps strict token ownership intact while allowing anon users to book normally.
