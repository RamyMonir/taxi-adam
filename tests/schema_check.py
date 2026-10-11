"""SQL check (SQLite = what D1 runs): migrations apply cleanly, the demo seed is idempotent and removable,
and the car check-in statements from server/cars.js allow only ONE open session per car and per driver.
Run: python3 tests/schema_check.py"""
import os, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, "..", "migrations")
db = sqlite3.connect(":memory:", isolation_level=None)
for f in ["0001_baseline.sql", "0002_fleet_cars.sql", "seed_demo.sql", "seed_demo.sql"]:   # seed twice: must be a no-op
    db.executescript(open(os.path.join(M, f), encoding="utf-8").read())

q = lambda sql, *a: db.execute(sql, a).fetchall()
assert q("SELECT COUNT(*) FROM drivers WHERE id LIKE 'demo_%'")[0][0] == 4
assert q("SELECT COUNT(*) FROM cars WHERE id LIKE 'demo_%'")[0][0] == 5
assert all(int(c) < 0 for (c,) in q("SELECT chat_id FROM drivers WHERE id LIKE 'demo_%'")), "demo chat ids must be negative"

# a real driver must survive the seed and the demo clean-up
q("INSERT INTO drivers (id, chat_id, name, active, owner, created) VALUES ('real1', '123456789', 'Prawdziwy', 1, 0, 1)")

def check_in(driver, car, sid, now):
    """same statements as server/cars.js checkIn (D1 batch = one transaction)"""
    try:
        db.execute("BEGIN")
        db.execute("UPDATE car_sessions SET ended = ?1, end_reason = 'switch' WHERE driver_id = ?2 AND ended IS NULL", (now, driver))
        cur = db.execute("""INSERT INTO car_sessions (id, car_id, driver_id, started)
                            SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM cars WHERE id = ?2 AND status = 'active')""", (sid, car, driver, now))
        inserted = cur.rowcount
        db.execute("UPDATE drivers SET current_car_id = (SELECT car_id FROM car_sessions WHERE id = ?1) WHERE id = ?2", (sid, driver))
        db.execute("COMMIT")
        return "ok" if inserted else "service"
    except sqlite3.IntegrityError as e:
        db.execute("ROLLBACK")
        return "taken" if "UNIQUE" in str(e) else str(e)

assert check_in("demo_d1", "demo_c1", "s1", 1) == "ok"
assert check_in("demo_d2", "demo_c1", "s2", 2) == "taken", "second driver must not get the same car"
assert q("SELECT current_car_id FROM drivers WHERE id = 'demo_d2'")[0][0] is None, "failed check-in must roll back completely"
assert check_in("demo_d1", "demo_c2", "s3", 3) == "ok"               # mid-shift switch: old session closed in the same transaction
assert q("SELECT end_reason FROM car_sessions WHERE id = 's1'")[0][0] == "switch"
assert check_in("demo_d2", "demo_c1", "s4", 4) == "ok"               # the released car is free again
assert check_in("demo_d3", "demo_c5", "s5", 5) == "service"          # car in service
assert q("SELECT COUNT(*) FROM car_sessions WHERE ended IS NULL")[0][0] == 2
try:
    q("INSERT INTO car_sessions (id, car_id, driver_id, started) VALUES ('x', 'demo_c3', 'demo_d1', 9)")
    raise SystemExit("one open session per driver not enforced")
except sqlite3.IntegrityError:
    pass

# trips get the new columns
q("INSERT INTO trips (id, day, status, car_id, car_label, pay_bucket) VALUES ('t1', '2026-10-10', 'done', 'demo_c1', 'Toyota Corolla · SGL 1A234', 'cash')")
q("INSERT INTO settlements (day, driver_id, gross) VALUES ('2026-10-10', 'demo_d1', 10)")

# clean-up command from seed_demo.sql
db.executescript("DELETE FROM car_sessions WHERE car_id LIKE 'demo_%' OR driver_id LIKE 'demo_%'; DELETE FROM cars WHERE id LIKE 'demo_%'; DELETE FROM drivers WHERE id LIKE 'demo_%';")
assert q("SELECT COUNT(*) FROM drivers")[0][0] == 1 and q("SELECT name FROM drivers")[0][0] == "Prawdziwy"
print("schema_check: OK")
