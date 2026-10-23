import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCarArgs, carLabel, carLong, vehicleSnapshot, isDemo } from "../server/cars.js";
import { canDrive } from "../server/fleet.js";

test("parseCarArgs: the owner's /dodajauto line", () => {
  assert.deepEqual(parseCarArgs("Toyota Corolla; biała; sgl 1a234; 4"), { make: "Toyota", model: "Corolla", color: "biała", plate: "SGL 1A234", seats: 4 });
  assert.deepEqual(parseCarArgs("Kia Ceed SW; srebrna; SK 4D123"), { make: "Kia", model: "Ceed SW", color: "srebrna", plate: "SK 4D123", seats: 4 });
  assert.equal(parseCarArgs("Skoda Octavia; czarna; 7").error, "plate");
  assert.equal(parseCarArgs("").error, "name");
  assert.equal(parseCarArgs("Toyota Camry; grafitowa; SK 3C890; 12").seats, 4);   // nonsense seats -> default
  assert.equal(parseCarArgs("Toyota Camry; x; SK<b>3C890; 4").plate, "SKB3C890");  // no markup in plates
});

test("labels and snapshot", () => {
  const c = { id: "c_1", make: "Hyundai", model: "i30", color: "niebieska", plate: "SK 5E456", seats: 5, photo_key: "cars/c_1.jpg" };
  assert.equal(carLabel(c), "Hyundai i30 · SK 5E456");
  assert.equal(carLong(c), "Hyundai i30 · niebieska · SK 5E456 · 5 miejsc");
  assert.equal(carLong({ ...c, seats: 4 }).endsWith("4 miejsca"), true);
  assert.deepEqual(vehicleSnapshot(c), { id: "c_1", make: "Hyundai", model: "i30", color: "niebieska", plate: "SK 5E456", seats: 5, photo: true });
  assert.equal(vehicleSnapshot(null), null);
  assert.ok(isDemo({ id: "demo_d1" }) && !isDemo({ id: "abc" }));
});

test("dispatch eligibility: needs a car (except the owner), live location, free, enough seats, not demo", () => {
  const live = { lat: 50.2, lng: 18.6, ts: Date.now(), until: Date.now() + 3600e3 };
  const busy = new Set(["busy1"]);
  assert.equal(canDrive({ id: "a", chat_id: "1", ...live, current_car_id: "c1", car_seats: 4 }, busy, 2), true);
  assert.equal(canDrive({ id: "a", chat_id: "1", ...live }, busy), false);                         // no car
  assert.equal(canDrive({ id: "owner", owner: 1, chat_id: "1", ...live }, busy), true);           // the owner
  assert.equal(canDrive({ id: "a", chat_id: "1", ...live, current_car_id: "c1", car_seats: 4 }, busy, 6), false);   // seats
  assert.equal(canDrive({ id: "busy1", chat_id: "1", ...live, current_car_id: "c1" }, busy), false);
  assert.equal(canDrive({ id: "demo_d1", chat_id: "-9000000001", ...live, current_car_id: "c1" }, busy), false);
  assert.equal(canDrive({ id: "a", chat_id: "1", lat: 1, lng: 1, ts: Date.now() - 3600e3, current_car_id: "c1" }, busy), false);   // not live
});
