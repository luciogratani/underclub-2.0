#!/usr/bin/env bash
# Underclub 2.0 — SQL test harness.
#
# Spins up a throwaway Postgres 16 cluster that mimics the Supabase roles and
# privileges, applies the whole migration chain (twice, to prove the
# re-runnable files really are), then runs every tests/NN-*.sql in order.
# Never touches a real Supabase project or any network database.
#
# Usage:
#   supabase/tests/run.sh           run everything, always tear the cluster down
#   supabase/tests/run.sh --keep    leave the cluster running and print its URL
#
# Env:
#   PG_BIN       Postgres binaries   (default /opt/homebrew/opt/postgresql@16/bin)
#   PGPORT_TEST  TCP port to listen  (default 55432; must be free)

set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PORT="${PGPORT_TEST:-55432}"
KEEP=0
[[ "${1:-}" == "--keep" ]] && KEEP=1

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="$(dirname "$TESTS_DIR")"

# Postgres aborts with "postmaster became multithreaded during startup" on this
# machine unless the locale is plain C.
export LC_ALL=C LANG=C

for bin in initdb pg_ctl psql; do
  if [[ ! -x "$PG_BIN/$bin" ]]; then
    echo "missing $PG_BIN/$bin (set PG_BIN)" >&2
    exit 2
  fi
done

if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  echo "port $PORT is already in use (set PGPORT_TEST)" >&2
  exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/underclub-pgtest.XXXXXX")"
PGDATA_DIR="$WORK/data"
LOG="$WORK/postgres.log"
STOP_CMD="LC_ALL=C LANG=C '$PG_BIN/pg_ctl' -D '$PGDATA_DIR' -m fast stop && rm -rf '$WORK'"

cleanup() {
  local status=$?
  if [[ $KEEP -eq 1 ]]; then
    echo
    echo "TEST_PG_URL=postgres://postgres@127.0.0.1:$PORT/postgres"
    echo "stop with: $STOP_CMD"
  else
    "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$WORK"
  fi
  exit $status
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$PGDATA_DIR" -U postgres -A trust -E UTF8 --no-locale >/dev/null

# The mktemp path is too long for a unix socket: TCP on loopback only.
"$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -l "$LOG" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c fsync=off -c full_page_writes=off" \
  start >/dev/null || { cat "$LOG" >&2; exit 1; }

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d postgres)
DSN="host=127.0.0.1 port=$PORT dbname=postgres user=postgres"

apply() {
  # $1 = label, $2 = file; extra env (PGOPTIONS) is inherited.
  if ! out="$("${PSQL[@]}" -f "$2" 2>&1)"; then
    echo "FAIL apply $1: $2" >&2
    echo "$out" >&2
    exit 1
  fi
}

echo "→ bootstrap (Supabase-like roles, pgcrypto in extensions)"
apply bootstrap "$TESTS_DIR/bootstrap.sql"

CHAIN=(
  "$SUPABASE_DIR/schema.sql"
  "$SUPABASE_DIR/rls.sql"
  "$SUPABASE_DIR/rls-history/2026-04-17-ultra-strict-ticket-token.sql"
  "$SUPABASE_DIR/rls-history/2026-04-17-ultra-strict-ticket-token-v2.sql"
  "$SUPABASE_DIR/rls-history/2026-04-21-ticket-check-in.sql"
  "$SUPABASE_DIR/rls-history/2026-10-01-contacts-sessions-formulas.sql"
  "$SUPABASE_DIR/rls-history/2026-10-02-booking-endpoints.sql"
)
RERUN=(
  "$SUPABASE_DIR/rls.sql"
  "$SUPABASE_DIR/rls-history/2026-10-01-contacts-sessions-formulas.sql"
  "$SUPABASE_DIR/rls-history/2026-10-02-booking-endpoints.sql"
)

# First pass WITHOUT `extensions` on the search_path: proves no file depends
# on pgcrypto being resolvable unqualified (the April trap).
echo "→ migration chain (search_path = public only)"
for f in "${CHAIN[@]}"; do
  PGOPTIONS="-c search_path=public" apply chain "$f"
done

echo "→ re-run of the re-runnable files (Supabase search_path)"
for f in "${RERUN[@]}"; do
  apply rerun "$f"
done

echo "→ tests"
failed=0
total=0
shopt -s nullglob
for t in "$TESTS_DIR"/[0-9][0-9]-*.sql; do
  total=$((total + 1))
  name="$(basename "$t")"
  if out="$("${PSQL[@]}" -v dsn="$DSN" -f "$t" 2>&1)"; then
    echo "PASS $name"
  else
    failed=$((failed + 1))
    echo "FAIL $name"
    echo "$out" | sed 's/^/    /'
  fi
done

echo
if [[ $failed -gt 0 ]]; then
  echo "$failed of $total test files FAILED"
  exit 1
fi
echo "all $total test files passed"
