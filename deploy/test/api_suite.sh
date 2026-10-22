#!/bin/bash
# Functional check of the self-hosted API.
#
#   BASE=https://eval.cph-agro.com EMAIL=... PASSWORD=... ./deploy/test/api_suite.sh
#
# BASE defaults to the local vhost, so it can also run on the host itself.
set -u

: "${EMAIL:?EMAIL is required}"
: "${PASSWORD:?PASSWORD is required}"
BASE="${BASE:-http://127.0.0.1}"
# Run on the host: the vhost is selected by the Host header.
HOSTHDR=()
case "$BASE" in http://127.0.0.1*) HOSTHDR=(-H 'Host: eval.cph-agro.com') ;; esac

PASS=0; FAIL=0
t() {
  local name="$1" want="$2"; shift 2
  local code
  code=$(curl -s ${HOSTHDR[@]+("${HOSTHDR[@]}")} -o /tmp/cph_t.txt -w '%{http_code}' "$@")
  if [ "$code" = "$want" ]; then PASS=$((PASS+1)); echo "  PASS  $name";
  else FAIL=$((FAIL+1)); echo "  FAIL  $name (want $want, got $code)"; head -c 200 /tmp/cph_t.txt; echo; fi
}

echo '=== reads ==='
t health 200 "$BASE/rest/v1/health"
t roles 200 "$BASE/rest/v1/roles?select=name,code,level&order=level.asc"
t filters 200 "$BASE/rest/v1/roles?code=in.(admin,hr)"
t is-null 200 "$BASE/rest/v1/users?archived_at=is.null"
t unknown-table 404 "$BASE/rest/v1/nosuchtable"

echo '=== the session ==='
LOGIN=$(curl -s ${HOSTHDR[@]+("${HOSTHDR[@]}")} -X POST "$BASE/rest/v1/rpc/app_login" \
  -H 'Content-Type: application/json' \
  -d "{\"p_email\":\"$EMAIL\",\"p_password\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$TOKEN" ]; then PASS=$((PASS+1)); echo '  PASS  login';
else FAIL=$((FAIL+1)); echo "  FAIL  login: $LOGIN"; fi
A=(-H "Authorization: Bearer $TOKEN")

t users 200 "${A[@]}" "$BASE/rest/v1/users"
t single-object 406 "${A[@]}" -H 'Accept: application/vnd.pgrst.object+json' "$BASE/rest/v1/users"
t embed 200 "${A[@]}" "$BASE/rest/v1/users?select=email,branches(name)"
t aggregate 200 "${A[@]}" "$BASE/rest/v1/evaluations?select=avg(score)"

BODY=$(curl -s ${HOSTHDR[@]+("${HOSTHDR[@]}")} "${A[@]}" "$BASE/rest/v1/users")
case "$BODY" in *password*) FAIL=$((FAIL+1)); echo '  FAIL  the password hash is exposed';;
*) PASS=$((PASS+1)); echo '  PASS  no password hash';; esac

ANON=$(curl -s ${HOSTHDR[@]+("${HOSTHDR[@]}")} "$BASE/rest/v1/users")
if [ "$ANON" = '[]' ]; then PASS=$((PASS+1)); echo '  PASS  anonymous sees nothing';
else FAIL=$((FAIL+1)); echo "  FAIL  anonymous sees $ANON"; fi

echo '=== writes ==='
NEW=$(curl -s ${HOSTHDR[@]+("${HOSTHDR[@]}")} -X POST "${A[@]}" -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  -d '{"name":"TEST SUITE","type":"numeric","is_active":true}' \
  "$BASE/rest/v1/evaluation_criteria")
ID=$(printf '%s' "$NEW" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
if [ -n "$ID" ]; then PASS=$((PASS+1)); echo '  PASS  insert';
else FAIL=$((FAIL+1)); echo "  FAIL  insert: $NEW"; fi
if [ -n "$ID" ]; then
  t update 200 -X PATCH "${A[@]}" -H 'Content-Type: application/json' \
    -d '{"description":"patched"}' "$BASE/rest/v1/evaluation_criteria?id=eq.$ID"
  t delete 200 -X DELETE "${A[@]}" "$BASE/rest/v1/evaluation_criteria?id=eq.$ID"
fi

echo '=== the SPA ==='
t spa-root 200 "$BASE/"
t spa-route 200 "$BASE/evaluations"

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
