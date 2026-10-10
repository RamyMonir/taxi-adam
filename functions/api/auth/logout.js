// POST /api/auth/logout – ends the session on this device.
import { json, bad } from "../../../server/util.js";
import { fromOurSite } from "../../../server/guard.js";
import { logout, sessionCookie } from "../../../server/auth.js";

export async function onRequestPost({ request, env }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  await logout(request, env);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(null) });
}
