// GET /api/photo/d/<rideId>?t=… (driver) or /api/photo/c/<rideId>?t=… (car) – only for the customer of that ride,
// only while it is active (+2 h after it ended), only with the driver's consent. No listing, no guessable URLs.
import { load } from "../../../../server/rides.js";
import { getDriver } from "../../../../server/fleet.js";
import { getCar } from "../../../../server/cars.js";
import { photoSig, photoVisible, photosEnabled } from "../../../../server/photos.js";
import { safeEqual } from "../../../../server/util.js";

const nope = () => new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });

export async function onRequestGet({ params, request, env }) {
  if (!photosEnabled(env) || !["d", "c"].includes(params.kind) || !/^[a-z0-9]{12}$/.test(params.id)) return nope();
  const r = await load(env, params.id);
  const t = new URL(request.url).searchParams.get("t") || "";
  if (!r || !photoVisible(r) || !safeEqual(t, await photoSig(env, r, params.kind))) return nope();
  let key = null;
  if (params.kind === "d") {
    const drv = r.data.driverId ? await getDriver(env, r.data.driverId) : null;
    key = drv && drv.photo_ok ? drv.photo_key : null;
  } else {
    const car = r.data.vehicle?.id ? await getCar(env, r.data.vehicle.id) : null;
    key = car ? car.photo_key : null;
  }
  const obj = key ? await env.PHOTOS.get(key) : null;
  if (!obj) return nope();
  return new Response(obj.body, { headers: {
    "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=600",
    "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", "referrer-policy": "no-referrer",
  } });
}
