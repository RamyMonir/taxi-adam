// GET /api/flight?no=FR1234[&date=2026-10-24] – flight times for the booking form (cached 15 min).
// Without a date: upcoming flights with this number in the next 7 days.
import { json, bad } from "../../server/util.js";
import { lookupFlight, lookupFlightNext, normFlight, validFlight } from "../../server/flights.js";
import { nowWarsaw } from "../../server/util.js";
import { fromOurSite, cached } from "../../server/guard.js";

export async function onRequestGet({ request, env, waitUntil }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  const u = new URL(request.url);
  const no = normFlight(u.searchParams.get("no")), date = u.searchParams.get("date") || "";
  if (!validFlight(no) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return bad("flight");
  return cached(request, waitUntil, 900, async () => {
    const now = nowWarsaw();
    const f = date ? await lookupFlight(env, no, date) : await lookupFlightNext(env, no, now.slice(0, 10), now);
    return json(f, f.error === "not configured" ? 503 : f.error ? 502 : 200);
  });
}
