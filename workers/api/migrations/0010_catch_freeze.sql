-- C4: frozen model output state per session: complete, or partial until score.yml recomputes the hours that
-- predate spot_scores_v2_history from the hourly observations (marked "recomputed").
ALTER TABLE catch_session ADD COLUMN freeze_status TEXT NOT NULL DEFAULT 'partial' CHECK (freeze_status IN ('partial', 'complete'));
UPDATE meta SET value = 'v2.5' WHERE key = 'schema';
