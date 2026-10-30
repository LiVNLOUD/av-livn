"""EUSeaMap 2025 substrate class + confidence per spot (EMODnet Seabed Habitats, public WFS/WMS).

Class: the EUNIS-2019 polygon containing the spot tip, else the nearest one (distance kept; the littoral gap
is small, docs/DATA-AUDIT.md §5). Confidence: GRAY_INDEX of `eusm2025_subs_conf` at the class point
(1 low … 3 high per the EUSeaMap convention; the legend has no labels, so this reading is unverified; 0/none = no value).
"""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from typing import Callable

from shapely.geometry import Point, shape
from shapely.ops import nearest_points

from av_pipeline import BBOX

BASE = "https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view"
UA = {"User-Agent": "av-livn/0.1 (+https://av.livn.tr)"}
Getter = Callable[[str], dict]


def http_json(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return json.load(r)


def polygons_url() -> str:
    s, n, w, e = BBOX["south"], BBOX["north"], BBOX["west"], BBOX["east"]
    q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": "emodnet_view:eusm2025_eunis2019_full",
         "outputFormat": "application/json", "srsName": "EPSG:4326", "bbox": f"{s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326"}
    return f"{BASE}/wfs?{urllib.parse.urlencode(q)}"


def confidence_url(lat: float, lon: float) -> str:
    d = 0.0005
    q = {"service": "WMS", "version": "1.1.1", "request": "GetFeatureInfo", "layers": "eusm2025_subs_conf", "query_layers": "eusm2025_subs_conf",
         "styles": "", "srs": "EPSG:4326", "bbox": f"{lon - d},{lat - d},{lon + d},{lat + d}", "width": 3, "height": 3, "x": 1, "y": 1,
         "info_format": "application/json"}
    return f"{BASE}/wms?{urllib.parse.urlencode(q)}"


def km(a: Point, b: Point) -> float:
    r = math.pi / 180
    h = math.sin((b.y - a.y) * r / 2) ** 2 + math.cos(a.y * r) * math.cos(b.y * r) * math.sin((b.x - a.x) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def annotate(features: list[dict], get: Getter = http_json) -> None:
    """Add substrate, substrate_biozone, substrate_dist_m and substrate_conf to each spot feature in place."""
    polys = [(f["properties"], shape(f["geometry"]).buffer(0)) for f in get(polygons_url()).get("features", [])]
    for f in features:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        pt = Point(lon, lat)
        if not polys:
            p.update(substrate=None, substrate_biozone=None, substrate_dist_m=None, substrate_conf=None)
            continue
        props, geom = min(polys, key=lambda x: x[1].distance(pt))
        at = pt if geom.contains(pt) else nearest_points(geom, pt)[0]
        try:
            feats = get(confidence_url(at.y, at.x)).get("features", [])
            v = feats[0]["properties"].get("GRAY_INDEX") if feats else None
            conf = int(v) if v is not None and v > 0 else None
        except Exception:  # noqa: BLE001 - confidence is optional
            conf = None
        sub = props.get("substrate")
        p.update(substrate=None if sub in (None, "Seabed", "Na") else sub, substrate_biozone=props.get("biozone"),
                 substrate_dist_m=round(km(pt, at) * 1000), substrate_conf=conf)
