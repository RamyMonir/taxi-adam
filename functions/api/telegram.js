// POST /api/telegram – webhook for the driver's bot: button taps, /start and live location.
import { json, clockWarsaw, kmBetween, hasXY, esc } from "../../server/util.js";
import { route } from "../../server/google.js";
import { CONFIG } from "../../server/config.js";
import { load, save, tg, syncDriverMessage, saveDriverPos, driverPos, markHint, activeRides, navUrl } from "../../server/rides.js";

const btn = (text, data) => ({ text, callback_data: data });
const ARRIVE_KM = 0.15, FINISH_KM = 0.3, ETA_EVERY_MS = 60000;

// a new message (with sound) that asks the driver to confirm the next step
async function ask(env, r, text, buttons) {
  await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", reply_to_message_id: r.tg_msg || undefined,
                                  reply_markup: { inline_keyboard: buttons } });
}

// precise arrival: Google route (with traffic) from where the driver really is
async function refreshEta(env, r, me) {
  const d = r.data, target = r.status === "ontrip" ? d.dest : d.pickup;
  if (!hasXY(target) || !env.GOOGLE_SERVER_KEY || (d.liveAt && Date.now() - d.liveAt < ETA_EVERY_MS)) return;
  const x = await route(env, me, target, true).catch(() => null);
  if (!x || x.approx) return;
  d.liveAt = Date.now(); d.liveKm = Math.round(x.distanceM / 100) / 10; d.liveEtaAt = Date.now() + x.durationS * 1000; d.etaSource = "google";
  if (r.status === "enroute") r.eta_at = d.liveEtaAt;
  await save(env, r);
  await syncDriverMessage(env, r);
}

async function onLocation(env, loc) {
  await saveDriverPos(env, loc.latitude, loc.longitude);
  const me = { lat: loc.latitude, lng: loc.longitude };
  for (const r of await activeRides(env)) {
    const d = r.data;
    await refreshEta(env, r, me);
    if (r.status === "enroute" && hasXY(d.pickup)) {
      const km = kmBetween(me, d.pickup);
      if (!d.carStartKm) { d.carStartKm = Math.max(km, 0.3); await save(env, r); }
      if (km <= ARRIVE_KM && !d.askedArrive) {
        // the driver is at the pickup: tell the customer and ask the driver to start the trip
        d.askedArrive = true; r.status = "arrived"; d.arrivedAt = Date.now();
        await save(env, r);
        await syncDriverMessage(env, r);
        await ask(env, r, `📍 Jesteś na miejscu: <b>${esc(d.pickup.address)}</b>\nKlient dostał informację, że czekasz.\nGdy wsiądzie, rozpocznij kurs:`,
                  [[btn("▶️ Klient wsiadł – rozpocznij kurs", `t|${r.id}`)], [btn("❌ Klient nie przyszedł", `n|${r.id}`)]]);
      }
    } else if (r.status === "ontrip" && hasXY(d.dest) && !d.askedFinish && kmBetween(me, d.dest) <= FINISH_KM) {
      d.askedFinish = true; await save(env, r);
      await ask(env, r, `🏁 Jesteś u celu: <b>${esc(d.dest.address)}</b>\nZakończyć kurs?`, [[btn("🏁 Zakończ kurs", `d|${r.id}`)]]);
    }
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const u = await request.json().catch(() => ({}));
  const msg = u.message || u.edited_message;
  const fromDriver = msg && String(msg.chat?.id) === String(env.TELEGRAM_CHAT_ID);

  // live location shared by the driver (first message + edits while it moves)
  if (msg && msg.location && fromDriver) { await onLocation(env, msg.location); return json({ ok: true }); }

  // /start – tells whoever set up the bot their chat ID (needed for TELEGRAM_CHAT_ID)
  if (u.message && u.message.text && u.message.text.startsWith("/start")) {
    const id = u.message.chat.id;
    await tg(env, "sendMessage", {
      chat_id: id,
      text: fromDriver
        ? "✅ Bot działa. Tutaj będą przychodzić nowe kursy ze strony.\n\n📡 Wskazówka: udostępniaj mi lokalizację na żywo (📎 → Lokalizacja → Udostępniaj na żywo). Klient zobaczy, gdzie jesteś, a ja sam zapytam, czy jesteś na miejscu."
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

  const st = r.status, min = parseInt(arg, 10) || 0, d = r.data;
  let toast = null, follow = null;
  if (act === "e" && (st === "pending" || st === "scheduled")) {
    // arrival time: Google route with traffic from the driver's live position, else from the base
    const pos = await driverPos(env).catch(() => null);
    const live = pos && pos.ts && Date.now() - pos.ts < 5 * 60000;
    let secs = null;
    if (hasXY(d.pickup)) {
      const x = await route(env, live ? { lat: pos.lat, lng: pos.lng } : CONFIG.base, d.pickup, true).catch(() => null);
      if (x) {
        secs = x.durationS;
        if (live && !x.approx) { d.liveAt = Date.now(); d.liveKm = Math.round(x.distanceM / 100) / 10; d.liveEtaAt = Date.now() + secs * 1000; d.etaSource = "google"; }
      }
    }
    if (secs == null) secs = min ? min * 60 : d.approachS || 15 * 60;
    r.status = "enroute"; r.eta_at = Date.now() + secs * 1000 + 120000; d.enrouteAt = Date.now();   // +2 min to set off, same as the button
    const m = Math.max(1, Math.round((r.eta_at - Date.now()) / 60000));
    toast = `Przyjęte. Klient widzi: będziesz ok. ${clockWarsaw(r.eta_at)} (~${m} min)`;
    follow = "hint";
  } else if (act === "s" && st === "pending" && r.mode === "later") {
    r.status = "scheduled"; toast = "Rezerwacja potwierdzona";
  } else if (act === "p" && st === "enroute" && min) {   // old messages still have "+5 min"
    r.eta_at = Math.max(Date.now(), r.eta_at || 0) + min * 60000; toast = `Nowy czas: ${clockWarsaw(r.eta_at)}`;
  } else if (act === "a" && st === "enroute") {
    r.status = "arrived"; d.arrivedAt = Date.now(); toast = "Klient dostał informację, że czekasz";
    follow = "start";
  } else if (act === "t" && st === "arrived") {
    r.status = "ontrip"; d.startedAt = Date.now(); d.liveAt = 0; d.liveEtaAt = null; d.liveKm = null; toast = "Kurs rozpoczęty – szerokiej drogi!";
    follow = "navdest";
  } else if (act === "n" && st === "arrived") {
    r.status = "noshow"; toast = "Zapisano: klient nie przyszedł";
  } else if (act === "d" && (st === "ontrip" || st === "arrived")) {
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
  const jobs = [answer(toast), syncDriverMessage(env, r)];
  // a button tapped on a follow-up message: remove its buttons so it can't be tapped twice
  if (q.message?.message_id && q.message.message_id !== r.tg_msg) {
    jobs.push(tg(env, "editMessageReplyMarkup", { chat_id: env.TELEGRAM_CHAT_ID, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }));
  }
  await Promise.all(jobs);

  if (follow === "start") {
    await ask(env, r, `👋 Klient wie, że czekasz pod adresem <b>${esc(d.pickup.address)}</b>.\nGdy wsiądzie, rozpocznij kurs:`,
              [[btn("▶️ Klient wsiadł – rozpocznij kurs", `t|${r.id}`)], [btn("❌ Klient nie przyszedł", `n|${r.id}`)]]);
  } else if (follow === "navdest") {
    await ask(env, r, `🛣 Kurs rozpoczęty. Cel: <b>${esc(d.dest.address)}</b>`, [[{ text: "🧭 Nawiguj do celu (Google Maps)", url: navUrl(d.dest) }]]);
  }
  if (follow === "hint") {
    await ask(env, r, `🚕 Jedziesz do: <b>${esc(d.pickup.address)}</b>`, [[{ text: "🧭 Nawiguj do klienta (Google Maps)", url: navUrl(d.pickup) }]]);
    const pos = await driverPos(env).catch(() => null);
    const sharing = pos && pos.ts && Date.now() - pos.ts < 3 * 60000;
    if (!sharing &&(!pos || !pos.hint_ts || Date.now() - pos.hint_ts > 12 * 3600e3)) {
      await markHint(env);
      await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID,
        text: "📡 Udostępnij mi lokalizację na żywo: 📎 → Lokalizacja → „Udostępniaj lokalizację na żywo” (np. 8 h).\nKlient zobaczy, jak się zbliżasz, a gdy dojedziesz, sam zapytam, czy jesteś na miejscu." });
    }
  }
  return json({ ok: true });
}
