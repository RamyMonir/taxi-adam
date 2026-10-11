-- Fleet: shared cars (not tied to a driver), car check-in per shift, car + payment on every trip,
-- commission settings per driver, daily settlements, driver / car photos (R2 keys).
--
-- EXISTING production database: you do NOT have to run this – the app adds these tables and columns itself
-- on the first request after deploy (server/rides.js FLEET_SCHEMA, server/fleet.js, server/report.js).
-- Run it only on a NEW database, after 0001, before the first deploy. (SQLite has no "ADD COLUMN IF NOT
-- EXISTS", so on a database the new code already touched the ALTER lines would fail.)
CREATE TABLE IF NOT EXISTS cars (
  id TEXT PRIMARY KEY, make TEXT NOT NULL, model TEXT NOT NULL, color TEXT, plate TEXT NOT NULL UNIQUE,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'active',          -- active | service | inactive
  note TEXT, photo_key TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS car_sessions (
  id TEXT PRIMARY KEY, car_id TEXT NOT NULL, driver_id TEXT NOT NULL,
  started INTEGER NOT NULL, ended INTEGER,
  end_reason TEXT);                               -- release | switch | shift_end | auto | admin | service
CREATE UNIQUE INDEX IF NOT EXISTS one_open_per_car ON car_sessions (car_id) WHERE ended IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS one_open_per_driver ON car_sessions (driver_id) WHERE ended IS NULL;
CREATE INDEX IF NOT EXISTS car_sessions_time ON car_sessions (started);
CREATE TABLE IF NOT EXISTS settlements (
  day TEXT NOT NULL, driver_id TEXT NOT NULL, model TEXT, pct REAL, fee REAL,
  gross REAL, cash REAL, noncash REAL, driver_share REAL, owner_share REAL, hand_in REAL,
  settled_at INTEGER, settled_by TEXT, PRIMARY KEY (day, driver_id));

ALTER TABLE drivers ADD COLUMN current_car_id TEXT;
ALTER TABLE drivers ADD COLUMN photo_key TEXT;
ALTER TABLE drivers ADD COLUMN photo_ok INTEGER NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN await_photo TEXT;
ALTER TABLE drivers ADD COLUMN pay_model TEXT;    -- percent | daily_fee | NULL = company default (owner: none)
ALTER TABLE drivers ADD COLUMN driver_pct REAL;   -- NULL = CONFIG.commission.default_driver_pct
ALTER TABLE drivers ADD COLUMN daily_fee REAL;    -- zł per worked day (pay_model = daily_fee)

ALTER TABLE trips ADD COLUMN car_id TEXT;
ALTER TABLE trips ADD COLUMN car_label TEXT;
ALTER TABLE trips ADD COLUMN pay_bucket TEXT;     -- cash (stays with the driver) | owner (card / BLIK / transfer)
CREATE INDEX IF NOT EXISTS trips_driver_day ON trips (driver_id, day);
CREATE INDEX IF NOT EXISTS trips_car_day ON trips (car_id, day);
