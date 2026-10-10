// GET /api/place?id=PLACE_ID&s=SESSION – coordinates + full address of a picked suggestion (ends the billing session)
import { json, bad } from "../../server/util.js";
import { placeDetails } from "../../server/google.js";
import { fromOurSite } from "../../server/guard.js";

export async function onRequestGet({ request, env }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  if (!env.GOOGLE_SERVER_KEY) return bad("not configured", 503);
  const u = new URL(request.url);
  const id = u.searchParams.get("id") || "", s = u.searchParams.get("s") || "";
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return bad("id");
  try { return json(await placeDetails(env, id, /^[A-Za-z0-9-]{8,64}$/.test(s) ? s : null)); }
  catch (e) { console.log(e.message); return bad(e.message, 502); }
}
