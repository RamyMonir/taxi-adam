// Driver and car photos: stored in Cloudflare R2 (binding PHOTOS), shown to a customer only through
// /api/photo/<d|c>/<rideId>?t=<signature> while his own ride is active (+2 h after it ended).
// The photo is downloaded from Telegram on the server: Telegram file URLs contain the bot token,
// so they must never reach a browser.
import { tg } from "./rides.js";

const MAX_BYTES = 2_000_000;
const ACTIVE = ["scheduled", "enroute", "arrived", "ontrip"];
export const PHOTO_AFTER_MS = 2 * 3600e3;

export const photosEnabled = (env) => !!(env.PHOTOS && env.PHOTO_SECRET);

// Telegram file_id -> R2 object. Returns the key, or {error}.
export async function saveTelegramPhoto(env, fileId, key) {
  if (!env.PHOTOS) return { error: "r2" };
  const f = await tg(env, "getFile", { file_id: fileId });
  if (!f || !f.ok || !f.result?.file_path) return { error: "file" };
  if (f.result.file_size && f.result.file_size > MAX_BYTES) return { error: "size" };
  const res = await fetch(`${env.TELEGRAM_API_BASE || "https://api.telegram.org"}/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`);
  if (!res.ok) return { error: "file" };
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return { error: "size" };
  await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
  return { key };
}
// the largest size of a Telegram photo that is still small (≤ 800 px)
export function pickSize(sizes) {
  const list = (sizes || []).slice().sort((a, b) => a.width - b.width);
  return list.filter((p) => p.width <= 800).pop() || list[0] || null;
}
// the driver's current Telegram profile photo (file_id), if he has a visible one
export async function profilePhotoId(env, userId) {
  const j = await tg(env, "getUserProfilePhotos", { user_id: Number(userId), limit: 1 });
  const first = j && j.ok && j.result.photos && j.result.photos[0];
  const p = first && pickSize(first);
  return p ? p.file_id : null;
}

async function hmac(secret, text) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
// signature bound to the ride AND its secret token: only the customer's own device can have a valid link
export const photoSig = (env, r, kind) => hmac(env.PHOTO_SECRET, `${kind}:${r.id}:${r.token}`);

export function photoVisible(r, now = Date.now()) {
  if (ACTIVE.includes(r.status)) return true;
  return r.status === "done" && now - (r.updated || 0) < PHOTO_AFTER_MS;
}

// adds driver.photo / vehicle.photo URLs to the customer's view (only if there is a photo and consent)
export async function withPhotos(env, r, view) {
  if (!photosEnabled(env) || !photoVisible(r)) return view;
  if (view.driver && r.data.driver?.photo) view.driver.photo = `/api/photo/d/${r.id}?t=${await photoSig(env, r, "d")}`;
  if (view.vehicle && r.data.vehicle?.photo) view.vehicle.photo = `/api/photo/c/${r.id}?t=${await photoSig(env, r, "c")}`;
  return view;
}
