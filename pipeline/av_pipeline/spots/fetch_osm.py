"""Fetch candidate spots (piers, breakwaters, groynes), coastline and places from Overpass.

Runs in GitHub Actions only (Overpass is not reachable from the dev container).
Usage: python -m av_pipeline.spots.fetch_osm data/osm/raw.json
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from av_pipeline import BBOX

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
PAD = 0.05  # coastline is fetched slightly beyond the bbox so normals near the edge are right


def build_query() -> str:
    s, w, n, e = BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"]
    bbox = f"{s},{w},{n},{e}"
    padded = f"{s - PAD},{w - PAD},{n + PAD},{e + PAD}"
    return f"""[out:json][timeout:180];
(
  way["man_made"~"^(pier|breakwater|groyne)$"]({bbox});
  way["natural"="coastline"]({padded});
  node["place"~"^(town|village|suburb|neighbourhood|quarter)$"]({bbox});
);
out geom;"""


def fetch(query: str, retries: int = 3) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode()
    last: Exception | None = None
    for attempt in range(retries):
        for url in ENDPOINTS:
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "av-livn/0.1 (+https://av.livn.tr)"})
                with urllib.request.urlopen(req, timeout=200) as r:
                    return json.load(r)
            except Exception as exc:  # noqa: BLE001
                last = exc
                print(f"overpass {url} failed: {exc}", file=sys.stderr)
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"all Overpass endpoints failed: {last}")


def main(argv: list[str]) -> int:
    out = Path(argv[1] if len(argv) > 1 else "data/osm/raw.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    raw = fetch(build_query())
    kinds: dict[str, int] = {}
    for el in raw.get("elements", []):
        tags = el.get("tags", {})
        k = tags.get("man_made") or tags.get("natural") or tags.get("place") or "?"
        kinds[k] = kinds.get(k, 0) + 1
    print("overpass elements:", kinds)
    out.write_text(json.dumps(raw, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
