// POST /api/rides/:id/cancel {token} – customer cancels; the driver gets a Telegram alert.
// The change is conditional (server/rides.js transition): a driver's tap at the same moment can't be overwritten.
import { json, bad } from "../../../../server/util.js";
import { load, transition, OPEN, syncDriverMessage, tg, publicView } from "../../../../server/rides.js";

export async function onRequestPost({ params, request, env }) {
  if (!/^[a-z0-9]{12}$/.test(params.id)) return bad("not found", 404);
  const b = await request.json().catch(() => ({}));
  const cur = await load(env, params.id);
  if (!cur || !b.token || b.token !== cur.token) return bad("not found", 404);
  if (!OPEN.includes(cur.status)) return json(publicView(cur));

  let was = cur.status;
  const r = await transition(env, cur.id, OPEN, (x) => {
    was = x.status;
    x.status = "cancelled"; x.data.cancelledBy = "client"; x.data.cancelledIn = was;
  });
  if (!r) return json(publicView((await load(env, params.id)) || cur));

  await syncDriverMessage(env, r);
  const wasActive = was !== "pending";
  if (r.data.driverId || !r.data.offers) await tg(env, "sendMessage", {
    chat_id: r.data.chat || env.TELEGRAM_CHAT_ID, reply_to_message_id: r.tg_msg || undefined,
    text: was === "ontrip" ? "🚫 Klient PRZERWAŁ kurs w trakcie jazdy."
        : was === "arrived" ? "🚫 Klient ANULOWAŁ kurs – nie czekaj."
        : wasActive ? "🚫 Klient ANULOWAŁ potwierdzony kurs – nie jedź." : "🚫 Klient anulował zgłoszenie.",
  });
  return json(publicView(r));
}
