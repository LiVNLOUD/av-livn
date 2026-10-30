#!/usr/bin/env bash
# Verifies the admin API with the real ADMIN_TOKEN (read from env, never printed) without writing data:
# ping → 200 with token, 401 without; PATCH on a non-existent spot → 404 (auth passed, DB reached, nothing written).
set -uo pipefail
BASE=${BASE:-https://av.livn.tr}
: "${ADMIN_TOKEN:?ADMIN_TOKEN not set}"
code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@"; }
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1 ($2)"; else echo "FAIL $1 (got $2, want $3)"; fail=1; fi; }
check "admin ping with token" "$(code -H "authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/ping")" 200
check "admin ping without token" "$(code "$BASE/api/admin/ping")" 401
check "admin PATCH unknown spot" "$(code -X PATCH -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' -d '{"notes":null}' "$BASE/api/admin/spots/__smoke__")" 404
exit $fail
