"""Copernicus Marmara 500 m → per-spot hourly water temperature and current, and a short-term SST normal.

Runs only in GitHub Actions (ocean.yml; credentials in secrets, never printed). Writes D1 over the REST API.

  python -m av_pipeline.ocean.marmara forecast   # hourly series, now−3 d … now+5 d   → ocean_series
  python -m av_pipeline.ocean.marmara normal     # daily archive 2021-11 → today      → ocean_normal

Per spot the nearest wet model cell to the structure tip is used (≤ 0.8 km for all spots, docs/DATA-AUDIT.md §3).
- water temperature: mean of thetao over the 1–20 m levels present in that cell (shallow cells have fewer)
- current: mean speed √(uo² + vo²) over 1–5 m
- short normal: day-of-year mean of the daily 1–20 m temperature, ±WINDOW days (circular), only for days of
  year covered by ≥ MIN_YEARS years. 2021-11 → today is ~5 years of *analysis* (not a reanalysis): flagged C.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
import warnings
from pathlib import Path

import netCDF4
import numpy as np

TEM_H = "cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i"
CUR_H = "cmems_mod_blk_phy-cur_anfc_mrm-500m_PT1H-i"
TEM_D = "cmems_mod_blk_phy-tem_anfc_mrm-500m_P1D-m"
ARCHIVE_START = "2021-11-01"
WINDOW = 7
MIN_YEARS = 3
PAD = 0.03  # degrees around the spots' extent (≥ 4 model cells)


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- pure array helpers (unit-tested)

def depth_mean(values: np.ndarray, depths: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Mean over depth levels lo ≤ d ≤ hi of a (time, depth, lat, lon) array, ignoring NaN (land/below seabed)."""
    sel = (depths >= lo) & (depths <= hi)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN columns (land) stay NaN
        return np.nanmean(values[:, sel], axis=1)


def nearest_wet(field: np.ndarray, lats: np.ndarray, lons: np.ndarray, lat: float, lon: float) -> tuple[int, int, float] | None:
    """Nearest (i, j) whose time series has any finite value; field is (time, lat, lon)."""
    wet = np.isfinite(field).any(axis=0)
    if not wet.any():
        return None
    ii, jj = np.nonzero(wet)
    d = [km((lat, lon), (float(lats[i]), float(lons[j]))) for i, j in zip(ii, jj)]
    k = int(np.argmin(d))
    return int(ii[k]), int(jj[k]), round(d[k], 3)


def short_normal(days: list[dt.date], values: np.ndarray, window: int = WINDOW, min_years: int = MIN_YEARS) -> list[float | None]:
    """366 day-of-year normals: mean of all values within ±window days (circular), None if < min_years years."""
    doy = np.array([d.timetuple().tm_yday for d in days])
    years = np.array([d.year for d in days])
    ok = np.isfinite(values)
    out: list[float | None] = []
    for k in range(1, 367):
        dist = np.minimum(np.abs(doy - k), 366 - np.abs(doy - k))
        m = ok & (dist <= window)
        out.append(round(float(values[m].mean()), 2) if len(set(years[m].tolist())) >= min_years else None)
    return out


def series_for(spots: list[dict], times: list[dt.datetime], lats: np.ndarray, lons: np.ndarray, sst: np.ndarray, cur: np.ndarray | None) -> dict[str, dict]:
    """Per-spot hourly series from (time, lat, lon) fields; values rounded, missing as None."""
    out = {}
    for s in spots:
        cell = nearest_wet(sst, lats, lons, s["lat"], s["lon"])
        if cell is None:
            continue
        i, j, d = cell
        r = lambda a, n: [None if not np.isfinite(x) else round(float(x), n) for x in a]  # noqa: E731
        out[s["id"]] = {
            "t0": times[0].strftime("%Y-%m-%dT%H:00Z"),
            "cell": {"lat": round(float(lats[i]), 5), "lon": round(float(lons[j]), 5), "distance_km": d},
            "sst": r(sst[:, i, j], 2),
            "cur": r(cur[:, i, j], 3) if cur is not None else None,
        }
    return out


# ---------------------------------------------------------------- I/O (Actions only)

def cm_subset(dataset: str, variables: list[str], box: tuple[float, float, float, float], start: str, end: str, depth: tuple[float, float], out: Path) -> Path:
    s, n, w, e = box
    args = ["copernicusmarine", "subset", "--dataset-id", dataset, *sum((["--variable", v] for v in variables), []),
            "--minimum-latitude", str(s), "--maximum-latitude", str(n), "--minimum-longitude", str(w), "--maximum-longitude", str(e),
            "--minimum-depth", str(depth[0]), "--maximum-depth", str(depth[1]), "--start-datetime", start, "--end-datetime", end,
            "--output-directory", str(out.parent), "--output-filename", out.name]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"subset {dataset} failed: {r.stderr.strip()[-400:]}")
    return out


def read(path: Path, var: str) -> tuple[list[dt.datetime], np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    with netCDF4.Dataset(path) as nc:
        t = nc["time"]
        times = [dt.datetime(x.year, x.month, x.day, x.hour, tzinfo=dt.timezone.utc) for x in netCDF4.num2date(t[:], t.units, only_use_cftime_datetimes=False)]
        return times, np.asarray(nc["depth"][:], float), np.asarray(nc["latitude"][:], float), np.asarray(nc["longitude"][:], float), np.ma.filled(nc[var][:].astype(float), np.nan)


class D1:
    """Minimal D1 REST client (bound parameters; token never printed)."""

    def __init__(self, opener=urllib.request.urlopen) -> None:
        self.token = os.environ["CLOUDFLARE_API_TOKEN"]
        self.account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
        toml = (Path(__file__).resolve().parents[3] / "workers/api/wrangler.toml").read_text()
        self.db = re.search(r'database_id\s*=\s*"([^"]+)"', toml).group(1)
        self.opener = opener

    def query(self, sql: str, params: list | None = None) -> list[dict]:
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account}/d1/database/{self.db}/query"
        body = json.dumps({"sql": sql, "params": params or []}).encode()
        for attempt in range(3):
            req = urllib.request.Request(url, data=body, method="POST", headers={"authorization": f"Bearer {self.token}", "content-type": "application/json"})
            try:
                with self.opener(req, timeout=60) as r:
                    j = json.load(r)
                if j.get("success"):
                    return j["result"][0]["results"]
                err = j.get("errors")
            except Exception as e:  # noqa: BLE001
                err = str(e)
            time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"D1 query failed: {err}")


def spots_from_d1(d1: D1) -> list[dict]:
    return d1.query("SELECT id, lat, lon FROM spots WHERE status != 'rejected' ORDER BY id")


def extent(spots: list[dict]) -> tuple[float, float, float, float]:
    return (min(s["lat"] for s in spots) - PAD, max(s["lat"] for s in spots) + PAD, min(s["lon"] for s in spots) - PAD, max(s["lon"] for s in spots) + PAD)


def forecast(d1: D1, now: dt.datetime) -> int:
    spots = spots_from_d1(d1)
    box = extent(spots)
    start = (now - dt.timedelta(days=3)).strftime("%Y-%m-%dT00:00:00")
    end = (now + dt.timedelta(days=5)).strftime("%Y-%m-%dT23:00:00")
    with tempfile.TemporaryDirectory() as tmp:
        tp = cm_subset(TEM_H, ["thetao"], box, start, end, (0.5, 20.5), Path(tmp) / "tem.nc")
        cp = cm_subset(CUR_H, ["uo", "vo"], box, start, end, (0.5, 5.5), Path(tmp) / "cur.nc")
        times, depths, lats, lons, thetao = read(tp, "thetao")
        ctimes, cdepths, clats, clons, uo = read(cp, "uo")
        vo = read(cp, "vo")[4]
    sst = depth_mean(thetao, depths, 0.5, 20.5)
    speed = depth_mean(np.sqrt(uo ** 2 + vo ** 2), cdepths, 0.5, 5.5)
    if ctimes != times or not (np.allclose(clats, lats) and np.allclose(clons, lons)):
        speed = None  # grids differ: keep temperature only
    series = series_for(spots, times, lats, lons, sst, speed)
    fetched = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    for sid, s in series.items():
        d1.query("INSERT INTO ocean_series (spot_id, fetched_at, json) VALUES (?1, ?2, ?3) ON CONFLICT(spot_id) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json",
                 [sid, fetched, json.dumps(s)])
    print(f"ocean forecast: {len(series)}/{len(spots)} spots, {len(times)} hours {times[0]:%Y-%m-%dT%H}Z → {times[-1]:%Y-%m-%dT%H}Z, "
          f"max cell distance {max((s['cell']['distance_km'] for s in series.values()), default=0):.2f} km")
    return len(series)


def normal(d1: D1, now: dt.datetime) -> int:
    spots = spots_from_d1(d1)
    box = extent(spots)
    end = now.strftime("%Y-%m-%dT00:00:00")
    with tempfile.TemporaryDirectory() as tmp:
        p = cm_subset(TEM_D, ["thetao"], box, f"{ARCHIVE_START}T00:00:00", end, (0.5, 20.5), Path(tmp) / "daily.nc")
        times, depths, lats, lons, thetao = read(p, "thetao")
    sst = depth_mean(thetao, depths, 0.5, 20.5)
    days = [t.date() for t in times]
    n = 0
    for s in spots:
        cell = nearest_wet(sst, lats, lons, s["lat"], s["lon"])
        if cell is None:
            continue
        i, j, d = cell
        norm = short_normal(days, sst[:, i, j])
        years = sorted({x.year for x in days})
        meta = {"from": days[0].isoformat(), "to": days[-1].isoformat(), "years": len(years), "window_days": WINDOW, "min_years": MIN_YEARS,
                "cell": {"lat": round(float(lats[i]), 5), "lon": round(float(lons[j]), 5), "distance_km": d}, "normal": norm}
        d1.query("INSERT INTO ocean_normal (spot_id, computed_at, json) VALUES (?1, ?2, ?3) ON CONFLICT(spot_id) DO UPDATE SET computed_at = excluded.computed_at, json = excluded.json",
                 [s["id"], now.strftime("%Y-%m-%dT%H:%M:%SZ"), json.dumps(meta)])
        n += 1
    print(f"ocean normal: {n}/{len(spots)} spots, {len(days)} days {days[0]} → {days[-1]}")
    return n


def main(argv: list[str]) -> int:
    mode = argv[1] if len(argv) > 1 else "forecast"
    now = dt.datetime.now(dt.timezone.utc)
    d1 = D1()
    n = forecast(d1, now) if mode == "forecast" else normal(d1, now)
    return 0 if n > 0 else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv))
