-- v2 B1/B5: v2 score rows, access field, field observations (form), depth pairs, photos, catch log.

-- access: shown on the card, not scored. Initial values from the user's field notes (F2.1).
ALTER TABLE spots ADD COLUMN access TEXT CHECK (access IN ('acik', 'kisitli_feribot', 'belirsiz'));
UPDATE spots SET access = 'kisitli_feribot' WHERE id IN ('osm-way-1233883494', 'osm-way-503770078');
UPDATE spots SET access = 'belirsiz' WHERE id = 'osm-way-1456975486';

CREATE TABLE IF NOT EXISTS spot_scores_v2 (
  spot_id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  start_hour INTEGER NOT NULL,   -- whole UTC hours since epoch
  list_json TEXT NOT NULL,       -- [[total, p10, p90, rank, gated(0/1), first warning|null], ...] per hour
  detail_json TEXT NOT NULL,     -- packed v2 detail (components with value/source/evidence/reason)
  partial INTEGER NOT NULL DEFAULT 0  -- 1 = single-spot rescore after a field entry (band reused, ranks approximate)
);

CREATE TABLE IF NOT EXISTS field_obs (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES spots(id),
  observed_at TEXT NOT NULL,
  substrate TEXT,                -- JSON array of kum|cakil|kaya|midyeli|yosunlu|camur
  snag TEXT CHECK (snag IN ('yosun', 'midye', 'camur', 'hicbiri')),   -- "jighead'e ne takıldı"
  structure TEXT CHECK (structure IN ('iskele', 'mendirek', 'dogal_kaya')),
  has_light INTEGER,             -- 1 / 0 / NULL (bilinmiyor)
  light_color TEXT CHECK (light_color IN ('beyaz', 'sari', 'led')),
  access TEXT CHECK (access IN ('acik', 'kisitli_feribot', 'belirsiz')),
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_obs_spot ON field_obs (spot_id, observed_at);

CREATE TABLE IF NOT EXISTS field_depth (
  obs_id TEXT NOT NULL REFERENCES field_obs(id) ON DELETE CASCADE,
  distance_m REAL NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('plumb', 'sink')),  -- kurşunla dikine / jighead batma süresi
  depth_m REAL,                  -- plumb
  sink_s REAL,                   -- sink
  jig_g REAL                     -- sink
);

CREATE TABLE IF NOT EXISTS field_photo (
  obs_id TEXT PRIMARY KEY REFERENCES field_obs(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data_b64 TEXT NOT NULL         -- client-downscaled JPEG, ≤ 400 KB
);

CREATE TABLE IF NOT EXISTS catch_log (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES spots(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  method TEXT,
  count INTEGER NOT NULL,        -- zero catches are recorded
  lengths_cm TEXT,
  model_version TEXT,
  score_at_start REAL
);

UPDATE meta SET value = 'v2.1' WHERE key = 'schema';
