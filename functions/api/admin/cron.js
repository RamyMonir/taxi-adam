// POST /api/admin/cron  (header x-cron-key: CRON_KEY) – called every minute by the small "taxi-cron" Worker
// (cron-worker/), because Pages has no timers of its own.
//  1. "now" rides nobody has taken: next dispatch step / expire (also when the customer closed the page)
//  2. reservations: reminder to the driver 60 min before pickup
//  3. a driver's live location ran out: remind him once (daytime only)
//  4. 23:00 (Warsaw): each driver gets his day, Adam gets the whole company + CSV
import { json, nowWarsaw, clockWarsaw, esc } from "../../../server/util.js";
import { db, load, tg, tgFile, syncDriverMessage, expireIfStale, isLive } from "../../../server/rides.js";
import { escalate, listDrivers, busyDriverIds, markReminded } from "../../../server/fleet.js";
import { buildReport, dayWarsaw } from "../../../server/report.js";

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

  // 2. reservations starting within the hour
  const soon = nowWarsaw(60), now = nowWarsaw();
  const sched = (await d.prepare("SELECT id FROM rides WHERE status = 'scheduled'").all()).results || [];
  for (const { id } of sched) {
    const r = await load(env, id); if (!r) continue;
    const w = r.data.when;
    if (!w || w > soon || w < now || r.data.remindedAt) continue;
    r.data.remindedAt = Date.now();
    await d.prepare("UPDATE rides SET data = ? WHERE id = ?").bind(JSON.stringify(r.data), r.id).run();
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

  // 4. end-of-day reports
  const today = dayWarsaw(Date.now());
  if (hm >= REPORT_AT && (await meta(env, "report_day")) !== today) {
    await meta(env, "report_day", today);
    const all = await listDrivers(env);
    for (const x of all) {
      if (!x.chat_id) continue;
      if (x.owner) {
        const rep = await buildReport(env, today, today, null);
        await tg(env, "sendMessage", { chat_id: x.chat_id, text: "🌙 <b>Podsumowanie dnia</b>\n\n" + rep.text, parse_mode: "HTML" });
        if (rep.rows.length) await tgFile(env, `raport_${today}.csv`, rep.csv, `Wszystkie kursy: ${rep.title}`, x.chat_id);
      } else {
        const rep = await buildReport(env, today, today, x.id);
        if (rep.rows.length) await tg(env, "sendMessage", { chat_id: x.chat_id, text: "🌙 <b>Twój dzień</b>\n\n" + rep.text, parse_mode: "HTML" });
      }
    }
    out.report = today;
  }
  return json(out);
}
export const onRequestGet = onRequestPost;
