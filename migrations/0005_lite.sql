-- LITE version: request log (WhatsApp / SMS / phone taps), owner panel sessions, price change history.
-- New tables only – nothing in the full system's tables changes. (0004 is the chat migration on the chat branch.)
-- The code also creates these tables on first use (CREATE TABLE IF NOT EXISTS), so running this file is optional.
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,          -- epoch ms
  channel TEXT NOT NULL,        -- wa | sms | tel
  mode TEXT,                    -- now | later
  when_at TEXT,                 -- "YYYY-MM-DDTHH:MM" (later)
  from_txt TEXT, to_txt TEXT, pax INTEGER, luggage TEXT,
  name TEXT, phone TEXT, notes TEXT, geo TEXT, page TEXT,
  ip_hash TEXT,
  status TEXT                   -- NULL | ok | no  (marked by the owner)
);
CREATE INDEX IF NOT EXISTS leads_ts ON leads(ts);

CREATE TABLE IF NOT EXISTS panel_sessions (
  sid_hash TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_changes (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  commit_sha TEXT,
  version INTEGER,
  summary TEXT,
  ip_hash TEXT
);
