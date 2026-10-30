"""Small-area planar geometry helpers (equirectangular projection around the bbox centre)."""

from __future__ import annotations

import math

from av_pipeline import BBOX

LAT0 = (BBOX["south"] + BBOX["north"]) / 2
M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))


def to_xy(lon: float, lat: float) -> tuple[float, float]:
    return (lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT)


def to_lonlat(x: float, y: float) -> tuple[float, float]:
    return (x / M_PER_DEG_LON, y / M_PER_DEG_LAT)


def bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Bearing a→b in planar xy metres, degrees clockwise from north, [0, 360)."""
    return math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 360


def offset(p: tuple[float, float], bearing_deg: float, dist_m: float) -> tuple[float, float]:
    r = math.radians(bearing_deg)
    return (p[0] + dist_m * math.sin(r), p[1] + dist_m * math.cos(r))
