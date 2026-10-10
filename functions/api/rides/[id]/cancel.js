// POST /api/rides/:id/cancel {token} – customer cancels; the driver gets a Telegram alert.
import { json, bad } from "../../../../server/util.js";
import { load, save, OPEN, syncDriverMessage, tg, publicView } from "../../../../server/rides.js";

export async function onRequestPost({ params, request, env }) {
  const b = await request.json().catch(() => ({}));
  const r = await load(env, params.id);
  if (!r || !b.token || b.token !== r.token) return bad("not found", 404);
  if (!OPEN.includes(r.status)) return json(publicView(r));
  const was = r.status, wasActive = was !== "pending";
  r.status = "cancelled"; r.data.cancelledBy = "client"; r.data.cancelledIn = was;
  await save(env, r);
  await syncDriverMessage(env, r);
  await tg(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID, reply_to_message_id: r.tg_msg || undefined,
    text: was === "ontrip" ? "🚫 Klient PRZERWAŁ kurs w trakcie jazdy."
        : was === "arrived" ? "🚫 Klient ANULOWAŁ kurs – nie czekaj."
        : wasActive ? "🚫 Klient ANULOWAŁ potwierdzony kurs – nie jedź." : "🚫 Klient anulował zgłoszenie.",
  });
  return json(publicView(r));
}
