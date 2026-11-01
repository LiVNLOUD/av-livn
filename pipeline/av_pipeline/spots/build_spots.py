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
import re
import math
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import shapely
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import nearest_points, unary_union

from av_pipeline import BBOX
from av_pipeline.bathy.grid import Grid
from av_pipeline.bathy.sample import dtm_normal, dtm_probe, features, sea_probe
from av_pipeline.habitat import eusm
from av_pipeline.spots.fetch_rose import rose_km
from av_pipeline.spots.labels import labels as map_labels
from av_pipeline.spots.naming import describe_singles, unique_names
from av_pipeline.spots.geo import M_PER_DEG_LAT, M_PER_DEG_LON, bearing, offset, to_lonlat, to_xy

KIND_TR = {"pier": "İskele", "breakwater": "Mendirek", "groyne": "Mahmuz"}
MIN_LENGTH_M = 15.0
DEDUPE_M = 25.0  # identical tips only: distinct structures are never merged (user decision, v2)
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


# H2: structure length. OSM draws some piers as a closed outline (length = perimeter) or as one line with the quay
# along the shore; only the part reaching out to sea says something about the depth at the tip.
SHORE_BUFFER_M = 15.0
EXPECTED_LENGTH_M = {"pier": (10, 300), "breakwater": (20, 1200), "groyne": (5, 150), "quay": (10, 600)}
FERRY_PIER_MAX_M = 400


def structure_length(xy: list[tuple[float, float]], coast: "Coast", land: "Land | None" = None) -> dict:
    """{length_osm_m, seaward_m, reach_m}: raw OSM length (perimeter for a closed way), the length reaching out to
    sea and the tip's distance from the shore. With land polygons the shore is the *eroded mainland* (piers and
    moles removed: OSM often traces the coastline around them); without, a SHORE_BUFFER_M band of the coastline.
    A closed outline counts with the long side of its minimum rotated rectangle."""
    line = LineString(xy)
    closed = len(xy) >= 4 and xy[0] == xy[-1]
    base = land.mainland if land is not None else unary_union(coast.lines)
    shore = base.buffer(SHORE_BUFFER_M)
    if closed:
        poly = Polygon(xy).buffer(0)
        sea = poly.difference(shore)
        part = sea if not sea.is_empty else poly
        rect = part.minimum_rotated_rectangle
        edges = [LineString(list(rect.exterior.coords)[i : i + 2]).length for i in range(4)] if rect.geom_type == "Polygon" else [part.length]
        seaward = max(edges) if not sea.is_empty else 0.0
    else:
        seaward = line.difference(shore).length
    reach = max(base.distance(Point(c)) for c in xy)
    return {"length_osm_m": round(line.length), "seaward_m": round(seaward), "reach_m": round(reach)}


def length_flag(kind: str, seaward_m: float, length_osm_m: float, ferry: bool = False) -> str | None:
    """Reason text when the length is outside the expected range for the structure type (None = plausible)."""
    lo, hi = EXPECTED_LENGTH_M.get(kind, (5, 1200))
    if ferry and kind == "pier":
        hi = FERRY_PIER_MAX_M
    if seaward_m > hi:
        return f"denize uzanan {round(seaward_m)} m > {kind} için beklenen üst sınır {hi} m"
    if length_osm_m > 1.5 * max(seaward_m, 1) and length_osm_m > hi:
        return f"OSM uzunluğu {round(length_osm_m)} m, denize uzanan yalnız {round(seaward_m)} m (dış hat çevresi ya da kıyı boyunca rıhtım)"
    if seaward_m < lo:
        return f"denize uzanan {round(seaward_m)} m < beklenen alt sınır {lo} m"
    return None


def build_candidate(
    s: dict, coast: Coast, places: list[dict], grid: Grid | None = None, land: Land | None = None, shared: frozenset = frozenset()
) -> dict | None:
    line = LineString(s["xy"])
    if line.length < MIN_LENGTH_M:
        return None
    pts = [Point(c) for c in s["xy"]]
    coast_tip = max(pts, key=lambda p: coast.nearest(p)[2])
    if land is not None:
        # A node shared with a shorter structure is a junction where that appendage (e.g. a mole joined to a
        # ferry pier) ends: it is the appendage's tip, so the longer structure takes its own farthest node.
        own = [p for p in pts if (p.x, p.y) not in shared] or pts
        root = min(pts, key=lambda p: land.mainland.distance(p))
        tip = max(own, key=lambda p: land.mainland.distance(p))
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
        "name_source": "osm" if s["tags"].get("name") else "generated",
        "kind": kind,
        **(lens := structure_length(s["xy"], coast, land)),
        # H2: the model uses the seaward part; the raw OSM length stays for the audit
        # (the larger of the seaward length and the tip's reach: a shore-parallel quay stays short, never the perimeter)
        "length_m": max(lens["seaward_m"], lens["reach_m"]),
        "length_flag": length_flag(kind, lens["seaward_m"], lens["length_osm_m"], ferry=bool(re.search(r"feribot|ferry|İDO|BUDO|deniz otobüs", s["tags"].get("name", ""), re.I))),
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
    """Drop candidates whose tip is within DEDUPE_M of a longer one (duplicate mapping of the same tip)."""
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
    owners: dict[tuple[float, float], list[float]] = {}
    for st in structures:
        for xy in set(st["xy"]):
            owners.setdefault(xy, []).append(LineString(st["xy"]).length)

    def junctions(st: dict) -> frozenset:
        length = LineString(st["xy"]).length
        return frozenset(xy for xy in st["xy"] if any(other < length for other in owners[xy]))

    feats = [c for s in structures if (c := build_candidate(s, coast, places, grid, land, junctions(s))) is not None and in_bbox(c)]
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


def length_audit_md(features: list[dict]) -> str:
    """H2 report: raw OSM length vs the part reaching out to sea, tip reach, flags (for a visual check on the map)."""
    rows = sorted((f["properties"] for f in features), key=lambda p: -(p.get("length_osm_m") or 0))
    flagged = [p for p in rows if p.get("length_flag")]
    out = [
        "# Yapı uzunlukları denetimi (H2)", "",
        "Otomatik üretilir: `python -m av_pipeline.spots.build_spots` (geodata.yml). Model artık **denize uzanan** uzunluğu kullanır",
        f"(kıyı çizgisinin {SHORE_BUFFER_M:.0f} m bandı ve kara dışında kalan kısım; kapalı dış hatta en küçük dönmüş dikdörtgenin uzun kenarı).",
        "Ham OSM uzunluğu kapalı yolda çevre uzunluğudur. Uzunluğun derinliğe etkisi 300 m'den sonra doyar (MODEL.md, `len_sat_m`, kanıt C).",
        "Uydu görüntüsüyle karşılaştırma otomatik yapılmaz (kural): şüphelileri OSM bağlantısından görsel kontrol edin.", "",
        f"**Şüpheli: {len(flagged)} / {len(rows)} yapı.**", "",
        "| Yapı | Tip | OSM ham (m) | Denize uzanan (m) | Uç erişimi (m) | Bayrak | OSM |", "|---|---|---|---|---|---|---|",
    ]
    for p in rows:
        osm = p["id"].replace("osm-way-", "")
        out.append(f"| {p['name']} | {p['kind']} | {p.get('length_osm_m', '—')} | {p.get('seaward_m', '—')} | {p.get('reach_m', '—')} | {p.get('length_flag') or ''} | [way/{osm}](https://www.openstreetmap.org/way/{osm}) |")
    return "\n".join(out) + "\n"


def main(argv: list[str]) -> int:
    src = Path(argv[1] if len(argv) > 1 else "data/osm/raw.json")
    dst = Path(argv[2] if len(argv) > 2 else "data/spots.geojson")
    grid = Grid.from_netcdf(argv[argv.index("--dtm") + 1]) if "--dtm" in argv else None
    land = land_xy(json.loads(Path(argv[argv.index("--land") + 1]).read_text())) if "--land" in argv else None
    raw = json.loads(src.read_text())
    fc = build(raw, grid, land)
    harbours = [{"name": f["properties"]["name"], "lon": f["geometry"]["coordinates"][0], "lat": f["geometry"]["coordinates"][1]}
                for f in map_labels(raw)["features"] if f["properties"]["kind"] == "harbour"]
    renamed = unique_names(fc["features"], harbours)
    renamed += describe_singles(fc["features"], parse(raw)[2])
    if "--habitat" in argv:
        eusm.annotate(fc["features"])
    if "--check-marine" in argv:
        check_marine(fc)
    dst.write_text(json.dumps(fc, ensure_ascii=False, indent=1) + "\n")
    (Path(__file__).resolve().parents[3] / "docs/audit/length-audit.md").write_text(length_audit_md(fc["features"]))
    ok = sum(1 for f in fc["features"] if f["properties"]["probe_ok"])
    dtm = sum(1 for f in fc["features"] if f["properties"]["probe_source"] == "dtm")
    none = sum(1 for f in fc["features"] if f["properties"]["probe_lat"] is None)
    moved = sum(1 for f in fc["features"] if f["properties"]["alt_lat"] is not None)
    print(f"{len(fc['features'])} candidates, {ok} with marine data at probe, {dtm} probes from DTM, {none} without probe, {moved} tips moved off the coastline vertex, {renamed} duplicate names made unique")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
