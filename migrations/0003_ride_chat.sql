-- "➕ Nowy kurs" as a conversation: what a driver has said so far while the bot waits for the rest of the ride.
--
-- EXISTING production database: you do NOT have to run this – server/fleet.js adds the column itself on the first request.
-- Run it only on a NEW database, after 0001 and 0002, before the first deploy.
ALTER TABLE drivers ADD COLUMN await_ride TEXT;
