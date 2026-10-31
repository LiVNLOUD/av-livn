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
    node(21, (-200, 900), place="village", name="Kurşunlu"),                 # known place with no object nearby…
    node(22, (2800, -10), natural="cape", name="Ayı Burnu"),                # named cape → rocky segments
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
    assert beach[0]["name"].startswith("Kumsal (Kurşunlu") or beach[0]["name"].startswith("Kumsal (Narlı")
    assert any(p["name"].startswith("Ayı Burnu") and p["kind"] == "rocky" for p in by.values())
    assert any(p["type"] == "rocky" and p["access"] == "belirsiz" for p in by.values())
    mouth = [p for p in by.values() if p["type"] == "river_mouth"]
    assert mouth and mouth[0]["name"] == "Kocadere ağzı"
    assert all(p["status"] == "candidate" and p["auto_added"] for p in by.values())
    assert not any("node-17" in i for i in by) and forb[0]["properties"]["name"] == "Gemport"
    assert diag["Karacaali"]["proposals"] and diag["Eşkel"] == {"place": None}
    assert "Eşkel: OSM'de yerleşim noktası yok" in diag["known_missing"]
    assert any(o["ref"] == "node/12" for o in diag["Karacaali"]["osm_within_1km"])
    assert set(diag["dropped"]) == {"duplicate", "excluded"}
    md = inv.report_md(feats, forb, diag)
    assert "Eklenen:" in md and "Elenen yerler" in md and "Gemport" in md and "Eşkel:** OSM'de" in md


def test_known_place_without_objects_is_not_added():
    raw = {"elements": [RAW["elements"][0], node(30, (0, 600), place="village", name="Narlı")]}
    feats, _, diag = inv.build_inventory(raw, [])
    assert feats == []
    assert any(m.startswith("Narlı: yakında OSM'de fiziksel kıyı nesnesi yok") for m in diag["known_missing"])


def test_f1_checks_exclude_with_reasons_and_link_near_same_type():
    raw = {"elements": [
        RAW["elements"][0],
        node(40, (0, 400), place="village", name="Narlı"),
        way(41, [(0, -400), (0, -600)], man_made="pier"),                                   # 400 m off the coast: not physical shore
        way(42, [(500, 0), (500, -80)], man_made="pier", access="private"),
        way(43, [(-900, 50), (-500, 50), (-500, -200), (-900, -200), (-900, 50)], landuse="industrial", name="Fabrika"),
        way(44, [(-700, 0), (-700, -60)], man_made="pier"),                                 # inside the industrial area
        way(45, [(1500, 0), (1500, -90)], man_made="pier"), way(46, [(1600, 0), (1600, -70)], man_made="groyne"),
        way(47, [(1650, 0), (1650, -70)], man_made="groyne"),                               # 50 m from 46: kept, linked
        node(48, (1800, -40), military="danger_area"),
    ]}
    feats, _, diag = inv.build_inventory(raw, [])
    by = {f["properties"]["id"]: f["properties"] for f in feats}
    reasons = {e["id"]: e["reason"] for e in diag["excluded"]}
    assert "kıyı çizgisine 400 m" in reasons["osm-way-41"]
    assert reasons["osm-way-42"] == "OSM access=private"
    assert reasons["osm-way-44"].startswith("sanayi alanı")
    assert {"osm-way-45", "osm-way-46", "osm-way-47"} <= set(by)
    assert by["osm-way-46"]["near"] == ["osm-way-47"] and by["osm-way-45"]["near"] == []
    assert diag["dropped"]["excluded"] == 3
    assert inv.exclusion({"military": "yes"}) == "askeri alan" and inv.exclusion({"harbour": "industrial"}) == "sanayi alanı" and inv.exclusion({}) is None


def test_helpers():
    assert inv.classify({"seamark:type": "harbour"}) == "harbour"
    assert inv.classify({"amenity": "ferry_terminal"}) == "harbour"
    assert inv.classify({"leisure": "fishing"}) == "fishing"
    assert inv.classify({"highway": "x"}) is None
    assert inv.is_forbidden({"operator": "Borusan Lojistik", "man_made": "pier"}) and inv.is_forbidden({"industrial": "port"})
    assert inv.is_forbidden({"name": "Gemport", "landuse": "industrial"})
    assert not inv.is_forbidden({"name": "Gemport Gemlik Anadolu Lisesi", "amenity": "school"})
    assert not inv.is_forbidden({"name": "Roda Anadolu İmam Hatip Lisesi", "building": "school"})
    assert inv.access_estimate("harbour", {"amenity": "ferry_terminal"}, 100)[0] == "kisitli_feribot"
    assert inv.access_estimate("harbour", {"leisure": "marina", "name": "Setur Marina"}, 100)[0] == "belirsiz"
    assert inv.access_estimate("harbour", {"leisure": "marina", "name": "Karacaali İskelesi"}, 100)[0] == "acik"
    assert inv.access_estimate("harbour", {"access": "private"}, 100)[0] == "belirsiz"
    assert inv.access_estimate("beach", {}, 3000)[0] == "belirsiz"
    assert inv.norm("Eşkel") == "eskel"
    rel = {"type": "relation", "id": 5, "members": [{"geometry": [ll(0, 0), ll(100, 0), ll(100, 100)]}]}
    assert inv.geom(rel).geom_type == "Polygon"
    assert inv.geom({"type": "relation", "id": 6, "members": []}) is None
    assert "nwr[\"harbour\"]" in inv.build_query()
