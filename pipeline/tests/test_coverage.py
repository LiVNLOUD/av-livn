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


def test_j4_same_name_settlements_get_the_district():
    from av_pipeline.spots.geo import to_xy
    from av_pipeline.spots.naming import _suffixed_name, disambiguate_places

    raw = {"elements": [
        {"type": "relation", "id": 10, "tags": {"admin_level": "6", "name": "Karacabey"}, "members": [{"type": "way", "role": "outer", "geometry": ring(28.2, 40.3, 28.5, 40.5)}]},
        {"type": "relation", "id": 11, "tags": {"admin_level": "6", "name": "Gemlik"}, "members": [{"type": "way", "role": "outer", "geometry": ring(28.9, 40.3, 29.2, 40.5)}]},
    ]}
    districts = cov.province_polygons(raw, level="6", names=None)
    assert set(districts) == {"Karacabey", "Gemlik"}
    places = [{"name": "Kurşunlu", "xy": to_xy(28.28, 40.40)}, {"name": "Kurşunlu", "xy": to_xy(29.03, 40.36)}, {"name": "Kumla", "xy": to_xy(29.0, 40.45)}]
    f = lambda i, name, lon, lat, place, src="generated": {"geometry": {"coordinates": [lon, lat]}, "properties": {"id": i, "name": name, "place": place, "name_source": src}}  # noqa: E731
    feats = [
        f("a", "Kurşunlu – uzun doğu mendireği", 28.28, 40.398, "Kurşunlu"),
        f("b", "Kumsal (Kurşunlu doğusu) 2", 28.29, 40.397, "Kurşunlu"),
        f("c", "Kurşunlu Yat Limanı", 29.03, 40.364, "Kurşunlu", "osm"),
        f("d", "Kordon (Kurşunlu doğusu)", 29.05, 40.362, "Kurşunlu"),
        f("e", "Kumsal (Kumla)", 29.0, 40.45, "Kumla"),
    ]
    changed = disambiguate_places(feats, places, districts)
    names = {x["properties"]["id"]: x["properties"]["name"] for x in feats}
    assert names["a"] == "Kurşunlu (Karacabey) – uzun doğu mendireği"
    assert names["b"] == "Kumsal (Kurşunlu doğusu, Karacabey) 2"
    assert names["c"] == "Kurşunlu Yat Limanı" and feats[2]["properties"]["place"] == "Kurşunlu (Gemlik)"  # OSM name kept
    assert names["d"] == "Kordon (Kurşunlu doğusu, Gemlik)"
    assert names["e"] == "Kumsal (Kumla)" and feats[4]["properties"]["place"] == "Kumla"  # one Kumla: no suffix
    assert len(changed) == 3
    assert disambiguate_places(feats, places, districts) == []  # idempotent
    assert _suffixed_name("Dere ağzı (Kurşunlu)", "Kurşunlu", "Karacabey") == "Dere ağzı (Kurşunlu, Karacabey)"
