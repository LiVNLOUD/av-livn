import json

from av_pipeline.spots import labels as lb


def test_labels_capes_and_harbours_deduplicated(tmp_path):
    raw = {"elements": [
        {"type": "node", "id": 1, "lat": 40.4, "lon": 28.9, "tags": {"natural": "cape", "name": "Kumburnu"}},
        {"type": "node", "id": 2, "lat": 40.41, "lon": 28.91, "tags": {"natural": "cape", "name": "Kumburnu"}},
        {"type": "way", "id": 3, "geometry": [{"lat": 40.0, "lon": 28.0}, {"lat": 40.2, "lon": 28.2}], "tags": {"harbour": "yes", "name": "Mudanya Limanı"}},
        {"type": "relation", "id": 4, "center": {"lat": 40.3, "lon": 28.3}, "tags": {"leisure": "marina", "name": "Marina", "name:tr": "Yat Limanı"}},
        {"type": "relation", "id": 5, "tags": {"leisure": "marina", "name": "Geometrisiz"}},
        {"type": "node", "id": 6, "lat": 40.4, "lon": 28.9, "tags": {"place": "village", "name": "Köy"}},
    ]}
    fc = lb.labels(raw)
    assert [(f["properties"]["kind"], f["properties"]["name"]) for f in fc["features"]] == [("cape", "Kumburnu"), ("harbour", "Mudanya Limanı"), ("harbour", "Yat Limanı")]
    assert fc["features"][1]["geometry"]["coordinates"] == [28.1, 40.1]
    src, dst = tmp_path / "raw.json", tmp_path / "labels.geojson"
    src.write_text(json.dumps(raw))
    assert lb.main(["x", str(src), str(dst)]) == 0
    assert len(json.loads(dst.read_text())["features"]) == 3
