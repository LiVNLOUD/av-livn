from shapely.geometry import box

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
    assert "osm-way-10" in by and by["osm-way-10"]["kind"] == "pier" and by["osm-way-10"]["length_m"] == 120  # H2: max(seaward 105 m, tip reach 120 m)
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
    assert set(diag["dropped"]) == {"duplicate", "excluded", "not_spot", "same_object"}
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


LAND = box(-3000, 0, 3000, 1000)  # planar xy relative to ll(0, 0): land north of the coastline


def _land():
    x0, y0 = to_xy(28.90, LAT)
    return box(x0 - 3000, y0, x0 + 3000, y0 + 1000)


def test_g1_wrong_objects_are_not_spots():
    raw = {"elements": [
        RAW["elements"][0],
        node(50, (0, 40), amenity="ferry_terminal", name="Eski Turyol Armutlu Şubesi"),                # branch office
        way(51, [(100, 5), (140, 5), (140, 30), (100, 30), (100, 5)], amenity="ferry_terminal", building="yes", name="BUDO"),  # building on land
        node(52, (300, 20), amenity="ferry_terminal", name="Kara terminal"),                            # point on land
        node(53, (600, -15), amenity="ferry_terminal", name="İskele terminali"),                        # point on the water
        node(54, (900, 10), shop="fishing", name="Olta dükkanı", harbour="yes"),                       # shop on land
        way(55, [(1200, 10), (1260, 10), (1260, -40), (1200, -40), (1200, 10)], building="boathouse", harbour="yes", name="Kayıkhane"),  # touches water
    ]}
    feats, _, diag = inv.build_inventory(raw, [], _land())
    by = {f["properties"]["id"] for f in feats}
    why = {e["id"]: e["reason"] for e in diag["not_spot"]}
    assert why["osm-node-50"].startswith("işletme şubesi")
    assert why["osm-way-51"].startswith("şirket/bina")
    assert why["osm-node-52"].startswith("feribot terminali karada")
    assert why["osm-node-54"].startswith("şirket/bina")
    assert {"osm-node-53", "osm-way-55"} <= by
    assert diag["dropped"]["not_spot"] == 4
    md = inv.report_md(feats, [], diag)
    assert "Mera olmayan nesneler" in md and "BUDO" in md
    # without land polygons a ferry terminal point is not judged; a shop near the shore touches the water
    assert inv.not_a_spot({"amenity": "ferry_terminal"}, inv.Point(0, 0), None, inv.Coast([inv.LineString([(0, 0), (10, 0)])])) is None
    assert inv.not_a_spot({"shop": "x"}, inv.Point(0, 50), None, inv.Coast([inv.LineString([(0, 0), (10, 0)])])) == "şirket/bina nesnesi, suyla teması yok"


def test_g1_same_object_and_name_normalisation():
    assert inv.name_key("Güzelyalı Yat Limanı") == inv.name_key("Güzelyalı Yat Limani") == "guzelyali yat limani"
    raw = {"elements": [
        RAW["elements"][0],
        way(60, [(0, 0), (0, -120)], man_made="pier", name="Mudanya İskelesi"),
        node(61, (90, -30), amenity="ferry_terminal", name="Mudanya İskelesi"),                                 # terminal of the pier
        # marina basin with its own breakwaters (both already spots): small basin → no own record
        way(62, [(1000, 0), (1100, 0), (1100, -60), (1000, -60), (1000, 0)], leisure="marina", name="Güzelyalı Yat Limanı"),
        node(63, (1050, -30), leisure="marina", name="Güzelyalı Yat Limani"),                                   # same, spelling
        way(64, [(1000, 0), (1000, -60)], man_made="breakwater"), way(65, [(1100, 0), (1100, -60)], man_made="breakwater"),
        # big basin with breakwaters: one "liman içi" record
        way(66, [(2000, 0), (2300, 0), (2300, -200), (2000, -200), (2000, 0)], harbour="yes", name="Armutlu Devlet Limanı"),
        way(67, [(2000, 0), (2000, -200)], man_made="breakwater"),
        node(68, (2150, -100), leisure="marina", name="Armutlu Devlet Limani"),
        # lone harbour node on the water, 40 m out: basin centre, kept (≤ 150 m)
        node(69, (-1500, -40), leisure="marina", name="Tirilye Limanı"),
        node(70, (-2500, 30), leisure="marina", name="Karada marina"),                                         # on land, 30 m: kept by 30 m rule
        node(71, (-2000, -400), leisure="marina", name="Açıkta"),                                              # 400 m out: excluded
    ]}
    feats, _, diag = inv.build_inventory(raw, [], _land())
    by = {f["properties"]["id"]: f["properties"] for f in feats}
    same = {e["id"]: e["reason"] for e in diag["same_object"]}
    assert "osm-way-60" in by and same["osm-node-61"].startswith("aynı nesnenin tekrarı: osm-way-60")
    assert "osm-way-64" in by and "osm-way-65" in by
    assert same["osm-way-62"].startswith("limanın kendi yapıları zaten mera")
    assert "osm-node-63" in same  # spelling twin or own-structure duplicate, never a second record
    assert by["osm-way-66"]["name"] == "Armutlu Devlet Limanı – liman içi" and by["osm-way-66"]["kind"] == "harbour"
    assert same["osm-node-68"].startswith("aynı nesnenin tekrarı: osm-way-66")
    assert "osm-node-69" in by and "osm-node-70" in by
    assert "kıyı çizgisine 400 m (> 150 m)" in {e["id"]: e["reason"] for e in diag["excluded"]}["osm-node-71"]
    md = inv.report_md(feats, [], diag)
    assert "Aynı fiziksel nesnenin tekrarı" in md and "liman içi" in md


def test_g1_harbour_node_inside_polygon_uses_polygon_edge():
    raw = {"elements": [
        RAW["elements"][0],
        way(80, [(0, 0), (200, 0), (200, -150), (0, -150), (0, 0)], harbour="yes", name="Barınak"),
        node(81, (100, -100), leisure="marina", name="Barınak Marina"),     # 100 m from the coast, inside the polygon
    ]}
    feats, _, diag = inv.build_inventory(raw, [])
    ids = {f["properties"]["id"] for f in feats}
    assert "osm-node-81" not in {e["id"] for e in diag["excluded"]}
    assert "osm-way-80" in ids


def test_h2_structure_length_seaward_part_and_flags():
    from av_pipeline.spots.build_spots import Coast, length_flag, structure_length
    from shapely.geometry import LineString as L

    coast = Coast([L([(-1000, 0), (1000, 0)])])
    # straight pier 200 m out to sea: 185 m beyond the 15 m band, tip 200 m off the coast
    r = structure_length([(0, 0), (0, -200)], coast)
    assert r == {"length_osm_m": 200, "seaward_m": 185, "reach_m": 200}
    # closed outline 20 × 300 m: perimeter 640 m, seaward long side ≈ 285 m
    ring = [(0, 0), (20, 0), (20, -300), (0, -300), (0, 0)]
    r = structure_length(ring, coast)
    assert r["length_osm_m"] == 640 and 280 <= r["seaward_m"] <= 290 and r["reach_m"] == 300
    # a quay along the shore (inside the 15 m band): no seaward part
    r = structure_length([(-300, -5), (300, -5)], coast)
    assert r["seaward_m"] == 0 and r["length_osm_m"] == 600
    # flags by type
    assert length_flag("pier", 960, 960, ferry=True).startswith("denize uzanan 960 m > pier için beklenen üst sınır 400 m")
    assert length_flag("pier", 250, 250) is None
    assert length_flag("pier", 200, 640).startswith("OSM uzunluğu 640 m")
    assert length_flag("groyne", 3, 3).startswith("denize uzanan 3 m < beklenen alt sınır 5 m")
    assert length_flag("breakwater", 900, 930) is None


def test_h6_kordon_segments_lamps_exclusions_report():
    raw = {"elements": [
        RAW["elements"][0],
        node(90, (0, 300), place="town", name="Gemlik"),
        node(91, (2500, 300), place="village", name="Narlı"),
        way(92, [(-1500, 10), (1500, 10)], highway="pedestrian", name="Gemlik Kordonu"),        # 3 km promenade along the shore
        way(93, [(-1500, 5), (1500, 5)], man_made="embankment"),                                  # same stretch drawn twice
        way(94, [(400, 40), (900, 40), (900, -10), (400, -10), (400, 40)], natural="beach"),      # a beach on part of it
        way(95, [(-1600, 60), (-900, 60), (-900, -60), (-1600, -60), (-1600, 60)], landuse="industrial", name="Fabrika"),
        way(96, [(2200, 200), (2800, 200)], highway="footway"),                                    # 200 m inland: not along the shore
        *[node(200 + i, (-800 + 25 * i, 15), highway="street_lamp") for i in range(16)],          # lamps every 25 m on 400 m
    ]}
    feats, forb, diag = inv.build_inventory(raw, [])
    kordon = [f["properties"] for f in feats if f["properties"]["kind"] == "promenade"]
    assert kordon and all(p["type_tr"] == "kordon (taş tahkimat)" and p["name"].startswith("Kordon (") for p in kordon)
    log = diag["promenade_log"]
    assert any(e["status"] == "elendi" and "kumsal" in e["reason"] for e in log)
    assert any(e["status"] == "elendi" and e["reason"].startswith("sanayi alanı") for e in log)
    assert any(e["status"] == "tekrar" for e in log)
    lit = max(kordon, key=lambda p: p["lamp_prior"])
    assert lit["lamps_n"] >= 10 and lit["lamp_prior"] >= 0.6
    assert min(p["lamp_prior"] for p in kordon) == 0.2
    assert not any("way-96" in p["id"] for p in kordon)
    # industrial area exported for the map
    assert any(f["properties"].get("kind") == "sanayi alanı" and f["properties"]["name"] == "Fabrika" for f in forb)
    md = inv.report_md(feats, forb, diag)
    assert "Kordon (taş tahkimat) — yerleşim raporu" in md and "| Gemlik |" in md
    assert "Kordon parçası bulunamayan odak yerleşimler" in md and "Kurşunlu" in md
    assert inv.classify({"highway": "secondary", "name": "Sahil Yolu"}) == "promenade"
    assert inv.classify({"highway": "secondary", "name": "Atatürk Cd."}) is None
    # mahalle names roll up to the nearest focus town; no lamp mapped anywhere → no evidence (type prior)
    assert all(e["town"] in ("Gemlik", "Narlı") for e in log)
    raw2 = {"elements": [e for e in raw["elements"] if e.get("tags", {}).get("highway") != "street_lamp"]}
    raw2["elements"].append(node(97, (-200, 300), place="neighbourhood", name="Cumhuriyet"))
    feats2, _, diag2 = inv.build_inventory(raw2, [])
    k2 = [f["properties"] for f in feats2 if f["properties"]["kind"] == "promenade"]
    assert k2 and all(p["lamp_prior"] is None for p in k2)
    md2 = inv.report_md(feats2, [], diag2)
    assert "hiç `highway=street_lamp` yok" in md2 and "Cumhuriyet" in md2
    assert any(e["town"] == "Gemlik" and e["place"] == "Cumhuriyet" for e in diag2["promenade_log"])


def test_h2_with_land_uses_eroded_mainland():
    from types import SimpleNamespace

    from av_pipeline.spots.build_spots import Coast, structure_length
    from shapely.geometry import LineString as L, box as B

    # the coastline is traced around a 300 m pier (as OSM often does); the eroded mainland ignores the pier
    coast = Coast([L([(-1000, 0), (-5, 0), (-5, -300), (5, -300), (5, 0), (1000, 0)])])
    land = SimpleNamespace(mainland=B(-1000, 0, 1000, 500), full=B(-1000, 0, 1000, 500))
    r = structure_length([(0, 0), (0, -300)], coast, land)
    assert r["seaward_m"] == 285 and r["reach_m"] == 300
    # without land the traced coastline hides the pier: seaward 0, the reach is short too
    assert structure_length([(0, 0), (0, -300)], coast)["seaward_m"] == 0
