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


FAR_M = 700.0
POSS = ["kuzeyi", "kuzeydoğusu", "doğusu", "güneydoğusu", "güneyi", "güneybatısı", "batısı", "kuzeybatısı"]


def describe_singles(features: list[dict], places: list[dict]) -> int:
    """E6: generated names still in the generic form "İskele (Fıstıklı)" become "Fıstıklı İskelesi"; when the tip is
    FAR_M or more from the settlement point, its side is added: "Fıstıklı İskelesi (Fıstıklı'nın batısı)".
    Only `name_source == "generated"` changes; the admin can rename any spot (an admin name survives reseeding)."""
    pxy = {p["name"]: p["xy"] for p in places if p.get("name")}
    n = 0
    for f in features:
        pr = f["properties"]
        noun = NOUN.get(pr.get("kind", ""))
        place = pr.get("place")
        if pr.get("name_source") != "generated" or not noun or not place or not pr["name"].endswith(f"({place})"):
            continue
        first = {"i": "İ", "ı": "I"}.get(noun[0], noun[0].upper())  # Turkish capitals
        name = f"{place} {first}{noun[1:]}"
        if place in pxy:
            x, y = to_xy(*f["geometry"]["coordinates"])
            dx, dy = x - pxy[place][0], y - pxy[place][1]
            if math.hypot(dx, dy) >= FAR_M:
                name += f" ({place} {POSS[round((math.degrees(math.atan2(dx, dy)) % 360) / 45) % 8]})"
        pr["name"] = name
        n += 1
    return n


SAME_NAME_KM = 5.0


def _district_of(xy: tuple[float, float], districts: dict[str, object]) -> str | None:
    from shapely.geometry import Point

    p = Point(xy)
    best = None
    for name, g in districts.items():
        if g.contains(p):
            return name
        d = g.distance(p)
        if d <= 3000 and (best is None or d < best[0]):
            best = (d, name)
    return best[1] if best else None


def _suffixed_name(name: str, place: str, district: str) -> str:
    """J4: "Kumsal (Kurşunlu doğusu)" → "Kumsal (Kurşunlu doğusu, Karacabey)";
    "Kurşunlu – uzun doğu mendireği" → "Kurşunlu (Karacabey) – uzun doğu mendireği"."""
    import re

    m = re.search(r"\(([^()]*\b" + re.escape(place) + r"\b[^()]*)\)", name)
    if m:
        return name[: m.end(1)] + f", {district}" + name[m.end(1):]
    return re.sub(r"\b" + re.escape(place) + r"\b", f"{place} ({district})", name, count=1)


def disambiguate_places(features: list[dict], places: list[dict], districts: dict[str, object]) -> list[tuple[str, str, str]]:
    """J4: when two settlements share a name (place nodes > SAME_NAME_KM apart), add the district to every spot that
    uses it: `place` becomes "Kurşunlu (Gemlik)", and a generated name carries the district too. OSM names are kept
    as they are; ids never change. Returns (id, old name, new name) for the report. places: [{name, xy}]."""
    by_name: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for p in places:
        if p.get("name"):
            by_name[p["name"]].append(p["xy"])
    clash = {n for n, pts in by_name.items() if any(math.dist(a, b) > SAME_NAME_KM * 1000 for a in pts for b in pts)}
    changed = []
    for f in features:
        pr = f["properties"]
        place = pr.get("place")
        if not place or place not in clash:
            continue
        district = _district_of(to_xy(*f["geometry"]["coordinates"]), districts)
        if not district or district == place:
            continue
        pr["place"] = f"{place} ({district})"
        if pr.get("name_source") == "generated":
            new = _suffixed_name(pr["name"], place, district)
            if new != pr["name"]:
                changed.append((pr["id"], pr["name"], new))
                pr["name"] = new
    return changed
