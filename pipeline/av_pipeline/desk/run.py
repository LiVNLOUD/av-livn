"""Desk data job (desk.yml): OSM lamps, Mapillary links, Sentinel-2 bottom brightness, curated literature/ÇED
values from data/desk/manual.json → D1 field table (masabasi, onaysiz) + docs/audit/desk_*.json + map layers.

  python -m av_pipeline.desk.run [--skip-s2]
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

from av_pipeline.desk import findings as fz
from av_pipeline.desk import mapillary, osm_lamps
from av_pipeline.desk.findings import Finding
from av_pipeline.ocean.marmara import D1

ROOT = Path(__file__).resolve().parents[3]


def manual(spots: list[dict], path: Path = ROOT / "data/desk/manual.json") -> list[Finding]:
    """Hand-curated desk values (literature, ÇED, OpenSeaMap) with their citation: only numbers, never copied text."""
    if not path.exists():
        return []
    ids = {s["id"] for s in spots}
    out = []
    for m in json.loads(path.read_text())["findings"]:
        if m["spot_id"] not in ids:
            continue
        out.append(Finding(spot_id=m["spot_id"], source=m["source"], observed_at=m["date"], evidence=m["evidence"], light_prob=m.get("light_prob"),
                           substrate=m.get("substrate"), note=m.get("note"), depths=[tuple(d) for d in m.get("depths", [])]))
    return out


def main(argv: list[str]) -> int:
    d1 = D1()
    today = dt.date.today()
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    spots = d1.query("SELECT id, name, lat, lon FROM spots WHERE status != 'rejected' ORDER BY id")
    all_f: list[Finding] = []
    report: dict = {"date": today.isoformat(), "spots": len(spots)}
    try:
        lamps = osm_lamps.run(spots, today.isoformat())
        report["osm_lamp"] = {f.spot_id: f.note for f in lamps}
        all_f += lamps
    except Exception as e:  # noqa: BLE001 - one source failing must not stop the others
        report["osm_lamp"] = {"error": str(e)[:300]}
    try:
        mp = mapillary.images(spots)
    except Exception as e:  # noqa: BLE001
        mp = {"skipped": f"Mapillary hatası: {str(e)[:200]}"}
    (ROOT / "apps/web/public/tiles/mapillary.json").write_text(json.dumps(mp, ensure_ascii=False) + "\n")
    report["mapillary"] = mp.get("skipped") or {k: len(v) for k, v in mp["spots"].items()}
    if "--skip-s2" not in argv:
        try:
            from av_pipeline.desk import sentinel2

            s2, geo = sentinel2.run(spots, today)
            (ROOT / "apps/web/public/tiles/s2_substrate.geojson").write_text(json.dumps(geo) + "\n")
            report["sentinel2"] = {f.spot_id: f.note for f in s2} | {"_scenes": geo["scenes"], "_pixels": len(geo["features"])}
            all_f += s2
        except Exception as e:  # noqa: BLE001
            report["sentinel2"] = {"error": str(e)[:300]}
    man = manual(spots)
    report["manual"] = {f.id: f.note for f in man}
    all_f += man
    report["written"] = fz.write(d1, all_f, now)
    (ROOT / "docs/audit/desk_findings.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=1)[:4000])
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv))
