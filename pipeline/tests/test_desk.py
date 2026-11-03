import io
import json

from av_pipeline.desk import findings as fz
from av_pipeline.desk import mapillary, osm_lamps, sentinel2
from av_pipeline.desk.run import manual

SPOTS = [{"id": "a", "lat": 40.4, "lon": 28.9}, {"id": "b", "lat": 40.5, "lon": 29.0}]


def test_osm_lamps_within_radius_only_and_no_negative_findings():
    q = osm_lamps.query(SPOTS)
    assert 'highway"="street_lamp"](around:40,40.4,28.9)' in q and "seamark:light" in q
    els = [
        {"type": "node", "id": 1, "lat": 40.40020, "lon": 28.9, "tags": {"highway": "street_lamp"}},
        {"type": "way", "id": 2, "center": {"lat": 40.40010, "lon": 28.9}, "tags": {"man_made": "lighthouse"}},
        {"type": "node", "id": 3, "lat": 40.4010, "lon": 28.9, "tags": {"seamark:light:character": "Fl"}},
        {"type": "relation", "id": 4, "tags": {}},
    ]
    f = osm_lamps.findings(SPOTS, els, "2026-10-31")
    assert len(f) == 1 and f[0].spot_id == "a" and f[0].light_prob == 0.95
    nav = osm_lamps.findings(SPOTS, [els[2] | {"lat": 40.40020}], "d")
    assert nav[0].light_prob == 0.6
    assert f[0].evidence["objects"] == ["way/2", "node/1"]
    assert "lighthouse 11 m" in f[0].note
    assert osm_lamps.kind({"seamark:type": "light_minor"}) == "seamark_light"


def test_sentinel2_classification_and_summary():
    assert [sentinel2.classify(r) for r in (1.6, 1.3, 1.0, 0.8)] == ["acik", "belirsiz", "belirsiz", "koyu"]
    f = sentinel2.summarise("a", [1.7] * 8 + [1.0] * 2, 7, "2026-10-31")
    # I4: brightness never becomes a bottom class
    assert f.substrate is None and f.evidence["confidence"] == "orta" and f.evidence["share"] == 0.8
    assert "kum olabilir" in f.note and "yansıma" in f.note and "belirsiz bırakıldı" in f.note
    k = sentinel2.summarise("a", [0.8] * 5, 9, "d")
    assert sentinel2.summarise("a", [1.0] * 5, 9, "d") is None
    assert k.substrate is None and k.evidence["confidence"] == "düşük" and "gölgesi" in k.note
    assert sentinel2.summarise("a", [1.3] * 5, 9, "d") is None
    assert sentinel2.summarise("a", [1.7, 0.8, 1.3], 9, "d") is None
    assert sentinel2.summarise("a", [], 0, "d") is None
    assert round(sentinel2.metres_between((40.4, 28.9), (40.401, 28.9))) == 111


def test_mapillary_i3_search_paging_facing_and_selection():
    assert mapillary.images(SPOTS, token="")["skipped"]
    seen = []
    spot = SPOTS[0]
    # image 30 m south of the spot looking north (facing), 30 m south looking south (away), 150 m away facing, a panorama
    south = lambda m: [spot["lon"], spot["lat"] - m / 111_320]  # noqa: E731
    pages = [
        {"data": [{"id": "face", "captured_at": 1_700_000_000_000, "compass_angle": 2, "geometry": {"coordinates": south(30)}},
                  {"id": "away", "captured_at": 1_800_000_000_000, "compass_angle": 180, "geometry": {"coordinates": south(30)}}],
         "paging": {"next": "https://graph.mapillary.com/images?after=x"}},
        {"data": [{"id": "far", "captured_at": 1, "computed_compass_angle": 0, "geometry": {"coordinates": south(150)}},
                  {"id": "pano", "captured_at": 2, "is_pano": True, "geometry": {"coordinates": south(100)}},
                  {"id": "out", "captured_at": 3, "compass_angle": 0, "geometry": {"coordinates": south(400)}},
                  {"id": "nogeo"}]},
    ]

    def opener(req, timeout):
        seen.append(req.full_url)
        return io.BytesIO(json.dumps(pages[len(seen) - 1]).encode())

    r = mapillary.images([{**spot, "name": "A"}], token="tok", opener=opener)
    a = r["spots"]["a"]
    assert len(seen) == 2 and "bbox=28.8976" in seen[0] and "limit=500" in seen[0]
    assert a["found"] == 4 and a["facing"] == 3  # 'out' beyond 200 m, 'nogeo' dropped
    ids = [x["image_id"] for x in a["selected"]]
    assert ids[0] == "face" and ids.index("away") == len(ids) - 1
    face = a["selected"][0]
    assert face["distance_m"] == 30 and face["bearing_to_spot_deg"] in (0, 360) and face["captured_at"] == "2023-11-14"
    assert r["license"].startswith("CC BY-SA") and r["search_m"] == 200
    assert mapillary.angle_diff(350, 10) == 20 and mapillary.select([], 6) == []


class FakeD1:
    def __init__(self):
        self.calls = []

    def query(self, sql, params=None):
        self.calls.append((sql.split()[0], params))
        return []


def test_write_upserts_without_touching_review_status_and_replaces_depths(tmp_path):
    f = fz.Finding(spot_id="a", source="ced", observed_at="2020", evidence={"source": "ÇED", "page": 12}, substrate=["kum"], depths=[(50, 6.5)])
    d1 = FakeD1()
    assert fz.write(d1, [f], "now") == 1
    assert [c[0] for c in d1.calls] == ["INSERT", "DELETE", "INSERT"]
    assert "status = excluded.status" not in fz.UPSERT
    assert f.id == "desk-ced-a"
    p = tmp_path / "manual.json"
    p.write_text(json.dumps({"findings": [{"spot_id": "a", "source": "ced", "date": "2020", "evidence": {"source": "x"}, "depths": [[30, 5]]},
                                          {"spot_id": "zz", "source": "ced", "date": "2020", "evidence": {}}]}))
    m = manual(SPOTS, p)
    assert len(m) == 1 and m[0].depths == [(30, 5)]
    assert manual(SPOTS, tmp_path / "none.json") == []


def test_prune_deletes_only_unreviewed_stale_rows_of_that_source():
    class D:
        def __init__(self):
            self.calls = []

        def query(self, sql, params=None):
            self.calls.append((sql, params))
            return [{"id": "desk-sentinel2-b"}] if sql.startswith("SELECT") else []

    d = D()
    keep = [fz.Finding(spot_id="a", source="sentinel2", observed_at="d", evidence={})]
    assert fz.prune(d, "sentinel2", keep) == 1
    sel, params = d.calls[0]
    assert "status = 'onaysiz'" in sel and "NOT IN (?2)" in sel and params == ["desk-sentinel2-%", "desk-sentinel2-a"]
    assert [c[1] for c in d.calls[1:]] == [["desk-sentinel2-b"], ["desk-sentinel2-b"]]
    d2 = D()
    fz.prune(d2, "ced", [])
    assert "NOT IN" not in d2.calls[0][0]


def test_i3_mapillary_review_findings(tmp_path):
    from av_pipeline.desk.run import mapillary_review

    rev = {"reviewed_at": "2026-11-03", "license": "CC BY-SA 4.0", "spots": [
        {"spot_id": "a", "direk_gorunuyor": "evet", "suya_yonelik": "bilinmiyor", "kanit_goruntuleri": [{"image_id": "1"}]},
        {"spot_id": "b", "direk_gorunuyor": "evet", "suya_yonelik": "evet", "kanit_goruntuleri": []},
        {"spot_id": "c", "direk_gorunuyor": "bilinmiyor", "suya_yonelik": "bilinmiyor", "kanit_goruntuleri": []}]}
    p = tmp_path / "m.json"
    p.write_text(json.dumps(rev))
    f = {x.spot_id: x for x in mapillary_review([{"id": "a"}, {"id": "b"}, {"id": "c"}], p)}
    assert f["a"].light_prob == 0.6 and f["b"].light_prob == 0.7 and "c" not in f
    assert f["a"].id == "desk-mapillary_review-a" and f["a"].evidence["kind"] == "dolaylı gösterge"
    assert mapillary_review([{"id": "a"}], tmp_path / "none.json") == []
