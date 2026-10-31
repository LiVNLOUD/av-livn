-- Part C: field-table provenance (saha > uzaktan > masabasi > DTM > prior), user review of desk findings,
-- deferred rescoring, frozen model history, catch log.
ALTER TABLE field_obs ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'saha' CHECK (source_kind IN ('saha', 'uzaktan', 'masabasi'));
ALTER TABLE field_obs ADD COLUMN status TEXT NOT NULL DEFAULT 'onayli' CHECK (status IN ('onaysiz', 'onayli', 'reddedildi'));
ALTER TABLE field_obs ADD COLUMN evidence_json TEXT;   -- {source, date, method, confidence, license, url}
ALTER TABLE field_obs ADD COLUMN light_prob REAL;      -- lamp probability for uzaktan/masabasi findings
ALTER TABLE field_obs ADD COLUMN created_by TEXT NOT NULL DEFAULT 'kaan';

-- Lamp state typed by an admin on /admin/ (kept when field entries are deleted).
ALTER TABLE spots ADD COLUMN lamp_admin INTEGER;   -- 1 / 0 typed on /admin/; NULL = not set
UPDATE spots SET lamp_admin = has_light WHERE has_light IS NOT NULL;

-- Spots whose score changed after a field edit and still need the Monte Carlo band (score.yml, every 15 min).
CREATE TABLE IF NOT EXISTS pending_rescore (
  spot_id TEXT PRIMARY KEY,
  since TEXT NOT NULL,
  immediate INTEGER NOT NULL DEFAULT 0   -- 1 = the Worker already wrote a point score
);

-- One row per spot and scored hour, written by every hourly run: what the model said at that hour.
CREATE TABLE IF NOT EXISTS spot_scores_v2_history (
  spot_id TEXT NOT NULL,
  hour INTEGER NOT NULL,     -- whole UTC hours since epoch
  json TEXT NOT NULL,        -- {model_version, total, p10, p90, rank, reason, components, inputs}
  PRIMARY KEY (spot_id, hour)
);

CREATE TABLE IF NOT EXISTS catch_session (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES spots(id),
  observer_id TEXT NOT NULL DEFAULT 'kaan',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  active_min INTEGER NOT NULL,
  rods INTEGER NOT NULL DEFAULT 1,
  jig_g REAL,
  hook_no TEXT,
  lure_len_cm REAL,
  lure_color TEXT,
  under_lamp INTEGER,        -- 1 / 0 / NULL
  zero_catch INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL,
  model_json TEXT            -- frozen model output for the session hours
);
CREATE INDEX IF NOT EXISTS catch_session_spot ON catch_session (spot_id, start_at);
CREATE TABLE IF NOT EXISTS catch_item (
  session_id TEXT NOT NULL REFERENCES catch_session(id) ON DELETE CASCADE,
  species TEXT NOT NULL DEFAULT 'istavrit',
  count INTEGER NOT NULL,
  length_cm REAL
);

UPDATE meta SET value = 'v2.3' WHERE key = 'schema';
