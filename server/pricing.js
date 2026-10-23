// Price estimate: fixed price-list fares for known destinations (airports, spas, stations),
// otherwise start fee + per-km on the road distance. Numbers come from src/data.py via config.js.
import { CONFIG } from "./config.js";
import { kmBetween, hasXY } from "./util.js";

export function zoneOf(p) {
  if (!hasXY(p)) return null;
  if (CONFIG.center2 && kmBetween(p, CONFIG.center2) <= CONFIG.center2Km) return "0";   // second base town (src/data.py)
  const d = kmBetween(p, CONFIG.center);
  for (const z of ["0", "A", "B"]) if (d <= CONFIG.zoneKm[z]) return z;
  return null;
}

export function knownPlace(p) {
  if (!hasXY(p)) return null;
  let best = null, bestKm = Infinity;
  for (const d of CONFIG.destinations) {
    if (!d.matchKm) continue;
    const k = kmBetween(p, d);
    if (k <= d.matchKm && k < bestKm) { best = d; bestKm = k; }
  }
  return best;
}

export function price(pickup, dest, distanceM) {
  const kd = knownPlace(dest), kp = knownPlace(pickup);
  const zp = zoneOf(pickup), zd = zoneOf(dest);
  if (kd && zp) return { amount: kd.price + CONFIG.surcharge[zp], kind: "fixed", label: kd.short };
  if (kp && zd) return { amount: kp.price + CONFIG.surcharge[zd], kind: "fixed", label: kp.short };
  if (!distanceM) return null;
  const T = CONFIG.tariff;
  return { amount: Math.max(T.min, Math.round(T.start + (T.per_km * distanceM) / 1000)), kind: "estimate" };
}
