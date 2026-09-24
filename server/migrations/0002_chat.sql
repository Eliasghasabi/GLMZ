CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL,
  text       TEXT    NOT NULL,
  device     TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_chat_device_time ON chat_messages (device, created_at);
