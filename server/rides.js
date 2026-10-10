// Rides: storage in Cloudflare D1 (binding "DB") and the driver's Telegram messages.
//
// Status flow
//   now:   pending -> enroute (driver picked ETA) -> arrived -> ontrip (customer on board) -> done
//   later: pending -> scheduled (driver confirmed) -> enroute -> arrived -> ontrip -> done
//   any open ride can end as declined (driver), cancelled (customer) or expired (no answer).
import { CONFIG } from "./config.js";
import { esc, whenLabel, clockWarsaw, kmBetween, hasXY } from "./util.js";
import { route } from "./google.js";

export const OPEN = ["pending", "scheduled", "enroute", "arrived", "ontrip"];
const POS_FRESH_MS = 5 * 60000;     // a single (non-live) location counts this long
const ETA_EVERY_MS = 60000;         // Google route refresh at most once a minute per ride
export const SET_OFF_MS = 120000;   // time to set off after accepting, until the car actually moves
const EXPIRE_NOW_MIN = 15;   // unanswered "now" request closes after this
const KEEP_DAYS = 30;        // ride data is deleted after this (privacy policy says so)

let schemaReady = false;
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
}

// Background updates (route refresh, live location) only write if nobody changed the ride since it was read.
// Without this, a slow Google call could put a ride back to "enroute" after the driver tapped "arrived"
// or the customer cancelled.
export async function saveIfUnchanged(env, r, prevUpdated) {
  const now = Math.max(Date.now(), prevUpdated + 1);
  const res = await (await db(env)).prepare(
    "UPDATE rides SET status = ?1, eta_at = ?2, data = ?3, updated = ?4 WHERE id = ?5 AND updated = ?6"
  ).bind(r.status, r.eta_at ?? null, JSON.stringify(r.data), now, r.id, prevUpdated).run();
  const ok = !!(res && res.meta && res.meta.changes);
  if (ok) r.updated = now;
  return ok;
}

export async function recentByIp(env, ip, sinceMs) {
  const row = await (await db(env)).prepare("SELECT COUNT(*) AS n FROM rides WHERE ip = ? AND created > ?").bind(ip, sinceMs).first();
  return row ? row.n : 0;
}

export async function purgeOld(env) {
  await (await db(env)).prepare("DELETE FROM rides WHERE created < ?").bind(Date.now() - KEEP_DAYS * 864e5).run();
}

// A "now" request nobody answered: close it so the driver can't confirm a ride the customer gave up on.
export async function expireIfStale(env, r) {
  if (r.status === "pending" && r.mode === "now" && Date.now() - r.created > EXPIRE_NOW_MIN * 60000) {
    r.status = "expired";
    await save(env, r);
    await syncDriverMessage(env, r);
  }
  return r;
}

/* ---------------- driver's live location ---------------- */
export async function driverPos(env) {
  const row = await (await db(env)).prepare("SELECT lat, lng, ts, hint_ts, until FROM driver WHERE id = 1").first();
  return row || null;
}
// Telegram only sends a new point when the phone moves, so a driver standing still sends nothing.
// While the live-location window ("share for 8 h") is open, the last point is still where he is.
export function isLive(pos) {
  if (!pos || pos.lat == null || !pos.ts) return false;
  if (pos.until) return Date.now() < pos.until;
  return Date.now() - pos.ts < POS_FRESH_MS;
}
export async function saveDriverPos(env, lat, lng, until) {
  await (await db(env)).prepare(
    "INSERT INTO driver (id, lat, lng, ts, until) VALUES (1, ?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET lat = ?1, lng = ?2, ts = ?3, until = ?4"
  ).bind(lat, lng, Date.now(), until ?? null).run();
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
export async function markHint(env) {
  await (await db(env)).prepare("INSERT INTO driver (id, hint_ts) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET hint_ts = ?1").bind(Date.now()).run();
}
export async function activeRides(env) {
  const { results } = await (await db(env)).prepare(
    "SELECT * FROM rides WHERE status IN ('enroute','ontrip') ORDER BY updated DESC LIMIT 3").all();
  return (results || []).map((row) => ({ ...row, data: JSON.parse(row.data) }));
}

// What the customer's status page may see (no name / phone).
export function publicView(r, car) {
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
    etaAt: r.status === "ontrip" ? null : r.eta_at || null, now: Date.now(),
    when: d.when || null, pickup: d.pickup, dest: d.dest, pax: d.pax, distanceM: d.distanceM || null, durationS: d.durationS || null,
    approachS: d.approachS || null, price: d.price || null, priceKind: d.priceKind || null, polyline: d.polyline || null,
    flightInfo: d.flightInfo || null, flight: d.flight || null,
    waitMin: CONFIG.waitMin, tel: CONFIG.phone,
  };
}

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

export function keyboard(r) {
  const id = r.id, sm = suggestMin(r.data);
  switch (r.status) {
    case "pending":
      return r.mode === "now"
        ? [[btn(sm ? `✅ Przyjmuję – dojazd ~${sm} min` : "✅ Przyjmuję kurs", `e|${id}`)], [btn("❌ Odrzuć", `x|${id}`)]]
        : [[btn("✅ Potwierdź rezerwację", `s|${id}`)], [btn("❌ Odrzuć", `x|${id}`)]];
    case "scheduled":
      return [[btn("🚕 Wyjeżdżam do klienta", `e|${id}`)], [btn("❌ Anuluj kurs", `x|${id}`)]];
    case "enroute":
      return [[{ text: "🧭 Nawiguj do klienta", url: navUrl(r.data.pickup) }],
              [btn("📍 Jestem na miejscu", `a|${id}`)], [btn("❌ Anuluj", `x|${id}`)]];
    case "arrived":
      return [[btn("▶️ Klient wsiadł – rozpocznij kurs", `t|${id}`)], [btn("❌ Klient nie przyszedł", `n|${id}`)]];
    case "ontrip":
      return [[{ text: "🧭 Nawiguj do celu", url: navUrl(r.data.dest) }], [btn("🏁 Zakończ kurs", `d|${id}`)]];
    default:
      return [];
  }
}

const STATUS_PL = {
  pending: "⏳ czeka na Twoją decyzję",
  scheduled: "📅 rezerwacja potwierdzona",
  enroute: "🚕 jedziesz do klienta",
  arrived: "📍 czekasz na klienta",
  ontrip: "🛣 kurs w trakcie",
  noshow: "🙅 klient nie przyszedł",
  done: "🏁 zakończony",
  declined: "❌ odrzucony",
  cancelled: "🚫 klient anulował",
  expired: "⌛ wygasł (brak odpowiedzi)",
};

const mapLink = (p) => (p.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`);

export function driverText(r) {
  const d = r.data;
  const km = d.distanceM ? `${(d.distanceM / 1000).toFixed(1).replace(".", ",")} km` : null;
  const min = d.durationS ? `~${Math.round(d.durationS / 60)} min` : null;
  const price = d.price ? `${d.price} zł${d.priceKind === "fixed" ? " (cena z cennika)" : " (szacunek)"}` : "do ustalenia";
  const L = [];
  L.push(r.mode === "now" ? "🚖 <b>KURS TERAZ</b>" : `📅 <b>REZERWACJA: ${esc(whenLabel(d.when))}</b>`);
  L.push("");
  L.push(`📍 <b>Skąd:</b> <a href="${mapLink(d.pickup)}">${esc(d.pickup.address)}</a>${d.pickup.gps ? (d.pickup.near ? " (GPS klienta – w pobliżu, zadzwoń)" : " (GPS klienta)") : ""}`);
  L.push(`🏁 <b>Dokąd:</b> <a href="${mapLink(d.dest)}">${esc(d.dest.address)}</a>`);
  L.push("");
  L.push(`👤 ${esc(d.name || "—")}   ☎️ ${esc(d.phone)}`);
  const extra = [`👥 ${d.pax} os.`];
  if (d.luggage) extra.push(`🧳 ${esc(d.luggage)}`);
  if (d.flight && !d.flightInfo) extra.push(`✈️ ${esc(d.flight)}`);
  L.push(extra.join("   "));
  if (d.flightInfo) L.push(`✈️ ${esc(d.flightInfo)}`);
  L.push(`📏 ${[km, min].filter(Boolean).join(" · ") || "trasa nieznana"}   💰 ${price}`);
  if (r.mode === "now" && d.approachS && r.status === "pending") {
    const km = d.approachM ? `${(d.approachM / 1000).toFixed(1).replace(".", ",")} km, ` : "";
    L.push(d.approachFrom === "live"
      ? `🚗 Od Ciebie do klienta: ${km}~${driveMin(d)} min ${d.approachApprox ? "(szacunek)" : "(Google, z korkami)"}`
      : `⚠️ Nie widzę Twojej lokalizacji na żywo – liczę od bazy: ${km}~${driveMin(d)} min.\nUdostępnij lokalizację na żywo, a czas policzę od Ciebie.`);
  }
  if (d.liveEtaAt && (r.status === "enroute" || r.status === "ontrip")) {
    L.push(`📡 Google: ${d.liveKm != null ? String(d.liveKm).replace(".", ",") + " km, " : ""}na miejscu ok. ${clockWarsaw(d.liveEtaAt)}`);
  }
  if (d.returnTrip) L.push(`🔁 Powrót: ${esc(d.returnTrip)}`);
  if (d.notes) L.push(`📝 ${esc(d.notes)}`);
  L.push("");
  let st = `<b>Status:</b> ${STATUS_PL[r.status] || r.status}`;
  if (r.status === "enroute" && r.eta_at) st += ` – u klienta ok. ${clockWarsaw(r.eta_at)}`;
  L.push(st);
  return L.join("\n");
}

export async function notifyDriver(env, r) {
  const j = await tg(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID, text: driverText(r), parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard(r) },
  });
  return j && j.ok ? j.result.message_id : null;
}

export async function syncDriverMessage(env, r) {
  if (!r.tg_msg) return;
  await tg(env, "editMessageText", {
    chat_id: env.TELEGRAM_CHAT_ID, message_id: r.tg_msg, text: driverText(r), parse_mode: "HTML",
    disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard(r) },
  });
}
