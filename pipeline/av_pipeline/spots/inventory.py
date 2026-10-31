"""F1: wider spot inventory → active spots added automatically when they pass the checks (no approval step).

  python -m av_pipeline.spots.inventory fetch data/osm/inventory_raw.json          # Actions (Overpass)
  python -m av_pipeline.spots.inventory build data/osm/inventory_raw.json data/spots.geojson \\
      [--dtm data/bathy/dtm.nc] [--land data/osm/land_marmara.geojson] [--habitat]

Types (docs/spots-candidates.md):
  structure    man_made=pier|breakwater|groyne|quay not already a spot (nodes too)
  harbour      harbour=*, leisure=marina, seamark:type=harbour*, amenity=ferry_terminal, leisure=slipway
  rocky        natural=bare_rock|cliff within COAST_NEAR_M of the coastline → SEG_M coastline segments
  beach        natural=beach → SEG_M coastline segments
  river_mouth  waterway=river|stream ending within MOUTH_M of the coastline
leisure=fishing marks a known fishing place: it takes the type of the shore it is on (structure if near one).
Commercial ports (named Gemport/Borusan/Roda… or landuse=port / industrial=port) are never candidates: they go to
the "erişim yasak" layer. Proposals within NEAR_EXISTING_M of a spot, or of a higher-priority proposal, are dropped.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import unary_union

from av_pipeline import BBOX
from av_pipeline.spots.build_spots import ATTRIBUTION, Coast, GENERIC_PLACES, element_xy
from av_pipeline.spots.geo import bearing, to_lonlat, to_xy

COAST_NEAR_M = 30.0
SEG_M = 400.0  # target segment; parts are split into n = round(L / SEG_M) pieces of 300–500 m
MIN_SEG_M = 120.0
MOUTH_M = 60.0
DUP_M = 25.0
COAST_MAX_M = 30.0
CAPE_M = 200.0
KNOWN_NEAR_M = 1500.0
NEAR_EXISTING_M = 150.0
NEAR_STRUCT_M = 40.0
FORBIDDEN_NAMES = re.compile(r"gemport|borusan|roda|limak|marport|gemlik liman|tüpraş|aygaz|petrol ofisi|opet|shell", re.I)
PRIORITY = {"structure": 0, "harbour": 1, "river_mouth": 2, "rocky": 3, "beach": 4}
KIND = {"structure": None, "harbour": "harbour", "river_mouth": "river_mouth", "rocky": "rocky", "beach": "beach"}
TYPE_TR = {"structure": "yapı", "harbour": "liman / balıkçı barınağı", "rocky": "kayalık kıyı", "beach": "kumsal", "river_mouth": "dere ağzı"}
STRUCT_TR = {"pier": "İskele", "breakwater": "Mendirek", "groyne": "Mahmuz", "quay": "Rıhtım"}
# The user's known places (D1): checked in the report; the OSM objects around each are listed for diagnosis.
KNOWN = ["Kurşunlu", "Gemlik", "Karacaali", "Büyükkumla", "Narlı", "Mudanya", "Kumyaka", "Eşkel"]


def build_query() -> str:
    s, w, n, e = BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"]
    b = f"{s},{w},{n},{e}"
    p = f"{s - 0.05},{w - 0.05},{n + 0.05},{e + 0.05}"
    return f"""[out:json][timeout:240];
(
  nwr["man_made"~"^(pier|breakwater|groyne|quay)$"]({b});
  nwr["leisure"~"^(marina|slipway|fishing)$"]({b});
  nwr["harbour"]({b});
  nwr["seamark:type"~"^harbour"]({b});
  nwr["amenity"="ferry_terminal"]({b});
  nwr["natural"~"^(beach|bare_rock|cliff|reef)$"]({b});
  nwr["military"]({b});
  nwr["landuse"~"^(industrial|military)$"]({b});
  node["natural"="cape"]({b});
  way["waterway"~"^(river|stream)$"]({b});
  nwr["landuse"="port"]({b});
  nwr["industrial"="port"]({b});
  nwr["name"~"gemport|roda|borusan|limak|marport",i]({b});
  nwr["operator"~"gemport|roda|borusan|limak|marport",i]({b});
  way["natural"="coastline"]({p});
  node["place"~"^(town|village|suburb|neighbourhood|quarter|hamlet)$"]({b});
);
out geom;"""


def norm(s: str | None) -> str:
    return (s or "").lower().replace("ı", "i").replace("i̇", "i").replace("ş", "s").replace("ğ", "g").replace("ü", "u").replace("ö", "o").replace("ç", "c")


def geom(el: dict):
    """Planar shapely geometry of an Overpass element (out geom): Point, LineString, Polygon or a union."""
    if el["type"] == "node":
        return Point(to_xy(el["lon"], el["lat"]))
    if el["type"] == "way":
        xy = element_xy(el)
        if len(xy) >= 4 and xy[0] == xy[-1]:
            return Polygon(xy)
        return LineString(xy) if len(xy) >= 2 else (Point(xy[0]) if xy else None)
    parts = []
    for m in el.get("members", []):
        xy = [to_xy(g["lon"], g["lat"]) for g in m.get("geometry", []) or []]
        if len(xy) >= 2:
            parts.append(LineString(xy))
    if not parts:
        return None
    u = unary_union(parts)
    poly = Polygon(u.convex_hull.exterior) if u.convex_hull.geom_type == "Polygon" else u
    return poly


def ref(el: dict) -> str:
    return f"{el['type']}/{el['id']}"


PORTISH = ("harbour", "industrial", "man_made", "seamark:type", "waterway", "port")


def exclusion(tags: dict) -> str | None:
    """F1 b): areas where a spot is never added (reason text), besides commercial ports (is_forbidden)."""
    if "military" in tags or tags.get("landuse") == "military":
        return "askeri alan"
    if tags.get("landuse") == "industrial" or tags.get("harbour") == "industrial":
        return "sanayi alanı"
    return None


def exclusion_reason(pt, tags: dict, coast_d: float, forbidden: list[dict], excl_zones: list) -> str | None:
    """F1 checks a) and b); None = passes."""
    if coast_d > COAST_MAX_M:
        return f"kıyı çizgisine {round(coast_d)} m (> {COAST_MAX_M:.0f} m): fiziksel kıyı nesnesi değil"
    if tags.get("access") in ("private", "no"):
        return f"OSM access={tags['access']}"
    for f in forbidden:
        if f["geom"].buffer(100).contains(pt):
            return f"ticari liman sahası ({f['name']})"
    for z, why, r in excl_zones:
        if z.contains(pt):
            return f"{why} ({r})"
    return None


def is_forbidden(tags: dict) -> bool:
    """Commercial port: tagged as one, or a company name on a port/industrial/structure object (a school or
    shop named after the company is not a port)."""
    if tags.get("landuse") == "port" or tags.get("industrial") == "port":
        return True
    portish = tags.get("landuse") in ("industrial", "port") or any(k in tags for k in PORTISH)
    return portish and "amenity" not in tags and bool(FORBIDDEN_NAMES.search(tags.get("name", "") + " " + tags.get("operator", "")))


def classify(tags: dict) -> str | None:
    if tags.get("man_made") in STRUCT_TR:
        return "structure"
    if "harbour" in tags or tags.get("leisure") in ("marina", "slipway") or str(tags.get("seamark:type", "")).startswith("harbour") or tags.get("amenity") == "ferry_terminal":
        return "harbour"
    if tags.get("natural") in ("bare_rock", "cliff", "cape", "reef"):
        return "rocky"
    if tags.get("natural") == "beach":
        return "beach"
    if tags.get("waterway") in ("river", "stream"):
        return "river_mouth"
    if tags.get("leisure") == "fishing":
        return "fishing"
    return None


def segments(coast: Coast, g, near_m: float = COAST_NEAR_M) -> list[LineString]:
    """Coastline pieces within near_m of g, split into pieces of about SEG_M (300–500 m); short ones dropped."""
    zone = g.buffer(near_m)
    out: list[LineString] = []
    for line in coast.lines:
        if not line.intersects(zone):
            continue
        part = line.intersection(zone)
        parts = list(part.geoms) if isinstance(part, MultiLineString) or hasattr(part, "geoms") else [part]
        for p in parts:
            if not isinstance(p, LineString) or p.length < MIN_SEG_M:
                continue
            n = max(1, round(p.length / SEG_M))
            step = p.length / n
            for k in range(n):
                a, b = k * step, (k + 1) * step
                pts = [p.interpolate(a)] + [Point(c) for c in p.coords if a < p.project(Point(c)) < b] + [p.interpolate(b)]
                out.append(LineString(pts))
    return out


def struct_point(g, coast: Coast) -> tuple[Point, float]:
    """Fishing point and length of a structure: tip = vertex farthest from the coastline (quays: midpoint)."""
    if isinstance(g, Point):
        return g, 0.0
    line = g.exterior if isinstance(g, Polygon) else g
    pts = [Point(c) for c in line.coords]
    return max(pts, key=lambda p: coast.nearest(p)[2]), line.length


def nearest_place(xy: tuple[float, float], places: list[dict], max_m: float = 4000.0) -> tuple[str | None, float | None]:
    named = [p for p in places if p["name"] and p["name"] not in GENERIC_PLACES]
    if not named:
        return None, None
    p = min(named, key=lambda q: math.dist(q["xy"], xy))
    d = math.dist(p["xy"], xy)
    return (p["name"], round(d)) if d <= max_m else (None, None)


COMPASS = ["kuzeyi", "kuzeydoğusu", "doğusu", "güneydoğusu", "güneyi", "güneybatısı", "batısı", "kuzeybatısı"]


def access_estimate(typ: str, tags: dict, place_m: float | None) -> tuple[str, str]:
    """(access value, reason). The user's field knowledge always overrides (seed keeps an existing value)."""
    if tags.get("access") in ("private", "no"):
        return "belirsiz", "OSM access=private"
    if tags.get("leisure") == "marina" and not re.search(r"iskele", tags.get("name", ""), re.I):
        return "belirsiz", "marina: giriş kısıtlı olabilir"
    if tags.get("amenity") == "ferry_terminal":
        return "kisitli_feribot", "feribot iskelesi: sefer saatlerinde kısıtlı olabilir"
    if typ in ("rocky",):
        return "belirsiz", "kayalık: yürüyüş yolu bilinmiyor"
    if place_m is not None and place_m <= 1500:
        return "acik", f"yerleşime {place_m} m"
    return "belirsiz", "yerleşimden uzak (> 1,5 km)"


def build_inventory(raw: dict, existing: list[dict]) -> tuple[list[dict], list[dict], dict]:
    """Proposals (point features without depth features yet), forbidden areas, diagnostics."""
    coast_lines, places, els = [], [], []
    for el in raw.get("elements", []):
        t = el.get("tags", {})
        if el["type"] == "node" and "place" in t:
            places.append({"name": t.get("name"), "xy": to_xy(el["lon"], el["lat"])})
        elif el["type"] == "way" and t.get("natural") == "coastline":
            xy = element_xy(el)
            if len(xy) >= 2:
                coast_lines.append(LineString(xy))
        else:
            els.append(el)
    coast = Coast(coast_lines)
    if not coast.lines:
        raise ValueError("no coastline in Overpass data")
    existing_xy = {f["properties"]["id"]: to_xy(*f["geometry"]["coordinates"]) for f in existing}

    forbidden, items = [], []
    excl_zones: list = []
    for el in els:
        t = el.get("tags", {})
        g = geom(el)
        if g is None or g.is_empty:
            continue
        if is_forbidden(t):
            forbidden.append({"name": t.get("name") or t.get("operator") or "liman sahası", "geom": g, "ref": ref(el), "tags": {k: v for k, v in t.items() if k in ("name", "operator", "landuse", "industrial", "harbour")}})
            continue
        ex = exclusion(t)
        if ex and not isinstance(g, Point):
            excl_zones.append((g.buffer(30), ex, ref(el)))
            if not classify(t):
                continue
        typ = classify(t)
        if typ:
            items.append((typ, el, t, g))
    zones = [f["geom"].buffer(100) for f in forbidden] + [z for z, _, _ in excl_zones]
    structs = [g for typ, _, _, g in items if typ == "structure"]

    props_list: list[dict] = []
    seen_struct = {k.split("-")[-1] for k in existing_xy}
    for typ, el, t, g in items:
        if typ == "fishing":
            typ = "structure" if any(s.distance(g) <= NEAR_STRUCT_M for s in structs) else "rocky"
            if typ == "structure":
                continue  # the structure itself is (or becomes) the candidate
        if typ == "structure":
            if str(el["id"]) in seen_struct:
                continue
            p, length = struct_point(g, coast)
            if not isinstance(g, Point) and length < 15:
                continue
            pts = [(p, length, None)]
        elif typ == "harbour":
            c = g.centroid if not isinstance(g, Point) else g
            pts = [(c, None, None)]
        elif typ == "river_mouth":
            ends = [Point(g.coords[0]), Point(g.coords[-1])] if isinstance(g, LineString) else []
            pts = []
            for e in ends:
                line, q, d = coast.nearest(e)
                if d <= MOUTH_M:
                    pts.append((q, None, None))
                    break
        else:
            # capes: the coastline within CAPE_M of the point (the headland itself), others: within COAST_NEAR_M
            near = CAPE_M if t.get("natural") == "cape" else COAST_NEAR_M
            pts = [(seg.interpolate(0.5, normalized=True), round(seg.length), seg) for seg in segments(coast, g, near)]
        coast_d = min(ln.distance(g) for ln in coast.lines)  # F1 a): the OSM object itself reaches the coastline
        for k, (pt, length, seg) in enumerate(pts):
            line, q, _ = coast.nearest(pt)
            normal = coast.smoothed_normal(line, q)
            place, place_m = nearest_place((pt.x, pt.y), places)
            access, why = access_estimate(typ, t, place_m)
            kind = t["man_made"] if typ == "structure" else KIND[typ]
            pid = f"osm-{el['type']}-{el['id']}" + (f"-{k + 1}" if len(pts) > 1 or typ in ("rocky", "beach") else "")
            props_list.append({
                "_xy": (pt.x, pt.y), "_typ": typ, "_inside_forbidden": any(z.contains(pt) for z in zones), "_coast_d": coast_d,
                "_why_out": exclusion_reason(pt, t, coast_d, forbidden, excl_zones),
                "id": pid, "osm_name": t.get("name"), "kind": kind, "type": typ, "type_tr": TYPE_TR[typ],
                "length_m": round(length) if length else None, "shore_normal_deg": round(normal, 1), "place": place, "place_m": place_m,
                "access": access, "access_note": why, "osm": [ref(el)], "osm_tags": {k2: v for k2, v in t.items() if k2 in ("man_made", "harbour", "leisure", "natural", "waterway", "amenity", "seamark:type", "name", "access")},
            })

    # F1: no merging. A point is dropped only if it duplicates a spot (≤ DUP_M) or fails a check (reasons kept);
    # same-type points within NEAR_EXISTING_M stay separate and link to each other ("yakın mera").
    kept: list[dict] = []
    excluded: list[dict] = []
    dropped: dict[str, int] = {"duplicate": 0, "excluded": 0}
    for pr in sorted(props_list, key=lambda p: (PRIORITY[p["_typ"]], -(p["length_m"] or 0), p["id"])):
        if pr["_why_out"]:
            dropped["excluded"] += 1
            excluded.append({"id": pr["id"], "type": pr["type_tr"], "place": pr["place"], "osm": pr["osm"], "reason": pr["_why_out"], "lonlat": [round(v, 6) for v in to_lonlat(*pr["_xy"])]})
            continue
        if any(math.dist(pr["_xy"], xy) < DUP_M for xy in existing_xy.values()) or any(math.dist(pr["_xy"], k["_xy"]) < DUP_M for k in kept):
            dropped["duplicate"] += 1
            continue
        kept.append(pr)
    for pr in kept:
        pr["near"] = [k["id"] for k in kept if k is not pr and k["kind"] == pr["kind"] and math.dist(pr["_xy"], k["_xy"]) < NEAR_EXISTING_M]

    known_missing = []
    for name in KNOWN:
        pl = [p for p in places if norm(p["name"]) == norm(name)]
        if not pl:
            known_missing.append(f"{name}: OSM'de yerleşim noktası yok")
            continue
        xy = pl[0]["xy"]
        if any(math.dist(xy, k["_xy"]) <= KNOWN_NEAR_M for k in kept) or any(math.dist(xy, e) <= KNOWN_NEAR_M for e in existing_xy.values()):
            continue
        known_missing.append(f"{name}: yakında OSM'de fiziksel kıyı nesnesi yok; otomatik eklenmedi (haritadan elle eklenebilir)")
    name_props(kept, places)
    feats = []
    for pr in sorted(kept, key=lambda p: p["id"]):
        lon, lat = to_lonlat(*pr["_xy"])
        props = {k: v for k, v in pr.items() if not k.startswith("_")}
        props.update(status="candidate", auto_added=True, source=ATTRIBUTION, name_source="osm" if pr["osm_name"] and pr["_typ"] in ("structure", "harbour") else "generated")
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, "properties": props})

    forb = []
    merged: dict[str, dict] = {}
    for f in forbidden:
        m = merged.get(f["name"])
        if m:
            m["geom"] = m["geom"].union(f["geom"])
            m["ref"] += f", {f['ref']}"
        else:
            merged[f["name"]] = dict(f)
    for f in merged.values():
        g = f["geom"] if isinstance(f["geom"], Polygon) else f["geom"].buffer(60).convex_hull
        ring = [list(map(lambda v: round(v, 6), to_lonlat(x, y))) for x, y in g.exterior.coords] if isinstance(g, Polygon) else []
        if ring:
            forb.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}, "properties": {"name": f["name"], "osm": f["ref"], **f["tags"]}})
    diag = diagnostics(raw, places, feats, existing)
    diag["dropped"] = dropped
    diag["known_missing"] = known_missing
    diag["excluded"] = excluded
    return feats, forb, diag


def name_props(kept: list[dict], places: list[dict]) -> None:
    """Readable unique names: OSM name for structures/harbours, else '<place> <type>' with a compass hint and number."""
    taken: dict[str, int] = {}
    for pr in sorted(kept, key=lambda p: p["id"]):
        typ = pr["_typ"]
        if pr["id"].startswith("known-"):
            base = f"{pr['place']} kıyısı (konum tahmini)"
        elif pr["osm_name"] and typ in ("structure", "harbour"):
            base = pr["osm_name"]
        elif typ == "rocky" and pr["osm_name"]:
            base = pr["osm_name"]  # a named cape
        elif typ == "river_mouth" and pr["osm_name"]:
            base = f"{pr['osm_name']} ağzı"
        else:
            what = STRUCT_TR.get(pr["kind"], "Yapı") if typ == "structure" else {"harbour": "Liman", "rocky": "Kayalık kıyı", "beach": "Kumsal", "river_mouth": "Dere ağzı"}[typ]
            base = f"{what} ({pr['place']})" if pr["place"] else what
            if pr["place"] and typ in ("rocky", "beach") and not pr["id"].startswith("known-"):
                pxy = next(p["xy"] for p in places if p["name"] == pr["place"])
                b = bearing(pxy, pr["_xy"])
                base = f"{what} ({pr['place']} {COMPASS[round(b / 45) % 8]})"
        taken[base] = taken.get(base, 0) + 1
        pr["name"] = base if taken[base] == 1 else f"{base} {taken[base]}"


def diagnostics(raw: dict, places: list[dict], feats: list[dict], existing: list[dict]) -> dict:
    """For each of the user's known places: place node, proposals and existing spots within 2.5 km, OSM objects within 1 km."""
    out = {}
    for name in KNOWN:
        pl = [p for p in places if norm(p["name"]) == norm(name)]
        if not pl:
            out[name] = {"place": None}
            continue
        xy = pl[0]["xy"]
        near = lambda f, r: math.dist(to_xy(*f["geometry"]["coordinates"]), xy) <= r  # noqa: E731
        objs = []
        for el in raw.get("elements", []):
            t = el.get("tags", {})
            if "place" in t or t.get("natural") == "coastline":
                continue
            g = geom(el)
            if g is not None and not g.is_empty and g.distance(Point(xy)) <= 1000:
                objs.append({"ref": ref(el), "tags": {k: v for k, v in t.items() if k in ("man_made", "harbour", "leisure", "natural", "waterway", "amenity", "name", "seamark:type", "landuse")}})
        out[name] = {
            "place": [round(v, 5) for v in to_lonlat(*xy)],
            "proposals": [f"{f['properties']['id']} {f['properties']['name']} ({f['properties']['type_tr']})" for f in feats if near(f, 2500)],
            "existing": [f"{f['properties']['id']} {f['properties']['name']}" for f in existing if near(f, 2500)],
            "osm_within_1km": objs[:40],
        }
    return out


def enrich(feats: list[dict], grid=None, land=None) -> None:  # pragma: no cover - DTM/land I/O, Actions only
    from av_pipeline.bathy.sample import dtm_normal, features, sea_probe
    from av_pipeline.spots.fetch_rose import rose_km

    for f in feats:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        x, y = to_xy(lon, lat)
        normal = p["shore_normal_deg"]
        p.update(probe_lat=None, probe_lon=None, probe_ok=None, probe_source=None, normal_source="osm", osm_normal_deg=normal, depth_200m=None, slope_pct=None,
                 max_depth_100m=None, profile=None, has_light=None, tip_source="inventory", alt_lat=None, alt_lon=None,
                 fetch_km=rose_km(land.full, x, y) if land is not None else None)
        if grid is not None:
            if (dn := dtm_normal(grid, lat, lon)) is not None:
                normal = dn[0]
                p.update(shore_normal_deg=round(normal, 1), normal_source="dtm")
            if (pr := sea_probe(grid, lat, lon, normal)) is not None:
                p.update(probe_lat=round(pr[0], 5), probe_lon=round(pr[1], 5), probe_source="dtm")
            p.update(features(grid, lat, lon, normal))


def report_md(feats: list[dict], forb: list[dict], diag: dict) -> str:
    by_type: dict[str, int] = {}
    by_place: dict[str, int] = {}
    for f in feats:
        p = f["properties"]
        by_type[p["type_tr"]] = by_type.get(p["type_tr"], 0) + 1
        by_place[p["place"] or "—"] = by_place.get(p["place"] or "—", 0) + 1
    lines = [
        "# Otomatik eklenen meralar (F1)", "",
        "Otomatik üretilir: `python -m av_pipeline.spots.inventory build` (geodata.yml). Onay adımı yok: kontrollerden geçen",
        "her yer doğrudan aktif mera olur ve v2 modelle puanlanır; kartta \"otomatik eklendi — sahada doğrulanmadı\" yazar.",
        "Yönetici bir merayı herkesten gizleyebilir ve `/admin/` \"Gizlenenler\" listesinden geri alabilir. Kaynak © OpenStreetMap katkıcıları (ODbL).",
        "",
        "**Kontroller:** a) OSM nesnesi kıyı çizgisine ≤ 30 m; b) `access=private|no`, askeri alan, sanayi alanı, ticari liman ve",
        "yönetici yasak alanları içinde değil; c) kumsala md. 16/5 tarihli uyarı rozeti (kesin yasak değil); d) 150 m içindeki aynı",
        "tip meralar ayrı kalır, birbirine \"yakın mera\" bağlantısı alır. Yalnız aynı noktanın kopyası (≤ 25 m) atılır.",
        "",
        f"**Eklenen: {len(feats)} mera.** Elenen: {len(diag.get('excluded', []))}. Ticari liman (erişim yasak katmanı): {len(forb)}.", "",
        "| Tip | Eklenen |", "|---|---|", *[f"| {k} | {v} |" for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])], "",
        "| Yerleşim | Eklenen |", "|---|---|", *[f"| {k} | {v} |" for k, v in sorted(by_place.items(), key=lambda kv: (-kv[1], kv[0]))], "",
        "## Yeni tipler için istavrit tercih değerleri (kanıt C, literatür yok)", "",
        "| Tip | Yapı terimi | Lamba önseli | Derinlik önseli |", "|---|---|---|---|",
        "| rıhtım (quay) | iskele ile aynı (0.75 × uzunluk) | 0.5 | iskele formülü |",
        "| liman / balıkçı barınağı | 0.80 | 0.6 | 3 m |",
        "| kayalık kıyı | 0.80 (doğal kaya) | 0.1 | 2.5 m |",
        "| dere ağzı | 0.60 | 0.15 | 1 m |",
        "| kumsal | 0.45 | 0.2 | 1.2 m |", "",
        "Kıyı tiplerinde yapı uzunluğu yoktur; uzunluk çarpanı 150 m'lik bir yapınınkine sabitlenir. Değerler sezgiseldir",
        "(istavrit yapı/sert zemin ve ışık çevresinde toplanır; kumsalda açık su). Av günlüğüyle kalibre edilecek.", "",
        "## Adaylar", "", "| Ad | Tip | Yerleşim | Erişim tahmini | OSM |", "|---|---|---|---|---|",
    ]
    for f in sorted(feats, key=lambda f: (f["properties"]["place"] or "~", f["properties"]["type"], f["properties"]["name"])):
        p = f["properties"]
        lines.append(f"| {p['name']} | {p['type_tr']} | {p['place'] or '—'} | {p['access']} ({p['access_note']}) | {', '.join(p['osm'])} |")
    lines += ["", "## Erişim yasak (ticari liman / sanayi)", "", "| Ad | OSM |", "|---|---|", *[f"| {f['properties']['name']} | {f['properties']['osm']} |" for f in forb]]
    reasons: dict[str, int] = {}
    for e in diag.get("excluded", []):
        r = e["reason"].split(" (")[0].split(":")[0]
        reasons[r] = reasons.get(r, 0) + 1
    lines += ["", "## Elenen yerler", "", "| Neden | Sayı |", "|---|---|", *[f"| {k} | {v} |" for k, v in sorted(reasons.items(), key=lambda kv: -kv[1])], "",
              "| Yer | Tip | Yerleşim | Neden | OSM |", "|---|---|---|---|---|",
              *[f"| {e['id']} | {e['type']} | {e['place'] or '—'} | {e['reason']} | {', '.join(e['osm'])} |" for e in diag.get("excluded", [])]]
    lines += ["", "## Neden Karacaali ve Büyükkumla iskeleleri listede yoktu?", "",
              "İkisi de OpenStreetMap'te iskele *yolu* (`man_made=pier`) olarak değil, adı \"… İskelesi\" olan tek bir **nokta**",
              "(`leisure=marina`) olarak çizilmiş. Harita etiket katmanı adlı liman/marina noktalarını gösterdiği için haritada",
              "göründüler; mera listesi ise yalnız `man_made=pier|breakwater|groyne` **yollarından** üretiliyordu (uç noktası ve",
              "uzunluk için çizgi gerekir). Envanter nokta ve alan nesnelerini de alır; ikisi artık mera.", ""]
    lines += ["## Bilinen yerler (kullanıcı listesi)", ""]
    lines += [f"- {m}" for m in diag.get("known_missing", [])]
    for k, v in diag.items():
        if k in ("dropped", "known_missing", "excluded"):
            continue
        if not v.get("place"):
            lines.append(f"- **{k}:** OSM'de yerleşim noktası yok.")
            continue
        lines.append(f"- **{k}:** {len(v['existing'])} mevcut mera, {len(v['proposals'])} aday (≤ 2,5 km). " + "; ".join(v["proposals"][:6]))
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:  # pragma: no cover - CLI
    if argv[1] == "fetch":
        from av_pipeline.spots.fetch_osm import fetch

        Path(argv[2]).write_text(json.dumps(fetch(build_query()), ensure_ascii=False))
        return 0
    raw = json.loads(Path(argv[2]).read_text())
    dst = Path(argv[3])
    fc = json.loads(dst.read_text())
    existing = [f for f in fc["features"] if f["properties"].get("status") != "proposed"]
    feats, forb, diag = build_inventory(raw, existing)
    grid = land = None
    if "--dtm" in argv:
        from av_pipeline.bathy.grid import Grid

        grid = Grid.from_netcdf(argv[argv.index("--dtm") + 1])
    if "--land" in argv:
        from av_pipeline.spots.build_spots import land_xy

        land = land_xy(json.loads(Path(argv[argv.index("--land") + 1]).read_text()))
    enrich(feats, grid, land)
    if "--habitat" in argv:
        from av_pipeline.habitat import eusm

        eusm.annotate(feats)
    fc["features"] = existing + feats
    dst.write_text(json.dumps(fc, ensure_ascii=False, indent=1) + "\n")
    root = Path(__file__).resolve().parents[3]
    pub = [{"type": "Feature", "geometry": f["geometry"], "properties": {k: f["properties"][k] for k in ("id", "name", "type_tr", "kind", "place", "access", "osm")}} for f in feats]
    (root / "apps/web/public/tiles/candidates.geojson").write_text(json.dumps({"type": "FeatureCollection", "attribution": ATTRIBUTION, "features": pub}, ensure_ascii=False) + "\n")
    (root / "apps/web/public/tiles/forbidden.geojson").write_text(json.dumps({"type": "FeatureCollection", "attribution": ATTRIBUTION, "features": forb}, ensure_ascii=False) + "\n")
    (root / "docs/audit/inventory.json").write_text(json.dumps(diag, ensure_ascii=False, indent=1) + "\n")
    (root / "docs/spots-candidates.md").write_text(report_md(feats, forb, diag))
    print(f"inventory: {len(feats)} proposals, {len(forb)} forbidden areas, dropped {diag['dropped']}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv))
