-- v2 B0: spot point moved to the structure tip (eroded OSM land); the old coastline-based vertex is kept as
-- alt_lat/alt_lon. Exposure rose (16-direction fetch, km) and EUSeaMap substrate for the v2 static terms.
ALTER TABLE spots ADD COLUMN alt_lat REAL;
ALTER TABLE spots ADD COLUMN alt_lon REAL;
ALTER TABLE spots ADD COLUMN tip_source TEXT;
ALTER TABLE spots ADD COLUMN fetch_json TEXT;
ALTER TABLE spots ADD COLUMN substrate TEXT;
ALTER TABLE spots ADD COLUMN substrate_biozone TEXT;
ALTER TABLE spots ADD COLUMN substrate_dist_m REAL;
ALTER TABLE spots ADD COLUMN substrate_conf INTEGER;
ALTER TABLE observations ADD COLUMN wave_dir REAL;

UPDATE meta SET value = 'v2.0' WHERE key = 'schema';
