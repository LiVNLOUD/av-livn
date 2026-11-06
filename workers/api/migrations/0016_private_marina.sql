-- K1: real yacht marinas (name "Yat Limanı"/"Marina" or an OSM operator) and their "liman içi" records: private
-- operator, access may be restricted. Kept apart from spots.access (CHECK constraint); the home plan and
-- notifications never pick them, the list shows a badge.
ALTER TABLE spots ADD COLUMN private_marina INTEGER NOT NULL DEFAULT 0;
UPDATE meta SET value = 'v3.1' WHERE key = 'schema';
