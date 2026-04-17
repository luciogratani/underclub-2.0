# RLS History — 2026-04-17 v2.1

This note tracks the post-v2 fix for public availability counts.

## Problem observed

After strict token ownership was enabled on `reservations`, the public web app could no longer read raw reservations rows for availability math (`LEFT`/`SOLD OUT`).

Result: entry quota UI stayed static (e.g. `69 LEFT` never decreased).

## Fix introduced

- Added `underclub.get_public_entry_counts(p_event_id uuid)` as `security definer`.
- Returns only aggregated data:
  - `entry_id`
  - `confirmed_count`
- Granted execute to `anon` and `authenticated`.

## Frontend alignment

`apps/web/src/lib/api.ts` now uses:

- `rpc('get_public_entry_counts', { p_event_id })`

instead of direct `select` on `reservations`.

This preserves strict reservation privacy while keeping public availability live and accurate.
