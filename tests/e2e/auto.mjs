// Auto-assign while the owner is busy + flight watch, end to end through the minute timer (/api/admin/cron).
// Needs: fake Telegram :8999, fake Google + flights :8998, wrangler with the fleet sync ON plus
// AUTO_ASSIGN_MIN=0.01 AUTO_NOW_MIN=0.01 AERODATABOX_KEY=fake AERODATABOX_BASE=http://127.0.0.1:8998 – see README.
import { nowWarsaw } from "../../server/util.js";
const S = "http://localhost:8788", TG = "http://127.0.0.1:8999", G = "http://127.0.0.1:8998";
let uid = 1, fails = 0;
const ok = (c, m, x = "") => { console.log((c ? "✔ " : "✘ ") + m + (x ? " | " + x : "")); if (!c) fails++; };
const hook = (u) => fetch(S + "/api/telegram", { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hooksecret" }, body: JSON.stringify({ update_id: uid++, ...u }) });
const msg = (chat, text) => hook({ message: { message_id: uid * 10, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat }, text } });
const tap = (chat, data) => hook({ callback_query: { id: "q" + uid, from: { id: chat }, data, message: { message_id: 1, chat: { id: chat } } } });
const loc = (chat, lat, lng) => hook({ message: { message_id: 77, date: Math.floor(Date.now() / 1000), chat: { id: chat }, location: { latitude: lat, longitude: lng, live_period: 28800 } } });
const log = () => fetch(TG + "/_log").then((r) => r.json());
const reset = () => fetch(TG + "/_reset");
const texts = async (chat) => (await log()).filter((x) => /sendMessage|editMessageText/.test(x.method) && String(x.chat_id) === String(chat)).map((x) => x.text || "");
const cron = () => fetch(S + "/api/admin/cron", { method: "POST", headers: { "x-cron-key": "cronkey" } }).then((r) => r.json());
const book = (b) => fetch(S + "/api/rides", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "10.2.2." + uid },
  body: JSON.stringify({ name: "Test", pax: 1, website: "", ...b }) }).then((r) => r.json());
const status = (r) => fetch(S + "/api/rides/" + r.id, { headers: { "X-Ride-Token": r.token } }).then((x) => x.json());
const pause = () => new Promise((r) => setTimeout(r, 1500));   // AUTO_*_MIN=0.01 = 0.6 s
const OWNER = 999, MAREK = 4101, KASIA = 4102;
const RYNEK = { address: "Rynek 1, 00-000 Przykładowo", lat: 50.2197, lng: 18.6767 }, KTW = { address: "Lotnisko Katowice-Pyrzowice", lat: 50.4743, lng: 19.08 };

const setup = await fetch(S + "/api/admin/setup?key=adminkey").then((r) => r.json());
const join = async (chat, name) => msg(chat, "/start " + setup.fleet.invites.find((i) => i.name === name).link.split("start=")[1]);
await join(MAREK, "Marek Nowak"); await join(KASIA, "Katarzyna Wójcik");

// 1. the owner gives a phone ride to Marek, Marek says no -> back to the owner; the owner doesn't react, Kasia starts her shift -> the timer sends it to her
await tap(MAREK, "car|f_sgl1a234"); await loc(MAREK, 50.2215, 18.68);
await msg(OWNER, "/kurs Rynek 1 Przykładowo > Dworzec Gliwice, 600100701");
const draft = (await log()).filter((x) => String(x.chat_id) === String(OWNER) && x.reply_markup?.inline_keyboard).pop();
const id1 = draft.reply_markup.inline_keyboard.flat().find((b) => /^dpo\|/.test(b.callback_data)).callback_data.split("|")[1];
await tap(OWNER, `dpa|${id1}|f_k1`); await tap(MAREK, "x|" + id1);
ok((await texts(OWNER)).some((t) => /odrzucił/.test(t)), "Marek says no -> the ride is back with the owner");
await tap(KASIA, "car|f_sgl2b567"); await loc(KASIA, 50.24, 18.68);
await pause(); await reset(); let c = await cron();
ok(c.auto && c.auto.now === 1, "timer: auto.now = 1", JSON.stringify(c.auto));
ok((await texts(KASIA)).some((t) => /KURS TERAZ/.test(t)), "Kasia (now free) gets the ride");
ok((await texts(OWNER)).some((t) => /🤖 <b>Kurs czekał \d+ min<\/b> – wysłałem go do: <b>Katarzyna Wójcik<\/b>/.test(t)), "the owner is told: 'Kurs czekał … wysłałem go do: Katarzyna'");
await reset(); c = await cron();
ok(!(await texts(KASIA)).some((t) => /KURS TERAZ/.test(t)) && c.auto.now === 0, "next minute: not sent again");
await tap(KASIA, "e|" + id1);
ok((await texts(OWNER)).some((t) => /Kurs przyjął: <b>Katarzyna/.test(t)), "Kasia accepts -> the owner sees it");

// 2. a website reservation with a flight, the owner doesn't assign it -> the ⭐ driver for that time (Marek, near the airport)
await loc(MAREK, 50.45, 19.05);   // Marek now waits near the airport
const t = nowWarsaw(240), when = t.slice(0, 15) + (+t[15] < 5 ? "0" : "5");                // pickup in ~4 h (5-minute step)
const land = new Date(when + ":00Z"); land.setUTCMinutes(land.getUTCMinutes() - 20);
const sched = land.toISOString().slice(0, 16).replace("T", " "); land.setUTCMinutes(land.getUTCMinutes() + 45);
const rev = land.toISOString().slice(0, 16).replace("T", " ");
await fetch(G + "/_flight", { method: "POST", body: JSON.stringify({ number: "FR1234", sched, rev, status: "Delayed" }) });
await reset();
const r2 = await book({ mode: "later", when, pickup: KTW, dest: RYNEK, phone: "600100702", flight: "FR1234" });
ok(!!r2.id && (await texts(OWNER)).some((t) => /REZERWACJA/.test(t)), "reservation goes to the owner", r2.error || "");
await pause(); await reset(); c = await cron();
ok(c.auto && c.auto.reservations === 1, "timer: auto.reservations = 1", JSON.stringify(c.auto));
ok((await texts(MAREK)).some((t) => /przydzielona automatycznie/.test(t)), "Marek: 'Dostajesz rezerwację … (przydzielona automatycznie)'");
ok((await texts(OWNER)).some((t) => /🤖 <b>Przydzieliłem za Ciebie<\/b>[\s\S]*Marek Nowak/.test(t)), "the owner: '🤖 Przydzieliłem za Ciebie … Marek Nowak'");

// 3. the flight lands 45 min later -> the pickup moves, driver and the owner are told, the customer's page shows it
const s2 = await status(r2), want = new Date(rev.replace(" ", "T") + ":00Z"); want.setUTCMinutes(want.getUTCMinutes() + 20);
want.setUTCMinutes(Math.ceil(want.getUTCMinutes() / 5) * 5);
ok(s2.status === "scheduled" && s2.when === want.toISOString().slice(0, 16), "pickup moved to landing + 20 min", `${when} -> ${s2.when}`);
ok(c.flights && c.flights.moved === 1, "timer: flights.moved = 1", JSON.stringify(c.flights));
ok((await texts(MAREK)).some((t) => /FR1234 ląduje później/.test(t)) && (await texts(OWNER)).some((t) => /FR1234 ląduje później/.test(t)), "Marek and the owner: '✈️ FR1234 ląduje później – nowy odbiór …'");
await reset(); c = await cron();
ok(c.flights.checked === 0 && !(await texts(OWNER)).some((t) => /ląduje/.test(t)), "next minute: not checked / not repeated");
console.log(fails ? fails + " FAILED" : "ALL PASS");
