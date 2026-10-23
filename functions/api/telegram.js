// POST /api/telegram – webhook of the bot used by the owner and his drivers (each in his own private chat):
// button taps, commands, and every driver's live location.
import { json, clockWarsaw, kmBetween, hasXY, esc, randomId, canonicalOrigin, safeEqual } from "../../server/util.js";
import { route, findPlace } from "../../server/google.js";
import { price } from "../../server/pricing.js";
import { parseRide, HELP, PARSE_ERRORS } from "../../server/phone.js";
import { lookupCustomer, recordOrder, recordDone } from "../../server/customers.js";
import { METHODS, setPayMsg, setPaid, tripByPayMsg, parsePaid, parsePeriod, buildReport, chunks, REPORT_HELP } from "../../server/report.js";
import { CONFIG } from "../../server/config.js";
import { db, notifyDriver, tgFile, load, save, saveIfUnchanged, transition, tg, syncDriverMessage, closeOtherOffers, activeRides, navUrl, isLive,
         refreshEta, driverText, keyboard, SET_OFF_MS, nextListing } from "../../server/rides.js";
import { driverByChat, listDrivers, saveDriverPos, markHint, addDriver, bindDriver, updateDriver, deactivateDriver, newInviteCode,
         busyDriverIds, botUsername, escalate, ensureOwner, availability, availabilityText, ownerPanel, offerToFree, offerToDriver, ownerInfoText } from "../../server/fleet.js";
import { currentCar, vehicleSnapshot, carName, carLabel, carLong, isDemo, release } from "../../server/cars.js";
import { fleetCallback, fleetCommand, onPhotoMessage, sendCarPicker, FLEET_OWNER_HELP, todayLine } from "../../server/botfleet.js";
import { ensureFleetSynced } from "../../server/fleetsync.js";
import { modelOf, modelLabel } from "../../server/settle.js";
import { aiOn, voiceOn, aiParse, missingOf, understoodText, transcribe } from "../../server/ai.js";
import { rideBoard } from "../../server/board.js";
import { assign, setVehicle } from "../../server/assign.js";
import { chatOpen, canAnswer, taxiSays, rideByTg, cleanText, QUICK_TAXI, MAX_LEN } from "../../server/chat.js";
import { askReports, looksLikeQuestion } from "../../server/ask.js";
import { OWNER, BRAND, EX } from "../../server/brand.js";

const btn = (text, data) => ({ text, callback_data: data });

const ARRIVE_KM = 0.15, FINISH_KM = 0.3;
const say = (env, chat, text, extra = {}) => tg(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

// The menu at the bottom of the chat: big buttons instead of commands to remember. A tap sends the button's text,
// which is mapped to the command below.
const MENU = {
  driver: [["🟢 Zmiana", "🚗 Moje auto"], ["📞 Kurs z telefonu", "📊 Mój dzień"], ["👤 Ja", "❓ Pomoc"]],
  owner: [["➕ Nowy kurs", "🗂 Kursy w toku"], ["👥 Kierowcy", "🚗 Auta"], ["📊 Raport dziś", "🟢 Zmiana"], ["👤 Ja", "❓ Pomoc"]],
};
const OLD_BOARD_BTN = "📋 Kursy teraz";   // the button's old name, still on phones until the menu is sent again
const MENU_CMD = { "➕ Nowy kurs": "/kurs", "🗂 Kursy w toku": "/kursy", [OLD_BOARD_BTN]: "/kursy", "🟢 Zmiana": "/zmiana", "🚗 Moje auto": "/auto", "📞 Kurs z telefonu": "/kurs", "📊 Mój dzień": "/raport", "📊 Raport dziś": "/raport",
                   "👤 Ja": "/ja", "❓ Pomoc": "/pomoc", "👥 Kierowcy": "/kierowcy", "🚗 Auta": "/auta" };
const menu = (drv) => ({ keyboard: (drv && drv.owner ? MENU.owner : MENU.driver).map((row) => row.map((text) => ({ text }))),
                         resize_keyboard: true, is_persistent: true, input_field_placeholder: "Wybierz przycisk albo napisz…" });
// "Rynek 1 > Pyrzowice, 600100200" typed without /kurs
const looksLikeRide = (t) => /\S\s*(?:->|→|=>|>)\s*\S/.test(t) && (t.match(/\d/g) || []).length >= 9;
const REPORT_BTNS = { inline_keyboard: [[btn("Dziś", "rep|d"), btn("Wczoraj", "rep|w")], [btn("Ten tydzień", "rep|t"), btn("Ten miesiąc", "rep|m")]] };
const REPORT_PERIOD = { d: "dziś", w: "wczoraj", t: "tydzień", m: "miesiąc" };
const SHIFT_HOW =
  "⚪ <b>Nie jesteś teraz na zmianie</b> – kursy do Ciebie nie przychodzą.\n\n" +
  "Żeby zacząć zmianę, tutaj w czacie:\n" +
  "1. Dotknij 📎 (spinacz) obok pola wiadomości\n" +
  "2. Wybierz <b>Lokalizacja</b>\n" +
  "3. <b>Udostępniaj lokalizację na żywo</b> → najlepiej „Do wyłączenia”\n\n" +
  "Potem wybierzesz auto jednym dotknięciem. Koniec zmiany = zatrzymaj udostępnianie.";
const hello = (drv) => {
  const h = +new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" });
  const first = String(drv && drv.name || "").split(" ")[0];
  return (h >= 5 && h < 18 ? "Dzień dobry" : h >= 18 && h < 23 ? "Dobry wieczór" : "Cześć") + (first ? ", " + esc(first) : "") + "! 👋";
};
// one line: on duty or not, which car, what's missing
async function statusLine(env, drv) {
  const car = await currentCar(env, drv.id).catch(() => null), live = isLive(drv);
  if (live && (car || drv.owner)) return `🟢 Jesteś na zmianie${car ? " · 🚗 " + esc(carLabel(car)) : ""}`;
  if (live) return "🟡 Masz lokalizację na żywo, ale <b>bez auta</b> – wybierz je („🚗 Moje auto”).";
  if (car) return `🟡 Masz auto ${esc(carLabel(car))}, ale <b>bez lokalizacji na żywo</b> – udostępnij ją, żeby dostawać kursy.`;
  return "⚪ Nie jesteś na zmianie – dotknij „🟢 Zmiana”, żeby zacząć.";
}
function helpText(drv, env) {
  if (drv && drv.owner) return ownerHelpText(env);
  const L = [
    "❓ <b>Jak to działa</b>", "",
    "🟢 <b>Zmiana</b> – start: udostępnij mi lokalizację na żywo (📎 → Lokalizacja). Koniec: zatrzymaj udostępnianie.",
    "🚗 <b>Auto</b> – wybór i zmiana jednym dotknięciem (przycisk „Moje auto”), oddanie: /oddaj.",
    "🚖 <b>Kursy</b> przychodzą tutaj: <b>Przyjmuję</b> albo <b>Odrzuć</b>, potem <b>Jestem na miejscu</b> → <b>Klient wsiadł</b> → <b>Zakończ</b>. Gdy masz lokalizację na żywo, „na miejscu” i „u celu” zaznaczam sam.",
    `📞 <b>Kurs z telefonu</b> – napisz jedną linijkę: <code>SKĄD &gt; DOKĄD, KIEDY, TELEFON, IMIĘ</code>, np. <code>${EX.addr} &gt; ${EX.airport}, jutro 14:30, 600100200</code>`,
    "📊 <b>Mój dzień</b> – kursy, kilometry i rozliczenie (też tydzień i miesiąc).",
    "👤 <b>Ja</b> – Twoje dane. Zmiany: <code>/telefon 600100200</code> · /zdjecie · <code>/imie Marek</code>",
  ];
  return L.join("\n");
}
// the owner: dispatcher first – a call comes in, he decides who drives
function ownerHelpText(env) {
  const ai = env && aiOn(env);
  return [
    `❓ <b>Jak to działa – ${OWNER.nom}</b>`, "",
    "📞 <b>Ktoś dzwoni?</b> Dotknij „➕ Nowy kurs”" + (ai ? " i napisz" + (voiceOn(env) ? " (albo nagraj 🎤)" : "") + " kurs własnymi słowami:" : " albo po prostu napisz jedną linijkę:"),
    ai ? `<i>Pani Ewa, ${EX.street} ${EX.station_to}, za 20 minut, 600 100 200</i>` : `<code>${EX.addr} &gt; ${EX.station}, 600100200, Pani Ewa</code>`,
    ai ? "Czegoś brakuje? Dopytam. Coś źle zrozumiałem? <b>Odpowiedz</b> na podgląd poprawką, np. <i>o 15:30</i>."
       : `<code>${EX.addr} &gt; ${EX.airport}, jutro 14:30, 600100200</code> (z godziną = rezerwacja)`,
    "Dostaniesz podgląd z ceną i podpowiedzią <b>kto jedzie</b>: czas dojazdu każdego wolnego kierowcy z korkami (Google, z jego lokalizacji na żywo), ⭐ = najszybszy. Widzisz też, kto jest w kursie i kiedy się zwolni, komu koliduje rezerwacja (⚠️) i komu brakuje miejsc (🚫). Jeden przycisk:",
    "  ⭐ <b>Daj: Imię</b> – kurs dostaje polecany kierowca; jeśli odmówi, wraca do Ciebie",
    "  🟢 <b>Imię</b> – ktoś inny z wolnych",
    "  📨 <b>Wyślij do wolnych</b> – dostaje najszybszy, po minucie wszyscy wolni",
    "  🙋 <b>Jadę sam</b> – kurs jest Twój",
    "  👤 <b>Przydziel: Imię</b> – rezerwacja dla konkretnego kierowcy",
    "  🗑 <b>Usuń</b> – pomyłka, kasujesz",
    "",
    "🌐 <b>Kursy ze strony</b> idą same do kierowcy, który najszybciej dojedzie. Ty dostajesz cichą kopię z tymi samymi przyciskami – możesz przejąć albo dać komuś innemu.",
    ...(ai ? ["💬 <b>Pytaj o raporty</b> zwykłym zdaniem" + (voiceOn(env) ? " albo głosówką" : "") + ": <i>Ile zarobił Marek w październiku?</i> · <i>Ile kursów na lotnisko w tym tygodniu?</i>"] : []),
    "🗂 <b>Kursy w toku</b> – tablica: co czeka na kierowcę (z przyciskiem „👥 Kto jedzie?”), kto teraz wiezie klienta i kiedy się zwolni, rezerwacje.",
    "👥 <b>Kierowcy</b> – kto wolny, kto w kursie, kto poza zmianą, kto jeszcze nie dołączył (z linkiem). 🗑 usuwa kierowcę.",
    "  Dodaj: <code>/dodaj Imię 600100200</code> · link: <code>/link 3</code> · wizytówka: <code>/wizytowka 2 3</code>",
    "🚗 <b>Auta</b> / 📊 <b>Raport dziś</b> / 🟢 <b>Zmiana</b> (gdy sam jeździsz) / 👤 <b>Ja</b>",
    "",
    FLEET_OWNER_HELP,
  ].join("\n");
}

// a new message (with sound) in the chat of the driver who has the ride
async function ask(env, r, text, buttons) {
  const j = await tg(env, "sendMessage", { chat_id: r.data.chat || env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML",
    reply_to_message_id: r.tg_msg || undefined, reply_markup: { inline_keyboard: buttons } });
  return j && j.ok ? j.result.message_id : null;
}

function unassign(r) {
  const d = r.data;
  d.driverId = null; d.chat = null; d.driver = null; d.vehicle = null; r.tg_msg = null; r.eta_at = null;
  d.enrouteAt = null; d.liveAt = 0; d.liveEtaAt = null; d.liveKm = null; d.acceptFrom = null; d.carStartKm = null; d.askedArrive = false;
}
const mine = (r, drv) => drv.owner || (r.data.driverId || "owner") === drv.id;

// after "Zakończ kurs": how much did the customer pay, and how
async function askPayment(env, r) {
  const p = r.data.price;
  const rows = p ? [[btn(`💵 Gotówka ${p} zł`, `pay|${r.id}|g`), btn(`💳 Karta ${p} zł`, `pay|${r.id}|k`)],
                    [btn(`📱 BLIK ${p} zł`, `pay|${r.id}|b`), btn(`🏦 Przelew ${p} zł`, `pay|${r.id}|p`)],
                    [btn("✏️ Inna kwota", `pay|${r.id}|o`)]] : [];
  const id = await ask(env, r, `💰 <b>Ile zapłacił klient?</b>${p ? "" : "\nOdpisz na tę wiadomość kwotą, np. <i>85 karta</i>."}`, rows);
  if (id) await setPayMsg(env, r.id, id);
}

// "/raport [okres]" – a driver gets his own rides, the owner gets everyone (+ per driver)
async function sendReport(env, drv, text) {
  const per = parsePeriod(text.replace(/^\/raport(@\w+)?/i, "").trim());
  if (!per) { await say(env, drv.chat_id, "⚠️ Nie rozumiem okresu.\n\n" + REPORT_HELP); return; }
  const rep = await buildReport(env, per.from, per.to, drv.owner ? null : drv.id);
  const parts = chunks(rep.text);
  for (let i = 0; i < parts.length; i++) await say(env, drv.chat_id, parts[i], i === parts.length - 1 ? { reply_markup: REPORT_BTNS } : {});
  if (rep.rows.length) await tgFile(env, `raport_${per.from}${per.to !== per.from ? "_" + per.to : ""}.csv`, rep.csv, `Kursy: ${rep.title}`, drv.chat_id);
}

// live location window: shared "for 8 h" -> valid until message date + live_period ("until I turn it off" = a huge period).
// A plain (one-off) location counts for 5 minutes; an edit without live_period means sharing stopped.
function liveUntil(msg, edited) {
  const loc = msg.location;
  if (loc.live_period) return (msg.date + Math.min(loc.live_period, 400 * 86400)) * 1000;
  return edited ? Date.now() : null;
}

async function onLocation(env, drv, msg, edited) {
  const loc = msg.location;
  let until = liveUntil(msg, edited);
  if (until == null && !edited && drv.until && drv.until > Date.now()) until = drv.until;   // a one-off point keeps the live window
  const wasLive = isLive(drv);
  await saveDriverPos(env, drv.id, loc.latitude, loc.longitude, until);
  const me = { lat: loc.latitude, lng: loc.longitude, ts: Date.now(), until };
  if (!wasLive && isLive(me) && !edited) {
    // shift start: one tap to pick the car (or a reminder which car he holds)
    const car = await currentCar(env, drv.id);
    if (!car) await sendCarPicker(env, drv, "🟢 <b>Jesteś na zmianie.</b> Którym autem dziś jeździsz?" + (drv.owner ? "" : "\n<i>Bez auta nie dostaniesz kursów.</i>"));
    else if (!drv.owner) await say(env, drv.chat_id, `🟢 Jesteś na zmianie – będę Ci wysyłać kursy z okolicy.\n🚗 Auto: <b>${esc(carLong(car))}</b>`,
      { reply_markup: { inline_keyboard: [[btn("🔁 Zmień auto", "carlist|-"), btn("🔓 Oddaj auto", "carrel|-")]] } });
  } else if (wasLive && edited && !isLive(me)) {
    // live location stopped = end of shift? ask once what to do with the car
    const car = await currentCar(env, drv.id);
    if (car) await say(env, drv.chat_id, `🔴 <b>Koniec zmiany?</b> Masz auto <b>${esc(carLabel(car))}</b>.`,
      { reply_markup: { inline_keyboard: [[btn("🔓 Tak, oddaję auto", "carrel|-")], [btn("☕ Przerwa – zostawiam auto", "carkeep|-")]] } });
  }
  for (let r of await activeRides(env, drv.id)) {
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

/* ---------------- a ride taken over the phone: "➕ Nowy kurs" ----------------
   With the AI on, the owner (or a driver) writes or says the ride in his own words; what's missing is asked for, and a reply to
   the preview corrects it. Without the AI: the one-line format "SKĄD > DOKĄD, KIEDY, TELEFON, IMIĘ" (server/phone.js). */
const AWAIT_MS = 15 * 60000;
// "the next message is part of a ride": {ts, text = what he said so far}
function awaiting(drv) {
  try { const a = JSON.parse(drv.await_ride || "null"); return a && Date.now() - a.ts < AWAIT_MS ? a : null; } catch { return null; }
}
const setAwait = (env, drv, text) => updateDriver(env, drv.id, { await_ride: text == null ? null : JSON.stringify({ ts: Date.now(), text }) });

async function askForRide(env, drv) {
  if (!aiOn(env)) return say(env, drv.chat_id, HELP);
  await setAwait(env, drv, "");
  return say(env, drv.chat_id,
    `➕ <b>Nowy kurs</b>\nNapisz${voiceOn(env) ? " albo nagraj 🎤" : ""} kurs własnymi słowami, np.:\n` +
    `<i>Pani Ewa, ${EX.street} ${EX.station_to}, za 20 minut, 600 100 200</i>\n` +
    `<i>jutro 5:30 ${EX.addr2} na ${EX.airport}, 3 osoby, 2 walizki, 600 300 400</i>\n\n` +
    "Zrozumiem adresy, godzinę, telefon i liczbę osób – a potem podpowiem, kto najszybciej dojedzie.",
    { reply_markup: { inline_keyboard: [[btn("✖️ Anuluj", "aw|x")]] } });
}

// text (typed or from a voice message) that should be a ride. soft = only a guess: false if it isn't one.
async function smartRide(env, request, drv, text, { soft = false } = {}) {
  if (aiOn(env)) {
    tg(env, "sendChatAction", { chat_id: drv.chat_id, action: "typing" }).catch(() => {});
    const p = await aiParse(env, text);
    if (p) {
      if (!p.isRide && soft) return false;
      const miss = missingOf(p);
      if (miss.length) {
        await setAwait(env, drv, text);
        await say(env, drv.chat_id, `🧠 <b>Zrozumiałem:</b>\n${understoodText(p, esc)}\n\n❓ Brakuje: <b>${miss.join(", ")}</b>.\n` +
          `Dopisz to w następnej wiadomości${voiceOn(env) ? " (albo nagraj 🎤)" : ""}.`, { reply_markup: { inline_keyboard: [[btn("✖️ Anuluj ten kurs", "aw|x")]] } });
        return true;
      }
      await setAwait(env, drv, null);
      await phoneRide(env, request, drv, p, text);
      return true;
    }
    // the AI didn't answer: the one-line format still works
  }
  if (soft && !looksLikeRide(text)) return false;
  await setAwait(env, drv, null);
  const p = parseRide("/kurs " + text.replace(/^\/kurs(@\w+)?\s*/i, ""));
  if (p.error) { await say(env, drv.chat_id, (PARSE_ERRORS[p.error] ? "⚠️ " + PARSE_ERRORS[p.error] + "\n\n" : "") + HELP); return true; }
  await phoneRide(env, request, drv, p, null);
  return true;
}

// the preview of his phone ride he replied to (a correction)
async function draftByMsg(env, drv, msgId) {
  const row = await (await db(env)).prepare("SELECT * FROM rides WHERE status = 'draft' AND tg_msg = ?").bind(msgId).first();
  const r = row ? { ...row, data: JSON.parse(row.data) } : null;
  return r && (r.data.driverId || "owner") === drv.id ? r : null;
}

// any text or voice from a driver that isn't a button or a command: part of a ride, a correction, or a new ride
async function rideText(env, request, drv, text, replyTo) {
  if (replyTo && aiOn(env)) {
    const old = await draftByMsg(env, drv, replyTo).catch(() => null);
    if (old && old.data.said) {
      await (await db(env)).prepare("DELETE FROM rides WHERE id = ? AND status = 'draft'").bind(old.id).run();
      await tg(env, "deleteMessage", { chat_id: drv.chat_id, message_id: old.tg_msg });
      return smartRide(env, request, drv, `${old.data.said}\nPoprawka: ${text}`);
    }
  }
  const a = awaiting(drv);
  if (a) return smartRide(env, request, drv, a.text ? `${a.text}\n${text}` : text);
  if (aiOn(env) && looksLikeQuestion(text)) {   // "Ile zarobił Marek w październiku?" -> answered from the reports
    tg(env, "sendChatAction", { chat_id: drv.chat_id, action: "typing" }).catch(() => {});
    const ans = await askReports(env, drv, text);
    await tg(env, "sendMessage", { chat_id: drv.chat_id, text: ans ? "📊 " + ans : "📊 Nie udało się teraz policzyć – spróbuj „📊 Raport dziś” albo zapytaj za chwilę." });
    return true;
  }
  if (looksLikeRide(text)) return smartRide(env, request, drv, text);
  if (drv.owner && aiOn(env) && text.trim().length >= 12) return smartRide(env, request, drv, text, { soft: true });
  return false;
}

// a voice message -> text -> the same as typed
async function onVoice(env, request, drv, m) {
  const v = m.voice || m.audio;
  if (!voiceOn(env) || !aiOn(env)) {
    return say(env, drv.chat_id, "🎤 Głosówki nie są jeszcze włączone – napisz kurs tekstem." + (drv.owner ? "\n<i>Jak włączyć: SETUP.md → „Nowy kurs z AI”.</i>" : ""));
  }
  if ((v.duration || 0) > 120) return say(env, drv.chat_id, "🎤 Za długa głosówka (najwyżej 2 minuty) – nagraj krócej albo napisz.");
  tg(env, "sendChatAction", { chat_id: drv.chat_id, action: "typing" }).catch(() => {});
  const f = await tg(env, "getFile", { file_id: v.file_id });
  const res = f && f.ok ? await fetch(`${env.TELEGRAM_API_BASE || "https://api.telegram.org"}/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`).catch(() => null) : null;
  const text = res && res.ok ? await transcribe(env, await res.arrayBuffer()) : null;
  if (!text) return say(env, drv.chat_id, "🎤 Nie udało się odsłuchać – nagraj jeszcze raz albo napisz kurs tekstem.");
  await say(env, drv.chat_id, `🎤 <i>„${esc(text)}”</i>`, { reply_to_message_id: m.message_id });
  if (!(await rideText(env, request, drv, text, m.reply_to_message?.message_id))) {
    await say(env, drv.chat_id, "🤔 To nie brzmi jak kurs. Powiedz skąd, dokąd, kiedy i numer telefonu klienta.");
  }
}

// the ride (parsed from one line or understood by the AI) -> addresses, price, preview + who should drive
async function phoneRide(env, request, drv, p, said) {
  if (!env.GOOGLE_SERVER_KEY) { await say(env, drv.chat_id, "⚠️ Brak klucza Google (GOOGLE_SERVER_KEY) – nie znajdę adresów."); return; }
  const find = async (q) => {
    const f = await findPlace(env, q, CONFIG.base).catch(() => null);
    if (!f) return null;
    const address = f.name && !f.address.toLowerCase().includes(f.name.toLowerCase()) ? `${f.name}, ${f.address}` : f.address;
    return { address, lat: f.lat, lng: f.lng };
  };
  const [pickup, dest] = await Promise.all([find(p.pickup), find(p.dest)]);
  if (!pickup || !dest) {
    if (said && aiOn(env)) await setAwait(env, drv, said);   // his next message says it better
    await say(env, drv.chat_id, `⚠️ Nie znalazłem adresu: <b>${esc(!pickup ? p.pickup : p.dest)}</b>. ` +
      (said && aiOn(env) ? "Napisz go dokładniej – ulica z numerem i miejscowość." : "Dopisz miejscowość albo ulicę z numerem."));
    return;
  }
  const [trip, cust] = await Promise.all([route(env, pickup, dest).catch(() => null), lookupCustomer(env, p.phone).catch(() => null)]);
  const pr = price(pickup, dest, trip && trip.distanceM);
  const r = {
    id: randomId(12), token: randomId(24), status: "draft", mode: p.when ? "later" : "now", created: Date.now(), ip: "phone", eta_at: null, tg_msg: null,
    data: {
      source: "phone", origin: canonicalOrigin(request, env), typed: { pickup: p.pickup, dest: p.dest }, said: said ? String(said).slice(0, 600) : null,
      pickup, dest, when: p.when, pax: p.pax, phone: p.phone, name: p.name, notes: p.notes, lang: "pl",
      ...(p.luggage ? { luggage: p.luggage } : {}), ...(p.flight ? { flight: p.flight } : {}),
      distanceM: trip?.distanceM ?? null, durationS: trip?.durationS ?? null, polyline: trip?.polyline ?? null,
      price: pr?.amount ?? null, priceKind: pr?.kind ?? null,
      // the customer's account (same phone number): the ride shows up there too
      ...(cust && cust.uid ? { uid: cust.uid } : {}),
      ...(cust ? { cust: { ...cust, uid: undefined }, name: p.name || cust.name || cust.accountName || "" } : {}),
    },
  };
  assign(r, drv, await currentCar(env, drv.id).catch(() => null));
  await save(env, r);
  if (drv.owner) {
    const a = await availability(env, r).catch(() => null);
    const j = await say(env, drv.chat_id, driverText(r) + (a ? "\n\n" + availabilityText(a) + "\n\n<b>Kto jedzie?</b>" : ""),
      { reply_markup: { inline_keyboard: a ? await ownerPanel(env, r, a) : keyboard(r) } });
    r.tg_msg = j && j.ok ? j.result.message_id : null;
  } else r.tg_msg = await notifyDriver(env, r, drv.chat_id);
  await save(env, r);
}

// the driver/the owner replied to a "💬 Klient" message: the text goes to that ride's chat
async function chatReply(env, drv, m, text) {
  const rid = await rideByTg(env, m.chat.id, m.reply_to_message.message_id).catch(() => null);
  if (!rid) return false;
  const r = await load(env, rid);
  if (!r || !canAnswer(r, drv)) { await say(env, drv.chat_id, "Ten kurs ma już innego kierowcę – klient pisze teraz do niego.", { reply_to_message_id: m.message_id }); return true; }
  if (!chatOpen(r, env)) { await say(env, drv.chat_id, "Czat tego kursu jest już zamknięty.", { reply_to_message_id: m.message_id }); return true; }
  const c = cleanText(text);
  if (c.error) { await say(env, drv.chat_id, `Wiadomość może mieć najwyżej ${MAX_LEN} znaków.`, { reply_to_message_id: m.message_id }); return true; }
  await taxiSays(env, r, drv, c.text);
  // a quiet ✓ instead of another message
  const ok = await tg(env, "setMessageReaction", { chat_id: drv.chat_id, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "👍" }] });
  if (!ok || !ok.ok) await say(env, drv.chat_id, "✅ Klient dostał wiadomość.", { reply_to_message_id: m.message_id });
  return true;
}

// "🗂 Kursy w toku" – the board (server/board.js); "🔄 Odśwież" redraws the same message
async function openRidesList(env, drv, oldButton = false) {
  const b = await rideBoard(env);
  await say(env, drv.chat_id, b.text, { reply_markup: { inline_keyboard: b.rows } });
  if (oldButton) await say(env, drv.chat_id, "ℹ️ Ten przycisk nazywa się teraz <b>🗂 Kursy w toku</b>.", { reply_markup: menu(drv) });
}

/* ---------------- drivers: joining, car, the owner's list ---------------- */
const JOIN_HELP =
  `🚕 <b>Witaj w zespole ${BRAND.short}!</b>\n\n` +
  "<b>1. Zmiana = lokalizacja na żywo.</b> Tutaj w czacie: 📎 → Lokalizacja → <b>Udostępniaj lokalizację na żywo</b> (najlepiej „do wyłączenia”, albo 8 h). " +
  "Dopóki udostępniasz, dostajesz kursy z okolicy – najbliższy kierowca dostaje kurs pierwszy. Koniec zmiany = zatrzymaj udostępnianie.\n" +
  "<b>2. Ustawienia telefonu</b> (inaczej lokalizacja przestaje działać w tle):\n" +
  "   • iPhone: Ustawienia → Telegram → Lokalizacja → <b>Zawsze</b>\n" +
  "   • Android: Telegram → Uprawnienia → Lokalizacja → <b>Zezwalaj zawsze</b>, i wyłącz oszczędzanie baterii dla Telegrama\n" +
  "<b>3. Auto:</b> na początku zmiany wybierasz je jednym kliknięciem (zmiana: /auto, oddanie: /oddaj). Klient zobaczy auto i rejestrację.\n" +
  "   Numer, pod którym klient może do Ciebie zadzwonić: <code>/telefon 600100200</code> · zdjęcie dla klienta: /zdjecie\n\n" +
  "Inne: /kurs – kurs przyjęty przez telefon, /raport – Twoje kursy i rozliczenie, /ja – Twoje dane.";

async function driversPanel(env, owner) {
  const [all, busy, bot] = await Promise.all([listDrivers(env), busyDriverIds(env), botUsername(env)]);
  const team = all.filter((x) => !x.owner && !isDemo(x));
  const carOf = (x) => (x.current_car_id ? " · 🚗 " + esc([x.car_model, x.car_plate].filter(Boolean).join(" ")) : "");
  const ago = (x) => Math.max(0, Math.round((Date.now() - x.ts) / 60000));
  const groups = [
    ["🟢 <b>Wolni</b> (mogą wziąć kurs)", team.filter((x) => x.chat_id && !busy.has(x.id) && isLive(x) && x.current_car_id), (x) => `${carOf(x)} · lokalizacja ${ago(x)} min temu`],
    ["🟡 <b>Na zmianie, ale bez auta</b>", team.filter((x) => x.chat_id && !busy.has(x.id) && isLive(x) && !x.current_car_id), () => ""],
    ["🚕 <b>W kursie</b>", team.filter((x) => x.chat_id && busy.has(x.id)), carOf],
    ["⚪ <b>Poza zmianą</b>", team.filter((x) => x.chat_id && !busy.has(x.id) && !isLive(x)), (x) => (x.ts ? ` · ostatnio ${new Date(x.ts).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "")],
    ["⏳ <b>Nie dołączyli jeszcze</b> (wyślij im link)", team.filter((x) => !x.chat_id), (x) => (x.code && bot ? `\n      https://t.me/${bot}?start=d_${x.code}` : "")],
  ];
  const L = [`👥 <b>Kierowcy</b> (${team.length})`];
  for (const [title, list, extra] of groups) {
    if (!list.length) continue;
    L.push("", title);
    for (const x of list) L.push(`• ${esc(x.name || "?")}${extra(x)}`);
  }
  if (!team.length) L.push("", "Nie masz jeszcze kierowców. Dodaj: <code>/dodaj Imię 600100200</code> albo wpisz ich w pliku src/fleet.py.");
  L.push("", "➕ Dodaj: <code>/dodaj Imię 600100200</code> · 🗑 usuń: przycisk poniżej");
  const rows = team.map((x) => [btn(`🗑 Usuń: ${x.name}`, `drm|${x.id}`)]);
  return { text: L.join("\n"), rows };
}

async function driversList(env, owner) {
  const [all, busy, bot] = await Promise.all([listDrivers(env), busyDriverIds(env), botUsername(env)]);
  const L = ["👥 <b>Kierowcy</b>"];
  all.forEach((x, i) => {
    const car = x.current_car_id ? "🚗 " + [`${x.car_make || ""} ${x.car_model || ""}`.trim(), x.car_plate].filter(Boolean).join(" · ") : "";
    let st;
    if (isDemo(x)) st = "dane przykładowe (bez Telegrama)";
    else if (!x.chat_id) st = `⏳ nie dołączył – link: ${x.code && bot ? `https://t.me/${bot}?start=d_${x.code}` : "/link " + (i + 1)}`;
    else if (busy.has(x.id)) st = "🚕 w kursie";
    else if (isLive(x)) st = `🟢 na zmianie (lokalizacja ${Math.max(0, Math.round((Date.now() - x.ts) / 60000))} min temu)`;
    else st = x.ts ? `⚪ poza zmianą (ostatnio ${new Date(x.ts).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : "⚪ poza zmianą";
    const lst = x.listing != null && CONFIG.places?.[x.listing] ? `\n    ⭐ opinie → ${esc(CONFIG.places[x.listing].name)}` : "";
    L.push(`${i + 1}. <b>${esc(x.name || "?")}</b>${x.id === owner.id ? " (Ty)" : ""}${isDemo(x) ? " 🧪 DEMO" : ""} – ${st}${car ? "\n    " + esc(car) : ""}${lst}`);
  });
  L.push("", "Dodaj: <code>/dodaj Imię 600100200</code> · usuń: <code>/usun 3</code> · nowy link: <code>/link 3</code>",
         "Opinie po kursie: <code>/wizytowka 2 3</code> (kierowca 2 → wizytówka 3; bez ustawienia – wszystkie po kolei)");
  return L.join("\n");
}

async function command(env, request, drv, text) {
  const chat = drv.chat_id, t = text.trim();
  const arg = t.replace(/^\/\w+(@\w+)?\s*/, "");
  const cmd = (t.match(/^\/(\w+)/) || [])[1]?.toLowerCase();
  if (cmd === "raport") return sendReport(env, drv, t);
  if (await fleetCommand(env, drv, cmd, arg)) return;
  if (cmd === "kurs") return arg ? smartRide(env, request, drv, arg) : askForRide(env, drv);
  if (cmd === "telefon") {
    const n = arg.replace(/[^\d+ ]/g, "").trim();
    if (n.replace(/\D/g, "").length < 9) return say(env, chat, "Napisz: <code>/telefon 600100200</code>");
    await updateDriver(env, drv.id, { phone: n });
    return say(env, chat, `✅ Klient może dzwonić do Ciebie pod: <b>${esc(n)}</b>`);
  }
  if (cmd === "ja" || cmd === "info" || cmd === "profil") {
    // the driver's own data: what customers see, shift status, today's work
    const [busy, myCar] = await Promise.all([busyDriverIds(env), currentCar(env, drv.id).catch(() => null)]);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
    const rep = await buildReport(env, today, today, drv.owner ? null : drv.id).catch(() => null);
    const doneToday = rep ? rep.rows.filter((x) => x.status === "done" && (drv.owner ? (x.driver_id || "owner") === "owner" : true)).length : 0;
    const shift = busy.has(drv.id) ? "🚕 w kursie" : isLive(drv) ? `🟢 na zmianie (lokalizacja ${Math.max(0, Math.round((Date.now() - drv.ts) / 60000))} min temu${drv.until && drv.until - Date.now() < 30 * 864e5 ? ", do " + new Date(drv.until).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }) : ""})` : "⚪ poza zmianą – udostępnij lokalizację na żywo, żeby dostawać kursy";
    return say(env, chat, [
      `👤 <b>${esc(drv.name || "—")}</b>${drv.owner ? " (właściciel)" : ""}`,
      `🚗 Auto: ${myCar ? `<b>${esc(carLong(myCar))}</b>` : "<i>nie wybrane</i> – /auto"}`,
      `📸 Zdjęcie dla klienta: ${drv.photo_key && drv.photo_ok ? "✅ ustawione" : "<i>brak</i> – /zdjecie"}`,
      `💰 Rozliczenie: ${modelLabel(modelOf(drv, CONFIG.commission || {}))}`,
      `☎️ Telefon dla klientów: ${drv.phone ? esc(drv.phone) : "<i>nie ustawiony</i> – /telefon (klient dzwoni wtedy na numer firmy)"}`,
      `📡 ${shift}`,
      `🏁 Dziś zakończone kursy: ${doneToday}`,
      `⭐ Opinie Twoich klientów idą do: ${drv.listing != null && CONFIG.places?.[drv.listing] ? esc(CONFIG.places[drv.listing].name) : "wszystkich wizytówek po kolei"}`,
      "",
      "Zmień: /auto (wybór auta) · /oddaj · /zdjecie · /telefon 600100200 · /imie Imię",
    ].join("\n"));
  }
  if (cmd === "pomoc" || cmd === "help" || cmd === "menu") return say(env, chat, helpText(drv, env), { reply_markup: menu(drv) });
  if (cmd === "zmiana") {
    const car = await currentCar(env, drv.id).catch(() => null), live = isLive(drv);
    // step 1: a car (the owner may drive without picking one)
    if (!car && !drv.owner) return sendCarPicker(env, drv, live
      ? "🟢 <b>Masz lokalizację na żywo</b> – brakuje tylko auta. Którym dziś jeździsz?"
      : "🟢 <b>Zaczynamy zmianę!</b>\n<b>Krok 1/2:</b> wybierz auto (potem poproszę o lokalizację).");
    // step 2: live location
    if (!live) return say(env, chat, (car ? `🚗 Auto: <b>${esc(carLong(car))}</b>\n\n` : "") + "<b>Krok 2/2:</b> " + SHIFT_HOW.replace(/^⚪ .*?\n\n/s, ""),
      car ? { reply_markup: { inline_keyboard: [[btn("🔁 Zmień auto", "carlist|-"), btn("🔴 Zakończ zmianę", "shift|end")]] } } : { reply_markup: menu(drv) });
    const ago = Math.max(0, Math.round((Date.now() - drv.ts) / 60000));
    return say(env, chat, `🟢 <b>Jesteś na zmianie</b> – lokalizacja ${ago} min temu.\n🚗 Auto: ${car ? "<b>" + esc(carLong(car)) + "</b>" : "<i>bez auta</i>"}\n${await todayLine(env, drv)}`,
      { reply_markup: { inline_keyboard: [car ? [btn("🔁 Zmień auto", "carlist|-"), btn("🔴 Zakończ zmianę", "shift|end")] : [btn("🚗 Wybierz auto", "carlist|-")]] } });
  }
  if (cmd === "imie" || cmd === "imię") {
    if (!arg) return say(env, chat, "Napisz: <code>/imie Marek</code>");
    await updateDriver(env, drv.id, { name: arg.slice(0, 30) });
    return say(env, chat, `✅ Klient zobaczy imię: <b>${esc(arg.slice(0, 30))}</b>`);
  }
  // the owner only
  if (["kierowcy", "kursy", "dodaj", "usun", "usuń", "link", "wizytowka", "wizytówka"].includes(cmd) && !drv.owner) return say(env, chat, `Tę komendę może użyć tylko ${OWNER.nom}.`);
  if (cmd === "wizytowka" || cmd === "wizytówka") {
    // "/wizytowka 2 3" = driver no. 2 (from /kierowcy) -> listing no. 3; "/wizytowka 2 0" = in turn
    const places = CONFIG.places || [], all = await listDrivers(env);
    const [n, k] = arg.split(/\s+/).map((x) => parseInt(x, 10));
    const x = all[n - 1];
    const listTxt = places.map((p, i) => `${i + 1}. ${esc(p.name)}`).join("\n");
    if (!x || !(k >= 0 && k <= places.length)) return say(env, chat, `Napisz: <code>/wizytowka NR_KIEROWCY NR_WIZYTÓWKI</code> (0 = po kolei wszystkie)\n\nWizytówki Google:\n${listTxt}\n\nNumery kierowców: /kierowcy`);
    await updateDriver(env, x.id, { listing: k ? k - 1 : null });
    return say(env, chat, `✅ Klienci kierowcy <b>${esc(x.name)}</b> będą proszeni o opinię dla: <b>${k ? esc(places[k - 1].name) : "wszystkich wizytówek po kolei"}</b>`);
  }
  if (cmd === "kierowcy") { const p = await driversPanel(env, drv); return say(env, chat, p.text, { reply_markup: { inline_keyboard: p.rows } }); }
  if (cmd === "kursy") return openRidesList(env, drv);
  if (cmd === "dodaj") {
    const phone = (arg.match(/\+?\d[\d \-]{7,}\d/) || [""])[0].trim();
    const name = arg.replace(phone, "").trim().slice(0, 30);
    if (!name) return say(env, chat, "Napisz: <code>/dodaj Marek 600100200</code>");
    const { code } = await addDriver(env, name, phone);
    const bot = await botUsername(env);
    const link = bot ? `https://t.me/${bot}?start=d_${code}` : `(kod: d_${code})`;
    await say(env, chat, `✅ Dodano: <b>${esc(name)}</b>.\nWyślij mu ten link – po kliknięciu dołączy do bota:\n${link}\n\n(link działa jeden raz)`);
    return say(env, chat, `Cześć ${esc(name)}! Kliknij, żeby dołączyć do kierowców ${BRAND.short}:\n${link}`);   // ready to forward
  }
  if (cmd === "usun" || cmd === "usuń" || cmd === "link") {
    const all = await listDrivers(env), x = all[parseInt(arg, 10) - 1];
    if (!x || x.owner) return say(env, chat, `Podaj numer z listy /kierowcy, np. <code>/${cmd} 2</code>`);
    if (cmd === "link") {
      const code = await newInviteCode(env, x.id), bot = await botUsername(env);
      return say(env, chat, `🔗 Nowy link dla ${esc(x.name)}: ${bot ? `https://t.me/${bot}?start=d_${code}` : "d_" + code}`);
    }
    await deactivateDriver(env, x.id);
    if (x.chat_id) await say(env, x.chat_id, `Twoje konto kierowcy w bocie ${BRAND.short} zostało wyłączone.`);
    return say(env, chat, `🗑 Usunięto kierowcę: ${esc(x.name)}`);
  }
  return say(env, chat, "🤔 Nie znam tej komendy. Użyj przycisków na dole albo zobacz /pomoc.", { reply_markup: menu(drv) });
}

// Telegram resends an update when we answer with an error or too slowly. So: every update is handled once
// (update_id remembered in D1), and errors are logged but answered with 200 (no endless re-delivery).
export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("forbidden", { status: 403 });
  }
  const u = await request.json().catch(() => null);
  if (!u) return json({ ok: true });
  if (u.update_id != null && !(await firstDelivery(env, u.update_id))) return json({ ok: true, duplicate: true });
  try { await handle(request, env, u); }
  catch (e) { console.log(JSON.stringify({ at: "telegram", update: u.update_id, error: String(e && e.stack || e) })); }
  return json({ ok: true });
}

async function firstDelivery(env, updateId) {
  try {
    const res = await (await db(env)).prepare("INSERT OR IGNORE INTO tg_updates (update_id, ts) VALUES (?, ?)").bind(updateId, Date.now()).run();
    return !!(res && res.meta && res.meta.changes);
  } catch (e) { console.log("tg_updates", e.message); return true; }   // can't tell: better handle it than drop it
}

async function handle(request, env, u) {
  await ensureFleetSynced(env).catch((e) => console.log("fleet sync", e.message));
  const msg = u.message || u.edited_message;
  const drv = msg ? await driverByChat(env, msg.chat?.id).catch(() => null) : null;

  // live location: every driver separately (first message + edits while it moves)
  if (msg && msg.location && drv) { await onLocation(env, drv, msg, !!u.edited_message); return json({ ok: true }); }

  if (u.message && u.message.photo && drv && (await onPhotoMessage(env, drv, u.message))) return json({ ok: true });

  const text = u.message && u.message.text;
  if (text && text.startsWith("/start")) {
    const chatId = u.message.chat.id, payload = text.split(/\s+/)[1] || "";
    if (!drv && /^d_[a-z0-9]{10}$/.test(payload)) {   // a driver's invite link
      const joined = await bindDriver(env, payload.slice(2), chatId);
      if (!joined) { await say(env, chatId, `Ten link jest już nieważny. Poproś ${OWNER.gen} o nowy (/link).`); return json({ ok: true }); }
      await say(env, chatId, JOIN_HELP, { reply_markup: menu(joined) });
      const owner = await ensureOwner(env);
      if (owner.chat_id) await say(env, owner.chat_id, `✅ Kierowca <b>${esc(joined.name)}</b> dołączył do bota.`);
      return json({ ok: true });
    }
    if (!drv) { await say(env, chatId, `Ten bot jest dla kierowców ${BRAND.short}. Poproś ${OWNER.gen} o link zaproszenia.\n(chat ID: ${chatId})`); return json({ ok: true }); }
    await say(env, chatId, `${hello(drv)}\n${await statusLine(env, drv)}\n${await todayLine(env, drv)}\n\n` +
      (drv.owner ? "Kursy ze strony przychodzą tutaj. Kierowcy, auta i raporty – przyciski na dole." : "Kursy przychodzą tutaj. Wszystko masz pod przyciskami na dole.") +
      "\n❓ <b>Pomoc</b> pokaże, jak wszystko działa.", { reply_markup: menu(drv) });
    return json({ ok: true });
  }
  if (text && drv) {
    // a reply to "Ile zapłacił klient?" with the amount
    if (u.message.reply_to_message) {
      const t = await tripByPayMsg(env, u.message.reply_to_message.message_id).catch(() => null);
      const p = t && parsePaid(text);
      if (p && (drv.owner || (t.driver_id || "owner") === drv.id)) {
        await setPaid(env, t.id, p.amount, p.method);
        await say(env, drv.chat_id, `💰 Zapisano: ${String(p.amount).replace(".", ",")} zł${p.method ? " · " + p.method : ""}`, { reply_to_message_id: u.message.message_id });
        return json({ ok: true });
      }
      // a reply to a customer's chat message -> to the customer's status page
      if (await chatReply(env, drv, u.message, text)) return json({ ok: true });
    }
    const mapped = MENU_CMD[text.trim()];
    if ((mapped || text.startsWith("/")) && drv.await_ride && !/^\/kurs\b/.test(mapped || "")) await setAwait(env, drv, null);   // a button = he moved on
    if (text.trim() === OLD_BOARD_BTN && drv.owner) { await openRidesList(env, drv, true); return json({ ok: true }); }
    if (mapped) { await command(env, request, drv, mapped); return json({ ok: true }); }
    if (text.startsWith("/")) { await command(env, request, drv, text); return json({ ok: true }); }
    if (await rideText(env, request, drv, text, u.message.reply_to_message?.message_id)) return json({ ok: true });
    await say(env, drv.chat_id, "🤔 Nie rozumiem tej wiadomości. Użyj przycisków na dole albo napisz /pomoc.\n" +
      (aiOn(env) ? "<i>Nowy kurs: dotknij „➕ Nowy kurs” i napisz go własnymi słowami.</i>"
                 : `<i>Kurs z telefonu to jedna linijka, np.</i> <code>${EX.addr} &gt; ${EX.airport}, 600100200</code>`), { reply_markup: menu(drv) });
    return json({ ok: true });
  }
  if (u.message && (u.message.voice || u.message.audio) && drv) { await onVoice(env, request, drv, u.message); return json({ ok: true }); }

  const q = u.callback_query;
  if (!q) return json({ ok: true });
  const answer = (t, alert = false) => tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: t, show_alert: alert });
  const me = await driverByChat(env, q.message?.chat?.id).catch(() => null);
  if (!me) { await answer("Brak uprawnień"); return json({ ok: true }); }
  const clearButtons = () => q.message?.message_id && tg(env, "editMessageReplyMarkup", { chat_id: me.chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });

  if (await fleetCallback(env, q, me, answer)) return json({ ok: true });   // cars, photos, settlements
  if (String(q.data || "").startsWith("cm|")) {   // quick reply under a customer's chat message
    const [, rid, n] = String(q.data).split("|");
    const r = await load(env, rid), line = QUICK_TAXI[parseInt(n, 10)];
    if (!r || !line) { await answer("Ten przycisk jest już nieaktualny", true); return json({ ok: true }); }
    if (!canAnswer(r, me)) { await answer("To nie Twój kurs", true); return json({ ok: true }); }
    if (!chatOpen(r, env)) { await answer("Czat tego kursu jest już zamknięty", true); return json({ ok: true }); }
    await taxiSays(env, r, me, line);
    await answer(`Wysłano do klienta: ${line}`);
    return json({ ok: true });
  }
  if (q.data === "brd|-") {   // "🔄 Odśwież" on the board
    if (!me.owner) { await answer(`Tylko ${OWNER.nom}`, true); return json({ ok: true }); }
    const b = await rideBoard(env);
    await tg(env, "editMessageText", { chat_id: me.chat_id, message_id: q.message.message_id, text: b.text, parse_mode: "HTML",
      disable_web_page_preview: true, reply_markup: { inline_keyboard: b.rows } });
    await answer("Odświeżone");
    return json({ ok: true });
  }
  if (q.data === "aw|x") {   // "✖️ Anuluj" while the bot waits for the rest of a ride
    await setAwait(env, me, null);
    await answer("Anulowano");
    await tg(env, "editMessageText", { chat_id: me.chat_id, message_id: q.message.message_id, text: "✖️ Anulowano – nic nie zapisałem.", reply_markup: { inline_keyboard: [] } });
    return json({ ok: true });
  }
  if (String(q.data || "").startsWith("rep|")) {   // report for another period, one tap
    const per = REPORT_PERIOD[String(q.data).slice(4)] || "dziś";
    await answer("Raport: " + per);
    await sendReport(env, me, "/raport " + per);
    return json({ ok: true });
  }

  let [act, id, arg] = String(q.data || "").split("|");
  if (act === "drm" || act === "drmy") {   // the owner removes a driver (asks once)
    if (!me.owner) { await answer(`Tylko ${OWNER.nom}`, true); return json({ ok: true }); }
    const x = (await listDrivers(env)).find((y) => y.id === id && !y.owner);
    if (!x) { await answer("Tego kierowcy już nie ma na liście", true); return json({ ok: true }); }
    if (act === "drm") {
      await answer();
      await say(env, me.chat_id, `🗑 Usunąć kierowcę <b>${esc(x.name)}</b>?\nNie dostanie już kursów; jego dotychczasowe kursy zostają w raportach.`,
        { reply_markup: { inline_keyboard: [[btn("Tak, usuń", `drmy|${x.id}`), btn("Nie", "k|-")]] } });
      return json({ ok: true });
    }
    if ((await busyDriverIds(env)).has(x.id)) { await answer("Ten kierowca jest teraz w kursie – usuń go po kursie.", true); return json({ ok: true }); }
    await release(env, x.id, "admin").catch(() => {});
    await deactivateDriver(env, x.id);
    if (x.chat_id) await say(env, x.chat_id, `Twoje konto kierowcy w bocie ${BRAND.short} zostało wyłączone. W razie pytań – zadzwoń do ${OWNER.gen}.`);
    await answer(`Usunięto: ${x.name}`);
    await clearButtons();
    const p = await driversPanel(env, me);
    await say(env, me.chat_id, `✅ Usunięto: <b>${esc(x.name)}</b>\n\n` + p.text, { reply_markup: { inline_keyboard: p.rows } });
    return json({ ok: true });
  }
  if (act === "k" && id === "-") { await answer("OK"); await clearButtons(); return json({ ok: true }); }
  let r = await load(env, id);
  if (!r) { await answer("Nie znaleziono kursu", true); return json({ ok: true }); }

  // ---- the owner's dispatch panel: take it himself, send to the free drivers, or give it to one driver ----
  let ownerTake = false;
  if (["dpo", "dps", "dpa", "dpl"].includes(act)) {
    if (!me.owner) { await answer(`Kursy przydziela ${OWNER.nom}`, true); return json({ ok: true }); }
    if (act === "dpl") {   // from "🗂 Kursy w toku": a fresh panel for this ride
      if (r.status !== "pending" || r.data.driverId) { await answer("Ten kurs ma już kierowcę albo się zakończył", true); return json({ ok: true }); }
      const a = await availability(env, r);
      const j = await say(env, me.chat_id, ownerInfoText(r) + "\n\n" + availabilityText(a), { reply_markup: { inline_keyboard: await ownerPanel(env, r, a) } });
      if (j && j.ok) r = (await transition(env, r.id, ["pending"], (x) => { x.data.ownerInfo = j.result.message_id; })) || r;
      await answer(); return json({ ok: true });
    }
    if (!["draft", "pending"].includes(r.status) || (r.status === "pending" && r.data.driverId)) {
      await answer("Ten kurs ma już kierowcę albo się zakończył", true); await syncDriverMessage(env, r); return json({ ok: true });
    }
    const draft = r.status === "draft";
    if (act === "dpo") {   // the owner drives himself
      if (draft) act = "ok";
      else if (r.mode === "later") act = "s";
      else { act = "e"; ownerTake = true; }
    } else if (r.mode === "later") {   // a reservation: give it to the chosen driver
      if (act === "dps") { await answer("Rezerwację przydziel konkretnemu kierowcy", true); return json({ ok: true }); }
      if (draft) await recordOrder(env, r).catch(() => {});
      act = "g";
    } else {   // a ride now: offer it to the free drivers / to the chosen one
      const prev = r.updated, d0 = r.data;
      if (draft) {
        await recordOrder(env, r).catch(() => {});
        const preview = r.tg_msg; unassign(r); r.status = "pending"; d0.ownerInfo = preview; r.tg_msg = null; d0.offers = {}; d0.pendingSince = Date.now();
      }
      let n = 0, to = "";
      if (act === "dps") { n = await offerToFree(env, r); to = "najbliższego wolnego kierowcy"; }
      else {
        const x = (await listDrivers(env)).find((y) => y.id === arg);
        if (x && x.chat_id && !isDemo(x)) { n = await offerToDriver(env, r, x); to = x.name; }
      }
      if (!n) { await answer(act === "dps" ? "Nikt nie jest teraz wolny – jedź sam albo spróbuj za chwilę." : "Ten kierowca jest teraz niedostępny.", true); return json({ ok: true }); }
      if (!(await saveIfUnchanged(env, r, prev))) {   // someone changed the ride meanwhile: keep the offers that went out
        const sent = r.data;
        r = (await transition(env, r.id, ["pending", "draft"], (x) => { x.data.offers = { ...(sent.offers || {}), ...(x.data.offers || {}) }; x.data.stage = sent.stage; x.data.stageAt = sent.stageAt; })) || (await load(env, id)) || r;
      }
      await answer(`📨 Wysłano do: ${to}`);
      await syncDriverMessage(env, r);
      return json({ ok: true });
    }
  }

  if (act === "pay") {
    if (!mine(r, me)) { await answer("To nie Twój kurs", true); return json({ ok: true }); }
    if (arg === "o") { await answer("Odpisz na tę wiadomość kwotą, np. 85 albo 85 karta", true); return json({ ok: true }); }
    const method = METHODS[arg];
    if (!method || !r.data.price) { await answer("Ten przycisk jest już nieaktualny", true); return json({ ok: true }); }
    await setPaid(env, r.id, r.data.price, method);
    await answer(`Zapisano: ${r.data.price} zł · ${method}`);
    await tg(env, "editMessageText", { chat_id: me.chat_id, message_id: q.message.message_id, parse_mode: "HTML",
      text: `💰 Zapłacono: <b>${r.data.price} zł</b> · ${method}`, reply_markup: { inline_keyboard: [[btn("✏️ Popraw kwotę", `pay|${r.id}|o`)]] } });
    return json({ ok: true });
  }

  let st = r.status, act2 = act;
  if (act === "g" && st === "draft") st = "pending";   // the owner gives his phone reservation to a driver
  const prevUpdated = r.updated;
  const min = parseInt(arg, 10) || 0, d = r.data;
  let toast = null, follow = null;
  const offered = d.offers && d.offers[me.id];
  const legacy = !d.driverId && !d.offers;   // rides from before drivers existed: the owner's

  // preview of a phone ride: save it (a "now" ride goes straight to "I'm on my way"), or delete it
  if ((act === "del" || act === "ok") && st === "draft" && !mine(r, me)) { await answer("To nie Twój kurs", true); return json({ ok: true }); }
  if (act === "del" && st === "draft") {
    await (await db(env)).prepare("DELETE FROM rides WHERE id = ? AND status = 'draft'").bind(r.id).run();
    await answer("Usunięto");
    await tg(env, "deleteMessage", { chat_id: me.chat_id, message_id: q.message.message_id });
    return json({ ok: true });
  }
  if (act === "ok" && st === "draft") {
    await recordOrder(env, r).catch(() => {});
    if (r.mode === "later") {
      r.status = "scheduled";
      if (!(await saveIfUnchanged(env, r, r.updated))) { await answer("Kurs zmienił się w międzyczasie", true); return json({ ok: true }); }
      await Promise.all([answer("Zapisano rezerwację"), syncDriverMessage(env, r)]); return json({ ok: true });
    }
    st = "pending"; act2 = "e";
  }

  // a "now" ride offered to several drivers: "no" from one of them -> next step of the dispatch
  if (act === "x" && st === "pending" && r.mode === "now" && offered && !d.driverId) {
    for (let k = 0; k < 3; k++) {
      r.data.offers[me.id].rejected = true;
      if (await saveIfUnchanged(env, r, r.updated)) break;
      r = await load(env, id); if (!r || r.status !== "pending") break;
    }
    await answer("Odrzucone – kurs idzie do innych kierowców");
    r = (await escalate(env, r)) || r;
    await syncDriverMessage(env, r);
    return json({ ok: true });
  }

  if (act2 === "e" && (st === "pending" || st === "scheduled")) {
    // pending: any driver it was offered to; scheduled: the driver it was given to
    const allowed = st === "pending" ? (offered || legacy && me.owner || ownerTake || (act === "ok" && mine(r, me))) : mine(r, me);
    if (ownerTake && d.ownerInfo && !(d.offers && d.offers[me.id])) { r.tg_msg = d.ownerInfo; d.ownerInfo = null; }
    if (!allowed) { await answer("Ten kurs nie jest dla Ciebie", true); return json({ ok: true }); }
    // the car the customer will see: the one he holds now (the owner may drive without checking one in)
    const myCar = await currentCar(env, me.id).catch(() => null);
    if (!myCar && !me.owner) {
      await answer("Najpierw wybierz auto (jedno kliknięcie poniżej), potem przyjmij kurs.", true);
      await sendCarPicker(env, me, "🚗 <b>Wybierz auto</b>, żeby przyjąć kurs:");
      return json({ ok: true });
    }
    // arrival time: Google route with traffic from this driver's live position, else from the base
    const live = isLive(me);
    let secs = null;
    if (hasXY(d.pickup)) {
      const x = await route(env, live ? { lat: me.lat, lng: me.lng } : CONFIG.base, d.pickup, true).catch(() => null);
      if (x) {
        // the straight-line fallback already includes 2 min; Google times get the 2 min to set off here
        secs = x.durationS + (x.approx ? 0 : SET_OFF_MS / 1000);
        d.acceptKm = Math.round(x.distanceM / 100) / 10;   // km driven to the customer (for reports)
        if (live && !x.approx) {
          d.liveAt = Date.now(); d.liveFrom = d.acceptFrom = `${me.lat},${me.lng}`;
          d.liveKm = Math.round(x.distanceM / 100) / 10; d.liveEtaAt = Date.now() + secs * 1000; d.etaSource = "google";
        }
      }
      if (live) d.carStartKm = Math.round(Math.max(kmBetween(me, d.pickup), 0.3) * 10) / 10;
    }
    if (secs == null) secs = min ? min * 60 : (d.approachS || 13 * 60) + SET_OFF_MS / 1000;
    const prev = r.updated;
    if (st === "pending") assign(r, me, myCar);
    else setVehicle(r, me, myCar || null);   // reservation: the car he really drives today
    r.status = "enroute"; r.eta_at = Date.now() + secs * 1000; d.enrouteAt = Date.now();
    // two drivers tapping at the same moment: only the first one gets the ride
    if (!(await saveIfUnchanged(env, r, prev))) {
      const cur = await load(env, id);
      await answer(cur && cur.data.driverId && cur.data.driverId !== me.id ? `Kurs przyjął już ${cur.data.driver?.name || "inny kierowca"}` : "Kurs zmienił się w międzyczasie – spróbuj jeszcze raz", true);
      if (cur && cur.data.driverId !== me.id) await clearButtons();
      return json({ ok: true });
    }
    const m = Math.max(1, Math.ceil(secs / 60));
    await Promise.all([answer(`Przyjęte. Klient widzi: będziesz ok. ${clockWarsaw(r.eta_at)} (~${m} min)`), syncDriverMessage(env, r), closeOtherOffers(env, r)]);
    await ask(env, r, `🚕 Jedziesz do: <b>${esc(d.pickup.address)}</b>`, [[{ text: "🧭 Nawiguj do klienta (Google Maps)", url: navUrl(d.pickup) }]]);
    if (!live && (!me.hint_ts || Date.now() - me.hint_ts > 12 * 3600e3)) {
      await markHint(env, me.id);
      await say(env, me.chat_id, "📡 Udostępnij mi lokalizację na żywo: 📎 → Lokalizacja → „Udostępniaj lokalizację na żywo”.\nKlient zobaczy, jak się zbliżasz, a gdy dojedziesz, sam zapytam, czy jesteś na miejscu.");
    }
    return json({ ok: true });
  }

  // reservations: the owner confirms for himself or gives the ride to a driver
  if ((act === "s" || act === "g") && st === "pending" && r.mode === "later") {
    if (!me.owner) { await answer(`Rezerwacje przydziela ${OWNER.nom}`, true); return json({ ok: true }); }
    const all = await listDrivers(env);
    const to = act === "s" ? all.find((x) => x.owner) : all.find((x) => x.id === arg);
    if (!to || !to.chat_id) { await answer("Ten kierowca nie jest już dostępny", true); return json({ ok: true }); }
    const ownerMsg = d.offers?.owner?.msg || r.tg_msg, prev = r.updated;
    assign(r, to, await currentCar(env, to.id).catch(() => null)); r.status = "scheduled";
    if (to.owner) r.tg_msg = ownerMsg;
    else { d.ownerInfo = ownerMsg; d.offers = {}; r.tg_msg = null; }
    // claim first, message after: a customer cancel at the same moment wins cleanly
    if (!(await saveIfUnchanged(env, r, prev))) { await answer("Kurs zmienił się w międzyczasie", true); await syncDriverMessage(env, (await load(env, id)) || r); return json({ ok: true }); }
    if (!to.owner) {
      const mid = await notifyDriver(env, r, to.chat_id);
      r = (await transition(env, r.id, ["scheduled"], (x) => { x.tg_msg = mid; })) || r;
    }
    await Promise.all([answer(to.owner ? "Rezerwacja potwierdzona" : `Przydzielono: ${to.name}`), syncDriverMessage(env, r)]);
    if (!to.owner) await say(env, to.chat_id, `📅 ${OWNER.nom} przydzielił Ci rezerwację na <b>${esc(String(d.when || "").replace("T", " "))}</b>. W dniu kursu kliknij „🚕 Wyjeżdżam do klienta”.`, { reply_to_message_id: r.tg_msg || undefined });
    return json({ ok: true });
  }

  // everything else: only the driver who has the ride (the owner may step in)
  if (!(mine(r, me) || (legacy && me.owner))) { await answer("To nie Twój kurs", true); return json({ ok: true }); }

  if (act === "x" && st === "enroute" && r.mode === "now") {
    // the driver can't make it after all: give the ride to the others instead of letting the customer down
    const prev = r.updated, old = { chat: me.chat_id, name: me.name, msg: r.tg_msg, rejected: true };
    unassign(r);
    r.status = "pending"; d.offers = { [me.id]: old }; d.stage = "nearest"; d.stageAt = 0; d.pendingSince = Date.now();
    if (!(await saveIfUnchanged(env, r, prev))) { await answer("Kurs zmienił się w międzyczasie", true); return json({ ok: true }); }
    await answer("Oddany – szukam innego kierowcy");
    r = (await escalate(env, r)) || r;
    await syncDriverMessage(env, r);
    return json({ ok: true });
  }
  if (act === "x" && st === "scheduled" && !me.owner) {
    // a driver gives a reservation back to the owner
    const prev = r.updated;
    unassign(r); r.status = "pending"; d.offers = {}; d.assignable = (await listDrivers(env)).filter((x) => !x.owner && x.chat_id && !isDemo(x) && x.id !== me.id).map((x) => ({ id: x.id, name: x.name }));
    if (!(await saveIfUnchanged(env, r, prev))) { await answer("Kurs zmienił się w międzyczasie", true); return json({ ok: true }); }
    const owner = await ensureOwner(env);
    const mid = await notifyDriver(env, r, owner.chat_id);
    r = (await transition(env, r.id, ["pending"], (x) => { x.data.offers = { owner: { chat: owner.chat_id, msg: mid, name: owner.name } }; })) || r;
    await answer(`Oddano ${OWNER.dat}`);
    await clearButtons();
    await say(env, owner.chat_id, `↩️ ${esc(me.name)} oddał rezerwację – przydziel ją ponownie.`, { reply_to_message_id: mid || undefined });
    return json({ ok: true });
  }

  if (act === "s" && st === "pending" && r.mode === "later") {
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
    r.status = "done"; toast = "Kurs zakończony 👍"; follow = "pay";
    if (d.listing == null) d.listing = await nextListing(env).catch(() => null);   // review link: the listings take turns
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
    await clearButtons();
    return json({ ok: true });
  } else {
    const why = { cancelled: "Klient już anulował ten kurs", expired: "Zgłoszenie wygasło – klient mógł zadzwonić" }[st];
    await answer(why || "Ten przycisk jest już nieaktualny", true);
    await syncDriverMessage(env, r);
    return json({ ok: true });
  }
  // conditional write: if the customer cancelled (or anything else changed) since this tap was read, the tap loses
  if (!(await saveIfUnchanged(env, r, prevUpdated))) {
    await answer("Kurs zmienił się w międzyczasie – sprawdź status", true);
    const fresh = await load(env, id);
    if (fresh) await syncDriverMessage(env, fresh);
    return json({ ok: true });
  }
  if (r.status === "done") await recordDone(env, r).catch(() => {});
  const jobs = [answer(toast), syncDriverMessage(env, r)];
  // a button tapped on a follow-up message: remove its buttons so it can't be tapped twice
  if (q.message?.message_id && q.message.message_id !== r.tg_msg) jobs.push(clearButtons());
  await Promise.all(jobs);

  if (follow === "start") {
    await ask(env, r, `👋 Klient wie, że czekasz pod adresem <b>${esc(d.pickup.address)}</b>.\nGdy wsiądzie, rozpocznij kurs:`,
              [[btn("▶️ Klient wsiadł – rozpocznij kurs", `t|${r.id}`)], [btn("❌ Klient nie przyszedł", `n|${r.id}`)]]);
  } else if (follow === "navdest") {
    await ask(env, r, `🛣 Kurs rozpoczęty. Cel: <b>${esc(d.dest.address)}</b>`, [[{ text: "🧭 Nawiguj do celu (Google Maps)", url: navUrl(d.dest) }]]);
  }
  if (follow === "pay") await askPayment(env, r);
  return json({ ok: true });
}
