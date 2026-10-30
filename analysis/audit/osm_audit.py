"""OSM audit (Actions only; Overpass is not reachable from the dev container).

Writes docs/audit/osm_structures.json: every pier/breakwater/groyne in the extended bbox with full node
geometry and tags, plus ferry/passenger terminals (amenity=ferry_terminal, ferry route stops, named ferry
piers) for the DTM ground-truth test.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from av_pipeline.spots.fetch_osm import fetch

BBOX = "40.28,28.55,40.62,29.25"
QUERY = f"""[out:json][timeout:180];
(
  way["man_made"~"^(pier|breakwater|groyne)$"]({BBOX});
  nwr["amenity"="ferry_terminal"]({BBOX});
  nwr["public_transport"]["ferry"="yes"]({BBOX});
  relation["route"="ferry"]({BBOX});
);
out geom tags;"""


def main(argv: list[str]) -> int:
    out = Path(argv[1] if len(argv) > 1 else "docs/audit/osm_structures.json")
    raw = fetch(QUERY)
    items = []
    for el in raw.get("elements", []):
        geom = el.get("geometry") or ([{"lat": el["lat"], "lon": el["lon"]}] if "lat" in el else [])
        if el["type"] == "relation":
            geom = []
        items.append({"type": el["type"], "id": el["id"], "tags": el.get("tags", {}), "geometry": [[g["lat"], g["lon"]] for g in geom],
                      "members": [m.get("ref") for m in el.get("members", [])][:50] if el["type"] == "relation" else None})
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"bbox": BBOX, "elements": items}, ensure_ascii=False, indent=1) + "\n")
    kinds = {}
    for i in items:
        k = i["tags"].get("man_made") or i["tags"].get("amenity") or i["tags"].get("route") or i["tags"].get("public_transport") or "?"
        kinds[k] = kinds.get(k, 0) + 1
    print("osm audit:", kinds)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
