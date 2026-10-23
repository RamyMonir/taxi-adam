-- Chat between the customer (ride status page) and the driver / the owner (Telegram) – server/chat.js.
--
-- EXISTING production database: you do NOT have to run this – server/chat.js creates the tables itself on first use.
-- Run it only on a NEW database, after 0001–0003, before the first deploy.
CREATE TABLE IF NOT EXISTS ride_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ride_id TEXT NOT NULL,
  sender TEXT NOT NULL,                 -- customer | driver | owner | system
  text TEXT NOT NULL, created_at INTEGER NOT NULL,
  tg_chat_id TEXT, tg_message_id INTEGER,
  kind TEXT);                           -- system lines: 'st:<status>', at most one per ride and status
CREATE INDEX IF NOT EXISTS ride_messages_ride ON ride_messages (ride_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ride_messages_kind ON ride_messages (ride_id, kind) WHERE kind IS NOT NULL;
-- which Telegram message belongs to which ride's chat (a reply to it goes to that customer)
CREATE TABLE IF NOT EXISTS chat_tg (
  chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, ride_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id));
