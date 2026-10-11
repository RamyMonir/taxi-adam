// Telegram bot: cars (check-in per shift), photos, Adam's car / commission commands, settlement buttons.
// Button-first: picking, switching and giving back a car is one tap. Texts in Polish only.
import { tg, db, isLive } from "./rides.js";
import { buildReport } from "./report.js";
import { esc } from "./util.js";
import { listDrivers, updateDriver } from "./fleet.js";
import { listCars, freeCars, checkIn, hasOpenRide, release, releaseCar, addCar, updateCar, parseCarArgs, carLabel, carLong, isDemo } from "./cars.js";
import { saveTelegramPhoto, profilePhotoId, pickSize, photosEnabled } from "./photos.js";
import { modelOf, modelLabel } from "./settle.js";
import { CONFIG } from "./config.js";

const btn = (text, data) => ({ text, callback_data: data });
const say = (env, chat, text, extra = {}) => tg(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
const hhmm = (ms) => new Date(ms).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
const C = () => CONFIG.commission || {};

// "Którym autem jeździsz?" – free cars as buttons, the others as info lines
export async function carPickerBody(env, drv, header) {
  const cars = await listCars(env), mine = cars.find((c) => c.holder_id === drv.id), free = freeCars(cars);
  const L = [header];
  if (mine) L.push(`🚗 <b>Twoje auto:</b> ${esc(carLong(mine))} (od ${hhmm(mine.held_since)})`);
  const other = cars.filter((c) => c.id !== mine?.id && !free.includes(c));
  if (free.length) L.push("", mine ? "Zmień na:" : "<b>Wybierz auto</b> – klient zobaczy je i rejestrację:");
  else if (!mine) L.push("", "😕 Brak wolnych aut – zapytaj Adama.");
  for (const c of other) {
    L.push(c.status === "service" ? `🔧 ${esc(carLabel(c))} – w serwisie${c.note ? ": " + esc(c.note) : ""}` : `🔒 ${esc(carLabel(c))} – jeździ ${esc(c.holder_name || "inny kierowca")}`);
  }
  const rows = free.map((c) => [btn(`🚗 ${carLong(c)}`, `car|${c.id}`)]);
  if (mine) rows.push([btn("🔓 Oddaj auto", "carrel|-")]);
  return { text: L.join("\n"), reply_markup: { inline_keyboard: rows } };
}
export async function sendCarPicker(env, drv, header = "🚗 <b>Auto na zmianę</b>") {
  const b = await carPickerBody(env, drv, header);
  return say(env, drv.chat_id, b.text, { reply_markup: b.reply_markup });
}
const editMsg = (env, q, text, rows = []) => tg(env, "editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text,
  parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: rows } });

// "Dziś: 5 kursów · 420 zł" for this driver (Adam: his own rides)
export async function todayLine(env, drv) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
  const rep = await buildReport(env, today, today, drv.owner ? null : drv.id).catch(() => null);
  const done = rep ? rep.rows.filter((x) => x.status === "done" && (!drv.owner || (x.driver_id || "owner") === "owner")) : [];
  const money = done.reduce((s, x) => s + Number(x.paid != null ? x.paid : x.price || 0), 0);
  const n = done.length, word = n === 1 ? "kurs" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "kursy" : "kursów";
  return `📊 Dziś: <b>${n} ${word}</b>${n ? ` · ${Math.round(money)} zł` : ""}`;
}

async function tellOwner(env, me, text) {
  if (me.owner) return;
  const owner = (await listDrivers(env)).find((x) => x.owner);
  if (owner?.chat_id) await say(env, owner.chat_id, text, { disable_notification: true });
}

/* ---------------- callbacks that are not about a ride ---------------- */
// returns true when the callback was handled here
export async function fleetCallback(env, q, me, answer) {
  const [act, id, arg] = String(q.data || "").split("|");
  if (act === "car") {
    const res = await checkIn(env, me, id);
    if (res.error) {
      const why = { taken: `Ten samochód właśnie wziął ${res.by || "inny kierowca"}. Wybierz inny.`, service: "To auto jest w serwisie.",
                    gone: "Tego auta nie ma już na liście.", ride: "Najpierw zakończ kurs – auto zmienisz po nim." }[res.error];
      await answer(why, true);
      if (res.error !== "ride") { const b = await carPickerBody(env, me, "🚗 <b>Auto na zmianę</b>"); await editMsg(env, q, b.text, b.reply_markup.inline_keyboard); }
      return true;
    }
    await answer(`✅ Jeździsz: ${carLabel(res.car)}`);
    // the shift needs two things: a car and live location – say clearly what's still missing
    const next = isLive(me) ? "🟢 <b>Jesteś na zmianie</b> – kursy z okolicy przychodzą tutaj."
      : "<b>Krok 2/2:</b> udostępnij mi lokalizację na żywo: 📎 → <b>Lokalizacja</b> → <b>Udostępniaj lokalizację na żywo</b> (najlepiej „Do wyłączenia”). Dopiero wtedy dostaniesz kursy.";
    await editMsg(env, q, `🚗 <b>Twoje auto:</b> ${esc(carLong(res.car))}\nKlient zobaczy to auto i rejestrację.\n\n${next}`,
                  [[btn("🔁 Zmień auto", "carlist|-"), btn("🔴 Zakończ zmianę", "shift|end")]]);
    if (!res.same) await tellOwner(env, me, `🚗 ${esc(me.name)} ${res.from ? `zmienił auto: ${esc(carLabel(res.from))} → ` : "wziął "}<b>${esc(carLabel(res.car))}</b>`);
    return true;
  }
  if (act === "carlist") {
    const b = await carPickerBody(env, me, "🚗 <b>Auto na zmianę</b>");
    await answer(); await editMsg(env, q, b.text, b.reply_markup.inline_keyboard);
    return true;
  }
  if (act === "carrel") {
    if (await hasOpenRide(env, me.id)) { await answer("Najpierw zakończ kurs.", true); return true; }
    const car = await release(env, me.id, "release");
    await answer(car ? "Auto oddane" : "Nie masz auta");
    await editMsg(env, q, car ? `🔓 Oddałeś <b>${esc(carLabel(car))}</b>. Dziękuję!\nNa następnej zmianie wybierzesz auto jednym kliknięciem.` : "Nie masz teraz auta.",
                  [[btn("🚗 Wybierz auto", "carlist|-")]]);
    if (car) await tellOwner(env, me, `🔓 ${esc(me.name)} oddał <b>${esc(carLabel(car))}</b>`);
    return true;
  }
  if (act === "carkeep") {
    await answer("OK – auto zostaje przy Tobie");
    await editMsg(env, q, "☕ Przerwa – auto zostaje przy Tobie. Gdy wrócisz, udostępnij lokalizację na żywo.\n<i>Bez lokalizacji przez 45 min auto zwolni się samo.</i>",
                  [[btn("🔓 Jednak oddaję auto", "carrel|-")]]);
    return true;
  }
  if (act === "shift" && id === "end") {   // end of shift: give the car back + today's summary
    if (await hasOpenRide(env, me.id)) { await answer("Najpierw zakończ kurs.", true); return true; }
    const car = await release(env, me.id, "release");
    await answer("Zmiana zakończona 👋");
    await editMsg(env, q, `🔴 <b>Zmiana zakończona.</b>${car ? ` Oddałeś <b>${esc(carLabel(car))}</b>.` : ""}\n${await todayLine(env, me)}\n\n` +
      "Ostatni krok: zatrzymaj udostępnianie lokalizacji (pasek z mapką u góry czatu → <b>Zatrzymaj</b>).\nDziękuję i do zobaczenia! 🚕",
      [[btn("🟢 Zacznij nową zmianę", "carlist|-")]]);
    await tellOwner(env, me, `🔴 ${esc(me.name)} zakończył zmianę${car ? ` (oddał <b>${esc(carLabel(car))}</b>)` : ""}`);
    return true;
  }
  if (act === "ph") return photoCallback(env, q, me, id, answer);
  if (act === "stl") {   // Adam: "✅ Marek rozliczony" under the evening report
    if (!me.owner) { await answer("Tylko Adam", true); return true; }
    await (await db(env)).prepare("UPDATE settlements SET settled_at = ?, settled_by = ? WHERE day = ? AND driver_id = ?").bind(Date.now(), me.id, id, arg).run();
    await answer("✅ Zapisano: rozliczone");
    const kb = (q.message.reply_markup?.inline_keyboard || []).map((row) => row.filter((b) => b.callback_data !== q.data)).filter((row) => row.length);
    await tg(env, "editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: kb } });
    return true;
  }
  return false;
}

/* ---------------- photos ---------------- */
export async function photoMenu(env, drv) {
  if (!photosEnabled(env)) return say(env, drv.chat_id, "📸 Zdjęcia są jeszcze wyłączone (Adam musi włączyć R2 i PHOTO_SECRET).");
  const rows = [[btn("📸 Użyj zdjęcia z profilu Telegram", "ph|prof")], [btn("📤 Wyślę inne zdjęcie", "ph|up")]];
  if (drv.photo_key) rows.push([btn("🗑 Usuń moje zdjęcie", "ph|del")]);
  return say(env, drv.chat_id,
    `📸 <b>Twoje zdjęcie dla klienta</b> ${drv.photo_key && drv.photo_ok ? "(✅ ustawione)" : "(brak)"}\n\n` +
    "Klient zobaczy je <b>tylko podczas swojego kursu</b> z Tobą (i 2 h po nim) – razem z Twoim imieniem i autem. " +
    "Wybierając zdjęcie, zgadzasz się na to. W każdej chwili możesz je usunąć.", { reply_markup: { inline_keyboard: rows } });
}
async function photoCallback(env, q, me, what, answer) {
  if (what === "up") {
    await updateDriver(env, me.id, { await_photo: "me" });
    await answer(); await editMsg(env, q, "📤 Wyślij mi teraz swoje zdjęcie (📎 → Zdjęcie). Najlepiej twarz, jasne tło.");
    return true;
  }
  if (what === "del") {
    if (me.photo_key && env.PHOTOS) await env.PHOTOS.delete(me.photo_key).catch(() => {});
    await updateDriver(env, me.id, { photo_key: null, photo_ok: 0 });
    await answer("Usunięte"); await editMsg(env, q, "🗑 Zdjęcie usunięte – klienci widzą tylko Twoje imię i auto.");
    return true;
  }
  if (what === "prof") {
    const fid = await profilePhotoId(env, me.chat_id);
    if (!fid) { await answer("Nie widzę zdjęcia profilowego (może jest ukryte). Wyślij inne zdjęcie.", true); return true; }
    const res = await saveTelegramPhoto(env, fid, `drivers/${me.id}.jpg`);
    if (res.error) { await answer("Nie udało się zapisać zdjęcia – spróbuj wysłać inne.", true); return true; }
    await updateDriver(env, me.id, { photo_key: res.key, photo_ok: 1 });
    await answer("✅ Zapisane"); await editMsg(env, q, "✅ Zdjęcie z profilu zapisane. Klient zobaczy je podczas swojego kursu.", [[btn("🗑 Usuń moje zdjęcie", "ph|del")]]);
    return true;
  }
  return false;
}
// a photo sent after /zdjecie (driver) or /zdjecieauta N (Adam)
export async function onPhotoMessage(env, drv, msg) {
  const target = drv.await_photo;
  if (!target) return false;
  const p = pickSize(msg.photo);
  const isCar = target.startsWith("car:"), carId = isCar ? target.slice(4) : null;
  const res = p ? await saveTelegramPhoto(env, p.file_id, isCar ? `cars/${carId}.jpg` : `drivers/${drv.id}.jpg`) : { error: "file" };
  await updateDriver(env, drv.id, { await_photo: null });
  if (res.error) { await say(env, drv.chat_id, res.error === "size" ? "⚠️ Zdjęcie jest za duże – wyślij mniejsze." : "⚠️ Nie udało się zapisać zdjęcia. Spróbuj jeszcze raz."); return true; }
  if (isCar) { await updateCar(env, carId, { photo_key: res.key }); await say(env, drv.chat_id, "✅ Zdjęcie auta zapisane. Klient zobaczy je podczas kursu tym autem."); }
  else { await updateDriver(env, drv.id, { photo_key: res.key, photo_ok: 1 }); await say(env, drv.chat_id, "✅ Zdjęcie zapisane. Klient zobaczy je podczas swojego kursu (usuniesz je przez /zdjecie)."); }
  return true;
}

/* ---------------- commands ---------------- */
const OWNER_CMDS = ["auta", "dodajauto", "edytujauto", "serwis", "usunauto", "zwolnij", "zdjecieauta", "prowizja"];
export const FLEET_OWNER_HELP =
  "🚗 <b>Auta:</b> /auta · <code>/dodajauto Toyota Corolla; biała; SGL 1A234; 4</code> · <code>/edytujauto 2 Škoda Octavia; czarna; SGL 2B567; 4</code>\n" +
  "   <code>/serwis 3 wymiana klocków</code> · <code>/serwis 3 koniec</code> · <code>/usunauto 3</code> · <code>/zwolnij 3</code> · <code>/zdjecieauta 3</code>\n" +
  "💰 <b>Rozliczenie:</b> /prowizja · <code>/prowizja 2 50</code> · <code>/prowizja 2 dzienna 120</code> · <code>/prowizja 2 domyślna</code>";

// returns true when the command was handled here
export async function fleetCommand(env, drv, cmd, arg) {
  const chat = drv.chat_id;
  if (cmd === "auto") {
    if (/;/.test(arg)) await say(env, chat, drv.owner ? "Auta dodajesz teraz komendą /dodajauto (lista: /auta)." : "Auta dodaje Adam. Wybierz auto z listy:");
    await sendCarPicker(env, drv); return true;
  }
  if (cmd === "oddaj") {
    if (await hasOpenRide(env, drv.id)) { await say(env, chat, "Najpierw zakończ kurs – auto oddasz po nim."); return true; }
    const car = await release(env, drv.id, "release");
    await say(env, chat, car ? `🔓 Oddałeś <b>${esc(carLabel(car))}</b>. Dziękuję!` : "Nie masz teraz auta. Wybierz: /auto");
    if (car) await tellOwner(env, drv, `🔓 ${esc(drv.name)} oddał <b>${esc(carLabel(car))}</b>`);
    return true;
  }
  if (cmd === "zdjecie" || cmd === "zdjęcie") { await photoMenu(env, drv); return true; }
  if (!OWNER_CMDS.includes(cmd)) return false;
  if (!drv.owner) { await say(env, chat, "Tę komendę może użyć tylko Adam."); return true; }

  const cars = await listCars(env);
  const nth = (s) => cars[parseInt(s, 10) - 1];
  const [first, ...restParts] = arg.split(/\s+/), rest = restParts.join(" ").trim();
  if (cmd === "auta") { await say(env, chat, carsList(cars) + "\n\n" + FLEET_OWNER_HELP); return true; }
  if (cmd === "dodajauto") {
    const c = parseCarArgs(arg);
    if (c.error) { await say(env, chat, "Napisz: <code>/dodajauto Marka Model; kolor; rejestracja; miejsca</code>\nnp. <code>/dodajauto Toyota Corolla; biała; SGL 1A234; 4</code>"); return true; }
    if (cars.some((x) => x.plate.replace(/ /g, "") === c.plate.replace(/ /g, ""))) { await say(env, chat, `⚠️ Auto z rejestracją ${esc(c.plate)} już jest na liście (/auta).`); return true; }
    const id = await addCar(env, c);
    await updateDriver(env, drv.id, { await_photo: `car:${id}` });
    await say(env, chat, `✅ Dodano auto nr ${cars.length + 1}: <b>${esc(carLong(c))}</b>\n📸 Możesz teraz wysłać jego zdjęcie (klient zobaczy je podczas kursu) – albo pomiń.`);
    return true;
  }
  const car = nth(first);
  if (!car) { await say(env, chat, "Podaj numer auta z listy /auta, np. <code>/" + cmd + " 2</code>\n\n" + carsList(cars)); return true; }
  if (cmd === "edytujauto") {
    const c = parseCarArgs(rest);
    if (c.error) { await say(env, chat, "Napisz: <code>/edytujauto NR Marka Model; kolor; rejestracja; miejsca</code>"); return true; }
    await updateCar(env, car.id, c);
    await say(env, chat, `✅ Auto nr ${first}: <b>${esc(carLong(c))}</b>`); return true;
  }
  if (cmd === "serwis") {
    if (/^(koniec|ok|gotowe)$/i.test(rest)) { await updateCar(env, car.id, { status: "active", note: null }); await say(env, chat, `✅ ${esc(carLabel(car))} wraca do jazdy.`); return true; }
    const who = await releaseCar(env, car.id, "service");
    await updateCar(env, car.id, { status: "service", note: rest.slice(0, 60) || null });
    await say(env, chat, `🔧 ${esc(carLabel(car))} – w serwisie${rest ? ": " + esc(rest) : ""}. Koniec: <code>/serwis ${first} koniec</code>`);
    if (who) await notifyHolder(env, who, `🔧 Auto <b>${esc(carLabel(car))}</b> idzie do serwisu – wybierz inne.`);
    return true;
  }
  if (cmd === "usunauto") {
    const who = await releaseCar(env, car.id, "admin");
    await updateCar(env, car.id, { status: "inactive" });
    await say(env, chat, `🗑 Usunięto z listy: ${esc(carLabel(car))} (stare kursy zostają w raportach).`);
    if (who) await notifyHolder(env, who, `🗑 Auto <b>${esc(carLabel(car))}</b> zostało wycofane – wybierz inne.`);
    return true;
  }
  if (cmd === "zwolnij") {
    const who = await releaseCar(env, car.id, "admin");
    await say(env, chat, who ? `🔓 Zwolniono ${esc(carLabel(car))}.` : `${esc(carLabel(car))} jest już wolne.`);
    if (who) await notifyHolder(env, who, `🔓 Adam zwolnił auto <b>${esc(carLabel(car))}</b>.`);
    return true;
  }
  if (cmd === "zdjecieauta") {
    if (!photosEnabled(env)) { await say(env, chat, "📸 Zdjęcia są wyłączone – brak R2 (PHOTOS) albo PHOTO_SECRET."); return true; }
    await updateDriver(env, drv.id, { await_photo: `car:${car.id}` });
    await say(env, chat, `📸 Wyślij teraz zdjęcie auta <b>${esc(carLabel(car))}</b>.`); return true;
  }
  if (cmd === "prowizja") { await commission(env, drv, arg); return true; }
  return false;
}
async function notifyHolder(env, driverId, text) {
  const x = (await listDrivers(env)).find((d) => d.id === driverId);
  if (x && x.chat_id && !isDemo(x)) await sendCarPicker(env, x, text);
}

export function carsList(cars) {
  const L = ["🚗 <b>Auta</b>"];
  if (!cars.length) L.push("Brak aut – dodaj: <code>/dodajauto Toyota Corolla; biała; SGL 1A234; 4</code>");
  cars.forEach((c, i) => {
    const st = c.status === "service" ? `🔧 w serwisie${c.note ? ": " + esc(c.note) : ""}`
      : c.holder_id ? `🔒 jeździ ${esc(c.holder_name || "?")} (od ${hhmm(c.held_since)})` : "🟢 wolne";
    L.push(`${i + 1}. <b>${esc(carLabel(c))}</b> · ${esc(c.color || "")} · ${c.seats} os.${c.photo_key ? " · 📸" : ""}${String(c.id).startsWith("demo_") ? " · 🧪 DEMO" : ""}\n    ${st}`);
  });
  return L.join("\n");
}

async function commission(env, owner, arg) {
  const all = await listDrivers(env), cfg = C();
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  const x = parts.length ? all[parseInt(parts[0], 10) - 1] : null;
  if (!x) {
    const L = ["💰 <b>Rozliczenie kierowców</b>", `Domyślnie: ${cfg.default_driver_pct ?? 50}% dla kierowcy / ${100 - (cfg.default_driver_pct ?? 50)}% dla firmy`, ""];
    all.forEach((d, i) => L.push(`${i + 1}. ${esc(d.name || "?")}: ${modelLabel(modelOf(d, cfg))}${d.pay_model ? "" : d.owner ? "" : " (domyślnie)"}`));
    L.push("", "Zmień: <code>/prowizja 2 50</code> (procent dla kierowcy) · <code>/prowizja 2 dzienna 120</code> (stała opłata za auto) · <code>/prowizja 2 domyślna</code>");
    await say(env, owner.chat_id, L.join("\n")); return;
  }
  if (x.owner) { await say(env, owner.chat_id, "Ty jesteś właścicielem – Twoje kursy w całości idą do firmy."); return; }
  const kind = (parts[1] || "").toLowerCase();
  let f;
  if (/^domy/.test(kind)) f = { pay_model: null, driver_pct: null, daily_fee: null };
  else if (/^dzien/.test(kind)) { const fee = parseFloat(String(parts[2] || "").replace(",", ".")); if (!(fee >= 0 && fee <= 2000)) f = null; else f = { pay_model: "daily_fee", daily_fee: fee, driver_pct: null }; }
  else { const pct = parseFloat(kind.replace("%", "").replace(",", ".")); f = pct >= 0 && pct <= 100 ? { pay_model: "percent", driver_pct: pct, daily_fee: null } : null; }
  if (!f) { await say(env, owner.chat_id, "Napisz: <code>/prowizja 2 50</code> albo <code>/prowizja 2 dzienna 120</code> albo <code>/prowizja 2 domyślna</code>"); return; }
  await updateDriver(env, x.id, f);
  const m = modelOf({ ...x, ...f }, cfg);
  await say(env, owner.chat_id, `✅ ${esc(x.name)}: ${m.model === "percent" ? `${m.pct}% dla kierowcy / ${100 - m.pct}% dla firmy` : modelLabel(m)}`);
}

