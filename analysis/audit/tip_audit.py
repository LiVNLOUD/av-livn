"""Spot point vs structure tip (OSM way geometry from docs/audit/osm_structures.json).

Tip = the way node farthest from the *mainland*: OSM land polygons eroded by ERODE_M, so piers, moles and
breakwaters that the coastline traces around (mapped as land) do not count as mainland. Root = nearest node.
Writes docs/audit/tip_audit.json.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import unary_union

ERODE_M = 60.0


def km(a, b):
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    osm = json.loads((root / "docs/audit/osm_structures.json").read_text())["elements"]
    land_raw = unary_union([shape(f["geometry"]) for f in json.loads((root / "data/osm/land_marmara.geojson").read_text())["features"]])
    mainland = land_raw.buffer(-ERODE_M / 111_000).buffer(ERODE_M / 111_000 * 0.5)
    spots = json.loads((root / "data/spots.geojson").read_text())["features"]
    ways = {f"osm-way-{e['id']}": e for e in osm if e["type"] == "way"}
    out = []
    for f in spots:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        e = ways.get(p["id"])
        if not e:
            out.append({"spot": p["id"], "name": p["name"], "error": "way not in audit"})
            continue
        g = e["geometry"]
        d = [mainland.distance(Point(x[1], x[0])) * 111_000 for x in g]
        tip, rt = g[max(range(len(g)), key=d.__getitem__)], g[min(range(len(g)), key=d.__getitem__)]
        out.append({
            "spot": p["id"], "name": p["name"], "kind": p["kind"],
            "point_to_tip_m": round(km((lat, lon), tip) * 1000), "point_to_root_m": round(km((lat, lon), rt) * 1000),
            "tip_from_mainland_m": round(max(d)), "tip": [round(tip[0], 6), round(tip[1], 6)],
            "point_inside_osm_land": land_raw.contains(Point(lon, lat)), "tip_inside_osm_land": land_raw.contains(Point(tip[1], tip[0])),
            "verdict": "uçta" if km((lat, lon), tip) * 1000 <= 25 else "uçta değil",
        })
    (root / "docs/audit/tip_audit.json").write_text(json.dumps({"method": __doc__.strip().splitlines()[2], "erode_m": ERODE_M, "spots": out},
                                                               ensure_ascii=False, indent=1) + "\n")
    for o in out:
        print(o)
    return 0


if __name__ == "__main__":
    sys.exit(main())
