"""Desk findings → D1 field table (source_kind 'masabasi', status 'onaysiz', evidence JSON).

Rows have a deterministic id `desk-<source>-<spot>` so a rerun updates the value but never overrides the user's
review: an approved or rejected finding keeps its status (and a rejected one is not resurrected).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field


@dataclass
class Finding:
    spot_id: str
    source: str  # osm_lamp | sentinel2 | ced | openseamap
    observed_at: str
    evidence: dict
    light_prob: float | None = None
    substrate: list[str] | None = None
    note: str | None = None
    depths: list[tuple[float, float]] = field(default_factory=list)  # (distance_m, depth_m)

    @property
    def id(self) -> str:
        return f"desk-{self.source}-{self.spot_id}"


UPSERT = """INSERT INTO field_obs (id, spot_id, observed_at, substrate, note, light_prob, created_at, source_kind, status, evidence_json, created_by)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'masabasi', 'onaysiz', ?8, 'desk-pipeline')
ON CONFLICT(id) DO UPDATE SET observed_at = excluded.observed_at, substrate = excluded.substrate, note = excluded.note,
light_prob = excluded.light_prob, evidence_json = excluded.evidence_json"""


def write(d1, findings: list[Finding], now: str) -> int:
    """Upsert findings (review status untouched on update); depth pairs replaced. Returns rows written."""
    for f in findings:
        d1.query(UPSERT, [f.id, f.spot_id, f.observed_at, json.dumps(f.substrate) if f.substrate else None, f.note, f.light_prob, now,
                          json.dumps(f.evidence, ensure_ascii=False)])
        d1.query("DELETE FROM field_depth WHERE obs_id = ?1", [f.id])
        for dist, depth in f.depths:
            d1.query("INSERT INTO field_depth (obs_id, distance_m, method, depth_m) VALUES (?1, ?2, 'plumb', ?3)", [f.id, dist, depth])
    return len(findings)


def prune(d1, source: str, keep: list[Finding]) -> int:
    """Delete still-unreviewed findings of `source` that the current run no longer produces (a method fix or
    a vanished OSM object). Approved or rejected rows stay: the user's review is never undone."""
    ids = [f.id for f in keep]
    marks = ", ".join(f"?{i + 2}" for i in range(len(ids)))
    cond = f" AND id NOT IN ({marks})" if ids else ""
    stale = d1.query(f"SELECT id FROM field_obs WHERE created_by = 'desk-pipeline' AND status = 'onaysiz' AND id LIKE ?1{cond}", [f"desk-{source}-%", *ids])
    for r in stale:
        d1.query("DELETE FROM field_depth WHERE obs_id = ?1", [r["id"]])
        d1.query("DELETE FROM field_obs WHERE id = ?1", [r["id"]])
    return len(stale)
