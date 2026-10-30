import json

import pytest

from av_pipeline.spots import build_spots as bs
from av_pipeline.spots.fetch_osm import build_query
from av_pipeline.spots.geo import M_PER_DEG_LAT, M_PER_DEG_LON

LAT, LON = 40.40, 28.90
DLAT = 1 / M_PER_DEG_LAT  # degrees per metre
DLON = 1 / M_PER_DEG_LON


def way(id_, tags, pts):
    return {"type": "way", "id": id_, "tags": tags, "geometry": [{"lat": la, "lon": lo} for la, lo in pts]}


# Coastlines with land on the LEFT (OSM convention). Key = expected seaward normal.
COASTS = {
    0: [(LAT, LON + 0.05), (LAT, LON - 0.05)],     # runs west: land south, sea north
    90: [(LAT - 0.05, LON), (LAT + 0.05, LON)],    # runs north: land west, sea east
    180: [(LAT, LON - 0.05), (LAT, LON + 0.05)],   # runs east: land north, sea south
    270: [(LAT + 0.05, LON), (LAT - 0.05, LON)],   # runs south: land east, sea west
}
SEA_DIR = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}  # (dlat sign, dlon sign)


def pier(id_, normal, length_m, along_m=0.0, tags=None):
    sy, sx = SEA_DIR[normal]
    ay, ax = (0, 1) if sx == 0 else (1, 0)  # along-shore offset axis
    root = (LAT + ay * along_m * DLAT, LON + ax * along_m * DLON)
    tip = (root[0] + sy * length_m * DLAT, root[1] + sx * length_m * DLON)
    return way(id_, {"man_made": "pier", **(tags or {})}, [root, tip])


def raw(normal, *structures, places=()):
    return {"elements": [way(1, {"natural": "coastline"}, COASTS[normal]), *structures, *places]}


@pytest.mark.parametrize("normal", [0, 90, 180, 270])
def test_shore_normal_and_probe_on_sea_side(normal):
    fc = bs.build(raw(normal, pier(10, normal, 120)))
    (f,) = fc["features"]
    p = f["properties"]
    assert p["shore_normal_deg"] == pytest.approx(normal % 360, abs=0.5) or p["shore_normal_deg"] == pytest.approx(360, abs=0.5)
    assert p["status"] == "candidate"
    assert p["has_light"] is None
    sy, sx = SEA_DIR[normal]
    tip_lon, tip_lat = f["geometry"]["coordinates"]
    # tip is ~120 m seaward of the coastline; probe a further 750 m
    assert (tip_lat - LAT) * sy + (tip_lon - LON) * sx > 0
    dist = ((p["probe_lat"] - tip_lat) / DLAT) ** 2 + ((p["probe_lon"] - tip_lon) / DLON) ** 2
    assert dist ** 0.5 == pytest.approx(750, rel=0.01)


def test_short_structures_are_dropped_and_tags_name_used():
    fc = bs.build(raw(0, pier(10, 0, 10), pier(11, 0, 80, along_m=500, tags={"name": "Mudanya İskelesi"})))
    assert [f["properties"]["name"] for f in fc["features"]] == ["Mudanya İskelesi"]
    assert fc["features"][0]["properties"]["id"] == "osm-way-11"


def test_nearby_duplicates_keep_the_longer_structure():
    fc = bs.build(raw(0, pier(10, 0, 60), pier(11, 0, 90, along_m=30)))
    assert [f["properties"]["id"] for f in fc["features"]] == ["osm-way-11"]


def test_unnamed_structure_gets_kind_and_nearest_place():
    places = [
        {"type": "node", "id": 5, "lat": LAT + 0.001, "lon": LON, "tags": {"place": "village", "name": "Kumyaka"}},
        {"type": "node", "id": 6, "lat": LAT + 0.05, "lon": LON + 0.05, "tags": {"place": "town", "name": "Uzak"}},
        {"type": "node", "id": 7, "lat": LAT, "lon": LON, "tags": {"place": "suburb"}},
    ]
    bw = pier(10, 0, 100)
    bw["tags"]["man_made"] = "breakwater"
    fc = bs.build(raw(0, bw, places=places))
    assert fc["features"][0]["properties"]["name"] == "Mendirek · Kumyaka"
    assert fc["features"][0]["properties"]["place"] == "Kumyaka"
    fc2 = bs.build(raw(0, pier(10, 0, 100)))
    assert fc2["features"][0]["properties"]["name"] == "İskele"


def test_probe_falls_back_when_sea_is_narrow():
    # A second coastline 900 m offshore (land north of it) makes 750 m sea, 1000 m land: 750 must be chosen,
    # and with the opposite shore at 600 m the 500 m fallback is used.
    far = way(2, {"natural": "coastline"}, [(LAT + 600 * DLAT, LON - 0.05), (LAT + 600 * DLAT, LON + 0.05)])
    data = raw(0, pier(10, 0, 20))
    data["elements"].append(far)
    p = bs.build(data)["features"][0]["properties"]
    assert (p["probe_lat"] - LAT) / DLAT == pytest.approx(520, abs=5)


def test_probe_none_when_no_sea_point_found():
    far = way(2, {"natural": "coastline"}, [(LAT + 300 * DLAT, LON - 0.05), (LAT + 300 * DLAT, LON + 0.05)])
    data = raw(0, pier(10, 0, 20))
    data["elements"].append(far)
    p = bs.build(data)["features"][0]["properties"]
    assert p["probe_lat"] is None and p["probe_lon"] is None


def test_out_of_bbox_and_missing_coastline():
    outside = way(10, {"man_made": "pier"}, [(41.0, 28.9), (41.002, 28.9)])
    assert bs.build(raw(0, outside))["features"] == []
    with pytest.raises(ValueError):
        bs.build({"elements": [pier(10, 0, 100)]})


def test_geojson_shape_and_main(tmp_path):
    src = tmp_path / "raw.json"
    dst = tmp_path / "spots.geojson"
    src.write_text(json.dumps(raw(90, pier(10, 90, 100))))
    assert bs.main(["x", str(src), str(dst)]) == 0
    fc = json.loads(dst.read_text())
    assert fc["type"] == "FeatureCollection"
    assert "OpenStreetMap" in fc["attribution"]
    f = fc["features"][0]
    assert f["geometry"]["type"] == "Point"
    assert set(f["properties"]) >= {"id", "name", "kind", "shore_normal_deg", "probe_lat", "probe_lon", "status", "has_light"}


def test_overpass_query_covers_bbox_and_kinds():
    q = build_query()
    assert "pier|breakwater|groyne" in q
    assert 'natural"="coastline' in q
    assert "40.3,28.7,40.56,29.2" in q
