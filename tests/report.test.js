import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReport, chunks, parsePeriod, parsePaid, warsawMidnight } from "../server/report.js";
import { OWNER, BRAND } from "../server/brand.js";

const at = (hhmm) => Date.parse(`2026-10-10T${hhmm}:00+02:00`);
const trip = (id, drv, name, car, carLabel, time, from, to, paid, method) => ({
  id, day: "2026-10-10", status: "done", mode: "now", source: "online", driver_id: drv, driver_name: name, car_id: car, car_label: carLabel,
  pickup: from, dest: to, price: paid, paid, method, started_at: at(time), ended_at: at(time) + 20 * 60000, km: 5, approach_km: 2,
});
const rows = [
  trip("a", "demo_d1", "Marek Nowak", "demo_c1", "Toyota Corolla · SGL 1A234", "07:40", "Rynek", "Dworzec Gliwice", 85, "gotówka"),
  trip("b", "demo_d1", "Marek Nowak", "demo_c1", "Toyota Corolla · SGL 1A234", "08:55", "Szpitalna", "Galeria Gliwice", 120, "karta"),
  trip("c", "demo_d2", "Katarzyna Wójcik", "demo_c2", "Škoda Octavia · SGL 2B567", "09:30", "Dworcowa", "Gierałtowice", 60, "gotówka"),
  trip("d", "owner", "Adam", "demo_c3", "Toyota Camry · SK 3C890", "13:10", "Knurów", "Uzdrowisko Goczałkowice", 180, "przelew"),
  { id: "e", day: "2026-10-10", status: "cancelled", driver_id: "demo_d1", price: 40 },
];
const drivers = [
  { id: "owner", name: "Adam", owner: 1 },
  { id: "demo_d1", name: "Marek Nowak", pay_model: "percent", driver_pct: 50 },
  { id: "demo_d2", name: "Katarzyna Wójcik", pay_model: "daily_fee", daily_fee: 120 },
];
const sessions = [
  { car_id: "demo_c1", driver_id: "demo_d1", driver_name: "Marek Nowak", make: "Toyota", model: "Corolla", plate: "SGL 1A234", started: at("07:12"), ended: at("11:58") },
  { car_id: "demo_c2", driver_id: "demo_d2", driver_name: "Katarzyna Wójcik", make: "Škoda", model: "Octavia", plate: "SGL 2B567", started: at("08:50"), ended: null },
];
const cars = [
  { id: "demo_c1", make: "Toyota", model: "Corolla", plate: "SGL 1A234", status: "active" },
  { id: "demo_c2", make: "Škoda", model: "Octavia", plate: "SGL 2B567", status: "active" },
  { id: "demo_c3", make: "Toyota", model: "Camry", plate: "SK 3C890", status: "active" },
  { id: "demo_c5", make: "Hyundai", model: "i30", plate: "SK 5E456", status: "service", note: "wymiana klocków" },
];
const cfg = { default_driver_pct: 50, default_daily_fee: 120, cash_methods: ["gotówka"] };

test("owner report: totals, every ride with driver + car, settlement per driver, cars", () => {
  const rep = renderReport({ from: "2026-10-10", to: "2026-10-10", rows, drivers, sessions, cars, cfg });
  const t = rep.text;
  assert.match(t, /RAPORT – CAŁA FIRMA: sob\. 10\.10\.2026/);
  assert.match(t, /Utarg brutto: 445,00 zł/);
  assert.match(t, /gotówka 145,00 zł · 💳 karta \/ BLIK \/ przelew 300,00 zł/);
  assert.match(t, /07:40 <b>Marek<\/b> · Rynek → Dworzec Gliwice · 85,00 zł 💵 · Toyota Corolla · SGL 1A234/);
  assert.match(t, /Marek Nowak<\/b> · 50% dla kierowcy · 2 kursy/);
  assert.match(t, new RegExp(`kierowca 102,50 zł · firma 102,50 zł → <b>💸 ${OWNER.nom} dopłaca: 17,50 zł</b>`));
  // daily fee 120 zł, only 60 zł in cash: she hands in the 60 zł and owes 60 zł more
  assert.match(t, /kierowca −60,00 zł · firma 120,00 zł → <b>💵 Katarzyna oddaje 120,00 zł<\/b>/);
  assert.match(t, /Hyundai i30 · SK 5E456 – 🔧 w serwisie: wymiana klocków/);
  assert.match(t, /Niezwolnione: Škoda Octavia \(Katarzyna\)/);
  assert.match(t, /anulowane 1/);
  assert.equal(rep.settlements.length, 2);
  assert.ok(!/<script/i.test(t));
});

test("driver summary: only his rides, his cars, share and hand-in", () => {
  const rep = renderReport({ from: "2026-10-10", to: "2026-10-10", rows, drivers, sessions, cfg, driverId: "demo_d1" });
  const t = rep.text;
  assert.match(t, /TWÓJ RAPORT – Marek Nowak/);
  assert.match(t, /Kursy zrealizowane: 2/);
  assert.match(t, /Auta: Toyota Corolla SGL 1A234 \(07:12–11:58\)/);
  assert.match(t, /gotówka u Ciebie: 85,00 zł/);
  assert.match(t, /Twój udział \(50%\): 102,50 zł/);
  assert.match(t, /Firma dopłaca Ci: 17,50 zł/);
  assert.ok(!/Gierałtowice/.test(t));
});

test("names typed in Telegram are escaped", () => {
  const evil = [{ ...rows[0], driver_name: "<b>x</b>", car_label: "<img src=x>", pickup: "<script>" }];
  const t = renderReport({ from: "2026-10-10", to: "2026-10-10", rows: evil, drivers: [{ id: "demo_d1", name: "<i>Zły</i>" }], cfg }).text;
  assert.ok(!t.includes("<script>") && !t.includes("<img") && !t.includes("<i>Zły"));
});

test("CSV has car, cash and share columns", () => {
  const csv = renderReport({ from: "2026-10-10", to: "2026-10-10", rows, drivers, cfg }).csv;
  const [head, first] = csv.replace("\uFEFF", "").split("\r\n");
  assert.ok(head.includes("Auto") && head.includes("Gotówka u kierowcy") && head.includes("Udział kierowcy"));
  assert.ok(first.includes("Toyota Corolla · SGL 1A234") && first.includes(";85;") );
});

test("chunks keep Telegram messages under the limit", () => {
  const long = Array.from({ length: 400 }, (_, i) => `linia ${i} ` + "x".repeat(30)).join("\n");
  const parts = chunks(long, 3800);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 3800));
  assert.equal(parts.join("\n"), long);
});

test("parsePeriod / parsePaid / warsawMidnight", () => {
  assert.deepEqual(parsePeriod("", "2026-10-10"), { from: "2026-10-10", to: "2026-10-10" });
  assert.deepEqual(parsePeriod("tydzień", "2026-10-10"), { from: "2026-10-05", to: "2026-10-10" });
  assert.deepEqual(parsePeriod("zeszły miesiąc", "2026-10-10"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(parsePeriod("15.10-01.10", "2026-10-10"), { from: "2026-10-01", to: "2026-10-15" });
  assert.equal(parsePeriod("bzdura", "2026-10-10"), null);
  assert.deepEqual(parsePaid("120,50 blik"), { amount: 120.5, method: "BLIK" });
  assert.deepEqual(parsePaid("85 zł karta"), { amount: 85, method: "karta" });
  assert.equal(parsePaid("dzięki"), null);
  assert.equal(warsawMidnight("2026-10-10"), Date.parse("2026-10-09T22:00:00Z"));
  assert.equal(warsawMidnight("2026-12-01"), Date.parse("2026-11-30T23:00:00Z"));
});
