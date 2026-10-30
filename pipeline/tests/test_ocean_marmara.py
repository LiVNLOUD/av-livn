import datetime as dt
import io
import json

import netCDF4
import numpy as np
import pytest

from av_pipeline.ocean import marmara as m

LATS = np.array([40.40, 40.40625, 40.4125])
LONS = np.array([28.90, 28.90625, 28.9125])


def test_depth_mean_ignores_levels_below_seabed():
    v = np.full((2, 3, 1, 2), np.nan)
    v[:, 0, 0, 0] = 10
    v[:, 1, 0, 0] = 14  # 2 levels in the shallow cell, none in the land cell
    out = m.depth_mean(v, np.array([1.0, 5.0, 25.0]), 0.5, 20.5)
    assert out[:, 0, 0].tolist() == [12, 12]
    assert np.isnan(out[0, 0, 1])


def test_nearest_wet_skips_land_cells():
    f = np.full((2, 3, 3), np.nan)
    f[:, 2, 2] = 15
    assert m.nearest_wet(f, LATS, LONS, 40.40, 28.90)[:2] == (2, 2)
    assert m.nearest_wet(np.full((1, 3, 3), np.nan), LATS, LONS, 40.4, 28.9) is None


def test_short_normal_window_and_minimum_years():
    days = [dt.date(2022, 1, 1) + dt.timedelta(days=k) for k in range(365 * 4)]
    vals = np.array([10 + 5 * math_sin(d) for d in days])
    vals[:10] = np.nan
    norm = m.short_normal(days, vals)
    assert len(norm) == 366
    assert norm[0] == pytest.approx(10, abs=0.5)
    two = m.short_normal(days[:365 * 2], vals[:365 * 2])
    assert all(x is None for x in two)


def math_sin(d):
    return np.sin(2 * np.pi * (d.timetuple().tm_yday - 1) / 365)


def test_series_for_rounds_and_handles_missing_current():
    times = [dt.datetime(2026, 11, 1, h, tzinfo=dt.timezone.utc) for h in range(3)]
    sst = np.full((3, 3, 3), np.nan)
    sst[:, 1, 1] = [17.123, np.nan, 17.2]
    cur = np.full((3, 3, 3), 0.12345)
    out = m.series_for([{"id": "a", "lat": 40.406, "lon": 28.906}, {"id": "b", "lat": 50, "lon": 30}], times, LATS, LONS, sst, cur)
    assert out["a"]["sst"] == [17.12, None, 17.2]
    assert out["a"]["cur"] == [0.123] * 3
    assert out["a"]["t0"] == "2026-11-01T00:00Z"
    assert set(out) == {"a", "b"}  # b gets the nearest wet cell, however far: distance is reported
    assert out["b"]["cell"]["distance_km"] > 500
    assert m.series_for([{"id": "a", "lat": 40.4, "lon": 28.9}], times, LATS, LONS, np.full((3, 3, 3), np.nan), None) == {}
    assert m.series_for([{"id": "a", "lat": 40.4, "lon": 28.9}], times, LATS, LONS, sst, None)["a"]["cur"] is None


def write_nc(path, var_values: dict, times, depths):
    with netCDF4.Dataset(path, "w") as nc:
        nc.createDimension("time", len(times))
        nc.createDimension("depth", len(depths))
        nc.createDimension("latitude", len(LATS))
        nc.createDimension("longitude", len(LONS))
        t = nc.createVariable("time", "f8", ("time",))
        t.units = "hours since 1950-01-01 00:00:00"
        t[:] = netCDF4.date2num(times, t.units)
        nc.createVariable("depth", "f4", ("depth",))[:] = depths
        nc.createVariable("latitude", "f4", ("latitude",))[:] = LATS
        nc.createVariable("longitude", "f4", ("longitude",))[:] = LONS
        for k, v in var_values.items():
            x = nc.createVariable(k, "f4", ("time", "depth", "latitude", "longitude"), fill_value=np.float32(1e20))
            x[:] = np.ma.masked_invalid(v)


class FakeD1:
    def __init__(self):
        self.calls = []

    def query(self, sql, params=None):
        self.calls.append((sql, params))
        if sql.startswith("SELECT"):
            return [{"id": "s1", "lat": 40.406, "lon": 28.906}, {"id": "s2", "lat": 40.41, "lon": 28.91}]
        return []


def test_forecast_and_normal_end_to_end(monkeypatch, tmp_path):
    now = dt.datetime(2026, 11, 2, 12, tzinfo=dt.timezone.utc)
    hours = [dt.datetime(2026, 10, 30) + dt.timedelta(hours=h) for h in range(5)]

    def fake_subset(dataset, variables, box, start, end, depth, out):
        assert box[0] < 40.406 < box[1]
        if dataset == m.TEM_H:
            v = np.full((5, 2, 3, 3), 16.0)
            v[:, :, 0, 0] = np.nan
            write_nc(out, {"thetao": v}, hours, [1.0, 10.0])
        elif dataset == m.CUR_H:
            write_nc(out, {"uo": np.full((5, 1, 3, 3), 0.3), "vo": np.full((5, 1, 3, 3), 0.4)}, hours, [1.0])
        else:
            days = [dt.datetime(2021, 11, 1) + dt.timedelta(days=k) for k in range(365 * 4)]
            write_nc(out, {"thetao": np.full((len(days), 1, 3, 3), 15.0)}, days, [1.0])
        return out

    monkeypatch.setattr(m, "cm_subset", fake_subset)
    d1 = FakeD1()
    assert m.forecast(d1, now) == 2
    sql, params = d1.calls[1]
    assert sql.startswith("INSERT INTO ocean_series")
    s = json.loads(params[2])
    assert s["sst"] == [16.0] * 5 and s["cur"] == [0.5] * 5
    d1 = FakeD1()
    assert m.normal(d1, now) == 2
    meta = json.loads(d1.calls[1][1][2])
    assert meta["years"] == 4.0 and meta["normal"][100] == 15.0  # 1460 days ≈ 4 years of archive


def test_forecast_drops_current_when_grids_differ(monkeypatch):
    hours = [dt.datetime(2026, 10, 30) + dt.timedelta(hours=h) for h in range(3)]

    def fake_subset(dataset, variables, box, start, end, depth, out):
        if dataset == m.TEM_H:
            write_nc(out, {"thetao": np.full((3, 1, 3, 3), 16.0)}, hours, [1.0])
        else:
            write_nc(out, {"uo": np.full((2, 1, 3, 3), 0.3), "vo": np.full((2, 1, 3, 3), 0.4)}, hours[:2], [1.0])
        return out

    monkeypatch.setattr(m, "cm_subset", fake_subset)
    d1 = FakeD1()
    m.forecast(d1, dt.datetime(2026, 11, 2, tzinfo=dt.timezone.utc))
    assert json.loads(d1.calls[1][1][2])["cur"] is None


def test_d1_client_retries_and_reads_results(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "t")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "acc")
    monkeypatch.setattr(m.time, "sleep", lambda s: None)
    answers = [OSError("reset"), {"success": False, "errors": ["x"]}, {"success": True, "result": [{"results": [{"a": 1}]}]}]
    seen = []

    def opener(req, timeout):
        seen.append(req.full_url)
        a = answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return io.BytesIO(json.dumps(a).encode())

    d1 = m.D1(opener)
    assert d1.query("SELECT 1") == [{"a": 1}]
    assert "/accounts/acc/d1/database/83445f2d" in seen[0]
    answers.extend([{"success": False, "errors": ["boom"]}] * 3)
    with pytest.raises(RuntimeError, match="boom"):
        d1.query("SELECT 1")


def test_cm_subset_raises_on_failure(monkeypatch, tmp_path):
    class R:
        returncode = 1
        stderr = "auth failed"

    monkeypatch.setattr(m.subprocess, "run", lambda *a, **k: R())
    with pytest.raises(RuntimeError, match="auth failed"):
        m.cm_subset("x", ["thetao"], (1, 2, 3, 4), "a", "b", (0, 1), tmp_path / "o.nc")
    R.returncode = 0
    assert m.cm_subset("x", ["thetao"], (1, 2, 3, 4), "a", "b", (0, 1), tmp_path / "o.nc") == tmp_path / "o.nc"


def test_main_dispatch(monkeypatch):
    monkeypatch.setattr(m, "D1", lambda: object())
    monkeypatch.setattr(m, "forecast", lambda d1, now: 3)
    monkeypatch.setattr(m, "normal", lambda d1, now: 0)
    assert m.main(["x", "forecast"]) == 0
    assert m.main(["x", "normal"]) == 1
