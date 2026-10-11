// Ride log for reports and financial analysis.
// Rides are deleted after 30 days; every finished (or failed) ride is copied here and kept 5 years
// (tax records). The driver confirms the amount paid and the payment method after each ride.
import { db } from "./rides.js";
import { sha, esc } from "./util.js";
import { phoneKey } from "./customers.js";
import { carLabel, sessionsBetween, listCars } from "./cars.js";
import { settlePeriod, tripMoney, isCash, modelOf, modelLabel, handInText, zl2, r2 } from "./settle.js";
import { CONFIG } from "./config.js";

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
    // which driver drove it (added with several drivers)
    for (const col of ["driver_id TEXT", "driver_name TEXT", "car_id TEXT", "car_label TEXT", "pay_bucket TEXT"]) { try { await d.prepare(`ALTER TABLE trips ADD COLUMN ${col}`).run(); } catch (e) { /* there */ } }
    await d.prepare("CREATE INDEX IF NOT EXISTS trips_driver_day ON trips (driver_id, day)").run();
    await d.prepare("CREATE INDEX IF NOT EXISTS trips_car_day ON trips (car_id, day)").run();
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
    `INSERT INTO trips (id, day, status, mode, source, cust, cust_hash, pickup, dest, km, approach_km, enroute_at, started_at, ended_at, price, price_kind, pax, driver_id, driver_name, car_id, car_label)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
     ON CONFLICT(id) DO UPDATE SET day = ?2, status = ?3, km = ?10, approach_km = ?11, enroute_at = ?12, started_at = ?13, ended_at = ?14, price = ?15,
       driver_id = ?18, driver_name = ?19, car_id = ?20, car_label = ?21`
  ).bind(r.id, day, r.status, r.mode, d.source === "phone" ? "telefon" : "online",
         d.cust ? (d.cust.orders ? "stały" : "nowy") : "", key ? await sha("cust:" + key) : null,
         shortAddr(d.pickup && d.pickup.address), shortAddr(d.dest && d.dest.address),
         d.distanceM ? Math.round(d.distanceM / 100) / 10 : null, d.acceptKm ?? (d.approachM ? Math.round(d.approachM / 100) / 10 : null),
         d.enrouteAt || null, d.startedAt || null, now, d.price ?? null, d.priceKind || null, d.pax || 1,
         d.driverId || (d.offers ? null : "owner"), d.driver?.name || (d.driverId || d.offers ? null : "Adam"),
         d.vehicle?.id || null, d.vehicle ? carLabel(d.vehicle) : (d.driver?.car ? [d.driver.car, d.driver.plate].filter(Boolean).join(" · ") : null)).run();
}
// 5-year retention (called by the cron, not on every save)
export async function purgeTrips(env) {
  await (await ldb(env)).prepare("DELETE FROM trips WHERE ended_at < ?").bind(Date.now() - KEEP_MS).run();
}

export async function setPayMsg(env, id, msgId) {
  await (await ldb(env)).prepare("UPDATE trips SET pay_msg = ? WHERE id = ?").bind(msgId, id).run();
}
export async function setPaid(env, id, amount, method) {
  const bucket = method ? (method === "gotówka" ? "cash" : "owner") : null;
  await (await ldb(env)).prepare("UPDATE trips SET paid = ?, method = ?, pay_bucket = ? WHERE id = ?").bind(amount, method || null, bucket, id).run();
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
const zl = (n) => Math.round(n).toLocaleString("pl-PL").replace(/ /g, " ") + " zł";
const km1 = (n) => (Math.round(n * 10) / 10).toLocaleString("pl-PL") + " km";
const hm = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const sane = (a, b, maxH) => (a && b && b > a && b - a < maxH * 3600e3 ? b - a : 0);
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const kursy = (n) => `${n} ${plural(n, "kurs", "kursy", "kursów")}`;
const clockW = (ms) => (ms ? new Date(ms).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }) : "–");
const WD = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
const dayName = (ymd) => WD[new Date(ymd + "T12:00:00Z").getUTCDay()];
export const PAY_ICON = { "gotówka": "💵", karta: "💳", BLIK: "📱", przelew: "🏦" };
const payIcon = (t) => (t.paid == null && !t.method ? "❔" : PAY_ICON[t.method] || "💵");
const firstName = (n) => String(n || "").split(" ")[0];
const placeShort = (a) => String(a || "?").split(",")[0].trim();

// Warsaw midnight of a "YYYY-MM-DD" day, in ms (DST-aware enough for reports)
export function warsawMidnight(ymd) {
  const noon = new Date(ymd + "T12:00:00Z");
  const h = +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(noon);
  return Date.parse(ymd + "T00:00:00Z") - (h - 12) * 3600e3;
}

// rides -> Telegram text + CSV. Async part: data from D1; the text itself is renderReport() (pure, tested).
export async function buildReport(env, from, to, driverId = null) {
  const d = await ldb(env);
  const rs = await d.prepare("SELECT * FROM trips WHERE day >= ? AND day <= ? ORDER BY day, COALESCE(started_at, ended_at)").bind(from, to).all();
  const drivers = ((await d.prepare("SELECT id, name, owner, pay_model, driver_pct, daily_fee FROM drivers").all().catch(() => null))?.results) || [];
  const t0 = warsawMidnight(from), t1 = warsawMidnight(addDays(to, 1));
  const [sessions, cars] = await Promise.all([
    sessionsBetween(env, t0, t1).catch(() => []),
    driverId ? [] : listCars(env).catch(() => []),
  ]);
  return renderReport({ from, to, rows: rs.results || [], drivers, sessions, cars, driverId, cfg: CONFIG.commission || {}, now: Date.now() });
}

export function renderReport({ from, to, rows: all, drivers = [], sessions = [], cars = [], driverId = null, cfg = {}, now = Date.now() }) {
  const key = (t) => t.driver_id || "owner";
  const rows = driverId ? all.filter((t) => key(t) === driverId) : all;
  const done = rows.filter((t) => t.status === "done");
  const count = (st) => rows.filter((t) => t.status === st).length;
  const oneDay = from === to;
  const drvById = Object.fromEntries(drivers.map((x) => [x.id, x]));
  if (!drvById.owner) drvById.owner = { id: "owner", name: "Adam", owner: 1 };
  const nameOf = (id, t) => drvById[id]?.name || t?.driver_name || (id === "owner" ? "Adam" : "bez kierowcy");

  const title = oneDay ? `${dayName(from)} ${fmtDay(from)}` : `${fmtDay(from)} – ${fmtDay(to)}`;
  const me = driverId ? drvById[driverId] || { id: driverId, name: rows.find((t) => t.driver_name)?.driver_name || "" } : null;
  const L = [];
  L.push(driverId ? `📊 <b>TWÓJ RAPORT – ${esc(me.name || "")}: ${title}</b>` : `📊 <b>RAPORT – CAŁA FIRMA: ${title}</b>`, "");

  const kmClient = done.reduce((s, t) => s + (t.km || 0), 0), kmApproach = done.reduce((s, t) => s + (t.approach_km || 0), 0);
  const tClient = done.reduce((s, t) => s + sane(t.started_at, t.ended_at, 12), 0), tApproach = done.reduce((s, t) => s + sane(t.enroute_at, t.started_at, 6), 0);
  const c = (f) => done.filter(f).length;
  L.push(`🚕 <b>Kursy zrealizowane: ${done.length}</b>` + (done.length ? `  (teraz ${c((t) => t.mode === "now")} · rezerwacje ${c((t) => t.mode === "later")} · online ${c((t) => t.source === "online")} · telefon ${c((t) => t.source === "telefon")})` : ""));
  const lost = [["anulowane", count("cancelled")], ["odrzucone", count("declined")], ["klient nie przyszedł", count("noshow")], ["bez odpowiedzi", count("expired")]].filter((x) => x[1]);
  if (lost.length) L.push(`❌ Niezrealizowane: ${lost.map((x) => `${x[0]} ${x[1]}`).join(" · ")}`);
  if (done.length) L.push(`📏 ${km1(kmClient + kmApproach)} (z klientami ${km1(kmClient)}) · ⏱ ${hm(tClient + tApproach)}`);

  // the driver's cars in this period
  const mySessions = driverId ? sessions.filter((x) => x.driver_id === driverId) : [];
  if (driverId && mySessions.length) {
    L.push(`🚗 ${oneDay ? "Auta" : "Auta w okresie"}: ` + mySessions.map((x) => `${esc(`${x.make} ${x.model}`.trim())} ${esc(x.plate)}${oneDay ? ` (${clockW(x.started)}–${x.ended ? clockW(x.ended) : "teraz"})` : ""}`).join(" → "));
  }

  // money + settlement
  const groups = {};
  for (const t of rows) (groups[key(t)] = groups[key(t)] || []).push(t);
  const settlements = Object.entries(groups).map(([id, list]) => ({ driverId: id, name: nameOf(id, list[0]), ...settlePeriod(list, drvById[id] || { id, owner: id === "owner" }, cfg) }))
    .filter((x) => x.rides > 0).sort((a, b) => (a.model === "owner") - (b.model === "owner") || b.gross - a.gross);
  const tot = settlePeriod(rows, { owner: 1 }, cfg);
  const drvShare = r2(settlements.reduce((s, x) => s + x.driverShare, 0)), ownShare = r2(tot.gross - drvShare);
  const byMethod = {};
  for (const t of done) if (t.method) byMethod[t.method] = (byMethod[t.method] || 0) + tripMoney(t);

  L.push("");
  if (driverId) {
    const s = settlements[0] || settlePeriod([], me, cfg);
    L.push(`💰 <b>Utarg brutto: ${zl2(s.gross)}</b>`);
    L.push(`   💵 gotówka u Ciebie: ${zl2(s.cash)}`, `   💳 karta / BLIK / przelew (u firmy): ${zl2(s.noncash)}`);
    if (s.model === "daily_fee") {
      L.push(`🚗 Opłata za auto: ${zl2(s.ownerShare)}${s.workDays > 1 ? ` (${s.workDays} dni × ${zl2(s.fee)})` : " (dzienna)"}`, `🤝 <b>Twój zarobek: ${zl2(s.driverShare)}</b>`);
    } else if (s.model === "percent") {
      L.push(`🤝 <b>Twój udział (${s.pct}%): ${zl2(s.driverShare)}</b>`, `🏢 Udział firmy (${r2(100 - s.pct)}%): ${zl2(s.ownerShare)}`);
    }
    if (s.model !== "owner") {
      L.push("────────────────────", `<b>${handInText(s)}</b>`, `   (gotówka ${zl2(s.cash)} − ${s.model === "daily_fee" ? "Twój zarobek" : "Twój udział"} ${zl2(s.driverShare)})`);
    }
    if (s.unpaid) L.push("", `⚠️ ${kursy(s.unpaid)} bez wpisanej płatności – kliknij kwotę pod „Ile zapłacił klient?”, żeby rozliczenie było dokładne.`);
  } else {
    L.push(`💰 <b>Utarg brutto: ${zl2(tot.gross)}</b>`);
    L.push(`   💵 gotówka ${zl2(tot.cash)} · 💳 karta / BLIK / przelew ${zl2(tot.noncash)} (już na koncie firmy)`);
    if (Object.keys(byMethod).length > 1) L.push(`   ${Object.entries(byMethod).map(([m, v]) => `${PAY_ICON[m] || ""} ${m} ${zl2(v)}`).join(" · ")}`);
    L.push(`   Udział kierowców: ${zl2(drvShare)} · <b>Udział firmy: ${zl2(ownShare)}</b>`);
    if (tot.unpaid) L.push(`   ⚠️ ${kursy(tot.unpaid)} bez wpisanej kwoty – liczę cenę z wyceny`);
  }

  // every ride (one day; longer periods: in the CSV)
  if (oneDay && done.length) {
    const MAX = 40;
    L.push("", driverId ? "🧾 <b>Twoje kursy</b>" : "🧾 <b>Kursy</b>");
    for (const t of done.slice(0, MAX)) {
      const car = t.car_label ? esc(driverId ? String(t.car_label).split(" · ")[0] : t.car_label) : "bez auta";
      L.push(`${clockW(t.started_at || t.ended_at)} ${driverId ? "" : `<b>${esc(firstName(nameOf(key(t), t)))}</b> · `}${esc(placeShort(t.pickup))} → ${esc(placeShort(t.dest))} · ${zl2(tripMoney(t))} ${payIcon(t)} · ${car}`);
    }
    if (done.length > MAX) L.push(`… i ${done.length - MAX} więcej w pliku CSV`);
  }

  if (!driverId && settlements.length) {
    L.push("", "👤 <b>Rozliczenie kierowców</b>");
    for (const x of settlements) {
      if (x.model === "owner") { L.push(`<b>${esc(x.name)}</b> · właściciel · ${kursy(x.rides)} · brutto ${zl2(x.gross)} (💵 ${zl2(x.cash)} · 💳 ${zl2(x.noncash)})`); continue; }
      L.push(`<b>${esc(x.name)}</b> · ${modelLabel(x)} · ${kursy(x.rides)}`,
             `   brutto ${zl2(x.gross)} · 💵 ${zl2(x.cash)} · 💳 ${zl2(x.noncash)}`,
             `   kierowca ${zl2(x.driverShare)} · firma ${zl2(x.ownerShare)} → <b>${handInText(x, esc(firstName(x.name)))}</b>`);
    }
  }

  // cars: rides + money + who drove when
  if (!driverId && (done.length || sessions.length || cars.length)) {
    const byCar = {};
    for (const t of done) { const k = t.car_id || t.car_label || "—"; const g = byCar[k] || (byCar[k] = { label: t.car_label || "bez auta", n: 0, money: 0, km: 0 }); g.n++; g.money += tripMoney(t); g.km += (t.km || 0) + (t.approach_km || 0); }
    const known = new Set();
    const lines = [];
    const sessText = (carId) => sessions.filter((x) => x.car_id === carId).map((x) => `${esc(firstName(x.driver_name))} ${oneDay ? `${clockW(x.started)}–${x.ended ? clockW(x.ended) : "teraz"}` : ""}`.trim());
    for (const car of cars) {
      known.add(car.id);
      const g = byCar[car.id], ss = sessText(car.id), label = esc(`${car.make} ${car.model}`.trim() + " · " + car.plate);
      if (car.status === "service" && !g) { lines.push(`${label} – 🔧 w serwisie${car.note ? ": " + esc(car.note) : ""}`); continue; }
      lines.push(`${label} – ${g ? `${kursy(g.n)} · ${zl2(g.money)} · ${km1(g.km)}` : "bez kursów"}${ss.length ? " · " + [...new Set(ss)].join(", ") : ""}`);
    }
    for (const [k, g] of Object.entries(byCar)) if (!known.has(k)) lines.push(`${esc(g.label)} – ${kursy(g.n)} · ${zl2(g.money)}`);
    if (lines.length) L.push("", "🚗 <b>Auta</b>", ...lines);
    const open = sessions.filter((x) => !x.ended);
    if (oneDay && open.length) L.push(`🔒 Niezwolnione: ${open.map((x) => `${esc(`${x.make} ${x.model}`.trim())} (${esc(firstName(x.driver_name))})`).join(", ")} – zwolnią się same po 45 min bez lokalizacji albo /zwolnij NR`);
  }

  // longer periods: per day / month
  if (!oneDay && done.length) {
    const long = (new Date(to) - new Date(from)) / 864e5 > 62;
    const gr = {};
    for (const t of done) { const k = long ? t.day.slice(0, 7) : t.day; const g = gr[k] || (gr[k] = { n: 0, money: 0, km: 0 }); g.n++; g.money += tripMoney(t); g.km += (t.km || 0) + (t.approach_km || 0); }
    L.push("", long ? "📅 <b>Miesiące:</b>" : "📅 <b>Dni:</b>");
    for (const [k, g] of Object.entries(gr)) L.push(`   ${long ? k.slice(5, 7) + "." + k.slice(0, 4) : fmtDay(k).slice(0, 5)}: ${kursy(g.n)} · ${zl2(g.money)} · ${km1(g.km)}`);
  }
  if (!driverId && done.length) {
    const dests = {};
    for (const t of done) { const k = placeShort(t.dest); dests[k] = (dests[k] || 0) + 1; }
    const top = Object.entries(dests).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) L.push("", `🏆 Najczęstsze cele: ${top.map(([k, v]) => `${esc(k)} ×${v}`).join(", ")}`);
  }
  if (!rows.length) L.push("", "Brak kursów w tym okresie.");
  L.push("", "<i>Kwoty: wpisane po kursie (albo z wyceny). Gotówka zostaje u kierowcy, karta / BLIK / przelew trafiają na konto firmy.</i>");

  return { text: L.join("\n"), csv: toCsv(rows, drvById, cfg), rows, title, settlements: settlements.filter((x) => x.model !== "owner") };
}

// keep each Telegram message under the 4096-character limit (split at line breaks)
export function chunks(text, max = 3800) {
  const out = []; let cur = "";
  for (const line of String(text).split("\n")) {
    if (cur && cur.length + line.length + 1 > max) { out.push(cur); cur = ""; }
    cur = cur ? cur + "\n" + line : line;
  }
  if (cur) out.push(cur);
  return out;
}

// the 23:00 numbers per driver, frozen in "settlements" (an already confirmed settlement keeps its settled_at)
export async function saveSettlements(env, day, list) {
  const d = await ldb(env);
  for (const x of list) {
    await d.prepare(`INSERT INTO settlements (day, driver_id, model, pct, fee, gross, cash, noncash, driver_share, owner_share, hand_in)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                     ON CONFLICT(day, driver_id) DO UPDATE SET model = ?3, pct = ?4, fee = ?5, gross = ?6, cash = ?7, noncash = ?8,
                       driver_share = ?9, owner_share = ?10, hand_in = ?11`)
      .bind(day, x.driverId, x.model, x.pct ?? null, x.fee ?? null, x.gross, x.cash, x.noncash, x.driverShare, x.ownerShare, x.handIn).run();
  }
}

const clock = (ms) => (ms ? new Date(ms).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const num = (n) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
const STATUS = { done: "zrealizowany", cancelled: "anulowany", declined: "odrzucony", noshow: "klient nie przyszedł", expired: "bez odpowiedzi" };

// semicolons + decimal commas + BOM: opens correctly in Polish Excel and in Google Sheets
function toCsv(rows, drvById = {}, cfg = {}) {
  const head = ["Dzień", "ID", "Kierowca", "Auto", "Status", "Tryb", "Źródło", "Klient", "Skąd", "Dokąd", "Km z klientem", "Km dojazdu",
    "Wyjazd do klienta", "Start kursu", "Koniec", "Min z klientem", "Min dojazd + czekanie", "Cena (wycena)", "Zapłacono", "Płatność",
    "Gotówka u kierowcy", "Na konto firmy", "Udział kierowcy", "Udział firmy", "Osoby"];
  const q = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((t) => {
    const done = t.status === "done", money = done ? tripMoney(t) : null, cash = done && isCash(t, cfg.cash_methods);
    const m = modelOf(drvById[t.driver_id || "owner"] || { owner: (t.driver_id || "owner") === "owner" }, cfg);
    const dShare = !done ? null : m.model === "percent" ? r2(money * m.pct / 100) : m.model === "owner" ? 0 : null;   // daily fee: per day, not per ride
    return [
      t.day, t.id, t.driver_name || "", t.car_label || "", STATUS[t.status] || t.status, t.mode === "later" ? "rezerwacja" : "teraz", t.source, t.cust, t.pickup, t.dest,
      num(t.km), num(t.approach_km), clock(t.enroute_at), clock(t.started_at), clock(t.ended_at),
      done ? num(sane(t.started_at, t.ended_at, 12) / 60000) : "", done ? num(sane(t.enroute_at, t.started_at, 6) / 60000) : "",
      num(t.price), num(t.paid), t.method || "", done && cash ? num(money) : "", done && !cash ? num(money) : "",
      num(dShare), dShare == null ? "" : num(money - dShare), t.pax,
    ].map(q).join(";");
  });
  return "\uFEFF" + [head.join(";"), ...lines].join("\r\n") + "\r\n";
}
