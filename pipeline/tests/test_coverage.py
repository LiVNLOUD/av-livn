import numpy as np

from av_pipeline.bathy.grid import Grid
from av_pipeline.spots import coverage as cov
from av_pipeline.spots.geo import to_lonlat


def ring(lon0, lat0, lon1, lat1):
    return [{"lon": lon0, "lat": lat0}, {"lon": lon1, "lat": lat0}, {"lon": lon1, "lat": lat1}, {"lon": lon0, "lat": lat1}, {"lon": lon0, "lat": lat0}]


RAW = {"elements": [
    {"type": "relation", "id": 1, "tags": {"admin_level": "4", "name": "Bursa"}, "members": [{"type": "way", "role": "outer", "geometry": ring(28.8, 40.3, 29.1, 40.45)}]},
    {"type": "relation", "id": 2, "tags": {"admin_level": "4", "name": "Yalova"}, "members": [{"type": "way", "role": "outer", "geometry": ring(28.8, 40.46, 29.1, 40.6)}]},
    {"type": "relation", "id": 3, "tags": {"admin_level": "6", "name": "Gemlik"}, "members": []},
]}


def test_province_polygons_and_assignment():
    polys = cov.province_polygons(RAW)
    assert set(polys) == {"Bursa", "Yalova"}
    assert cov.province_of((28.9, 40.35), polys) == "bursa"
    assert cov.province_of((28.9, 40.5), polys) == "yalova"
    assert cov.province_of((28.9, 40.452), polys) in ("bursa", "yalova")  # in the gap: nearest within 3 km
    assert cov.province_of((27.0, 40.0), polys) is None


def test_coverage_rows_and_report():
    from shapely.geometry import LineString

    from av_pipeline.spots.geo import to_xy

    polys = cov.province_polygons(RAW)
    coast = [LineString([to_xy(28.82, 40.32), to_xy(29.08, 40.32)])]  # ~22 km along the Bursa south edge
    pieces = cov.coast_pieces(coast, polys["Bursa"])
    assert 9 <= len(pieces) <= 12
    spots = [("a", to_xy(28.83, 40.321))]
    lat = np.linspace(40.30, 40.34, 9)
    lon = np.linspace(28.80, 29.10, 61)
    elev = -np.ones((9, 61)) * 5
    interp = np.zeros((9, 61))
    interp[:, 30:] = 1  # eastern half interpolated
    share = cov.measured_share_fn(Grid(lat, lon, elev, interp))
    rows = cov.coverage_rows(pieces, spots, share)
    assert rows[0]["covered"] and not rows[-1]["covered"]
    assert rows[0]["dtm_measured_share"] == 1.0 and rows[-1]["dtm_measured_share"] == 0.0
    md = cov.coverage_md({"Bursa": rows}, {"bursa": 1})
    assert "| Bursa |" in md and "merası olmayan kıyı parçaları" in md
    assert cov.measured_share_fn(None) is None
    assert to_lonlat(*to_xy(28.9, 40.4))[0] == 28.9 or abs(to_lonlat(*to_xy(28.9, 40.4))[0] - 28.9) < 1e-9
