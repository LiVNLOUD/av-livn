-- Measured on live (Workers Observability, 2026-10-31): the Worker point rescore after a field edit costs
-- 24–42 ms CPU (POST 42, PATCH 24, DELETE 27), above the free plan's ~10 ms. The Worker only records the edit;
-- score.yml's 15-minute run recomputes the spot with the Monte Carlo band (docs/MODEL.md §6c).
INSERT INTO meta (key, value) VALUES ('rescore_mode', 'deferred') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
UPDATE meta SET value = 'v2.4' WHERE key = 'schema';
