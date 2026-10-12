// Shared helpers for the Pages Functions (Cloudflare Workers runtime).

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export const bad = (msg, status = 400) => json({ error: msg }, status);

// The site's real address. Cloudflare also serves every old build at "<hash>.<project>.pages.dev";
// those copies never update, so the bot must never be connected to one of them.
export function canonicalOrigin(request, env) {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/+$/, "");
  const u = new URL(request.url);
  const m = u.hostname.match(/^[^.]+\.([^.]+\.pages\.dev)$/);
  return m ? `https://${m[1]}` : u.origin;
}

export function randomId(len = 12) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

export async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export function kmBetween(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function point(p) {
  if (!p || typeof p !== "object") return null;
  const address = String(p.address || "").trim().slice(0, 200);
  const lat = Number(p.lat), lng = Number(p.lng);
  const hasXY = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  if (!address && !hasXY) return null;
  return { address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat: hasXY ? lat : null, lng: hasXY ? lng : null };
}

export const hasXY = (p) => p && p.lat != null && p.lng != null;

// "2026-10-24T05:30" (Polish local time) -> readable "pt. 24.10, 05:30"
export function whenLabel(when, lang = "pl") {
  if (!when) return "";
  const [d, t] = when.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  const names = lang === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
  return `${names[wd]} ${String(day).padStart(2, "0")}.${String(m).padStart(2, "0")}, ${t}`;
}

// Current time in Poland as "YYYY-MM-DDTHH:MM" (to compare with booking times)
export function nowWarsaw(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60000);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// "YYYY-MM-DDTHH:MM" Polish local time -> epoch ms (summer and winter time)
export function warsawMs(local) {
  const guess = Date.parse(String(local).slice(0, 16) + ":00Z");
  if (Number.isNaN(guess)) return NaN;
  const seen = Date.parse(nowWarsaw((guess - Date.now()) / 60000) + ":00Z");   // that instant read on a Polish clock
  return guess - (seen - guess);
}

export function clockWarsaw(ms) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

// secret comparison without an early exit (timing-safe for equal-length strings)
export function safeEqual(a, b) {
  a = String(a ?? ""); b = String(b ?? "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
