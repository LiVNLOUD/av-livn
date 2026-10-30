"""v1 vs v2 sensitivity analysis for the 16 candidate spots × 72 h (analysis only).

  python analysis/v2_draft.py fetch wx_d1.json  # snapshot: live v1 scores (av.livn.tr) + D1 weather + Open-Meteo marine → analysis/data/v2_inputs.json
  python analysis/v2_draft.py run     # deterministic: v2 draft + Monte Carlo band + direction tests → docs/audit/v2_sensitivity.{json,md,png}

Copernicus is MOCKED: water temperature and current come from Open-Meteo Marine at the spot's sea probe.
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import v2_model as m  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SNAP = ROOT / "analysis/data/v2_inputs.json"
OUT = ROOT / "docs/audit"
FERRY = {"osm-way-1233883494", "osm-way-503770078"}  # Mudanya, İDO Güzelyalı
UA = {"User-Agent": "av-livn analysis"}


def get(url: str, tries: int = 4) -> dict:
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)
        except urllib.error.URLError as e:  # transient TLS/proxy resets
            if k == tries - 1 or getattr(e, "code", None) == 429:
                raise
            time.sleep(2 ** k)
    raise RuntimeError(url)


# ---------------------------------------------------------------- astronomy (low precision, ~0.5°)

def _jd(t: datetime) -> float:
    return t.timestamp() / 86400 + 2440587.5


def _alt(ra: float, dec: float, t: datetime, lat: float, lon: float) -> float:
    d = _jd(t) - 2451545.0
    gmst = math.radians((280.46061837 + 360.98564736629 * d) % 360)
    ha = gmst + math.radians(lon) - ra
    la = math.radians(lat)
    return math.degrees(math.asin(math.sin(la) * math.sin(dec) + math.cos(la) * math.cos(dec) * math.cos(ha)))


def _eq(lam: float, beta: float, d: float) -> tuple[float, float]:
    eps = math.radians(23.439 - 4e-7 * d)
    ra = math.atan2(math.sin(lam) * math.cos(eps) - math.tan(beta) * math.sin(eps), math.cos(lam))
    dec = math.asin(math.sin(beta) * math.cos(eps) + math.cos(beta) * math.sin(eps) * math.sin(lam))
    return ra, dec


def sun_moon(t: datetime, lat: float, lon: float) -> tuple[float, float, float]:
    d = _jd(t) - 2451545.0
    g = math.radians((357.529 + 0.98560028 * d) % 360)
    q = (280.459 + 0.98564736 * d) % 360
    sl = math.radians(q + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g))
    sun_alt = _alt(*_eq(sl, 0.0, d), t, lat, lon)
    # Moon: truncated series (Astronomical Almanac low-precision formulae)
    T = d / 36525
    L = math.radians((218.32 + 481267.881 * T) % 360)
    Mm = math.radians((134.9 + 477198.85 * T) % 360)
    D = math.radians((297.85 + 445267.11 * T) % 360)
    F = math.radians((93.27 + 483202.02 * T) % 360)
    lam = L + math.radians(6.29 * math.sin(Mm) - 1.27 * math.sin(Mm - 2 * D) + 0.66 * math.sin(2 * D) + 0.21 * math.sin(2 * Mm))
    beta = math.radians(5.13 * math.sin(F))
    moon_alt = _alt(*_eq(lam, beta, d), t, lat, lon)
    elong = math.acos(math.cos(lam - sl) * math.cos(beta))
    frac = (1 - math.cos(elong)) / 2
    return sun_alt, moon_alt, frac


# ---------------------------------------------------------------- inputs

def static_inputs() -> dict[str, m.Static]:
    spots = json.loads((ROOT / "data/spots.geojson").read_text())["features"]
    hab = {s["spot"]: s for s in json.loads((OUT / "habitat_audit.json").read_text())["spots"]}
    fr = {s["spot"]: s for s in json.loads((OUT / "fetch_rose.json").read_text())["spots"]}
    out = {}
    for f in spots:
        p = f["properties"]
        prof = p.get("profile") or []

        def mean(a, b):
            v = [x for x in prof[a:b] if x is not None]
            return float(np.mean(v)) if v else None

        out[p["id"]] = m.Static(
            kind=p["kind"], ferry=p["id"] in FERRY, length_m=float(p.get("length_m") or 50),
            depth_0_50=mean(0, 3), depth_50_150=mean(2, 7), dtm_interpolated=True,  # DATA-AUDIT: all 16 transects interpolated
            substrate=hab[p["id"]]["eunis_substrate"], substrate_conf=hab[p["id"]]["confidence_at_class_point"],
            fetch_km=[r["osm_km"] for r in fr[p["id"]]["rose"]], lamp=p.get("has_light"),
        )
    return out


def fetch() -> None:
    spots = json.loads((ROOT / "data/spots.geojson").read_text())["features"]
    snap = {"fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "spots": {}}
    pts = [f["geometry"]["coordinates"] for f in spots]
    probes = [(f["properties"].get("probe_lon") or c[0], f["properties"].get("probe_lat") or c[1]) for f, c in zip(spots, pts)]
    common = {"timezone": "GMT", "past_days": 3, "forecast_days": 4}
    # Weather: the Open-Meteo forecast series the live Worker already stored in D1 (forecast_snapshots, read-only
    # export: `wrangler d1 execute av-livn --remote --json --command "SELECT s.id AS spot, f.json FROM spots s
    # JOIN forecast_snapshots f ON f.cell_id = s.wx_cell"` → argv[2]); avoids a second Open-Meteo forecast pull.
    rows = json.loads(Path(sys.argv[2]).read_text())[0]["results"]
    wxs = {}
    for r in rows:
        j = json.loads(r["json"])
        t0 = datetime.strptime(j["t0"], "%Y-%m-%dT%H:%MZ")
        n = len(next(iter(j["v"].values())))
        wxs[r["spot"]] = {"time": [(t0 + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(n)], **j["v"]}
    sea = get("https://marine-api.open-meteo.com/v1/marine?" + urllib.parse.urlencode({
        **common, "latitude": ",".join(str(c[1]) for c in probes), "longitude": ",".join(str(c[0]) for c in probes),
        "hourly": "wave_height,wave_direction,sea_surface_temperature,ocean_current_velocity"}))
    for k, f in enumerate(spots):
        p = f["properties"]
        lon, lat = pts[k]
        live = get(f"https://av.livn.tr/api/spots/{urllib.parse.quote(p['id'])}?hours=72")
        h = live["packed"]["h"][live["from"]:live["from"] + 72]
        v1 = {"ts": [x[0] for x in h], "total": [x[1] for x in h]}
        snap["spots"][p["id"]] = {"name": p["name"], "lat": lat, "lon": lon, "v1": v1, "wx": wxs[p["id"]], "sea": sea[k]["hourly"]}
    SNAP.parent.mkdir(parents=True, exist_ok=True)
    SNAP.write_text(json.dumps(snap, ensure_ascii=False) + "\n")
    print("snapshot", snap["fetched_at"], len(snap["spots"]), "spots")


def series(s: dict) -> tuple[list[str], dict[str, np.ndarray]]:
    ts = s["v1"]["ts"]
    times = [datetime.strptime(t, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc) for t in ts]
    wx, sea = s["wx"], s["sea"]
    idx = {t: i for i, t in enumerate(wx["time"])}
    sidx = {t: i for i, t in enumerate(sea["time"])}

    def at(src, key, t, back=0, ix=idx):
        k = (t - timedelta(hours=back)).strftime("%Y-%m-%dT%H:%M")
        v = src[key][ix[k]] if k in ix else None
        return np.nan if v is None else float(v)

    w = {k: [] for k in ["sun_alt", "moon_alt", "moon_frac", "cloud", "wind_kmh", "gust_kmh", "wind_dir", "wave_m", "wave_dir",
                         "rain48_mm", "sst_d48", "press_d3", "current_ms", "doy"]}
    for t in times:
        sa, ma, mf = sun_moon(t, s["lat"], s["lon"])
        w["sun_alt"].append(sa); w["moon_alt"].append(ma); w["moon_frac"].append(mf)  # noqa: E702
        w["cloud"].append(at(wx, "cloud_cover", t))
        w["wind_kmh"].append(at(wx, "wind_speed_10m", t))
        w["gust_kmh"].append(at(wx, "wind_gusts_10m", t))
        w["wind_dir"].append(at(wx, "wind_direction_10m", t))
        w["rain48_mm"].append(np.nansum([at(wx, "precipitation", t, b) for b in range(48)]))
        w["press_d3"].append(at(wx, "pressure_msl", t) - at(wx, "pressure_msl", t, 3))
        w["wave_m"].append(at(sea, "wave_height", t, ix=sidx))
        w["wave_dir"].append(at(sea, "wave_direction", t, ix=sidx))
        w["sst_d48"].append(at(sea, "sea_surface_temperature", t, ix=sidx) - at(sea, "sea_surface_temperature", t, 48, ix=sidx))
        w["current_ms"].append(at(sea, "ocean_current_velocity", t, ix=sidx) / 3.6)  # km/h → m/s
        w["doy"].append(t.timetuple().tm_yday)
    arr = {k: np.nan_to_num(np.array(v, dtype=float), nan=0.0) for k, v in w.items()}
    return ts, arr


def calm(n: int, **over) -> dict[str, np.ndarray]:
    base = {"sun_alt": -30.0, "moon_alt": -10.0, "moon_frac": 0.5, "cloud": 20.0, "wind_kmh": 8.0, "gust_kmh": 12.0, "wind_dir": 0.0,
            "wave_m": 0.2, "wave_dir": 0.0, "rain48_mm": 0.0, "sst_d48": 0.0, "press_d3": 0.0, "current_ms": 0.1, "doy": 300.0}
    base.update(over)
    return {k: np.full(n, float(v)) for k, v in base.items()}


def plateau(x: np.ndarray) -> float:
    """Share of consecutive hours with identical score (rounded to 0.1)."""
    r = np.round(x, 1)
    return float(np.mean(r[1:] == r[:-1]))


def run() -> None:
    snap = json.loads(SNAP.read_text())
    st = static_inputs()
    ids = list(snap["spots"])
    p0 = m.params()
    v1 = np.array([[np.nan if x is None else x for x in snap["spots"][i]["v1"]["total"]] for i in ids])
    v2, lo, hi, light = [], [], [], None
    for i in ids:
        ts, w = series(snap["spots"][i])
        v2.append(m.score(st[i], w, p0))
        a, b = m.band(st[i], w, n=200)
        lo.append(a); hi.append(b)  # noqa: E702
        if light is None:
            light = w["sun_alt"]
    v2, lo, hi = np.array(v2), np.array(lo), np.array(hi)
    phase = np.where(light > 0, "day", np.where(light > -12, "twilight", "night"))

    def stats(a):
        std = np.nanstd(a, axis=0)
        return {
            "between_spot_std_mean": round(float(np.nanmean(std)), 2), "between_spot_std_min": round(float(np.nanmin(std)), 2),
            "hours_std_gt8_pct": round(100 * float(np.mean(std > 8)), 1),
            "by_phase": {ph: {"mean": round(float(np.nanmean(a[:, phase == ph])), 1), "std_between_spots": round(float(np.nanmean(std[phase == ph])), 2),
                              "range": [round(float(np.nanmin(a[:, phase == ph])), 1), round(float(np.nanmax(a[:, phase == ph])), 1)]}
                         for ph in ("night", "twilight", "day") if np.any(phase == ph)},
            "plateau_share_mean": round(float(np.mean([plateau(r[~np.isnan(r)]) for r in a])), 3),
            "distinct_values": int(len(np.unique(np.round(a[~np.isnan(a)], 1)))),
        }

    res = {"snapshot": snap["fetched_at"], "mock": "Copernicus mocked by Open-Meteo Marine SST/current at sea probe", "v1": stats(v1), "v2": stats(v2),
           "band_width_mean": round(float(np.mean(hi - lo)), 1)}
    res["acceptance"] = {
        "between_spot_std_gt8": res["v2"]["between_spot_std_mean"] > 8,
        "day_scores_vary_by_spot": res["v2"]["by_phase"].get("day", {}).get("std_between_spots", 0) > 3,
        "no_plateau": res["v2"]["plateau_share_mean"] < 0.2,
    }
    res["tests"] = direction_tests(st)
    res["ablation"] = ablation(snap, st, ids, p0)
    res["per_spot"] = [{"spot": i, "name": snap["spots"][i]["name"], **{k: round(v, 3) for k, v in m.static_terms(st[i], p0).items()},
                        "lamp_prior": m.LAMP_PRIOR["ferry"] if st[i].ferry else m.LAMP_PRIOR.get(st[i].kind, 0.5),
                        "v1_mean": round(float(np.nanmean(v1[k])), 1), "v2_mean": round(float(np.mean(v2[k])), 1),
                        "v2_day": round(float(np.mean(v2[k][phase == "day"])), 1) if np.any(phase == "day") else None,
                        "v2_night": round(float(np.mean(v2[k][phase == "night"])), 1) if np.any(phase == "night") else None,
                        "band_10_90_mean": [round(float(np.mean(lo[k])), 1), round(float(np.mean(hi[k])), 1)]}
                       for k, i in enumerate(ids)]
    (OUT / "v2_sensitivity.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n")
    figure(ids, snap, v1, v2, lo, hi)
    print(json.dumps({k: v for k, v in res.items() if k != "per_spot"}, ensure_ascii=False, indent=1))
    for r in res["per_spot"]:
        print(r)


def ablation(snap, st, ids, p0) -> dict:
    """Between-spot std (mean over hours) when one static source of difference is removed at a time."""
    import dataclasses

    def std_with(fn) -> float:
        rows = []
        for i in ids:
            _, w = series(snap["spots"][i])
            rows.append(m.score(fn(st[i]), w, p0))
        return round(float(np.mean(np.std(np.array(rows), axis=0))), 2)

    same_fetch = st[ids[0]].fetch_km
    return {
        "full": std_with(lambda s: s),
        "lamp_prior_equal_0_5": std_with(lambda s: dataclasses.replace(s, kind="pier", ferry=False) if s.lamp is None else s),
        "structure_equal": std_with(lambda s: dataclasses.replace(s, length_m=200.0, kind="pier")),
        "depth_equal": std_with(lambda s: dataclasses.replace(s, depth_0_50=None, depth_50_150=None, length_m=200.0, ferry=False)),
        "fetch_equal": std_with(lambda s: dataclasses.replace(s, fetch_km=same_fetch)),
        "all_static_equal": std_with(lambda s: dataclasses.replace(s, kind="pier", ferry=False, length_m=200.0, depth_0_50=None, depth_50_150=None,
                                                                   fetch_km=same_fetch, substrate=None, substrate_conf=0)),
    }


def direction_tests(st: dict[str, m.Static]) -> list[dict]:
    p = m.params()
    T = []
    base = st["osm-way-1414984335"]  # Fıstıklı pier
    lit = m.Static(**{**base.__dict__, "lamp": True})
    n = m.score(lit, calm(1, sun_alt=-30.0), p)[0]
    tw = m.score(lit, calm(1, sun_alt=-4.0), p)[0]
    d = m.score(lit, calm(1, sun_alt=40.0), p)[0]
    T.append({"id": 1, "test": "aynı mera (lamba var): gece > alacakaranlık > gündüz", "values": [round(n, 1), round(tw, 1), round(d, 1)], "pass": bool(n > tw > d)})

    deep = min(st, key=lambda k: -m.static_terms(st[k], p)["depth"] * m.static_terms(st[k], p)["struct"])
    shallow = m.Static(kind="pier", ferry=False, length_m=15, depth_0_50=0.3, depth_50_150=1.0, dtm_interpolated=False,
                       substrate="Muddy sand", substrate_conf=2, fetch_km=st[deep].fetch_km, lamp=False)
    a = m.score(m.Static(**{**st[deep].__dict__, "lamp": False}), calm(1, sun_alt=40.0), p)[0]
    b = m.score(shallow, calm(1, sun_alt=40.0), p)[0]
    T.append({"id": 2, "test": f"gündüz: derin+yapılı ({deep}) > sığ kumsal (sentetik 15 m iskele, 1 m)", "values": [round(a, 1), round(b, 1)], "pass": bool(a > b)})

    wind_dir = 225.0
    k = int(wind_dir / 22.5)
    exp_id = max(st, key=lambda s: st[s].fetch_km[k])
    shel_id = min(st, key=lambda s: st[s].fetch_km[k])
    storm = calm(1, sun_alt=40.0, wind_kmh=35.0, gust_kmh=50.0, wind_dir=wind_dir, wave_m=1.0, wave_dir=wind_dir)
    same = {"lamp": False, "length_m": 200.0, "kind": "pier", "ferry": False, "depth_0_50": 4.0, "depth_50_150": 6.0}
    e = m.score(m.Static(**{**st[exp_id].__dict__, **same}), storm, p)[0]
    s_ = m.score(m.Static(**{**st[shel_id].__dict__, **same}), storm, p)[0]
    T.append({"id": 3, "test": f"GB 35 km/sa + 1 m dalga: maruz ({exp_id}, fetch {st[exp_id].fetch_km[k]} km) < korunaklı ({shel_id}, {st[shel_id].fetch_km[k]} km); habitat eşitlendi",
              "values": [round(e, 1), round(s_, 1)], "pass": bool(e < s_)})

    w = calm(24, sun_alt=-30.0)
    w["sun_alt"] = np.linspace(-30, 40, 24)
    unk = m.Static(**{**base.__dict__, "lamp": None})
    yes = m.Static(**{**base.__dict__, "lamp": True})
    no = m.Static(**{**base.__dict__, "lamp": False})
    su, sy, sn = m.score(unk, w, p), m.score(yes, w, p), m.score(no, w, p)
    bu, by, bn = (np.mean(np.subtract(*m.band(x, w, n=200)[::-1])) for x in (unk, yes, no))
    between = bool(np.all((su <= np.maximum(sy, sn) + 1e-9) & (su >= np.minimum(sy, sn) - 1e-9)))
    T.append({"id": 4, "test": "lamba bilinmiyor: puan var/yok arasında, %10–90 bandı ikisinden geniş",
              "values": {"night_unknown_yes_no": [round(float(su[0]), 1), round(float(sy[0]), 1), round(float(sn[0]), 1)],
                         "band_width_unknown_yes_no": [round(float(bu), 1), round(float(by), 1), round(float(bn), 1)]},
              "pass": bool(between and bu > by and bu > bn)})

    jul = m.score(base, calm(1, sun_alt=-4.0, doy=196.0), p)[0]
    sep = m.score(base, calm(1, sun_alt=-4.0, doy=263.0), p)[0]
    T.append({"id": 5, "test": "mevsim: Eylül (üreme sonrası beslenme) > Temmuz (üreme zirvesi), R3/R1",
              "values": [round(sep, 1), round(jul, 1)], "pass": bool(sep > jul)})
    return T


def figure(ids, snap, v1, v2, lo, hi) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(2, 1, figsize=(12, 8), sharex=True)
    x = np.arange(v1.shape[1])
    for k in range(len(ids)):
        ax[0].plot(x, v1[k], lw=0.8, color="#888")
        ax[1].plot(x, v2[k], lw=0.9)
    ax[1].fill_between(x, lo.min(0), hi.max(0), color="#ccc", alpha=0.3, label="v2 %10–90 bandı (zarf)")
    ax[0].set_title("v1.1 (canlı) — 16 mera × 72 sa")
    ax[1].set_title("v2 taslak (mock Copernicus) — 16 mera × 72 sa")
    ax[1].set_xlabel(f"saat (başlangıç {snap['spots'][ids[0]]['v1']['ts'][0]})")
    for a in ax:
        a.set_ylim(0, 100)
        a.set_ylabel("puan")
    ax[1].legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(OUT / "v2_sensitivity.png", dpi=110)


if __name__ == "__main__":
    {"fetch": fetch, "run": run}[sys.argv[1] if len(sys.argv) > 1 else "run"]()
