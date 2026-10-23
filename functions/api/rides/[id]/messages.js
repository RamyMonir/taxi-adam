// GET  /api/rides/:id/messages?after=<id>   (header X-Ride-Token) – new chat lines for the status page
// POST /api/rides/:id/messages {token, text}                      – the customer writes to the driver / the owner
// Same secret ride token as the status page; open while the ride is open and 2 hours after it ended (server/chat.js).
import { json, bad } from "../../../../server/util.js";
import { load } from "../../../../server/rides.js";
import { hit } from "../../../../server/ratelimit.js";
import { cleanText, chatOpen, listMessages, publicMessage, customerCount, customerSays, PER_MINUTE, PER_RIDE } from "../../../../server/chat.js";

const noStore = { "cache-control": "no-store" };

export async function onRequestGet({ params, request, env }) {
  if (!/^[a-z0-9]{12}$/.test(params.id)) return bad("not found", 404);
  const r = await load(env, params.id);
  if (!r || request.headers.get("X-Ride-Token") !== r.token) return bad("not found", 404);
  const after = Math.max(0, parseInt(new URL(request.url).searchParams.get("after"), 10) || 0);
  const rows = await listMessages(env, r.id, after);
  return json({ open: chatOpen(r, env), messages: rows.map(publicMessage) }, 200, noStore);
}

export async function onRequestPost({ params, request, env }) {
  if (!/^[a-z0-9]{12}$/.test(params.id)) return bad("not found", 404);
  const b = await request.json().catch(() => ({}));
  const r = await load(env, params.id);
  if (!r || !b.token || b.token !== r.token) return bad("not found", 404);
  if (!chatOpen(r, env)) return bad("closed", 403);
  const c = cleanText(b.text);
  if (c.error) return bad(c.error, 400);
  if (!(await hit(env, "chat", r.id, { limit: PER_MINUTE, windowS: 60 })).allowed) return bad("slow", 429);
  if ((await customerCount(env, r.id)) >= PER_RIDE) return bad("limit", 429);
  const id = await customerSays(env, r, c.text);
  return json({ ok: true, id }, 200, noStore);
}
