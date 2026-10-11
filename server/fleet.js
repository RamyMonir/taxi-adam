// Drivers: Adam (owner) + his drivers, all in ONE Telegram bot – each driver in his own private chat with it.
// A driver is "on duty" while he shares his live location with the bot.
//
// "Now" rides: offered to the nearest free driver on duty first; if he doesn't accept within a minute
// (or declines), to every free driver on duty – the first to accept gets it. Nobody on duty -> Adam.
// Reservations: go to Adam, who confirms and gives them to himself or to a driver.
import { db, tg, isLive, saveIfUnchanged, load, driverText, keyboard } from "./rides.js";
import { route } from "./google.js";
import { kmBetween, hasXY, randomId, esc } from "./util.js";
import { CONFIG } from "./config.js";
import { isDemo, release } from "./cars.js";

// may this driver get a "now" ride: joined, on shift, free, with a car (Adam may drive without picking one),
// enough seats in the car he holds. Demo drivers (seed data) never get rides.
export function canDrive(x, busy, pax = 1) {
  if (!x || !x.chat_id || isDemo(x) || !isLive(x) || busy.has(x.id)) return false;
  if (!x.owner && !x.current_car_id) return false;
  const seats = x.car_seats ?? x.seats;
  return !seats || seats >= pax;
}

export const NEAREST_WAIT_MS = 60000;

let ready = false;
async function fdb(env) {
  const d = await db(env);
  if (!ready) {
    await d.prepare(`CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY, chat_id TEXT, name TEXT, phone TEXT, car TEXT, color TEXT, plate TEXT, seats INTEGER,
      code TEXT, active INTEGER NOT NULL DEFAULT 1, owner INTEGER NOT NULL DEFAULT 0,
      lat REAL, lng REAL, ts INTEGER, until INTEGER, hint_ts INTEGER, reminded INTEGER, created INTEGER)`).run();
    await d.prepare("CREATE INDEX IF NOT EXISTS drivers_chat ON drivers (chat_id)").run();
    // which Google listing (0..2 in GOOGLE_PLACES) his customers are asked to review; NULL = in turn
    try { await d.prepare("ALTER TABLE drivers ADD COLUMN listing INTEGER").run(); } catch (e) { /* there */ }
    // fleet cars, photo, commission (migrations/0002_fleet_cars.sql does the same for new databases)
    for (const col of ["current_car_id TEXT", "photo_key TEXT", "photo_ok INTEGER NOT NULL DEFAULT 0", "await_photo TEXT",
                       "pay_model TEXT", "driver_pct REAL", "daily_fee REAL"]) {
      try { await d.prepare(`ALTER TABLE drivers ADD COLUMN ${col}`).run(); } catch (e) { /* there */ }
    }
    ready = true;
  }
  return d;
}

// Adam's own row; the old single-driver location (table "driver") moves into it once
export async function ensureOwner(env) {
  const d = await fdb(env);
  let o = await d.prepare("SELECT * FROM drivers WHERE id = 'owner'").first();
  if (!o) {
    const old = await d.prepare("SELECT lat, lng, ts, hint_ts, until FROM driver WHERE id = 1").first().catch(() => null);
    await d.prepare(`INSERT OR IGNORE INTO drivers (id, chat_id, name, active, owner, lat, lng, ts, until, hint_ts, created)
                     VALUES ('owner', ?1, 'Adam', 1, 1, ?2, ?3, ?4, ?5, ?6, ?7)`)
      .bind(String(env.TELEGRAM_CHAT_ID || ""), old?.lat ?? null, old?.lng ?? null, old?.ts ?? null, old?.until ?? null, old?.hint_ts ?? null, Date.now()).run();
    o = await d.prepare("SELECT * FROM drivers WHERE id = 'owner'").first();
  } else if (env.TELEGRAM_CHAT_ID && o.chat_id !== String(env.TELEGRAM_CHAT_ID)) {
    await d.prepare("UPDATE drivers SET chat_id = ? WHERE id = 'owner'").bind(String(env.TELEGRAM_CHAT_ID)).run();
    o.chat_id = String(env.TELEGRAM_CHAT_ID);
  }
  return o;
}

export async function driverByChat(env, chatId) {
  if (chatId == null) return null;
  if (String(chatId) === String(env.TELEGRAM_CHAT_ID)) return ensureOwner(env);
  return (await (await fdb(env)).prepare("SELECT * FROM drivers WHERE chat_id = ? AND active = 1").bind(String(chatId)).first()) || null;
}
export async function getDriver(env, id) {
  if (!id || id === "owner") return ensureOwner(env);
  return (await (await fdb(env)).prepare("SELECT * FROM drivers WHERE id = ?").bind(id).first()) || null;
}
export async function listDrivers(env) {
  await ensureOwner(env);
  // + the car he holds now (cars are shared: server/cars.js)
  const rs = await (await fdb(env)).prepare(
    `SELECT d.*, c.make AS car_make, c.model AS car_model, c.color AS car_color, c.plate AS car_plate, c.seats AS car_seats
       FROM drivers d LEFT JOIN cars c ON c.id = d.current_car_id
      WHERE d.active = 1 ORDER BY d.owner DESC, d.created`).all();
  return rs.results || [];
}

export async function saveDriverPos(env, id, lat, lng, until) {
  await (await fdb(env)).prepare("UPDATE drivers SET lat = ?1, lng = ?2, ts = ?3, until = ?4, reminded = NULL WHERE id = ?5")
    .bind(lat, lng, Date.now(), until ?? null, id).run();
}
export async function markHint(env, id) {
  await (await fdb(env)).prepare("UPDATE drivers SET hint_ts = ? WHERE id = ?").bind(Date.now(), id).run();
}
export async function markReminded(env, id) {
  await (await fdb(env)).prepare("UPDATE drivers SET reminded = ? WHERE id = ?").bind(Date.now(), id).run();
}

// Adam: "/dodaj Marek 600100200" -> a one-time code for the driver's invite link
export async function addDriver(env, name, phone) {
  const id = randomId(6), code = randomId(10);
  await (await fdb(env)).prepare("INSERT INTO drivers (id, name, phone, code, active, owner, created) VALUES (?, ?, ?, ?, 1, 0, ?)")
    .bind(id, name, phone || null, code, Date.now()).run();
  return { id, code };
}
export async function bindDriver(env, code, chatId) {
  const d = await fdb(env);
  const drv = await d.prepare("SELECT * FROM drivers WHERE code = ? AND active = 1").bind(code).first();
  if (!drv) return null;
  await d.prepare("UPDATE drivers SET chat_id = NULL WHERE chat_id = ? AND id != ?").bind(String(chatId), drv.id).run();   // one chat = one driver
  await d.prepare("UPDATE drivers SET chat_id = ?, code = NULL WHERE id = ?").bind(String(chatId), drv.id).run();
  return { ...drv, chat_id: String(chatId), code: null };
}
export async function updateDriver(env, id, f) {
  const cols = ["name", "phone", "car", "color", "plate", "seats", "listing", "photo_key", "photo_ok", "await_photo", "pay_model", "driver_pct", "daily_fee"].filter((k) => f[k] !== undefined);
  if (!cols.length) return;
  await (await fdb(env)).prepare(`UPDATE drivers SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(", ")} WHERE id = ?${cols.length + 1}`)
    .bind(...cols.map((k) => f[k]), id).run();
}
export async function deactivateDriver(env, id) {
  await release(env, id, "admin").catch(() => null);   // his car is free again
  const d = await fdb(env);
  await d.prepare("UPDATE drivers SET active = 0, chat_id = NULL, code = NULL WHERE id = ? AND owner = 0").bind(id).run();
  if (String(id).startsWith("f_")) {   // from src/fleet.py: Adam removed him, the next file sync must not bring him back
    await d.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run();
    const row = await d.prepare("SELECT v FROM meta WHERE k = 'fleet_removed'").first();
    const ids = new Set(JSON.parse((row && row.v) || "[]")); ids.add(id);
    await d.prepare("INSERT INTO meta (k, v) VALUES ('fleet_removed', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify([...ids])).run();
  }
}
export async function newInviteCode(env, id) {
  const code = randomId(10);
  await (await fdb(env)).prepare("UPDATE drivers SET code = ? WHERE id = ? AND owner = 0").bind(code, id).run();
  return code;
}

// drivers busy with a ride right now
export async function busyDriverIds(env) {
  const rs = await (await db(env)).prepare(
    "SELECT json_extract(data, '$.driverId') AS d FROM rides WHERE status IN ('enroute','arrived','ontrip')").all();
  return new Set((rs.results || []).map((x) => x.d || "owner"));
}

// what the customer may see about the driver and the car
export function publicDriver(drv) {
  if (!drv) return null;
  return { name: drv.name || "", car: drv.car || "", color: drv.color || "", plate: drv.plate || "", seats: drv.seats || null, phone: drv.phone || null };
}

let botName = null;
export async function botUsername(env) {
  if (botName) return botName;
  const j = await tg(env, "getMe", {});
  botName = j && j.ok ? j.result.username : null;
  return botName;
}

/* ---------------- dispatch ---------------- */
export const chatOf = (env, r) => r.data.chat || String(env.TELEGRAM_CHAT_ID);

// send the ride to these drivers, each with his own distance to the customer
async function offerTo(env, r, drivers) {
  const out = {};
  await Promise.all(drivers.map(async (drv) => {
    const d = r.data, live = isLive(drv);
    const o = { chat: drv.chat_id, name: drv.name || "", at: Date.now(), approachFrom: live ? "live" : "base" };
    if (r.mode === "now" && hasXY(d.pickup)) {
      const x = await route(env, live ? { lat: drv.lat, lng: drv.lng } : CONFIG.base, d.pickup, true).catch(() => null);
      if (x) { o.approachS = x.durationS; o.approachM = x.distanceM; o.approachApprox = !!x.approx; }
    }
    const j = await tg(env, "sendMessage", { chat_id: drv.chat_id, text: driverText(r, o), parse_mode: "HTML",
      disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard(r, o, drv) } });
    if (j && j.ok) { o.msg = j.result.message_id; out[drv.id] = o; }
  }));
  return out;
}

// Adam sees every ride, also those that went to a driver
export function ownerInfoText(r) {
  const d = r.data, offers = d.offers || {};
  const who = d.driverId ? `👤 Kurs przyjął: <b>${esc(d.driver?.name || "")}</b>${d.driver?.car ? " · " + esc(d.driver.car) : ""}`
    : Object.values(offers).length ? `📨 Wysłano do: ${Object.values(offers).map((o) => esc(o.name) + (o.rejected ? " (odrzucił)" : "")).join(", ")}` : "";
  const st = { pending: "⏳ czeka na kierowcę", scheduled: "📅 zaplanowany", enroute: "🚕 kierowca jedzie", arrived: "📍 kierowca na miejscu",
               ontrip: "🛣 w trasie", done: "🏁 zakończony", declined: "❌ nikt nie przyjął", cancelled: "🚫 anulowany", expired: "⌛ bez odpowiedzi", noshow: "🙅 klient nie przyszedł" }[r.status] || r.status;
  return `📋 <b>${r.mode === "now" ? "Kurs teraz" : "Rezerwacja"}</b>: ${esc(shortA(d.pickup.address))} → ${esc(shortA(d.dest.address))}\n${who}\n<b>Status:</b> ${st}`;
}
const shortA = (a) => String(a || "").split(",").slice(0, 2).join(",");

async function ownerInfo(env, r, owner) {
  if (r.data.offers?.owner || r.data.driverId === "owner" || !owner?.chat_id) return;
  // with the panel: Adam can take it himself or give it to someone else while nobody has accepted yet
  const a = await availability(env, r).catch(() => null);
  const j = await tg(env, "sendMessage", { chat_id: owner.chat_id, text: ownerInfoText(r) + (a ? "\n\n" + availabilityText(a) : ""), parse_mode: "HTML",
    disable_notification: true, reply_markup: { inline_keyboard: a ? await ownerPanel(env, r, a) : [] } });
  if (j && j.ok) r.data.ownerInfo = j.result.message_id;
}

// first send of a new ride (website). Returns how many drivers got it.
export async function dispatchNew(env, r) {
  const [all, busy] = await Promise.all([listDrivers(env), busyDriverIds(env)]);
  const owner = all.find((x) => x.owner);
  let to, stage;
  if (r.mode === "later") {
    to = [owner]; stage = "owner";
    r.data.assignable = all.filter((x) => !x.owner && x.chat_id && !isDemo(x)).map((x) => ({ id: x.id, name: x.name || "kierowca" }));
  }
  else {
    const free = all.filter((x) => canDrive(x, busy, r.data.pax || 1));
    if (!free.length) { to = [owner]; stage = "owner"; }
    else {
      const p = r.data.pickup;
      if (hasXY(p)) free.sort((a, b) => kmBetween(a, p) - kmBetween(b, p));
      to = [free[0]]; stage = free.length > 1 ? "nearest" : "all";
    }
  }
  r.data.offers = await offerTo(env, r, to.filter((x) => x && x.chat_id));
  r.data.stage = stage; r.data.stageAt = Date.now();
  const first = Object.values(r.data.offers)[0];
  if (first) {   // the customer's "how long until a driver could be here" = the nearest driver's route
    r.data.approachS = first.approachS ?? null; r.data.approachM = first.approachM ?? null;
    r.data.approachFrom = first.approachFrom; r.data.approachApprox = !!first.approachApprox;
  }
  if (r.mode === "now") await ownerInfo(env, r, owner);
  return Object.keys(r.data.offers).length;
}

// Next step for a "now" ride nobody has taken yet: after a minute (or a "no") -> every free driver;
// everyone said no -> Adam; Adam said no too -> the customer sees "busy".
// Called by the customer's status page, the minute timer and the "no" button.
export async function escalate(env, r) {
  for (let tries = 0; tries < 3; tries++) {
    if (!r || r.status !== "pending" || r.mode !== "now") return r;
    const d = r.data, offers = d.offers || {};
    const open = Object.values(offers).filter((o) => !o.rejected);
    const due = d.stage === "nearest" && (Date.now() - (d.stageAt || 0) >= NEAREST_WAIT_MS || !open.length);
    const allNo = !open.length;
    if (!due && !allNo) return r;
    if (d.escalating && Date.now() - d.escalating < 20000) return r;   // another request is doing it

    const [all, busy] = await Promise.all([listDrivers(env), busyDriverIds(env)]);
    let next = [], stage = d.stage;
    if (d.stage === "nearest") {
      next = all.filter((x) => !offers[x.id] && canDrive(x, busy, d.pax || 1));
      stage = "all";
    }
    if (!next.length && allNo) {
      const owner = all.find((x) => x.owner);
      if (owner && owner.chat_id && !offers.owner) { next = [owner]; stage = "owner"; }
    }
    const prev = r.updated;
    if (!next.length) {
      if (!allNo) {   // nobody else to ask yet: keep waiting for the drivers who have it
        if (d.stage === "nearest") { d.stage = "all"; d.stageAt = Date.now(); if (await saveIfUnchanged(env, r, prev)) return r; r = await load(env, r.id); continue; }
        return r;
      }
      if (d.stage === "manual" && d.ownerInfo) return r;   // Adam picked the driver: his panel stays open, he decides again
      r.status = "declined"; d.declinedBy = "all";
      if (await saveIfUnchanged(env, r, prev)) return r;
      r = await load(env, r.id); continue;
    }
    // claim the step first, so two status-page polls don't send it twice
    d.escalating = Date.now();
    if (!(await saveIfUnchanged(env, r, prev))) { r = await load(env, r.id); continue; }
    const sent = await offerTo(env, r, next);
    for (let k = 0; k < 3; k++) {
      const cur = await load(env, r.id);
      if (!cur) return r;
      Object.assign(cur.data.offers = cur.data.offers || {}, sent);
      cur.data.stage = stage; cur.data.stageAt = Date.now(); cur.data.escalating = null;
      if (await saveIfUnchanged(env, cur, cur.updated)) return cur;
    }
    return r;
  }
  return r;
}

/* ---------------- Adam's dispatch panel ---------------- */
// Adam takes calls on his number: for a phone ride (and for website rides nobody has taken yet) he decides who drives –
// himself, the free drivers (nearest first), or one chosen driver. The panel shows who is free right now.
const pbtn = (text, data) => ({ text, callback_data: data });
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "kierowca";
const kmShort = (k) => (k == null ? "" : (k < 10 ? k.toFixed(1) : String(Math.round(k))).replace(".", ",") + " km");

// the team right now: free (car + live location, nearest first), on a ride, off duty / no car
export async function availability(env, r) {
  const [all, busy] = await Promise.all([listDrivers(env), busyDriverIds(env)]);
  const p = r && r.data ? r.data.pickup : null, pax = (r && r.data && r.data.pax) || 1;
  const team = all.filter((x) => !x.owner && x.chat_id && !isDemo(x));
  const free = team.filter((x) => canDrive(x, busy, pax))
    .map((x) => ({ x, km: hasXY(p) && x.lat != null ? kmBetween(x, p) : null }))
    .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
  const onRide = team.filter((x) => busy.has(x.id));
  const off = team.filter((x) => !busy.has(x.id) && !canDrive(x, busy, pax));
  return { free, onRide, off, team };
}
export function availabilityText(a) {
  const L = [a.free.length
    ? "🟢 <b>Wolni:</b> " + a.free.map(({ x, km }) => esc(firstName(x.name)) + (x.car_model || km != null ? ` (${[x.car_model, kmShort(km)].filter(Boolean).map(esc).join(", ")})` : "")).join(", ")
    : "🟢 <b>Wolni:</b> nikt w tej chwili"];
  if (a.onRide.length) L.push("🚕 W kursie: " + a.onRide.map((x) => esc(firstName(x.name))).join(", "));
  if (a.off.length) L.push("⚪ Poza zmianą / bez auta: " + a.off.map((x) => esc(firstName(x.name))).join(", "));
  return L.join("\n");
}
export async function ownerPanel(env, r, a) {
  a = a || (await availability(env, r));
  const id = r.id, rows = [[pbtn(r.mode === "now" ? "🙋 Jadę sam" : "🙋 Biorę sam", `dpo|${id}`)]];
  if (r.mode === "now") {
    if (a.free.length) rows.push([pbtn(`📨 Wyślij do wolnych kierowców (${a.free.length})`, `dps|${id}`)]);
    for (const { x, km } of a.free.slice(0, 6)) rows.push([pbtn(`🟢 ${firstName(x.name)}${x.car_model ? " · " + x.car_model : ""}${km != null ? " · " + kmShort(km) : ""}`, `dpa|${id}|${x.id}`)]);
  } else {
    for (const x of a.team.slice(0, 8)) rows.push([pbtn(`👤 Przydziel: ${x.name}`, `dpa|${id}|${x.id}`)]);
  }
  rows.push([r.status === "draft" ? pbtn("🗑 Usuń", `del|${id}`) : pbtn("❌ Odrzuć kurs", `x|${id}`)]);
  return rows;
}
// "📨 Wyślij do wolnych kierowców": nearest free driver first, then (after a minute / a "no") all free ones
export async function offerToFree(env, r) {
  const a = await availability(env, r);
  if (!a.free.length) return 0;
  const sent = await offerTo(env, r, [a.free[0].x]);
  r.data.offers = { ...(r.data.offers || {}), ...sent };
  r.data.stage = a.free.length > 1 ? "nearest" : "all"; r.data.stageAt = Date.now();
  return Object.keys(sent).length;
}
// "🟢 Marek": offer it to one driver; if he says no, it comes back to Adam
export async function offerToDriver(env, r, drv) {
  const sent = await offerTo(env, r, [drv]);
  r.data.offers = { ...(r.data.offers || {}), ...sent };
  r.data.stage = "manual"; r.data.stageAt = Date.now();
  return Object.keys(sent).length;
}
