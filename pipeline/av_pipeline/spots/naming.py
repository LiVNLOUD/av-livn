"""Unique, descriptive names for spots that share a generated name (e.g. five "Mendirek (Armutlu)").

Prefix: the nearest named harbour/marina (OSM, within HARBOUR_M of the group) or the place name. Distinguisher:
compass direction of the tip from the group centre ("batı", "kuzeydoğu" …); where two members still collide,
"dış"/"iç" by distance from the centre. OSM `name` tags are never changed; ids never change.
Example: "Armutlu Devlet Limanı – batı mendireği", "Güzelyalı Burgaz – kuzey mendireği".
"""

from __future__ import annotations

import math
from collections import defaultdict

from av_pipeline.spots.geo import to_xy

HARBOUR_M = 1000.0
COMPASS = ["kuzey", "kuzeydoğu", "doğu", "güneydoğu", "güney", "güneybatı", "batı", "kuzeybatı"]
NOUN = {"pier": "iskelesi", "breakwater": "mendireği", "groyne": "mahmuzu"}


def _dir(dx: float, dy: float) -> str:
    return COMPASS[round((math.degrees(math.atan2(dx, dy)) % 360) / 45) % 8]


def unique_names(features: list[dict], harbours: list[dict]) -> int:
    """Rename generated duplicates in place; returns the number renamed. harbours: [{name, lon, lat}]."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for f in features:
        if f["properties"].get("name_source") == "generated":
            groups[f["properties"]["name"]].append(f)
    renamed = 0
    for members in groups.values():
        if len(members) < 2:
            continue
        xy = [to_xy(*f["geometry"]["coordinates"]) for f in members]
        cx, cy = sum(p[0] for p in xy) / len(xy), sum(p[1] for p in xy) / len(xy)
        near = [(math.dist((cx, cy), to_xy(h["lon"], h["lat"])), h["name"]) for h in harbours]
        near = [n for n in near if n[0] <= HARBOUR_M]
        place = members[0]["properties"].get("place")
        prefix = min(near)[1] if near else (place or members[0]["properties"]["name"])
        labels = [_dir(x - cx, y - cy) for x, y in xy]
        for lab in set(labels):
            idx = [i for i, v in enumerate(labels) if v == lab]
            if len(idx) == 2:  # outer / inner by distance from the group centre
                far = max(idx, key=lambda i: math.dist(xy[i], (cx, cy)))
                for i in idx:
                    labels[i] = f"{'dış' if i == far else 'iç'} {lab}"
            elif len(idx) > 2:  # by structure length
                order = sorted(idx, key=lambda i: -(members[i]["properties"].get("length_m") or 0))
                quals = ["uzun", "orta", "kısa"] if len(idx) == 3 else [f"{k}." for k in range(1, len(idx) + 1)]
                for q, i in zip(quals, order):
                    labels[i] = f"{q} {lab}"
        seen: dict[str, int] = {}
        for i, lab in enumerate(labels):  # identical tips: number only the clashing ones
            if labels.count(lab) > 1:
                seen[lab] = seen.get(lab, 0) + 1
                labels[i] = f"{lab} {seen[lab]}"
        for f, lab in zip(members, labels):
            noun = NOUN.get(f["properties"]["kind"], "yapısı")
            f["properties"]["name"] = f"{prefix} – {lab} {noun}"
            renamed += 1
    return renamed
