// Fleet from a file: src/fleet.py (CARS, DRIVERS) -> server/config.js (CONFIG.fleet) -> database.
// Edit the file, deploy, and the next bot message (or /api/admin/setup) brings the database in line:
// new cars/drivers are added, changed ones updated, removed ones retired. Rides and reports keep their history.
// Cars are matched by plate (also ones added by hand with /dodajauto); drivers by their "key" in the file.
import { db, tg } from "./rides.js";
import { CONFIG } from "./config.js";
import { randomId, esc } from "./util.js";
import { ensureOwner, botUsername } from "./fleet.js";
import { releaseCar, release } from "./cars.js";

/* ---------------- pure planning (unit-tested) ---------------- */
export const plateKey = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const fileCarId = (plate) => "f_" + plateKey(plate).toLowerCase();
export const fileDriverId = (key) => "f_" + String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function payFields(pay) {
  if (pay && pay.percent != null) return { pay_model: "percent", driver_pct: Number(pay.percent), daily_fee: null };
  if (pay && pay.daily_fee != null) return { pay_model: "daily_fee", daily_fee: Number(pay.daily_fee), driver_pct: null };
  return { pay_model: null, driver_pct: null, daily_fee: null };
}
const same = (a, b) => (a ?? null) === (b ?? null) || String(a ?? "") === String(b ?? "");

// file (cfg) vs database rows -> what to change
// removed = file drivers Adam removed in Telegram (🗑): left alone until they get a new key in the file
export function planFleetSync(cfg, carRows, driverRows, removed = new Set()) {
  const plan = { addCars: [], updateCars: [], retireCars: [], addDrivers: [], updateDrivers: [], retireDrivers: [] };
  const filePlates = new Set();
  for (const c of cfg.cars || []) {
    const k = plateKey(c.plate); if (!k || filePlates.has(k)) continue;
    filePlates.add(k);
    const want = { make: String(c.make || "").trim(), model: String(c.model || "").trim(), color: String(c.color || "").trim(),
                   plate: String(c.plate).toUpperCase().replace(/\s+/g, " ").trim(), seats: Number(c.seats) || 4 };
    const row = carRows.find((r) => plateKey(r.plate) === k);
    if (!row) { plan.addCars.push({ id: fileCarId(c.plate), ...want }); continue; }
    const f = {};
    for (const key of ["make", "model", "color", "plate", "seats"]) if (!same(row[key], want[key])) f[key] = want[key];
    if (row.status === "inactive") f.status = "active";
    if (Object.keys(f).length) plan.updateCars.push({ id: row.id, fields: f });
  }
  for (const r of carRows) {
    if (String(r.id).startsWith("f_") && r.status !== "inactive" && !filePlates.has(plateKey(r.plate))) plan.retireCars.push(r.id);
  }
  const fileIds = new Set();
  for (const d of cfg.drivers || []) {
    const id = fileDriverId(d.key); if (id === "f_" || fileIds.has(id)) continue;
    fileIds.add(id);
    if (removed.has(id)) continue;
    const want = { name: String(d.name || "").trim().slice(0, 30), phone: String(d.phone || "").trim() || null, ...payFields(d.pay) };
    const row = driverRows.find((r) => r.id === id);
    if (!row) { plan.addDrivers.push({ id, ...want }); continue; }
    const f = {};
    for (const key of Object.keys(want)) if (!same(row[key], want[key])) f[key] = want[key];
    if (!row.active) f.active = 1;
    if (Object.keys(f).length) plan.updateDrivers.push({ id, fields: f });
  }
  for (const r of driverRows) if (String(r.id).startsWith("f_") && r.active && !fileIds.has(r.id)) plan.retireDrivers.push(r.id);
  return plan;
}
export const planIsEmpty = (p) => Object.values(p).every((x) => !x.length);

/* ---------------- applying it ---------------- */
let syncedHash = null;
async function meta(d) { await d.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run(); }

// cheap when nothing changed (in-memory + one D1 read); force = always compare (setup page)
export async function ensureFleetSynced(env, { force = false } = {}) {
  const f = CONFIG.fleet;
  if (!f || !env.DB || env.FLEET_FROM_FILE === "0") return null;   // "0": tests that set up their own cars
  if (!force && syncedHash === f.hash) return null;
  const d = await db(env);
  await meta(d);
  if (!force) {
    const row = await d.prepare("SELECT v FROM meta WHERE k = 'fleet_hash'").first();
    if (row && row.v === f.hash) { syncedHash = f.hash; return null; }
  }
  await ensureOwner(env);   // creates the drivers table + Adam's row
  const [cars, drivers, rm] = await Promise.all([d.prepare("SELECT * FROM cars").all(), d.prepare("SELECT * FROM drivers").all(),
    d.prepare("SELECT v FROM meta WHERE k = 'fleet_removed'").first()]);
  const plan = planFleetSync(f, cars.results || [], drivers.results || [], new Set(JSON.parse((rm && rm.v) || "[]")));
  // claim the change, so two requests at the same moment don't both send Adam the links
  const claim = await d.prepare("INSERT INTO meta (k, v) VALUES ('fleet_hash', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1 WHERE v IS NOT ?1").bind(f.hash).run();
  const mine = force || !!(claim && claim.meta && claim.meta.changes);
  syncedHash = f.hash;
  if (!mine) return null;
  return applyPlan(env, d, plan);
}

async function applyPlan(env, d, plan) {
  const now = Date.now(), out = { added: [], updated: 0, retired: 0, invites: [] };
  for (const c of plan.addCars) {
    await d.prepare("INSERT OR IGNORE INTO cars (id, make, model, color, plate, seats, status, created) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)")
      .bind(c.id, c.make, c.model, c.color, c.plate, c.seats, now).run();
    out.added.push(`🚗 ${esc(c.make)} ${esc(c.model)} · ${esc(c.plate)}`);
  }
  for (const u of plan.updateCars) {
    const cols = Object.keys(u.fields);
    await d.prepare(`UPDATE cars SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(", ")} WHERE id = ?${cols.length + 1}`).bind(...cols.map((k) => u.fields[k]), u.id).run();
    out.updated++;
  }
  for (const id of plan.retireCars) {
    await releaseCar(env, id, "admin").catch(() => {});
    await d.prepare("UPDATE cars SET status = 'inactive' WHERE id = ?").bind(id).run();
    out.retired++;
  }
  for (const x of plan.addDrivers) {
    await d.prepare(`INSERT OR IGNORE INTO drivers (id, name, phone, code, active, owner, created, pay_model, driver_pct, daily_fee)
                     VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?, ?)`).bind(x.id, x.name, x.phone, randomId(10), now, x.pay_model, x.driver_pct, x.daily_fee).run();
    out.added.push(`👤 ${esc(x.name)}`);
  }
  for (const u of plan.updateDrivers) {
    const cols = Object.keys(u.fields);
    if (u.fields.active === 1) await d.prepare("UPDATE drivers SET code = COALESCE(code, ?) WHERE id = ? AND chat_id IS NULL").bind(randomId(10), u.id).run();
    await d.prepare(`UPDATE drivers SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(", ")} WHERE id = ?${cols.length + 1}`).bind(...cols.map((k) => u.fields[k]), u.id).run();
    out.updated++;
  }
  for (const id of plan.retireDrivers) {
    await release(env, id, "admin").catch(() => {});
    await d.prepare("UPDATE drivers SET active = 0, chat_id = NULL, code = NULL WHERE id = ? AND owner = 0").bind(id).run();
    out.retired++;
  }
  // invite links for drivers from the file who haven't joined yet
  const bot = await botUsername(env).catch(() => null);
  const pending = (await d.prepare("SELECT name, code FROM drivers WHERE id LIKE 'f\\_%' ESCAPE '\\' AND active = 1 AND chat_id IS NULL AND code IS NOT NULL ORDER BY created").all()).results || [];
  out.invites = pending.map((p) => ({ name: p.name, link: bot ? `https://t.me/${bot}?start=d_${p.code}` : `d_${p.code}` }));
  // tell Adam what changed (only when something did)
  if ((out.added.length || out.updated || out.retired) && env.TELEGRAM_CHAT_ID) {
    const L = ["🔄 <b>Flota zaktualizowana z pliku</b>"];
    if (out.added.length) L.push("Dodano: " + out.added.join(", "));
    if (out.updated) L.push(`Zmieniono: ${out.updated}`);
    if (out.retired) L.push(`Wycofano: ${out.retired}`);
    if (out.invites.length) L.push("", "📨 <b>Linki dla kierowców</b> (każdy działa raz – wyślij kierowcy):", ...out.invites.map((i) => `• ${esc(i.name)}: ${i.link}`));
    await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: L.join("\n"), parse_mode: "HTML", disable_web_page_preview: true });
  }
  return out;
}
