// POST /api/quote  {pickup:{lat,lng}, dest:{lat,lng}, mode}
// -> distance, duration, route line, price and (for "now") how long the driver needs to get to the pickup.
import { json, bad, point, hasXY } from "../../server/util.js";
import { route } from "../../server/google.js";
import { price } from "../../server/pricing.js";
import { CONFIG } from "../../server/config.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad("invalid json"); }
  const pickup = point(b.pickup), dest = point(b.dest);
  if (!hasXY(pickup) || !hasXY(dest)) return bad("pickup and dest need coordinates");
  const [trip, approach] = await Promise.all([
    route(env, pickup, dest),
    b.mode === "now" ? route(env, CONFIG.base, pickup) : null,
  ]);
  const p = price(pickup, dest, trip && trip.distanceM);
  return json({
    distanceM: trip?.distanceM ?? null, durationS: trip?.durationS ?? null, polyline: trip?.polyline ?? null, approx: !!trip?.approx,
    approachS: approach?.durationS ?? null, price: p?.amount ?? null, priceKind: p?.kind ?? null, priceLabel: p?.label ?? null,
  });
}
