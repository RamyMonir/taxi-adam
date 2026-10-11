import { test } from "node:test";
import assert from "node:assert/strict";
import { planFleetSync, planIsEmpty, plateKey, fileCarId, fileDriverId, payFields } from "../server/fleetsync.js";
import { CONFIG } from "../server/config.js";

const file = {
  cars: [{ plate: "SGL 1A234", make: "Toyota", model: "Corolla", color: "biała", seats: 4 },
         { plate: "sgl  2b567", make: "Škoda", model: "Octavia", color: "czarna", seats: 4 }],
  drivers: [{ key: "k1", name: "Marek Nowak", phone: "+48 500 000 001", pay: { percent: 50 } },
            { key: "k2", name: "Kasia", phone: "", pay: { daily_fee: 120 } }],
};

test("fleet file in the build: 5 cars, 4 drivers, a hash", () => {
  assert.equal(CONFIG.fleet.cars.length, 5);
  assert.equal(CONFIG.fleet.drivers.length, 4);
  assert.match(CONFIG.fleet.hash, /^[0-9a-f]{12}$/);
  assert.equal(new Set(CONFIG.fleet.cars.map((c) => plateKey(c.plate))).size, 5, "plates are unique");
});

test("first sync: everything is added, with stable ids", () => {
  const p = planFleetSync(file, [], []);
  assert.deepEqual(p.addCars.map((c) => c.id), ["f_sgl1a234", "f_sgl2b567"]);
  assert.equal(p.addCars[1].plate, "SGL 2B567", "plate normalised");
  assert.deepEqual(p.addDrivers.map((d) => d.id), ["f_k1", "f_k2"]);
  assert.equal(p.addDrivers[0].pay_model, "percent"); assert.equal(p.addDrivers[0].driver_pct, 50);
  assert.equal(p.addDrivers[1].pay_model, "daily_fee"); assert.equal(p.addDrivers[1].daily_fee, 120);
  assert.equal(p.addDrivers[1].phone, null, "empty phone -> null (customer calls the company)");
});

const asRows = (p) => ({
  cars: p.addCars.map((c) => ({ ...c, status: "active" })),
  drivers: p.addDrivers.map((d) => ({ ...d, active: 1, owner: 0 })),
});

test("second sync with the same file: nothing to do", () => {
  const { cars, drivers } = asRows(planFleetSync(file, [], []));
  assert.ok(planIsEmpty(planFleetSync(file, cars, drivers)));
});

test("edits: colour, seats, name, pay -> updates; removed -> retired; re-added -> reactivated", () => {
  const { cars, drivers } = asRows(planFleetSync(file, [], []));
  const edited = {
    cars: [{ ...file.cars[0], color: "srebrna", seats: 5 }],                       // Octavia removed
    drivers: [{ ...file.drivers[0], name: "Marek N.", pay: null }],                 // Kasia removed
  };
  const p = planFleetSync(edited, cars, drivers);
  assert.deepEqual(p.updateCars, [{ id: "f_sgl1a234", fields: { color: "srebrna", seats: 5 } }]);
  assert.deepEqual(p.retireCars, ["f_sgl2b567"]);
  assert.deepEqual(p.updateDrivers, [{ id: "f_k1", fields: { name: "Marek N.", pay_model: null, driver_pct: null } }]);
  assert.deepEqual(p.retireDrivers, ["f_k2"]);
  const back = planFleetSync(file, cars.map((c) => (c.id === "f_sgl2b567" ? { ...c, status: "inactive" } : c)), drivers);
  assert.deepEqual(back.updateCars, [{ id: "f_sgl2b567", fields: { status: "active" } }]);
});

test("a car added by hand (/dodajauto) with the same plate is the same car, not a duplicate", () => {
  const manual = [{ id: "c_abc123", make: "Toyota", model: "Corolla", color: "biała", plate: "SGL 1A234", seats: 4, status: "active" }];
  const p = planFleetSync({ cars: [file.cars[0]], drivers: [] }, manual, []);
  assert.equal(p.addCars.length, 0); assert.equal(p.updateCars.length, 0); assert.equal(p.retireCars.length, 0);
  // cars/drivers not from the file (no "f_" id) are never retired by the sync
  const p2 = planFleetSync({ cars: [], drivers: [] }, manual, [{ id: "owner", active: 1, owner: 1 }, { id: "x7k2pa", active: 1 }]);
  assert.ok(planIsEmpty(p2));
});

test("a file driver Adam removed in Telegram (🗑) stays removed after the next sync", () => {
  const { cars, drivers } = asRows(planFleetSync(file, [], []));
  const after = drivers.map((d) => (d.id === "f_k2" ? { ...d, active: 0 } : d));
  const edited = { ...file, drivers: file.drivers.map((d) => ({ ...d, name: d.name + "!" })) };
  const p = planFleetSync(edited, cars, after, new Set(["f_k2"]));
  assert.deepEqual(p.updateDrivers.map((u) => u.id), ["f_k1"], "only Marek is updated, Kasia is not reactivated");
  assert.equal(p.retireDrivers.length, 0);
  assert.ok(planFleetSync(edited, cars, after).updateDrivers.some((u) => u.id === "f_k2" && u.fields.active === 1), "without the mark she would come back");
});

test("helpers", () => {
  assert.equal(plateKey(" sgl-1a 234 "), "SGL1A234");
  assert.equal(fileCarId("SGL 1A234"), "f_sgl1a234");
  assert.equal(fileDriverId("K 1"), "f_k1");
  assert.deepEqual(payFields(null), { pay_model: null, driver_pct: null, daily_fee: null });
});
