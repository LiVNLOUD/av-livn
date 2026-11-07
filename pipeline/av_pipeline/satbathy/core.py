"""Pure parts of the satellite bathymetry job (tested without network): ATL24 photon filter, Stumpf et al. (2003)
log-ratio model, grouped cross-validation by ICESat-2 pass, the acceptance rule and per-spot depth bands."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

# ATL24 v002 (NSIDC, doi:10.5067/ATLAS/ATL24.002): class_ph 40 = bathymetry, 41 = sea surface.
BATHY_CLASS = 40
MIN_CONFIDENCE = 0.6  # ATL24 per-photon confidence (0–1); "high" here = ≥ 0.6 and no quality flag set
MAX_DEPTH_M = 40.0  # beyond any LRF interest; also guards against mislabelled seafloor/noise

# Acceptance of the Sentinel-2 SDB (user rule, Faz R3): 0–8 m, RMSE ≤ 1.5 m, R² ≥ 0.6, ≥ 30 independent points.
ACCEPT_RMSE = 1.5
ACCEPT_R2 = 0.6
ACCEPT_N = 30
ACCEPT_RANGE = (0.0, 8.0)
SDB_RANGE = (0.0, 10.0)  # no estimate outside
STUMPF_N = 1000.0


def filter_photons(p: dict[str, np.ndarray]) -> np.ndarray:
    """Boolean mask of usable photons: bathymetry class, high confidence, no quality flag, positive depth.

    `p` holds per-photon arrays (missing flag arrays count as 0): class_ph, confidence, ortho_h, surface_h and the
    flags low_confidence_flag, invalid_kd, invalid_wind_speed, sensor_depth_exceeded.
    """
    n = len(p["class_ph"])
    zero = np.zeros(n)
    ok = (p["class_ph"] == BATHY_CLASS) & (np.nan_to_num(p.get("confidence", zero), nan=0.0) >= MIN_CONFIDENCE)
    for flag in ("low_confidence_flag", "invalid_kd", "invalid_wind_speed", "sensor_depth_exceeded"):
        ok &= np.nan_to_num(p.get(flag, zero), nan=1.0) == 0
    d = depth_of(p)
    return ok & np.isfinite(d) & (d > 0) & (d <= MAX_DEPTH_M)


def depth_of(p: dict[str, np.ndarray]) -> np.ndarray:
    """Refraction-corrected depth = water surface − seafloor (both orthometric heights in ATL24)."""
    return np.asarray(p["surface_h"], float) - np.asarray(p["ortho_h"], float)


def stumpf_ratio(blue: np.ndarray, green: np.ndarray, n: float = STUMPF_N) -> np.ndarray:
    """ln(n·Rw(blue)) / ln(n·Rw(green)); NaN where reflectance is not positive (log undefined) or ≤ 1/n."""
    b = np.asarray(blue, float) * n
    g = np.asarray(green, float) * n
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.log(b) / np.log(g)
    r[(b <= 1) | (g <= 1) | ~np.isfinite(r)] = np.nan
    return r


@dataclass(frozen=True)
class Fit:
    m1: float
    m0: float

    def predict(self, r: np.ndarray) -> np.ndarray:
        return self.m1 * np.asarray(r, float) - self.m0


def fit_linear(r: np.ndarray, z: np.ndarray) -> Fit:
    """Least squares z = m1·r − m0."""
    a = np.vstack([np.asarray(r, float), -np.ones(len(r))]).T
    (m1, m0), *_ = np.linalg.lstsq(a, np.asarray(z, float), rcond=None)
    return Fit(float(m1), float(m0))


def metrics(z: np.ndarray, zhat: np.ndarray) -> dict:
    z = np.asarray(z, float)
    zhat = np.asarray(zhat, float)
    if len(z) == 0:
        return {"n": 0, "rmse": None, "bias": None, "r2": None}
    e = zhat - z
    ss = float(np.sum((z - z.mean()) ** 2))
    return {"n": int(len(z)), "rmse": round(float(np.sqrt(np.mean(e**2))), 3), "bias": round(float(e.mean()), 3), "r2": round(1 - float(np.sum(e**2)) / ss, 3) if ss > 0 else None}


def grouped_cv(r: np.ndarray, z: np.ndarray, groups: list[str], k: int = 5) -> dict:
    """K-fold CV where all points of one ICESat-2 pass sit in the same fold (no leakage along a track).
    Returns out-of-fold predictions' metrics overall, in 0–8 m, and by 2 m depth band."""
    r = np.asarray(r, float)
    z = np.asarray(z, float)
    uniq = sorted(set(groups))
    k = max(2, min(k, len(uniq)))
    fold_of = {g: i % k for i, g in enumerate(uniq)}
    folds = np.array([fold_of[g] for g in groups])
    pred = np.full(len(z), np.nan)
    for f in range(k):
        test = folds == f
        train = ~test
        if train.sum() < 3 or test.sum() == 0:
            continue
        pred[test] = fit_linear(r[train], z[train]).predict(r[test])
    ok = np.isfinite(pred)
    lo, hi = ACCEPT_RANGE
    inr = ok & (z >= lo) & (z <= hi)
    bands = {}
    for a in range(0, 10, 2):
        m = ok & (z >= a) & (z < a + 2)
        bands[f"{a}-{a + 2}"] = metrics(z[m], pred[m])
    return {"passes": len(uniq), "folds": k, "all": metrics(z[ok], pred[ok]), "range_0_8": metrics(z[inr], pred[inr]), "by_band": bands, "pred": pred}


def accept(cv: dict, independent_n: int) -> tuple[bool, list[str]]:
    """The SDB enters the model only when all three hold; returns the decision and the reasons it failed."""
    m = cv["range_0_8"]
    why = []
    if independent_n < ACCEPT_N:
        why.append(f"bağımsız kalibrasyon noktası {independent_n} < {ACCEPT_N}")
    if m["rmse"] is None or m["rmse"] > ACCEPT_RMSE:
        why.append(f"0–8 m RMSE {m['rmse']} > {ACCEPT_RMSE} m" if m["rmse"] is not None else "0–8 m'de doğrulama noktası yok")
    if m["r2"] is None or m["r2"] < ACCEPT_R2:
        why.append(f"0–8 m R² {m['r2']} < {ACCEPT_R2}" if m["r2"] is not None else "R² hesaplanamadı")
    return (not why, why)


def haversine_m(lat1, lon1, lat2, lon2):
    r = math.pi / 180
    a = np.sin((np.asarray(lat2) - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * np.cos(np.asarray(lat2) * r) * np.sin((np.asarray(lon2) - lon1) * r / 2) ** 2
    return 2 * 6_371_000 * np.arcsin(np.sqrt(a))


BANDS = ((0.0, 50.0), (50.0, 150.0))


def spot_bands(lat: float, lon: float, plat, plon, depth, sigma, groups: list[str] | None = None, min_n: int = 3) -> list[dict | None]:
    """Depth in the two cast bands (0–50 m, 50–150 m from the tip): median of the points in the annulus and its
    uncertainty = the larger of the median point sigma / √(independent groups) and the spread (IQR/1.35) / √n.
    None where fewer than `min_n` points fall in the band (no estimate; never filled in)."""
    dist = haversine_m(lat, lon, plat, plon)
    depth = np.asarray(depth, float)
    sigma = np.asarray(sigma, float)
    out: list[dict | None] = []
    for a, b in BANDS:
        m = (dist >= a) & (dist < b) & np.isfinite(depth)
        n = int(m.sum())
        if n < min_n:
            out.append(None)
            continue
        d = depth[m]
        g = len(set(np.asarray(groups)[m])) if groups is not None else n
        q1, q3 = np.percentile(d, [25, 75])
        s_point = float(np.nanmedian(sigma[m])) / math.sqrt(max(g, 1))
        s_spread = float(q3 - q1) / 1.35 / math.sqrt(n)
        out.append({"depth_m": round(float(np.median(d)), 2), "sigma_m": round(max(s_point, s_spread, 0.1), 2), "n": n, "groups": g})
    return out
