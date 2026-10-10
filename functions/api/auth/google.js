// POST /api/auth/google {credential, rides:[{id,token}]} – "Sign in with Google": checks the Google ID token,
// opens a session (HttpOnly cookie) and adds this device's earlier rides to the account.
import { json, bad } from "../../../server/util.js";
import { fromOurSite } from "../../../server/guard.js";
import { clientId, verifyGoogle, login, sessionCookie, claimRides } from "../../../server/auth.js";

export async function onRequestPost({ request, env }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  if (!clientId(env)) return bad("login disabled", 503);
  const b = await request.json().catch(() => ({}));
  const g = typeof b.credential === "string" ? await verifyGoogle(env, b.credential).catch(() => null) : null;
  if (!g) return bad("invalid login", 401);
  const sid = await login(env, g);
  if (Array.isArray(b.rides)) await claimRides(env, g.id, b.rides);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(sid) });
}
