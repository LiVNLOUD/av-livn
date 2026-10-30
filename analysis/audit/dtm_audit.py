"""EMODnet DTM 2024 reality check per spot (runs locally or in Actions; ERDDAP + WFS are public).

For every spot: 0–500 m transect (25 m) from the tip along the stored shore normal, cell by cell:
elevation, interpolation_flag (1 = no soundings, extrapolated), value_count, stdev, and the 2024 source
reference polygon (GEBCO2024 fill vs SeaDataNet CDI survey). Also bbox-wide source composition and the
"parallel equidistant contour ring" test: in GEBCO-filled cells depth should be a smooth function of
distance from the coast (r close to 1), unlike surveyed cells.

Usage: python analysis/audit/dtm_audit.py data/spots.geojson docs/audit
"""

from __future__ import annotations

import csv
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from netCDF4 import Dataset
from shapely.geometry import Point, shape
from shapely.prepared import prep

BBOX = (40.28, 40.62, 28.55, 29.25)  # south, north, west, east
VARS = ["elevation", "value_count", "interpolation_flag", "stdev"]
ERDDAP = "https://erddap.emodnet.eu/erddap/griddap/bathymetry_dtm_2024.nc?"
WFS = ("https://ows.emodnet-bathymetry.eu/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=emodnet:source_references"
       "&outputFormat=application/json&srsName=EPSG:4326&bbox={s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326")
M_LAT = 110_540.0


def m_lon(lat: float) -> float:
    return 111_320.0 * math.cos(math.radians(lat))


def fetch(url: str, path: Path) -> Path:
    if not path.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "av-livn audit"}), timeout=300) as r:
            path.write_bytes(r.read())
    return path


def main(argv: list[str]) -> int:
    spots_path = Path(argv[1] if len(argv) > 1 else "data/spots.geojson")
    out = Path(argv[2] if len(argv) > 2 else "docs/audit")
    cache = Path(argv[3] if len(argv) > 3 else "/tmp")
    out.mkdir(parents=True, exist_ok=True)
    s, n, w, e = BBOX
    q = ",".join(f"{v}[({s}):1:({n})][({w}):1:({e})]" for v in VARS)
    nc = fetch(ERDDAP + urllib.request.quote(q, safe="():,[]"), cache / "dtm_audit.nc")
    with Dataset(nc) as ds:
        lat = np.asarray(ds["latitude"][:], float)
        lon = np.asarray(ds["longitude"][:], float)
        v = {k: np.ma.filled(ds[k][:].astype(float), np.nan) for k in VARS}
    srcs = json.loads(fetch(WFS.format(s=s, w=w, n=n, e=e), cache / "dtm_sources.json").read_text())
    polys = [(f["properties"]["identifier"], prep(shape(f["geometry"]).buffer(0))) for f in srcs["features"] if f["properties"]["release"] == "2024"]

    def source_at(la: float, lo: float) -> str:
        p = Point(lo, la)
        hits = [i for i, g in polys if g.contains(p)]
        cdi = [h for h in hits if h[0].isdigit()]
        return cdi[0] if cdi else (hits[0] if hits else "none")

    def cell(la: float, lo: float) -> tuple[int, int] | None:
        i = int(round((la - lat[0]) / (lat[1] - lat[0])))
        j = int(round((lo - lon[0]) / (lon[1] - lon[0])))
        return (i, j) if 0 <= i < len(lat) and 0 <= j < len(lon) else None

    # bbox composition of sea cells
    sea = np.isfinite(v["elevation"]) & (v["elevation"] < 0)
    comp: dict[str, int] = {}
    ii, jj = np.where(sea)
    rng = np.random.default_rng(1)
    pick = rng.choice(len(ii), size=min(6000, len(ii)), replace=False)
    for k in pick:
        sid = source_at(lat[ii[k]], lon[jj[k]])
        key = "CDI survey" if sid[0].isdigit() else sid
        comp[key] = comp.get(key, 0) + 1
    interp_frac = float(np.nanmean(v["interpolation_flag"][sea] == 1))
    zero_count = float(np.mean(v["value_count"][sea] == 0))

    # ring test: depth vs distance to nearest non-sea cell, by source
    land = ~sea
    li, lj = np.where(land)
    land_xy = np.column_stack([lat[li] * M_LAT, lon[lj] * m_lon(40.45)])
    from scipy.spatial import cKDTree  # noqa: PLC0415
    tree = cKDTree(land_xy)
    ring = {"GEBCO2024": [], "CDI survey": []}
    for k in pick:
        sid = source_at(lat[ii[k]], lon[jj[k]])
        key = "CDI survey" if sid[0].isdigit() else sid
        if key in ring:
            d, _ = tree.query([lat[ii[k]] * M_LAT, lon[jj[k]] * m_lon(40.45)])
            if d < 3000:
                ring[key].append((d, -v["elevation"][ii[k], jj[k]]))
    ring_stats = {}
    for key, pts in ring.items():
        if len(pts) > 20:
            a = np.array(pts)
            r = float(np.corrcoef(a[:, 0], a[:, 1])[0, 1])
            slope = float(np.polyfit(a[:, 0], a[:, 1], 1)[0] * 100)
            resid = float(np.std(a[:, 1] - np.polyval(np.polyfit(a[:, 0], a[:, 1], 1), a[:, 0])))
            ring_stats[key] = {"cells_within_3km_of_coast": len(pts), "r_depth_vs_distance": round(r, 3), "slope_m_per_100m": round(slope, 2), "residual_sd_m": round(resid, 2)}

    # smoothness test: GEBCO fill is a resampled ~450 m grid, so its discrete Laplacian is tiny and contours
    # come out as smooth, evenly spaced rings parallel to the coast; surveyed (CDI) cells are rough.
    z = v["elevation"]
    lap = np.full(z.shape, np.nan)
    lap[1:-1, 1:-1] = np.abs(z[2:, 1:-1] + z[:-2, 1:-1] + z[1:-1, 2:] + z[1:-1, :-2] - 4 * z[1:-1, 1:-1])
    smooth: dict[str, dict[str, list[float]]] = {}
    for k in pick:
        i, j = ii[k], jj[k]
        sid = source_at(lat[i], lon[j])
        key = "CDI survey" if sid[0].isdigit() else sid
        a = smooth.setdefault(key, {"lap": [], "vc": [], "fl": []})
        a["lap"].append(lap[i, j]); a["vc"].append(v["value_count"][i, j]); a["fl"].append(v["interpolation_flag"][i, j])
    smooth_stats = {k: {"cells": len(a["lap"]), "laplacian_median_m": round(float(np.nanmedian(a["lap"])), 3),
                        "value_count_median": float(np.nanmedian(a["vc"])), "interpolated_share": round(float(np.nanmean(np.array(a["fl"]) == 1)), 2)}
                    for k, a in smooth.items()}

    # per-spot transects
    spots = json.loads(spots_path.read_text())["features"]
    rows, summary = [], []
    for f in spots:
        p = f["properties"]
        lo0, la0 = f["geometry"]["coordinates"]
        nrm = p.get("shore_normal_deg") or 0.0
        cells = []
        for d in range(0, 501, 25):
            la = la0 + d * math.cos(math.radians(nrm)) / M_LAT
            lo = lo0 + d * math.sin(math.radians(nrm)) / m_lon(la0)
            c = cell(la, lo)
            rec = {"spot": p["id"], "name": p["name"], "dist_m": d, "lat": round(la, 5), "lon": round(lo, 5)}
            if c:
                i, j = c
                rec.update({k: (None if np.isnan(v[k][i, j]) else round(float(v[k][i, j]), 2)) for k in VARS})
                rec["cell"] = f"{i},{j}"
            rec["source"] = source_at(la, lo)
            rows.append(rec)
            cells.append(rec)
        first_sea = next((c["dist_m"] for c in cells if c.get("elevation") is not None and c["elevation"] < 0), None)
        at200 = cells[8]
        summary.append({
            "spot": p["id"], "name": p["name"], "normal_deg": nrm,
            "tip_cell_elevation": cells[0].get("elevation"), "first_sea_cell_m": first_sea,
            "depth_200m": None if at200.get("elevation") is None else -at200["elevation"],
            "interp_200m": at200.get("interpolation_flag"), "value_count_200m": at200.get("value_count"),
            "source_200m": at200["source"],
            "share_gebco_0_500": round(sum(1 for c in cells if c["source"].startswith("GEBCO")) / len(cells), 2),
            "share_interpolated_0_500": round(sum(1 for c in cells if c.get("interpolation_flag") == 1) / max(1, sum(1 for c in cells if c.get("interpolation_flag") is not None)), 2),
            "max_depth_0_500": max((-c["elevation"] for c in cells if c.get("elevation") is not None), default=None),
        })
    with open(out / "dtm_transects.csv", "w", newline="") as fh:
        wr = csv.DictWriter(fh, fieldnames=["spot", "name", "dist_m", "lat", "lon", "cell", *VARS, "source"], extrasaction="ignore")
        wr.writeheader()
        wr.writerows(rows)
    result = {
        "dataset": "EMODnet bathymetry_dtm_2024 (ERDDAP), source_references 2024 (WFS)",
        "bbox": BBOX,
        "sea_cells": int(sea.sum()),
        "sea_cell_source_share_sample": {k: round(c / len(pick), 3) for k, c in sorted(comp.items(), key=lambda kv: -kv[1])},
        "sea_cells_interpolated_share": round(interp_frac, 3),
        "sea_cells_value_count_zero_share": round(zero_count, 3),
        "ring_test_depth_vs_coast_distance": ring_stats,
        "smoothness_by_source": smooth_stats,
        "spots": summary,
    }
    (out / "dtm_audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "spots"}, ensure_ascii=False, indent=1))
    try:
        import matplotlib  # noqa: PLC0415
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt  # noqa: PLC0415
        fig, axes = plt.subplots(4, 4, figsize=(14, 11), sharex=True)
        colours = {"GEBCO2024": "#999999", "Coastal_heights_2024": "#c58c2b", "none": "#d24b4b"}
        for ax, sm in zip(axes.ravel(), summary):
            pts = [r for r in rows if r["spot"] == sm["spot"]]
            for r in pts:
                el = r.get("elevation")
                if el is None:
                    ax.scatter(r["dist_m"], 0, marker="x", color="#d24b4b", s=14)
                    continue
                c = "#2b6cb0" if r["source"][0].isdigit() else colours.get(r["source"], "#555")
                ax.scatter(r["dist_m"], -el, color=c, s=14, marker="o" if r.get("interpolation_flag") == 0 else "s")
            ax.invert_yaxis(); ax.set_title(sm["name"][:28], fontsize=8); ax.tick_params(labelsize=7)
        fig.suptitle("EMODnet DTM 2024, 0–500 m transects from spot tip. Blue=CDI survey, grey=GEBCO2024, brown=Coastal heights, red=no source / x=no data; square=interpolated", fontsize=9)
        fig.supxlabel("distance from tip (m)"); fig.supylabel("depth (m)")
        fig.tight_layout(); fig.savefig(out / "dtm_transects.png", dpi=110)
    except ImportError:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
