-- v2 B2: Copernicus Marmara 500 m per spot (nearest wet cell to the tip).
-- ocean_series: hourly 1–20 m water temperature and 1–5 m current speed, now−3 d … now+5 d (ocean.yml, 6-hourly).
-- ocean_normal: day-of-year short normal from the daily analysis archive 2021-11 → (ocean.yml, monthly). Evidence C.
CREATE TABLE IF NOT EXISTS ocean_series (
  spot_id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  json TEXT NOT NULL      -- {t0, cell:{lat,lon,distance_km}, sst:[°C|null], cur:[m/s|null]|null}
);
CREATE TABLE IF NOT EXISTS ocean_normal (
  spot_id TEXT PRIMARY KEY,
  computed_at TEXT NOT NULL,
  json TEXT NOT NULL      -- {from, to, years, window_days, min_years, cell, normal:[366 × °C|null]}
);
UPDATE meta SET value = 'v2.2' WHERE key = 'schema';
