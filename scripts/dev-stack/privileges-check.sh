#!/usr/bin/env bash
# Who can read and write what, through PostgREST (the browser's path), on the
# stack of start.sh. Never touches production. Covers:
#   - anon: no access to reservations (2026-10-02-retire-anon-booking.sql),
#     ticket only through open_public_ticket;
#   - admin allowlist (2026-10-03-admin-allowlist.sql): a logged-in user of
#     another project gets nothing, the Underclub admin gets everything.
set -u
DIR="${UC_STACK_DIR:-${TMPDIR:-/tmp}/underclub-dev-stack}"
KEY="$(cat "$DIR/anon.jwt")"
API=http://127.0.0.1:54321/rest/v1
PSQL="/opt/homebrew/opt/postgresql@16/bin/psql -X -q -t -A postgres://postgres@127.0.0.1:55460/postgres"
E=11111111-1111-4111-8111-111111111111
N=33333333-3333-4333-8333-333333333333
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Accept-Profile: underclub" -H "Content-Profile: underclub" -H "Content-Type: application/json")
pass=0; fail=0
check() { # name, expected-codes regex, actual code
  if [[ "$3" =~ ^($2)$ ]]; then echo "PASS  $1 (HTTP $3)"; pass=$((pass+1)); else echo "FAIL  $1 (HTTP $3, expected $2)"; fail=$((fail+1)); fi
}

# A ticket to read: legacy-style booking made by the owner (anon can't anymore).
row=$($PSQL -c "select reservation_id || ' ' || ticket_token from underclub.create_public_reservation('$E', '$N', 'Anon Check', '1990-01-01', 'anon.check.$RANDOM@example.com')")
RID=${row%% *}; TOK=${row#* }

code=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X POST "$API/reservations" \
  -d "{\"event_id\":\"$E\",\"entry_id\":\"$N\",\"full_name\":\"X\",\"date_of_birth\":\"1990-01-01\",\"email\":\"x$RANDOM@example.com\"}")
check "anon INSERT into reservations is refused" "401|403" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" "$API/reservations?select=id")
check "anon SELECT on reservations is refused" "401|403" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -H "x-ticket-token: $TOK" "$API/reservations?id=eq.$RID")
check "anon read with the old x-ticket-token header is refused" "401|403" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X PATCH -H "x-ticket-token: $TOK" "$API/reservations?id=eq.$RID" -d '{"ticket_opened_at":"2026-01-01T00:00:00Z"}')
check "anon 'mark opened' with x-ticket-token is refused" "401|403" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X POST "$API/rpc/create_public_reservation" \
  -d "{\"p_event_id\":\"$E\",\"p_entry_id\":\"$N\",\"p_full_name\":\"X\",\"p_date_of_birth\":\"1990-01-01\",\"p_email\":\"y$RANDOM@example.com\"}")
check "anon RPC create_public_reservation is refused" "401|403|404" "$code"

body=$(curl -s "${H[@]}" -X POST "$API/rpc/open_public_ticket" -d "{\"p_reservation_id\":\"$RID\",\"p_token\":\"$TOK\"}")
[[ "$body" == *"$RID"* ]] && code=200 || code=000
check "anon RPC open_public_ticket with the right token returns the ticket" "200" "$code"

body=$(curl -s "${H[@]}" -X POST "$API/rpc/open_public_ticket" -d "{\"p_reservation_id\":\"$RID\",\"p_token\":\"wrong\"}")
[[ "$body" == "[]" ]] && code=200 || code=000
check "anon RPC open_public_ticket with a wrong token returns nothing" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" "$API/events?select=title,booking_deadline&is_over=eq.false")
check "anon can still read the published nights" "200" "$code"

# Admin allowlist (2026-10-03-admin-allowlist.sql): logged-in users as
# PostgREST sees them (JWT with role authenticated + sub).
ADM="$(cat "$DIR/admin.jwt")"; OTH="$(cat "$DIR/other.jwt")"
HA=(-H "apikey: $KEY" -H "Authorization: Bearer $ADM" -H "Accept-Profile: underclub" -H "Content-Profile: underclub" -H "Content-Type: application/json")
HO=(-H "apikey: $KEY" -H "Authorization: Bearer $OTH" -H "Accept-Profile: underclub" -H "Content-Profile: underclub" -H "Content-Type: application/json")

body=$(curl -s "${HO[@]}" "$API/events?select=id")
[[ "$body" == "[]" ]] && code=200 || code=000
check "user of another project sees no nights (even published)" "200" "$code"
body=$(curl -s "${HO[@]}" "$API/contacts?select=email")
[[ "$body" == "[]" ]] && code=200 || code=000
check "user of another project sees no contacts" "200" "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' "${HO[@]}" -X POST "$API/events" -d '{"title":"Intruder","date":"2030-01-01","time":"23:00","status":"published"}')
check "user of another project cannot create a night" "401|403" "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' "${HO[@]}" -X POST "$API/rpc/scan_ticket_check_in" -d "{\"p_token\":\"$TOK\"}")
check "user of another project cannot check a ticket in" "401|403" "$code"
body=$(curl -s "${HA[@]}" "$API/events?select=id")
[[ "$body" == *"$E"* ]] && code=200 || code=000
check "Underclub admin (info@underclub.it) sees the nights" "200" "$code"
body=$(curl -s "${HA[@]}" -X POST "$API/rpc/scan_ticket_check_in" -d "{\"p_token\":\"$TOK\"}")
[[ "$body" == *'"result_code":"ok"'* ]] && code=200 || code=000
check "Underclub admin can check the ticket in" "200" "$code"

# Clean up the check's own row (owner).
$PSQL -c "delete from underclub.reservations where id = '$RID'" >/dev/null
echo; echo "$pass passed, $fail failed"
