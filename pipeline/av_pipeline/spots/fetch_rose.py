"""Exposure rose: open-water fetch in 16 directions from the spot tip over OSM land polygons (vector).

Fetch = length of the first open-water stretch along the ray that starts within START_MAX_M of the tip (a tip
on a structure mapped as land still gets the water beyond it), capped at MAX_M. Planar xy (to_xy) metres.
"""

from __future__ import annotations

import math

from shapely.geometry import LineString, Point

DIRS = [i * 22.5 for i in range(16)]
MAX_M = 100_000.0
START_MAX_M = 500.0


def fetch_m(land_xy: object, x: float, y: float, bearing_deg: float) -> float:
    b = math.radians(bearing_deg)
    ray = LineString([(x, y), (x + MAX_M * math.sin(b), y + MAX_M * math.cos(b))])
    start = Point(x, y)
    water = ray.difference(land_xy)
    best: tuple[float, float] | None = None  # (start distance, far distance)
    for seg in getattr(water, "geoms", [water]):
        if seg.is_empty:
            continue
        d = sorted(start.distance(Point(c)) for c in (seg.coords[0], seg.coords[-1]))
        if d[0] <= START_MAX_M and (best is None or d[0] < best[0]):
            best = (d[0], d[1])
    return 0.0 if best is None else best[1]


def rose_km(land_xy: object, x: float, y: float) -> list[float]:
    return [round(fetch_m(land_xy, x, y, d) / 1000, 2) for d in DIRS]
