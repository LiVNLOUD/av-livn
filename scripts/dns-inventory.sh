#!/usr/bin/env bash
# Read-only DNS + /win inventory for livn.tr. Prints markdown to stdout.
set -u
doh() { curl -s "https://cloudflare-dns.com/dns-query?name=$1&type=$2" -H 'accept: application/dns-json' | python3 -c 'import sys,json;d=json.load(sys.stdin);a=d.get("Answer",[]);print(", ".join(x["data"][:70] for x in a) or "—")'; }
echo "### Public resolution (DoH 1.1.1.1) — $(date -u +%FT%TZ)"
echo; echo "| Name | Type | Answer |"; echo "|---|---|---|"
for n in livn.tr www.livn.tr av.livn.tr; do for t in NS A AAAA CNAME MX TXT; do echo "| $n | $t | $(doh $n $t) |"; done; done
echo; echo "### Cloudflare zone records (API)"; echo; echo '| Type | Name | Content | Proxied |'; echo '|---|---|---|---|'
Z=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=livn.tr" | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"][0]["id"])')
curl -s "https://api.cloudflare.com/client/v4/zones/$Z/dns_records?per_page=100" | python3 -c '
import sys,json
for r in json.load(sys.stdin)["result"]:
    c=r["content"]; c=c[:40]+"…" if len(c)>40 else c
    print("| %s | %s | `%s` | %s |" % (r["type"], r["name"], c, r.get("proxied")))'
echo; echo "### HTTP checks"; echo; echo '```'
for u in https://livn.tr/ https://www.livn.tr/ https://livn.tr/win; do printf "%s -> " $u; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $u; done
printf "win.ps1 first line: "; curl -sL https://livn.tr/win | head -c 80 | tr '\n' ' '; echo
echo '```'
