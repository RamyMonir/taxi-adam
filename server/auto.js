// Run by the minute timer (functions/api/admin/cron.js):
//  - auto-assign: rides that wait for the owner while he's busy go to the best driver, and the owner is told
//      a website reservation nobody assigned for AUTO_ASSIGN_MIN (default 10)   -> the ⭐ driver free at that time
//      a "now" ride left with the owner for AUTO_NOW_MIN (default 2) – nobody was free or his pick said no -> the fastest free driver
//    "0" switches a rule off.
//  - flight watch: reservations with a flight number (AERODATABOX_KEY): a later landing moves the airport pickup,
//    a delayed / cancelled departure is reported. Driver and the owner get a message, the customer's page shows the new time.
import { load, transition, tg, notifyDriver, syncDriverMessage, saveIfUnchanged } from "./rides.js";
import { availability, offerToDriver } from "./fleet.js";
import { currentCar } from "./cars.js";
import { assign } from "./assign.js";
import { lookupFlight, flightLine } from "./flights.js";
import { esc, nowWarsaw, warsawMs, whenLabel } from "./util.js";
import { OWNER, BRAND, EX } from "./brand.js";

const minutes = (v, dflt) => { const n = parseFloat(v); return Number.isFinite(n) ? n : dflt; };
const say = (env, chat, text, replyTo) => tg(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: replyTo || undefined });
const shortA = (a) => esc(String(a || "").split(",")[0]);

/* ---------------- auto-assign ---------------- */
export async function autoAssign(env, d1) {
  const out = { reservations: 0, now: 0 };
  const resMin = minutes(env.AUTO_ASSIGN_MIN, 10), nowMin = minutes(env.AUTO_NOW_MIN, 2);
  const rows = (await d1.prepare("SELECT id FROM rides WHERE status = 'pending'").all()).results || [];
  for (const { id } of rows) {
    const r = await load(env, id);
    if (!r || r.data.driverId || r.data.autoAt) continue;
    const d = r.data, waited = Date.now() - (d.stageAt || d.pendingSince || r.created);
    try {
      if (r.mode === "later" && resMin > 0 && waited >= resMin * 60000 && (!d.when || d.when > nowWarsaw(30))) {
        if (await assignReservation(env, r)) out.reservations++;
      } else if (r.mode === "now" && nowMin > 0 && ["manual", "owner"].includes(d.stage) && waited >= nowMin * 60000) {
        if (await sendNowRide(env, r)) out.now++;
      }
    } catch (e) { console.log("auto", id, e.message); }
  }
  return out;
}

// a website reservation the owner hasn't assigned: the ⭐ driver (free at that time, no clash)
async function assignReservation(env, r) {
  const a = await availability(env, r);
  const best = a.best && a.best.x;
  if (!best) { await transition(env, r.id, ["pending"], (x) => { if (x.data.driverId) return false; x.data.autoAt = Date.now(); }); return false; }
  const d = r.data, ownerMsg = d.offers?.owner?.msg || r.tg_msg, prev = r.updated;
  assign(r, best, await currentCar(env, best.id).catch(() => null));
  r.status = "scheduled"; d.ownerInfo = ownerMsg; d.offers = {}; r.tg_msg = null; d.autoAt = Date.now(); d.autoBy = "reservation";
  if (!(await saveIfUnchanged(env, r, prev))) return false;   // the owner (or the customer) acted at this very moment
  const mid = await notifyDriver(env, r, best.chat_id);
  r = (await transition(env, r.id, ["scheduled"], (x) => { x.tg_msg = mid; })) || r;
  await syncDriverMessage(env, r);
  const when = esc(whenLabel(d.when));
  await say(env, best.chat_id, `📅 Dostajesz rezerwację na <b>${when}</b> (przydzielona automatycznie – ${OWNER.nom} był zajęty). W dniu kursu kliknij „🚕 Wyjeżdżam do klienta”.`, mid);
  await say(env, env.TELEGRAM_CHAT_ID, `🤖 <b>Przydzieliłem za Ciebie</b> rezerwację ${when}: ${shortA(d.pickup.address)} → ${shortA(d.dest.address)}\n` +
    `👤 <b>${esc(best.name)}</b> – wolny o tej porze, bez kolizji. Nie odpowiedziałeś w ${minutes(env.AUTO_ASSIGN_MIN, 10)} min.`, ownerMsg);
  return true;
}

// a "now" ride stuck with the owner: the fastest free driver gets it (the owner's own buttons keep working)
async function sendNowRide(env, r) {
  const a = await availability(env, r);
  const fresh = a.free.filter((w) => !(r.data.offers || {})[w.x.id] && !w.clash);
  if (!fresh.length) return false;   // still nobody: keep waiting (the ride expires as before)
  const prev = r.updated, d = r.data, best = fresh[0].x, waitedMin = Math.round((Date.now() - (d.stageAt || r.created)) / 60000);
  if (!(await offerToDriver(env, r, best))) return false;   // adds him to the offers (the owner's buttons keep working)
  d.stage = fresh.length > 1 ? "nearest" : "all"; d.stageAt = Date.now(); d.autoAt = Date.now(); d.autoBy = "now";   // no answer in a minute -> all free
  if (!(await saveIfUnchanged(env, r, prev))) return false;
  await syncDriverMessage(env, r);
  await say(env, env.TELEGRAM_CHAT_ID, `🤖 <b>Kurs czekał ${waitedMin} min</b> – wysłałem go do: <b>${esc(best.name)}</b>` +
    `${fresh[0].etaS != null ? ` (~${Math.max(1, Math.round(fresh[0].etaS / 60))} min do klienta)` : ""}.\n${shortA(d.pickup.address)} → ${shortA(d.dest.address)}`, d.ownerInfo || d.offers?.owner?.msg);
  return true;
}

/* ---------------- flight watch ---------------- */
const pad = (n) => String(n).padStart(2, "0");
// local "YYYY-MM-DD" + "HH:MM" + minutes, rounded up to 5 min -> "YYYY-MM-DDTHH:MM"
export function shiftLocal(date, time, add) {
  const t = new Date(`${date}T${time}:00Z`); t.setUTCMinutes(t.getUTCMinutes() + add);
  t.setUTCMinutes(Math.ceil(t.getUTCMinutes() / 5) * 5);
  return t.toISOString().slice(0, 16);
}
// pure: what to do with this reservation after a flight lookup -> {when?, alert?, seen}
export function flightDecision(d, f, now = nowWarsaw()) {
  if (!f || !f.found) return { seen: d.flightSeen || null };
  const end = f.kind === "dep" ? f.dep : f.arr;
  const seen = { kind: f.kind, time: end && end.time, date: end && end.date, status: f.status || "" };
  const old = d.flightSeen || {};
  const res = { seen, info: flightLine(f) };
  const bad = /cancel/i.test(f.status || "");
  if (bad && !/cancel/i.test(old.status || "")) res.alert = "cancelled";
  if (f.kind === "arr" && end && end.time && end.date && !bad) {
    const pickup = shiftLocal(end.date, end.time, 20);   // the driver waits 20 min after landing (as the booking form suggests)
    const diff = (warsawMs(pickup) - warsawMs(d.when)) / 60000;
    if (Math.abs(diff) >= 10 && pickup > now) { res.when = pickup; res.alert = res.alert || (diff > 0 ? "later" : "earlier"); }
  }
  if (f.kind === "dep" && end && end.time && end.scheduled && end.time !== end.scheduled && old.time !== end.time && !bad) res.alert = res.alert || "depDelay";
  return res;
}

export async function watchFlights(env, d1) {
  const out = { checked: 0, moved: 0, alerts: 0 };
  if (!env.AERODATABOX_KEY) return out;
  const now = nowWarsaw(), until = nowWarsaw(26 * 60);
  const rows = (await d1.prepare("SELECT id FROM rides WHERE status IN ('pending','scheduled') AND mode = 'later'").all()).results || [];
  for (const { id } of rows) {
    const r = await load(env, id), d = r && r.data;
    if (!d || !d.flight || !d.when || d.when < now || d.when > until) continue;
    const soon = d.when <= nowWarsaw(180);
    if (Date.now() - (d.flightCheckedAt || 0) < (soon ? 5 : 15) * 60000) continue;
    out.checked++;
    const f = await lookupFlight(env, String(d.flight).toUpperCase().replace(/[^A-Z0-9]/g, ""), d.when.slice(0, 10)).catch(() => null);
    const dec = flightDecision(d, f, now);
    const was = d.when;
    const next = await transition(env, id, ["pending", "scheduled"], (x) => {
      x.data.flightCheckedAt = Date.now();
      if (dec.seen) x.data.flightSeen = dec.seen;
      if (dec.info) x.data.flightInfo = dec.info;
      if (dec.when) { x.data.when = dec.when; x.data.remindedAt = null; }
    });
    if (!next || !dec.alert) continue;
    if (dec.when) out.moved++;
    out.alerts++;
    await syncDriverMessage(env, next);
    const fl = esc(String(d.flight).toUpperCase()), where = `${shortA(d.pickup.address)} → ${shortA(d.dest.address)}`;
    const text = {
      later: `✈️ <b>${fl} ląduje później</b> – nowy odbiór: <b>${esc(whenLabel(dec.when))}</b> (było ${esc(was.slice(11, 16))}).\n${where}`,
      earlier: `✈️ <b>${fl} ląduje wcześniej</b> – nowy odbiór: <b>${esc(whenLabel(dec.when))}</b> (było ${esc(was.slice(11, 16))}).\n${where}`,
      cancelled: `⚠️ <b>Lot ${fl} ODWOŁANY</b> – zadzwoń do klienta (${esc(d.phone || "")}).\n${where}, ${esc(whenLabel(was))}`,
      depDelay: `✈️ <b>Wylot ${fl} opóźniony</b> (${esc(dec.seen.time)} zamiast ${esc(f.dep.scheduled)}) – odbiór bez zmian (${esc(was.slice(11, 16))}); zadzwoń do klienta, jeśli chce później.\n${where}`,
    }[dec.alert];
    const chats = new Set([String(env.TELEGRAM_CHAT_ID)]);
    if (next.data.chat) chats.add(String(next.data.chat));
    for (const c of chats) await say(env, c, text, c === String(next.data.chat) ? next.tg_msg : undefined);
  }
  return out;
}
