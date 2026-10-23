// Fleet cars: shared by all drivers (not tied to one). A driver checks a car out for his shift
// (one tap in the bot), can switch it between rides and gives it back at the end of the shift.
// Every ride stores a snapshot of the car (rides.data.vehicle, trips.car_label), so history never changes.
import { db } from "./rides.js";
import { randomId } from "./util.js";

export const isDemo = (x) => !!x && String(x.id || "").startsWith("demo_");
export const carName = (c) => (c ? `${c.make || ""} ${c.model || ""}`.trim() : "");
export const carLabel = (c) => (c ? [carName(c), c.plate].filter(Boolean).join(" · ") : "");
export const carLong = (c) => (c ? [carName(c), c.color, c.plate, c.seats ? `${c.seats} ${seatsWord(c.seats)}` : ""].filter(Boolean).join(" · ") : "");
export const seatsWord = (n) => (n === 1 ? "miejsce" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "miejsca" : "miejsc");

// "/dodajauto Toyota Corolla; biała; SGL 1A234; 4" -> {make, model, color, plate, seats} or {error}
export function parseCarArgs(text) {
  const parts = String(text || "").split(/\s*[;|]\s*/).map((x) => x.trim());
  const name = (parts[0] || "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "name" };
  const sp = name.indexOf(" ");
  const make = (sp > 0 ? name.slice(0, sp) : name).slice(0, 20), model = (sp > 0 ? name.slice(sp + 1) : "").slice(0, 30);
  const plate = String(parts[2] || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 12);
  if (!plate || plate.replace(/ /g, "").length < 4) return { error: "plate" };
  const seats = parseInt(parts[3], 10);
  return { make, model, color: String(parts[1] || "").slice(0, 20), plate, seats: seats >= 1 && seats <= 9 ? seats : 4 };
}

// all cars except removed ones, with who holds each right now (same order = the numbers in /auta)
export async function listCars(env) {
  const rs = await (await db(env)).prepare(
    `SELECT c.*, s.driver_id AS holder_id, s.started AS held_since, d.name AS holder_name
       FROM cars c LEFT JOIN car_sessions s ON s.car_id = c.id AND s.ended IS NULL
       LEFT JOIN drivers d ON d.id = s.driver_id
      WHERE c.status != 'inactive' ORDER BY c.created`).all();
  return rs.results || [];
}
export const freeCars = (cars) => cars.filter((c) => c.status === "active" && !c.holder_id);
export async function getCar(env, id) {
  return id ? (await (await db(env)).prepare("SELECT * FROM cars WHERE id = ?").bind(id).first()) || null : null;
}
// the car this driver holds now (or null)
export async function currentCar(env, driverId) {
  return (await (await db(env)).prepare(
    `SELECT c.*, s.started AS held_since FROM car_sessions s JOIN cars c ON c.id = s.car_id
      WHERE s.driver_id = ? AND s.ended IS NULL`).bind(driverId).first()) || null;
}
export async function hasOpenRide(env, driverId) {
  const row = await (await db(env)).prepare(
    `SELECT 1 AS x FROM rides WHERE status IN ('enroute','arrived','ontrip')
       AND COALESCE(json_extract(data, '$.driverId'), 'owner') = ? LIMIT 1`).bind(driverId).first();
  return !!row;
}

// Check in to a car. Atomic: the partial UNIQUE indexes allow one open session per car and per driver,
// so when two drivers tap the same car at the same moment, the second INSERT fails -> {error: "taken"}.
// A switch (already holding another car) closes the old session in the same transaction.
export async function checkIn(env, driver, carId) {
  const d = await db(env), now = Date.now(), sid = "s_" + randomId(10);
  const car = await getCar(env, carId);
  if (!car || car.status === "inactive") return { error: "gone" };
  if (car.status !== "active") return { error: "service", car };
  const cur = await currentCar(env, driver.id);
  if (cur && cur.id === carId) return { ok: true, car, same: true };   // double tap / Telegram re-delivery
  if (await hasOpenRide(env, driver.id)) return { error: "ride" };
  try {
    const res = await d.batch([
      d.prepare("UPDATE car_sessions SET ended = ?1, end_reason = 'switch' WHERE driver_id = ?2 AND ended IS NULL").bind(now, driver.id),
      d.prepare(`INSERT INTO car_sessions (id, car_id, driver_id, started)
                 SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM cars WHERE id = ?2 AND status = 'active')`).bind(sid, carId, driver.id, now),
      d.prepare("UPDATE drivers SET current_car_id = (SELECT car_id FROM car_sessions WHERE id = ?1) WHERE id = ?2").bind(sid, driver.id),
    ]);
    if (!res?.[1]?.meta?.changes) return { error: "service", car };   // went to service between read and write
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e.message))) {
      const who = await d.prepare(
        "SELECT dr.name FROM car_sessions s JOIN drivers dr ON dr.id = s.driver_id WHERE s.car_id = ? AND s.ended IS NULL").bind(carId).first();
      return { error: "taken", by: who?.name || "" };
    }
    throw e;
  }
  return { ok: true, car, from: cur || null };
}

// give the car back: by the driver (/oddaj), the cron (stale) or the owner (/zwolnij, /serwis)
export async function release(env, driverId, reason = "release") {
  const d = await db(env), car = await currentCar(env, driverId);
  if (!car) return null;
  await d.batch([
    d.prepare("UPDATE car_sessions SET ended = ?1, end_reason = ?2 WHERE driver_id = ?3 AND ended IS NULL").bind(Date.now(), reason, driverId),
    d.prepare("UPDATE drivers SET current_car_id = NULL WHERE id = ?").bind(driverId),
  ]);
  return car;
}
export async function releaseCar(env, carId, reason = "admin") {
  const d = await db(env);
  const s = await d.prepare("SELECT driver_id FROM car_sessions WHERE car_id = ? AND ended IS NULL").bind(carId).first();
  if (!s) return null;
  await release(env, s.driver_id, reason);
  return s.driver_id;
}

export async function addCar(env, c) {
  const id = "c_" + randomId(6);
  await (await db(env)).prepare("INSERT INTO cars (id, make, model, color, plate, seats, status, created) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)")
    .bind(id, c.make, c.model, c.color || "", c.plate, c.seats || 4, Date.now()).run();
  return id;
}
export async function updateCar(env, id, f) {
  const cols = ["make", "model", "color", "plate", "seats", "status", "note", "photo_key"].filter((k) => f[k] !== undefined);
  if (!cols.length) return;
  await (await db(env)).prepare(`UPDATE cars SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(", ")} WHERE id = ?${cols.length + 1}`)
    .bind(...cols.map((k) => f[k]), id).run();
}

// open sessions (for the cron: cars left checked out, and the report's "not released" list)
export async function openSessions(env) {
  const rs = await (await db(env)).prepare(
    `SELECT s.*, c.make, c.model, c.plate, d.name AS driver_name, d.chat_id, d.lat, d.ts, d.until, d.owner
       FROM car_sessions s JOIN cars c ON c.id = s.car_id JOIN drivers d ON d.id = s.driver_id WHERE s.ended IS NULL`).all();
  return rs.results || [];
}
// sessions that overlap [from, to) – who drove which car when (reports)
export async function sessionsBetween(env, fromMs, toMs) {
  const rs = await (await db(env)).prepare(
    `SELECT s.*, c.make, c.model, c.plate, d.name AS driver_name FROM car_sessions s
       JOIN cars c ON c.id = s.car_id LEFT JOIN drivers d ON d.id = s.driver_id
      WHERE s.started < ?2 AND (s.ended IS NULL OR s.ended >= ?1) ORDER BY s.started`).bind(fromMs, toMs).all();
  return rs.results || [];
}

// what a ride stores about the car (taken when the driver accepts / sets off)
export function vehicleSnapshot(car) {
  if (!car) return null;
  return { id: car.id, make: car.make || "", model: car.model || "", color: car.color || "", plate: car.plate || "", seats: car.seats || null, photo: !!car.photo_key };
}
