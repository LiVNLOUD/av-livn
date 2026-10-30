"""Regular lat/lon elevation grid with bilinear depth sampling (pure numpy, no GDAL)."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from av_pipeline.spots.geo import offset, to_lonlat, to_xy


@dataclass
class Grid:
    lat: np.ndarray  # ascending, cell centres
    lon: np.ndarray  # ascending, cell centres
    elev: np.ndarray  # shape (len(lat), len(lon)); metres, negative below sea level, NaN on land

    @classmethod
    def from_netcdf(cls, path: str) -> "Grid":
        from netCDF4 import Dataset  # imported lazily: tests use synthetic grids

        with Dataset(path) as ds:
            lat = np.asarray(ds.variables["latitude"][:], dtype=float)
            lon = np.asarray(ds.variables["longitude"][:], dtype=float)
            z = np.ma.filled(ds.variables["elevation"][:].astype(float), np.nan)
        if lat[0] > lat[-1]:
            lat, z = lat[::-1], z[::-1, :]
        return cls(lat, lon, z)

    def depth(self, lat: float, lon: float) -> float | None:
        """Bilinear depth in metres (positive down). NaN neighbours are dropped and weights renormalised;
        None when all four neighbours are land/NaN or the point is outside the grid."""
        fi = (lat - self.lat[0]) / (self.lat[1] - self.lat[0])
        fj = (lon - self.lon[0]) / (self.lon[1] - self.lon[0])
        i0, j0 = math.floor(fi), math.floor(fj)
        if i0 < 0 or j0 < 0 or i0 + 1 >= len(self.lat) or j0 + 1 >= len(self.lon):
            return None
        di, dj = fi - i0, fj - j0
        acc = wsum = 0.0
        for ii, jj, w in ((i0, j0, (1 - di) * (1 - dj)), (i0 + 1, j0, di * (1 - dj)), (i0, j0 + 1, (1 - di) * dj), (i0 + 1, j0 + 1, di * dj)):
            z = self.elev[ii, jj]
            if not np.isnan(z) and w > 0:
                acc += w * z
                wsum += w
        if wsum == 0:
            return None
        return max(0.0, -acc / wsum)

    def cells_within(self, lat: float, lon: float, radius_m: float) -> list[float]:
        """Depths of grid cells whose centres lie within radius_m of (lat, lon)."""
        x0, y0 = to_xy(lon, lat)
        out = []
        dlat = radius_m / 110_540.0 + abs(self.lat[1] - self.lat[0])
        dlon = radius_m / 80_000.0 + abs(self.lon[1] - self.lon[0])
        ii = np.where(np.abs(self.lat - lat) <= dlat)[0]
        jj = np.where(np.abs(self.lon - lon) <= dlon)[0]
        for i in ii:
            for j in jj:
                z = self.elev[i, j]
                if np.isnan(z):
                    continue
                x, y = to_xy(self.lon[j], self.lat[i])
                if math.hypot(x - x0, y - y0) <= radius_m:
                    out.append(max(0.0, -float(z)))
        return out


def along(lat: float, lon: float, bearing_deg: float, dist_m: float) -> tuple[float, float]:
    """(lat, lon) reached from (lat, lon) after dist_m along bearing_deg."""
    x, y = offset(to_xy(lon, lat), bearing_deg, dist_m)
    lo, la = to_lonlat(x, y)
    return la, lo
