-- F1: spots added automatically from the OSM inventory (no approval step), hidden by the owner or by a
-- forbidden area, near-spot links; owner-drawn forbidden areas (e.g. ports OSM does not tag as ports).
ALTER TABLE spots ADD COLUMN auto_added INTEGER NOT NULL DEFAULT 0;
ALTER TABLE spots ADD COLUMN hidden_reason TEXT CHECK (hidden_reason IN ('admin', 'forbidden'));
ALTER TABLE spots ADD COLUMN near_json TEXT;
CREATE TABLE IF NOT EXISTS forbidden_area (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  geojson TEXT NOT NULL,          -- Polygon geometry, [lon, lat] rings
  created_at TEXT NOT NULL
);
UPDATE meta SET value = 'v2.7' WHERE key = 'schema';
