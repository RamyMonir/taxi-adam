import test from "node:test";
import assert from "node:assert/strict";
import { buildMessage, waLink, smsLink, isNight, validate, whenLabel, leadPayload, geoLink } from "../src/assets/lite-msg.js";

const NIGHT = { from: "22:00", to: "05:00" };
const noon = new Date(2026, 9, 21, 12, 0);
const full = { mode: "later", date: "2026-10-24", time: "04:30", from: "ul. Szpitalna 25, Knurów", to: "Lotnisko Katowice-Pyrzowice",
  geo: { lat: 50.2197, lng: 18.6767 }, pax: "3", luggage: "3–4 walizki", name: "Ewa", phone: "600 100 200", notes: "fotelik dla dziecka" };

test("message has every filled field, night note and location link", () => {
  const m = buildMessage(full, { site: "taxiknurowadam.pl", night: NIGHT, now: noon });
  assert.equal(m, [
    "Dzień dobry, chcę zamówić taxi (taxiknurowadam.pl)",
    "Kiedy: 24.10 (sob.) 04:30 (kurs nocny – rezerwacja)",
    "Skąd: ul. Szpitalna 25, Knurów",
    "Moja lokalizacja: https://maps.google.com/?q=50.21970,18.67670",
    "Dokąd: Lotnisko Katowice-Pyrzowice",
    "Osoby: 3 · Bagaż: 3–4 walizki",
    "Imię: Ewa · Telefon: 600 100 200",
    "Uwagi: fotelik dla dziecka",
  ].join("\n"));
});

test("empty optional fields are left out; empty addresses say (do ustalenia)", () => {
  const m = buildMessage({ mode: "now", phone: "600100200" }, { night: NIGHT, now: noon });
  assert.equal(m, "Dzień dobry, chcę zamówić taxi\nKiedy: teraz\nSkąd: (do ustalenia)\nDokąd: (do ustalenia)\nOsoby: 1\nTelefon: 600100200");
});

test("day-time 'later' ride has no night note", () => {
  assert.ok(!buildMessage({ ...full, time: "14:00" }, { night: NIGHT, now: noon }).includes("nocny"));
});

test("Polish characters are encoded in WhatsApp and SMS links", () => {
  const m = "Skąd: Gierałtowice, Żernica";
  const wa = waLink("48 570 762 777", m);
  assert.ok(wa.startsWith("https://wa.me/48570762777?text="));
  assert.ok(wa.includes("Giera%C5%82towice") && wa.includes("%C5%BBernica") && !/[ąłŻ ]/.test(wa));
  assert.equal(decodeURIComponent(wa.split("text=")[1]), m);
});

test("SMS separator: & on iPhone, ? on Android", () => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", android = "Mozilla/5.0 (Linux; Android 14; SM-S911B)";
  assert.ok(smsLink("+48570762777", "a b", ios).startsWith("sms:+48570762777&body=a%20b"));
  assert.ok(smsLink("+48570762777", "a b", android).startsWith("sms:+48570762777?body=a%20b"));
});

test("night window wraps over midnight", () => {
  assert.equal(isNight("22:00", NIGHT), true);
  assert.equal(isNight("23:59", NIGHT), true);
  assert.equal(isNight("04:59", NIGHT), true);
  assert.equal(isNight("05:00", NIGHT), false);
  assert.equal(isNight("21:59", NIGHT), false);
});

test("validation: phone required and at least 9 digits", () => {
  assert.equal(validate({ mode: "now" }, { now: noon }).field, "tel");
  assert.match(validate({ mode: "now", phone: "600 10" }, { now: noon }).msg, /min\. 9 cyfr/);
  assert.equal(validate({ mode: "now", phone: "600 100 200" }, { now: noon, night: NIGHT }), null);
});

test("validation: 'later' needs date and time in the future", () => {
  assert.equal(validate({ mode: "later", phone: "600100200" }, { now: noon }).field, "date");
  assert.equal(validate({ mode: "later", phone: "600100200", date: "2026-10-21" }, { now: noon }).field, "time");
  assert.match(validate({ mode: "later", phone: "600100200", date: "2026-10-21", time: "09:00" }, { now: noon }).msg, /minęła/);
  assert.equal(validate({ mode: "later", phone: "600100200", date: "2026-10-22", time: "09:00" }, { now: noon }), null);
});

test("validation: 'now' at night asks for a reservation", () => {
  const late = new Date(2026, 9, 21, 23, 15);
  assert.match(validate({ mode: "now", phone: "600100200" }, { now: late, night: NIGHT }).msg, /Kursy nocne \(22:00–5:00\)/);
});

test("date label and location link formatting", () => {
  assert.equal(whenLabel("2026-10-25", "18:05"), "25.10 (niedz.) 18:05");
  assert.equal(geoLink({ lat: "abc" }), "");
});

test("lead payload trims and caps fields, keeps the honeypot", () => {
  const p = leadPayload({ ...full, notes: "x".repeat(500), website: "spam" }, "wa", "/taxi-czerwionka/");
  assert.equal(p.channel, "wa");
  assert.equal(p.when, "2026-10-24T04:30");
  assert.equal(p.notes.length, 300);
  assert.equal(p.pax, 3);
  assert.deepEqual(p.geo, { lat: 50.2197, lng: 18.6767 });
  assert.equal(p.website, "spam");
});
