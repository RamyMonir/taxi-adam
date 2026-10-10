// GET /api/geocode?lat=..&lng=..  -> street address for a GPS position
// GET /api/geocode?q=...          -> coordinates for typed text
import { json, bad } from "../../server/util.js";
import { reverseGeocode, findPlace } from "../../server/google.js";
import { fromOurSite, cached } from "../../server/guard.js";
import { CONFIG } from "../../server/config.js";

export async function onRequestGet({ request, env, waitUntil }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  if (!env.GOOGLE_SERVER_KEY) return bad("not configured", 503);
  const u = new URL(request.url);
  const q = (u.searchParams.get("q") || "").trim().slice(0, 160);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  try {
    if (q) return await cached(request, waitUntil, 86400, async () => json({ place: await findPlace(env, q, CONFIG.base) }));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("lat/lng");
    const r = await reverseGeocode(env, lat, lng);
    return json({ address: r ? r.address : null, near: r ? r.near : null });
  } catch (e) { console.log(e.message); return bad(e.message, 502); }
}
