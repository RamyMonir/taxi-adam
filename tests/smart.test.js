// "Kto jedzie?" ranking (pure part), when a busy driver is free, Polish local time, and the checks on the AI's answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankTeam, freeAtOf } from "../server/fleet.js";
import { warsawMs, nowWarsaw } from "../server/util.js";
import { normalize, missingOf } from "../server/ai.js";

const NOW = Date.now(), H = 3600e3;
const pickup = { address: "Rynek 1, Knurów", lat: 50.2197, lng: 18.6767 };
const drv = (id, name, lat, extra = {}) => ({ id, name, chat_id: "c" + id, lat, lng: 18.68, ts: NOW, until: NOW + 8 * H, current_car_id: "car" + id, car_model: "Touran", car_seats: 4, ...extra });
const owner = { id: "owner", name: "Adam", owner: 1, chat_id: "999", lat: null, lng: null };
const ride = (r) => ({ id: "new", mode: "now", status: "draft", data: { pickup, pax: 1, durationS: 1000, ...r } });
const local = (ms) => nowWarsaw((ms - Date.now()) / 60000);

test("free drivers sorted by Google drive time (not the straight line), best = ⭐", () => {
  const near = drv("a", "Marek", 50.222), far = drv("b", "Kasia", 50.25);
  // Marek is closer in a straight line but stuck in traffic: Google says Kasia is faster
  const a = rankTeam({ all: [owner, near, far], busy: new Set(), open: [], r: ride(), etas: { a: { durationS: 900 }, b: { durationS: 300 } }, now: NOW });
  assert.deepEqual(a.free.map((w) => w.x.name), ["Kasia", "Marek"]);
  assert.equal(a.best.x.name, "Kasia");
  assert.equal(a.free[0].approx, false);
});

test("off duty, no car, too few seats and on a ride are not 'free'", () => {
  const all = [owner, drv("a", "Marek", 50.222), drv("b", "Kasia", 50.23, { until: NOW - 1000 }), drv("c", "Tomek", 50.23, { current_car_id: null }),
               drv("d", "Paweł", 50.23, { car_seats: 4 }), drv("e", "Ola", 50.3)];
  const going = { id: "g", status: "ontrip", eta_at: null, data: { driverId: "e", startedAt: NOW - 5 * 60000, durationS: 1200, dest: { lat: 50.23, lng: 18.68 }, pickup } };
  const a = rankTeam({ all, busy: new Set(["e"]), open: [going], r: ride({ pax: 6 }), now: NOW });
  assert.deepEqual(a.free.map((w) => w.x.name), []);   // pax 6: Marek and Paweł have 4 seats
  assert.deepEqual(a.seatsShort.map((w) => w.x.name).sort(), ["Marek", "Paweł"]);
  assert.deepEqual(a.off.map((w) => w.x.name).sort(), ["Kasia", "Tomek"]);
  assert.equal(a.onRide[0].x.name, "Ola");
  assert.ok(Math.abs(a.onRide[0].freeAt - (NOW + 15 * 60000)) < 1000, "free when the trip ends");
  assert.ok(a.onRide[0].atPickup > a.onRide[0].freeAt);
  assert.equal(a.best, null);
});

test("a reservation that would collide pushes the driver down and is flagged", () => {
  const m = drv("a", "Marek", 50.222), k = drv("b", "Kasia", 50.25);
  const resv = { id: "r1", status: "scheduled", data: { driverId: "a", when: local(NOW + 30 * 60000), durationS: 3600, pickup, dest: pickup } };
  const a = rankTeam({ all: [owner, m, k], busy: new Set(), open: [resv], r: ride(), etas: { a: { durationS: 200 }, b: { durationS: 600 } }, now: NOW });
  assert.equal(a.best.x.name, "Kasia");
  assert.equal(a.free[1].x.name, "Marek");
  assert.ok(a.free[1].clash, "Marek's reservation in 30 min collides with a ~27 min job");
});

test("a reservation: everyone in the team can take it unless he drives at that time", () => {
  const m = drv("a", "Marek", 50.222, { until: NOW - 1 }), k = drv("b", "Kasia", 50.25);
  const when = local(NOW + 24 * H);
  const other = { id: "r1", status: "scheduled", data: { driverId: "b", when, durationS: 3600, pickup, dest: pickup } };
  const a = rankTeam({ all: [owner, m, k], busy: new Set(["b"]), open: [other], r: { id: "new", mode: "later", status: "draft", data: { pickup, when, durationS: 1800 } }, now: NOW });
  assert.equal(a.later, true);
  assert.equal(a.best.x.name, "Marek", "off duty now is fine for tomorrow");
  assert.ok(a.free.find((w) => w.x.name === "Kasia").clash);
});

test("a driver finishing nearby beats everyone free -> 💡 hint", () => {
  const far = drv("b", "Kasia", 50.4);
  const going = { id: "g", status: "ontrip", data: { driverId: "e", startedAt: NOW - 15 * 60000, durationS: 1000, dest: { lat: 50.2199, lng: 18.677 }, pickup } };
  const a = rankTeam({ all: [owner, far, drv("e", "Ola", 50.3)], busy: new Set(["e"]), open: [going], r: ride(), etas: { b: { durationS: 1800 } }, now: NOW });
  assert.equal(a.soon && a.soon.x.name, "Ola");
});

test("freeAtOf: on the way / waiting / on the trip", () => {
  const d = { durationS: 600 };
  assert.ok(Math.abs(freeAtOf({ status: "enroute", eta_at: NOW + 5 * 60000, data: d }, NOW) - (NOW + 17 * 60000)) < 1000);
  assert.ok(Math.abs(freeAtOf({ status: "arrived", data: d }, NOW) - (NOW + 13 * 60000)) < 1000);
  assert.ok(Math.abs(freeAtOf({ status: "ontrip", data: { ...d, liveEtaAt: NOW + 4 * 60000 } }, NOW) - (NOW + 4 * 60000)) < 1000);
  assert.ok(freeAtOf({ status: "ontrip", data: { ...d, startedAt: NOW - H } }, NOW) >= NOW + 60000, "never in the past");
});

test("warsawMs: Polish local time, summer and winter", () => {
  assert.equal(new Date(warsawMs("2026-07-01T12:00")).toISOString(), "2026-07-01T10:00:00.000Z");
  assert.equal(new Date(warsawMs("2026-12-01T12:00")).toISOString(), "2026-12-01T11:00:00.000Z");
});

test("normalize: the AI's answer is checked, not trusted", () => {
  const now = "2026-10-12T10:00";
  const p = normalize({ is_ride: true, pickup: " Rynek 1, Knurów ", dest: "Dworzec PKP Gliwice", when: "2026-10-12T09:00", phone: "600 100 200",
                        name: "Pani Ewa", pax: 40, luggage: "", flight: "fr 1234", notes: "" }, now);
  assert.equal(p.when, null, "a time in the past = now");
  assert.equal(p.phone, "600100200");
  assert.equal(p.pax, 8);
  assert.equal(p.flight, "FR1234");
  assert.equal(p.pickup, "Rynek 1, Knurów");
  assert.equal(normalize({ when: "jutro", phone: "123", pax: "x" }, now).when, null);
  assert.equal(normalize({ when: "2026-10-13T05:30", phone: "+48 600 100 200" }, now).when, "2026-10-13T05:30");
  assert.deepEqual(missingOf(normalize({ pickup: "Rynek 1", phone: "600100200" }, now)), ["dokąd"]);
});
