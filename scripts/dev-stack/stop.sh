#!/usr/bin/env bash
# Stops what start.sh started (by port) and the throwaway Postgres.
STATE="${UC_STACK_DIR:-${TMPDIR:-/tmp}/underclub-dev-stack}"
for port in 5173 54321 3010; do
  pids=$(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null) && kill $pids 2>/dev/null
done
[[ -f "$STATE/stop-pg.sh" ]] && bash "$STATE/stop-pg.sh" >/dev/null 2>&1 && rm -f "$STATE/stop-pg.sh"
echo "stopped"
