"""Turn raw Overpass output into candidate spots (data/spots.geojson).

For each pier/breakwater/groyne: the fishing point is the vertex farthest from the mainland (the tip). With
--land (OSM land polygons), the mainland is the land eroded by ERODE_M, so harbour piers and moles that the
coastline traces around do not count as land; the coastline-based vertex is kept as `alt_lat/alt_lon` when
it differs by more than ALT_MIN_M. Without --land the distance to the coastline lines is used.
The shore normal comes from the nearest coastline segment: OSM coastlines have land on the left, so the
seaward normal is the segment bearing + 90°. A `sea_probe` point is placed 750 m along the normal
(fallback 1000 m, then 500 m) and must lie on the sea side of the coastline.

With --dtm, depth features come from the EMODnet DTM (profile 0–500 m along the normal, depth at 200 m,
0–300 m slope, max depth within 100 m) and spots without a coastline-based probe get the first DTM point
along the normal that is ≥ 5 m deep.

Usage: python -m av_pipeline.spots.build_spots data/osm/raw.json data/spots.geojson [--check-marine] [--dtm data/bathy/dtm.nc]
       [--land data/osm/land_marmara.geojson] [--habitat]

--land also adds `fetch_km` (16-direction exposure rose); --habitat adds the EUSeaMap substrate class + confidence.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import shapely
from shapely.geometry import LineString, Point, box, shape
from shapely.ops import nearest_points, unary_union

from av_pipeline import BBOX
from av_pipeline.bathy.grid import Grid
from av_pipeline.bathy.sample import dtm_normal, dtm_probe, features, sea_probe
from av_pipeline.habitat import eusm
from av_pipeline.spots.fetch_rose import rose_km
from av_pipeline.spots.geo import M_PER_DEG_LAT, M_PER_DEG_LON, bearing, offset, to_lonlat, to_xy

KIND_TR = {"pier": "İskele", "breakwater": "Mendirek", "groyne": "Mahmuz"}
MIN_LENGTH_M = 15.0
DEDUPE_M = 100.0
PROBE_DISTANCES_M = (750.0, 1000.0, 1500.0, 500.0, 2000.0)
SMOOTH_M = 300.0  # coastline length averaged on each side of the root for breakwater normals
GENERIC_PLACES = {"İskele", "Liman"}
ATTRIBUTION = "© OpenStreetMap contributors, ODbL"
ERODE_M = 60.0  # wider than any pier/mole in the bbox, narrower than headlands
ALT_MIN_M = 25.0


@dataclass
class Coast:
    lines: list[LineString]

    def nearest(self, p: Point) -> tuple[LineString, Point, float]:
        best = min(self.lines, key=lambda ln: ln.distance(p))
        return best, nearest_points(best, p)[0], best.distance(p)

    def segment_bearing_at(self, line: LineString, q: Point) -> float:
        """Bearing of the coastline segment containing q (closest segment to q)."""
        coords = list(line.coords)
        best_i = min(range(len(coords) - 1), key=lambda i: LineString(coords[i : i + 2]).distance(q))
        return bearing(coords[best_i], coords[best_i + 1])

    def smoothed_normal(self, line: LineString, q: Point) -> float:
        """Seaward normal from the length-weighted mean direction of coastline within SMOOTH_M of q."""
        d0 = line.project(q)
        a, b = max(0.0, d0 - SMOOTH_M), min(line.length, d0 + SMOOTH_M)
        coords = [line.interpolate(a).coords[0]] + [c for c in line.coords if a < line.project(Point(c)) < b] + [line.interpolate(b).coords[0]]
        sx = sum(c2[0] - c1[0] for c1, c2 in zip(coords, coords[1:]))
        sy = sum(c2[1] - c1[1] for c1, c2 in zip(coords, coords[1:]))
        if sx == 0 and sy == 0:
            return (self.segment_bearing_at(line, q) + 90) % 360
        return (math.degrees(math.atan2(sx, sy)) + 90) % 360

    def is_sea(self, p: Point) -> bool:
        """Sea is on the right-hand side of the nearest coastline segment."""
        line, q, _ = self.nearest(p)
        b = self.segment_bearing_at(line, q)
        side = math.degrees(math.atan2(p.x - q.x, p.y - q.y)) % 360
        rel = (side - b) % 360
        return 0 < rel < 180


def element_xy(el: dict) -> list[tuple[float, float]]:
    return [to_xy(g["lon"], g["lat"]) for g in el.get("geometry", [])]


def parse(raw: dict) -> tuple[list[dict], Coast, list[dict]]:
    structures, coast, places = [], [], []
    for el in raw.get("elements", []):
        tags = el.get("tags", {})
        if el["type"] == "node" and "place" in tags:
            places.append({"name": tags.get("name"), "xy": to_xy(el["lon"], el["lat"])})
        elif el["type"] == "way" and tags.get("natural") == "coastline":
            xy = element_xy(el)
            if len(xy) >= 2:
                coast.append(LineString(xy))
        elif el["type"] == "way" and tags.get("man_made") in KIND_TR:
            xy = element_xy(el)
            if len(xy) >= 2:
                structures.append({"osm_id": el["id"], "tags": tags, "xy": xy})
    return structures, Coast(coast), places


@dataclass
class Land:
    """OSM land polygons in planar xy: `full` for fetch rays (whole Marmara), `mainland` eroded for tip choice."""

    full: object
    mainland: object


def land_xy(land_fc: dict) -> Land:
    land = unary_union([shape(f["geometry"]) for f in land_fc["features"]])
    full = shapely.transform(land, lambda c: c * [M_PER_DEG_LON, M_PER_DEG_LAT])  # same projection as to_xy
    pad = 0.06
    w, s = to_xy(BBOX["west"] - pad, BBOX["south"] - pad)
    e, n = to_xy(BBOX["east"] + pad, BBOX["north"] + pad)
    near = full.intersection(box(w, s, e, n))
    return Land(full=full, mainland=near.buffer(-ERODE_M).buffer(ERODE_M / 2))


def nearest_place(xy: tuple[float, float], places: list[dict]) -> str | None:
    named = [p for p in places if p["name"] and p["name"] not in GENERIC_PLACES]
    if not named:
        return None
    return min(named, key=lambda p: math.dist(p["xy"], xy))["name"]


def build_candidate(s: dict, coast: Coast, places: list[dict], grid: Grid | None = None, land: Land | None = None) -> dict | None:
    line = LineString(s["xy"])
    if line.length < MIN_LENGTH_M:
        return None
    pts = [Point(c) for c in s["xy"]]
    coast_tip = max(pts, key=lambda p: coast.nearest(p)[2])
    if land is not None:
        root = min(pts, key=lambda p: land.mainland.distance(p))
        tip = max(pts, key=lambda p: land.mainland.distance(p))
    else:
        root = min(pts, key=lambda p: coast.nearest(p)[2])
        tip = coast_tip
    kind = s["tags"]["man_made"]
    if kind == "breakwater":
        # Breakwaters often run parallel to the shore: use the smoothed coastline normal.
        cl, q, _ = coast.nearest(root)
        normal = coast.smoothed_normal(cl, q)
    else:
        # Piers and groynes run out to sea: their own root→tip direction is the most robust normal.
        normal = bearing((root.x, root.y), (tip.x, tip.y))
    probe = None
    for d in PROBE_DISTANCES_M:
        cand = Point(offset((tip.x, tip.y), normal, d))
        if coast.is_sea(cand):
            probe = cand
            break
    place = nearest_place((tip.x, tip.y), places)
    name = s["tags"].get("name") or (f"{KIND_TR[kind]} ({place})" if place else KIND_TR[kind])
    lon, lat = to_lonlat(tip.x, tip.y)
    props = {
        "id": f"osm-way-{s['osm_id']}",
        "name": name,
        "kind": kind,
        "length_m": round(line.length),
        "shore_normal_deg": round(normal, 1),
        "probe_lat": None,
        "probe_lon": None,
        "probe_ok": None,
        "probe_source": None,
        "coast_probe_found": probe is not None,
        "normal_source": "osm",
        "osm_normal_deg": round(normal, 1),
        "depth_200m": None,
        "slope_pct": None,
        "max_depth_100m": None,
        "profile": None,
        "has_light": None,
        "tip_source": "land" if land is not None else "coastline",
        "fetch_km": rose_km(land.full, tip.x, tip.y) if land is not None else None,
        "alt_lat": None,
        "alt_lon": None,
        "status": "candidate",
        "place": place,
        "source": ATTRIBUTION,
    }
    if coast_tip.distance(tip) > ALT_MIN_M:
        alon, alat = to_lonlat(coast_tip.x, coast_tip.y)
        props.update(alt_lat=round(alat, 6), alt_lon=round(alon, 6))
    if probe is not None:
        plon, plat = to_lonlat(probe.x, probe.y)
        props.update(probe_lat=round(plat, 5), probe_lon=round(plon, 5), probe_source="normal")
    if grid is not None:
        # OSM harbour coastlines are jagged and some piers run along the shore; where the DTM shows water,
        # the direction in which it deepens fastest is the more reliable seaward normal.
        if (dn := dtm_normal(grid, lat, lon)) is not None:
            normal = dn[0]
            props.update(shore_normal_deg=round(normal, 1), normal_source="dtm")
            if (p := sea_probe(grid, lat, lon, normal)) is not None:
                props.update(probe_lat=round(p[0], 5), probe_lon=round(p[1], 5), probe_source="dtm")
        elif props["probe_lat"] is None and (p := dtm_probe(grid, lat, lon, normal)) is not None:
            props.update(probe_lat=round(p[0], 5), probe_lon=round(p[1], 5), probe_source="dtm")
        props.update(features(grid, lat, lon, normal))
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, "properties": props}


def in_bbox(f: dict) -> bool:
    lon, lat = f["geometry"]["coordinates"]
    return BBOX["south"] <= lat <= BBOX["north"] and BBOX["west"] <= lon <= BBOX["east"]


def dedupe(features: list[dict]) -> list[dict]:
    """Drop candidates whose tip is within DEDUPE_M of a longer one."""
    kept: list[dict] = []
    for f in sorted(features, key=lambda f: -f["properties"]["length_m"]):
        xy = to_xy(*f["geometry"]["coordinates"])
        if all(math.dist(xy, to_xy(*k["geometry"]["coordinates"])) > DEDUPE_M for k in kept):
            kept.append(f)
    return sorted(kept, key=lambda f: f["properties"]["id"])


def build(raw: dict, grid: Grid | None = None, land: Land | None = None) -> dict:
    structures, coast, places = parse(raw)
    if not coast.lines:
        raise ValueError("no coastline in Overpass data")
    feats = [c for s in structures if (c := build_candidate(s, coast, places, grid, land)) is not None and in_bbox(c)]
    return {"type": "FeatureCollection", "attribution": ATTRIBUTION, "features": dedupe(feats)}


def check_marine(fc: dict, batch: int = 50) -> None:
    """Mark probe_ok by asking Open-Meteo Marine for current wave height at each probe (Actions only)."""
    feats = [f for f in fc["features"] if f["properties"]["probe_lat"] is not None]
    for i in range(0, len(feats), batch):
        chunk = feats[i : i + batch]
        lats = ",".join(str(f["properties"]["probe_lat"]) for f in chunk)
        lons = ",".join(str(f["properties"]["probe_lon"]) for f in chunk)
        url = f"https://marine-api.open-meteo.com/v1/marine?latitude={lats}&longitude={lons}&current=wave_height"
        with urllib.request.urlopen(url, timeout=60) as r:
            data = json.load(r)
        data = data if isinstance(data, list) else [data]
        for f, d in zip(chunk, data):
            f["properties"]["probe_ok"] = d.get("current", {}).get("wave_height") is not None


def main(argv: list[str]) -> int:
    src = Path(argv[1] if len(argv) > 1 else "data/osm/raw.json")
    dst = Path(argv[2] if len(argv) > 2 else "data/spots.geojson")
    grid = Grid.from_netcdf(argv[argv.index("--dtm") + 1]) if "--dtm" in argv else None
    land = land_xy(json.loads(Path(argv[argv.index("--land") + 1]).read_text())) if "--land" in argv else None
    fc = build(json.loads(src.read_text()), grid, land)
    if "--habitat" in argv:
        eusm.annotate(fc["features"])
    if "--check-marine" in argv:
        check_marine(fc)
    dst.write_text(json.dumps(fc, ensure_ascii=False, indent=1) + "\n")
    ok = sum(1 for f in fc["features"] if f["properties"]["probe_ok"])
    dtm = sum(1 for f in fc["features"] if f["properties"]["probe_source"] == "dtm")
    none = sum(1 for f in fc["features"] if f["properties"]["probe_lat"] is None)
    moved = sum(1 for f in fc["features"] if f["properties"]["alt_lat"] is not None)
    print(f"{len(fc['features'])} candidates, {ok} with marine data at probe, {dtm} probes from DTM, {none} without probe, {moved} tips moved off the coastline vertex")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
