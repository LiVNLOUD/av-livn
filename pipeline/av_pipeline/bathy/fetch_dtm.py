"""Download the EMODnet Bathymetry DTM 2024 subset for BATHY_BBOX from ERDDAP (netCDF): elevation and
interpolation_flag (1 = cell interpolated/extrapolated, e.g. GEBCO fill; drawn hatched on the map).

Usage: python -m av_pipeline.bathy.fetch_dtm data/bathy/dtm.nc
"""

from __future__ import annotations

import sys
import time
import urllib.request
from pathlib import Path

from av_pipeline import BATHY_BBOX

DATASET = "bathymetry_dtm_2024"
ERDDAP = "https://erddap.emodnet.eu/erddap/griddap"
CITATION = "EMODnet Bathymetry Consortium (2024): EMODnet Digital Bathymetry (DTM 2024)"


def url() -> str:
    b = BATHY_BBOX
    sel = f"[({b['south']}):1:({b['north']})][({b['west']}):1:({b['east']})]"
    q = f"elevation{sel},interpolation_flag{sel}"
    return f"{ERDDAP}/{DATASET}.nc?" + urllib.request.quote(q, safe="():,")


def main(argv: list[str]) -> int:
    out = Path(argv[1] if len(argv) > 1 else "data/bathy/dtm.nc")
    out.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url(), timeout=180) as r:
                out.write_bytes(r.read())
            print(f"{DATASET}: {out.stat().st_size} bytes → {out}")
            return 0
        except Exception as exc:  # noqa: BLE001
            print(f"ERDDAP attempt {attempt + 1} failed: {exc}", file=sys.stderr)
            time.sleep(15 * (attempt + 1))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
