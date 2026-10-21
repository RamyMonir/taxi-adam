// LITE backend: request log, owner panel (PIN, lockout, sessions, report, CSV) and the price editor (GitHub mocked).
// The panel router reads server/config.js, which the build writes – these tests need a LITE build (py src/build.py).
import test from "node:test";
import assert from "node:assert/strict";
import { d1 } from "./d1-sqlite.js";
import { cleanLead, insertLead, report, period, toCsv, csvCell, groupKey, deleteOld, _resetForTests } from "../server/leads.js";
import { pinHash, login, sessionOk } from "../server/panel.js";
import { checkPrices, diffPrices, mergeEdit, pricesText } from "../server/prices.js";
import { b64encode, b64decode, writePrices } from "../server/github.js";
import { CONFIG } from "../server/config.js";
import { onRequestPost as leadApi } from "../functions/api/lead.js";
import { onRequest as panelApi } from "../functions/api/panel/[[path]].js";
import { onRequest as middleware } from "../functions/_middleware.js";

const lite = !!CONFIG.lite;
const SALT = "00112233445566778899aabbccddeeff";
async function env(extra = {}) {
  _resetForTests();
  return { DB: d1(), LEAD_SALT: "s", PANEL_SLUG: "tajnyLink123", PANEL_PIN_SALT: SALT, PANEL_PIN_HASH: await pinHash("246810", SALT), ...extra };
}
const req = (url, opts = {}) => new Request("https://taxi.test" + url, { ...opts, headers: { "sec-fetch-site": "same-origin", "cf-connecting-ip": "1.2.3.4", ...(opts.headers || {}) } });
const post = (url, body, headers = {}) => req(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const call = (e, path, r) => panelApi({ request: r, env: e, params: { path: path.split("/") }, waitUntil: () => {} });

test("cleanLead: honeypot, channel, caps and geo", () => {
  assert.equal(cleanLead({ channel: "wa", website: "x" }), null);
  assert.equal(cleanLead({ channel: "fax" }), null);
  assert.equal(cleanLead([1]), null);
  const r = cleanLead({ channel: "sms", mode: "later", when: "2026-10-24T04:30", from: " a\n b ", to: "x".repeat(400), pax: 99, geo: { lat: 50.1, lng: 18.2 } });
  assert.equal(r.from_txt, "a b"); assert.equal(r.to_txt.length, 160); assert.equal(r.pax, 9); assert.equal(r.geo, "50.10000,18.20000");
  assert.equal(cleanLead({ channel: "tel", when: "jutro", geo: { lat: 500, lng: 1 } }).when_at, null);
});

test("lead API: stores a tap, drops spam and foreign sites, always 204", async () => {
  const e = await env();
  const ok = await leadApi({ request: post("/api/lead", { channel: "wa", from: "Szpitalna 25", to: "Pyrzowice", phone: "600100200" }), env: e });
  assert.equal(ok.status, 204);
  await leadApi({ request: post("/api/lead", { channel: "wa", website: "bot" }), env: e });
  await leadApi({ request: post("/api/lead", { channel: "wa" }, { "sec-fetch-site": "cross-site" }), env: e });
  await leadApi({ request: post("/api/lead", { channel: "wa", notes: "x".repeat(5000) }), env: e });
  const n = (await e.DB.prepare("SELECT COUNT(*) AS n FROM leads").first()).n;
  assert.equal(n, 1);
  assert.equal((await leadApi({ request: post("/api/lead", { channel: "wa" }), env: {} })).status, 204, "no database: still 204");
});

test("lead API: rate limit 20 per hour per device", async () => {
  const e = await env();
  for (let i = 0; i < 25; i++) await leadApi({ request: post("/api/lead", { channel: "tel" }), env: e });
  assert.equal((await e.DB.prepare("SELECT COUNT(*) AS n FROM leads").first()).n, 20);
});

test("report: Polish day bounds, channels, top destinations grouped", async () => {
  const e = await env();
  const at = (s) => Date.parse(s);
  await insertLead(e, cleanLead({ channel: "wa", to: "Lotnisko Pyrzowice", from: "ul. Szpitalna 25, Knurów" }), "h", at("2026-10-20T22:30:00Z"));   // 21.10 00:30 in Poland
  await insertLead(e, cleanLead({ channel: "sms", to: "lotnisko pyrzowice", from: "Szpitalna 25 Knurów" }), "h", at("2026-10-21T10:00:00Z"));
  await insertLead(e, cleanLead({ channel: "tel", to: "Balice" }), "h", at("2026-10-21T21:59:00Z"));                                           // 21.10 23:59
  await insertLead(e, cleanLead({ channel: "wa", to: "Balice" }), "h", at("2026-10-21T22:01:00Z"));                                            // 22.10 00:01
  const r = await report(e, { from: "2026-10-21", to: "2026-10-21" });
  assert.equal(r.total, 3);
  assert.deepEqual(r.byChannel, { wa: 1, sms: 1, tel: 1 });
  assert.equal(r.topTo[0].n, 2);
  assert.equal(r.topFrom[0].n, 2);
  assert.equal(groupKey("ul. Szpitalna 25, Knurów"), groupKey("Szpitalna 25 Knurów"));
});

test("period presets", () => {
  assert.deepEqual(period("dzis", "2026-10-21"), { from: "2026-10-21", to: "2026-10-21" });
  assert.deepEqual(period("tydzien", "2026-10-21"), { from: "2026-10-19", to: "2026-10-21" });   // Wednesday -> Monday
  assert.deepEqual(period("miesiac", "2026-10-21"), { from: "2026-10-01", to: "2026-10-21" });
  assert.deepEqual(period({ from: "2026-10-05", to: "2026-10-01" }, "2026-10-21"), { from: "2026-10-21", to: "2026-10-21" }, "reversed range -> today");
});

test("CSV: BOM, semicolons, formula injection blocked", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("a;b"), '"a;b"');
  const csv = toCsv([{ ts: Date.parse("2026-10-21T10:00:00Z"), channel: "wa", mode: "now", from_txt: "Knurów", to_txt: "@evil", pax: 2, name: "Ewa", phone: "+48600", status: "ok" }]);
  assert.ok(csv.startsWith("﻿Kliknięto;Kanał"));
  assert.ok(csv.includes(";'@evil;") && csv.includes(";'+48600;") && csv.includes("przyjęty"));
});

test("retention: rows older than 12 months are deleted", async () => {
  const e = await env(), now = Date.parse("2026-10-21T12:00:00Z");
  await insertLead(e, cleanLead({ channel: "wa" }), "h", now - 366 * 864e5);
  await insertLead(e, cleanLead({ channel: "wa" }), "h", now - 10 * 864e5);
  await deleteOld(e, now);
  assert.equal((await e.DB.prepare("SELECT COUNT(*) AS n FROM leads").first()).n, 1);
});

test("PIN: PBKDF2 hash is stable; wrong slug, wrong PIN, lockout after 5", async () => {
  const e = await env();
  assert.equal(await pinHash("246810", SALT), await pinHash("246810", SALT));
  assert.notEqual(await pinHash("246811", SALT), await pinHash("246810", SALT));
  assert.equal((await login(e, { slug: "zly", pin: "246810" }, "ip1")).error, "slug");
  for (let i = 0; i < 4; i++) assert.equal((await login(e, { slug: "tajnyLink123", pin: "000000" }, "ip1")).error, "pin");
  assert.equal((await login(e, { slug: "tajnyLink123", pin: "000000" }, "ip1")).left, 0);
  assert.equal((await login(e, { slug: "tajnyLink123", pin: "246810" }, "ip1")).error, "locked", "correct PIN is refused while locked");
  assert.ok((await login(e, { slug: "tajnyLink123", pin: "246810" }, "ip2")).ok, "another device can still log in");
  assert.equal((await login({ DB: e.DB }, { slug: "x", pin: "1" }, "ip")).error, "setup");
});

test("session: cookie works, expires after 12 h", async () => {
  const e = await env(), t = Date.parse("2026-10-21T12:00:00Z");
  const r = await login(e, { slug: "tajnyLink123", pin: "246810" }, "ip", t);
  const sid = /ps=([a-z0-9]{40})/.exec(r.cookie)[1];
  const withCookie = req("/api/panel/report", { headers: { cookie: "ps=" + sid } });
  assert.equal(await sessionOk(e, withCookie, t + 3600e3), true);
  assert.equal(await sessionOk(e, withCookie, t + 13 * 3600e3), false);
  assert.equal(await sessionOk(e, req("/api/panel/report"), t), false);
  assert.match(r.cookie, /HttpOnly; Secure; SameSite=Strict/);
});

const KNOWN = { villages: ["knurow", "czerwionka"], destinations: ["lotnisko-pyrzowice"], zones: ["0", "A", "B"] };
const P0 = { version: 3, zones: { 0: 0, A: 10, B: 20 }, local: { knurow: 15, czerwionka: 40 }, village_zone: { knurow: "0", czerwionka: "B" },
  destinations: { "lotnisko-pyrzowice": { price: 170, confirmed: true } }, overrides: {}, waiting: { free_min: null, per_min: null },
  tariff: { start: 9, per_km: 3, min: 15 } };
const NAMES = { villages: { knurow: "Knurów", czerwionka: "Czerwionka" }, destinations: { "lotnisko-pyrzowice": "Pyrzowice" } };

test("prices: validation rules", () => {
  assert.deepEqual(checkPrices(P0, KNOWN), []);
  assert.ok(checkPrices({ ...P0, local: { knurow: 2, czerwionka: 40 } }, KNOWN).some((x) => x.startsWith("local.knurow")));
  assert.ok(checkPrices({ ...P0, overrides: { warszawa: { "lotnisko-pyrzowice": 200 } } }, KNOWN).length);
  assert.ok(checkPrices({ ...P0, waiting: { free_min: 90, per_min: 1 } }, KNOWN).some((x) => x.startsWith("waiting.free_min")));
  assert.ok(checkPrices({ ...P0, destinations: {} }, KNOWN).some((x) => x.includes("brak ceny")));
});

test("prices: merge an edit, bump version, describe changes", () => {
  const next = mergeEdit(P0, { local: { knurow: "20" }, overrides: { czerwionka: { "lotnisko-pyrzowice": "220" } }, waiting: { free_min: "10", per_min: "1" },
    destinations: { "lotnisko-pyrzowice": "170" } });
  assert.equal(next.version, 4);
  assert.equal(next.local.knurow, 20);
  assert.deepEqual(next.overrides, { czerwionka: { "lotnisko-pyrzowice": 220 } });
  assert.equal(P0.local.knurow, 15, "original untouched");
  assert.deepEqual(diffPrices(P0, next, NAMES), ["Kurs lokalny Knurów: 15 zł → 20 zł", "Czerwionka → Pyrzowice: – → 220 zł",
    "Oczekiwanie gratis: – → 10 min", "Oczekiwanie za minutę: – → 1 zł"]);
  assert.deepEqual(checkPrices(next, KNOWN), []);
  const removed = mergeEdit(next, { overrides: {} });
  assert.match(diffPrices(next, removed, NAMES)[0], /usunięty wyjątek/);
});

test("github: base64 keeps Polish letters; 409 = conflict", async () => {
  assert.equal(b64decode(b64encode("Żernica – Gierałtowice")), "Żernica – Gierałtowice");
  const r = await writePrices({ GITHUB_TOKEN: "t", GITHUB_REPO: "o/r", GITHUB_BRANCH: "b" }, { text: "{}", sha: "x", message: "m" }, async () => new Response("", { status: 409 }));
  assert.deepEqual(r, { conflict: true });
});

test("panel API: login → report → CSV → status → logout", { skip: !lite && "needs a LITE build (py src/build.py)" }, async () => {
  const e = await env();
  await insertLead(e, cleanLead({ channel: "wa", to: "Pyrzowice", phone: "600100200" }), "h");
  assert.equal((await call(e, "report", req("/api/panel/report"))).status, 401);
  assert.equal((await call(e, "login", post("/api/panel/login", { slug: "zly", pin: "246810" }))).status, 404);
  const ok = await call(e, "login", post("/api/panel/login", { slug: "tajnyLink123", pin: "246810" }));
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie").split(";")[0];
  const rep = await (await call(e, "report", req("/api/panel/report?p=dzis", { headers: { cookie } }))).json();
  assert.equal(rep.total, 1);
  const csv = await call(e, "report.csv", req("/api/panel/report.csv?p=dzis", { headers: { cookie } }));
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.equal((await call(e, "lead/" + rep.items[0].id, post("/x", { status: "ok" }, { cookie }))).status, 200);
  assert.equal((await e.DB.prepare("SELECT status FROM leads").first()).status, "ok");
  assert.equal((await call(e, "lead/" + rep.items[0].id, post("/x", { status: "ok" }, { cookie, "sec-fetch-site": "cross-site" }))).status, 403, "no requests from other sites");
  await call(e, "logout", post("/x", {}, { cookie }));
  assert.equal((await call(e, "report", req("/api/panel/report", { headers: { cookie } }))).status, 401);
});

test("panel API: price editor commits to GitHub and keeps history", { skip: !lite && "needs a LITE build (py src/build.py)" }, async (t) => {
  const e = await env({ GITHUB_TOKEN: "tok", GITHUB_REPO: "RamyMonir/taxi-adam", GITHUB_BRANCH: "Taxi-Knurow-Lite" });
  let file = pricesText(CONFIG.prices), sha = "sha1", puts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).startsWith("https://api.github.com")) {
      assert.equal(opts.headers.authorization, "Bearer tok");
      if (!opts.method || opts.method === "GET") return Response.json({ sha, content: b64encode(file) });
      const b = JSON.parse(opts.body); puts.push(b);
      if (b.sha !== sha) return new Response("", { status: 409 });
      file = b64decode(b.content); sha = "sha2";
      return Response.json({ commit: { sha: "c0ffee" }, content: { sha } });
    }
    return realFetch(url, opts);
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const ok = await call(e, "login", post("/api/panel/login", { slug: "tajnyLink123", pin: "246810" }));
  const cookie = ok.headers.get("set-cookie").split(";")[0];
  const cur = await (await call(e, "prices", req("/api/panel/prices", { headers: { cookie } }))).json();
  assert.equal(cur.editor, true); assert.equal(cur.sha, "sha1");
  const edit = { destinations: { "lotnisko-balice": 350 } };
  const prev = await (await call(e, "prices/preview", post("/x", { edit }, { cookie }))).json();
  assert.deepEqual(prev.errors, []); assert.equal(prev.changes.length, 1);
  const bad = await call(e, "prices", post("/x", { sha: "sha1", edit: { destinations: { "lotnisko-balice": 1 } } }, { cookie }));
  assert.equal(bad.status, 400);
  const saved = await (await call(e, "prices", post("/x", { sha: "sha1", edit }, { cookie }))).json();
  assert.equal(saved.ok, true); assert.equal(saved.commit, "c0ffee");
  assert.match(puts.at(-1).message, /^Ceny \(panel\): .*350 zł/);
  assert.equal(JSON.parse(file).destinations["lotnisko-balice"].price, 350);
  assert.equal(JSON.parse(file).version, CONFIG.prices.version + 1);
  const stale = await call(e, "prices", post("/x", { sha: "sha1", edit }, { cookie }));
  assert.equal(stale.status, 409, "edit based on an old version is refused");
  const hist = await (await call(e, "history", req("/api/panel/history", { headers: { cookie } }))).json();
  assert.equal(hist.items.length, 1);
});

test("middleware: in LITE only /api/lead and /api/panel/* answer", { skip: !lite && "needs a LITE build" }, async () => {
  const next = async () => new Response("ok");
  assert.equal((await middleware({ request: req("/api/rides"), next })).status, 404);
  assert.equal((await middleware({ request: req("/api/telegram"), next })).status, 404);
  assert.equal(await (await middleware({ request: req("/api/lead"), next })).text(), "ok");
  assert.equal(await (await middleware({ request: req("/api/panel/login"), next })).text(), "ok");
  const p = await middleware({ request: req("/panel/"), next });
  assert.equal(p.headers.get("x-robots-tag"), "noindex, nofollow");
});
