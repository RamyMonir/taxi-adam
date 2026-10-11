-- ============================================================================================
--  DEMO DATA – fictional drivers and cars for the client demo. NOT real people, NOT real plates.
-- ============================================================================================
--  Everything here has an id starting with "demo_", so it's easy to find, edit or remove.
--  Demo drivers get placeholder Telegram chat ids (negative numbers like -9000000001). Real private
--  Telegram chats are always positive, so they can never collide with a real driver, and the bot
--  never sends rides to them (dispatch skips "demo_" drivers).
--  INSERT OR IGNORE: running it twice changes nothing, and existing real drivers / cars are untouched.
--
--  Load (after the app ran once, or after migrations 0001 + 0002):
--    npx wrangler d1 execute taxi-knurow --remote --file=migrations/seed_demo.sql
--  Remove all demo data:
--    npx wrangler d1 execute taxi-knurow --remote --command="DELETE FROM car_sessions WHERE car_id LIKE 'demo_%' OR driver_id LIKE 'demo_%'; DELETE FROM cars WHERE id LIKE 'demo_%'; DELETE FROM drivers WHERE id LIKE 'demo_%';"
--  Real data: add drivers in Telegram with /dodaj Imię telefon (they join via the invite link) and cars
--  with /dodajauto Marka Model; kolor; rejestracja; miejsca – then remove the demo rows as above.
-- ============================================================================================

INSERT OR IGNORE INTO drivers (id, chat_id, name, phone, active, owner, created, pay_model, driver_pct, daily_fee) VALUES
  ('demo_d1', '-9000000001', 'Marek Nowak',       '+48500000001', 1, 0, 1760000000001, 'percent',   50,   NULL),
  ('demo_d2', '-9000000002', 'Katarzyna Wójcik',  '+48500000002', 1, 0, 1760000000002, 'daily_fee', NULL, 120),
  ('demo_d3', '-9000000003', 'Tomasz Kowalczyk',  '+48500000003', 1, 0, 1760000000003, 'percent',   50,   NULL),
  ('demo_d4', '-9000000004', 'Paweł Zieliński',   '+48500000004', 1, 0, 1760000000004, 'percent',   55,   NULL);

INSERT OR IGNORE INTO cars (id, make, model, color, plate, seats, status, note, created) VALUES
  ('demo_c1', 'Toyota',  'Corolla', 'biała',    'SGL 1A234', 4, 'active',  'DEMO', 1760000000101),
  ('demo_c2', 'Škoda',   'Octavia', 'czarna',   'SGL 2B567', 4, 'active',  'DEMO', 1760000000102),
  ('demo_c3', 'Toyota',  'Camry',   'grafitowa','SK 3C890',  4, 'active',  'DEMO', 1760000000103),
  ('demo_c4', 'Kia',     'Ceed',    'srebrna',  'SGL 4D123', 4, 'active',  'DEMO', 1760000000104),
  ('demo_c5', 'Hyundai', 'i30',     'niebieska','SK 5E456',  5, 'service', 'DEMO – w serwisie: wymiana klocków', 1760000000105);
