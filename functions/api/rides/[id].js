// GET /api/rides/:id – status for the customer's tracking page (polled every few seconds).
import { json, bad } from "../../../server/util.js";
import { load, expireIfStale, publicView, refreshEta, syncDriverMessage } from "../../../server/rides.js";
import { escalate, getDriver } from "../../../server/fleet.js";
import { withPhotos } from "../../../server/photos.js";

export async function onRequestGet({ params, request, env, waitUntil }) {
  if (!/^[a-z0-9]{12}$/.test(params.id)) return bad("not found", 404);
  let r = await load(env, params.id);
  // the ride is private: without the secret token (kept only on the device that booked it) it doesn't exist
  if (!r || request.headers.get("X-Ride-Token") !== r.token) return bad("not found", 404);
  r = await expireIfStale(env, r);
  if (r.status === "pending" && r.mode === "now") {
    const before = r.status;
    r = (await escalate(env, r).catch((e) => { console.log("escalate", e.message); return r; })) || r;
    if (r.status !== before) waitUntil(syncDriverMessage(env, r));
  }
  const drv = r.data.driverId ? await getDriver(env, r.data.driverId).catch(() => null) : null;
  const car = r.status === "enroute" || r.status === "ontrip" ? drv : null;
  // keep distance and arrival time current even when the driver's phone sends no new point (car standing / in traffic)
  if (car && (await refreshEta(env, r, car).catch(() => false))) waitUntil(syncDriverMessage(env, r));
  else if (r.stale) r = (await load(env, params.id)) || r;   // driver tapped / customer cancelled meanwhile: show the real status
  return json(await withPhotos(env, r, publicView(r, car, drv)));
}
