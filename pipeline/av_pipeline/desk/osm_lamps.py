"""a) Lamps from OSM within RADIUS_M of each spot tip: highway=street_lamp, man_made=lighthouse, seamark:light:*.

A street lamp raises the lamp probability to 0.95; a lighthouse or seamark light only to 0.6 (a flashing
navigation light does not light the water the way a pier lamp does). Desk data, unconfirmed. Nothing found writes nothing:
missing OSM objects are common, so "not in OSM" is not evidence of no lamp. Runs in Actions (Overpass).
"""

from __future__ import annotations

import math

from av_pipeline.desk.findings import Finding
from av_pipeline.spots.fetch_osm import fetch

RADIUS_M = 40.0
LAMP_P = {"street_lamp": 0.95, "lighthouse": 0.6, "seamark_light": 0.6}  # nav lights flash and are aimed at ships, not the water


def query(spots: list[dict]) -> str:
    parts = []
    for s in spots:
        a = f"(around:{RADIUS_M:.0f},{s['lat']},{s['lon']})"
        parts += [f'node["highway"="street_lamp"]{a};', f'nwr["man_made"="lighthouse"]{a};', f'nwr["seamark:light:character"]{a};', f'nwr["seamark:type"~"light"]{a};']
    return "[out:json][timeout:120];\n(\n" + "\n".join(parts) + "\n);\nout center tags;"


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def kind(tags: dict) -> str:
    if tags.get("highway") == "street_lamp":
        return "street_lamp"
    if tags.get("man_made") == "lighthouse":
        return "lighthouse"
    return "seamark_light"


def findings(spots: list[dict], elements: list[dict], date: str) -> list[Finding]:
    out = []
    for s in spots:
        hits = []
        for e in elements:
            lat, lon = (e.get("lat"), e.get("lon")) if "lat" in e else (e.get("center", {}).get("lat"), e.get("center", {}).get("lon"))
            if lat is None:
                continue
            d = metres((s["lat"], s["lon"]), (lat, lon))
            if d <= RADIUS_M:
                hits.append((round(d), kind(e.get("tags", {})), f"{e['type']}/{e['id']}"))
        if hits:
            hits.sort()
            out.append(Finding(
                spot_id=s["id"], source="osm_lamp", observed_at=date, light_prob=max(LAMP_P[k] for _, k, _ in hits),
                note=f"OSM: {len(hits)} lamba/fener ≤ {RADIUS_M:.0f} m ({', '.join(f'{k} {d} m' for d, k, _ in hits[:4])})",
                evidence={"source": "OpenStreetMap (Overpass)", "date": date, "method": f"{RADIUS_M:.0f} m çevresinde highway=street_lamp, man_made=lighthouse, seamark:light", "confidence": "orta",
                          "license": "ODbL", "objects": [o for _, _, o in hits]},
            ))
    return out


def run(spots: list[dict], date: str) -> list[Finding]:
    return findings(spots, fetch(query(spots)).get("elements", []), date)
