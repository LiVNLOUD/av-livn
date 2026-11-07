"""R3: Sentinel-2 satellite-derived bathymetry (Stumpf et al. 2003 log-ratio), calibrated and validated on ICESat-2
ATL24. Copernicus Sentinel-2 L2A from the open Earth Search STAC (AWS, no login). Actions only.

Steps:
  1. Grid: AOI in UTM 35N at 10 m. Sea mask from OSM land (data/osm/land_marmara.geojson). Coastal strip
     20 m … 1.5 km from land (inner 20 m: mixed land/structure pixels; also covers piers drawn as land).
  2. Scenes 2018 → today with scene cloud < 10 %; per pixel keep only SCL water (6), not turbid
     (red/green ≤ TURBID_RG and red ≤ TURBID_RED), no glint/foam (NIR ≤ GLINT_NIR). Scenes with < MIN_CLEAR of the
     strip usable are dropped; at most MAX_SCENES clearest are read.
  3. Per-scene Stumpf ratio; composite = per-pixel median over scenes, spread = IQR/1.35.
     Optically deep water: ratio within DEEP_EPS of the offshore (> 3 km) median → no estimate.
  4. Calibration: each ATL24 point (≤ 10 m depth) gets the ratio of the clear scene nearest in time at its pixel;
     one value per pixel per pass (independent point). Linear fit; grouped 5-fold CV by pass (core.grouped_cv).
  5. Acceptance (core.accept): 0–8 m RMSE ≤ 1.5 m, R² ≥ 0.6, ≥ 30 independent points. Otherwise report only.
  6. If accepted: depth = fit(composite) in 0–10 m only; sigma = √(RMSE² + (m1·spread)²); PNG overlay (WGS84) and
     per-spot bands.
Usage: python -m av_pipeline.satbathy.sdb data/satbathy
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

from av_pipeline.satbathy.core import SDB_RANGE, accept, fit_linear, grouped_cv, stumpf_ratio

STAC = "https://earth-search.aws.element84.com/v1"
AOI = (28.74, 40.30, 29.22, 40.58)  # W, S, E, N (lon/lat): spots ± margin
CRS = "EPSG:32635"
RES = 10.0
STRIP_M = (20.0, 1500.0)
DEEP_M = 3000.0
TURBID_RG = 0.85
TURBID_RED = 0.03
GLINT_NIR = 0.03
MIN_CLEAR = 0.5
MAX_SCENES = 40
DEEP_EPS = 0.01


def grid():
    from pyproj import Transformer  # noqa: PLC0415
    from rasterio.transform import from_origin  # noqa: PLC0415

    t = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    xs, ys = t.transform([AOI[0], AOI[2], AOI[0], AOI[2]], [AOI[1], AOI[1], AOI[3], AOI[3]])
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = int((x1 - x0) // RES), int((y1 - y0) // RES)
    return from_origin(x0, y1, RES, RES), w, h


def sea_strip(transform, w, h, land_path: Path):
    from rasterio.features import rasterize  # noqa: PLC0415
    from rasterio.warp import transform_geom  # noqa: PLC0415
    from scipy.ndimage import distance_transform_edt  # noqa: PLC0415

    land = json.loads(land_path.read_text())
    shapes = [(transform_geom("EPSG:4326", CRS, f["geometry"]), 1) for f in land["features"]]
    is_land = rasterize(shapes, out_shape=(h, w), transform=transform, fill=0, dtype="uint8").astype(bool)
    dist = distance_transform_edt(~is_land) * RES
    strip = (~is_land) & (dist >= STRIP_M[0]) & (dist <= STRIP_M[1])
    deep = (~is_land) & (dist >= DEEP_M)
    return strip, deep, dist


def search_scenes() -> list[dict]:
    from pystac_client import Client  # noqa: PLC0415

    c = Client.open(STAC)
    s = c.search(collections=["sentinel-2-l2a"], bbox=AOI, datetime=f"2018-01-01/{dt.date.today().isoformat()}", query={"eo:cloud_cover": {"lt": 10}}, max_items=2000)
    items = [i.to_dict() for i in s.items()]
    print(f"stac: {len(items)} scenes with cloud < 10 %")
    return items


def read_band(item: dict, key: str, transform, w, h, resampling="bilinear"):
    import rasterio  # noqa: PLC0415
    from rasterio.enums import Resampling  # noqa: PLC0415
    from rasterio.vrt import WarpedVRT  # noqa: PLC0415

    a = item["assets"][key]
    with rasterio.open(a["href"]) as src, WarpedVRT(src, crs=CRS, transform=transform, width=w, height=h, resampling=getattr(Resampling, resampling)) as v:
        x = v.read(1).astype("float32")
    if key == "scl":
        return x
    rb = (a.get("raster:bands") or [{}])[0]
    scale, offset = rb.get("scale", 1e-4), rb.get("offset", 0.0)
    x[x == 0] = np.nan
    return x * scale + offset


def scene_ratio(item: dict, transform, w, h, strip) -> tuple[np.ndarray | None, float]:
    scl = read_band(item, "scl", transform, w, h, "nearest")
    water = (scl == 6) & strip
    if water.sum() < MIN_CLEAR * strip.sum():
        return None, float(water.sum() / max(strip.sum(), 1))
    blue, green, red, nir = (read_band(item, k, transform, w, h) for k in ("blue", "green", "red", "nir"))
    with np.errstate(invalid="ignore", divide="ignore"):
        ok = water & (red / green <= TURBID_RG) & (red <= TURBID_RED) & (nir <= GLINT_NIR)
    frac = float(ok.sum() / max(strip.sum(), 1))
    if frac < MIN_CLEAR:
        return None, frac
    r = stumpf_ratio(blue, green)
    r[~ok] = np.nan
    return r[strip].astype("float32"), frac


def main(argv: list[str]) -> None:
    out = Path(argv[0])
    from pyproj import Transformer  # noqa: PLC0415

    transform, w, h = grid()
    strip, deep, _ = sea_strip(transform, w, h, Path("data/osm/land_marmara.geojson"))
    pts = json.loads((out / "atl24.geojson").read_text())["features"]
    print(f"grid {w}×{h} at {RES:.0f} m; strip pixels {int(strip.sum())}; ATL24 points {len(pts)}")
    report: dict = {"aoi": AOI, "strip_pixels": int(strip.sum()), "atl24_points": len(pts), "updated": dt.date.today().isoformat()}

    # ATL24 points → strip pixel index
    tf = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    lon = np.array([p["geometry"]["coordinates"][0] for p in pts])
    lat = np.array([p["geometry"]["coordinates"][1] for p in pts])
    z = np.array([p["properties"]["depth"] for p in pts], float)
    passes = [p["properties"]["pass"] for p in pts]
    dates = [p["properties"]["date"] for p in pts]
    x, y = tf.transform(lon, lat) if len(pts) else (np.array([]), np.array([]))
    col = np.floor((np.asarray(x) - transform.c) / RES).astype(int)
    row = np.floor((transform.f - np.asarray(y)) / RES).astype(int)
    inside = (col >= 0) & (col < w) & (row >= 0) & (row < h)
    strip_idx = np.full(strip.shape, -1, int)
    strip_idx[strip] = np.arange(int(strip.sum()))
    pidx = np.full(len(pts), -1, int)
    pidx[inside] = strip_idx[row[inside], col[inside]]
    usable = (pidx >= 0) & (z <= SDB_RANGE[1])
    report["atl24_in_strip_0_10m"] = int(usable.sum())

    items = search_scenes()
    stack, sdates, fracs = [], [], []
    for it in sorted(items, key=lambda i: i["properties"].get("eo:cloud_cover", 100)):
        if len(stack) >= MAX_SCENES:
            break
        try:
            r, frac = scene_ratio(it, transform, w, h, strip)
        except Exception as e:  # noqa: BLE001
            print(f"  skip {it['id']}: {type(e).__name__} {str(e)[:120]}")
            continue
        if r is None:
            continue
        stack.append(r)
        sdates.append(it["properties"]["datetime"][:10])
        fracs.append(frac)
        print(f"  scene {it['id']} {sdates[-1]} clear {frac:.0%}")
    report["scenes_used"] = len(stack)
    report["scene_dates"] = sdates
    if not stack:
        report["decision"] = {"accepted": False, "why": ["berrak (bulutsuz, bulanık olmayan) sahne bulunamadı"]}
        (out / "sdb_report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
        print("sdb: no clear scene")
        return
    S = np.vstack(stack)
    comp = np.nanmedian(S, axis=0)
    q1, q3 = np.nanpercentile(S, [25, 75], axis=0)
    spread = (q3 - q1) / 1.35

    # calibration: nearest-in-time clear scene at each point's pixel; one value per (pixel, pass)
    sd = np.array([np.datetime64(d) for d in sdates])
    rows, zs, gs, seen = [], [], [], set()
    for k in np.where(usable)[0]:
        key = (pidx[k], passes[k])
        if key in seen:
            continue
        valid = np.isfinite(S[:, pidx[k]])
        if not valid.any():
            continue
        j = np.where(valid)[0][np.argmin(np.abs(sd[valid] - np.datetime64(dates[k])))]
        seen.add(key)
        rows.append(S[j, pidx[k]])
        zs.append(z[k])
        gs.append(passes[k])
    r_cal, z_cal = np.array(rows), np.array(zs)
    report["calibration_points"] = len(z_cal)
    report["calibration_passes"] = len(set(gs))
    if len(z_cal) >= 5 and len(set(gs)) >= 2:
        cv = grouped_cv(r_cal, z_cal, gs)
        fit = fit_linear(r_cal, z_cal)
        ok, why = accept(cv, len(z_cal))
        report["fit"] = {"m1": round(fit.m1, 3), "m0": round(fit.m0, 3)}
        report["validation"] = {k: v for k, v in cv.items() if k != "pred"}
    else:
        ok, why, fit = False, [f"kalibrasyon için yetersiz ATL24 noktası ({len(z_cal)} nokta, {len(set(gs))} geçiş)"], None
    report["decision"] = {"accepted": ok, "why": why}
    print(f"sdb: calibration {len(z_cal)} points / {len(set(gs))} passes → {'ACCEPTED' if ok else 'rejected: ' + '; '.join(why)}")
    (out / "sdb_report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    if not ok:
        return

    # accepted: depth and sigma maps (strip only, 0–10 m, not optically deep)
    deep_ratio = float(np.nanmedian(comp[deep[strip]])) if deep[strip].any() else np.nan
    depth = fit.predict(comp)
    rmse = report["validation"]["range_0_8"]["rmse"]
    sig = np.sqrt(rmse**2 + (fit.m1 * spread) ** 2)
    bad = ~np.isfinite(depth) | (depth < SDB_RANGE[0]) | (depth > SDB_RANGE[1])
    if np.isfinite(deep_ratio):
        bad |= np.abs(comp - deep_ratio) < DEEP_EPS
    depth[bad] = np.nan
    sig[bad] = np.nan
    full = np.full(strip.shape, np.nan, "float32")
    fsig = np.full(strip.shape, np.nan, "float32")
    full[strip] = depth
    fsig[strip] = sig
    np.savez_compressed(out / "sdb_grid.npz", depth=full, sigma=fsig, transform=np.array(transform)[:6], crs=CRS)
    report["pixels_with_estimate"] = int(np.isfinite(depth).sum())
    report["overlay"] = write_overlay(full, fsig, transform, Path("apps/web/public/tiles"))
    (out / "sdb_report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")


def write_overlay(depth: np.ndarray, sigma: np.ndarray, transform, dest: Path) -> dict:
    """Map layer (only when accepted): WGS84 PNG, colour = depth 0–10 m (light → dark blue), opacity falls with
    the pixel uncertainty (σ 0.5 m → 0.9, σ ≥ 3 m → 0.2); no estimate = transparent."""
    from PIL import Image  # noqa: PLC0415
    from rasterio.transform import from_bounds  # noqa: PLC0415
    from rasterio.warp import Resampling, reproject  # noqa: PLC0415

    w, s, e, n = AOI
    W, H = int((e - w) / 0.0001), int((n - s) / 0.0001)
    dst_t = from_bounds(w, s, e, n, W, H)
    out = {}
    for name, src in (("depth", depth), ("sigma", sigma)):
        a = np.full((H, W), np.nan, "float32")
        reproject(src, a, src_transform=transform, src_crs=CRS, dst_transform=dst_t, dst_crs="EPSG:4326", resampling=Resampling.nearest, src_nodata=np.nan, dst_nodata=np.nan)
        out[name] = a
    d, sg = out["depth"], out["sigma"]
    t = np.clip(d / 10.0, 0, 1)
    rgba = np.zeros((H, W, 4), "uint8")
    rgba[..., 0] = (190 - 160 * t).astype("uint8")
    rgba[..., 1] = (230 - 150 * t).astype("uint8")
    rgba[..., 2] = (245 - 95 * t).astype("uint8")
    alpha = np.clip(1 - (np.nan_to_num(sg, nan=9) - 0.5) / 2.5 * 0.7, 0.2, 0.9)
    rgba[..., 3] = np.where(np.isfinite(d), (alpha * 255).astype("uint8"), 0)
    dest.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(dest / "sdb.png", optimize=True)
    meta = {"bounds": [w, s, e, n], "unit": "m", "range": list(SDB_RANGE), "source": "Sentinel-2 L2A (Copernicus), Stumpf log-oran, ICESat-2 ATL24 ile kalibre"}
    (dest / "sdb.json").write_text(json.dumps(meta) + "\n")
    return {"png": "tiles/sdb.png", "size": [W, H]}


if __name__ == "__main__":
    main(sys.argv[1:])
