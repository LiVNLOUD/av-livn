-- Faz R: satellite depth near each spot (written by satbathy.yml, read by the score job and the spot card).
-- ICESat-2 ATL24 points within 150 m of the spot tip (measured; public, no private field data).
CREATE TABLE sat_depth_points (
  spot_id TEXT NOT NULL,
  dist_m REAL NOT NULL,
  depth_m REAL NOT NULL,
  sigma_m REAL,
  pass_id TEXT NOT NULL,
  obs_date TEXT NOT NULL
);
CREATE INDEX sat_depth_points_spot ON sat_depth_points (spot_id);
-- Cast-band depth per spot and source: band 0 = 0–50 m, band 1 = 50–150 m; kind 'atl24' or 'sdb' (SDB only when
-- the Sentinel-2 model passed the acceptance rule).
CREATE TABLE sat_depth_band (
  spot_id TEXT NOT NULL,
  band INTEGER NOT NULL,
  kind TEXT NOT NULL,
  depth_m REAL NOT NULL,
  sigma_m REAL NOT NULL,
  n INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (spot_id, band, kind)
);
