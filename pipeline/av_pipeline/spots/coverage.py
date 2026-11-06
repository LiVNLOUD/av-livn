"""I5: province of every spot (OSM admin_level=4 polygons) and a coastline coverage report.

Province: the polygon containing the point, else the nearest one within NEAR_PROVINCE_M (fishing points sit on the
water, just outside the land boundary). Spots outside Bursa are listed separately ("Bursa dışı, yakın çevre").
Coverage: the coastline inside each province split into SEG_KM pieces; per piece the nearest spot, the share of
measured (not interpolated) DTM cells along it, and whether any spot lies within REACH_KM.
"""

from __future__ import annotations

import math

from shapely.geometry import LineString, Point
from shapely.ops import polygonize, unary_union

from av_pipeline.spots.geo import to_lonlat, to_xy

PROVINCES = ("Bursa", "Yalova", "Balıkesir")
SLUG = {"Bursa": "bursa", "Yalova": "yalova", "Balıkesir": "balikesir"}
NEAR_PROVINCE_M = 3000.0
SEG_KM = 2.0
REACH_KM = 2.0


def province_polygons(raw: dict, level: str = "4", names: tuple[str, ...] | None = PROVINCES) -> dict[str, object]:
    """name → planar (multi)polygon from admin_level relations with member geometry (out geom). J4: level "6"
    (ilçe) with names=None gives every district in the data."""
    out: dict[str, object] = {}
    for el in raw.get("elements", []):
        t = el.get("tags", {})
        if el.get("type") != "relation" or t.get("admin_level") != level or (names is not None and t.get("name") not in names) or not t.get("name"):
            continue
        lines = []
        for m in el.get("members", []):
            if m.get("type") != "way" or m.get("role") not in ("outer", ""):
                continue
            xy = [to_xy(g["lon"], g["lat"]) for g in m.get("geometry", []) or []]
            if len(xy) >= 2:
                lines.append(LineString(xy))
        polys = list(polygonize(unary_union(lines))) if lines else []
        if polys:
            out[t["name"]] = unary_union(polys)
    return out


def province_of(lonlat: tuple[float, float], polys: dict[str, object]) -> str | None:
    p = Point(to_xy(*lonlat))
    best = None
    for name, g in polys.items():
        if g.contains(p):
            return SLUG[name]
        d = g.distance(p)
        if d <= NEAR_PROVINCE_M and (best is None or d < best[0]):
            best = (d, SLUG[name])
    return best[1] if best else None


def coast_pieces(coast_lines: list[LineString], area, seg_m: float = SEG_KM * 1000) -> list[LineString]:
    """Coastline inside `area` cut into pieces of about seg_m."""
    out: list[LineString] = []
    for line in coast_lines:
        part = line.intersection(area)
        for g in getattr(part, "geoms", [part]):
            if not isinstance(g, LineString) or g.length < seg_m / 4:
                continue
            n = max(1, round(g.length / seg_m))
            for k in range(n):
                a, b = g.length * k / n, g.length * (k + 1) / n
                out.append(LineString([g.interpolate(a), *[c for c in g.coords if a < g.project(Point(c)) < b], g.interpolate(b)]))
    return out


def coverage_rows(pieces: list[LineString], spots_xy: list[tuple[str, tuple[float, float]]], measured_share=None) -> list[dict]:
    rows = []
    for seg in pieces:
        mid = seg.interpolate(0.5, normalized=True)
        near = min(((math.dist((mid.x, mid.y), xy), sid) for sid, xy in spots_xy), default=(math.inf, None))
        lon, lat = to_lonlat(mid.x, mid.y)
        rows.append({"lonlat": [round(lon, 4), round(lat, 4)], "length_km": round(seg.length / 1000, 2),
                     "nearest_spot": near[1], "nearest_km": None if near[1] is None else round(near[0] / 1000, 2),
                     "covered": near[0] <= REACH_KM * 1000, "dtm_measured_share": None if measured_share is None else measured_share(seg)})
    return rows


def coverage_md(rows_by_prov: dict[str, list[dict]], spot_counts: dict[str, int]) -> str:
    L = ["# Kıyı kapsamı (I5)", "",
         "Otomatik üretilir (geodata.yml). İl sınırı: OSM `admin_level=4`. Kıyı çizgisi il içinde ~2 km parçalara bölünür; her parçada en yakın",
         "mera ve EMODnet DTM hücrelerinin ölçülmüş (enterpolasyon olmayan) payı. Haritadaki kontur çizgisi o noktanın ölçüldüğünü göstermez.", "",
         "| İl | Mera | Kıyı parçası | ≤ 2 km'de mera olan | Ortalama ölçülmüş DTM payı |", "|---|---|---|---|---|"]
    for prov, rows in rows_by_prov.items():
        shares = [r["dtm_measured_share"] for r in rows if r["dtm_measured_share"] is not None]
        L.append(f"| {prov} | {spot_counts.get(prov, 0)} | {len(rows)} | {sum(r['covered'] for r in rows)} | {('%' + str(round(100 * sum(shares) / len(shares)))) if shares else '—'} |")
    for prov, rows in rows_by_prov.items():
        gaps = [r for r in rows if not r["covered"]]
        L += ["", f"## {prov}: merası olmayan kıyı parçaları ({len(gaps)})", ""]
        if not gaps:
            L.append("Yok.")
            continue
        L += ["| Konum (boylam, enlem) | Uzunluk (km) | En yakın mera (km) | Ölçülmüş DTM payı |", "|---|---|---|---|"]
        for r in gaps[:60]:
            sh = "—" if r["dtm_measured_share"] is None else f"%{round(100 * r['dtm_measured_share'])}"
            L.append(f"| {r['lonlat'][0]}, {r['lonlat'][1]} | {r['length_km']} | {r['nearest_km'] if r['nearest_km'] is not None else '—'} | {sh} |")
    return "\n".join(L) + "\n"


def measured_share_fn(grid, radius_m: float = 400.0):
    """f(segment) → share of DTM sea cells within radius_m of points along it that are measured (not interpolated)."""
    import numpy as np

    if grid is None or grid.interp is None:
        return None

    def f(seg: LineString) -> float | None:
        n = max(2, int(seg.length // 250))
        meas = tot = 0
        for k in range(n + 1):
            q = seg.interpolate(k / n, normalized=True)
            lon, lat = to_lonlat(q.x, q.y)
            ii = np.where(np.abs(grid.lat - lat) <= radius_m / 110_540)[0]
            jj = np.where(np.abs(grid.lon - lon) <= radius_m / 85_000)[0]
            if not len(ii) or not len(jj):
                continue
            z = grid.elev[np.ix_(ii, jj)]
            fl = grid.interp[np.ix_(ii, jj)]
            sea = ~np.isnan(z)
            tot += int(sea.sum())
            meas += int((sea & (fl < 0.5)).sum())
        return round(meas / tot, 2) if tot else None

    return f
