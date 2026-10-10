// Customer accounts (optional): "Sign in with Google" -> our own session cookie.
// Booking without an account keeps working; an account only adds ride history on every device
// and remembers name + phone.
import { randomId, sha } from "./util.js";
import { db } from "./rides.js";
import { CONFIG } from "./config.js";

const SESSION_DAYS = 60;
let ready = false;
async function adb(env) {
  const d = await db(env);
  if (!ready) {
    await d.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, name TEXT, picture TEXT, phone TEXT, created INTEGER, seen INTEGER)").run();
    // only a hash of the session id is stored: a leaked database can't be used to log in
    await d.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, uid TEXT NOT NULL, expires INTEGER NOT NULL)").run();
    ready = true;
  }
  return d;
}

export const clientId = (env) => env.GOOGLE_CLIENT_ID || CONFIG.googleClientId || "";

// Google's ID token from the sign-in button, checked by Google (tokeninfo) and for our client ID.
export async function verifyGoogle(env, credential) {
  const base = env.GOOGLE_TOKENINFO_BASE || "https://oauth2.googleapis.com";   // override only for local tests
  const r = await fetch(`${base}/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) return null;
  const t = await r.json();
  if (!clientId(env) || t.aud !== clientId(env)) return null;
  if (t.iss !== "accounts.google.com" && t.iss !== "https://accounts.google.com") return null;
  if (!t.sub || Number(t.exp) * 1000 < Date.now()) return null;
  return { id: "g:" + t.sub, email: t.email || "", name: t.given_name || t.name || "", picture: t.picture || "" };
}

export async function login(env, g) {
  const d = await adb(env), now = Date.now();
  // the name is taken from Google only the first time; after that it's whatever the customer saved
  await d.prepare(
    `INSERT INTO users (id, email, name, picture, phone, created, seen) VALUES (?1, ?2, ?3, ?4, '', ?5, ?5)
     ON CONFLICT(id) DO UPDATE SET email = ?2, picture = ?4, seen = ?5`
  ).bind(g.id, g.email, g.name, g.picture, now).run();
  const sid = randomId(40);
  await d.prepare("INSERT INTO sessions (id, uid, expires) VALUES (?, ?, ?)").bind(await sha(sid), g.id, now + SESSION_DAYS * 864e5).run();
  await d.prepare("DELETE FROM sessions WHERE expires < ?").bind(now).run();
  return sid;
}

const sidOf = (request) => ((request.headers.get("Cookie") || "").match(/(?:^|;\s*)sid=([a-z0-9]{40})(?:;|$)/) || [])[1];

export async function currentUser(request, env) {
  const sid = sidOf(request);
  if (!sid) return null;
  return (await (await adb(env)).prepare(
    "SELECT u.id, u.email, u.name, u.picture, u.phone FROM sessions s JOIN users u ON u.id = s.uid WHERE s.id = ? AND s.expires > ?"
  ).bind(await sha(sid), Date.now()).first()) || null;
}

export async function logout(request, env) {
  const sid = sidOf(request);
  if (sid) await (await adb(env)).prepare("DELETE FROM sessions WHERE id = ?").bind(await sha(sid)).run();
}

export const sessionCookie = (sid) => `sid=${sid || ""}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sid ? SESSION_DAYS * 86400 : 0}`;

export async function updateProfile(env, uid, { name, phone }) {
  await (await adb(env)).prepare("UPDATE users SET name = COALESCE(?1, name), phone = COALESCE(?2, phone) WHERE id = ?3")
    .bind(name ?? null, phone ?? null, uid).run();
}

// the customer's rides (kept 30 days like all rides); the token lets this device open the status page
export async function userRides(env, uid) {
  const rs = await (await adb(env)).prepare(
    "SELECT id, token, status, mode, created, data FROM rides WHERE json_extract(data, '$.uid') = ? ORDER BY created DESC LIMIT 30"
  ).bind(uid).all();
  return (rs.results || []).map((row) => {
    const d = JSON.parse(row.data);
    return { id: row.id, token: row.token, status: row.status, mode: row.mode, created: row.created, when: d.when || null,
             from: d.pickup?.address || "", to: d.dest?.address || "", price: d.price ?? null, priceKind: d.priceKind || null,
             cancelledBy: d.cancelledBy || null };
  });
}

// rides booked on this device before signing in become part of the account (only with their secret token)
export async function claimRides(env, uid, list) {
  const d = await adb(env);
  for (const x of list.slice(0, 10)) {
    if (!x || !/^[a-z0-9]{12}$/.test(x.id) || typeof x.token !== "string") continue;
    await d.prepare("UPDATE rides SET data = json_set(data, '$.uid', ?1) WHERE id = ?2 AND token = ?3 AND json_extract(data, '$.uid') IS NULL")
      .bind(uid, x.id, x.token).run();
  }
}
