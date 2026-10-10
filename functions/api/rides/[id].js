// GET /api/rides/:id – status for the customer's tracking page (polled every few seconds).
import { json, bad } from "../../../server/util.js";
import { load, expireIfStale, publicView } from "../../../server/rides.js";

export async function onRequestGet({ params, env }) {
  if (!/^[a-z0-9]{12}$/.test(params.id)) return bad("not found", 404);
  let r = await load(env, params.id);
  if (!r) return bad("not found", 404);
  r = await expireIfStale(env, r);
  return json(publicView(r));
}
