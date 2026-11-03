"""b) Mapillary images that can show each spot's lighting (CC BY-SA 4.0, © Mapillary katkıcıları) — I3.

Earlier version: tip ± 50 m, one request of 20, links only. Now, for every active spot:
  * search a SEARCH_M box around the fishing point (structure, its root, the shore road leading to it), paginated;
  * per image: distance to the spot, bearing image → spot and whether the camera looks at it (|compass − bearing|
    ≤ FACING_DEG, or a 360° panorama);
  * select at most PER_SPOT: facing images first, then nearer, then newer; spread over near (≤ 60 m) and approach.
The selected thumbnails are reviewed by eye (docs/audit/mapillary-review.md, data/lighting/mapillary.json); this
module never decides "lamp yes/no". A pole seen by day says nothing about whether it works at night or its lux.
Needs MAPILLARY_TOKEN (Graph API client token, Actions secret); without it the step is skipped and says so.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import urllib.parse
import urllib.request

SEARCH_M = 200.0
FACING_DEG = 60.0
PER_SPOT = 6
NEAR_M = 60.0
API = "https://graph.mapillary.com/images"
FIELDS = "id,captured_at,thumb_1024_url,compass_angle,computed_compass_angle,geometry,is_pano"
LICENSE = "CC BY-SA 4.0, © Mapillary katkıcıları"


def bbox(lat: float, lon: float, r: float = SEARCH_M) -> str:
    dlat = r / 111_320
    dlon = r / (111_320 * math.cos(math.radians(lat)))
    return f"{lon - dlon:.6f},{lat - dlat:.6f},{lon + dlon:.6f},{lat + dlat:.6f}"


def dist_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    """Metres and initial bearing (deg from north) from point 1 to point 2 (local flat approximation)."""
    dx = (lon2 - lon1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    dy = (lat2 - lat1) * 111_320
    return math.hypot(dx, dy), (math.degrees(math.atan2(dx, dy)) + 360) % 360


def angle_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def describe(img: dict, spot: dict) -> dict:
    lon, lat = img["geometry"]["coordinates"]
    d, brg = dist_bearing(lat, lon, spot["lat"], spot["lon"])
    compass = img.get("computed_compass_angle", img.get("compass_angle"))
    pano = bool(img.get("is_pano"))
    facing = pano or (compass is not None and (d < 15 or angle_diff(float(compass), brg) <= FACING_DEG))
    ts = img.get("captured_at")
    return {
        "image_id": str(img["id"]),
        "url": f"https://www.mapillary.com/app/?pKey={img['id']}",
        "thumb": img.get("thumb_1024_url"),
        "captured_at": dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc).date().isoformat() if ts else None,
        "lonlat": [round(lon, 6), round(lat, 6)],
        "compass_deg": None if compass is None else round(float(compass)),
        "bearing_to_spot_deg": round(brg),
        "distance_m": round(d),
        "is_pano": pano,
        "facing_spot": facing,
        "_ts": ts or 0,
    }


def select(imgs: list[dict], n: int = PER_SPOT) -> list[dict]:
    """Facing first, then nearer, then newer; about half near (≤ NEAR_M) and half from the approach, topped up
    from whichever side has more."""
    ranked = sorted(imgs, key=lambda x: (not x["facing_spot"], x["distance_m"], -x["_ts"]))
    near = [x for x in ranked if x["distance_m"] <= NEAR_M]
    far = [x for x in ranked if x["distance_m"] > NEAR_M]
    pick = near[: (n + 1) // 2] + far[: n // 2]
    rest = [x for x in ranked if x not in pick]
    pick += rest[: n - len(pick)]
    pick.sort(key=ranked.index)
    return [{k: v for k, v in x.items() if not k.startswith("_")} for x in pick]


def fetch_all(url: str, token: str, opener=urllib.request.urlopen, max_pages: int = 10) -> list[dict]:
    out: list[dict] = []
    for _ in range(max_pages):
        req = urllib.request.Request(url, headers={"Authorization": f"OAuth {token}"})
        with opener(req, timeout=60) as r:
            body = json.load(r)
        out += body.get("data", [])
        url = (body.get("paging") or {}).get("next")
        if not url:
            break
    return out


def images(spots: list[dict], token: str | None = None, opener=urllib.request.urlopen) -> dict:
    token = token if token is not None else os.environ.get("MAPILLARY_TOKEN", "")
    if not token:
        return {"skipped": "MAPILLARY_TOKEN yok", "spots": {}}
    out: dict[str, dict] = {}
    for s in spots:
        q = {"fields": FIELDS, "bbox": bbox(s["lat"], s["lon"]), "limit": 500}
        raw = fetch_all(f"{API}?{urllib.parse.urlencode(q)}", token, opener)
        desc = [describe(i, s) for i in raw if i.get("geometry")]
        desc = [d for d in desc if d["distance_m"] <= SEARCH_M]
        out[s["id"]] = {"name": s.get("name"), "found": len(desc), "facing": sum(d["facing_spot"] for d in desc), "selected": select(desc)}
    return {"license": LICENSE, "search_m": SEARCH_M, "facing_deg": FACING_DEG, "spots": out}
