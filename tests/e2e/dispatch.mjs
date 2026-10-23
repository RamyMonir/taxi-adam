// the owner as dispatcher, end to end. Needs the fleet sync ON (no FLEET_FROM_FILE=0), fake Telegram :8999, fake Google :8998 (fake-google.mjs) – see README.
import { OWNER as OWNER_NAME, BRAND } from "../../server/brand.js";
const S = "http://localhost:8788", TG = "http://127.0.0.1:8999";
let uid = 1, fails = 0;
const ok = (c, m, x = "") => { console.log((c ? "✔ " : "✘ ") + m + (x ? " | " + x : "")); if (!c) fails++; };
const hook = (u) => fetch(S + "/api/telegram", { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hooksecret" }, body: JSON.stringify({ update_id: uid++, ...u }) });
const msg = (chat, text) => hook({ message: { message_id: uid * 10, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat }, text } });
const tap = (chat, data, message_id = 1) => hook({ callback_query: { id: "q" + uid, from: { id: chat }, data, message: { message_id, chat: { id: chat } } } });
const loc = (chat, lat, lng) => hook({ message: { message_id: 77, date: Math.floor(Date.now() / 1000), chat: { id: chat }, location: { latitude: lat, longitude: lng, live_period: 28800 } } });
const log = () => fetch(TG + "/_log").then((r) => r.json());
const reset = () => fetch(TG + "/_reset");
const sentTo = async (chat, method = "sendMessage") => (await log()).filter((x) => x.method === method && String(x.chat_id) === String(chat));
const alerts = async () => (await log()).filter((x) => x.method === "answerCallbackQuery").map((x) => x.text || "");
const inl = (m) => (m?.reply_markup?.inline_keyboard || []).flat();
const status = (r) => fetch(S + "/api/rides/" + r.id, { headers: { "X-Ride-Token": r.token } }).then((x) => x.json());
const OWNER = 999, MAREK = 4101, KASIA = 4102, TOMEK = 4103;

const setup = await fetch(S + "/api/admin/setup?key=adminkey").then((r) => r.json());
const join = async (chat, name) => msg(chat, "/start " + setup.fleet.invites.find((i) => i.name === name).link.split("start=")[1]);
await join(MAREK, "Marek Nowak"); await join(KASIA, "Katarzyna Wójcik"); await join(TOMEK, "Tomasz Kowalczyk");
for (const [chat, plate, lat] of [[MAREK, "f_sgl1a234", 50.2215], [KASIA, "f_sgl2b567", 50.25]]) {
  await tap(chat, "car|" + plate); await loc(chat, lat, 18.68);
}

// 1. the owner's menu + the driver list grouped by availability
await reset(); await msg(OWNER, "/start");
const kb = (await sentTo(OWNER)).pop().reply_markup?.keyboard?.flat().map((b) => b.text) || [];
ok(kb[0] === "➕ Nowy kurs" && kb[1] === "🗂 Kursy w toku", "the owner's menu starts with ➕ Nowy kurs / 🗂 Kursy w toku", kb.join(" | "));
await reset(); await msg(OWNER, "👥 Kierowcy");
let m = (await sentTo(OWNER)).pop();
ok(/Wolni[\s\S]*Marek Nowak[\s\S]*Katarzyna Wójcik[\s\S]*Poza zmianą[\s\S]*Tomasz[\s\S]*Nie dołączyli[\s\S]*Paweł Zieliński[\s\S]*start=d_/.test(m.text),
   "'👥 Kierowcy' grouped: free / off duty / not joined (+ link)", m.text.replace(/\n/g, " ⏎ ").slice(0, 260));
ok(inl(m).filter((b) => /^drm\|/.test(b.callback_data)).length === 4, "a 🗑 button per driver");

// 2. a phone ride now -> panel with who is free
await reset(); await msg(OWNER, "/kurs Rynek 1 Przykładowo > Dworzec Gliwice, 600100200, Pani Ewa");
m = (await sentTo(OWNER)).pop();
const id1 = inl(m).find((b) => /^dpo\|/.test(b.callback_data))?.callback_data.split("|")[1];
ok(/Kto jedzie\?/.test(m.text) && /⭐ <b>Marek<\/b>[\s\S]*🟢 Katarzyna/.test(m.text), "phone ride -> 'Kto jedzie?' + free drivers, fastest first (⭐)", m.text.split("\n").slice(-6).join(" / "));
ok(inl(m).some((b) => /^dps\|/.test(b.callback_data)) && inl(m).filter((b) => /^dpa\|/.test(b.callback_data)).length === 2 && inl(m).some((b) => /^del\|/.test(b.callback_data)),
   "buttons: 🙋 Jadę sam / 📨 Wyślij do wolnych / one per free driver / 🗑", inl(m).map((b) => b.text).join(" | "));

// 3. the owner gives it to Kasia -> only Kasia gets it; she accepts; customer sees her car
await reset(); await tap(OWNER, `dpa|${id1}|f_k2`, 5001);
ok((await sentTo(KASIA)).some((x) => /KURS TERAZ/.test(x.text || "")) && !(await sentTo(MAREK)).length, "'🟢 Katarzyna' -> offered only to her");
ok((await alerts()).some((t) => /Wysłano do: Katarzyna/.test(t)), "the owner gets 'Wysłano do: Katarzyna'");
ok((await sentTo(OWNER, "editMessageText")).some((x) => /Wysłano do: Katarzyna/.test(x.text || "")), "the owner's message updates: 📨 Wysłano do: Katarzyna");
await reset(); await tap(KASIA, "e|" + id1);
ok((await sentTo(OWNER, "editMessageText")).some((x) => /Kurs przyjął: <b>Katarzyna/.test(x.text || "") && !inl(x).length), "Kasia accepts -> the owner sees who took it, buttons gone");
for (const a of ["a", "t", "d"]) await tap(KASIA, `${a}|${id1}`);

// 4. phone ride -> 'Wyślij do wolnych' -> nearest gets it; a second tap on an old button is harmless
await reset(); await msg(OWNER, "/kurs Rynek 1 Przykładowo > Dworzec Gliwice, 600100201");
const id2 = inl((await sentTo(OWNER)).pop()).find((b) => /^dps\|/.test(b.callback_data))?.callback_data.split("|")[1];
await reset(); await tap(OWNER, "dps|" + id2);
ok((await sentTo(MAREK)).some((x) => /KURS TERAZ/.test(x.text || "")), "'📨 Wyślij do wolnych' -> the nearest free driver (Marek) gets it");
await reset(); await msg(OWNER, "🗂 Kursy w toku");
m = (await sentTo(OWNER)).pop();
ok(/Czeka na kierowcę/.test(m.text) && inl(m).some((b) => b.callback_data === "dpl|" + id2), "'🗂 Kursy w toku' lists the waiting ride with 👥 Kto jedzie?", m.text.replace(/\n/g, " / "));
await reset(); await tap(OWNER, "dpl|" + id2);
m = (await sentTo(OWNER)).pop();
ok(/Wysłano do: Marek/.test(m.text) && inl(m).some((b) => /^dpo\|/.test(b.callback_data)), "👥 Przydziel -> a fresh panel for that ride");
await reset(); await tap(OWNER, "dpo|" + id2);
ok((await alerts()).length > 0 && (await sentTo(OWNER, "editMessageText")).length > 0, "'🙋 Jadę sam' on a ride already offered -> the owner takes it");
await reset(); await tap(MAREK, "e|" + id2);
ok((await alerts()).some((t) => /nie jest dla Ciebie|nie Twój|już|nieaktualn/i.test(t)) || (await sentTo(MAREK, "editMessageText")).length > 0, "Marek's late tap does not steal it", (await alerts()).join(" / "));

// 5. a website ride: the owner's copy has the panel; he hands it to Kasia
await reset();
const w = await fetch(S + "/api/rides", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "10.1.1.9" },
  body: JSON.stringify({ mode: "now", pickup: { address: "Rynek 1, Przykładowo", lat: 50.2197, lng: 18.6767 }, dest: { address: "Dworzec PKP Gliwice", lat: 50.3008, lng: 18.6635 }, phone: "600100300", name: "Jan", pax: 1 }) }).then((x) => x.json());
m = (await sentTo(OWNER)).find((x) => x.text && x.text.includes("Kurs teraz"));
ok(!!m && inl(m).some((b) => b.callback_data === "dpa|" + w.id + "|f_k2"), "website ride -> the owner's copy has 🟢 Katarzyna (Marek was offered it automatically)", m && inl(m).map((b) => b.text).join(" | "));
await reset(); await tap(OWNER, `dpa|${w.id}|f_k2`);
await tap(KASIA, "e|" + w.id);
let s = await status(w);
ok(s.driver && /Katarzyna/.test(s.driver.name), "the owner's pick (Kasia) accepts -> the customer sees her", JSON.stringify(s.driver));

// 6. a reservation -> 'Przydziel: Tomasz' (not on shift now: fine for later)
await reset(); await msg(OWNER, "/kurs Rynek 1 Przykładowo > Lotnisko Pyrzowice, jutro 14:30, 600100400");
m = (await sentTo(OWNER)).pop();
const btnT = inl(m).find((b) => /^dpa\|.*\|f_k3$/.test(b.callback_data));
ok(!!btnT && /Przydziel: Tomasz/.test(btnT.text), "reservation -> 👤 Przydziel buttons for the whole team", inl(m).map((b) => b.text).join(" | "));
await reset(); await tap(OWNER, btnT.callback_data);
ok((await sentTo(TOMEK)).some((x) => /Rezerwacja|REZERWACJA|📅/.test(x.text || "")), "Tomasz gets the reservation");

// 6b. a hand-picked driver says no -> the owner is told and can pick again
await reset(); await msg(OWNER, "/kurs Rynek 1 Przykładowo > Dworzec Gliwice, 600100500");
const id3 = inl((await sentTo(OWNER)).pop()).find((b) => /^dpo\|/.test(b.callback_data))?.callback_data.split("|")[1];
await tap(OWNER, `dpa|${id3}|f_k1`);
await reset(); await tap(MAREK, "x|" + id3);
const back = (await sentTo(OWNER)).concat(await sentTo(OWNER, "editMessageText"));
ok(back.some((x) => /odrzucił/.test(x.text || "") && inl(x).some((b) => /^dpa\|/.test(b.callback_data) || /^e\|/.test(b.callback_data))),
   "Marek says no -> the owner sees '(odrzucił)' and can choose again", back.map((x) => (x.text || "").split("\n")[0]).join(" / "));

// 7. remove a driver (asks first)
await reset(); await tap(OWNER, "drm|f_k4");
m = (await sentTo(OWNER)).pop();
ok(/Usunąć kierowcę <b>Paweł/.test(m.text) && inl(m).some((b) => b.callback_data === "drmy|f_k4"), "🗑 -> 'Usunąć kierowcę Paweł?' Tak/Nie");
await reset(); await tap(OWNER, "drmy|f_k4");
m = (await sentTo(OWNER)).pop();
ok(/Usunięto: <b>Paweł/.test(m.text) && !/Paweł Zieliński/.test(m.text.split("\n").slice(1).join("\n")), "removed -> gone from the list");
await reset(); await tap(MAREK, "drm|f_k1");
ok((await alerts()).some((t) => new RegExp(`Tylko ${OWNER_NAME.nom}`).test(t)), "drivers can't remove anyone");
await reset(); await msg(OWNER, "❓ Pomoc");
ok(/Ktoś dzwoni\?/.test((await sentTo(OWNER)).pop()?.text || ""), "the owner's ❓ Pomoc starts with 'Ktoś dzwoni?'");
await reset(); await msg(OWNER, "➕ Nowy kurs");
ok(/SKĄD &gt; DOKĄD/.test((await sentTo(OWNER)).pop()?.text || ""), "'➕ Nowy kurs' shows how to write a ride");
console.log(fails ? fails + " FAILED" : "ALL PASS");
