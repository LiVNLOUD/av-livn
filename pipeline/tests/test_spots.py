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


@pytest.mark.parametrize("kind", ["pier", "breakwater"])
@pytest.mark.parametrize("normal", [0, 90, 180, 270])
def test_shore_normal_and_probe_on_sea_side(normal, kind):
    structure = pier(10, normal, 120)
    structure["tags"]["man_made"] = kind
    fc = bs.build(raw(normal, structure))
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
    fc = bs.build(raw(0, pier(10, 0, 88), pier(11, 0, 90, along_m=10)))
    assert [f["properties"]["id"] for f in fc["features"]] == ["osm-way-11"]


def test_unnamed_structure_gets_kind_and_nearest_place():
    places = [
        {"type": "node", "id": 5, "lat": LAT + 0.001, "lon": LON, "tags": {"place": "village", "name": "Kumyaka"}},
        {"type": "node", "id": 6, "lat": LAT + 0.05, "lon": LON + 0.05, "tags": {"place": "town", "name": "Uzak"}},
        {"type": "node", "id": 7, "lat": LAT, "lon": LON, "tags": {"place": "suburb"}},
        {"type": "node", "id": 8, "lat": LAT + 0.0009, "lon": LON, "tags": {"place": "quarter", "name": "İskele"}},
    ]
    bw = pier(10, 0, 100)
    bw["tags"]["man_made"] = "breakwater"
    fc = bs.build(raw(0, bw, places=places))
    assert fc["features"][0]["properties"]["name"] == "Mendirek (Kumyaka)"
    assert fc["features"][0]["properties"]["place"] == "Kumyaka"
    fc2 = bs.build(raw(0, pier(10, 0, 100)))
    assert fc2["features"][0]["properties"]["name"] == "İskele"


def test_pier_normal_follows_pier_not_jagged_harbour_coastline():
    # Coastline with a sharp harbour notch at the root; a north-pointing pier must still give ~0°.
    notch = [(LAT, LON + 0.05), (LAT, LON + 0.0005), (LAT - 0.0004, LON + 0.0004), (LAT, LON - 0.0005), (LAT, LON - 0.05)]
    data = {"elements": [way(1, {"natural": "coastline"}, notch), pier(10, 0, 150)]}
    p = bs.build(data)["features"][0]["properties"]
    assert p["shore_normal_deg"] == pytest.approx(0, abs=1)


def test_breakwater_normal_is_smoothed_over_the_coast():
    notch = [(LAT, LON + 0.05), (LAT, LON + 0.0003), (LAT - 0.0002, LON), (LAT, LON - 0.0003), (LAT, LON - 0.05)]
    bw = way(10, {"man_made": "breakwater"}, [(LAT + 20 * DLAT, LON - 60 * DLON), (LAT + 20 * DLAT, LON + 60 * DLON)])
    p = bs.build({"elements": [way(1, {"natural": "coastline"}, notch), bw]})["features"][0]["properties"]
    assert min(p["shore_normal_deg"], 360 - p["shore_normal_deg"]) < 10


def test_smoothed_normal_of_westward_coast_points_north():
    from shapely.geometry import LineString, Point
    coast = bs.Coast([LineString([(0, 0), (-100, 0)])])
    line = coast.lines[0]
    assert coast.smoothed_normal(line, Point(-50, 0)) == pytest.approx(0)


def test_probe_falls_back_when_sea_is_narrow():
    # Opposite shore 600 m away: 750/1000/1500 m land on it, the 500 m fallback is used.
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
    assert 'natural"="cape' in q and "40.25,28.5,40.65,29.3" in q


def test_tip_uses_eroded_mainland_when_coastline_wraps_the_pier(tmp_path):
    # Harbour pier mapped inside the coastline: the coastline runs out along the pier and touches its tip,
    # so "farthest from the coastline" picks the root (the İDO Güzelyalı case). The eroded land fixes it.
    w = 3 * DLON
    root, tip = (LAT + 5 * DLAT, LON), (LAT + 200 * DLAT, LON)
    coast = [(LAT, LON + 0.05), (LAT, LON + w), (tip[0], LON + w), tip, (tip[0], LON - w), (LAT, LON - w), (LAT, LON - 0.05)]
    structure = way(10, {"man_made": "pier", "name": "Feribot İskelesi"}, [root, (LAT + 100 * DLAT, LON), tip])
    data = {"elements": [way(1, {"natural": "coastline"}, coast), structure]}
    land = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[
        (LON - 0.05, LAT - 0.05), (LON + 0.05, LAT - 0.05), (LON + 0.05, LAT), (LON + w, LAT), (LON + w, tip[0]),
        (LON - w, tip[0]), (LON - w, LAT), (LON - 0.05, LAT), (LON - 0.05, LAT - 0.05)]]}}]}
    old = bs.build(data)["features"][0]
    assert old["geometry"]["coordinates"][1] == pytest.approx(root[0], abs=2 * DLAT)
    (f,) = bs.build(data, land=bs.land_xy(land))["features"]
    lon, lat = f["geometry"]["coordinates"]
    assert lat == pytest.approx(tip[0], abs=2 * DLAT)
    p = f["properties"]
    assert p["tip_source"] == "land"
    assert p["alt_lat"] == pytest.approx(root[0], abs=2 * DLAT)
    assert len(p["fetch_km"]) == 16
    assert p["fetch_km"][0] > 5 and p["fetch_km"][8] == 0  # open sea north, land south
    src, dst, lp = tmp_path / "raw.json", tmp_path / "out.geojson", tmp_path / "land.geojson"
    src.write_text(json.dumps(data))
    lp.write_text(json.dumps(land))
    assert bs.main(["x", str(src), str(dst), "--land", str(lp)]) == 0
    assert json.loads(dst.read_text())["features"][0]["properties"]["alt_lat"] is not None


def test_tip_without_land_keeps_coastline_method_and_no_alt():
    (f,) = bs.build(raw(0, pier(10, 0, 120)))["features"]
    assert f["properties"]["tip_source"] == "coastline"
    assert f["properties"]["alt_lat"] is None
    assert f["properties"]["fetch_km"] is None


def test_fetch_rose_skips_structure_land_at_the_tip_and_caps():
    from shapely.geometry import box

    from av_pipeline.spots.fetch_rose import MAX_M, fetch_m, rose_km

    land = box(-1000, -50_000, 1000, 0).union(box(-200, 0, 200, 300)).union(box(-5000, 4000, 5000, 6000))  # coast, mole, island
    assert fetch_m(land, 0, 290, 0) == pytest.approx(3710, abs=1)  # tip on the mole: water beyond it up to the island at y = 4000
    assert fetch_m(land, 0, 290, 180) == 0.0
    r = rose_km(land, 1500, 10)
    assert r[4] == pytest.approx(MAX_M / 1000, abs=0.01)  # due east: open to the cap


def test_eusm_annotate_inside_nearest_and_unknown():
    from av_pipeline.habitat import eusm

    poly = {"type": "Polygon", "coordinates": [[[28.9, 40.4], [28.91, 40.4], [28.91, 40.41], [28.9, 40.41], [28.9, 40.4]]]}

    def get(url):
        if "GetFeature&" in url or "GetFeature" in url and "WFS" in url:
            return {"features": [{"properties": {"substrate": "Sandy mud", "biozone": "Infralittoral"}, "geometry": poly}]}
        return {"features": [{"properties": {"GRAY_INDEX": 2}}]}

    feats = [{"geometry": {"coordinates": [28.905, 40.405]}, "properties": {}}, {"geometry": {"coordinates": [28.912, 40.405]}, "properties": {}}]
    eusm.annotate(feats, get)
    assert feats[0]["properties"] == {"substrate": "Sandy mud", "substrate_biozone": "Infralittoral", "substrate_dist_m": 0, "substrate_conf": 2}
    assert 150 < feats[1]["properties"]["substrate_dist_m"] < 200
    feats2 = [{"geometry": {"coordinates": [28.905, 40.405]}, "properties": {}}]
    eusm.annotate(feats2, lambda u: {"features": []})
    assert feats2[0]["properties"]["substrate"] is None


def test_shared_junction_node_is_not_the_tip_and_neighbours_are_kept():
    # Ferry pier joined to a short mole at its far corner: the shared node is the farthest from land, but the
    # pier's own tip is its berth end; both structures stay as separate spots.
    land = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[
        (LON - 0.05, LAT - 0.05), (LON + 0.05, LAT - 0.05), (LON + 0.05, LAT), (LON - 0.05, LAT), (LON - 0.05, LAT - 0.05)]]}}]}
    junction = (LAT + 160 * DLAT, LON + 60 * DLON)
    pier = way(10, {"man_made": "pier", "name": "Feribot"}, [(LAT, LON), (LAT + 150 * DLAT, LON), junction])
    mole = way(11, {"man_made": "breakwater"}, [junction, (LAT + 100 * DLAT, LON + 120 * DLON)])
    fc = bs.build({"elements": [way(1, {"natural": "coastline"}, COASTS[0]), pier, mole]}, land=bs.land_xy(land))
    by = {f["properties"]["id"]: f for f in fc["features"]}
    assert set(by) == {"osm-way-10", "osm-way-11"}
    assert by["osm-way-10"]["geometry"]["coordinates"][1] == pytest.approx(LAT + 150 * DLAT, abs=2 * DLAT)
    assert by["osm-way-11"]["geometry"]["coordinates"][1] == pytest.approx(junction[0], abs=2 * DLAT)
