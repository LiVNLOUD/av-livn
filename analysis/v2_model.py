"""v2 HSI draft (analysis only, not production). Equations and parameters are documented in docs/MODEL.md.

score = 100 · HSI_s(m) · HSI_d(m, t); HSI = weighted geometric mean of components clipped to [0.05, 1].
Every parameter carries an evidence level (A/B/C); Monte Carlo draws scale each one by a log-normal factor
whose sigma depends on that level (A 0.10, B 0.25, C 0.50).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

LO = 0.05
SIGMA = {"A": 0.10, "B": 0.25, "C": 0.50}

# name: (value, unit, evidence, RESEARCH.md ref)
PARAMS: dict[str, tuple[float, str, str, str]] = {
    # ambient light (log10 lux model) and diel arms
    "night_theta": (0.0, "log10 lux", "C", "R7"),        # arm switch centre ~1 lux (civil twilight)
    "night_slope": (0.4, "log10 lux", "C", "R7"),
    "lamp_lux": (20.0, "lux", "C", "R8,R12"),                 # pier lamp illuminance at the water surface
    "contrast_mid": (1.5, "log10", "C", "R8"),            # lamp/ambient ratio at half effect (~30×)
    "contrast_slope": (0.5, "log10", "C", "R8"),
    "dark_base": (0.10, "-", "C", "R7"),                  # night arm floor without a lamp
    "moon_gain": (0.15, "-", "C", "R7"),
    "twilight_centre": (-3.0, "deg", "C", "R7"),          # crepuscular feeding peak (sun altitude)
    "twilight_width": (3.5, "deg", "C", "R7"),
    "twilight_gain": (0.35, "-", "C", "R7"),
    "bright_k": (0.8, "-", "C", "R10"),                   # bright midday pushes fish deeper: shallow spots lose more
    # static habitat
    "struct_pier": (0.75, "-", "C", "—"),
    "struct_breakwater": (0.85, "-", "C", "—"),
    "struct_len_km": (0.15, "km", "C", "—"),
    "depth_mid": (3.5, "m", "C", "R10"),                  # day reachability half point
    "depth_slope": (1.2, "m", "C", "R10"),
    "dtm_weight_interp": (0.3, "-", "C", "DATA-AUDIT"),   # trust in an interpolated (GEBCO) DTM cell
    "fetch_ref_km": (3.0, "km", "C", "—"),
    # dynamic
    "wind_ref_kmh": (30.0, "km/sa", "C", "—"),
    "wave_ref_m": (1.0, "m", "C", "—"),
    "turb_rain_mm": (15.0, "mm/48 sa", "C", "R11"),
    "turb_wave_m": (1.5, "m", "C", "R11"),
    "turb_max_loss": (0.5, "-", "C", "R11"),
    "sst_drop_tol": (0.5, "°C/48 sa", "C", "—"),
    "sst_drop_scale": (1.5, "°C/48 sa", "C", "—"),
    "press_rate": (3.0, "hPa/3 sa", "C", "—"),
    "press_loss": (0.2, "-", "C", "—"),
    "season_base": (0.30, "-", "C", "R3"),
    "season_spawn_amp": (0.45, "-", "C", "R1,R2"),
    "season_spawn_doy": (210.0, "gün", "A", "R1,R2"),
    "season_spawn_w": (45.0, "gün", "A", "R1,R2"),
    "season_autumn_amp": (0.70, "-", "C", "R3"),
    "season_autumn_doy": (285.0, "gün", "A", "R3"),
    "season_autumn_w": (35.0, "gün", "B", "R3"),
    # weights (dynamic)
    "w_diel": (0.40, "-", "C", ""),
    "w_season": (0.20, "-", "C", ""),
    "w_wind": (0.15, "-", "C", ""),
    "w_sst": (0.08, "-", "C", ""),
    "w_turb": (0.09, "-", "C", ""),
    "w_press": (0.04, "-", "C", ""),
    "w_current": (0.04, "-", "C", ""),
    # weights (static)
    "w_struct": (0.75, "-", "C", ""),
    "w_substrate": (0.25, "-", "C", ""),
}

SUBSTRATE_VALUE = {"Fine mud": 0.70, "Sandy mud": 0.75, "Muddy sand": 0.80, "Sand": 0.80, "Coarse": 0.90, "Rock": 0.95}
SUBSTRATE_PRIOR = 0.75
CONF_WEIGHT = {0: 0.2, 1: 0.4, 2: 0.6, 3: 0.8}
LAMP_PRIOR = {"ferry": 0.85, "pier": 0.50, "breakwater": 0.30, "groyne": 0.30}


def params(rng: np.random.Generator | None = None) -> dict[str, float]:
    if rng is None:
        return {k: v[0] for k, v in PARAMS.items()}
    return {k: v[0] * float(np.exp(rng.normal(0, SIGMA[v[2]]))) if k not in ("twilight_centre", "night_theta") else v[0] + float(rng.normal(0, SIGMA[v[2]] * 2))
            for k, v in PARAMS.items()}


def clip(x):
    return np.clip(x, LO, 1.0)


def sig(x):
    return 1 / (1 + np.exp(-x))


def geo(parts: list[tuple[np.ndarray | float, float]]):
    tw = sum(w for _, w in parts)
    return np.exp(sum(w * np.log(clip(c)) for c, w in parts) / tw)


@dataclass
class Static:
    kind: str                # pier | breakwater | groyne
    ferry: bool
    length_m: float
    depth_0_50: float | None     # DTM mean, m (positive down)
    depth_50_150: float | None
    dtm_interpolated: bool
    substrate: str | None
    substrate_conf: int | None
    fetch_km: list[float]    # 16 directions, 0°, 22.5°, …
    lamp: bool | None        # True / False / None (unknown)


def depth_prior(s: Static) -> float:
    if s.kind == "breakwater":
        d = 2.0 + 4.0 * (1 - math.exp(-s.length_m / 400))
    else:
        d = 1.0 + 4.0 * (1 - math.exp(-s.length_m / 250))
    return max(d, 5.0) if s.ferry else d


def static_terms(s: Static, p: dict[str, float]) -> dict[str, float]:
    base = p["struct_breakwater"] if s.kind == "breakwater" else p["struct_pier"]
    struct = base * (0.4 + 0.6 * (1 - math.exp(-s.length_m / 1000 / p["struct_len_km"])))
    w_dtm = p["dtm_weight_interp"] if s.dtm_interpolated else 0.9
    prior = depth_prior(s)

    def est(d):
        return prior if d is None or math.isnan(d) else w_dtm * d + (1 - w_dtm) * prior

    d_cast = 0.4 * est(s.depth_0_50) + 0.6 * est(s.depth_50_150)
    c_depth = LO + (1 - LO) * sig((d_cast - p["depth_mid"]) / p["depth_slope"])
    sv = SUBSTRATE_VALUE.get(s.substrate or "", SUBSTRATE_PRIOR)
    cw = CONF_WEIGHT.get(s.substrate_conf or 0, 0.2)
    sub = cw * sv + (1 - cw) * SUBSTRATE_PRIOR
    hsi_s = float(geo([(struct, p["w_struct"]), (sub, p["w_substrate"])]))
    return {"struct": struct, "substrate": sub, "depth": float(c_depth), "depth_m": d_cast, "hsi_s": hsi_s}


def ambient_log_lux(sun_alt, moon_alt, moon_frac, cloud_pct):
    """log10 illuminance at the surface: smooth sun term, moon term, starlight floor; cloud per Kasten & Czeplak."""
    twilight = 10 ** (-3 + 6.3 / (1 + np.exp(-(sun_alt + 3) / 2.2)))   # ~1e-3 lux (night) … ~400 lux (sunrise)
    sun = np.maximum(1.3e5 * np.sin(np.radians(np.clip(sun_alt, 0, 90))), twilight)  # daylight ∝ sin(altitude)
    moon = 0.25 * moon_frac * np.clip(np.sin(np.radians(moon_alt)), 0, None)
    att = 1 - 0.75 * (np.clip(cloud_pct, 0, 100) / 100) ** 3.4
    return np.log10((sun + moon) * att + 1e-3)


def season(doy, p):
    def g(c, w):
        d = np.minimum(np.abs(doy - c), 365 - np.abs(doy - c))
        return np.exp(-0.5 * (d / w) ** 2)
    return clip(p["season_base"] + p["season_spawn_amp"] * g(p["season_spawn_doy"], p["season_spawn_w"])
                + p["season_autumn_amp"] * g(p["season_autumn_doy"], p["season_autumn_w"]))


def exposure(fetch_km: list[float], dir_from, p):
    f = np.asarray(fetch_km)
    idx = np.round(np.asarray(dir_from) / 22.5).astype(int) % 16
    return f[idx] / (f[idx] + p["fetch_ref_km"])


def dynamic(s: Static, st: dict[str, float], w: dict[str, np.ndarray], p: dict[str, float], lamp: bool) -> dict[str, np.ndarray]:
    """w: hourly arrays sun_alt, moon_alt, moon_frac, cloud, wind_kmh, gust_kmh, wind_dir, wave_m, wave_dir,
    rain48_mm, sst_d48, press_d3, current_ms, doy."""
    logE = ambient_log_lux(w["sun_alt"], w["moon_alt"], w["moon_frac"], w["cloud"])
    w_night = sig(-(logE - p["night_theta"]) / p["night_slope"])
    if lamp:
        k = sig((np.log10(p["lamp_lux"]) - logE - p["contrast_mid"]) / p["contrast_slope"])
        arm_n = p["dark_base"] + (1 - p["dark_base"]) * k
    else:
        moon_idx = np.clip((logE + 3) / 3, 0, 1)
        arm_n = p["dark_base"] + p["moon_gain"] * moon_idx
    # Day arm: depth reachability, sharpened under bright light (sun high, clear sky) where fish sit deeper.
    bright = np.clip((logE - 3) / 2.2, 0, 1)
    arm_d = st["depth"] ** (1 + p["bright_k"] * bright)
    mix = w_night * arm_n + (1 - w_night) * arm_d
    tw = np.exp(-0.5 * ((w["sun_alt"] - p["twilight_centre"]) / p["twilight_width"]) ** 2)
    diel = clip(mix + p["twilight_gain"] * tw * (1 - mix))

    u = np.maximum(w["wind_kmh"], 0.7 * w["gust_kmh"])
    e_wind = exposure(s.fetch_km, w["wind_dir"], p)
    e_wave = exposure(s.fetch_km, w["wave_dir"], p)
    hs = w["wave_m"] * e_wave
    x = (u / p["wind_ref_kmh"]) ** 2 * e_wind + (hs / p["wave_ref_m"]) ** 2
    c_wind = clip(1 / (1 + x ** 2))
    tau = 1 - np.exp(-(w["rain48_mm"] / p["turb_rain_mm"] + hs / p["turb_wave_m"]))
    c_turb = clip(1 - p["turb_max_loss"] * tau)
    drop = np.minimum(0, w["sst_d48"] + p["sst_drop_tol"])
    c_sst = clip(np.exp(-0.5 * (drop / p["sst_drop_scale"]) ** 2))
    c_press = clip(1 - p["press_loss"] * sig((np.abs(w["press_d3"]) - p["press_rate"]) / 1.0))
    c_cur = clip(0.7 + 0.3 * sig((w["current_ms"] - 0.05) / 0.03))
    c_season = season(w["doy"], p)
    hsi_d = geo([(diel, p["w_diel"]), (c_season, p["w_season"]), (c_wind, p["w_wind"]), (c_sst, p["w_sst"]),
                 (c_turb, p["w_turb"]), (c_press, p["w_press"]), (c_cur, p["w_current"])])
    return {"diel": diel, "season": c_season, "wind": c_wind, "turb": c_turb, "sst": c_sst, "press": c_press, "current": c_cur,
            "w_night": w_night, "logE": logE, "hsi_d": hsi_d}


def score(s: Static, w: dict[str, np.ndarray], p: dict[str, float], lamp_draw: bool | None = None) -> np.ndarray:
    """Expected score. Unknown lamp → probability-weighted mixture unless lamp_draw fixes a scenario (Monte Carlo)."""
    st = static_terms(s, p)
    if s.lamp is not None or lamp_draw is not None:
        lamp = s.lamp if s.lamp is not None else lamp_draw
        return 100 * st["hsi_s"] * dynamic(s, st, w, p, bool(lamp))["hsi_d"]
    q = LAMP_PRIOR["ferry"] if s.ferry else LAMP_PRIOR.get(s.kind, 0.5)
    return 100 * st["hsi_s"] * (q * dynamic(s, st, w, p, True)["hsi_d"] + (1 - q) * dynamic(s, st, w, p, False)["hsi_d"])


def band(s: Static, w: dict[str, np.ndarray], n: int = 300, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    """10–90 % band: parameters drawn by evidence level; an unknown lamp is drawn as a Bernoulli scenario."""
    rng = np.random.default_rng(seed)
    q = LAMP_PRIOR["ferry"] if s.ferry else LAMP_PRIOR.get(s.kind, 0.5)
    draws = []
    for _ in range(n):
        p = params(rng)
        lamp = None if s.lamp is not None else bool(rng.random() < q)
        draws.append(score(s, w, p, lamp))
    a = np.array(draws)
    return np.percentile(a, 10, axis=0), np.percentile(a, 90, axis=0)
