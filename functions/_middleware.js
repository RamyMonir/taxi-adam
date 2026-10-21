// LITE: only /api/lead and /api/panel/* answer. Every other API of the full system (bookings, Telegram bot, Google lookups,
// accounts…) returns 404, so nothing can call it. Switch back: LITE_MODE = False in src/data.py (nothing was deleted).
import { CONFIG } from "../server/config.js";

export async function onRequest({ request, next }) {
  const path = new URL(request.url).pathname;
  if (CONFIG.lite) {
    if (path.startsWith("/api/") && path !== "/api/lead" && !path.startsWith("/api/panel/")) {
      return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    if (path.startsWith("/panel")) {
      const res = await next();
      const out = new Response(res.body, res);
      out.headers.set("x-robots-tag", "noindex, nofollow");
      out.headers.set("cache-control", "no-store");
      out.headers.set("referrer-policy", "no-referrer");
      return out;
    }
  }
  return next();
}
