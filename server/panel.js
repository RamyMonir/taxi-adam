// LITE: owner panel login. Secret link (PANEL_SLUG) + 6-digit PIN checked with PBKDF2 (PANEL_PIN_HASH, PANEL_PIN_SALT).
// Wrong PINs lock the panel: 5 per device per 15 min, 20 per hour for everyone (6 digits = only a million options).
// A correct PIN gives a 12-hour session cookie; only its hash is stored.
import { randomId, sha, safeEqual } from "./util.js";
import { hit, rateKey } from "./ratelimit.js";
import { ldb } from "./leads.js";

export const SESSION_H = 12;
const IP_FAILS = 5, IP_WIN = 900, ALL_FAILS = 20, ALL_WIN = 3600;
export const PBKDF2_ITERS = 100000;
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

export async function pinHash(pin, saltHex, iters = PBKDF2_ITERS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: iters }, key, 256);
  return hex(bits);
}

export const panelReady = (env) => !!(env.PANEL_SLUG && env.PANEL_PIN_HASH && env.PANEL_PIN_SALT);

async function fails(env, scope, ip, windowS, now) {
  try {
    const r = await env.DB.prepare("SELECT n FROM rate_hits WHERE k = ?1").bind(rateKey(scope, ip, now, windowS)).first();
    return r ? r.n : 0;
  } catch { return 0; }   // no counter table yet = no failures yet
}

// -> {ok, cookie} | {error: "setup" | "slug" | "locked" | "pin", left?, retryS?}
export async function login(env, { slug, pin }, ip, now = Date.now()) {
  if (!panelReady(env)) return { error: "setup" };
  if (!safeEqual(String(slug || ""), env.PANEL_SLUG)) return { error: "slug" };
  await ldb(env);
  const [mine, all] = await Promise.all([fails(env, "panelfail", ip, IP_WIN, now), fails(env, "panelfail", "all", ALL_WIN, now)]);
  if (mine >= IP_FAILS || all >= ALL_FAILS) return { error: "locked", retryS: mine >= IP_FAILS ? IP_WIN : ALL_WIN };
  const ok = /^\d{6}$/.test(String(pin || "")) && safeEqual(await pinHash(pin, env.PANEL_PIN_SALT), env.PANEL_PIN_HASH);
  if (!ok) {
    await hit(env, "panelfail", ip, { limit: IP_FAILS, windowS: IP_WIN, now });
    await hit(env, "panelfail", "all", { limit: ALL_FAILS, windowS: ALL_WIN, now });
    return { error: "pin", left: Math.max(0, IP_FAILS - mine - 1) };
  }
  const sid = randomId(40);
  await env.DB.prepare("INSERT INTO panel_sessions (sid_hash, created, expires) VALUES (?1, ?2, ?3)")
    .bind(await sha(sid), now, now + SESSION_H * 3600e3).run();
  return { ok: true, cookie: sessionCookie(sid, SESSION_H * 3600) };
}

export const sessionCookie = (sid, maxAge) => `ps=${sid}; Path=/api/panel; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const sidOf = (request) => (/(?:^|;\s*)ps=([a-z0-9]{40})(?:;|$)/.exec(request.headers.get("cookie") || "") || [])[1] || null;

export async function sessionOk(env, request, now = Date.now()) {
  const sid = sidOf(request);
  if (!sid || !panelReady(env)) return false;
  try {
    await ldb(env);
    const r = await env.DB.prepare("SELECT expires FROM panel_sessions WHERE sid_hash = ?1").bind(await sha(sid)).first();
    return !!r && r.expires > now;
  } catch { return false; }
}

export async function logout(env, request) {
  const sid = sidOf(request);
  if (sid) { await ldb(env); await env.DB.prepare("DELETE FROM panel_sessions WHERE sid_hash = ?1").bind(await sha(sid)).run(); }
  return sessionCookie("", 0);
}
