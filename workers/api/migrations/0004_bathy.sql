-- F2: depth features from the EMODnet DTM and provenance of normal/probe.
ALTER TABLE spots ADD COLUMN slope_pct REAL;
ALTER TABLE spots ADD COLUMN max_depth_100m REAL;
ALTER TABLE spots ADD COLUMN profile_json TEXT;
ALTER TABLE spots ADD COLUMN probe_source TEXT;
ALTER TABLE spots ADD COLUMN normal_source TEXT;
ALTER TABLE spots ADD COLUMN osm_normal_deg REAL;

UPDATE meta SET value = 'f2' WHERE key = 'schema';
