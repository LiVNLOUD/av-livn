#!/usr/bin/env bash
# Post-deploy smoke test: av.livn.tr must be up AND livn.tr, www, /win must be untouched.
set -uo pipefail
WIN_TARGET="https://raw.githubusercontent.com/LiVNLOUD/livn-tools/main/win.ps1"
fail=0

retry() { # retry <description> <command...>
  local desc=$1; shift
  for i in 1 2 3 4 5; do
    if "$@"; then echo "ok   $desc"; return 0; fi
    sleep 10
  done
  echo "FAIL $desc"; fail=1
}

# Read the whole body first: piping curl into `grep -q` lets grep exit on the first match while curl is still writing,
# curl then fails with (23) and pipefail turns a good page into a FAIL (seen once the home page grew past one pipe write).
health() { local b; b=$(curl -fsS -m 15 https://av.livn.tr/api/health) && grep -q '"ok":true' <<<"$b"; }
home() { local b; b=$(curl -fsS -m 15 https://av.livn.tr/) && grep -q 'data-app="av-livn"' <<<"$b"; }
status200() { [ "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$1")" = 200 ]; }
win() {
  local out; out=$(curl -s -o /dev/null -m 15 -w '%{http_code} %{redirect_url}' https://livn.tr/win)
  [ "$out" = "301 $WIN_TARGET" ]
}

retry "av.livn.tr/api/health ok:true" health
retry "av.livn.tr/ serves app" home
retry "livn.tr/ 200" status200 https://livn.tr/
retry "www.livn.tr/ 200" status200 https://www.livn.tr/
retry "livn.tr/win 301 -> win.ps1" win
exit $fail
