"""DTM → depth contours, depth bands and land mask → one vector PMTiles file (GDAL ≥ 3.8).

Layers: `contours` (lines, attribute depth), `bands` (polygons, dmin/dmax), `interp` (polygons where the DTM
is interpolated, no soundings: drawn hatched), `land` (OSM land polygons clipped to MAP_EXTENT when --land is
given: a vector coastline; else the DTM no-data mask).
Usage: python -m av_pipeline.bathy.contours data/bathy/dtm.nc apps/web/public/tiles/bathy.pmtiles [--land data/osm/land_marmara.geojson]
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from av_pipeline import MAP_EXTENT
from av_pipeline.bathy.grid import Grid

LEVELS_M = [2, 5, 10, 15, 20, 30, 50, 75, 100]
BAND_EDGES_M = [0, 2, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 400]
MIN_ZOOM, MAX_ZOOM = 8, 14
MAX_BYTES = 25 * 1024 * 1024  # Workers static asset limit per file


def run(*args: str) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, check=True)


def write_asc(path: Path, grid: Grid, values: np.ndarray, nodata: float = -9999.0) -> None:
    """ESRI ASCII grid (north row first). Avoids GDAL's Python bindings, which are not always usable."""
    cell = float(grid.lon[1] - grid.lon[0])
    data = np.where(np.isnan(values), nodata, values)[::-1, :]
    header = (
        f"ncols {len(grid.lon)}\nnrows {len(grid.lat)}\n"
        f"xllcorner {grid.lon[0] - cell / 2:.10f}\nyllcorner {grid.lat[0] - cell / 2:.10f}\n"
        f"cellsize {cell:.12f}\nNODATA_value {nodata}\n"
    )
    with open(path, "w") as f:
        f.write(header)
        np.savetxt(f, data, fmt="%.2f")


def build(dtm: Path, out: Path, max_zoom: int = MAX_ZOOM, land: Path | None = None) -> int:
    grid = Grid.from_netcdf(str(dtm))
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        # Positive depth (metres) so attributes read naturally; land stays nodata for the contour lines.
        depth = np.where(np.isnan(grid.elev), np.nan, np.maximum(0.0, -grid.elev))
        write_asc(t / "depth.asc", grid, depth)
        # Bands: DTM land/no-data counts as 0 m, so the shallowest band runs under the land layer and the
        # visible water edge is the vector OSM coastline drawn on top, not the DTM's staircase.
        write_asc(t / "bandsrc.asc", grid, np.where(np.isnan(depth), 0.0, depth))
        # Land = DTM nodata, as a 0/1 mask contoured at 0.5.
        write_asc(t / "land.asc", grid, np.isnan(grid.elev).astype(float))
        names = ["depth", "bandsrc", "land"]
        if grid.interp is not None:
            sea = ~np.isnan(grid.elev)
            write_asc(t / "interp.asc", grid, np.where(sea, (grid.interp >= 0.5).astype(float), 0.0))
            names.append("interp")
        for name in names:
            run("gdal_translate", "-q", "-a_srs", "EPSG:4326", str(t / f"{name}.asc"), str(t / f"{name}.tif"))
        run("gdal_contour", "-q", "-a", "depth", *sum((["-fl", str(v)] for v in LEVELS_M), []), str(t / "depth.tif"), str(t / "contours.gpkg"), "-nln", "contours")
        run("gdal_contour", "-q", "-p", "-amin", "dmin", "-amax", "dmax", *sum((["-fl", str(v)] for v in BAND_EDGES_M), []), str(t / "bandsrc.tif"), str(t / "bands.gpkg"), "-nln", "bands")
        run("gdal_contour", "-q", "-p", "-amin", "lmin", "-amax", "lmax", "-fl", "0.5", str(t / "land.tif"), str(t / "land.gpkg"), "-nln", "land")
        merged = t / "bathy.gpkg"
        run("ogr2ogr", "-f", "GPKG", str(merged), str(t / "contours.gpkg"), "-nln", "contours", "-simplify", "0.0002")
        run("ogr2ogr", "-update", "-f", "GPKG", str(merged), str(t / "bands.gpkg"), "-nln", "bands", "-nlt", "PROMOTE_TO_MULTI", "-simplify", "0.0002")
        if land is not None:
            e = MAP_EXTENT
            ext = [str(e["west"]), str(e["south"]), str(e["east"]), str(e["north"])]
            run("ogr2ogr", "-update", "-f", "GPKG", str(merged), str(land), "-nln", "land", "-spat", *ext, "-clipsrc", *ext,
                "-nlt", "PROMOTE_TO_MULTI", "-simplify", "0.00004")
        else:
            run("ogr2ogr", "-update", "-f", "GPKG", str(merged), str(t / "land.gpkg"), "-nln", "land", "-where", "lmin >= 0.5", "-nlt", "PROMOTE_TO_MULTI", "-simplify", "0.0002")
        if "interp" in names:
            run("gdal_contour", "-q", "-p", "-amin", "imin", "-amax", "imax", "-fl", "0.5", str(t / "interp.tif"), str(t / "interp.gpkg"), "-nln", "interp")
            run("ogr2ogr", "-update", "-f", "GPKG", str(merged), str(t / "interp.gpkg"), "-nln", "interp", "-where", "imin >= 0.5", "-nlt", "PROMOTE_TO_MULTI", "-simplify", "0.0003")
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            out.unlink()
        run("ogr2ogr", "-f", "PMTiles", str(out), str(merged), "-dsco", f"MINZOOM={MIN_ZOOM}", "-dsco", f"MAXZOOM={max_zoom}", "-dsco", "NAME=av-livn bathymetry")
    return out.stat().st_size


def main(argv: list[str]) -> int:
    dtm = Path(argv[1] if len(argv) > 1 else "data/bathy/dtm.nc")
    out = Path(argv[2] if len(argv) > 2 else "apps/web/public/tiles/bathy.pmtiles")
    if not shutil.which("gdal_contour"):
        print("gdal_contour not found (apt install gdal-bin)", file=sys.stderr)
        return 1
    land = Path(argv[argv.index("--land") + 1]) if "--land" in argv else None
    max_zoom = MAX_ZOOM
    size = build(dtm, out, max_zoom, land)
    while size > MAX_BYTES and max_zoom > MIN_ZOOM + 2:
        max_zoom -= 1
        print(f"{size} bytes > limit, retrying with MAXZOOM={max_zoom}")
        size = build(dtm, out, max_zoom, land)
    print(f"bathy.pmtiles: {size} bytes ({size / 1024 / 1024:.2f} MiB), zoom {MIN_ZOOM}–{max_zoom}")
    return 0 if size <= MAX_BYTES else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
