// POST /api/rides – create a booking and notify the driver on Telegram.
import { json, bad, point, hasXY, randomId, sha, nowWarsaw } from "../../../server/util.js";
import { route, reverseGeocode, findPlace } from "../../../server/google.js";
import { lookupFlight, flightLine, normFlight, validFlight } from "../../../server/flights.js";
import { price } from "../../../server/pricing.js";
import { CONFIG } from "../../../server/config.js";
import { save, recentByIp, purgeOld, notifyDriver, publicView, driverPos } from "../../../server/rides.js";

const MAX_PER_HOUR = 8;   // override with the Cloudflare variable MAX_BOOKINGS_PER_HOUR (e.g. 100 while testing)
const GPS_LABEL = /^(moja lokalizacja|my location|-?\d+\.\d+,\s*-?\d+\.\d+)$/i;
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.DB) return bad("booking backend not configured", 503);
  let b;
  try { b = await request.json(); } catch { return bad("invalid json"); }
  if (b.website) return bad("spam");   // honeypot field, invisible to people

  const mode = b.mode === "later" ? "later" : "now";
  let pickup = point(b.pickup), dest = point(b.dest);
  if (!pickup || !dest) return bad("route");
  const phone = clean(b.phone, 30);
  if (phone.replace(/\D/g, "").length < 9) return bad("phone");
  const pax = Math.min(CONFIG.seats, Math.max(1, parseInt(b.pax, 10) || 1));

  let when = null;
  if (mode === "later") {
    when = clean(b.when, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return bad("when");
    if (when < nowWarsaw(10) || when > nowWarsaw(120 * 24 * 60)) return bad("when");
  }

  const ip = await sha((request.headers.get("cf-connecting-ip") || "") + (env.TELEGRAM_WEBHOOK_SECRET || ""));
  const limit = parseInt(env.MAX_BOOKINGS_PER_HOUR, 10) || MAX_PER_HOUR;
  if ((await recentByIp(env, ip, Date.now() - 3600e3)) >= limit) return bad("too many bookings, please call", 429);

  // make sure the driver gets real addresses and map links: GPS -> street address, typed text -> coordinates
  if (env.GOOGLE_SERVER_KEY) {
    const fix = async (p, gps) => {
      try {
        if (hasXY(p) && (gps || GPS_LABEL.test(p.address))) {
          const a = await reverseGeocode(env, p.lat, p.lng);
          if (a) return { ...p, address: a.address, gps: true, near: a.near };
        } else if (!hasXY(p)) {
          const f = await findPlace(env, p.address, CONFIG.base);
          if (f) return { address: p.address, lat: f.lat, lng: f.lng };
        }
      } catch (e) { console.log(e.message); }
      return p;
    };
    [pickup, dest] = await Promise.all([fix(pickup, !!(b.pickup && b.pickup.gps)), fix(dest, false)]);
  }

  // flight number -> real flight times for the driver
  const flight = normFlight(b.flight);
  let flightInfo = "";
  if (validFlight(flight) && env.AERODATABOX_KEY) {
    const f = await lookupFlight(env, flight, when ? when.slice(0, 10) : nowWarsaw().slice(0, 10)).catch(() => null);
    flightInfo = flightLine(f);
  }

  // price and distances are always computed here, never taken from the browser.
  // "now": drive time to the pickup from the driver's live position (Telegram), else from the base.
  const car = mode === "now" ? await driverPos(env).catch(() => null) : null;
  const carLive = car && car.ts && Date.now() - car.ts < 5 * 60000;
  const [trip, approach] = await Promise.all([
    hasXY(pickup) && hasXY(dest) ? route(env, pickup, dest) : null,
    mode === "now" && hasXY(pickup) ? route(env, carLive ? { lat: car.lat, lng: car.lng } : CONFIG.base, pickup, true) : null,
  ]);
  const p = price(pickup, dest, trip && trip.distanceM);

  const r = {
    id: randomId(12), token: randomId(24), status: "pending", mode, created: Date.now(), ip, eta_at: null, tg_msg: null,
    data: {
      pickup, dest, when, pax, phone,
      name: clean(b.name, 60), luggage: clean(b.luggage, 40), flight: clean(b.flight, 30), flightInfo,
      notes: clean(b.notes, 500), returnTrip: mode === "later" ? clean(b.returnTrip, 120) : "", lang: b.lang === "en" ? "en" : "pl",
      distanceM: trip?.distanceM ?? null, durationS: trip?.durationS ?? null, polyline: trip?.polyline ?? null,
      approachS: approach?.durationS ?? null, approachM: approach?.distanceM ?? null, approachFrom: carLive ? "live" : "base", approachApprox: !!approach?.approx,
      price: p?.amount ?? null, priceKind: p?.kind ?? null,
    },
  };
  await save(env, r);
  r.tg_msg = await notifyDriver(env, r);
  if (!r.tg_msg) return bad("driver could not be notified, please call", 502);
  await save(env, r);
  waitUntil(purgeOld(env));
  return json({ id: r.id, token: r.token, ride: publicView(r) }, 201);
}
