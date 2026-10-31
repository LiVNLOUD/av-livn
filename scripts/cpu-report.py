"""CPU time of Worker requests from Cloudflare Workers Observability (read-only; token via proxy/env).

Usage: python3 scripts/cpu-report.py [minutes=60] [path-prefix=/api/admin]
Prints one line per matching request (method, path, status, cpuTimeMs, wallTimeMs) and p50/p99 per method.
"""
import json
import os
import sys
import time
import urllib.request

ACC = "bad5df472704942c3734ad402310611f"
minutes = int(sys.argv[1]) if len(sys.argv) > 1 else 60
prefix = sys.argv[2] if len(sys.argv) > 2 else "/api/admin"
now = int(time.time() * 1000)
body = {
    "queryId": "cpu-report",
    "timeframe": {"from": now - minutes * 60_000, "to": now},
    "view": "events",
    "limit": 500,
    "parameters": {"filters": [{"key": "$metadata.service", "operation": "eq", "type": "string", "value": "av-livn"}]},
}
req = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{ACC}/workers/observability/telemetry/query",
    data=json.dumps(body).encode(),
    headers={"content-type": "application/json", "authorization": f"Bearer {os.environ.get('CLOUDFLARE_API_TOKEN', 'placeholder')}"},
)
events = json.load(urllib.request.urlopen(req, timeout=60))["result"]["events"]["events"]
rows = []
for e in events:
    w = e.get("$workers", {})
    r = (w.get("event") or {}).get("request") or {}
    url = r.get("url", "")
    path = "/" + url.split("/", 3)[3] if url.count("/") >= 3 else url
    if not path.startswith(prefix):
        continue
    rows.append((r.get("method"), path.split("?")[0], ((w.get("event") or {}).get("response") or {}).get("status"), w.get("cpuTimeMs"), w.get("wallTimeMs")))
for row in sorted(rows, key=lambda x: str(x[1])):
    print(*row, sep="\t")
for m in sorted({r[0] for r in rows}):
    cpu = sorted(r[3] for r in rows if r[0] == m and r[3] is not None)
    if cpu:
        print(f"{m}: n={len(cpu)} p50={cpu[len(cpu) // 2]} ms max={cpu[-1]} ms")
