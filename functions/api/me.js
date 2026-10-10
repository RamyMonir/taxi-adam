// GET /api/me – the signed-in customer and their rides ({user: null} when not signed in).
// POST /api/me {name, phone} – save name and phone for the next bookings.
import { json, bad } from "../../server/util.js";
import { fromOurSite } from "../../server/guard.js";
import { currentUser, updateProfile, userRides } from "../../server/auth.js";

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function onRequestGet({ request, env }) {
  const u = await currentUser(request, env).catch(() => null);
  if (!u) return json({ user: null });
  return json({ user: { name: u.name, email: u.email, picture: u.picture, phone: u.phone }, rides: await userRides(env, u.id) });
}

export async function onRequestPost({ request, env }) {
  if (!fromOurSite(request)) return bad("forbidden", 403);
  const u = await currentUser(request, env).catch(() => null);
  if (!u) return bad("not signed in", 401);
  const b = await request.json().catch(() => ({}));
  const phone = clean(b.phone, 30);
  if (phone && phone.replace(/\D/g, "").length < 9) return bad("phone");
  await updateProfile(env, u.id, { name: clean(b.name, 60), phone });
  return json({ ok: true });
}
