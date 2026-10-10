// POST /api/telegram – webhook for the driver's bot (button taps and /start).
import { json, clockWarsaw } from "../../server/util.js";
import { load, save, tg, syncDriverMessage } from "../../server/rides.js";

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const u = await request.json().catch(() => ({}));

  // /start – tells whoever set up the bot their chat ID (needed for TELEGRAM_CHAT_ID)
  if (u.message && u.message.text && u.message.text.startsWith("/start")) {
    const id = u.message.chat.id;
    const known = String(id) === String(env.TELEGRAM_CHAT_ID);
    await tg(env, "sendMessage", {
      chat_id: id,
      text: known
        ? "✅ Bot działa. Tutaj będą przychodzić nowe kursy ze strony."
        : `Twój chat ID: ${id}\nWpisz go w Cloudflare jako TELEGRAM_CHAT_ID, a kursy zaczną przychodzić tutaj.`,
    });
    return json({ ok: true });
  }

  const q = u.callback_query;
  if (!q) return json({ ok: true });
  const answer = (text, alert = false) => tg(env, "answerCallbackQuery", { callback_query_id: q.id, text, show_alert: alert });
  if (String(q.message?.chat?.id) !== String(env.TELEGRAM_CHAT_ID)) { await answer("Brak uprawnień"); return json({ ok: true }); }

  const [act, id, arg] = String(q.data || "").split("|");
  const r = await load(env, id);
  if (!r) { await answer("Nie znaleziono kursu", true); return json({ ok: true }); }

  const st = r.status, min = parseInt(arg, 10) || 0;
  let toast = null;
  if (act === "e" && (st === "pending" || st === "scheduled") && min) {
    r.status = "enroute"; r.eta_at = Date.now() + min * 60000; toast = `Klient widzi: będziesz za ${min} min`;
  } else if (act === "s" && st === "pending" && r.mode === "later") {
    r.status = "scheduled"; toast = "Rezerwacja potwierdzona";
  } else if (act === "p" && st === "enroute" && min) {
    r.eta_at = Math.max(Date.now(), r.eta_at || 0) + min * 60000; toast = `Nowy czas: ${clockWarsaw(r.eta_at)}`;
  } else if (act === "a" && st === "enroute") {
    r.status = "arrived"; toast = "Klient dostał informację, że czekasz";
  } else if (act === "d" && st === "arrived") {
    r.status = "done"; toast = "Kurs zakończony 👍";
  } else if (act === "x" && ["pending", "scheduled", "enroute"].includes(st)) {
    r.status = "declined"; toast = "Kurs odrzucony – klient dostał informację";
  } else {
    const why = { cancelled: "Klient już anulował ten kurs", expired: "Zgłoszenie wygasło – klient mógł zadzwonić" }[st];
    await answer(why || "Ten przycisk jest już nieaktualny", true);
    await syncDriverMessage(env, r);
    return json({ ok: true });
  }
  await save(env, r);
  await Promise.all([answer(toast), syncDriverMessage(env, r)]);
  return json({ ok: true });
}
