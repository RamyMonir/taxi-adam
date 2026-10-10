// Returning customers: rides are deleted after 30 days, so a small customer list (phone, name, number of
// rides, last ride) is kept for 2 years to tell the driver "new customer" or "regular, 5 rides".
import { db } from "./rides.js";

const KEEP_MS = 2 * 365 * 864e5;

// one form for every way of typing the same number: "600 100 200", "+48600100200", "0048-600-100-200"
export function phoneKey(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("48")) d = d.slice(2);
  return d.length >= 9 ? d : "";
}

let ready = false;
async function cdb(env) {
  const d = await db(env);
  if (!ready) {
    await d.prepare(`CREATE TABLE IF NOT EXISTS customers (
      phone TEXT PRIMARY KEY, name TEXT, orders INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0,
      first INTEGER, last INTEGER, last_route TEXT)`).run();
    await d.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, name TEXT, picture TEXT, phone TEXT, created INTEGER, seen INTEGER)").run();
    ready = true;
  }
  return d;
}

// the signed-in account with this phone number (only when exactly one account has it)
async function accountByPhone(d, key) {
  const rs = await d.prepare("SELECT id, name, phone FROM users WHERE phone IS NOT NULL AND phone != ''").all();
  const hits = (rs.results || []).filter((u) => phoneKey(u.phone) === key);
  return hits.length === 1 ? hits[0] : null;
}

// -> snapshot stored with the ride and shown to the driver
export async function lookupCustomer(env, phone) {
  const key = phoneKey(phone);
  if (!key) return null;
  const d = await cdb(env);
  const [c, acc] = await Promise.all([
    d.prepare("SELECT * FROM customers WHERE phone = ? AND last > ?").bind(key, Date.now() - KEEP_MS).first(),
    accountByPhone(d, key),
  ]);
  return {
    orders: c ? c.orders : 0, done: c ? c.done : 0, last: c ? c.last : null, lastRoute: c ? c.last_route : "", name: c ? c.name : "",
    uid: acc ? acc.id : null, account: !!acc, accountName: acc ? acc.name : "",
  };
}

export async function recordOrder(env, r) {
  const key = phoneKey(r.data.phone);
  if (!key) return;
  const now = Date.now(), route = `${short(r.data.pickup.address)} → ${short(r.data.dest.address)}`;
  await (await cdb(env)).prepare(
    `INSERT INTO customers (phone, name, orders, done, first, last, last_route) VALUES (?1, ?2, 1, 0, ?3, ?3, ?4)
     ON CONFLICT(phone) DO UPDATE SET orders = orders + 1, last = ?3, last_route = ?4, name = CASE WHEN ?2 != '' THEN ?2 ELSE name END`
  ).bind(key, r.data.name || "", now, route).run();
}

export async function recordDone(env, r) {
  const key = phoneKey(r.data.phone);
  if (key) await (await cdb(env)).prepare("UPDATE customers SET done = done + 1 WHERE phone = ?").bind(key).run();
}

export async function purgeCustomers(env) {
  await (await cdb(env)).prepare("DELETE FROM customers WHERE last < ?").bind(Date.now() - KEEP_MS).run();
}

const short = (a) => String(a || "").split(",").slice(0, 2).join(",").trim();
const plural = (n) => (n === 1 ? "kurs" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "kursy" : "kursów");
const day = (ms) => new Date(ms).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric" });

// the line in the driver's Telegram message
export function customerLine(c, esc) {
  if (!c) return "";
  const showAcc = c.accountName && c.accountName !== c.name;
  const acc = c.account ? ` · 🔐 ma konto na stronie${showAcc ? " (" + esc(c.accountName) + ")" : ""}` : "";
  if (!c.orders) return `🆕 <b>Nowy klient</b>${acc}`;
  const what = c.done ? `${c.done} ${plural(c.done)}` : `zamawiał ${c.orders}×`;
  return `⭐ <b>Stały klient</b>: ${what}${c.name ? " · " + esc(c.name) : ""}${acc}\n   ostatnio ${day(c.last)}: ${esc(c.lastRoute)}`;
}
