-- Persist monthly quota receipts independently of repository and draft deletion.
CREATE TABLE IF NOT EXISTS signal_usage_events (
  signal_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signal_usage_user_month ON signal_usage_events(user_id, created_at);
INSERT OR IGNORE INTO signal_usage_events(signal_id, user_id, created_at)
  SELECT id, user_id, created_at FROM signals;
CREATE TRIGGER IF NOT EXISTS tr_signal_usage_after_insert
AFTER INSERT ON signals BEGIN
  INSERT OR IGNORE INTO signal_usage_events(signal_id, user_id, created_at)
  VALUES(NEW.id, NEW.user_id, NEW.created_at);
END;
