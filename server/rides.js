// Rides: storage in Cloudflare D1 (binding "DB") and the drivers' Telegram messages (drivers: server/fleet.js).
//
// Status flow
//   now:   pending -> enroute (driver picked ETA) -> arrived -> ontrip (customer on board) -> done
//   later: pending -> scheduled (driver confirmed) -> enroute -> arrived -> ontrip -> done
//   any open ride can end as declined (driver), cancelled (customer) or expired (no answer).
import { CONFIG } from "./config.js";
import { esc, whenLabel, clockWarsaw, kmBetween, hasXY } from "./util.js";
import { route } from "./google.js";
import { customerWaUrl } from "./phone.js";
import { customerLine } from "./customers.js";
import { FINAL, recordTrip } from "./report.js";
import { ownerInfoText } from "./fleet.js";

export const OPEN = ["pending", "scheduled", "enroute", "arrived", "ontrip"];
const POS_FRESH_MS = 5 * 60000;     // a single (non-live) location counts this long
const ETA_EVERY_MS = 60000;         // Google route refresh at most once a minute per ride
export const SET_OFF_MS = 120000;   // time to set off after accepting, until the car actually moves
const EXPIRE_NOW_MIN = 15;   // unanswered "now" request closes after this
const KEEP_DAYS = 30;        // ride data is deleted after this (privacy policy says so)

let schemaReady = false;
const FLEET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cars (
     id TEXT PRIMARY KEY, make TEXT NOT NULL, model TEXT NOT NULL, color TEXT, plate TEXT NOT NULL UNIQUE,
     seats INTEGER NOT NULL DEFAULT 4, status TEXT NOT NULL DEFAULT 'active', note TEXT, photo_key TEXT, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS car_sessions (
     id TEXT PRIMARY KEY, car_id TEXT NOT NULL, driver_id TEXT NOT NULL,
     started INTEGER NOT NULL, ended INTEGER, end_reason TEXT)`,
  // at most ONE open session per car and per driver: this is what makes "two drivers pick the same car" safe
  "CREATE UNIQUE INDEX IF NOT EXISTS one_open_per_car ON car_sessions (car_id) WHERE ended IS NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS one_open_per_driver ON car_sessions (driver_id) WHERE ended IS NULL",
  "CREATE INDEX IF NOT EXISTS car_sessions_time ON car_sessions (started)",
  `CREATE TABLE IF NOT EXISTS settlements (
     day TEXT NOT NULL, driver_id TEXT NOT NULL, model TEXT, pct REAL, fee REAL,
     gross REAL, cash REAL, noncash REAL, driver_share REAL, owner_share REAL, hand_in REAL,
     settled_at INTEGER, settled_by TEXT, PRIMARY KEY (day, driver_id))`,
];
export async function db(env) {
  if (!env.DB) throw new Error("D1 binding DB is missing");
  if (!schemaReady) {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS rides (
        id TEXT PRIMARY KEY, token TEXT NOT NULL, status TEXT NOT NULL, mode TEXT NOT NULL,
        created INTEGER NOT NULL, updated INTEGER NOT NULL, eta_at INTEGER, tg_msg INTEGER,
        ip TEXT, data TEXT NOT NULL)`
    ).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS rides_ip ON rides (ip, created)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS rides_status ON rides (status, updated)").run();
    // the driver's last live location from Telegram (one row)
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS driver (id INTEGER PRIMARY KEY, lat REAL, lng REAL, ts INTEGER, hint_ts INTEGER)").run();
    // end of the driver's Telegram live-location window (added later: add the column to older databases)
    try { await env.DB.prepare("ALTER TABLE driver ADD COLUMN until INTEGER").run(); } catch (e) { /* already there */ }
    // Telegram update ids already handled (webhook idempotency); purged by the cron after 2 days
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS tg_updates (update_id INTEGER PRIMARY KEY, ts INTEGER NOT NULL)").run();
    // fleet: cars are shared, a driver checks one out per shift (server/cars.js); same as migrations/0002_fleet_cars.sql
    for (const q of FLEET_SCHEMA) await env.DB.prepare(q).run();
    schemaReady = true;
  }
  return env.DB;
}

export async function load(env, id) {
  const row = await (await db(env)).prepare("SELECT * FROM rides WHERE id = ?").bind(id).first();
  if (!row) return null;
  return { ...row, data: JSON.parse(row.data) };
}

export async function save(env, r) {
  r.updated = Date.now();
  await (await db(env)).prepare(
    `INSERT INTO rides (id, token, status, mode, created, updated, eta_at, tg_msg, ip, data)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT(id) DO UPDATE SET status = ?3, updated = ?6, eta_at = ?7, tg_msg = ?8, data = ?10`
  ).bind(r.id, r.token, r.status, r.mode, r.created, r.updated, r.eta_at ?? null, r.tg_msg ?? null, r.ip ?? null, JSON.stringify(r.data)).run();
  // finished or failed: copy to the long-term ride log (reports)
  if (FINAL.includes(r.status)) await recordTrip(env, r).catch((e) => console.log("trip log", e.message));
}

// Background updates (route refresh, live location) only write if nobody changed the ride since it was read.
// Without this, a slow Google call could put a ride back to "enroute" after the driver tapped "arrived"
// or the customer cancelled.
export async function saveIfUnchanged(env, r, prevUpdated) {
  const now = Math.max(Date.now(), prevUpdated + 1);
  const res = await (await db(env)).prepare(
    "UPDATE rides SET status = ?1, eta_at = ?2, data = ?3, updated = ?4, tg_msg = ?7 WHERE id = ?5 AND updated = ?6"
  ).bind(r.status, r.eta_at ?? null, JSON.stringify(r.data), now, r.id, prevUpdated, r.tg_msg ?? null).run();
  const ok = !!(res && res.meta && res.meta.changes);
  if (ok) r.updated = now;
  if (ok && FINAL.includes(r.status)) await recordTrip(env, r).catch((e) => console.log("trip log", e.message));
  return ok;
}

export async function recentByIp(env, ip, sinceMs) {
  const row = await (await db(env)).prepare("SELECT COUNT(*) AS n FROM rides WHERE ip = ? AND created > ?").bind(ip, sinceMs).first();
  return row ? row.n : 0;
}

export async function purgeOld(env) {
  await (await db(env)).prepare("DELETE FROM rides WHERE created < ?").bind(Date.now() - KEEP_DAYS * 864e5).run();
}

// Status change with a re-check: the ride must still be in one of allowedFrom and unchanged since it was read.
// mutate(r) sets the new status / fields on a fresh copy. Returns the saved ride, or null if the ride moved on
// (cancelled meanwhile, another driver tapped…). Send Telegram messages only after it returned a ride.
export async function transition(env, id, allowedFrom, mutate) {
  for (let i = 0; i < 3; i++) {
    const r = await load(env, id);
    if (!r || !allowedFrom.includes(r.status)) return null;
    const prev = r.updated;
    if ((await mutate(r)) === false) return null;
    if (await saveIfUnchanged(env, r, prev)) return r;
  }
  return null;
}

// A "now" request nobody answered: close it so the driver can't confirm a ride the customer gave up on.
export async function expireIfStale(env, r) {
  if (r.status !== "pending" || r.mode !== "now") return r;
  if (Date.now() - (r.data.pendingSince || r.created) <= EXPIRE_NOW_MIN * 60000) return r;
  const next = await transition(env, r.id, ["pending"], (x) => { x.status = "expired"; });
  if (next) { await syncDriverMessage(env, next); return next; }
  return (await load(env, r.id)) || r;
}

/* ---------------- drivers' live location (rows live in server/fleet.js) ---------------- */
// Telegram only sends a new point when the phone moves, so a driver standing still sends nothing.
// While the live-location window ("share for 8 h") is open, the last point is still where he is.
export function isLive(pos) {
  if (!pos || pos.lat == null || !pos.ts) return false;
  if (pos.until) return Date.now() < pos.until;
  return Date.now() - pos.ts < POS_FRESH_MS;
}
// Precise arrival: Google route (with traffic) from where the driver really is to the pickup / destination.
// Called on each driver location update and when the customer's page asks for the status.
export async function refreshEta(env, r, pos, force = false) {
  const d = r.data, target = r.status === "ontrip" ? d.dest : d.pickup;
  if (!isLive(pos) || !hasXY(target) || !env.GOOGLE_SERVER_KEY) return false;
  if (!force && d.liveAt && Date.now() - d.liveAt < ETA_EVERY_MS && d.liveFrom === `${pos.lat},${pos.lng}`) return false;
  if (!force && d.liveAt && Date.now() - d.liveAt < ETA_EVERY_MS / 2) return false;
  const prev = r.updated, here = `${pos.lat},${pos.lng}`;
  const x = await route(env, { lat: pos.lat, lng: pos.lng }, target, true).catch((e) => { console.log("eta route", e); return null; });
  if (!x || x.approx) return false;
  const setOff = r.status === "enroute" && d.acceptFrom === here ? SET_OFF_MS : 0;
  d.liveAt = Date.now(); d.liveFrom = here;
  d.liveKm = Math.round(x.distanceM / 100) / 10; d.liveEtaAt = Date.now() + x.durationS * 1000 + setOff; d.etaSource = "google";
  if (r.status === "enroute") r.eta_at = d.liveEtaAt;
  const ok = await saveIfUnchanged(env, r, prev);
  if (!ok) r.stale = true;   // someone else changed the ride meanwhile: the caller should reload it
  return ok;
}
// rides this driver is driving right now (older rides without a driver belong to Adam)
export async function activeRides(env, driverId = "owner") {
  const { results } = await (await db(env)).prepare(
    `SELECT * FROM rides WHERE status IN ('enroute','ontrip')
       AND COALESCE(json_extract(data, '$.driverId'), 'owner') = ? ORDER BY updated DESC LIMIT 3`).bind(driverId).all();
  return (results || []).map((row) => ({ ...row, data: JSON.parse(row.data) }));
}

// What the customer's status page may see (not the customer's name / phone). drv = the assigned driver.
export function publicView(r, car, drv) {
  const d = r.data;
  const live = isLive(car) && (r.status === "enroute" || r.status === "ontrip");
  const target = r.status === "ontrip" ? d.dest : d.pickup;
  return {
    car: live ? { lat: car.lat, lng: car.lng, ts: car.ts, km: hasXY(target) ? Math.round(kmBetween(car, target) * 10) / 10 : null,
                  startKm: r.status === "ontrip"
                    ? (hasXY(d.pickup) && hasXY(d.dest) ? Math.round(kmBetween(d.pickup, d.dest) * 10) / 10 : null)
                    : (d.carStartKm || null) } : null,
    startedAt: d.startedAt || null, enrouteAt: d.enrouteAt || null,
    destEtaAt: r.status === "ontrip" && d.liveEtaAt ? d.liveEtaAt : null, etaSource: d.etaSource || null,
    roadKm: live && d.liveKm != null && d.liveAt && Date.now() - d.liveAt < 3 * ETA_EVERY_MS ? d.liveKm : null,
    id: r.id, mode: r.mode, status: r.status, created: r.created, updated: r.updated,
    cancelledBy: d.cancelledBy || null, cancelledIn: d.cancelledIn || null,
    etaAt: r.status === "ontrip" ? null : r.eta_at || null, now: Date.now(),
    when: d.when || null, pickup: d.pickup, dest: d.dest, pax: d.pax, distanceM: d.distanceM || null, durationS: d.durationS || null,
    approachS: d.approachS || null, price: d.price || null, priceKind: d.priceKind || null, polyline: d.polyline || null,
    flightInfo: d.flightInfo || null, flight: d.flight || null,
    waitMin: CONFIG.waitMin, tel: (showDriver(r) && drv && drv.phone) ? drv.phone : CONFIG.phone,
    // which driver and which car is coming (once a driver has taken the ride)
    reviewUrl: r.status === "done" && reviewPlace(r) ? `https://search.google.com/local/writereview?placeid=${reviewPlace(r).id}` : null,
    reviewName: r.status === "done" && reviewPlace(r) ? reviewPlace(r).name : null,
    driver: showDriver(r) && d.driver ? { name: d.driver.name, car: d.driver.car, color: d.driver.color, plate: d.driver.plate } : null,
  };
}

// Review link after the ride: the listing of the driver who drove it (Adam sets it with /wizytowka),
// otherwise the three listings in turn (same ride -> always the same one), so all three get reviews.
export function reviewPlace(r) {
  const places = CONFIG.places || [];
  if (!places.length) return null;
  const k = r.data.listing != null && places[r.data.listing] ? r.data.listing
    : [...String(r.id)].reduce((s, c) => s + c.charCodeAt(0), 0) % places.length;
  return places[k];
}
// strict turn-taking for rides whose driver has no listing set: 1, 2, 3, 1, 2, 3, …
export async function nextListing(env) {
  const n = (CONFIG.places || []).length;
  if (!n) return null;
  const d = await db(env);
  await d.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run();
  const row = await d.prepare(
    "INSERT INTO meta (k, v) VALUES ('review_turn', '1') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1 RETURNING v").first();
  return ((parseInt(row?.v, 10) || 1) - 1) % n;
}
const showDriver = (r) => ["scheduled", "enroute", "arrived", "ontrip", "done"].includes(r.status) && !!r.data.driverId;

/* ---------------- Telegram ---------------- */

export async function tg(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  // TELEGRAM_API_BASE only for local tests with a fake Telegram server
  const r = await fetch(`${env.TELEGRAM_API_BASE || "https://api.telegram.org"}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.log("telegram", method, JSON.stringify(j));
  return j;
}

const btn = (text, data) => ({ text, callback_data: data });
export const navUrl = (p) => (p && p.lat != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving&dir_action=navigate`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p && p.address) || "")}`);
// Google's drive time to the pickup + 2 min to get going
export const suggestMin = (d) => (d.approachS ? Math.max(3, Math.ceil(d.approachS / 60) + (d.approachApprox ? 0 : 2)) : null);
// driving time only (the straight-line fallback includes 2 min to set off)
const driveMin = (d) => Math.max(1, Math.round((d.approachS - (d.approachApprox ? 120 : 0)) / 60));

export function keyboard(r, o) {
  const rows = baseKeyboard(r, o);
  // ride taken over the phone: one tap opens WhatsApp with the customer's live-status link
  const wa = r.data.source === "phone" && ["scheduled", "enroute", "arrived"].includes(r.status) && r.data.origin && customerWaUrl(r, r.data.origin);
  if (wa) rows.push([{ text: "📲 Wyślij klientowi link (WhatsApp)", url: wa }]);
  return rows;
}

function baseKeyboard(r, o) {
  const id = r.id, sm = suggestMin(o || r.data);
  switch (r.status) {
    case "draft":
      return [[btn(r.mode === "now" ? "✅ Zapisz i jadę" : "✅ Zapisz rezerwację", `ok|${id}`)], [btn("🗑 Usuń", `del|${id}`)]];
    case "pending":
      return r.mode === "now"
        ? [[btn(sm ? `✅ Przyjmuję – dojazd ~${sm} min` : "✅ Przyjmuję kurs", `e|${id}`)], [btn("❌ Odrzuć", `x|${id}`)]]
        : [[btn("✅ Potwierdź – jadę sam", `s|${id}`)],
           ...(r.data.assignable || []).map((x) => [btn(`👤 Przydziel: ${x.name}`, `g|${id}|${x.id}`)]),
           [btn("❌ Odrzuć", `x|${id}`)]];
    case "scheduled":
      return [[btn("🚕 Wyjeżdżam do klienta", `e|${id}`)], [btn("❌ Anuluj kurs", `x|${id}`)]];
    case "enroute":
      return [[{ text: "🧭 Nawiguj do klienta", url: navUrl(r.data.pickup) }],
              [btn("📍 Jestem na miejscu", `a|${id}`)], [btn("❌ Anuluj", `x|${id}`)]];
    case "arrived":
      return [[btn("▶️ Klient wsiadł – rozpocznij kurs", `t|${id}`)], [btn("❌ Klient nie przyszedł", `n|${id}`)], [btn("🚫 Anuluj kurs", `c|${id}`)]];
    case "ontrip":
      return [[{ text: "🧭 Nawiguj do celu", url: navUrl(r.data.dest) }], [btn("🏁 Zakończ kurs", `d|${id}`)], [btn("🚫 Przerwij kurs", `c|${id}`)]];
    default:
      return [];
  }
}

const STATUS_PL = {
  draft: "📝 podgląd – sprawdź adresy i zapisz",
  pending: "⏳ czeka na decyzję",
  scheduled: "📅 rezerwacja potwierdzona",
  enroute: "🚕 jedziesz do klienta",
  arrived: "📍 czekasz na klienta",
  ontrip: "🛣 kurs w trakcie",
  noshow: "🙅 klient nie przyszedł",
  done: "🏁 zakończony",
  declined: "❌ odrzucony",
  cancelled: "🚫 klient anulował",
  cancelled_driver: "🚫 anulowałeś kurs",
  expired: "⌛ wygasł (brak odpowiedzi)",
};

const mapLink = (p) => (p.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`);

export function driverText(r, o) {
  const d = r.data, ap = o || d;
  const km = d.distanceM ? `${(d.distanceM / 1000).toFixed(1).replace(".", ",")} km` : null;
  const min = d.durationS ? `~${Math.round(d.durationS / 60)} min` : null;
  const price = d.price ? `${d.price} zł${d.priceKind === "fixed" ? " (cena z cennika)" : " (szacunek)"}` : "do ustalenia";
  const L = [];
  L.push(r.mode === "now" ? "🚖 <b>KURS TERAZ</b>" : `📅 <b>REZERWACJA: ${esc(whenLabel(d.when))}</b>`);
  if (d.source === "phone") L.push("📞 <i>kurs przyjęty telefonicznie</i>");
  L.push("");
  if (r.status === "draft") L.push(`✍️ Wpisałeś: ${esc(d.typed.pickup)} &gt; ${esc(d.typed.dest)}`);
  L.push(`📍 <b>Skąd:</b> <a href="${mapLink(d.pickup)}">${esc(d.pickup.address)}</a>${d.pickup.gps ? (d.pickup.near ? " (GPS klienta – w pobliżu, zadzwoń)" : " (GPS klienta)") : ""}`);
  L.push(`🏁 <b>Dokąd:</b> <a href="${mapLink(d.dest)}">${esc(d.dest.address)}</a>`);
  L.push("");
  L.push(`👤 ${esc(d.name || "—")}   ☎️ ${esc(d.phone)}`);
  if (d.cust) L.push(customerLine(d.cust, esc));
  const extra = [`👥 ${d.pax} os.`];
  if (d.luggage) extra.push(`🧳 ${esc(d.luggage)}`);
  if (d.flight && !d.flightInfo) extra.push(`✈️ ${esc(d.flight)}`);
  L.push(extra.join("   "));
  if (d.flightInfo) L.push(`✈️ ${esc(d.flightInfo)}`);
  L.push(`📏 ${[km, min].filter(Boolean).join(" · ") || "trasa nieznana"}   💰 ${price}`);
  if (r.mode === "now" && ap.approachS && r.status === "pending") {
    const km = ap.approachM ? `${(ap.approachM / 1000).toFixed(1).replace(".", ",")} km, ` : "";
    L.push(ap.approachFrom === "live"
      ? `🚗 Od Ciebie do klienta: ${km}~${driveMin(ap)} min ${ap.approachApprox ? "(szacunek)" : "(Google, z korkami)"}`
      : `⚠️ Nie widzę Twojej lokalizacji na żywo – liczę od bazy: ${km}~${driveMin(ap)} min.\nUdostępnij lokalizację na żywo, a czas policzę od Ciebie.`);
  }
  if (d.driver && d.driverId && r.status !== "draft") L.push(`👤 Kierowca: <b>${esc(d.driver.name)}</b>${d.driver.car ? " · " + esc(d.driver.car) : ""}${d.driver.plate ? " · " + esc(d.driver.plate) : ""}`);
  if (d.liveEtaAt && (r.status === "enroute" || r.status === "ontrip")) {
    L.push(`📡 Google: ${d.liveKm != null ? String(d.liveKm).replace(".", ",") + " km, " : ""}na miejscu ok. ${clockWarsaw(d.liveEtaAt)}`);
  }
  if (d.returnTrip) L.push(`🔁 Powrót: ${esc(d.returnTrip)}`);
  if (d.notes) L.push(`📝 ${esc(d.notes)}`);
  L.push("");
  let st = `<b>Status:</b> ${(STATUS_PL[r.status === "cancelled" && d.cancelledBy === "driver" ? "cancelled_driver" : r.status]) || r.status}`;
  if (r.status === "enroute" && r.eta_at) st += ` – u klienta ok. ${clockWarsaw(r.eta_at)}`;
  if (o && o.rejected && r.status === "pending") st = "<b>Status:</b> ❌ odrzuciłeś – kurs poszedł do innych kierowców";
  L.push(st);
  return L.join("\n");
}

// a file (e.g. the CSV report) to the driver's chat
export async function tgFile(env, filename, content, caption, chatId) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const fd = new FormData();
  fd.append("chat_id", String(chatId || env.TELEGRAM_CHAT_ID));
  if (caption) fd.append("caption", caption);
  fd.append("document", new Blob([content], { type: "text/csv" }), filename);
  const r = await fetch(`${env.TELEGRAM_API_BASE || "https://api.telegram.org"}/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body: fd });
  return r.json().catch(() => null);
}

// one message in one chat (a "now" ride before anyone took it is offered via server/fleet.js)
export async function notifyDriver(env, r, chatId) {
  const j = await tg(env, "sendMessage", {
    chat_id: chatId || r.data.chat || env.TELEGRAM_CHAT_ID, text: driverText(r), parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard(r) },
  });
  return j && j.ok ? j.result.message_id : null;
}

const takenText = (r, o) => {
  const d = r.data;
  const who = d.driverId ? `✅ Kurs przyjął: <b>${esc(d.driver?.name || "inny kierowca")}</b>`
    : { cancelled: "🚫 Klient anulował", expired: "⌛ Zgłoszenie wygasło", declined: "❌ Nikt nie przyjął kursu" }[r.status] || "";
  return `${r.mode === "now" ? "🚖 Kurs teraz" : "📅 Rezerwacja"}: ${esc(String(d.pickup.address).split(",")[0])} → ${esc(String(d.dest.address).split(",")[0])}\n${who}`;
};

// bring the drivers' messages up to date after any change
export async function syncDriverMessage(env, r) {
  const d = r.data, offers = d.offers || {}, jobs = [];
  const edit = (chat, msg, text, kb) => tg(env, "editMessageText", { chat_id: chat, message_id: msg, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: { inline_keyboard: kb } });
  if (d.driverId || !Object.keys(offers).length) {
    if (r.tg_msg) jobs.push(edit(d.chat || env.TELEGRAM_CHAT_ID, r.tg_msg, driverText(r), keyboard(r)));
  } else {
    for (const o of Object.values(offers)) {
      if (!o.msg) continue;
      jobs.push(r.status === "pending" ? edit(o.chat, o.msg, driverText(r, o), o.rejected ? [] : keyboard(r, o)) : edit(o.chat, o.msg, takenText(r, o), []));
    }
  }
  if (d.ownerInfo) {
    jobs.push(tg(env, "editMessageText", { chat_id: env.TELEGRAM_CHAT_ID, message_id: d.ownerInfo, text: ownerInfoText(r), parse_mode: "HTML" }));
  }
  await Promise.all(jobs);
}

// after a driver took the ride: the others' copies say who has it
export async function closeOtherOffers(env, r) {
  const d = r.data;
  await Promise.all(Object.entries(d.offers || {}).filter(([id, o]) => id !== d.driverId && o.msg).map(([, o]) =>
    tg(env, "editMessageText", { chat_id: o.chat, message_id: o.msg, text: takenText(r, o), parse_mode: "HTML", reply_markup: { inline_keyboard: [] } })));
}
