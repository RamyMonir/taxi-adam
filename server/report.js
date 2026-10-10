// Ride log for reports and financial analysis.
// Rides are deleted after 30 days; every finished (or failed) ride is copied here and kept 5 years
// (tax records). The driver confirms the amount paid and the payment method after each ride.
import { db } from "./rides.js";
import { sha, esc } from "./util.js";
import { phoneKey } from "./customers.js";

export const FINAL = ["done", "cancelled", "noshow", "declined", "expired"];
const KEEP_MS = 5 * 365 * 864e5;
export const METHODS = { g: "gotówka", k: "karta", b: "BLIK", p: "przelew" };

let ready = false;
async function ldb(env) {
  const d = await db(env);
  if (!ready) {
    await d.prepare(`CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY, day TEXT NOT NULL, status TEXT NOT NULL, mode TEXT, source TEXT, cust TEXT, cust_hash TEXT,
      pickup TEXT, dest TEXT, km REAL, approach_km REAL, enroute_at INTEGER, started_at INTEGER, ended_at INTEGER,
      price REAL, price_kind TEXT, paid REAL, method TEXT, pax INTEGER, pay_msg INTEGER)`).run();
    await d.prepare("CREATE INDEX IF NOT EXISTS trips_day ON trips (day)").run();
    ready = true;
  }
  return d;
}

export function dayWarsaw(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
const shortAddr = (a) => String(a || "").split(",").slice(0, 2).join(",").trim();

// called whenever a ride is saved with a final status (keeps an already entered payment)
export async function recordTrip(env, r) {
  const d = r.data, now = Date.now();
  const day = dayWarsaw(r.status === "done" ? d.startedAt || d.arrivedAt || now : r.created);
  const key = phoneKey(d.phone);
  await (await ldb(env)).prepare(
    `INSERT INTO trips (id, day, status, mode, source, cust, cust_hash, pickup, dest, km, approach_km, enroute_at, started_at, ended_at, price, price_kind, pax)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
     ON CONFLICT(id) DO UPDATE SET day = ?2, status = ?3, km = ?10, approach_km = ?11, enroute_at = ?12, started_at = ?13, ended_at = ?14, price = ?15`
  ).bind(r.id, day, r.status, r.mode, d.source === "phone" ? "telefon" : "online",
         d.cust ? (d.cust.orders ? "stały" : "nowy") : "", key ? await sha("cust:" + key) : null,
         shortAddr(d.pickup && d.pickup.address), shortAddr(d.dest && d.dest.address),
         d.distanceM ? Math.round(d.distanceM / 100) / 10 : null, d.acceptKm ?? (d.approachM ? Math.round(d.approachM / 100) / 10 : null),
         d.enrouteAt || null, d.startedAt || null, now, d.price ?? null, d.priceKind || null, d.pax || 1).run();
  await (await ldb(env)).prepare("DELETE FROM trips WHERE ended_at < ?").bind(now - KEEP_MS).run();
}

export async function setPayMsg(env, id, msgId) {
  await (await ldb(env)).prepare("UPDATE trips SET pay_msg = ? WHERE id = ?").bind(msgId, id).run();
}
export async function setPaid(env, id, amount, method) {
  await (await ldb(env)).prepare("UPDATE trips SET paid = ?, method = ? WHERE id = ?").bind(amount, method || null, id).run();
}
export async function tripByPayMsg(env, msgId) {
  return (await ldb(env)).prepare("SELECT * FROM trips WHERE pay_msg = ?").bind(msgId).first();
}
// "85", "85 zł karta", "120,50 blik" -> {amount, method}
export function parsePaid(text) {
  const m = String(text || "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const t = text.toLowerCase();
  const method = /got[oó]w/.test(t) ? "gotówka" : /kart/.test(t) ? "karta" : /blik/.test(t) ? "BLIK" : /przel|faktur/.test(t) ? "przelew" : null;
  return { amount: parseFloat(m[1].replace(",", ".")), method };
}

/* ---------------- periods ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const addDays = (ymd, n) => { const t = new Date(ymd + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const fmtDay = (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;

// "", dziś, wczoraj, tydzień, miesiąc, zeszły miesiąc, rok, 12.10, 01.10-15.10, 01.10.2026-15.10.2026
export function parsePeriod(arg, today = dayWarsaw(Date.now())) {
  const a = String(arg || "").trim().toLowerCase();
  const y = +today.slice(0, 4), mo = +today.slice(5, 7);
  if (!a || /^dzi[sś]|^dzisiaj/.test(a)) return { from: today, to: today };
  if (/^wczoraj/.test(a)) { const d = addDays(today, -1); return { from: d, to: d }; }
  if (/^tydzie[nń]|^tydz/.test(a)) {
    const wd = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;   // Monday = 0
    return { from: addDays(today, -wd), to: today };
  }
  if (/^(zesz[lł]y|poprzedni)\s+miesi/.test(a)) {
    const py = mo === 1 ? y - 1 : y, pm = mo === 1 ? 12 : mo - 1;
    return { from: `${py}-${pad(pm)}-01`, to: addDays(`${y}-${pad(mo)}-01`, -1) };
  }
  if (/^miesi/.test(a)) return { from: `${y}-${pad(mo)}-01`, to: today };
  if (/^rok/.test(a)) return { from: `${y}-01-01`, to: today };
  const D = (s) => {
    const m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return null;
    const yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y;
    return `${yy}-${pad(m[2])}-${pad(m[1])}`;
  };
  const parts = a.split(/\s*[-–]\s*/);
  if (parts.length === 1 && D(parts[0])) return { from: D(parts[0]), to: D(parts[0]) };
  if (parts.length === 2 && D(parts[0]) && D(parts[1])) {
    const f = D(parts[0]), t = D(parts[1]);
    return f <= t ? { from: f, to: t } : { from: t, to: f };
  }
  return null;
}

export const REPORT_HELP =
  "📊 <b>Raport</b>: <code>/raport</code> (dziś), <code>/raport wczoraj</code>, <code>/raport tydzień</code>, " +
  "<code>/raport miesiąc</code>, <code>/raport zeszły miesiąc</code>, <code>/raport rok</code>, " +
  "<code>/raport 12.10</code>, <code>/raport 01.10-15.10</code>.\nDo raportu dołączam plik CSV (Excel / Arkusze Google).";

/* ---------------- report ---------------- */
const zl = (n) => Math.round(n).toLocaleString("pl-PL").replace(/ /g, " ") + " zł";
const km1 = (n) => (Math.round(n * 10) / 10).toLocaleString("pl-PL") + " km";
const hm = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const sane = (a, b, maxH) => (a && b && b > a && b - a < maxH * 3600e3 ? b - a : 0);
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

export async function buildReport(env, from, to) {
  const rs = await (await ldb(env)).prepare("SELECT * FROM trips WHERE day >= ? AND day <= ? ORDER BY day, COALESCE(started_at, ended_at)").bind(from, to).all();
  const rows = rs.results || [];
  const done = rows.filter((t) => t.status === "done");
  const count = (st) => rows.filter((t) => t.status === st).length;

  const money = (t) => (t.paid != null ? t.paid : t.price || 0);
  const unpaid = done.filter((t) => t.paid == null);
  const revenue = done.reduce((s, t) => s + money(t), 0);
  const byMethod = {};
  for (const t of done) if (t.paid != null) byMethod[t.method || "nie podano"] = (byMethod[t.method || "nie podano"] || 0) + t.paid;

  const kmClient = done.reduce((s, t) => s + (t.km || 0), 0);
  const kmApproach = done.reduce((s, t) => s + (t.approach_km || 0), 0);
  const tClient = done.reduce((s, t) => s + sane(t.started_at, t.ended_at, 12), 0);
  const tApproach = done.reduce((s, t) => s + sane(t.enroute_at, t.started_at, 6), 0);
  const hours = (tClient + tApproach) / 3600e3;

  const custs = new Map();
  for (const t of done) if (t.cust_hash) custs.set(t.cust_hash, t.cust);
  const newC = [...custs.values()].filter((c) => c === "nowy").length;

  const dests = {};
  for (const t of done) { const k = (t.dest || "?").split(",")[0]; dests[k] = (dests[k] || 0) + 1; }
  const top = Object.entries(dests).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const L = [];
  const title = from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`;
  L.push(`📊 <b>RAPORT: ${title}</b>`, "");
  L.push(`🚕 <b>Kursy zrealizowane: ${done.length}</b>`);
  if (done.length) {
    const c = (f) => done.filter(f).length;
    L.push(`   teraz ${c((t) => t.mode === "now")} · rezerwacje ${c((t) => t.mode === "later")} · online ${c((t) => t.source === "online")} · telefon ${c((t) => t.source === "telefon")}`);
  }
  const lost = [["anulowane", count("cancelled")], ["odrzucone", count("declined")], ["klient nie przyszedł", count("noshow")], ["bez odpowiedzi", count("expired")]].filter((x) => x[1]);
  if (lost.length) L.push(`❌ Niezrealizowane: ${lost.map((x) => `${x[0]} ${x[1]}`).join(" · ")}`);
  L.push("");
  L.push(`💰 <b>Przychód: ${zl(revenue)}</b>`);
  if (Object.keys(byMethod).length) L.push(`   ${Object.entries(byMethod).map(([m, v]) => `${m} ${zl(v)}`).join(" · ")}`);
  if (unpaid.length) L.push(`   ⚠️ ${unpaid.length} ${plural(unpaid.length, "kurs", "kursy", "kursów")} bez wpisanej kwoty – liczę cenę z wyceny (${zl(unpaid.reduce((s, t) => s + (t.price || 0), 0))})`);
  if (done.length) {
    const per = [`${zl(revenue / done.length)} / kurs`];
    if (kmClient + kmApproach > 0) per.push(`${(revenue / (kmClient + kmApproach)).toFixed(2).replace(".", ",")} zł / km`);
    if (hours > 0.1) per.push(`${zl(revenue / hours)} / h`);
    L.push(`   średnio: ${per.join(" · ")}`);
  }
  L.push("");
  L.push(`📏 <b>Kilometry: ${km1(kmClient + kmApproach)}</b>`);
  L.push(`   z klientem ${km1(kmClient)} · dojazdy do klientów ${km1(kmApproach)}`);
  L.push(`⏱ <b>Czas pracy: ${hm(tClient + tApproach)}</b>`);
  L.push(`   z klientem ${hm(tClient)} · dojazd i czekanie ${hm(tApproach)}`);
  if (custs.size) L.push(`👥 Klienci: ${custs.size} (nowi ${newC} · stali ${custs.size - newC})`);
  if (top.length) L.push(`🏆 Najczęstsze cele: ${top.map(([k, v]) => `${esc(k)} ×${v}`).join(", ")}`);

  if (from !== to && done.length) {
    const long = (new Date(to) - new Date(from)) / 864e5 > 62;   // long periods: per month
    const groups = {};
    for (const t of done) {
      const k = long ? t.day.slice(0, 7) : t.day;
      const g = groups[k] || (groups[k] = { n: 0, money: 0, km: 0 });
      g.n++; g.money += money(t); g.km += (t.km || 0) + (t.approach_km || 0);
    }
    L.push("", long ? "📅 <b>Miesiące:</b>" : "📅 <b>Dni:</b>");
    for (const [k, g] of Object.entries(groups)) {
      L.push(`   ${long ? k.slice(5, 7) + "." + k.slice(0, 4) : fmtDay(k).slice(0, 5)}: ${g.n} ${plural(g.n, "kurs", "kursy", "kursów")} · ${zl(g.money)} · ${km1(g.km)}`);
    }
  }
  if (!rows.length) L.push("", "Brak kursów w tym okresie.");
  L.push("", "<i>Km i czas dojazdu liczone z tras Google; kwoty – wpisane po kursie (albo z wyceny).</i>");

  return { text: L.join("\n"), csv: toCsv(rows), rows, title };
}

const clock = (ms) => (ms ? new Date(ms).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const num = (n) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
const STATUS = { done: "zrealizowany", cancelled: "anulowany", declined: "odrzucony", noshow: "klient nie przyszedł", expired: "bez odpowiedzi" };

// semicolons + decimal commas + BOM: opens correctly in Polish Excel and in Google Sheets
function toCsv(rows) {
  const head = ["Dzień", "ID", "Status", "Tryb", "Źródło", "Klient", "Skąd", "Dokąd", "Km z klientem", "Km dojazdu",
    "Wyjazd do klienta", "Start kursu", "Koniec", "Min z klientem", "Min dojazd + czekanie", "Cena (wycena)", "Zapłacono", "Płatność", "Osoby"];
  const q = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((t) => [
    t.day, t.id, STATUS[t.status] || t.status, t.mode === "later" ? "rezerwacja" : "teraz", t.source, t.cust, t.pickup, t.dest,
    num(t.km), num(t.approach_km), clock(t.enroute_at), clock(t.started_at), clock(t.ended_at),
    t.status === "done" ? num(sane(t.started_at, t.ended_at, 12) / 60000) : "", t.status === "done" ? num(sane(t.enroute_at, t.started_at, 6) / 60000) : "",
    num(t.price), num(t.paid), t.method || "", t.pax,
  ].map(q).join(";"));
  return "﻿" + [head.join(";"), ...lines].join("\r\n") + "\r\n";
}
