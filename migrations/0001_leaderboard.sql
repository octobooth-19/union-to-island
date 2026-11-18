CREATE TABLE IF NOT EXISTS scores (
  run_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('easy', 'medium', 'hard')),
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  elapsed INTEGER NOT NULL CHECK (elapsed > 0),
  collisions INTEGER NOT NULL CHECK (collisions >= 0),
  lives INTEGER NOT NULL CHECK (lives BETWEEN 1 AND 5),
  submitted INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_board ON scores (mode, day, version, elapsed, collisions, submitted, run_id);
CREATE INDEX IF NOT EXISTS scores_retention ON scores (submitted);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits (expires);
