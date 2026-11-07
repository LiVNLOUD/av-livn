import datetime as dt

import numpy as np

from av_pipeline.ocean.marmara import current_grid


def test_current_grid_decimates_scales_and_aligns_hours():
    t0 = dt.datetime(2026, 11, 7, 16, tzinfo=dt.timezone.utc)
    times = [t0 + dt.timedelta(hours=k) for k in range(3)]
    lats = np.array([40.3, 40.305, 40.31, 40.315])
    lons = np.array([29.0, 29.005, 29.01])
    u = np.full((3, 4, 3), 0.123)
    v = np.full((3, 4, 3), -0.05)
    u[1, 0, 0] = np.nan  # land
    h0 = int(t0.timestamp() // 3600)
    g = current_grid(times, lats, lons, u, v, h0, hours=4, stride=2)
    assert (g["nlat"], g["nlon"]) == (2, 2)
    assert g["lat0"] == 40.3 and abs(g["dlat"] - 0.01) < 1e-9 and abs(g["dlon"] - 0.01) < 1e-9
    assert g["vars"]["u"][0] == [12, 12, 12, 12]
    assert g["vars"]["v"][0] == [-5, -5, -5, -5]
    assert g["vars"]["u"][1][0] is None
    assert g["vars"]["u"][3] == [None] * 4  # past the forecast
    assert "Copernicus" in g["source"]
