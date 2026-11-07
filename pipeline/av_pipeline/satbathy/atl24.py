"""R2: ICESat-2 ATL24 v002 coastal bathymetry photons over the Gemlik–Mudanya coast (2018 → today). Actions only.

Order (Faz R): SlideRule web service first (no login); if it is unavailable or does not serve ATL24, NASA
CMR + NSIDC granules with EARTHDATA_TOKEN (Authorization: Bearer; never printed). Already processed granules are
listed in data/satbathy/atl24_granules.json so the monthly run only adds new passes.

Output: data/satbathy/atl24.geojson — one feature per kept photon after thinning to one per 10 m along track per
beam: depth (m, water surface − seafloor, refraction corrected by the product), sigma (product vertical
uncertainty, m), date, pass (granule:beam). Usage:
  python -m av_pipeline.satbathy.atl24 data/satbathy [--source sliderule|nsidc|auto]
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import numpy as np

from av_pipeline.satbathy.core import depth_of, filter_photons

BBOX = (28.70, 40.24, 29.25, 40.62)  # W, S, E, N: Gemlik Bay, Armutlu–Mudanya coast and Kapaklı
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
BEAMS = ("gt1l", "gt1r", "gt2l", "gt2r", "gt3l", "gt3r")
FIELDS = ("class_ph", "confidence", "lat_ph", "lon_ph", "ortho_h", "surface_h", "sigma_tvu", "low_confidence_flag", "invalid_kd", "invalid_wind_speed", "sensor_depth_exceeded")
THIN_M = 10.0


def granule_date(name: str) -> str:
    m = re.search(r"ATL24_(\d{8})", name)
    return f"{m.group(1)[:4]}-{m.group(1)[4:6]}-{m.group(1)[6:]}" if m else ""


def thin(lat: np.ndarray, lon: np.ndarray, depth: np.ndarray, sigma: np.ndarray, step_m: float = THIN_M) -> list[int]:
    """Indices keeping one photon per `step_m` along the track (median-depth photon of each bin)."""
    if len(lat) == 0:
        return []
    y = (lat - lat[0]) * 111_320.0
    x = (lon - lon[0]) * 111_320.0 * np.cos(np.radians(lat[0]))
    s = np.hypot(x, y)
    bins = np.floor(s / step_m).astype(int)
    keep = []
    for b in np.unique(bins):
        idx = np.where(bins == b)[0]
        keep.append(int(idx[np.argsort(depth[idx])[len(idx) // 2]]))
    return keep


def features(name: str, beam: str, p: dict[str, np.ndarray]) -> list[dict]:
    m = filter_photons(p)
    lat, lon = p["lat_ph"][m], p["lon_ph"][m]
    inb = (lon >= BBOX[0]) & (lon <= BBOX[2]) & (lat >= BBOX[1]) & (lat <= BBOX[3])
    lat, lon = lat[inb], lon[inb]
    depth = depth_of({k: v[m][inb] for k, v in p.items() if k in ("surface_h", "ortho_h")})
    sigma = np.asarray(p.get("sigma_tvu", np.full(len(m), np.nan)))[m][inb]
    order = np.argsort(lat)
    lat, lon, depth, sigma = lat[order], lon[order], depth[order], sigma[order]
    date = granule_date(name)
    return [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(float(lon[i]), 6), round(float(lat[i]), 6)]},
         "properties": {"depth": round(float(depth[i]), 2), "sigma": None if not np.isfinite(sigma[i]) else round(float(sigma[i]), 2), "date": date, "pass": f"{name[:40]}:{beam}"}}
        for i in thin(lat, lon, depth, sigma)
    ]


# ---------------------------------------------------------------- SlideRule (no login)
def via_sliderule() -> list[dict]:
    import sliderule  # noqa: PLC0415 (optional dependency)

    sliderule.init(verbose=False)
    poly = [{"lon": BBOX[0], "lat": BBOX[1]}, {"lon": BBOX[2], "lat": BBOX[1]}, {"lon": BBOX[2], "lat": BBOX[3]}, {"lon": BBOX[0], "lat": BBOX[3]}, {"lon": BBOX[0], "lat": BBOX[1]}]
    gdf = sliderule.run("atl24x", {"poly": poly, "t0": "2018-10-01T00:00:00Z", "t1": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
    if gdf is None or len(gdf) == 0:
        return []
    cols = set(gdf.columns)
    print(f"sliderule: {len(gdf)} photons, columns {sorted(cols)[:30]}")
    lat = gdf.geometry.y.to_numpy() if "lat_ph" not in cols else gdf["lat_ph"].to_numpy()
    lon = gdf.geometry.x.to_numpy() if "lon_ph" not in cols else gdf["lon_ph"].to_numpy()
    key = gdf["granule"].astype(str).to_numpy() if "granule" in cols else np.array(["sliderule"] * len(gdf))
    beam = (gdf["spot"].astype(str) if "spot" in cols else gdf.get("gt", "beam").astype(str)).to_numpy() if ("spot" in cols or "gt" in cols) else np.array(["b"] * len(gdf))
    out = []
    for k in np.unique(np.char.add(np.char.add(key.astype(str), "|"), beam.astype(str))):
        g, b = k.split("|", 1)
        sel = (key == g) & (beam == b)
        p = {f: (gdf[f].to_numpy()[sel] if f in cols else np.zeros(sel.sum())) for f in FIELDS if f not in ("lat_ph", "lon_ph")}
        p["lat_ph"], p["lon_ph"] = lat[sel], lon[sel]
        out += features(g, b, p)
    return out


# ---------------------------------------------------------------- NSIDC granules (EARTHDATA_TOKEN)
def cmr_granules() -> list[dict]:
    out, page = [], 1
    while True:
        q = f"{CMR}?short_name=ATL24&version=002&bounding_box={','.join(map(str, BBOX))}&page_size=200&page_num={page}"
        with urllib.request.urlopen(q, timeout=60) as r:
            e = json.load(r)["feed"]["entry"]
        out += [{"name": x["title"].split(".h5")[0], "url": next(l["href"] for l in x["links"] if l["href"].endswith(".h5") and l["href"].startswith("https"))} for x in e]
        if len(e) < 200:
            return out
        page += 1


def download(url: str, token: str, dest: Path) -> None:
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            return
        except Exception as e:  # noqa: BLE001
            code = getattr(e, "code", None)
            if code in (401, 403):
                raise SystemExit(f"Earthdata reddetti (HTTP {code}): EARTHDATA_TOKEN geçersiz ya da süresi dolmuş") from None
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"download failed: {url.rsplit('/', 1)[-1]}")


def read_h5(path: Path, name: str) -> list[dict]:
    import h5py  # noqa: PLC0415

    out = []
    with h5py.File(path, "r") as f:
        for b in BEAMS:
            if b not in f:
                continue
            g = f[b]
            if "class_ph" not in g:
                print(f"  {name}:{b} keys {sorted(g.keys())[:20]}")
                continue
            p = {k: np.asarray(g[k][:]) for k in FIELDS if k in g}
            out += features(name, b, p)
    return out


def via_nsidc(done: set[str]) -> tuple[list[dict], list[str]]:
    token = os.environ.get("EARTHDATA_TOKEN", "")
    if not token:
        raise SystemExit("EARTHDATA_TOKEN yok: repo secret olarak tanımlanmalı (Actions)")
    gs = [g for g in cmr_granules() if g["name"] not in done]
    print(f"nsidc: {len(gs)} new granule(s) over the bbox")
    feats, names = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for i, g in enumerate(gs, 1):
            path = Path(tmp) / "g.h5"
            download(g["url"], token, path)
            f = read_h5(path, g["name"])
            path.unlink()
            feats += f
            names.append(g["name"])
            print(f"  [{i}/{len(gs)}] {g['name'][:32]} → {len(f)} bathymetry points")
    return feats, names


def main(argv: list[str]) -> None:
    out_dir = Path(argv[0])
    source = argv[argv.index("--source") + 1] if "--source" in argv else "auto"
    out_dir.mkdir(parents=True, exist_ok=True)
    cache = out_dir / "atl24_granules.json"
    gj = out_dir / "atl24.geojson"
    done = set(json.loads(cache.read_text())["granules"]) if cache.exists() else set()
    old = json.loads(gj.read_text())["features"] if gj.exists() else []
    feats: list[dict] = []
    used = None
    if source in ("auto", "sliderule"):
        try:
            feats = via_sliderule()
            used = "sliderule"
            old = []  # SlideRule returns the whole archive each time
        except Exception as e:  # noqa: BLE001
            print(f"sliderule unavailable for ATL24: {type(e).__name__}: {str(e)[:200]}")
            if source == "sliderule":
                raise
    names: list[str] = []
    if used is None:
        feats, names = via_nsidc(done)
        used = "nsidc"
    allf = old + feats
    gj.write_text(json.dumps({"type": "FeatureCollection", "source": "ICESat-2 ATL24 v002 (NASA NSIDC, doi:10.5067/ATLAS/ATL24.002)", "fetched_via": used, "updated": dt.date.today().isoformat(), "features": allf}, separators=(",", ":")) + "\n")
    cache.write_text(json.dumps({"granules": sorted(done | set(names)), "updated": dt.date.today().isoformat()}, indent=1) + "\n")
    print(f"atl24: {len(feats)} new, {len(allf)} total points via {used}")


if __name__ == "__main__":
    main(sys.argv[1:])
