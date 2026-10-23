import { test } from "node:test";
import assert from "node:assert/strict";
import { price } from "../server/pricing.js";
import { parseRide } from "../server/phone.js";
import { CONFIG } from "../server/config.js";

test("price: fixed fare for a known destination from Przykładowo, tariff otherwise", () => {
  const knurow = { lat: CONFIG.center.lat, lng: CONFIG.center.lng };
  const d = CONFIG.destinations.find((x) => x.matchKm);
  const p = price(knurow, { lat: d.lat, lng: d.lng }, 50000);
  assert.equal(p.kind, "fixed"); assert.equal(p.amount, d.price + CONFIG.surcharge["0"]);
  const T = CONFIG.tariff, est = price({ lat: 51.5, lng: 19.5 }, { lat: 51.55, lng: 19.55 }, 10000);
  assert.deepEqual(est, { amount: Math.max(T.min, Math.round(T.start + T.per_km * 10)), kind: "estimate" });
  assert.equal(price({ lat: 51.5, lng: 19.5 }, { lat: 51.55, lng: 19.55 }, null), null);
  assert.equal(price({ lat: 51.5, lng: 19.5 }, { lat: 51.5, lng: 19.5 }, 300).amount, T.min);
});

test("parseRide: /kurs one-liner", () => {
  const r = parseRide("/kurs Rynek 1 Przykładowo > Lotnisko Pyrzowice, jutro 14:30, 600 100 200, Pani Ewa, 3 os", "2026-10-10T09:00");
  assert.equal(r.pickup, "Rynek 1 Przykładowo"); assert.equal(r.dest, "Lotnisko Pyrzowice");
  assert.equal(r.when, "2026-10-11T14:30"); assert.equal(r.phone.replace(/\D/g, ""), "600100200");
  assert.equal(r.pax, 3); assert.match(r.name, /Ewa/);
  const now = parseRide("/kurs Dworcowa 12 Przykładowo > Dworzec Gliwice, 600100200", "2026-10-10T09:00");
  assert.equal(now.when, null);
  assert.ok(parseRide("/kurs").error);
  assert.ok(parseRide("/kurs Rynek > Gliwice").error);   // no phone
});
