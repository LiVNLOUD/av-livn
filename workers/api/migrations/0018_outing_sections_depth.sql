-- V2.5: field outings with method sections, quick depth entries with a consistency check (D4, D5).
--   catch_outing      one trip to one spot (the independent unit for calibration, D5); people = anglers on the trip
--   catch_session     now also a SECTION of an outing: outing_id + section_no; bites (vuruş, explicit 0 allowed);
--                     tackle_method from the V2 method pool (the old coarse `method` stays for compatibility); bait
--   catch_item        weight_kg entered by the angler (bag check, md. 15(4)); izmarit is a plain species row and is never
--                     a target species, so calibration (which counts target-species items only) leaves it out
--   field_depth       uncertainty_m and a method note for raw entries ("kurşun, misina açısı/akıntı belirsiz")
--   field_obs         check_json: result of the automatic consistency check; failed checks stay 'onaysiz' for review
CREATE TABLE IF NOT EXISTS catch_outing (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  people INTEGER NOT NULL DEFAULT 1 CHECK (people BETWEEN 1 AND 20),
  note TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE catch_session ADD COLUMN outing_id TEXT REFERENCES catch_outing(id) ON DELETE CASCADE;
ALTER TABLE catch_session ADD COLUMN section_no INTEGER;
ALTER TABLE catch_session ADD COLUMN bites INTEGER CHECK (bites IS NULL OR bites >= 0);
ALTER TABLE catch_session ADD COLUMN bait TEXT CHECK (bait IS NULL OR bait IN ('hamsi', 'karides', 'midye'));
ALTER TABLE catch_session ADD COLUMN tackle_method TEXT CHECK (tackle_method IS NULL OR tackle_method IN
  ('lrf', 'mikro_jig', 'capari_tuylu', 'capari_yemli', 'dropshot_yem', 'dip', 'samandira', 'spin', 'diger'));
CREATE INDEX IF NOT EXISTS catch_session_outing ON catch_session (outing_id, section_no);
ALTER TABLE catch_item ADD COLUMN weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg > 0);
ALTER TABLE field_depth ADD COLUMN uncertainty_m REAL;
ALTER TABLE field_depth ADD COLUMN method_note TEXT;
ALTER TABLE field_obs ADD COLUMN check_json TEXT;
UPDATE meta SET value = 'v3.2' WHERE key = 'schema';
