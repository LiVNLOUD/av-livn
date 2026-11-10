"""Faz V0: real data for the design mockups (docs/design/mockups/data/). Run with the pipeline venv:
  pipeline/.venv/bin/python docs/design/build-mockup-data.py
- map.json: land (OSM land polygons) and five depth tones + contours from the site's own EMODnet-derived
  bathy.pmtiles, clipped to the Gemlik–Mudanya box and projected to an SVG viewBox (no invented detail: the tiles are
  the ~115 m DTM, simplified for drawing);
- snapshot.json: live API snapshot (spots, plan windows, the selected spot's hourly series, weather grid) with its
  time, so every number on a mockup is traceable."""

from __future__ import annotations

import datetime as dt
import gzip
import json
import math
import sys
import urllib.request
from pathlib import Path

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/design/mockups/data"
BBOX = (28.50, 40.30, 29.22, 40.58)  # W S E N
W = 1200
LAT0 = (BBOX[1] + BBOX[3]) / 2
KX = math.cos(math.radians(LAT0))
H = round(W * (BBOX[3] - BBOX[1]) / ((BBOX[2] - BBOX[0]) * KX))
TONES = [(0, 2), (2, 5), (5, 10), (10, 30), (30, 1e9)]
CONTOURS = (5, 10, 20, 50)
BASE = "https://av.livn.tr"
UA = {"User-Agent": "av-livn-design-mockups/0.1 (+https://av.livn.tr)"}


def px(lon: float, lat: float) -> tuple[float, float]:
    return ((lon - BBOX[0]) / (BBOX[2] - BBOX[0]) * W, (BBOX[3] - lat) / (BBOX[3] - BBOX[1]) * H)


def path_d(geom) -> str:
    """SVG path data (1 decimal) for polygons / lines in lon/lat."""
    out = []
    def ring(coords, close):
        pts = [px(x, y) for x, y in coords]
        if len(pts) < 2:
            return ""
        return "M" + "L".join(f"{a:.1f},{b:.1f}" for a, b in pts) + ("Z" if close else "")
    gs = getattr(geom, "geoms", [geom])
    for g in gs:
        if g.geom_type == "Polygon":
            out.append(ring(g.exterior.coords, True))
            out += [ring(i.coords, True) for i in g.interiors]
        elif g.geom_type == "LineString":
            out.append(ring(g.coords, False))
    return "".join(out)


def tiles(z: int):
    n = 2**z
    def tx(lon): return int((lon + 180) / 360 * n)
    def ty(lat): return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    for x in range(tx(BBOX[0]), tx(BBOX[2]) + 1):
        for y in range(ty(BBOX[3]), ty(BBOX[1]) + 1):
            yield x, y


def bathy(z: int = 11):
    f = open(ROOT / "apps/web/public/tiles/bathy.pmtiles", "rb")
    r = Reader(MmapSource(f))
    n = 2**z
    tones = {i: [] for i in range(len(TONES))}
    cont = {d: [] for d in CONTOURS}
    for x, y in tiles(z):
        t = r.get(z, x, y)
        if not t:
            continue
        d = mapbox_vector_tile.decode(gzip.decompress(t) if t[:2] == b"\x1f\x8b" else t, default_options={"y_coord_down": True})
        def to_ll(gx, gy, ext):
            lon = (x + gx / ext) / n * 360 - 180
            lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + gy / ext) / n))))
            return lon, lat
        for layer, store in (("bands", "t"), ("contours", "c")):
            if layer not in d:
                continue
            ext = d[layer]["extent"]
            for ft in d[layer]["features"]:
                g = transform(lambda a, b, ext=ext: to_ll(a, b, ext), shape(ft["geometry"]))
                p = ft["properties"]
                if store == "t":
                    i = next(k for k, (lo, hi) in enumerate(TONES) if p["dmin"] >= lo and p["dmin"] < hi)
                    tones[i].append(g.buffer(0))
                elif p.get("depth") in cont:
                    cont[p["depth"]].append(g)
    clip = box(*BBOX)
    t_out = []
    for i, gs in tones.items():
        if gs:
            g = unary_union(gs).intersection(clip).simplify(0.0006)
            t_out.append({"tone": i + 1, "range_m": list(TONES[i]), "d": path_d(g)})
    c_out = []
    for dpt, gs in cont.items():
        if gs:
            g = unary_union(gs).intersection(clip).simplify(0.0006)
            c_out.append({"depth": dpt, "d": path_d(g)})
    return t_out, c_out


def land():
    gj = json.loads((ROOT / "data/osm/land_marmara.geojson").read_text())
    clip = box(*BBOX).buffer(0.01)
    g = unary_union([shape(f["geometry"]).buffer(0) for f in gj["features"]]).intersection(clip).simplify(0.0004)
    return path_d(g)


def get(path: str):
    with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=60) as r:
        return json.load(r)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    t_out, c_out = bathy()
    if "--map-only" in sys.argv:
        snap = json.loads((OUT / "snapshot.json").read_text())
        for s in snap["spots"]["spots"]:
            s["xy"] = [round(v, 1) for v in px(s["lon"], s["lat"])]
        (OUT / "snapshot.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))
    (OUT / "map.json").write_text(json.dumps({"bbox": BBOX, "w": W, "h": H, "land": land(), "tones": t_out, "contours": c_out,
                                               "source": "OSM kara poligonu; EMODnet DTM 2024 (~115 m) türevi bathy.pmtiles, çizim için sadeleştirildi"}, separators=(",", ":")))
    if "--map-only" in sys.argv:  # re-project the existing snapshot instead of taking a new one
        print(f"map {W}×{H} (snapshot kept)")
        return
    spots = get("/api/spots")
    win = get("/api/windows")
    grid = get("/api/grid/wx")
    spread = get("/api/grid/spread")
    pick = win["plan"]["bursa"]["today"]["all"]["windows"] or win["plan"]["bursa"]["all"]["windows"]
    ids = list(dict.fromkeys([w["spot_id"] for w in pick][:4]))
    details = {i: get(f"/api/spots/{i}?model=v2") for i in ids}
    for s in spots["spots"]:
        s["xy"] = [round(v, 1) for v in px(s["lon"], s["lat"])]
    snap = {"taken_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "base": BASE, "spots": spots, "windows": win, "grid_wx": grid,
            "spread_cells": [{k: c[k] for k in ("id", "lat", "lon", "w", "g")} for c in spread.get("cells", [])], "details": details}
    (OUT / "snapshot.json").write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))
    print(f"map {W}×{H}, tones {len(t_out)}, contours {len(c_out)}; snapshot {snap['taken_at']} spots {len(spots['spots'])} picks {ids}")


DOSSIER_IDS = ["osm-way-1073087871-1", "osm-way-483965349"]  # Kordon (Ömerbey Mah. güneydoğusu) — has Mapillary; Tirilye İskelesi — no photo


def dossier() -> None:
    """Kıyı dosyası data for two spots: local land/structure geometry (metres around the spot), a DTM transect along the
    shore normal (bands → depth range per sample), the Mapillary record, the fetch rose. Only stored data; nothing made up."""
    snap = json.loads((OUT / "snapshot.json").read_text())
    spots = {s["id"]: s for s in snap["spots"]["spots"]}
    mapi = json.loads((ROOT / "apps/web/public/tiles/mapillary.json").read_text())
    # 16-direction fetch from the OSM land polygon, for all spots (pipeline/av_pipeline/spots/fetch_rose.py → data/spots.geojson);
    # docs/audit/fetch_rose.json was an old 16-spot audit run and is not used here.
    feats = {f["properties"]["id"]: f["properties"] for f in json.loads((ROOT / "data/spots.geojson").read_text())["features"]}
    with_rose = sum(1 for p in feats.values() if p.get("fetch_km") and len(p["fetch_km"]) == 16)
    print(f"fetch rose: {with_rose}/{len(feats)} spots")
    rose = {sid: {"rose": [{"dir": k * 22.5, "osm_km": km} for k, km in enumerate(p["fetch_km"])]} for sid, p in feats.items() if p.get("fetch_km")}
    osm = {e["id"]: e for e in json.loads((ROOT / "docs/audit/osm_structures.json").read_text())["elements"]}
    landgj = json.loads((ROOT / "data/osm/land_marmara.geojson").read_text())
    land_all = unary_union([shape(f["geometry"]).buffer(0) for f in landgj["features"]])
    z = 13
    r = Reader(MmapSource(open(ROOT / "apps/web/public/tiles/bathy.pmtiles", "rb")))
    n = 2 ** z
    out = {}
    for sid in DOSSIER_IDS:
        sp = spots[sid]
        lat0, lon0 = sp["lat"], sp["lon"]
        mx = 111320 * math.cos(math.radians(lat0))
        my = 110540
        to_m = lambda lon, lat: ((lon - lon0) * mx, (lat0 - lat) * my)  # noqa: E731 — x east, y south (SVG)
        R = 450
        win = box(lon0 - R / mx, lat0 - R / my, lon0 + R / mx, lat0 + R / my)
        land = land_all.intersection(win)
        def dpath(g):
            parts = []
            for gg in getattr(g, "geoms", [g]):
                if gg.geom_type == "Polygon":
                    for ring in [gg.exterior, *gg.interiors]:
                        parts.append("M" + "L".join(f"{a:.1f},{b:.1f}" for a, b in (to_m(x, y) for x, y in ring.coords)) + "Z")
                elif gg.geom_type == "LineString":
                    parts.append("M" + "L".join(f"{a:.1f},{b:.1f}" for a, b in (to_m(x, y) for x, y in gg.coords)))
            return "".join(parts)
        # bathy bands in the window (z13 tiles), kept with depth range
        bands = []
        tx0, tx1 = int((win.bounds[0] + 180) / 360 * n), int((win.bounds[2] + 180) / 360 * n)
        ty = lambda la: int((1 - math.asinh(math.tan(math.radians(la))) / math.pi) / 2 * n)  # noqa: E731
        for x in range(tx0, tx1 + 1):
            for y in range(ty(win.bounds[3]), ty(win.bounds[1]) + 1):
                t = r.get(z, x, y)
                if not t:
                    continue
                d = mapbox_vector_tile.decode(gzip.decompress(t) if t[:2] == b"\x1f\x8b" else t, default_options={"y_coord_down": True})
                if "bands" not in d:
                    continue
                ext = d["bands"]["extent"]
                def ll(gx, gy, x=x, y=y, ext=ext):
                    return (x + gx / ext) / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + gy / ext) / n))))
                for ft in d["bands"]["features"]:
                    g = transform(ll, shape(ft["geometry"])).buffer(0)
                    bands.append((g, ft["properties"]["dmin"], ft["properties"]["dmax"]))
        # transect along the seaward shore normal, 0–400 m every 20 m
        nrm = math.radians(sp["shore_normal_deg"] or 0)
        tr = []
        for k in range(0, 21):
            dist = k * 20
            lon = lon0 + math.sin(nrm) * dist / mx
            lat = lat0 + math.cos(nrm) * dist / my
            pt = Point(lon, lat)
            if land_all.contains(pt):
                tr.append({"m": dist, "land": True})
                continue
            hit = next(((a, b) for g, a, b in bands if g.contains(pt)), None)
            tr.append({"m": dist, "dmin": hit[0] if hit else None, "dmax": hit[1] if hit else None})
        tone = []
        for g, a, b in bands:
            gi = g.intersection(win)
            if not gi.is_empty:
                tone.append({"dmin": a, "dmax": b, "d": dpath(gi.simplify(0.00002))})
        struct = None
        if sid.startswith("osm-way-") and int(sid.split("-")[2]) in osm:
            e = osm[int(sid.split("-")[2])]
            struct = {"tags": e["tags"], "d": "M" + "L".join(f"{a:.1f},{b:.1f}" for a, b in (to_m(lo, la) for la, lo in e["geometry"]))}
        m = mapi["spots"].get(sid, {})
        out[sid] = {"name": sp["name"], "kind": sp["kind"], "lat": lat0, "lon": lon0, "shore_normal_deg": sp["shore_normal_deg"],
                    "length_m": sp.get("length_m"), "depth_200m": sp.get("depth_200m"), "access": sp.get("access"), "lamp_known": sp.get("lamp_known"),
                    "land": dpath(land.simplify(0.00002)), "bands": tone, "transect": tr, "structure": struct,
                    "mapillary": {"license": mapi["license"], "found": m.get("found", 0), "facing": m.get("facing", 0),
                                  "images": [{k: v for k, v in im.items()} for im in m.get("selected", [])[:3]]},
                    "rose": rose.get(sid, {}).get("rose")}
    # suitability at the mockup's selected hour (V0b C3): from the snapshot where the spot has a series, else a live read
    win = snap["windows"]["plan"]["bursa"]["today"]["all"]["windows"][0]["peak"]
    for sid, v in out.items():
        det = snap["details"].get(sid)
        src = "snapshot"
        if not det:
            det, src = get(f"/api/spots/{sid}?model=v2"), "live " + dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
        row = next((h for h in det["packed"]["h"] if h[0][:13] == win[:13]), None)
        v["hour_fit"] = {"hour": win, "fit": row[1] if row else None, "source": src}
    # every spot's suitability at that same hour, so map markers follow the selected hour too (time integrity)
    at = get(f"/api/spots?at={win[:13]}:00:00Z")
    (OUT / "spots_at_sel.json").write_text(json.dumps({"hour": win, "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "scored_at": at.get("scored_at"), "fit": {sp["id"]: sp["score"]["total"] for sp in at["spots"]}}, ensure_ascii=False))
    (OUT / "dossier.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    for sid, v in out.items():
        print(sid, v["name"], "bands", len(v["bands"]), "transect", [(t["m"], t.get("land"), t.get("dmin"), t.get("dmax")) for t in v["transect"][:8]], "imgs", len(v["mapillary"]["images"]), "rose", bool(v["rose"]))


if __name__ == "__main__":
    dossier() if "--dossier" in sys.argv else main()
