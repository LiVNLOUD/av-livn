"""Seabed substrate / habitat audit per spot (public WFS/WMS; runs locally or in Actions).

- EUSeaMap 2025 EUNIS-2019 polygons (substrate, biozone) for the bbox: coverage and per-spot class.
  When the spot lies outside every polygon (littoral gap), the nearest polygon and its distance.
- EUSeaMap 2025 substrate confidence raster (WMS GetFeatureInfo, GRAY_INDEX; 1 low … 3 high per the
  EUSeaMap confidence convention — the legend carries no labels, so this is an interpretation).
- Biogenic substrate polygons/points 2025 and seagrass EOV polygons within 2 km of each spot.
- EMODnet Geology seabed substrate (GTK) at the finest available scale.
Writes docs/audit/habitat_audit.json.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import Point, box, shape
from shapely.ops import nearest_points, unary_union

BBOX = (28.55, 40.28, 29.25, 40.62)  # w, s, e, n
SH = "https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view"
GEO = "https://drive.emodnet-geology.eu/geoserver/wfs"
UA = {"User-Agent": "av-livn audit"}


def get(url: str, cache: Path) -> dict:
    if not cache.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
            cache.write_bytes(r.read())
    try:
        return json.loads(cache.read_text())
    except json.JSONDecodeError:
        return {"error": cache.read_text()[:300], "features": []}


def wfs(base: str, layer: str, cache: Path) -> dict:
    w, s, e, n = BBOX
    q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": layer, "outputFormat": "application/json",
         "srsName": "EPSG:4326", "bbox": f"{s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326"}
    return get(f"{base}/wfs?{urllib.parse.urlencode(q)}" if not base.endswith("wfs") else f"{base}?{urllib.parse.urlencode(q)}", cache)


def conf_at(lat: float, lon: float) -> int | None:
    d = 0.0005
    q = {"service": "WMS", "version": "1.1.1", "request": "GetFeatureInfo", "layers": "eusm2025_subs_conf", "query_layers": "eusm2025_subs_conf",
         "styles": "", "srs": "EPSG:4326", "bbox": f"{lon - d},{lat - d},{lon + d},{lat + d}", "width": 3, "height": 3, "x": 1, "y": 1,
         "info_format": "application/json"}
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{SH}/wms?{urllib.parse.urlencode(q)}", headers=UA), timeout=60) as r:
            f = json.loads(r.read()).get("features", [])
        v = f[0]["properties"].get("GRAY_INDEX") if f else None
        return int(v) if v is not None and v >= 0 else None
    except Exception:  # noqa: BLE001
        return None


def km(a: Point, b: Point) -> float:
    r = math.pi / 180
    h = math.sin((b.y - a.y) * r / 2) ** 2 + math.cos(a.y * r) * math.cos(b.y * r) * math.sin((b.x - a.x) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def main(argv: list[str]) -> int:
    spots = json.loads(Path(argv[1] if len(argv) > 1 else "data/spots.geojson").read_text())["features"]
    out = Path(argv[2] if len(argv) > 2 else "docs/audit/habitat_audit.json")
    cache = Path(argv[3] if len(argv) > 3 else "/tmp")
    bb = box(*BBOX)
    eunis = wfs(SH, "emodnet_view:eusm2025_eunis2019_full", cache / "eusm2025_eunis2019_full.json")
    polys = [(f["properties"], shape(f["geometry"]).buffer(0)) for f in eunis["features"]]
    cov = unary_union([g for _, g in polys]).intersection(bb)
    by_sub: dict[str, float] = {}
    for p, g in polys:
        by_sub[p.get("substrate") or "?"] = by_sub.get(p.get("substrate") or "?", 0) + g.intersection(bb).area
    bio = wfs(SH, "emodnet_view:biogenic_substrate_poly_2025", cache / "biogenic_poly.json")
    bio_pts = wfs(SH, "emodnet_view:biogenic_substrate_points_2025", cache / "biogenic_pts.json")
    seagrass = wfs(SH, "emodnet_view:seagrass_eov_poly_2025", cache / "seagrass_poly.json")
    geo_layer, geo = None, {"features": []}
    for layer in ["gtk:seabed_substrate_250k", "gtk:seabed_substrate_1m"]:
        g = wfs(GEO, layer, cache / f"{layer.replace(':', '_')}.json")
        if g.get("features"):
            geo_layer, geo = layer, g
            break
    geo_polys = [(f["properties"], shape(f["geometry"]).buffer(0)) for f in geo["features"]]

    per = []
    for f in spots:
        p = f["properties"]
        pt = Point(*f["geometry"]["coordinates"])
        inside = next(((pp, g) for pp, g in polys if g.contains(pt)), None)
        if inside:
            near, dist = inside, 0.0
        else:
            near = min(polys, key=lambda x: x[1].distance(pt)) if polys else None
            dist = km(pt, nearest_points(near[1], pt)[0]) if near else None
        npt = pt if inside or not near else nearest_points(near[1], pt)[0]
        gnear = min(geo_polys, key=lambda x: x[1].distance(pt)) if geo_polys else None
        per.append({
            "spot": p["id"], "name": p["name"],
            "eunis_substrate": near[0].get("substrate") if near else None,
            "eunis_biozone": near[0].get("biozone") if near else None,
            "eunis_code": near[0].get("eunis2019c") if near else None,
            "distance_km": None if dist is None else round(dist, 3),
            "confidence_at_class_point": conf_at(npt.y, npt.x),
            "geology_substrate": ({k: gnear[0].get(k) for k in ("folk_5cl_txt", "folk_7cl_txt", "folk_16cl_txt", "substrate") if gnear[0].get(k)}
                                  if gnear else None),
            "geology_distance_km": round(km(pt, nearest_points(gnear[1], pt)[0]), 3) if gnear else None,
            "biogenic_within_2km": sorted({bf["properties"].get("bio_detail", "?") for bf in bio["features"]
                                           if shape(bf["geometry"]).buffer(0).distance(pt) < 0.02}),
            "seagrass_eov_within_2km": len([sf for sf in seagrass["features"] if shape(sf["geometry"]).buffer(0).distance(pt) < 0.02]),
        })
    result = {
        "sources": {
            "eunis2019": "EMODnet Seabed Habitats EUSeaMap 2025 (eusm2025_eunis2019_full, WFS)",
            "confidence": "eusm2025_subs_conf (WMS GetFeatureInfo)",
            "geology": geo_layer,
        },
        "eunis_polygons_in_bbox": len(polys),
        "eunis_coverage_of_bbox_pct": round(100 * cov.area / bb.area, 1),
        "eunis_area_by_substrate_pct_of_bbox": {k: round(100 * v / bb.area, 2) for k, v in sorted(by_sub.items(), key=lambda kv: -kv[1])},
        "biogenic_polygons_in_bbox": [f["properties"].get("bio_detail") for f in bio["features"]],
        "biogenic_polygon_sources": sorted({f["properties"].get("src_name", "?") for f in bio["features"]}),
        "biogenic_points_in_bbox": len(bio_pts.get("features", [])),
        "seagrass_eov_polygons_in_bbox": len(seagrass.get("features", [])),
        "geology_polygons_in_bbox": len(geo_polys),
        "spots": per,
    }
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "spots"}, ensure_ascii=False, indent=1))
    for r in per:
        print(r)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
