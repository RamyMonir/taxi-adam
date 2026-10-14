// Chat between the customer (ride status page) and the taxi side, through the existing Telegram bot.
// Customer -> the assigned driver's chat, or Adam's while nobody has the ride. The driver/Adam answers by REPLYING
// to that Telegram message (or with a quick-reply button); the status page polls GET /api/rides/:id/messages.
// Status changes add short system lines ("Kierowca jest na miejscu"). The customer never sees a phone number,
// a Telegram username or a chat id: replies are signed "Kierowca" / "Taxi Adam".
import { db, tg, OPEN } from "./rides.js";
import { esc, clockWarsaw, whenLabel } from "./util.js";

export const MAX_LEN = 500;
export const PER_MINUTE = 10, PER_RIDE = 60;
export const QUICK_CUSTOMER = ["Jestem przed budynkiem", "Proszę zadzwonić", "Mam dużo bagażu", "Spóźnię się 5 minut"];
export const QUICK_TAXI = ["Jadę", "Będę za 5 min", "Jestem na miejscu", "Proszę wyjść przed budynek"];
const FINAL = ["done", "cancelled", "declined", "expired", "noshow"];
const closeMs = (env) => { const m = parseFloat(env && env.CHAT_CLOSE_MIN); return (Number.isFinite(m) ? m : 120) * 60000; };

/* ---------------- pure helpers (unit-tested) ---------------- */
// user text -> {text} or {error}: no HTML, no control characters, at most 2 empty lines in a row, 1–500 characters
export function cleanText(s) {
  if (typeof s !== "string") return { error: "empty" };
  const t = s.replace(/<[^>]*>/g, "").replace(new RegExp("[\\u0000-\\u0009\\u000B-\\u001F\\u007F\\u200B-\\u200F\\u2028-\\u202E\\u2066-\\u2069]", "g"), "")
    .replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
  if (!t) return { error: "empty" };
  if ([...t].length > MAX_LEN) return { error: "long" };
  return { text: t };
}
// the chat is open while the ride is open, and for 2 hours after it ended
export function chatOpen(r, env, now = Date.now()) {
  if (!r) return false;
  if (OPEN.includes(r.status)) return true;
  return FINAL.includes(r.status) && now - (r.updated || 0) <= closeMs(env);
}
// who gets the customer's message: the driver who has the ride, else Adam
export function routeOf(r, env) {
  const d = (r && r.data) || {};
  if (d.driverId && d.chat) return { chat: String(d.chat), sender: d.driverId === "owner" ? "owner" : "driver" };
  return { chat: String(env.TELEGRAM_CHAT_ID), sender: "owner" };
}
// what the customer sees of one row (no Telegram ids)
export function publicMessage(m) {
  const who = { customer: "Ty", driver: "Kierowca", owner: "Taxi Adam", system: "" }[m.sender] ?? "";
  return { id: m.id, from: m.sender === "customer" ? "me" : m.sender === "system" ? "system" : "taxi", who, text: m.text, at: m.created_at };
}
// system line for a status (once per status; null = none)
export function systemLine(r) {
  const d = r.data || {};
  switch (r.status) {
    case "scheduled": return { kind: "st:scheduled", text: `Rezerwacja potwierdzona – kierowca przyjedzie ${whenLabel(d.when)}` };
    case "enroute": return { kind: "st:enroute", text: r.eta_at ? `Kierowca przyjął kurs – będzie ok. ${clockWarsaw(r.eta_at)}` : "Kierowca przyjął kurs i jedzie do Ciebie" };
    case "arrived": return { kind: "st:arrived", text: "Kierowca jest na miejscu" };
    case "ontrip": return { kind: "st:ontrip", text: "Kurs rozpoczęty – miłej podróży!" };
    case "done": return { kind: "st:done", text: "Kurs zakończony – dziękujemy!" };
    case "cancelled": return { kind: "st:cancelled", text: d.cancelledBy === "driver" ? "Kierowca anulował kurs" : "Kurs anulowany" };
    case "noshow": return { kind: "st:noshow", text: "Kierowca nie zastał Cię pod adresem" };
    default: return null;
  }
}
const shortAddr = (a) => String(a || "").split(",")[0].trim();
export const shortId = (id) => String(id || "").slice(0, 6);
// the Telegram message for one customer line (driver side: may show the customer's phone, like every ride message)
export function taxiText(r, text) {
  const d = r.data || {};
  return `💬 <b>Klient</b> · kurs #${esc(shortId(r.id))} · ${esc(shortAddr(d.pickup && d.pickup.address))}\n\n${esc(text)}\n\n` +
    (d.phone ? `☎️ ${esc(d.name || "Klient")}: ${esc(d.phone)}\n` : "") + "<i>↩️ Odpowiedz na tę wiadomość, żeby napisać do klienta.</i>";
}
export const quickKeyboard = (rideId) => ({ inline_keyboard: [
  [{ text: QUICK_TAXI[0], callback_data: `cm|${rideId}|0` }, { text: QUICK_TAXI[1], callback_data: `cm|${rideId}|1` }],
  [{ text: QUICK_TAXI[2], callback_data: `cm|${rideId}|2` }, { text: QUICK_TAXI[3], callback_data: `cm|${rideId}|3` }],
] });

/* ---------------- storage ---------------- */
let ready = false;
async function cdb(env) {
  const d = await db(env);
  if (!ready) {
    await d.prepare(`CREATE TABLE IF NOT EXISTS ride_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ride_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL,
      created_at INTEGER NOT NULL, tg_chat_id TEXT, tg_message_id INTEGER, kind TEXT)`).run();
    await d.prepare("CREATE INDEX IF NOT EXISTS ride_messages_ride ON ride_messages (ride_id, id)").run();
    await d.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ride_messages_kind ON ride_messages (ride_id, kind) WHERE kind IS NOT NULL").run();
    await d.prepare(`CREATE TABLE IF NOT EXISTS chat_tg (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, ride_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY (chat_id, message_id))`).run();
    ready = true;
  }
  return d;
}
export async function addMessage(env, rideId, sender, text, { kind = null, now = Date.now() } = {}) {
  const row = await (await cdb(env)).prepare(
    "INSERT OR IGNORE INTO ride_messages (ride_id, sender, text, created_at, kind) VALUES (?, ?, ?, ?, ?) RETURNING id"
  ).bind(rideId, sender, text, now, kind).first();
  return row ? row.id : null;   // null = this system line was already there
}
export async function listMessages(env, rideId, after = 0) {
  const rs = await (await cdb(env)).prepare("SELECT id, sender, text, created_at FROM ride_messages WHERE ride_id = ? AND id > ? ORDER BY id LIMIT 200")
    .bind(rideId, after | 0).all();
  return rs.results || [];
}
export async function customerCount(env, rideId) {
  const row = await (await cdb(env)).prepare("SELECT COUNT(*) AS n FROM ride_messages WHERE ride_id = ? AND sender = 'customer'").bind(rideId).first();
  return row ? row.n : 0;
}
async function mapTg(env, chat, messageId, rideId, msgRowId) {
  const d = await cdb(env);
  await d.prepare("INSERT OR REPLACE INTO chat_tg (chat_id, message_id, ride_id, created_at) VALUES (?, ?, ?, ?)").bind(String(chat), messageId, rideId, Date.now()).run();
  if (msgRowId) await d.prepare("UPDATE ride_messages SET tg_chat_id = ?, tg_message_id = ? WHERE id = ?").bind(String(chat), messageId, msgRowId).run();
}
// a Telegram message (in this chat) that belongs to a ride's chat -> ride id
export async function rideByTg(env, chat, messageId) {
  const row = await (await cdb(env)).prepare("SELECT ride_id FROM chat_tg WHERE chat_id = ? AND message_id = ?").bind(String(chat), messageId).first();
  return row ? row.ride_id : null;
}
export async function purgeChat(env) {
  const d = await cdb(env);
  await d.prepare("DELETE FROM ride_messages WHERE ride_id NOT IN (SELECT id FROM rides)").run();
  await d.prepare("DELETE FROM chat_tg WHERE ride_id NOT IN (SELECT id FROM rides)").run();
}

/* ---------------- flows ---------------- */
// customer -> taxi: stored, then sent to the driver (or Adam) with the quick-reply buttons
export async function customerSays(env, r, text) {
  const id = await addMessage(env, r.id, "customer", text);
  const to = routeOf(r, env);
  const j = await tg(env, "sendMessage", { chat_id: to.chat, text: taxiText(r, text), parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: quickKeyboard(r.id) });
  if (j && j.ok) await mapTg(env, to.chat, j.result.message_id, r.id, id);
  return id;
}
// driver/Adam -> customer (a reply or a quick button). me = the drivers row of who answered.
export function canAnswer(r, me) {
  if (!r || !me) return false;
  if (me.owner) return true;
  return !!r.data.driverId && r.data.driverId === me.id;
}
export async function taxiSays(env, r, me, text) {
  return addMessage(env, r.id, me.owner ? "owner" : "driver", text);
}
// system line for the ride's current status (called after every change); when a driver gets a ride the customer
// already wrote about, he gets those lines too, so nothing said to Adam is lost
export async function chatStatus(env, r) {
  const line = systemLine(r);
  if (!line) return;
  const added = await addMessage(env, r.id, "system", line.text, { kind: line.kind });
  if (!added || !["enroute", "scheduled"].includes(r.status) || !r.data.driverId || r.data.driverId === "owner") return;
  const said = (await listMessages(env, r.id)).filter((m) => m.sender === "customer");
  if (!said.length) return;
  const text = said.slice(-5).map((m) => `• ${m.text}`).join("\n");
  const j = await tg(env, "sendMessage", { chat_id: r.data.chat, parse_mode: "HTML", disable_web_page_preview: true,
    text: taxiText(r, `Klient pisał wcześniej:\n${text}`), reply_markup: quickKeyboard(r.id) });
  if (j && j.ok) await mapTg(env, r.data.chat, j.result.message_id, r.id, null);
}
