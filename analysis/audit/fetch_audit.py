"""Fetch (exposure) rose per spot: OSM land polygons (vector) vs the EMODnet DTM land/no-data mask.

Rays leave the structure tip (docs/audit/tip_audit.json) every 22.5°. Vector fetch = length of the first open-water
stretch before an OSM land polygon
(data/osm/land_marmara.geojson, osmdata land-polygons-split-4326 clipped to the Marmara region), capped at MAX_KM.
A tip on a structure mapped as land gets the water stretch that starts within 500 m.
DTM fetch = first 50 m step whose cell is elevation >= 0 or no-data; rays that leave the DTM bbox are
flagged `truncated` (the DTM audit grid covers only the app bbox).
Writes docs/audit/fetch_rose.json and prints the per-direction difference table.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import netCDF4
import numpy as np
from shapely.geometry import LineString, Point, shape

DIRS = [i * 22.5 for i in range(16)]
COMPASS = ["K", "KKD", "KD", "DKD", "D", "DGD", "GD", "GGD", "G", "GGB", "GB", "BGB", "B", "BKB", "KB", "KKB"]
MAX_KM = 100.0
START_M = 30.0
STEP_M = 50.0


def dest(lat: float, lon: float, bearing: float, metres: float) -> tuple[float, float]:
    b = math.radians(bearing)
    dlat = metres * math.cos(b) / 111_320
    dlon = metres * math.sin(b) / (111_320 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def vector_fetch(land, lat: float, lon: float, bearing: float) -> tuple[float, bool]:
    """Length of the first open-water stretch along the ray (starting within 500 m of the tip, so a tip that
    sits on a structure mapped as land still gets the water beyond it)."""
    e = dest(lat, lon, bearing, MAX_KM * 1000)
    ray = LineString([(lon, lat), (e[1], e[0])])
    start = Point(lon, lat)
    water = ray.difference(land)
    best = None
    for seg in getattr(water, "geoms", [water]):
        if seg.is_empty:
            continue
        a, b = Point(seg.coords[0]), Point(seg.coords[-1])
        near, far = (a, b) if a.distance(start) <= b.distance(start) else (b, a)
        if near.distance(start) * 111 > 0.5:
            continue
        if best is None or near.distance(start) < best[0].distance(start):
            best = (near, far)
    if best is None:
        return 0.0, land.contains(start)
    return round(km((lat, lon), (best[1].y, best[1].x)), 2), land.contains(start)


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[2]
    spots = json.loads((root / "data/spots.geojson").read_text())["features"]
    land = json.loads((root / (argv[1] if len(argv) > 1 else "data/osm/land_marmara.geojson")).read_text())["features"]
    nc = netCDF4.Dataset(argv[2] if len(argv) > 2 else "/tmp/dtm_audit.nc")
    la, lo = nc["latitude"][:], nc["longitude"][:]
    elev = np.ma.filled(nc["elevation"][:].astype(float), np.nan)
    from shapely.geometry import box
    from shapely.ops import unary_union
    land_u = unary_union([shape(f["geometry"]) for f in land]).intersection(box(26.4, 39.9, 30.1, 41.4))
    tips = {t["spot"]: t["tip"] for t in json.loads((root / "docs/audit/tip_audit.json").read_text())["spots"] if "tip" in t}
    dla, dlo = float(la[1] - la[0]), float(lo[1] - lo[0])

    def dtm_land(lat: float, lon: float) -> bool | None:
        i, j = round((lat - float(la[0])) / dla), round((lon - float(lo[0])) / dlo)
        if not (0 <= i < len(la) and 0 <= j < len(lo)):
            return None  # outside the grid
        v = elev[i, j]
        return bool(np.isnan(v) or v >= 0)

    def dtm_fetch(lat: float, lon: float, bearing: float) -> tuple[float, bool, float | None]:
        m = START_M
        first_sea = None
        while m <= MAX_KM * 1000:
            p = dest(lat, lon, bearing, m)
            v = dtm_land(*p)
            if v is None:
                return round(m / 1000, 2), True, first_sea
            if not v and first_sea is None:
                first_sea = m
            if v and first_sea is not None:
                return round(m / 1000, 2), False, first_sea
            m += STEP_M
        return MAX_KM, False, first_sea

    out = []
    for f in spots:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        if p["id"] in tips:  # measure from the structure tip (docs/audit/tip_audit.json)
            lat, lon = tips[p["id"]]
        rose = []
        for d, c in zip(DIRS, COMPASS):
            vf, on_land = vector_fetch(land_u, lat, lon, d)
            df, trunc, first_sea = dtm_fetch(lat, lon, d)
            rose.append({"dir": d, "compass": c, "osm_km": vf, "osm_start_on_land": on_land, "dtm_km": df, "dtm_truncated": trunc,
                         "dtm_first_sea_m": first_sea})
        out.append({"spot": p["id"], "name": p["name"], "shore_normal_deg": p["shore_normal_deg"], "rose": rose})
    summary = []
    for s in out:
        diffs = [r["dtm_km"] - r["osm_km"] for r in s["rose"] if not r["dtm_truncated"]]
        summary.append({
            "spot": s["spot"], "name": s["name"],
            "open_dirs_osm_gt5km": sum(r["osm_km"] > 5 for r in s["rose"]),
            "max_osm_km": max(r["osm_km"] for r in s["rose"]),
            "median_abs_diff_km": round(float(np.median(np.abs(diffs))), 2) if diffs else None,
            "dirs_dtm_sea_but_osm_land": sum(r["osm_km"] < 0.1 and (r["dtm_first_sea_m"] or 1e9) < 100 for r in s["rose"]),
            "dirs_truncated": sum(r["dtm_truncated"] for r in s["rose"]),
        })
    (root / "docs/audit/fetch_rose.json").write_text(json.dumps({"method": __doc__.strip().splitlines()[0], "max_km": MAX_KM,
                                                                 "summary": summary, "spots": out}, ensure_ascii=False, indent=1) + "\n")
    for s in summary:
        print(s)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
