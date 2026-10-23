// POST /api/admin/cron  (header x-cron-key: CRON_KEY) – called every minute by the small "taxi-cron" Worker
// (cron-worker/), because Pages has no timers of its own.
//  1. "now" rides nobody has taken: next dispatch step / expire (also when the customer closed the page)
//  2. reservations: reminder to the driver 60 min before pickup
//  3. a driver's live location ran out: remind him once (daytime only)
//  4. cars left checked out (45 min without live location) are released
//  5. 23:00 (Warsaw): each driver gets his day + settlement, the owner gets the whole company + settlement buttons + CSV
//  + auto-assign of rides waiting for the owner, flight watch for airport reservations (server/auto.js)
import { ensureFleetSynced } from "../../../server/fleetsync.js";
import { json, nowWarsaw, clockWarsaw, esc } from "../../../server/util.js";
import { db, load, transition, tg, tgFile, syncDriverMessage, expireIfStale, isLive } from "../../../server/rides.js";
import { escalate, listDrivers, busyDriverIds, markReminded } from "../../../server/fleet.js";
import { buildReport, dayWarsaw, chunks, saveSettlements, purgeTrips } from "../../../server/report.js";
import { openSessions, release, hasOpenRide, currentCar, carLabel, isDemo } from "../../../server/cars.js";
import { autoAssign, watchFlights } from "../../../server/auto.js";

const REPORT_AT = "23:00";

async function meta(env, k, v) {
  const d = await db(env);
  await d.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run();
  if (v === undefined) return (await d.prepare("SELECT v FROM meta WHERE k = ?").bind(k).first())?.v ?? null;
  await d.prepare("INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2").bind(k, v).run();
}

export async function onRequestPost({ request, env }) {
  const key = request.headers.get("x-cron-key") || new URL(request.url).searchParams.get("key");
  if (!(env.CRON_KEY && key === env.CRON_KEY) && !(env.ADMIN_KEY && key === env.ADMIN_KEY)) return new Response("forbidden", { status: 403 });
  const out = { dispatched: 0, expired: 0, reminders: 0, locationReminders: 0, report: null };
  const d = await db(env);
  await ensureFleetSynced(env).catch((e) => console.log("fleet sync", e.message));   // src/fleet.py -> database

  await d.prepare("DELETE FROM tg_updates WHERE ts < ?").bind(Date.now() - 2 * 864e5).run().catch(() => {});

  // 1. open "now" requests
  const pend = (await d.prepare("SELECT id FROM rides WHERE status = 'pending' AND mode = 'now'").all()).results || [];
  for (const { id } of pend) {
    let r = await load(env, id); if (!r) continue;
    r = await expireIfStale(env, r);
    if (r.status === "expired") { out.expired++; continue; }
    const before = JSON.stringify(r.data.offers || {}), st = r.status;
    r = (await escalate(env, r).catch((e) => { console.log("cron escalate", e.message); return r; })) || r;
    if (r.status !== st || JSON.stringify(r.data.offers || {}) !== before) { out.dispatched++; await syncDriverMessage(env, r); }
  }

  // rides waiting for the owner while he's busy -> the best driver; flights of airport reservations (a later landing moves the pickup)
  out.auto = await autoAssign(env, d).catch((e) => { console.log("cron auto", e.message); return null; });
  out.flights = await watchFlights(env, d).catch((e) => { console.log("cron flights", e.message); return null; });

  // 2. reservations starting within the hour
  const soon = nowWarsaw(60), now = nowWarsaw();
  const sched = (await d.prepare("SELECT id FROM rides WHERE status = 'scheduled'").all()).results || [];
  for (const { id } of sched) {
    const r = await load(env, id); if (!r) continue;
    const w = r.data.when;
    if (!w || w > soon || w < now || r.data.remindedAt) continue;
    // conditional write: a driver tapping "Wyjeżdżam" at this moment must not be overwritten
    const ok = await transition(env, id, ["scheduled"], (x) => { if (x.data.remindedAt) return false; x.data.remindedAt = Date.now(); });
    if (!ok) continue;
    await tg(env, "sendMessage", { chat_id: r.data.chat || env.TELEGRAM_CHAT_ID, reply_to_message_id: r.tg_msg || undefined, parse_mode: "HTML",
      text: `⏰ Za niecałą godzinę (${esc(w.slice(11, 16))}): <b>${esc(r.data.pickup.address)}</b>\nGdy ruszasz, kliknij „🚕 Wyjeżdżam do klienta”.` });
    out.reminders++;
  }

  // 3. live location ran out (between 6:00 and 22:00, once)
  const hm = now.slice(11, 16);
  if (hm >= "06:00" && hm < "22:00") {
    const [all, busy] = await Promise.all([listDrivers(env), busyDriverIds(env)]);
    for (const x of all) {
      if (!x.chat_id || !x.until || isLive(x) || x.reminded || busy.has(x.id)) continue;
      if (Date.now() - x.until > 30 * 60000) continue;   // ended a while ago = end of shift, not a hiccup
      await markReminded(env, x.id);
      await tg(env, "sendMessage", { chat_id: x.chat_id, text: "📡 Twoja lokalizacja na żywo wygasła – nie dostajesz teraz kursów.\nJeśli jesteś na zmianie, udostępnij ją ponownie: 📎 → Lokalizacja → „Udostępniaj lokalizację na żywo”." });
      out.locationReminders++;
    }
  }

  // 4. cars left checked out: no live location for 45 min and no open ride -> the car is free again
  out.carsReleased = 0;
  for (const x of await openSessions(env).catch(() => [])) {
    const lastSeen = Math.max(x.until && x.until < Date.now() ? x.until : 0, x.ts || 0, x.started || 0);
    const live = x.until ? Date.now() < x.until : x.ts && Date.now() - x.ts < 5 * 60000;
    if (live || Date.now() - lastSeen < 45 * 60000 || (await hasOpenRide(env, x.driver_id))) continue;
    await release(env, x.driver_id, "auto");
    out.carsReleased++;
    const label = esc(`${x.make} ${x.model}`.trim() + " · " + x.plate);
    if (x.chat_id && !String(x.driver_id).startsWith("demo_")) await tg(env, "sendMessage", { chat_id: x.chat_id, parse_mode: "HTML",
      text: `🔓 Auto <b>${label}</b> zwolnione automatycznie (brak lokalizacji od 45 min). Na następnej zmianie wybierzesz auto jednym kliknięciem.` });
  }

  // 5. end-of-day reports: the owner = whole company + settlement buttons + CSV, each driver = his full day
  const today = dayWarsaw(Date.now());
  if (hm >= REPORT_AT && (await meta(env, "report_day")) !== today) {
    await meta(env, "report_day", today);
    const all = await listDrivers(env);
    for (const x of all) {
      if (!x.chat_id || isDemo(x)) continue;
      if (x.owner) {
        const rep = await buildReport(env, today, today, null);
        await saveSettlements(env, today, rep.settlements).catch((e) => console.log("settlements", e.message));
        const parts = chunks("🌙 <b>Podsumowanie dnia</b>\n\n" + rep.text);
        const kb = rep.settlements.filter((s) => s.rides).map((s) => [{ text: `✅ Rozliczono: ${s.name}`, callback_data: `stl|${today}|${s.driverId}` }]);
        for (let i = 0; i < parts.length; i++) {
          await tg(env, "sendMessage", { chat_id: x.chat_id, text: parts[i], parse_mode: "HTML",
            ...(i === parts.length - 1 && kb.length ? { reply_markup: { inline_keyboard: kb } } : {}) });
        }
        if (rep.rows.length) await tgFile(env, `raport_${today}.csv`, rep.csv, `Wszystkie kursy: ${rep.title}`, x.chat_id);
      } else {
        const rep = await buildReport(env, today, today, x.id);
        if (rep.rows.length) for (const part of chunks("🌙 <b>Twój dzień</b>\n\n" + rep.text)) await tg(env, "sendMessage", { chat_id: x.chat_id, text: part, parse_mode: "HTML" });
        const car = x.current_car_id ? await currentCar(env, x.id).catch(() => null) : null;
        if (car && !isLive(x)) await tg(env, "sendMessage", { chat_id: x.chat_id, parse_mode: "HTML", text: `🔓 Masz jeszcze auto <b>${esc(carLabel(car))}</b>.`,
          reply_markup: { inline_keyboard: [[{ text: "🔓 Oddaję auto", callback_data: "carrel|-" }]] } });
      }
    }
    out.report = today;
    await purgeTrips(env).catch(() => {});
  }
  return json(out);
}
export const onRequestGet = onRequestPost;
