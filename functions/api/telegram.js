// POST /api/telegram – webhook for the driver's bot: button taps, /start and live location.
import { json, clockWarsaw, kmBetween, hasXY, esc, randomId, canonicalOrigin } from "../../server/util.js";
import { route, findPlace } from "../../server/google.js";
import { price } from "../../server/pricing.js";
import { parseRide, HELP, PARSE_ERRORS } from "../../server/phone.js";
import { lookupCustomer, recordOrder, recordDone } from "../../server/customers.js";
import { CONFIG } from "../../server/config.js";
import { db, notifyDriver, load, save, saveIfUnchanged, tg, syncDriverMessage, saveDriverPos, driverPos, markHint, activeRides, navUrl, isLive, refreshEta, SET_OFF_MS } from "../../server/rides.js";

const btn = (text, data) => ({ text, callback_data: data });
const ARRIVE_KM = 0.15, FINISH_KM = 0.3;

// a new message (with sound) that asks the driver to confirm the next step
async function ask(env, r, text, buttons) {
  await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", reply_to_message_id: r.tg_msg || undefined,
                                  reply_markup: { inline_keyboard: buttons } });
}

// live location window: shared "for 8 h" -> valid until message date + live_period.
// A plain (one-off) location counts for 5 minutes; an edit without live_period means sharing stopped.
function liveUntil(msg, edited) {
  const loc = msg.location;
  if (loc.live_period) return (msg.date + loc.live_period) * 1000;
  return edited ? Date.now() : null;
}

async function onLocation(env, msg, edited) {
  const loc = msg.location;
  let until = liveUntil(msg, edited);
  if (until == null && !edited) {
    const prev = await driverPos(env).catch(() => null);
    if (prev && prev.until && prev.until > Date.now()) until = prev.until;
  }
  await saveDriverPos(env, loc.latitude, loc.longitude, until);
  const me = { lat: loc.latitude, lng: loc.longitude, ts: Date.now(), until };
  for (let r of await activeRides(env)) {
    let d = r.data;
    if (r.status === "enroute" && hasXY(d.pickup)) {
      const km = kmBetween(me, d.pickup);
      if (km <= ARRIVE_KM && !d.askedArrive) {
        // the driver is at the pickup: tell the customer and ask the driver to start the trip
        let done = false;
        for (let tries = 0; tries < 2 && !done; tries++) {
          if (tries) { r = await load(env, r.id); d = r && r.data; if (!r || r.status !== "enroute" || d.askedArrive) break; }
          const prev = r.updated;
          d.askedArrive = true; r.status = "arrived"; d.arrivedAt = Date.now();
          done = await saveIfUnchanged(env, r, prev);
        }
        if (!done) continue;   // ride changed meanwhile (tap / cancel): leave it
        await syncDriverMessage(env, r);
        await ask(env, r, `📍 Jesteś na miejscu: <b>${esc(d.pickup.address)}</b>\nKlient dostał informację, że czekasz.\nGdy wsiądzie, rozpocznij kurs:`,
                  [[btn("▶️ Klient wsiadł – rozpocznij kurs", `t|${r.id}`)], [btn("❌ Klient nie przyszedł", `n|${r.id}`)]]);
        continue;
      }
      if (!d.carStartKm) { const prev = r.updated; d.carStartKm = Math.round(Math.max(km, 0.3) * 10) / 10; await saveIfUnchanged(env, r, prev); }
    } else if (r.status === "ontrip" && hasXY(d.dest) && !d.askedFinish && kmBetween(me, d.dest) <= FINISH_KM) {
      const prev = r.updated;
      d.askedFinish = true;
      if (await saveIfUnchanged(env, r, prev)) {
        await ask(env, r, `🏁 Jesteś u celu: <b>${esc(d.dest.address)}</b>\nZakończyć kurs?`, [[btn("🏁 Zakończ kurs", `d|${r.id}`)]]);
      }
      continue;
    }
    if (await refreshEta(env, r, me)) await syncDriverMessage(env, r);
  }
}

// "/kurs SKĄD > DOKĄD, KIEDY, TELEFON, IMIĘ" – a ride taken over the phone. Shows a preview first.
async function phoneRide(env, request, text) {
  const say = (t) => tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: t, parse_mode: "HTML" });
  const p = parseRide(text);
  if (p.error) { await say((PARSE_ERRORS[p.error] ? "⚠️ " + PARSE_ERRORS[p.error] + "\n\n" : "") + HELP); return; }
  if (!env.GOOGLE_SERVER_KEY) { await say("⚠️ Brak klucza Google (GOOGLE_SERVER_KEY) – nie znajdę adresów."); return; }
  const find = async (q) => {
    const f = await findPlace(env, q, CONFIG.base).catch(() => null);
    if (!f) return null;
    const address = f.name && !f.address.toLowerCase().includes(f.name.toLowerCase()) ? `${f.name}, ${f.address}` : f.address;
    return { address, lat: f.lat, lng: f.lng };
  };
  const [pickup, dest] = await Promise.all([find(p.pickup), find(p.dest)]);
  if (!pickup || !dest) {
    await say(`⚠️ Nie znalazłem adresu: <b>${esc(!pickup ? p.pickup : p.dest)}</b>. Dopisz miejscowość albo ulicę z numerem.`);
    return;
  }
  const [trip, cust] = await Promise.all([route(env, pickup, dest).catch(() => null), lookupCustomer(env, p.phone).catch(() => null)]);
  const pr = price(pickup, dest, trip && trip.distanceM);
  const r = {
    id: randomId(12), token: randomId(24), status: "draft", mode: p.when ? "later" : "now", created: Date.now(), ip: "phone", eta_at: null, tg_msg: null,
    data: {
      source: "phone", origin: canonicalOrigin(request, env), typed: { pickup: p.pickup, dest: p.dest },
      pickup, dest, when: p.when, pax: p.pax, phone: p.phone, name: p.name, notes: p.notes, lang: "pl",
      distanceM: trip?.distanceM ?? null, durationS: trip?.durationS ?? null, polyline: trip?.polyline ?? null,
      price: pr?.amount ?? null, priceKind: pr?.kind ?? null,
      // the customer's account (same phone number): the ride shows up there too
      ...(cust && cust.uid ? { uid: cust.uid } : {}),
      ...(cust ? { cust: { ...cust, uid: undefined }, name: p.name || cust.name || cust.accountName || "" } : {}),
    },
  };
  await save(env, r);
  r.tg_msg = await notifyDriver(env, r);
  await save(env, r);
}

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const u = await request.json().catch(() => ({}));
  const msg = u.message || u.edited_message;
  const fromDriver = msg && String(msg.chat?.id) === String(env.TELEGRAM_CHAT_ID);

  // live location shared by the driver (first message + edits while it moves)
  if (msg && msg.location && fromDriver) { await onLocation(env, msg, !!u.edited_message); return json({ ok: true }); }

  if (u.message && u.message.text && /^\/kurs\b/i.test(u.message.text) && fromDriver) {
    await phoneRide(env, request, u.message.text);
    return json({ ok: true });
  }

  // /start – tells whoever set up the bot their chat ID (needed for TELEGRAM_CHAT_ID)
  if (u.message && u.message.text && u.message.text.startsWith("/start")) {
    const id = u.message.chat.id;
    await tg(env, "sendMessage", {
      chat_id: id,
      text: fromDriver
        ? "✅ Bot działa. Tutaj będą przychodzić nowe kursy ze strony.\n\n📞 Kurs przyjęty telefonicznie dodasz komendą /kurs (napisz samo /kurs, a pokażę przykład).\n\n📡 Wskazówka: udostępniaj mi lokalizację na żywo (📎 → Lokalizacja → Udostępniaj na żywo). Klient zobaczy, gdzie jesteś, a ja sam zapytam, czy jesteś na miejscu."
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

  let st = r.status, act2 = act;
  const min = parseInt(arg, 10) || 0, d = r.data;
  let toast = null, follow = null;
  // preview of a phone ride: save it (a "now" ride goes straight to "I'm on my way"), or delete it
  if (act === "del" && st === "draft") {
    await (await db(env)).prepare("DELETE FROM rides WHERE id = ? AND status = 'draft'").bind(r.id).run();
    await answer("Usunięto");
    await tg(env, "deleteMessage", { chat_id: env.TELEGRAM_CHAT_ID, message_id: q.message.message_id });
    return json({ ok: true });
  }
  if (act === "ok" && st === "draft") {
    await recordOrder(env, r).catch(() => {});
    if (r.mode === "later") { r.status = "scheduled"; await save(env, r); await Promise.all([answer("Zapisano rezerwację"), syncDriverMessage(env, r)]); return json({ ok: true }); }
    st = "pending"; act2 = "e";
  }
  if (act2 === "e" && (st === "pending" || st === "scheduled")) {
    // arrival time: Google route with traffic from the driver's live position, else from the base
    const pos = await driverPos(env).catch(() => null);
    const live = isLive(pos);
    let secs = null;
    if (hasXY(d.pickup)) {
      const x = await route(env, live ? { lat: pos.lat, lng: pos.lng } : CONFIG.base, d.pickup, true).catch(() => null);
      if (x) {
        // the straight-line fallback already includes 2 min; Google times get the 2 min to set off here
        secs = x.durationS + (x.approx ? 0 : SET_OFF_MS / 1000);
        if (live && !x.approx) {
          d.liveAt = Date.now(); d.liveFrom = d.acceptFrom = `${pos.lat},${pos.lng}`;
          d.liveKm = Math.round(x.distanceM / 100) / 10; d.liveEtaAt = Date.now() + secs * 1000; d.etaSource = "google";
        }
      }
      if (live) d.carStartKm = Math.round(Math.max(kmBetween(pos, d.pickup), 0.3) * 10) / 10;
    }
    if (secs == null) secs = min ? min * 60 : (d.approachS || 13 * 60) + SET_OFF_MS / 1000;
    r.status = "enroute"; r.eta_at = Date.now() + secs * 1000; d.enrouteAt = Date.now();
    const m = Math.max(1, Math.ceil(secs / 60));
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
    await recordDone(env, r).catch(() => {});
  } else if (act === "x" && ["pending", "scheduled", "enroute"].includes(st)) {
    r.status = "declined"; toast = "Kurs odrzucony – klient dostał informację";
  } else if (act === "c" && (st === "arrived" || st === "ontrip")) {
    // cancelling a started ride: ask once more, a tap by mistake must not end it
    await answer("Potwierdź poniżej");
    await ask(env, r, st === "ontrip" ? "🚫 Na pewno <b>przerwać kurs</b> w trakcie jazdy? Klient dostanie informację." : "🚫 Na pewno <b>anulować kurs</b>? Klient dostanie informację.",
              [[btn(st === "ontrip" ? "Tak, przerwij kurs" : "Tak, anuluj kurs", `X|${r.id}`)], [btn("Nie", `k|${r.id}`)]]);
    return json({ ok: true });
  } else if (act === "X" && (st === "arrived" || st === "ontrip")) {
    r.status = "cancelled"; d.cancelledBy = "driver"; d.cancelledIn = st; toast = "Kurs anulowany – klient dostał informację";
  } else if (act === "k") {
    await answer("OK, kurs trwa dalej");
    if (q.message?.message_id) await tg(env, "editMessageReplyMarkup", { chat_id: env.TELEGRAM_CHAT_ID, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
    return json({ ok: true });
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
    const sharing = isLive(pos);
    if (!sharing &&(!pos || !pos.hint_ts || Date.now() - pos.hint_ts > 12 * 3600e3)) {
      await markHint(env);
      await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID,
        text: "📡 Udostępnij mi lokalizację na żywo: 📎 → Lokalizacja → „Udostępniaj lokalizację na żywo” (np. 8 h).\nKlient zobaczy, jak się zbliżasz, a gdy dojedziesz, sam zapytam, czy jesteś na miejscu." });
    }
  }
  return json({ ok: true });
}
