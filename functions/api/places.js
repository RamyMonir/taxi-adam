// GET /api/places?q=...&s=SESSION – address suggestions while typing (Places API New, server key)
import { json, bad } from "../../server/util.js";
import { autocomplete } from "../../server/google.js";
import { fromOurSite } from "../../server/guard.js";
import { CONFIG } from "../../server/config.js";

export async function onRequestGet({ request, env }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  if (!env.GOOGLE_SERVER_KEY) return bad("not configured", 503);
  const u = new URL(request.url);
  const q = (u.searchParams.get("q") || "").trim().slice(0, 120), s = u.searchParams.get("s") || "";
  if (q.length < 2 || !/^[A-Za-z0-9-]{8,64}$/.test(s)) return bad("query");
  try { return json({ suggestions: await autocomplete(env, q, s, CONFIG.base) }); }
  catch (e) { console.log(e.message); return json({ suggestions: [], error: e.message }, 502); }
}
