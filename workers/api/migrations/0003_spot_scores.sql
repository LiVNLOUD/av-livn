-- F1.2: scores are precomputed by cron; the API only reads them.
CREATE TABLE IF NOT EXISTS spot_scores (
  spot_id TEXT NOT NULL,
  species TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  start_hour INTEGER NOT NULL,   -- first scored hour, as whole UTC hours since epoch
  list_json TEXT NOT NULL,       -- [[total, gated(0/1), first warning|null, missing count], ...] per hour
  detail_json TEXT NOT NULL,     -- { meta, hours: [...] } ready for /api/spots/:id
  PRIMARY KEY (spot_id, species)
);

UPDATE meta SET value = 'f1.2' WHERE key = 'schema';
