-- D9 notifications: owner-only push subscriptions, one settings row, sent log for de-duplication.
-- Never read by public endpoints (docs/PRIVACY.md). Sending happens in the scoring Actions job.
CREATE TABLE IF NOT EXISTS push_subscription (
  id TEXT PRIMARY KEY,            -- sha-256 prefix of the endpoint
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ua TEXT,
  created_at TEXT NOT NULL,
  last_ok_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notify_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notify_sent (
  key TEXT PRIMARY KEY,           -- daily:<date> | opp:<spot>:<start hour> | safe:<spot>:<date> | test:<ts>
  kind TEXT NOT NULL,
  spot_id TEXT,
  start_hour INTEGER,
  end_hour INTEGER,
  sent_at TEXT NOT NULL,
  channels TEXT
);
UPDATE meta SET value = 'v2.6' WHERE key = 'schema';
