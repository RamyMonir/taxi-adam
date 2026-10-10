// GET /api/flight?no=FR1234&date=2026-10-24 – flight times for the booking form (cached 30 min)
import { json, bad } from "../../server/util.js";
import { lookupFlight, normFlight, validFlight } from "../../server/flights.js";
import { fromOurSite, cached } from "../../server/guard.js";

export async function onRequestGet({ request, env, waitUntil }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  const u = new URL(request.url);
  const no = normFlight(u.searchParams.get("no")), date = u.searchParams.get("date") || "";
  if (!validFlight(no) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("flight");
  return cached(request, waitUntil, 1800, async () => {
    const f = await lookupFlight(env, no, date);
    return json(f, f.error === "not configured" ? 503 : f.error ? 502 : 200);
  });
}
