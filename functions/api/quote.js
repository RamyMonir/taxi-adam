// POST /api/quote  {pickup:{lat,lng}, dest:{lat,lng}, mode}
// -> distance, duration, route line, price and (for "now") how long the driver needs to get to the pickup.
import { json, bad, point, hasXY, sha } from "../../server/util.js";
import { hit } from "../../server/ratelimit.js";
import { route } from "../../server/google.js";
import { price } from "../../server/pricing.js";
import { CONFIG } from "../../server/config.js";
import { isLive } from "../../server/rides.js";
import { listDrivers, busyDriverIds, canDrive } from "../../server/fleet.js";
import { kmBetween } from "../../server/util.js";

const QUOTES_PER_MIN = 30;   // per IP; every quote is a paid Google Routes call

export async function onRequestPost({ request, env }) {
  const ip = await sha((request.headers.get("cf-connecting-ip") || "") + (env.TELEGRAM_WEBHOOK_SECRET || ""));
  const rl = await hit(env, "quote", ip, { limit: parseInt(env.MAX_QUOTES_PER_MIN, 10) || QUOTES_PER_MIN, windowS: 60 });
  if (!rl.allowed) return json({ error: "Za dużo zapytań o cenę. Spróbuj ponownie za minutę albo zadzwoń." }, 429, { "retry-after": "60" });
  let b;
  try { b = await request.json(); } catch { return bad("invalid json"); }
  const pickup = point(b.pickup), dest = point(b.dest);
  if (!hasXY(pickup) || !hasXY(dest)) return bad("pickup and dest need coordinates");
  let from = CONFIG.base;
  if (b.mode === "now") {
    const [all, busy] = await Promise.all([listDrivers(env).catch(() => []), busyDriverIds(env).catch(() => new Set())]);
    const free = all.filter((x) => canDrive(x, busy)).sort((a, c) => kmBetween(a, pickup) - kmBetween(c, pickup));
    if (free.length) from = { lat: free[0].lat, lng: free[0].lng };
  }
  const [trip, approach] = await Promise.all([
    route(env, pickup, dest),
    b.mode === "now" ? route(env, from, pickup, true) : null,
  ]);
  const p = price(pickup, dest, trip && trip.distanceM);
  return json({
    distanceM: trip?.distanceM ?? null, durationS: trip?.durationS ?? null, polyline: trip?.polyline ?? null, approx: !!trip?.approx,
    approachS: approach?.durationS ?? null, price: p?.amount ?? null, priceKind: p?.kind ?? null, priceLabel: p?.label ?? null,
  });
}
