// GET /api/admin/setup?key=ADMIN_KEY – one-time setup check: connects the Telegram webhook
// to this site and reports which settings are still missing.
import { json } from "../../../server/util.js";
import { db, tg } from "../../../server/rides.js";
import { reviews, autocomplete, reverseGeocode } from "../../../server/google.js";
import { lookupFlight } from "../../../server/flights.js";
import { CONFIG } from "../../../server/config.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) return new Response("forbidden", { status: 403 });

  const report = {
    TELEGRAM_BOT_TOKEN: !!env.TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: !!env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_CHAT_ID: !!env.TELEGRAM_CHAT_ID, GOOGLE_SERVER_KEY: !!env.GOOGLE_SERVER_KEY, GOOGLE_PLACE_ID: !!env.GOOGLE_PLACE_ID,
    DB: false,
  };
  try { await db(env); report.DB = true; } catch (e) { report.DB_error = String(e.message || e); }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET) {
    const hook = await tg(env, "setWebhook", {
      url: `${url.origin}/api/telegram`, secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"], drop_pending_updates: true,
    });
    report.webhook = hook && hook.ok ? `${url.origin}/api/telegram` : hook;
    const me = await tg(env, "getMe", {});
    report.bot = me && me.ok ? "@" + me.result.username : null;
    if (env.TELEGRAM_CHAT_ID) {
      const t = await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: "✅ Test: strona połączona z botem. Nowe kursy będą przychodzić tutaj." });
      report.test_message = !!(t && t.ok);
    }
  }
  // Google + flight checks: show Google's own error message when something isn't enabled
  const check = async (name, fn) => { try { report[name] = await fn(); } catch (e) { report[name] = "ERROR " + e.message; } };
  await check("google_reviews", async () => { const r = await reviews(env); return `${r.place}: ${r.rating}★, ${r.count} opinii, pobrano ${r.fetched}, pokazane ${r.reviews.length}`; });
  await check("google_autocomplete", async () => { const s = await autocomplete(env, "Dworcowa Knurów", "setupcheck123", CONFIG.base); return s.length ? "OK – " + s[0].main : "no results"; });
  await check("google_reverse_geocode", async () => { const r = await reverseGeocode(env, CONFIG.base.lat, CONFIG.base.lng); return r ? r.address + (r.near ? " (nearest place)" : "") : "no address"; });
  report.geocoding_api = reverseGeocode.lastStatus ? reverseGeocode.lastStatus + " – add Geocoding API to the server key for exact street addresses" : "OK";
  report.AERODATABOX_KEY = !!env.AERODATABOX_KEY;
  if (env.AERODATABOX_KEY) await check("flight_lookup", async () => { const f = await lookupFlight(env, "FR3014", new Date().toISOString().slice(0, 10)); return f.error ? "ERROR " + f.error : f.found ? "OK" : "OK (test flight not found today)"; });
  report.ready = report.DB && report.TELEGRAM_BOT_TOKEN && report.TELEGRAM_CHAT_ID && report.TELEGRAM_WEBHOOK_SECRET && report.test_message === true;
  return json(report);
}
