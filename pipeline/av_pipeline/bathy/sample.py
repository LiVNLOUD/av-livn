"""Per-spot depth features from the DTM: transect profile, depth at 200 m, slope, max depth near the tip,
and a DTM-based sea probe for spots where the coastline method found none."""

from __future__ import annotations

from av_pipeline.bathy.grid import Grid, along

PROFILE_STEP_M = 25
PROFILE_LEN_M = 500
PROBE_MIN_DEPTH_M = 5.0
PROBE_MAX_DIST_M = 3000


def profile(grid: Grid, lat: float, lon: float, normal_deg: float) -> list[float | None]:
    """Depths every 25 m from the tip out to 500 m along the seaward normal (21 values)."""
    out: list[float | None] = []
    for d in range(0, PROFILE_LEN_M + 1, PROFILE_STEP_M):
        z = grid.depth(*along(lat, lon, normal_deg, d))
        out.append(None if z is None else round(z, 1))
    return out


def slope_pct(prof: list[float | None], until_m: int = 300) -> float | None:
    """Mean gradient (%) from the first valid profile point to `until_m` (0–300 m transect)."""
    k = until_m // PROFILE_STEP_M
    end = prof[k] if k < len(prof) else None
    first = next(((i, z) for i, z in enumerate(prof[:k]) if z is not None), None)
    if end is None or first is None:
        return None
    i0, z0 = first
    return round((end - z0) / ((k - i0) * PROFILE_STEP_M) * 100, 1)


def dtm_probe(grid: Grid, lat: float, lon: float, normal_deg: float) -> tuple[float, float] | None:
    """First point along the normal (25 m steps, up to 3 km) where the DTM depth is ≥ 5 m."""
    for d in range(PROFILE_STEP_M, PROBE_MAX_DIST_M + 1, PROFILE_STEP_M):
        p = along(lat, lon, normal_deg, d)
        z = grid.depth(*p)
        if z is not None and z >= PROBE_MIN_DEPTH_M:
            return p
    return None


def features(grid: Grid, lat: float, lon: float, normal_deg: float) -> dict:
    prof = profile(grid, lat, lon, normal_deg)
    near = grid.cells_within(lat, lon, 100) + [z for z in prof[: 100 // PROFILE_STEP_M + 1] if z is not None]
    return {
        "profile": prof,
        "depth_200m": prof[200 // PROFILE_STEP_M],
        "slope_pct": slope_pct(prof),
        "max_depth_100m": round(max(near), 1) if near else None,
    }


DTM_NORMAL_STEP_DEG = 5
DTM_NORMAL_RANGES_M = (150, 300, 500)
DTM_NORMAL_MIN_SCORE_M = 3.0
PROBE_DISTANCES_M = (750, 1000, 1500)


def dtm_normal(grid: Grid, lat: float, lon: float) -> tuple[float, float] | None:
    """Seaward direction from the DTM: the bearing whose summed depth at 150/300/500 m is largest.
    Returns (bearing, summed depth) or None when the DTM shows no meaningful water around the tip."""
    best: tuple[float, float] | None = None
    for b in range(0, 360, DTM_NORMAL_STEP_DEG):
        score = sum(grid.depth(*along(lat, lon, b, d)) or 0.0 for d in DTM_NORMAL_RANGES_M)
        if best is None or score > best[1]:
            best = (float(b), score)
    return best if best and best[1] >= DTM_NORMAL_MIN_SCORE_M else None


def sea_probe(grid: Grid, lat: float, lon: float, normal_deg: float) -> tuple[float, float] | None:
    """Probe along a DTM normal: first of 750/1000/1500 m that is water in the DTM, else the first ≥ 5 m point."""
    for d in PROBE_DISTANCES_M:
        p = along(lat, lon, normal_deg, d)
        if grid.depth(*p) is not None:
            return p
    return dtm_probe(grid, lat, lon, normal_deg)
