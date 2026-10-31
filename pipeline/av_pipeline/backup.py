"""Private D1 tables → JSON dump (encrypted in backup.yml) and JSON dump → SQL for restore.

  python -m av_pipeline.backup dump out.json         # Actions: D1 REST (CLOUDFLARE_* env)
  python -m av_pipeline.backup restore in.json > restore.sql
      then: wrangler d1 execute av-livn --remote --file restore.sql   (docs/BACKUP.md)

The dump never leaves the runner in plain text: backup.yml encrypts it with gpg (AES256, passphrase from
the BACKUP_PASSPHRASE secret) before uploading the artifact. Restore is INSERT OR REPLACE, so it is safe to
replay onto a database that still has some of the rows.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Owner-only tables plus spots (admin names, lamp, notes, status). Order respects foreign keys.
TABLES = ["spots", "field_obs", "field_depth", "field_photo", "catch_log", "catch_session", "catch_item", "push_subscription", "notify_settings", "notify_sent"]
PAGE = 500


def dump(query, tables: list[str] = TABLES) -> dict:
    """query(sql, params) → rows. Missing tables (older schema) are recorded as absent, not an error."""
    existing = {r["name"] for r in query("SELECT name FROM sqlite_master WHERE type = 'table'", [])}
    out: dict = {"version": 1, "tables": {}}
    for t in tables:
        if t not in existing:
            out["tables"][t] = None
            continue
        rows: list[dict] = []
        while True:
            page = query(f"SELECT * FROM {t} ORDER BY rowid LIMIT {PAGE} OFFSET {len(rows)}", [])
            rows += page
            if len(page) < PAGE:
                break
        out["tables"][t] = rows
    return out


def lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def restore_sql(d: dict) -> str:
    lines = ["PRAGMA defer_foreign_keys = ON;"]
    for t in TABLES:
        for r in d["tables"].get(t) or []:
            cols = list(r)
            lines.append(f"INSERT OR REPLACE INTO {t} ({', '.join(cols)}) VALUES ({', '.join(lit(r[c]) for c in cols)});")
    return "\n".join(lines) + "\n"


def counts(d: dict) -> dict:
    return {t: (None if rows is None else len(rows)) for t, rows in d["tables"].items()}


def main(argv: list[str]) -> int:  # pragma: no cover - CLI
    mode, path = argv[1], Path(argv[2])
    if mode == "dump":
        from av_pipeline.ocean.marmara import D1

        d = dump(D1().query)
        path.write_text(json.dumps(d, ensure_ascii=False))
        print(json.dumps(counts(d)))  # counts only, never values
    else:
        sys.stdout.write(restore_sql(json.loads(path.read_text())))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv))
