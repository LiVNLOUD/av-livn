-- H3: scores per species (istavrit, levrek). SQLite cannot change a primary key in place: copy into new tables,
-- drop the old ones, rename. Existing rows are istavrit. H6: spots.lamp_prior (OSM street-lamp density, C).
CREATE TABLE spot_scores_v2_new (
  spot_id TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT 'istavrit',
  model_version TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  start_hour INTEGER NOT NULL,
  list_json TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  partial INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (spot_id, species)
);
INSERT INTO spot_scores_v2_new (spot_id, species, model_version, computed_at, start_hour, list_json, detail_json, partial)
  SELECT spot_id, 'istavrit', model_version, computed_at, start_hour, list_json, detail_json, partial FROM spot_scores_v2;
DROP TABLE spot_scores_v2;
ALTER TABLE spot_scores_v2_new RENAME TO spot_scores_v2;

CREATE TABLE spot_scores_v2_history_new (
  spot_id TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT 'istavrit',
  hour INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (spot_id, species, hour)
);
INSERT INTO spot_scores_v2_history_new (spot_id, species, hour, json) SELECT spot_id, 'istavrit', hour, json FROM spot_scores_v2_history;
DROP TABLE spot_scores_v2_history;
ALTER TABLE spot_scores_v2_history_new RENAME TO spot_scores_v2_history;

ALTER TABLE spots ADD COLUMN lamp_prior REAL;
-- precomputed public bodies are keyed by species from now on
DELETE FROM meta WHERE key LIKE 'pub:%';
UPDATE meta SET value = 'v2.8' WHERE key = 'schema';
