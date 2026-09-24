-- ─────────────────────────────────────────────────────────────
--  Shadow Strike leaderboard schema
--
--  One row per submitted run. History is never deleted, so the
--  monthly board simply filters on `month` — past months stay
--  queryable for all-time views or archives.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,          -- display form, as typed
  username_key  TEXT    NOT NULL,          -- lowercased, for grouping
  score         INTEGER NOT NULL,
  kills         INTEGER NOT NULL,
  wave          INTEGER NOT NULL,
  accuracy      INTEGER NOT NULL DEFAULT 0,
  difficulty    TEXT    NOT NULL DEFAULT 'normal',
  duration      INTEGER NOT NULL DEFAULT 0, -- seconds
  month         TEXT    NOT NULL,           -- 'YYYY-MM' (UTC)
  created_at    INTEGER NOT NULL,           -- epoch ms
  device        TEXT,                       -- hashed device id (rate limiting)
  ip            TEXT                        -- hashed IP (rate limiting)
);

-- monthly top-N: the board's hot path
CREATE INDEX IF NOT EXISTS idx_scores_month_score
  ON scores (month, score DESC);

-- a single player's runs within a month
CREATE INDEX IF NOT EXISTS idx_scores_user_month
  ON scores (username_key, month, score DESC);

-- rate-limit lookups
CREATE INDEX IF NOT EXISTS idx_scores_device_time
  ON scores (device, created_at);

CREATE INDEX IF NOT EXISTS idx_scores_ip_time
  ON scores (ip, created_at);
