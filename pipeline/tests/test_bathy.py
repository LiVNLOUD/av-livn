import math

import numpy as np
import pytest

from av_pipeline.bathy.grid import Grid, along
from av_pipeline.bathy.sample import dtm_probe, features, profile, slope_pct
from av_pipeline.spots import build_spots as bs
from av_pipeline.spots.geo import M_PER_DEG_LAT

LAT0, LON0 = 40.40, 28.90
CELL = 1 / 960  # EMODnet DTM spacing


def sloped_grid(k=0.05, shore_lat=LAT0, land_nan=True):
    """Coast along shore_lat, sea to the north; depth = k × metres north of the shore."""
    lat = LAT0 - 0.02 + np.arange(80) * CELL
    lon = LON0 - 0.02 + np.arange(60) * CELL
    north_m = (lat - shore_lat) * M_PER_DEG_LAT
    elev = np.repeat((-k * north_m)[:, None], len(lon), axis=1)
    if land_nan:
        elev[north_m < 0, :] = np.nan
    return Grid(lat, lon, elev)


def test_bilinear_depth_on_a_linear_ramp():
    g = sloped_grid()
    lat, _ = along(LAT0, LON0, 0, 300)
    assert g.depth(lat, LON0) == pytest.approx(15, abs=0.2)
    assert g.depth(LAT0 - 0.01, LON0) is None  # land
    assert g.depth(41.0, LON0) is None  # outside


def test_partial_nan_neighbours_are_renormalised():
    g = sloped_grid(k=0.0)
    g.elev[:] = -10.0
    g.elev[40, 30] = np.nan
    assert g.depth(g.lat[40] + CELL / 2, g.lon[30] + CELL / 2) == pytest.approx(10)


def test_profile_has_21_points_every_25_m():
    # Start 150 m offshore, clear of the land edge (where NaN neighbours bias the bilinear mean deeper).
    p = profile(sloped_grid(), *along(LAT0, LON0, 0, 150), 0)
    assert len(p) == 21
    assert p[0] == pytest.approx(7.5, abs=0.2)
    assert p[10] == pytest.approx(20, abs=0.2)
    assert p[-1] == pytest.approx(32.5, abs=0.3)


def test_features_depth_slope_and_max_within_100m():
    f = features(sloped_grid(), *along(LAT0, LON0, 0, 100), 0)
    assert f["depth_200m"] == pytest.approx(15, abs=0.3)
    assert f["slope_pct"] == pytest.approx(5.0, abs=0.2)
    assert f["max_depth_100m"] == pytest.approx(10, abs=1.2)


def test_slope_skips_leading_land_points():
    assert slope_pct([None, None, 1.0] + [None] * 9 + [11.0]) == pytest.approx(10 / 250 * 100, abs=0.1)
    assert slope_pct([None] * 21) is None
    assert slope_pct([1.0] * 12 + [None] * 9) is None


def test_dtm_probe_finds_first_5m_point_or_none():
    g = sloped_grid(k=0.05)
    lat, lon = dtm_probe(g, LAT0, LON0, 0)
    assert (lat - LAT0) * M_PER_DEG_LAT == pytest.approx(100, abs=26)  # 5 m at 5 %
    flat = sloped_grid(k=0.001)
    assert dtm_probe(flat, LAT0, LON0, 0) is None  # never reaches 5 m within 3 km... grid ends first


def test_from_netcdf_flips_descending_latitudes(tmp_path):
    netCDF4 = pytest.importorskip("netCDF4")
    path = tmp_path / "dtm.nc"
    with netCDF4.Dataset(path, "w") as ds:
        ds.createDimension("latitude", 3)
        ds.createDimension("longitude", 2)
        ds.createVariable("latitude", "f8", ("latitude",))[:] = [40.3, 40.2, 40.1]
        ds.createVariable("longitude", "f8", ("longitude",))[:] = [28.9, 29.0]
        v = ds.createVariable("elevation", "f4", ("latitude", "longitude"), fill_value=np.float32(np.nan))
        v[:] = [[-3, -3], [-2, -2], [-1, np.nan]]
    g = Grid.from_netcdf(str(path))
    assert list(g.lat) == [40.1, 40.2, 40.3]
    assert math.isnan(g.elev[0, 1]) and g.elev[2, 0] == -3


def _raw_with_harbour_wall():
    from tests.test_spots import COASTS, pier, way

    return {"elements": [way(1, {"natural": "coastline"}, COASTS[0]), pier(10, 0, 100)]}


def test_build_spots_adds_depth_features_with_dtm():
    fc = bs.build(_raw_with_harbour_wall(), sloped_grid())
    p = fc["features"][0]["properties"]
    assert p["normal_source"] == "dtm" and p["shore_normal_deg"] in (0.0, 355.0, 5.0)
    assert p["probe_source"] == "dtm"
    assert len(p["profile"]) == 21
    assert p["depth_200m"] == pytest.approx(15, abs=0.5)  # tip is 100 m out; +200 m = 300 m from shore
    assert p["slope_pct"] == pytest.approx(5, abs=0.3)


def test_dtm_normal_points_down_slope_and_needs_water():
    from av_pipeline.bathy.sample import dtm_normal, sea_probe

    b, score = dtm_normal(sloped_grid(), *along(LAT0, LON0, 0, 100))
    assert b in (0.0, 5.0, 355.0) and score > 10
    dry = sloped_grid()
    dry.elev[:] = np.nan
    assert dtm_normal(dry, LAT0, LON0) is None
    lat, _ = sea_probe(sloped_grid(), LAT0, LON0, 0)
    assert (lat - LAT0) * M_PER_DEG_LAT == pytest.approx(750, abs=1)
    tiny = sloped_grid(k=0.05)
    tiny.elev[tiny.lat > LAT0 + 400 / M_PER_DEG_LAT, :] = np.nan  # water only 0–400 m: falls back to ≥5 m point
    lat, _ = sea_probe(tiny, LAT0, LON0, 0)
    assert (lat - LAT0) * M_PER_DEG_LAT == pytest.approx(100, abs=26)


def test_osm_normal_kept_when_dtm_shows_no_water():
    g = sloped_grid()
    g.elev[:] = np.nan
    p = bs.build(_raw_with_harbour_wall(), g)["features"][0]["properties"]
    assert p["normal_source"] == "osm" and p["probe_source"] == "normal"
    assert p["depth_200m"] is None


def test_build_spots_uses_dtm_probe_when_coastline_method_fails():
    from tests.test_spots import COASTS, pier, way, DLAT, LAT, LON

    far = way(2, {"natural": "coastline"}, [(LAT + 300 * DLAT, LON - 0.05), (LAT + 300 * DLAT, LON + 0.05)])
    raw = {"elements": [way(1, {"natural": "coastline"}, COASTS[0]), pier(10, 0, 20), far]}
    assert bs.build(raw)["features"][0]["properties"]["probe_lat"] is None
    assert bs.build(raw)["features"][0]["properties"]["coast_probe_found"] is False
    g = sloped_grid(k=0.1)
    g.elev[g.lat > LAT + 300 * DLAT, :] = np.nan  # the far shore is land in the DTM too
    p = bs.build(raw, g)["features"][0]["properties"]
    assert p["probe_source"] == "dtm"
    assert (p["probe_lat"] - LAT) * M_PER_DEG_LAT == pytest.approx(50, abs=26)
