// GET /api/admin/setup?key=ADMIN_KEY – one-time setup check: connects the Telegram webhook
// to this site and reports which settings are still missing.
import { json } from "../../../server/util.js";
import { db, tg } from "../../../server/rides.js";

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
  report.ready = report.DB && report.TELEGRAM_BOT_TOKEN && report.TELEGRAM_CHAT_ID && report.TELEGRAM_WEBHOOK_SECRET && report.test_message === true;
  return json(report);
}
