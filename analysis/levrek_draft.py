"""G4: levrek (Dicentrarchus labrax) v1 draft HSI on today's spots, mock weather (analysis only, not in the app).

  python analysis/levrek_draft.py      → docs/species/levrek/SENSITIVITY.md

Same skeleton as the istavrit v2 model (docs/MODEL.md): score = 100 · calib(HSI_s · HSI_d), weighted geometric means,
every term in [0.05, 1]. Parameters and evidence: docs/species/levrek/MODEL.md. Weather is MOCKED (five fixed
scenarios), so the spread across spots comes from the static terms and the exposure only.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/species/levrek/SENSITIVITY.md"

P = {
    # static
    "struct": {"rocky": 0.85, "river_mouth": 0.85, "breakwater": 0.75, "groyne": 0.7, "beach": 0.6, "pier": 0.55, "quay": 0.5, "harbour": 0.45, "manual": 0.55},
    "substrate": {"kaya": 1.0, "karisik": 0.85, "kum": 0.7, "camur": 0.45, None: 0.7},
    "w_struct": 0.7, "w_substrate": 0.3,
    # dynamic weights
    "w_diel": 0.25, "w_season": 0.2, "w_turb": 0.2, "w_wave": 0.15, "w_sst": 0.1, "w_river": 0.05, "w_press": 0.05,
    # diel
    "day_floor": 0.3, "twilight_c": -3.0, "twilight_w": 4.0, "night": 0.8, "lamp_gain": 0.05,
    # season (day of year, circular)
    "season_base": 0.35, "winter_doy": 20, "winter_w": 45, "winter_amp": 0.6, "autumn_doy": 300, "autumn_w": 30, "autumn_amp": 0.35,
    # turbidity index T in [0, 1] (rain48 + wave proxy): optimum moderate
    "turb_opt": 0.45, "turb_w": 0.28, "turb_floor": 0.45,
    # post-storm bonus: wave max of last 48 h ≥ storm_m and now ≤ settle × max
    "storm_m": 1.0, "settle": 0.7, "post_storm": 1.25,
    # wave on the shore: optimum "surf line" height, scaled by exposure
    "wave_opt": 0.6, "wave_w": 0.5,
    # temperature: 48 h drop and absolute floor
    "sst_drop_tol": 1.0, "sst_drop_scale": 1.5, "sst_floor": 9.0,
    # river mouth: 72 h rain
    "river_mm": 20.0,
    # safety gate (shown capped at 30, as for istavrit)
    "gate_wave_exposed": 1.6,
}


def clip(x: float) -> float:
    return max(0.05, min(1.0, x))


def gauss(x: float, c: float, w: float) -> float:
    return math.exp(-0.5 * ((x - c) / w) ** 2)


def circ(doy: float, c: float, w: float) -> float:
    d = min(abs(doy - c), 365 - abs(doy - c))
    return math.exp(-0.5 * (d / w) ** 2)


def geo(parts: list[tuple[float, float]]) -> float:
    sw = sum(w for _, w in parts)
    return math.exp(sum(w * math.log(clip(v)) for v, w in parts) / sw)


def exposure(fetch_km: list[float] | None, onshore_dir: float | None) -> float:
    """0..1: open water in front of the spot (mean fetch, 3 km → ~0.5)."""
    if not fetch_km:
        return 0.5
    m = sum(fetch_km) / len(fetch_km)
    return 1 - math.exp(-m / 4.0)


def static(spot: dict) -> float:
    k = spot.get("kind") or "manual"
    sub = spot.get("substrate") or None
    sub = sub if sub in P["substrate"] else None
    return geo([(P["struct"].get(k, 0.55), P["w_struct"]), (P["substrate"][sub], P["w_substrate"])])


def dynamic(spot: dict, w: dict) -> tuple[float, bool]:
    exp = exposure(spot.get("fetch_km"), None)
    # diel: floor at midday, twilight peak, night plateau; existing pier lighting adds little (md. 8/8: no own light)
    sun = w["sun_alt"]
    diel = max(P["day_floor"] if sun > 6 else 0.0, P["night"] if sun < -6 else 0.0, gauss(sun, P["twilight_c"], P["twilight_w"]))
    diel = clip(diel + (P["lamp_gain"] if spot.get("has_light") and sun < -6 else 0.0))
    season = clip(P["season_base"] + P["winter_amp"] * circ(w["doy"], P["winter_doy"], P["winter_w"]) + P["autumn_amp"] * circ(w["doy"], P["autumn_doy"], P["autumn_w"]))
    T = min(1.0, 0.6 * min(1.0, w["rain48"] / 15) + 0.4 * min(1.0, w["wave"] / 1.5))
    turb = clip(P["turb_floor"] + (1 - P["turb_floor"]) * gauss(T, P["turb_opt"], P["turb_w"]))
    if w["wave_max48"] >= P["storm_m"] and w["wave"] <= P["settle"] * w["wave_max48"]:
        turb = clip(turb * P["post_storm"])
    wave_here = w["wave"] * exp
    wave = clip(0.35 + 0.65 * gauss(wave_here, P["wave_opt"], P["wave_w"]))
    drop = max(0.0, -w["sst_d48"])
    sst = clip(1 - 0.6 / (1 + math.exp(-(drop - P["sst_drop_tol"]) * 3 / P["sst_drop_scale"])))
    if w["sst"] < P["sst_floor"]:
        sst = clip(sst * 0.6)
    river = clip(0.5 + 0.5 * min(1.0, w["rain72"] / P["river_mm"])) if spot.get("kind") == "river_mouth" else 0.6
    press = 0.8
    gated = w["wave"] * exp >= P["gate_wave_exposed"] * 0.6 and w["wave"] >= P["gate_wave_exposed"]
    return geo([(diel, P["w_diel"]), (season, P["w_season"]), (turb, P["w_turb"]), (wave, P["w_wave"]), (sst, P["w_sst"]), (river, P["w_river"]), (press, P["w_press"])]), gated


# two anchors as in the istavrit calibration: ideal → 92, worst → 8 (log-linear)
IDEAL_SPOT = {"kind": "rocky", "substrate": "kaya", "fetch_km": [3.0] * 16, "has_light": False}
IDEAL_W = {"sun_alt": -3, "doy": 20, "rain48": 7, "wave": 0.9, "wave_max48": 1.8, "sst_d48": -0.2, "sst": 12, "rain72": 10}
WORST_SPOT = {"kind": "harbour", "substrate": "camur", "fetch_km": [0.2] * 16, "has_light": False}
WORST_W = {"sun_alt": 50, "doy": 200, "rain48": 0, "wave": 0.0, "wave_max48": 0.0, "sst_d48": -4, "sst": 8, "rain72": 0}


def raw(spot: dict, w: dict) -> tuple[float, bool]:
    d, g = dynamic(spot, w)
    return static(spot) * d, g


R_I = raw(IDEAL_SPOT, IDEAL_W)[0]
R_W = raw(WORST_SPOT, WORST_W)[0]


def score(spot: dict, w: dict) -> float:
    r, gated = raw(spot, w)
    s = 8 + 84 * (math.log(r) - math.log(R_W)) / (math.log(R_I) - math.log(R_W))
    s = max(0.0, min(100.0, s))
    return min(s, 30.0) if gated else s


# five mock scenarios (January, Gemlik Bay)
SCEN = {
    "sakin berrak gece": {"sun_alt": -30, "doy": 20, "rain48": 0, "wave": 0.15, "wave_max48": 0.3, "sst_d48": 0.0, "sst": 11, "rain72": 0},
    "fırtına ertesi bulanık gece": {"sun_alt": -30, "doy": 20, "rain48": 8, "wave": 0.7, "wave_max48": 1.8, "sst_d48": -0.3, "sst": 11, "rain72": 12},
    "öğle, sakin berrak": {"sun_alt": 30, "doy": 20, "rain48": 0, "wave": 0.15, "wave_max48": 0.3, "sst_d48": 0.0, "sst": 11, "rain72": 0},
    "yağış sonrası alacakaranlık": {"sun_alt": -3, "doy": 20, "rain48": 20, "wave": 0.4, "wave_max48": 0.6, "sst_d48": -0.5, "sst": 11, "rain72": 30},
    "kış ani soğuma gecesi": {"sun_alt": -30, "doy": 20, "rain48": 2, "wave": 0.3, "wave_max48": 0.5, "sst_d48": -3.0, "sst": 8.5, "rain72": 2},
    "fırtına sırasında": {"sun_alt": -30, "doy": 20, "rain48": 15, "wave": 2.2, "wave_max48": 2.4, "sst_d48": -0.5, "sst": 11, "rain72": 15},
}


def direction_tests(spots: list[dict]) -> list[tuple[str, bool, str]]:
    rocky = next((s for s in spots if s.get("kind") == "rocky"), IDEAL_SPOT)
    mouth = next((s for s in spots if s.get("kind") == "river_mouth"), {"kind": "river_mouth", "fetch_km": [2.0] * 16})
    beach = max((s for s in spots if s.get("kind") == "beach"), key=lambda s: exposure(s.get("fetch_km"), None), default={"kind": "beach", "fetch_km": [4.0] * 16})
    exposed = max(spots, key=lambda s: exposure(s.get("fetch_km"), None))
    a = score(rocky, SCEN["fırtına ertesi bulanık gece"]), score(rocky, SCEN["sakin berrak gece"])
    b = score(rocky, {**SCEN["sakin berrak gece"], "sun_alt": -3}), score(rocky, SCEN["sakin berrak gece"]), score(rocky, SCEN["öğle, sakin berrak"])
    c = score(mouth, SCEN["yağış sonrası alacakaranlık"]), score(beach, SCEN["yağış sonrası alacakaranlık"])
    d = score(rocky, SCEN["kış ani soğuma gecesi"]), score(rocky, SCEN["sakin berrak gece"])
    e = score(exposed, SCEN["fırtına sırasında"])
    return [
        ("1. fırtına ertesi bulanık su > berrak sakin su (kayalık, gece)", a[0] > a[1], f"{a[0]:.0f} > {a[1]:.0f}"),
        ("2. alacakaranlık ve gece > öğle (kayalık, sakin)", b[0] > b[2] and b[1] > b[2], f"{b[0]:.0f}, {b[1]:.0f} > {b[2]:.0f}"),
        ("3. yağış sonrası dere ağzı > açık kumsal", c[0] > c[1], f"{c[0]:.0f} > {c[1]:.0f}"),
        ("4. kış ani soğuma (−3 °C/48 sa, 8,5 °C) puanı düşürür", d[0] < d[1], f"{d[0]:.0f} < {d[1]:.0f}"),
        ("5. fırtına sırasında maruz mera güvenlik kapısında (≤ 30)", e <= 30, f"{e:.0f} ≤ 30 ({exposed.get('name', exposed.get('kind'))})"),
    ]


def main() -> int:
    fc = json.loads((ROOT / "data/spots.geojson").read_text())
    spots = [dict(f["properties"]) for f in fc["features"] if f["properties"].get("status") not in ("rejected", "proposed")]
    lines = [
        "# Levrek v1 taslak — duyarlılık (mock hava)", "",
        "Üretildi: `python analysis/levrek_draft.py`. Hava **mock** (ocak, Gemlik Körfezi, sabit senaryolar); meralar `data/spots.geojson`",
        f"({len(spots)} kayıt; G1 temizliğinden önceki envanter olabilir). Yalnız tasarım doğrulaması: uygulamada levrek puanı yok.", "",
        "## Senaryolara göre meralar arası yayılım", "",
        "| Senaryo | min | medyan | max | en iyi tip (medyan) |", "|---|---|---|---|---|",
    ]
    for name, w in SCEN.items():
        sc = sorted(score(s, w) for s in spots)
        med = sc[len(sc) // 2]
        by: dict[str, list[float]] = {}
        for s in spots:
            by.setdefault(s.get("kind") or "?", []).append(score(s, w))
        best = max(by.items(), key=lambda kv: sorted(kv[1])[len(kv[1]) // 2])
        lines.append(f"| {name} | {sc[0]:.0f} | {med:.0f} | {sc[-1]:.0f} | {best[0]} ({sorted(best[1])[len(best[1]) // 2]:.0f}) |")
    lines += ["", "## Tipe göre medyan (fırtına ertesi bulanık gece)", "", "| Tip | n | medyan |", "|---|---|---|"]
    by = {}
    for s in spots:
        by.setdefault(s.get("kind") or "?", []).append(score(s, SCEN["fırtına ertesi bulanık gece"]))
    for k, v in sorted(by.items(), key=lambda kv: -sorted(kv[1])[len(kv[1]) // 2]):
        lines.append(f"| {k} | {len(v)} | {sorted(v)[len(v) // 2]:.0f} |")
    lines += ["", "## Yön testleri", "", "| Test | Sonuç | Değerler |", "|---|---|---|"]
    tests = direction_tests(spots)
    for name, ok, val in tests:
        lines.append(f"| {name} | {'geçti' if ok else 'KALDI'} | {val} |")
    lines += ["", f"Ölçek: ideal senaryo 92, en kötü 8 (ham {R_I:.3f} / {R_W:.4f}).", ""]
    OUT.write_text("\n".join(lines))
    print("\n".join(lines))
    return 0 if all(ok for _, ok, _ in tests) else 1


if __name__ == "__main__":
    raise SystemExit(main())
