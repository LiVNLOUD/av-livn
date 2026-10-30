"""Find the Copernicus Marine (Black Sea, Marmara 500 m) static bathymetry dataset ID and compare it with
EMODnet. Runs in Actions only; never fails the workflow (EMODnet is the primary source).

Usage: python -m av_pipeline.ocean.static_bathy data/bathy/dtm.nc
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from av_pipeline import BBOX

PRODUCT = "BLKSEA_ANALYSISFORECAST_PHY_007_001"


def candidate_ids(catalogue: dict) -> list[str]:
    """Dataset IDs that look like the Marmara 500 m static grid (contain 'mrm' and 'static')."""
    ids = [ds["dataset_id"] for p in catalogue.get("products", []) for ds in p.get("datasets", [])]
    return sorted(i for i in ids if "static" in i and "mrm" in i)


def describe_product() -> dict:
    res = subprocess.run(["copernicusmarine", "describe", "--product-id", PRODUCT], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip()[-400:])
    return json.loads(res.stdout)


def compare(dataset_id: str, dtm: Path) -> dict:
    import numpy as np
    import xarray as xr

    from av_pipeline.bathy.grid import Grid

    with tempfile.TemporaryDirectory() as tmp:
        b = BBOX
        res = subprocess.run(
            ["copernicusmarine", "subset", "--dataset-id", dataset_id, "--variable", "deptho",
             "--minimum-longitude", str(b["west"]), "--maximum-longitude", str(b["east"]),
             "--minimum-latitude", str(b["south"]), "--maximum-latitude", str(b["north"]),
             "--output-directory", tmp, "--output-filename", "static.nc"],
            capture_output=True, text=True,
        )
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip()[-400:])
        with xr.open_dataset(Path(tmp) / "static.nc") as ds:
            d = ds["deptho"]
            grid = Grid.from_netcdf(str(dtm))
            diffs = []
            for la in d["latitude"].values:
                for lo in d["longitude"].values:
                    v = float(d.sel(latitude=la, longitude=lo).values)
                    e = grid.depth(float(la), float(lo))
                    if np.isfinite(v) and e is not None and e > 0:
                        diffs.append(v - e)
            arr = np.array(diffs)
            return {"points": int(arr.size), "mean_diff_m": round(float(arr.mean()), 2) if arr.size else None,
                    "mean_abs_diff_m": round(float(np.abs(arr).mean()), 2) if arr.size else None}


def main(argv: list[str]) -> int:
    dtm = Path(argv[1] if len(argv) > 1 else "data/bathy/dtm.nc")
    if not os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME"):
        print("::warning::Copernicus credentials not available; skipping static bathymetry check")
        return 0
    try:
        ids = candidate_ids(describe_product())
    except Exception as exc:  # noqa: BLE001
        print(f"::warning::describe {PRODUCT} failed: {exc}")
        return 0
    print("Marmara static candidates:", ids or "none")
    if not ids:
        print("::warning::No Marmara 500 m static dataset found; using EMODnet only")
        return 0
    try:
        print("CMEMS deptho vs EMODnet:", json.dumps(compare(ids[0], dtm)))
    except Exception as exc:  # noqa: BLE001
        print(f"::warning::CMEMS static subset failed for {ids[0]}: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
