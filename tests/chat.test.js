// Chat between the customer and the taxi side (server/chat.js): validation, open window, routing, what the customer sees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, chatOpen, routeOf, publicMessage, systemLine, canAnswer, taxiText, MAX_LEN, PER_MINUTE } from "../server/chat.js";
import { hit } from "../server/ratelimit.js";
import { OWNER, BRAND } from "../server/brand.js";

const env = { TELEGRAM_CHAT_ID: "999" };
const ride = (status, data = {}, extra = {}) => ({ id: "abcdef123456", status, updated: Date.now(), data: { pickup: { address: "Rynek 1, Przykładowo" }, ...data }, ...extra });

test("message text: HTML stripped, control characters out, 1–500 characters", () => {
  assert.deepEqual(cleanText("  <b>Jestem</b> przed <script>x</script>budynkiem  "), { text: "Jestem przed xbudynkiem" });
  assert.deepEqual(cleanText("a\r\n\r\n\r\n\r\nb"), { text: "a\n\nb" });
  assert.equal(cleanText("\u200B \u202E ").error, "empty");
  assert.equal(cleanText("").error, "empty");
  assert.equal(cleanText(123).error, "empty");
  assert.equal(cleanText("x".repeat(MAX_LEN)).text.length, MAX_LEN);
  assert.equal(cleanText("x".repeat(MAX_LEN + 1)).error, "long");
  assert.equal(cleanText("😀".repeat(MAX_LEN)).text.length, MAX_LEN * 2, "counted in characters, not UTF-16 units");
});

test("chat window: open rides, then 2 hours after the end; drafts never", () => {
  const now = Date.now();
  for (const st of ["pending", "scheduled", "enroute", "arrived", "ontrip"]) assert.equal(chatOpen(ride(st), env, now), true, st);
  assert.equal(chatOpen(ride("done", {}, { updated: now - 119 * 60000 }), env, now), true);
  assert.equal(chatOpen(ride("done", {}, { updated: now - 121 * 60000 }), env, now), false);
  assert.equal(chatOpen(ride("cancelled", {}, { updated: now - 3 * 3600e3 }), env, now), false);
  assert.equal(chatOpen(ride("draft"), env, now), false);
  assert.equal(chatOpen(null, env, now), false);
  assert.equal(chatOpen(ride("done", {}, { updated: now - 2 * 60000 }), { CHAT_CLOSE_MIN: "1" }, now), false, "CHAT_CLOSE_MIN for tests");
});

test("routing: no driver -> the owner; assigned driver -> his chat; the owner driving himself -> the owner", () => {
  assert.deepEqual(routeOf(ride("pending"), env), { chat: "999", sender: "owner" });
  assert.deepEqual(routeOf(ride("enroute", { driverId: "f_k1", chat: "4101" }), env), { chat: "4101", sender: "driver" });
  assert.deepEqual(routeOf(ride("enroute", { driverId: "owner", chat: "999" }), env), { chat: "999", sender: "owner" });
});

test("what the customer sees: no Telegram ids, signed Kierowca / Taxi the owner", () => {
  const row = { id: 7, sender: "driver", text: "Jadę", created_at: 1, tg_chat_id: "4101", tg_message_id: 55 };
  const p = publicMessage(row);
  assert.deepEqual(p, { id: 7, from: "taxi", who: "Kierowca", text: "Jadę", at: 1 });
  assert.equal(publicMessage({ ...row, sender: "owner" }).who, BRAND.short);
  assert.equal(publicMessage({ ...row, sender: "customer" }).from, "me");
  assert.equal(publicMessage({ ...row, sender: "system" }).from, "system");
  assert.ok(!JSON.stringify(p).includes("4101"));
});

test("system lines per status (one kind each)", () => {
  assert.match(systemLine(ride("enroute", {}, { eta_at: Date.parse("2026-10-14T12:30:00Z") })).text, /^Kierowca przyjął kurs – będzie ok\. \d\d:\d\d$/);
  assert.equal(systemLine(ride("arrived")).text, "Kierowca jest na miejscu");
  assert.equal(systemLine(ride("done")).kind, "st:done");
  assert.equal(systemLine(ride("cancelled", { cancelledBy: "driver" })).text, "Kierowca anulował kurs");
  assert.equal(systemLine(ride("pending")), null);
});

test("who may answer: the owner always, a driver only on his own ride", () => {
  const r = ride("enroute", { driverId: "f_k1", chat: "4101" });
  assert.equal(canAnswer(r, { id: "owner", owner: 1 }), true);
  assert.equal(canAnswer(r, { id: "f_k1" }), true);
  assert.equal(canAnswer(r, { id: "f_k2" }), false);
  assert.equal(canAnswer(ride("pending"), { id: "f_k1" }), false);
});

test("Telegram text escapes the customer's text", () => {
  const t = taxiText(ride("pending", { phone: "600100200", name: "Ewa" }), "<b>hej</b> & co");
  assert.match(t, /^💬 <b>Klient<\/b> · kurs #abcdef · Rynek 1/);
  assert.ok(t.includes("&lt;b&gt;hej&lt;/b&gt; &amp; co"));
  assert.ok(t.includes("Odpowiedz na tę wiadomość"));
});

test("rate limit: 10 messages a minute per ride, the 11th is refused", async () => {
  const counts = new Map();
  const fakeEnv = { DB: { prepare: (sql) => ({ bind: (k) => ({
    first: async () => { if (!/RETURNING n/.test(sql)) return null; counts.set(k, (counts.get(k) || 0) + 1); return { n: counts.get(k) }; },
    run: async () => ({}) }), run: async () => ({}) }) } };
  const now = 1_800_000_000_000;
  const results = [];
  for (let i = 0; i < PER_MINUTE + 1; i++) results.push((await hit(fakeEnv, "chat", "abcdef123456", { limit: PER_MINUTE, windowS: 60, now })).allowed);
  assert.deepEqual(results, [...Array(PER_MINUTE).fill(true), false]);
  assert.equal((await hit(fakeEnv, "chat", "other", { limit: PER_MINUTE, windowS: 60, now })).allowed, true, "per ride");
});
