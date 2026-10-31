from av_pipeline.spots import inventory as inv
from av_pipeline.spots.geo import to_lonlat, to_xy

# Coast along latitude 40.40 from west to east (land north: OSM coastline has land on the left).
LAT = 40.40


def ll(x_m, y_m):
    x0, y0 = to_xy(28.90, LAT)
    lon, lat = to_lonlat(x0 + x_m, y0 + y_m)
    return {"lat": lat, "lon": lon}


def way(i, pts, **tags):
    return {"type": "way", "id": i, "tags": tags, "geometry": [ll(*p) for p in pts]}


def node(i, p, **tags):
    g = ll(*p)
    return {"type": "node", "id": i, "tags": tags, "lat": g["lat"], "lon": g["lon"]}


RAW = {"elements": [
    way(1, [(-3000, 0), (3000, 0)], natural="coastline"),
    node(2, (0, 500), place="village", name="Narlı"),
    node(3, (2500, 400), place="village", name="Karacaali"),
    way(10, [(0, 0), (0, -120)], man_made="pier"),                          # new structure
    way(11, [(300, 0), (300, -60)], man_made="pier"),                       # an existing spot
    node(12, (2500, -20), harbour="yes", name="Karacaali İskelesi"),        # named harbour node only
    way(13, [(-2500, 30), (-1500, 30), (-1500, -10), (-2500, -10), (-2500, 30)], natural="beach"),
    way(14, [(1000, 10), (1100, 10), (1100, -10), (1000, -10), (1000, 10)], natural="bare_rock"),
    way(15, [(-800, 900), (-700, 20)], waterway="stream", name="Kocadere"),
    way(16, [(1800, 0), (2200, 0), (2200, -300), (1800, -300), (1800, 0)], landuse="port", name="Gemport"),
    node(17, (2000, -100), man_made="pier"),                               # inside the port: never a candidate
    node(18, (0, -110), leisure="fishing"),                                  # on the new pier: no extra point
    node(19, (-1000, -5), leisure="fishing"),                                # elsewhere: rocky shore
    way(20, [(5, 0), (5, -2)], man_made="groyne"),                          # too short
]}
EXISTING = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [ll(300, -60)["lon"], ll(300, -60)["lat"]]}, "properties": {"id": "osm-way-11", "name": "İskele (Narlı)"}}]


def test_inventory_types_dedupe_forbidden_and_names():
    feats, forb, diag = inv.build_inventory(RAW, EXISTING)
    by = {f["properties"]["id"]: f["properties"] for f in feats}
    assert "osm-way-10" in by and by["osm-way-10"]["kind"] == "pier" and by["osm-way-10"]["length_m"] == 120
    assert "osm-way-11" not in by and "osm-way-20" not in by
    assert by["osm-node-12"]["name"] == "Karacaali İskelesi" and by["osm-node-12"]["kind"] == "harbour"
    assert by["osm-node-12"]["access"] == "acik"
    beach = [p for p in by.values() if p["type"] == "beach"]
    assert len(beach) == 3 and all(300 <= p["length_m"] <= 500 for p in beach)
    assert beach[0]["name"].startswith("Kumsal (Narlı")
    assert any(p["type"] == "rocky" and p["access"] == "belirsiz" for p in by.values())
    mouth = [p for p in by.values() if p["type"] == "river_mouth"]
    assert mouth and mouth[0]["name"] == "Kocadere ağzı"
    assert all(p["status"] == "proposed" for p in by.values())
    assert not any("node-17" in i for i in by) and forb[0]["properties"]["name"] == "Gemport"
    assert diag["Karacaali"]["proposals"] and diag["Kurşunlu"] == {"place": None}
    assert any(o["ref"] == "node/12" for o in diag["Karacaali"]["osm_within_1km"])
    assert diag["dropped"]["near_existing"] >= 0
    md = inv.report_md(feats, forb, diag)
    assert "Toplam" in md and "Gemport" in md and "Kurşunlu:** OSM'de" in md


def test_helpers():
    assert inv.classify({"seamark:type": "harbour"}) == "harbour"
    assert inv.classify({"amenity": "ferry_terminal"}) == "harbour"
    assert inv.classify({"leisure": "fishing"}) == "fishing"
    assert inv.classify({"highway": "x"}) is None
    assert inv.is_forbidden({"operator": "Borusan Lojistik"}) and inv.is_forbidden({"industrial": "port"})
    assert inv.access_estimate("harbour", {"amenity": "ferry_terminal"}, 100)[0] == "kisitli_feribot"
    assert inv.access_estimate("harbour", {"leisure": "marina"}, 100)[0] == "belirsiz"
    assert inv.access_estimate("beach", {}, 3000)[0] == "belirsiz"
    assert inv.norm("Eşkel") == "eskel"
    rel = {"type": "relation", "id": 5, "members": [{"geometry": [ll(0, 0), ll(100, 0), ll(100, 100)]}]}
    assert inv.geom(rel).geom_type == "Polygon"
    assert inv.geom({"type": "relation", "id": 6, "members": []}) is None
    assert "nwr[\"harbour\"]" in inv.build_query()
