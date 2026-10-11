-- Baseline: the tables the app has been creating by itself (server/*.js) up to Taxi-Knurow-V3 1e8c964.
-- Safe on an existing database (IF NOT EXISTS). For a NEW database run this and 0002 before the first deploy:
--   npx wrangler d1 migrations apply taxi-knurow --remote
CREATE TABLE IF NOT EXISTS rides (
  id TEXT PRIMARY KEY, token TEXT NOT NULL, status TEXT NOT NULL, mode TEXT NOT NULL,
  created INTEGER NOT NULL, updated INTEGER NOT NULL, eta_at INTEGER, tg_msg INTEGER,
  ip TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS rides_ip ON rides (ip, created);
CREATE INDEX IF NOT EXISTS rides_status ON rides (status, updated);
CREATE TABLE IF NOT EXISTS driver (id INTEGER PRIMARY KEY, lat REAL, lng REAL, ts INTEGER, hint_ts INTEGER, until INTEGER);
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY, chat_id TEXT, name TEXT, phone TEXT, car TEXT, color TEXT, plate TEXT, seats INTEGER,
  code TEXT, active INTEGER NOT NULL DEFAULT 1, owner INTEGER NOT NULL DEFAULT 0,
  lat REAL, lng REAL, ts INTEGER, until INTEGER, hint_ts INTEGER, reminded INTEGER, created INTEGER, listing INTEGER);
CREATE INDEX IF NOT EXISTS drivers_chat ON drivers (chat_id);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, status TEXT NOT NULL, mode TEXT, source TEXT, cust TEXT, cust_hash TEXT,
  pickup TEXT, dest TEXT, km REAL, approach_km REAL, enroute_at INTEGER, started_at INTEGER, ended_at INTEGER,
  price REAL, price_kind TEXT, paid REAL, method TEXT, pax INTEGER, pay_msg INTEGER, driver_id TEXT, driver_name TEXT);
CREATE INDEX IF NOT EXISTS trips_day ON trips (day);
CREATE TABLE IF NOT EXISTS customers (
  phone TEXT PRIMARY KEY, name TEXT, orders INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0,
  first INTEGER, last INTEGER, last_route TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, name TEXT, picture TEXT, phone TEXT, created INTEGER, seen INTEGER);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, uid TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS tg_updates (update_id INTEGER PRIMARY KEY, ts INTEGER NOT NULL);
