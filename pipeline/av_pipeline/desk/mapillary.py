"""b) Mapillary images within RADIUS_M of each tip (CC BY-SA) → links for remote observation on the card.

No automatic detection: the user looks and records a 'uzaktan gözlem' entry. Needs MAPILLARY_TOKEN (Graph API
client token); without it the step is skipped and the report says so.
"""

from __future__ import annotations

import json
import math
import os
import urllib.parse
import urllib.request

RADIUS_M = 50.0
API = "https://graph.mapillary.com/images"


def bbox(lat: float, lon: float, r: float = RADIUS_M) -> str:
    dlat = r / 111_320
    dlon = r / (111_320 * math.cos(math.radians(lat)))
    return f"{lon - dlon},{lat - dlat},{lon + dlon},{lat + dlat}"


def images(spots: list[dict], token: str | None = None, opener=urllib.request.urlopen) -> dict:
    token = token if token is not None else os.environ.get("MAPILLARY_TOKEN", "")
    if not token:
        return {"skipped": "MAPILLARY_TOKEN yok", "spots": {}}
    out = {}
    for s in spots:
        q = {"fields": "id,captured_at,thumb_256_url,compass_angle,geometry", "bbox": bbox(s["lat"], s["lon"]), "limit": 20}
        req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(q)}", headers={"Authorization": f"OAuth {token}"})
        with opener(req, timeout=60) as r:
            data = json.load(r).get("data", [])
        data.sort(key=lambda d: -(d.get("captured_at") or 0))
        out[s["id"]] = [{"id": d["id"], "url": f"https://www.mapillary.com/app/?pKey={d['id']}", "thumb": d.get("thumb_256_url"),
                         "captured_at": d.get("captured_at")} for d in data[:8]]
    return {"license": "CC BY-SA 4.0, © Mapillary katkıcıları", "radius_m": RADIUS_M, "spots": out}
