// POST /api/telegram – webhook of the bot used by Adam and his drivers (each in his own private chat):
// button taps, commands, and every driver's live location.
import { json, clockWarsaw, kmBetween, hasXY, esc, randomId, canonicalOrigin } from "../../server/util.js";
import { route, findPlace } from "../../server/google.js";
import { price } from "../../server/pricing.js";
import { parseRide, HELP, PARSE_ERRORS } from "../../server/phone.js";
import { lookupCustomer, recordOrder, recordDone } from "../../server/customers.js";
import { METHODS, setPayMsg, setPaid, tripByPayMsg, parsePaid, parsePeriod, buildReport, REPORT_HELP } from "../../server/report.js";
import { CONFIG } from "../../server/config.js";
import { db, notifyDriver, tgFile, load, save, saveIfUnchanged, tg, syncDriverMessage, closeOtherOffers, activeRides, navUrl, isLive,
         refreshEta, driverText, keyboard, SET_OFF_MS } from "../../server/rides.js";
import { driverByChat, listDrivers, saveDriverPos, markHint, addDriver, bindDriver, updateDriver, deactivateDriver, newInviteCode,
         busyDriverIds, botUsername, escalate, ensureOwner } from "../../server/fleet.js";

const btn = (text, data) => ({ text, callback_data: data });
const ARRIVE_KM = 0.15, FINISH_KM = 0.3;
const say = (env, chat, text, extra = {}) => tg(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

// a new message (with sound) in the chat of the driver who has the ride
async function ask(env, r, text, buttons) {
  const j = await tg(env, "sendMessage", { chat_id: r.data.chat || env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML",
    reply_to_message_id: r.tg_msg || undefined, reply_markup: { inline_keyboard: buttons } });
  return j && j.ok ? j.result.message_id : null;
}

// the driver who takes the ride (his car is what the customer sees)
function assign(r, drv) {
  const d = r.data;
  d.driverId = drv.id; d.chat = drv.chat_id;
  d.driver = { name: drv.name || "", car: drv.car || "", color: drv.color || "", plate: drv.plate || "", phone: drv.phone || "" };
  const o = d.offers && d.offers[drv.id];
  if (o && o.msg) r.tg_msg = o.msg;
}
function unassign(r) {
  const d = r.data;
  d.driverId = null; d.chat = null; d.driver = null; r.tg_msg = null; r.eta_at = null;
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

// "/raport [okres]" – a driver gets his own rides, Adam gets everyone (+ per driver)
async function sendReport(env, drv, text) {
  const per = parsePeriod(text.replace(/^\/raport(@\w+)?/i, "").trim());
  if (!per) { await say(env, drv.chat_id, "⚠️ Nie rozumiem okresu.\n\n" + REPORT_HELP); return; }
  const rep = await buildReport(env, per.from, per.to, drv.owner ? null : drv.id);
  await say(env, drv.chat_id, rep.text);
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
  if (!wasLive && isLive(me) && !edited && !drv.owner) {
    await say(env, drv.chat_id, "🟢 Jesteś na zmianie – będę Ci wysyłać kursy z okolicy. Żeby skończyć zmianę, zatrzymaj udostępnianie lokalizacji.");
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

// "/kurs SKĄD > DOKĄD, KIEDY, TELEFON, IMIĘ" – a ride taken over the phone by this driver. Shows a preview first.
async function phoneRide(env, request, drv, text) {
  const p = parseRide(text);
  if (p.error) { await say(env, drv.chat_id, (PARSE_ERRORS[p.error] ? "⚠️ " + PARSE_ERRORS[p.error] + "\n\n" : "") + HELP); return; }
  if (!env.GOOGLE_SERVER_KEY) { await say(env, drv.chat_id, "⚠️ Brak klucza Google (GOOGLE_SERVER_KEY) – nie znajdę adresów."); return; }
  const find = async (q) => {
    const f = await findPlace(env, q, CONFIG.base).catch(() => null);
    if (!f) return null;
    const address = f.name && !f.address.toLowerCase().includes(f.name.toLowerCase()) ? `${f.name}, ${f.address}` : f.address;
    return { address, lat: f.lat, lng: f.lng };
  };
  const [pickup, dest] = await Promise.all([find(p.pickup), find(p.dest)]);
  if (!pickup || !dest) {
    await say(env, drv.chat_id, `⚠️ Nie znalazłem adresu: <b>${esc(!pickup ? p.pickup : p.dest)}</b>. Dopisz miejscowość albo ulicę z numerem.`);
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
  assign(r, drv);
  await save(env, r);
  r.tg_msg = await notifyDriver(env, r, drv.chat_id);
  await save(env, r);
}

/* ---------------- drivers: joining, car, Adam's list ---------------- */
const JOIN_HELP =
  "🚕 <b>Witaj w zespole Taxi Adam!</b>\n\n" +
  "<b>1. Zmiana = lokalizacja na żywo.</b> Tutaj w czacie: 📎 → Lokalizacja → <b>Udostępniaj lokalizację na żywo</b> (najlepiej „do wyłączenia”, albo 8 h). " +
  "Dopóki udostępniasz, dostajesz kursy z okolicy – najbliższy kierowca dostaje kurs pierwszy. Koniec zmiany = zatrzymaj udostępnianie.\n" +
  "<b>2. Ustawienia telefonu</b> (inaczej lokalizacja przestaje działać w tle):\n" +
  "   • iPhone: Ustawienia → Telegram → Lokalizacja → <b>Zawsze</b>\n" +
  "   • Android: Telegram → Uprawnienia → Lokalizacja → <b>Zezwalaj zawsze</b>, i wyłącz oszczędzanie baterii dla Telegrama\n" +
  "<b>3. Twoje auto</b> (klient zobaczy, jakie auto przyjedzie):\n<code>/auto Citroën C5 Aircross; szary; SG 979AW; 4</code>\n" +
  "   i numer, pod którym klient może do Ciebie zadzwonić: <code>/telefon 600100200</code>\n\n" +
  "Inne: /kurs – kurs przyjęty przez telefon, /raport – Twoje kursy i zarobki.";

async function driversList(env, owner) {
  const [all, busy, bot] = await Promise.all([listDrivers(env), busyDriverIds(env), botUsername(env)]);
  const L = ["👥 <b>Kierowcy</b>"];
  all.forEach((x, i) => {
    const car = [x.car, x.color, x.plate].filter(Boolean).join(" · ");
    let st;
    if (!x.chat_id) st = `⏳ nie dołączył – link: ${x.code && bot ? `https://t.me/${bot}?start=d_${x.code}` : "/link " + (i + 1)}`;
    else if (busy.has(x.id)) st = "🚕 w kursie";
    else if (isLive(x)) st = `🟢 na zmianie (lokalizacja ${Math.max(0, Math.round((Date.now() - x.ts) / 60000))} min temu)`;
    else st = x.ts ? `⚪ poza zmianą (ostatnio ${new Date(x.ts).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : "⚪ poza zmianą";
    L.push(`${i + 1}. <b>${esc(x.name || "?")}</b>${x.id === owner.id ? " (Ty)" : ""} – ${st}${car ? "\n    " + esc(car) : ""}`);
  });
  L.push("", "Dodaj: <code>/dodaj Imię 600100200</code> · usuń: <code>/usun 3</code> · nowy link: <code>/link 3</code>");
  return L.join("\n");
}

async function command(env, request, drv, text) {
  const chat = drv.chat_id, t = text.trim();
  const arg = t.replace(/^\/\w+(@\w+)?\s*/, "");
  const cmd = (t.match(/^\/(\w+)/) || [])[1]?.toLowerCase();
  if (cmd === "raport") return sendReport(env, drv, t);
  if (cmd === "kurs") return phoneRide(env, request, drv, t);
  if (cmd === "auto") {
    const parts = arg.split(/\s*[;|]\s*/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return say(env, chat, "Napisz: <code>/auto Model; kolor; rejestracja; liczba miejsc</code>\nnp. <code>/auto Jetour X70 Plus; granatowy; SG 495FJ; 7</code>");
    const seats = parseInt(parts[3], 10);
    await updateDriver(env, drv.id, { car: parts[0].slice(0, 40), color: (parts[1] || "").slice(0, 20), plate: (parts[2] || "").toUpperCase().slice(0, 12),
                                      seats: seats >= 1 && seats <= 9 ? seats : null });
    return say(env, chat, `✅ Zapisane. Klient zobaczy: <b>${esc(parts[0])}</b>${parts[1] ? ", " + esc(parts[1]) : ""}${parts[2] ? ", " + esc(parts[2].toUpperCase()) : ""}${seats ? ` (${seats} miejsc)` : ""}`);
  }
  if (cmd === "telefon") {
    const n = arg.replace(/[^\d+ ]/g, "").trim();
    if (n.replace(/\D/g, "").length < 9) return say(env, chat, "Napisz: <code>/telefon 600100200</code>");
    await updateDriver(env, drv.id, { phone: n });
    return say(env, chat, `✅ Klient może dzwonić do Ciebie pod: <b>${esc(n)}</b>`);
  }
  if (cmd === "imie" || cmd === "imię") {
    if (!arg) return say(env, chat, "Napisz: <code>/imie Marek</code>");
    await updateDriver(env, drv.id, { name: arg.slice(0, 30) });
    return say(env, chat, `✅ Klient zobaczy imię: <b>${esc(arg.slice(0, 30))}</b>`);
  }
  // Adam only
  if (["kierowcy", "dodaj", "usun", "usuń", "link"].includes(cmd) && !drv.owner) return say(env, chat, "Tę komendę może użyć tylko Adam.");
  if (cmd === "kierowcy") return say(env, chat, await driversList(env, drv));
  if (cmd === "dodaj") {
    const phone = (arg.match(/\+?\d[\d \-]{7,}\d/) || [""])[0].trim();
    const name = arg.replace(phone, "").trim().slice(0, 30);
    if (!name) return say(env, chat, "Napisz: <code>/dodaj Marek 600100200</code>");
    const { code } = await addDriver(env, name, phone);
    const bot = await botUsername(env);
    const link = bot ? `https://t.me/${bot}?start=d_${code}` : `(kod: d_${code})`;
    await say(env, chat, `✅ Dodano: <b>${esc(name)}</b>.\nWyślij mu ten link – po kliknięciu dołączy do bota:\n${link}\n\n(link działa jeden raz)`);
    return say(env, chat, `Cześć ${esc(name)}! Kliknij, żeby dołączyć do kierowców Taxi Adam:\n${link}`);   // ready to forward
  }
  if (cmd === "usun" || cmd === "usuń" || cmd === "link") {
    const all = await listDrivers(env), x = all[parseInt(arg, 10) - 1];
    if (!x || x.owner) return say(env, chat, `Podaj numer z listy /kierowcy, np. <code>/${cmd} 2</code>`);
    if (cmd === "link") {
      const code = await newInviteCode(env, x.id), bot = await botUsername(env);
      return say(env, chat, `🔗 Nowy link dla ${esc(x.name)}: ${bot ? `https://t.me/${bot}?start=d_${code}` : "d_" + code}`);
    }
    await deactivateDriver(env, x.id);
    if (x.chat_id) await say(env, x.chat_id, "Twoje konto kierowcy w bocie Taxi Adam zostało wyłączone.");
    return say(env, chat, `🗑 Usunięto kierowcę: ${esc(x.name)}`);
  }
  return say(env, chat, drv.owner
    ? "Komendy: /kierowcy, /dodaj, /usun, /link, /kurs, /raport, /auto, /telefon"
    : "Komendy: /kurs, /raport, /auto, /telefon, /imie");
}

export async function onRequestPost({ request, env }) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const u = await request.json().catch(() => ({}));
  const msg = u.message || u.edited_message;
  const drv = msg ? await driverByChat(env, msg.chat?.id).catch(() => null) : null;

  // live location: every driver separately (first message + edits while it moves)
  if (msg && msg.location && drv) { await onLocation(env, drv, msg, !!u.edited_message); return json({ ok: true }); }

  const text = u.message && u.message.text;
  if (text && text.startsWith("/start")) {
    const chatId = u.message.chat.id, payload = text.split(/\s+/)[1] || "";
    if (!drv && /^d_[a-z0-9]{10}$/.test(payload)) {   // a driver's invite link
      const joined = await bindDriver(env, payload.slice(2), chatId);
      if (!joined) { await say(env, chatId, "Ten link jest już nieważny. Poproś Adama o nowy (/link)."); return json({ ok: true }); }
      await say(env, chatId, JOIN_HELP);
      const owner = await ensureOwner(env);
      if (owner.chat_id) await say(env, owner.chat_id, `✅ Kierowca <b>${esc(joined.name)}</b> dołączył do bota.`);
      return json({ ok: true });
    }
    await say(env, chatId, drv
      ? (drv.owner
          ? "✅ Bot działa. Tutaj przychodzą kursy ze strony.\n\n👥 Kierowcy: /kierowcy, dodaj kierowcę: <code>/dodaj Imię 600100200</code>\n📞 Kurs z telefonu: /kurs\n📊 Raport: /raport\n🚗 Twoje auto: /auto\n\n📡 Udostępniaj mi lokalizację na żywo – wtedy też dostajesz kursy jak kierowca."
          : JOIN_HELP)
      : `Ten bot jest dla kierowców Taxi Adam. Poproś Adama o link zaproszenia.\n(chat ID: ${chatId})`);
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
    }
    if (text.startsWith("/")) { await command(env, request, drv, text); return json({ ok: true }); }
  }

  const q = u.callback_query;
  if (!q) return json({ ok: true });
  const answer = (t, alert = false) => tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: t, show_alert: alert });
  const me = await driverByChat(env, q.message?.chat?.id).catch(() => null);
  if (!me) { await answer("Brak uprawnień"); return json({ ok: true }); }
  const clearButtons = () => q.message?.message_id && tg(env, "editMessageReplyMarkup", { chat_id: me.chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });

  const [act, id, arg] = String(q.data || "").split("|");
  let r = await load(env, id);
  if (!r) { await answer("Nie znaleziono kursu", true); return json({ ok: true }); }

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
  const min = parseInt(arg, 10) || 0, d = r.data;
  let toast = null, follow = null;
  const offered = d.offers && d.offers[me.id];
  const legacy = !d.driverId && !d.offers;   // rides from before drivers existed: Adam's

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
    if (r.mode === "later") { r.status = "scheduled"; await save(env, r); await Promise.all([answer("Zapisano rezerwację"), syncDriverMessage(env, r)]); return json({ ok: true }); }
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
    const allowed = st === "pending" ? (offered || legacy && me.owner || (act === "ok" && mine(r, me))) : mine(r, me);
    if (!allowed) { await answer("Ten kurs nie jest dla Ciebie", true); return json({ ok: true }); }
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
    if (st === "pending") assign(r, me);
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

  // reservations: Adam confirms for himself or gives the ride to a driver
  if ((act === "s" || act === "g") && st === "pending" && r.mode === "later") {
    if (!me.owner) { await answer("Rezerwacje przydziela Adam", true); return json({ ok: true }); }
    const all = await listDrivers(env);
    const to = act === "s" ? all.find((x) => x.owner) : all.find((x) => x.id === arg);
    if (!to || !to.chat_id) { await answer("Ten kierowca nie jest już dostępny", true); return json({ ok: true }); }
    const ownerMsg = d.offers?.owner?.msg || r.tg_msg;
    assign(r, to); r.status = "scheduled";
    if (to.owner) r.tg_msg = ownerMsg;
    else { d.ownerInfo = ownerMsg; d.offers = {}; r.tg_msg = await notifyDriver(env, r, to.chat_id); }
    await save(env, r);
    await Promise.all([answer(to.owner ? "Rezerwacja potwierdzona" : `Przydzielono: ${to.name}`), syncDriverMessage(env, r)]);
    if (!to.owner) await say(env, to.chat_id, `📅 Adam przydzielił Ci rezerwację na <b>${esc(String(d.when || "").replace("T", " "))}</b>. W dniu kursu kliknij „🚕 Wyjeżdżam do klienta”.`, { reply_to_message_id: r.tg_msg || undefined });
    return json({ ok: true });
  }

  // everything else: only the driver who has the ride (Adam may step in)
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
    // a driver gives a reservation back to Adam
    unassign(r); r.status = "pending"; d.offers = {}; d.assignable = (await listDrivers(env)).filter((x) => !x.owner && x.chat_id && x.id !== me.id).map((x) => ({ id: x.id, name: x.name }));
    await save(env, r);
    const owner = await ensureOwner(env);
    const mid = await notifyDriver(env, r, owner.chat_id);
    d.offers = { owner: { chat: owner.chat_id, msg: mid, name: owner.name } }; await save(env, r);
    await answer("Oddano Adamowi");
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
    await clearButtons();
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
