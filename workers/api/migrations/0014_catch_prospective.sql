-- I6: honest catch log for calibration.
--   target_species  what the angler fished for (a levrek session is not a zero istavrit session); NULL = unknown
--                   (rows before I6 — never counted as a zero for any species)
--   method          lrf / spin / capari / diger (NULL = unknown)
--   retro           1 = entered afterwards from memory (not during or right after the session)
--   forecast_kind   'dondurulmus'         model output captured before the session started (prospective)
--                   'yeniden_hesaplanmis' taken later from stored/recomputed hours — not the forecast the angler saw
--   forecast_meta   JSON {model_version, captured_at, valid_hours, sources, params_id}
-- Editing a session never rewrites model_json (catch.ts); only a change of spot or time re-freezes and is marked.
ALTER TABLE catch_session ADD COLUMN target_species TEXT;
ALTER TABLE catch_session ADD COLUMN method TEXT CHECK (method IS NULL OR method IN ('lrf', 'spin', 'capari', 'diger'));
ALTER TABLE catch_session ADD COLUMN retro INTEGER NOT NULL DEFAULT 0 CHECK (retro IN (0, 1));
ALTER TABLE catch_session ADD COLUMN forecast_kind TEXT NOT NULL DEFAULT 'yeniden_hesaplanmis' CHECK (forecast_kind IN ('dondurulmus', 'yeniden_hesaplanmis'));
ALTER TABLE catch_session ADD COLUMN forecast_meta TEXT;
UPDATE meta SET value = 'v2.9' WHERE key = 'schema';
