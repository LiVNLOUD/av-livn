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
    assert f[0].evidence["objects"] == ["way/2", "node/1"]
    assert "lighthouse 11 m" in f[0].note
    assert osm_lamps.kind({"seamark:type": "light_minor"}) == "seamark_light"


def test_sentinel2_classification_and_summary():
    assert [sentinel2.classify(r) for r in (1.6, 1.3, 1.0)] == ["acik", "belirsiz", "koyu"]
    f = sentinel2.summarise("a", [1.7] * 8 + [1.0] * 2, 7, "2026-10-31")
    assert f.substrate == ["kum"] and f.evidence["confidence"] == "orta" and f.evidence["share"] == 0.8
    k = sentinel2.summarise("a", [1.0] * 5, 9, "d")
    assert k.substrate == ["yosunlu"] and k.evidence["confidence"] == "düşük"
    assert sentinel2.summarise("a", [1.3] * 5, 9, "d") is None
    assert sentinel2.summarise("a", [1.7, 1.0, 1.3], 9, "d") is None
    assert sentinel2.summarise("a", [], 0, "d") is None
    assert round(sentinel2.metres_between((40.4, 28.9), (40.401, 28.9))) == 111


def test_mapillary_skips_without_token_and_lists_recent_images():
    assert mapillary.images(SPOTS, token="")["skipped"]
    seen = []

    def opener(req, timeout):
        seen.append(req.full_url)
        return io.BytesIO(json.dumps({"data": [{"id": "1", "captured_at": 1, "thumb_256_url": "t1"}, {"id": "2", "captured_at": 5}]}).encode())

    r = mapillary.images(SPOTS[:1], token="tok", opener=opener)
    assert [i["id"] for i in r["spots"]["a"]] == ["2", "1"]
    assert "bbox=28.89" in seen[0] and r["license"].startswith("CC BY-SA")


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
