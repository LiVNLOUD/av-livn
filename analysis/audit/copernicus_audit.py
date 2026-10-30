"""Copernicus Marine audit for v2 (runs in GitHub Actions; needs COPERNICUSMARINE_* secrets).

For each candidate product: dataset ids, time resolution, forecast horizon, depth levels, horizontal
resolution, whether Gemlik Gulf has wet cells, and per-spot distance to the nearest wet cell.
Writes docs/audit/copernicus.json. Never prints credentials.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import xarray as xr

BBOX = {"south": 40.28, "north": 40.62, "west": 28.55, "east": 29.25}
GEMLIK_GULF = {"south": 40.37, "north": 40.47, "west": 28.95, "east": 29.13}
PRODUCTS = {
    "anfc": "BLKSEA_ANALYSISFORECAST_PHY_007_001",
    "multiyear": "BLKSEA_MULTIYEAR_PHY_007_004",
    "sst_l4_nrt": "SST_BS_SST_L4_NRT_OBSERVATIONS_010_006",
    "sst_l4_rep": "SST_BS_SST_L4_REP_OBSERVATIONS_010_022",
}


def cm(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["copernicusmarine", *args], capture_output=True, text=True)


def describe(product: str) -> dict:
    r = cm("describe", "--product-id", product)
    if r.returncode != 0:
        return {"error": r.stderr.strip()[-400:]}
    cat = json.loads(r.stdout)
    out = {}
    for p in cat.get("products", []):
        for ds in p.get("datasets", []):
            info = {"variables": set(), "depth": None, "time": None}
            for ver in ds.get("versions", []):
                for part in ver.get("parts", []):
                    for svc in part.get("services", []):
                        for var in svc.get("variables", []):
                            info["variables"].add(var.get("short_name"))
                            for c in var.get("coordinates", []):
                                if c["coordinate_id"] == "depth":
                                    vals = c.get("values")
                                    info["depth"] = sorted(vals)[:12] if vals else [c.get("minimum_value"), c.get("maximum_value")]
                                if c["coordinate_id"] == "time":
                                    lo, hi = c.get("minimum_value"), c.get("maximum_value")
                                    info["time"] = {
                                        "min": dt.datetime.fromtimestamp(lo / 1000, dt.UTC).isoformat() if lo else None,
                                        "max": dt.datetime.fromtimestamp(hi / 1000, dt.UTC).isoformat() if hi else None,
                                        "step_s": (c.get("step") or 0) / 1000 or None,
                                    }
            info["variables"] = sorted(v for v in info["variables"] if v)
            out[ds["dataset_id"]] = info
    return out


def subset(dataset_id: str, var: str, day: str | None, depth: tuple[float, float] | None, tmp: Path) -> xr.Dataset | None:
    args = ["subset", "--dataset-id", dataset_id, "--variable", var,
            "--minimum-longitude", str(BBOX["west"]), "--maximum-longitude", str(BBOX["east"]),
            "--minimum-latitude", str(BBOX["south"]), "--maximum-latitude", str(BBOX["north"]),
            "--output-directory", str(tmp), "--output-filename", f"{dataset_id}.nc"]
    if day:
        args += ["--start-datetime", f"{day}T00:00:00", "--end-datetime", f"{day}T23:59:59"]
    if depth:
        args += ["--minimum-depth", str(depth[0]), "--maximum-depth", str(depth[1])]
    r = cm(*args)
    if r.returncode != 0:
        print(f"::warning::subset {dataset_id} failed: {r.stderr.strip()[-300:]}")
        return None
    return xr.open_dataset(tmp / f"{dataset_id}.nc")


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def wet_summary(da: xr.DataArray, spots: list[dict]) -> dict:
    for d in [d for d in da.dims if d not in ("latitude", "longitude", "lat", "lon")]:
        da = da.isel({d: 0})
    lat = da["latitude"].values if "latitude" in da.coords else da["lat"].values
    lon = da["longitude"].values if "longitude" in da.coords else da["lon"].values
    wet = np.isfinite(da.values)
    if "deptho" in str(da.name) or "mask" in str(da.name):
        wet &= da.values > 0
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    g = (la >= GEMLIK_GULF["south"]) & (la <= GEMLIK_GULF["north"]) & (lo >= GEMLIK_GULF["west"]) & (lo <= GEMLIK_GULF["east"])
    pts = list(zip(la[wet].ravel(), lo[wet].ravel()))
    per_spot = {}
    for s in spots:
        if not pts:
            per_spot[s["id"]] = None
            continue
        d = min(km((s["lat"], s["lon"]), p) for p in pts)
        per_spot[s["id"]] = round(d, 2)
    return {
        "resolution_deg": [round(float(abs(lat[1] - lat[0])), 5), round(float(abs(lon[1] - lon[0])), 5)] if len(lat) > 1 and len(lon) > 1 else None,
        "grid": [int(len(lat)), int(len(lon))],
        "wet_cells_bbox": int(wet.sum()),
        "wet_cells_gemlik_gulf": int((wet & g).sum()),
        "nearest_wet_km_per_spot": per_spot,
    }


def main(argv: list[str]) -> int:
    spots_path = Path(argv[1] if len(argv) > 1 else "data/spots.geojson")
    out_path = Path(argv[2] if len(argv) > 2 else "docs/audit/copernicus.json")
    spots = [{"id": f["properties"]["id"], "name": f["properties"]["name"], "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0]}
             for f in json.loads(spots_path.read_text())["features"]]
    yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    result: dict = {"generated": dt.datetime.now(dt.UTC).isoformat(), "bbox": BBOX, "gemlik_gulf": GEMLIK_GULF, "products": {}}
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for key, product in PRODUCTS.items():
            desc = describe(product)
            entry: dict = {"product": product, "datasets": {k: v for k, v in desc.items()} if "error" not in desc else desc}
            print(f"{product}: {list(desc)[:12]}")
            tests = []
            if key == "anfc":
                static = next((d for d in desc if "mrm-500m_static" in d), None)
                tem = next((d for d in desc if "mrm-500m" in d and "tem" in d and "P1D" in d), None)
                hourly = [d for d in desc if "mrm-500m" in d and ("PT1H" in d or "PT15M" in d)]
                entry["marmara_hourly_datasets"] = hourly
                if static:
                    tests.append((static, "deptho", None, None))
                if tem:
                    tests.append((tem, "thetao", yesterday, (0, 25)))
            elif key == "multiyear":
                tem = next((d for d in desc if "tem" in d and "P1D" in d), None) or next((d for d in desc if "tem" in d), None)
                if tem:
                    tests.append((tem, "thetao", "2020-08-15", (0, 3)))
            else:
                ds = next(iter(desc), None) if "error" not in desc else None
                if ds:
                    var = "analysed_sst" if "analysed_sst" in desc[ds]["variables"] else (desc[ds]["variables"] or ["analysed_sst"])[0]
                    day = yesterday if key == "sst_l4_nrt" else "2020-08-15"
                    tests.append((ds, var, day, None))
            entry["tests"] = {}
            for ds_id, var, day, depth in tests:
                d = subset(ds_id, var, day, depth, tmp)
                if d is None:
                    entry["tests"][ds_id] = {"error": "subset failed"}
                    continue
                summary = wet_summary(d[var], spots)
                if "depth" in d.coords:
                    summary["depth_levels_m"] = [round(float(x), 2) for x in d["depth"].values]
                entry["tests"][ds_id] = summary
                print(ds_id, {k: v for k, v in summary.items() if k != "nearest_wet_km_per_spot"})
            result["products"][key] = entry
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=1, default=list) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
