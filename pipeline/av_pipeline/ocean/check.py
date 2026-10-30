"""Copernicus Marine access check (F0.2). Runs only in GitHub Actions.

Credentials come from COPERNICUSMARINE_SERVICE_USERNAME / _PASSWORD env vars and
are never printed. Exit code 1 if the main dataset cannot be described or subset.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path

from av_pipeline import BBOX

MAIN = "cmems_mod_blk_phy-tem_anfc_mrm-500m_P1D-m"
OTHERS = [
    "cmems_mod_blk_phy-cur_anfc_mrm-500m_P1D-m",
    "cmems_mod_blk_phy-sal_anfc_mrm-500m_P1D-m",
    "cmems_mod_blk_phy_anfc_mrm-500m_staticbathy",
]


def run(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["copernicusmarine", *args], capture_output=True, text=True)


def summarize_describe(raw: str, dataset_id: str) -> dict:
    """Reduce the (very large) describe JSON to what we need to log."""
    cat = json.loads(raw)
    for product in cat.get("products", []):
        for ds in product.get("datasets", []):
            if ds.get("dataset_id") != dataset_id:
                continue
            out = {"product_id": product.get("product_id"), "dataset_id": dataset_id, "versions": []}
            for ver in ds.get("versions", []):
                for part in ver.get("parts", []):
                    for svc in part.get("services", []):
                        if svc.get("service_name") not in ("arco-geo-series", "static-arco"):
                            continue
                        variables = []
                        for var in svc.get("variables", []):
                            coords = {c["coordinate_id"]: {k: c.get(k) for k in ("minimum_value", "maximum_value", "values") if c.get(k) is not None}
                                      for c in var.get("coordinates", [])}
                            if "depth" in coords and "values" in coords["depth"]:
                                coords["depth"]["values"] = coords["depth"]["values"][:6]
                            coords.pop("latitude", None)
                            coords.pop("longitude", None)
                            variables.append({"short_name": var.get("short_name"), "units": var.get("units"), "coords": coords})
                        out["versions"].append({"version": ver.get("label"), "service": svc.get("service_name"), "variables": variables})
            return out
    raise LookupError(f"{dataset_id} not found in describe output")


def describe(dataset_id: str) -> dict:
    res = run(["describe", "--dataset-id", dataset_id])
    if res.returncode != 0:
        raise RuntimeError(f"describe failed for {dataset_id}: {res.stderr.strip()[-500:]}")
    return summarize_describe(res.stdout, dataset_id)


def subset_surface(out_dir: Path, day: dt.date) -> Path:
    name = f"check_{day.isoformat()}.nc"
    res = run([
        "subset", "--dataset-id", MAIN, "--variable", "thetao",
        "--minimum-longitude", str(BBOX["west"]), "--maximum-longitude", str(BBOX["east"]),
        "--minimum-latitude", str(BBOX["south"]), "--maximum-latitude", str(BBOX["north"]),
        "--minimum-depth", "0", "--maximum-depth", "1",
        "--start-datetime", f"{day.isoformat()}T00:00:00", "--end-datetime", f"{day.isoformat()}T23:59:59",
        "--output-directory", str(out_dir), "--output-filename", name,
    ])
    if res.returncode != 0:
        raise RuntimeError(f"subset failed: {res.stderr.strip()[-800:]}")
    return out_dir / name


def inspect_nc(path: Path) -> dict:
    import numpy as np
    import xarray as xr

    with xr.open_dataset(path) as ds:
        t = ds["thetao"].values
        finite = np.isfinite(t)
        return {
            "file": path.name,
            "bytes": path.stat().st_size,
            "dims": {k: int(v) for k, v in ds.sizes.items()},
            "variables": list(ds.data_vars),
            "depth": [float(d) for d in ds["depth"].values] if "depth" in ds else None,
            "time": [str(x)[:19] for x in ds["time"].values] if "time" in ds else None,
            "thetao_min": float(np.nanmin(t)) if finite.any() else None,
            "thetao_max": float(np.nanmax(t)) if finite.any() else None,
            "nan_ratio": round(1 - finite.mean(), 3),
        }


def main() -> int:
    for key in ("COPERNICUSMARINE_SERVICE_USERNAME", "COPERNICUSMARINE_SERVICE_PASSWORD"):
        print(f"{key}: {'set' if os.environ.get(key) else 'MISSING'}")
    try:
        print("MAIN describe:", json.dumps(describe(MAIN), ensure_ascii=False, indent=1))
    except Exception as exc:  # noqa: BLE001
        print(f"::error::{exc}")
        return 1
    for ds_id in OTHERS:
        try:
            info = describe(ds_id)
            print(f"OK   {ds_id}: {[v['short_name'] for ver in info['versions'] for v in ver['variables']]}")
        except Exception as exc:  # noqa: BLE001
            print(f"::warning::{exc}")
    out_dir = Path(os.environ.get("RUNNER_TEMP", "/tmp"))
    day = dt.date.today() - dt.timedelta(days=1)
    try:
        path = subset_surface(out_dir, day)
        print("SUBSET:", json.dumps(inspect_nc(path), indent=1))
    except Exception as exc:  # noqa: BLE001
        print(f"::error::{exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
