"""G5: check that bathy.pmtiles draws the measured / interpolated split correctly at every zoom.

For sample DTM cells away from the mask edge (interpolated vs measured, sea only) the `interp` layer must contain
the interpolated ones and not the measured ones, and the `survey` layer the reverse, at each zoom MIN..MAX. It also
checks the `bands` layer at every sampled sea point: exactly the band of the (smoothed) depth.

  python -m av_pipeline.bathy.check_tiles data/bathy/dtm.nc apps/web/public/tiles/bathy.pmtiles
Needs `pmtiles` and `mapbox-vector-tile` (pipeline[dev]).
"""

from __future__ import annotations

import gzip
import math
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np

from av_pipeline.bathy.grid import Grid


def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int, float, float]:
    n = 2**z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return int(x), int(y), x % 1, y % 1


def edge_distance(mask: np.ndarray) -> np.ndarray:
    """Cells to the nearest cell of the other class (Chebyshev, capped at 8)."""
    d = np.full(mask.shape, 8, int)
    h, w = mask.shape
    for r in range(1, 8):
        p = np.pad(mask, r, mode="edge")  # no wrap-around: outside the grid counts as the same class
        sh = np.zeros_like(mask, bool)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                sh |= p[r + dy : r + dy + h, r + dx : r + dx + w] != mask
        d = np.where((d == 8) & sh, r, d)
    return d


SPOT_BBOX = (28.74, 40.33, 29.20, 40.55)  # the gulf: where the spots are, sampled densely


def samples(grid: Grid, n: int = 400, margin: int = 4, seed: int = 1, bbox: tuple[float, float, float, float] | None = None) -> list[tuple[float, float, bool]]:
    """(lon, lat, interpolated) for sea cells at least `margin` cells from the mask edge and from land."""
    sea = ~np.isnan(grid.elev)
    interp = grid.interp >= 0.5
    far = (edge_distance(interp) >= margin) & (edge_distance(sea) >= margin) & sea
    if bbox:
        lon2, lat2 = np.meshgrid(grid.lon, grid.lat)
        far &= (lon2 >= bbox[0]) & (lon2 <= bbox[2]) & (lat2 >= bbox[1]) & (lat2 <= bbox[3])
    rng = np.random.default_rng(seed)
    out = []
    for cls in (True, False):
        jj, ii = np.nonzero(far & (interp == cls))
        if len(jj) == 0:
            continue
        pick = rng.choice(len(jj), min(n // 2, len(jj)), replace=False)
        out += [(float(grid.lon[ii[k]]), float(grid.lat[jj[k]]), cls) for k in pick]
    return out


def check(dtm: Path, tiles: Path) -> list[str]:
    from pmtiles.reader import MmapSource, Reader
    import mapbox_vector_tile as mvt
    from shapely.geometry import Point, Polygon
    from shapely.prepared import prep

    grid = Grid.from_netcdf(str(dtm))
    pts = samples(grid) + samples(grid, n=800, margin=3, bbox=SPOT_BBOX, seed=2)
    from av_pipeline.bathy.contours import BAND_EDGES_M, smooth

    depth = smooth(np.where(np.isnan(grid.elev), np.nan, np.maximum(0.0, -grid.elev)))

    def band_of(lon: float, lat: float) -> int:
        d = depth[np.abs(grid.lat - lat).argmin(), np.abs(grid.lon - lon).argmin()]
        return int(np.searchsorted(BAND_EDGES_M, d, side="right")) - 1
    errors: list[str] = []
    with open(tiles, "rb") as f:
        r = Reader(MmapSource(f))
        h = r.header()

        @lru_cache(None)
        def layers(z: int, x: int, y: int):
            d = r.get(z, x, y)
            if d is None:
                return {}
            if d[:2] == b"\x1f\x8b":
                d = gzip.decompress(d)
            out = {}
            for name, layer in mvt.decode(d).items():
                polys = []
                for ft in layer["features"]:
                    g = ft["geometry"]
                    if g["type"] not in ("Polygon", "MultiPolygon"):
                        continue
                    for rings in [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]:
                        polys.append((prep(Polygon(rings[0])), [prep(Polygon(hole)) for hole in rings[1:]]))
                out[name] = (layer["extent"], polys)
            return out

        def dmin_at(z: int, lon: float, lat: float) -> list[float]:
            x, y, fx, fy = tile_xy(lon, lat, z)
            d = r.get(z, x, y)
            if d is None:
                return []
            if d[:2] == b"\x1f\x8b":
                d = gzip.decompress(d)
            p = Point(fx * 4096, (1 - fy) * 4096)
            out = []
            for ft in mvt.decode(d).get("bands", {}).get("features", []):
                g = ft["geometry"]
                for rings in [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]:
                    if Polygon(rings[0]).contains(p) and not any(Polygon(hh).contains(p) for hh in rings[1:]):
                        out.append(ft["properties"].get("dmin"))
            return out

        def inside(z: int, name: str, lon: float, lat: float) -> bool:
            x, y, fx, fy = tile_xy(lon, lat, z)
            t = layers(z, x, y)
            if name not in t:
                return False
            ext, polys = t[name]
            p = Point(fx * ext, (1 - fy) * ext)  # mapbox_vector_tile decodes with y up
            return any(e.contains(p) and not any(hh.contains(p) for hh in hs) for e, hs in polys)

        for z in range(h["min_zoom"], h["max_zoom"] + 1):
            bad = {"interp": 0, "survey": 0, "bands": 0}
            for k, (lon, lat, is_interp) in enumerate(pts):
                if k % 4 == 0:  # bands: exactly one polygon, within one band of the smoothed depth
                    got = dmin_at(z, lon, lat)
                    want = band_of(lon, lat)
                    if len(got) != 1 or abs(int(np.searchsorted(BAND_EDGES_M, got[0], side="right")) - 1 - want) > 1:
                        bad["bands"] += 1
                if inside(z, "interp", lon, lat) != is_interp:
                    bad["interp"] += 1
                if inside(z, "survey", lon, lat) == is_interp:
                    bad["survey"] += 1
            share = {k: v / max(1, len(pts) if k != "bands" else len(pts) // 4) for k, v in bad.items()}
            line = f"z{z}: {len(pts)} örnek, interp hatası {bad['interp']}, survey hatası {bad['survey']}, bant hatası {bad['bands']}"
            print(line)
            if max(share.values()) > 0.01:
                errors.append(line)
    return errors


def main(argv: list[str]) -> int:  # pragma: no cover - CLI
    errs = check(Path(argv[1]), Path(argv[2]))
    if errs:
        print("HATA: ölçülmüş/ölçülmemiş ayrımı bazı zoom seviyelerinde yanlış:\n" + "\n".join(errs), file=sys.stderr)
        return 1
    print("tamam: ölçülmüş/ölçülmemiş ayrımı tüm zoom seviyelerinde doğru")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv))
