// LITE: request log. Every tap on WhatsApp / SMS / Zadzwoń on the site is stored here for the owner's report.
// A tap only means the customer OPENED the app – not that a message was sent or a ride happened.
import { randomId, nowWarsaw, warsawMs } from "./util.js";

export const RETENTION_DAYS = 365;   // 12 months (privacy policy)
const CHANNELS = ["wa", "sms", "tel"];
const cut = (s, n) => (typeof s === "string" ? s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");

let ready = false;
export async function ldb(env) {
  if (!env.DB) throw new Error("no DB binding");
  if (!ready) {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, channel TEXT NOT NULL, mode TEXT, when_at TEXT,
        from_txt TEXT, to_txt TEXT, pax INTEGER, luggage TEXT, name TEXT, phone TEXT, notes TEXT, geo TEXT, page TEXT, ip_hash TEXT, status TEXT)`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS leads_ts ON leads(ts)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS panel_sessions (sid_hash TEXT PRIMARY KEY, created INTEGER NOT NULL, expires INTEGER NOT NULL)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS price_changes (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, commit_sha TEXT, version INTEGER, summary TEXT, ip_hash TEXT)"),
      // the rate limiter's table (server/ratelimit.js) – created here too, so the PIN lockout never "fails open" on a fresh database
      env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_hits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, win INTEGER NOT NULL)"),
    ]);
    ready = true;
  }
  return env.DB;
}
export const _resetForTests = () => { ready = false; };

// body from lite.js -> clean row, or null (spam / nonsense)
export function cleanLead(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  if (b.website) return null;                                     // honeypot filled = bot
  if (!CHANNELS.includes(b.channel)) return null;
  const when = typeof b.when === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.when) ? b.when : null;
  const g = b.geo && Number.isFinite(+b.geo.lat) && Number.isFinite(+b.geo.lng) && Math.abs(+b.geo.lat) <= 90 && Math.abs(+b.geo.lng) <= 180
    ? `${(+b.geo.lat).toFixed(5)},${(+b.geo.lng).toFixed(5)}` : null;
  const pax = Math.min(9, Math.max(1, parseInt(b.pax, 10) || 1));
  return {
    channel: b.channel, mode: b.mode === "later" ? "later" : "now", when_at: when,
    from_txt: cut(b.from, 160), to_txt: cut(b.to, 160), pax, luggage: cut(b.luggage, 40),
    name: cut(b.name, 60), phone: cut(b.phone, 30), notes: cut(b.notes, 300), geo: g, page: cut(b.page, 120),
  };
}

export async function deleteOld(env, now = Date.now()) {
  const db = await ldb(env);
  await db.prepare("DELETE FROM leads WHERE ts < ?1").bind(now - RETENTION_DAYS * 864e5).run();
  await db.prepare("DELETE FROM panel_sessions WHERE expires < ?1").bind(now).run();
}

export async function insertLead(env, row, ipHash, now = Date.now()) {
  const db = await ldb(env);
  const id = randomId(14);
  await db.prepare(`INSERT INTO leads (id, ts, channel, mode, when_at, from_txt, to_txt, pax, luggage, name, phone, notes, geo, page, ip_hash)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
    .bind(id, now, row.channel, row.mode, row.when_at, row.from_txt, row.to_txt, row.pax, row.luggage, row.name, row.phone, row.notes, row.geo, row.page, ipHash || null)
    .run();
  if (Math.random() < 0.02) await deleteOld(env, now);   // about 1 in 50 inserts: drop rows older than 12 months (no cron needed)
  return id;
}

/* ---------- report ---------- */
const iso = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// "dzis" | "tydzien" | "miesiac" | {from, to} -> {from, to} as Polish dates (inclusive)
export function period(p, today = nowWarsaw().slice(0, 10)) {
  if (p && iso.test(p.from || "") && iso.test(p.to || "") && p.from <= p.to) return { from: p.from, to: p.to };
  if (p === "tydzien") {
    const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;   // Monday = 0
    return { from: addDays(today, -dow), to: today };
  }
  if (p === "miesiac") return { from: today.slice(0, 8) + "01", to: today };
  return { from: today, to: today };
}

// a pickup/destination text grouped loosely: "ul. Szpitalna 25, Knurów" and "Szpitalna 25 Knurów" count together
export const groupKey = (s) => String(s || "").toLowerCase().replace(/\b(ul|al|os|pl)\.?\s+/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function top(rows, field, n = 10) {
  const m = new Map();
  for (const r of rows) {
    const label = r[field]; if (!label) continue;
    const k = groupKey(label); const cur = m.get(k) || { label, n: 0 }; cur.n++; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "pl")).slice(0, n);
}

export async function report(env, per) {
  const db = await ldb(env);
  const fromMs = warsawMs(`${per.from}T00:00`), toMs = warsawMs(`${addDays(per.to, 1)}T00:00`);
  const { results = [] } = await db.prepare(
    "SELECT id, ts, channel, mode, when_at, from_txt, to_txt, pax, luggage, name, phone, notes, geo, page, status FROM leads WHERE ts >= ?1 AND ts < ?2 ORDER BY ts DESC LIMIT 5000"
  ).bind(fromMs, toMs).all();
  const byChannel = { wa: 0, sms: 0, tel: 0 };
  for (const r of results) byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
  return {
    from: per.from, to: per.to, total: results.length, byChannel,
    marked: { ok: results.filter((r) => r.status === "ok").length, no: results.filter((r) => r.status === "no").length },
    topTo: top(results, "to_txt"), topFrom: top(results, "from_txt"),
    items: results.slice(0, 300),
  };
}

export async function setStatus(env, id, status) {
  if (![null, "ok", "no"].includes(status) || typeof id !== "string" || id.length > 40) return false;
  const db = await ldb(env);
  const r = await db.prepare("UPDATE leads SET status = ?1 WHERE id = ?2").bind(status, id).run();
  return (r.meta?.changes ?? 1) > 0;
}

/* ---------- CSV for Excel (semicolons + BOM, like the full version's report) ---------- */
const CH = { wa: "WhatsApp", sms: "SMS", tel: "Telefon" };
const ST = { ok: "przyjęty", no: "nie przyjęty" };
const when = (ms) => new Date(ms).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
// a cell starting with = + - @ would run as a formula in Excel
export const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(items) {
  const head = ["Kliknięto", "Kanał", "Kiedy", "Skąd", "Dokąd", "Osoby", "Bagaż", "Imię", "Telefon", "Uwagi", "Lokalizacja", "Strona", "Status"];
  const lines = items.map((r) => [when(r.ts), CH[r.channel] || r.channel, r.mode === "later" ? (r.when_at || "").replace("T", " ") : "teraz",
    r.from_txt, r.to_txt, r.pax, r.luggage, r.name, r.phone, r.notes, r.geo ? `https://maps.google.com/?q=${r.geo}` : "", r.page, ST[r.status] || ""]
    .map(csvCell).join(";"));
  return "﻿" + [head.join(";"), ...lines].join("\r\n") + "\r\n";
}
