-- F1: spots, weather cells, forecast snapshots, hourly observation history.
CREATE TABLE IF NOT EXISTS spots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  probe_lat REAL,
  probe_lon REAL,
  probe_ok INTEGER,
  shore_normal_deg REAL,
  length_m REAL,
  depth_200m REAL,
  slope REAL,
  has_light INTEGER,
  status TEXT NOT NULL DEFAULT 'candidate',
  place TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'osm',
  wx_cell TEXT NOT NULL,
  sea_cell TEXT,
  admin_edited_at TEXT,
  updated_at TEXT NOT NULL
);

-- Weather ('wx') and sea ('sea') sampling cells shared by nearby spots (~0.05° buckets).
CREATE TABLE IF NOT EXISTS cells (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('wx', 'sea')),
  lat REAL NOT NULL,
  lon REAL NOT NULL
);

-- Latest −24…+72 h hourly series per cell, overwritten every run (one row per cell).
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  cell_id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  json TEXT NOT NULL
);

-- One row per cell per hour: the value valid at fetch time. Calibration + 72 h trends.
CREATE TABLE IF NOT EXISTS observations (
  cell_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  pressure REAL, wind_speed REAL, wind_dir REAL, wind_gust REAL, temp REAL, precip REAL, cloud REAL,
  wave_h REAL, sst REAL, cur_vel REAL, cur_dir REAL, sea_level REAL,
  PRIMARY KEY (cell_id, ts)
);

UPDATE meta SET value = 'f1' WHERE key = 'schema';
