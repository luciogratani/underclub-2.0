#!/usr/bin/env bash
# Local stack for underclub-2.0, on the current branch. Never touches production.
#   Postgres 16 (throwaway, full migration chain + SQL tests)  127.0.0.1:55460
#   PostgREST                                                    127.0.0.1:3010
#   proxy /rest/v1 → PostgREST (what supabase-js expects)        127.0.0.1:54321
#   Vite dev server for apps/web (/api/* run against Postgres)   localhost:5173
# Seeds one published test night 10 days ahead. Emails are not sent: their
# links appear in $STATE/vite.log. Stops a previous stack first.
# There is no Supabase Auth here: the admin app cannot log in on this stack.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="${UC_STACK_DIR:-${TMPDIR:-/tmp}/underclub-dev-stack}"
PSQL=(/opt/homebrew/opt/postgresql@16/bin/psql -X -q -v ON_ERROR_STOP=1 postgres://postgres@127.0.0.1:55460/postgres)
mkdir -p "$STATE"
"$HERE/stop.sh" >/dev/null 2>&1 || true

# PostgREST JWT secret and the tokens signed with it, created once.
if [[ ! -f "$STATE/jwt-secret" ]]; then
  openssl rand -hex 32 > "$STATE/jwt-secret"
fi
SECRET="$(cat "$STATE/jwt-secret")"
sign() { # role [sub]
  node -e 'const {createHmac}=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const p={role:process.argv[2],exp:4102444800};if(process.argv[3])p.sub=process.argv[3];
const h=b({alg:"HS256",typ:"JWT"}),q=b(p);console.log(`${h}.${q}.${createHmac("sha256",process.argv[1]).update(`${h}.${q}`).digest("base64url")}`)' "$SECRET" "$@"
}
sign anon > "$STATE/anon.jwt"
# Test users from supabase/tests/01-fixtures.sql: the Underclub admin and a
# user of another project on the same instance.
sign authenticated a0000000-0000-0000-0000-000000000001 > "$STATE/admin.jwt"
sign authenticated a0000000-0000-0000-0000-000000000002 > "$STATE/other.jwt"

cat > "$STATE/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:55460/postgres"
db-schemas = "underclub"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = 3010
CONF

cat > "$STATE/proxy.mjs" <<'JS'
import http from 'node:http';
http.createServer((req, res) => {
  if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); return res.end(); }
  const up = http.request({ host: '127.0.0.1', port: 3010, method: req.method,
    path: req.url.slice('/rest/v1'.length), headers: { ...req.headers, host: '127.0.0.1:3010' } },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}).listen(54321, '127.0.0.1');
JS

cd "$REPO"
echo "→ Postgres + migrations + SQL tests"
# To a file, not a pipe: the Postgres it leaves running would hold the pipe open.
PGPORT_TEST=55460 supabase/tests/run.sh --keep > "$STATE/run.log" 2>&1 || { grep -v NOTICE "$STATE/run.log" | tail -20; exit 1; }
grep -E "passed|FAIL" "$STATE/run.log"
grep "stop with:" "$STATE/run.log" | sed 's/^stop with: //' > "$STATE/stop-pg.sh"

echo "→ test night"
"${PSQL[@]}" <<'SQL'
truncate underclub.activation_tokens, underclub.contact_sessions, underclub.reservations,
         underclub.contacts, underclub.event_artists, underclub.event_entries,
         underclub.events, underclub.request_throttle cascade;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;
insert into underclub.events (id, title, date, time, status) values
  ('11111111-1111-4111-8111-111111111111', 'TECHNOROOM: TEST NIGHT',
   (now() at time zone 'Europe/Rome')::date + 10, '00:30', 'published');
insert into underclub.event_artists (event_id, name, origin, sort_order) values
  ('11111111-1111-4111-8111-111111111111', 'TEST DJ', 'TECHNOROOM', 0);
insert into underclub.event_entries (id, event_id, name, note, quota, sort_order, price, valid_until) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'RIDOTTO', '+1 drink', 3, 0, 10,
   ((now() at time zone 'Europe/Rome')::date + 11 + time '01:59') at time zone 'Europe/Rome'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'INTERO', null, null, 1, 15, null);
SQL

echo "→ PostgREST, proxy, Vite"
nohup postgrest "$STATE/postgrest.conf" > "$STATE/postgrest.log" 2>&1 & disown
nohup node "$STATE/proxy.mjs" > "$STATE/proxy.log" 2>&1 & disown
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY="$(cat "$STATE/anon.jwt")" \
DEV_PG_URL=postgres://postgres@127.0.0.1:55460/postgres \
  nohup pnpm --filter web dev --port 5173 --strictPort > "$STATE/vite.log" 2>&1 & disown

for _ in $(seq 1 30); do
  curl -s -o /dev/null http://localhost:5173/ && curl -s -o /dev/null http://127.0.0.1:3010/ && break
  sleep 1
done
echo "ready: http://localhost:5173  (state and logs: $STATE)"
