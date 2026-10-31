"""Map labels the basemap schema lacks: capes (burun) and named harbours/marinas from the Overpass raw data.

Usage: python -m av_pipeline.spots.labels data/osm/raw.json apps/web/public/tiles/labels.geojson
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def centre(el: dict) -> tuple[float, float] | None:
    if "lat" in el:
        return el["lon"], el["lat"]
    if "center" in el:
        return el["center"]["lon"], el["center"]["lat"]
    g = el.get("geometry") or []
    if g:
        return sum(p["lon"] for p in g) / len(g), sum(p["lat"] for p in g) / len(g)
    return None


def labels(raw: dict) -> dict:
    feats: list[dict] = []
    seen: dict[tuple[str, str], dict] = {}
    for el in raw.get("elements", []):
        t = el.get("tags", {})
        kind = "cape" if t.get("natural") == "cape" else "harbour" if t.get("harbour") == "yes" or t.get("leisure") == "marina" else None
        name = t.get("name:tr") or t.get("name")
        xy = centre(el)
        if not kind or not name or xy is None:
            continue
        # Same name typed with/without Turkish letters (Limani / Limanı): keep the variant with more of them.
        key = (kind, name.lower().replace("ı", "i").replace("İ", "i").replace("i̇", "i"))
        if key in seen:
            prev = seen[key]
            if sum(c in "çğıöşüÇĞİÖŞÜ" for c in name) > sum(c in "çğıöşüÇĞİÖŞÜ" for c in prev["properties"]["name"]):
                prev["properties"]["name"] = name
            continue
        feat = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(xy[0], 5), round(xy[1], 5)]}, "properties": {"kind": kind, "name": name}}
        seen[key] = feat
        feats.append(feat)
    return {"type": "FeatureCollection", "attribution": "© OpenStreetMap contributors, ODbL", "features": sorted(feats, key=lambda f: f["properties"]["name"])}


def main(argv: list[str]) -> int:
    fc = labels(json.loads(Path(argv[1]).read_text()))
    Path(argv[2]).write_text(json.dumps(fc, ensure_ascii=False) + "\n")
    print(f"labels: {len(fc['features'])} ({sum(f['properties']['kind'] == 'cape' for f in fc['features'])} capes)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
