// Customer ↔ taxi chat, end to end: status page API -> Telegram (Adam, then the assigned driver) -> replies and quick
// buttons -> status lines -> closed after the ride. A reservation, so it runs at any hour.
// Needs fake Telegram :8999, fake Google :8998, wrangler with the fleet sync ON and CHAT_CLOSE_MIN=0.05 – see README.
import { nowWarsaw } from "../../server/util.js";
const S = "http://localhost:8788", TG = "http://127.0.0.1:8999";
let uid = 1, fails = 0;
const ok = (c, m, x = "") => { console.log((c ? "✔ " : "✘ ") + m + (x ? " | " + x : "")); if (!c) fails++; };
const hook = (u) => fetch(S + "/api/telegram", { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hooksecret" }, body: JSON.stringify({ update_id: uid++, ...u }) });
const msg = (chat, text, extra = {}) => hook({ message: { message_id: 9000 + uid, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat }, text, ...extra } });
const tap = (chat, data, message_id = 1) => hook({ callback_query: { id: "q" + uid, from: { id: chat }, data, message: { message_id, chat: { id: chat } } } });
const loc = (chat, lat, lng) => hook({ message: { message_id: 77, date: Math.floor(Date.now() / 1000), chat: { id: chat }, location: { latitude: lat, longitude: lng, live_period: 28800 } } });
const log = () => fetch(TG + "/_log").then((r) => r.json());
const reset = () => fetch(TG + "/_reset");
const sentTo = async (chat) => (await log()).filter((x) => x.method === "sendMessage" && String(x.chat_id) === String(chat));
const alerts = async () => (await log()).filter((x) => x.method === "answerCallbackQuery").map((x) => x.text || "");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const OWNER = 999, MAREK = 4101, KASIA = 4102;

const setup = await fetch(S + "/api/admin/setup?key=adminkey").then((r) => r.json());
const join = async (chat, name) => msg(chat, "/start " + setup.fleet.invites.find((i) => i.name === name).link.split("start=")[1]);
await join(MAREK, "Marek Nowak"); await join(KASIA, "Katarzyna Wójcik");
await tap(MAREK, "car|f_sgl1a234"); await loc(MAREK, 50.2215, 18.68);

// a reservation in ~2 hours, booked on the website
const t = nowWarsaw(130), when = t.slice(0, 15) + (+t[15] < 5 ? "0" : "5");
const r = await fetch(S + "/api/rides", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "10.3.3.3" },
  body: JSON.stringify({ mode: "later", when, pickup: { address: "Rynek 1, 44-190 Knurów", lat: 50.2197, lng: 18.6767 },
    dest: { address: "Dworzec PKP Gliwice", lat: 50.3008, lng: 18.6635 }, phone: "600100900", name: "Ewa", pax: 1, website: "" }) }).then((x) => x.json());
ok(!!r.id && !!r.token, "reservation booked", r.error || "");
const get = (after = 0, token = r.token) => fetch(`${S}/api/rides/${r.id}/messages?after=${after}`, { headers: { "X-Ride-Token": token } }).then(async (x) => ({ status: x.status, ...(await x.json()) }));
const post = (text, token = r.token) => fetch(`${S}/api/rides/${r.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, text }) })
  .then(async (x) => ({ status: x.status, ...(await x.json()) }));

let g = await get();
ok(g.status === 200 && g.open === true && g.messages.length === 0, "GET: chat open, no messages yet");
ok((await get(0, "x".repeat(24))).status === 404 && (await post("hej", "x".repeat(24))).status === 404, "wrong token -> 404 (the ride stays private)");
ok((await post("")).status === 400 && (await post("x".repeat(501))).error === "long", "empty -> 400, 501 characters -> 'long'");

// 1. no driver yet -> Adam gets it, formatted, with quick replies; he answers by replying
await reset();
let p = await post("Jestem przed budynkiem");
let m = (await sentTo(OWNER)).pop() || {};
const qb = (m.reply_markup?.inline_keyboard || []).flat();
ok(p.ok && /^💬 <b>Klient<\/b> · kurs #[a-z0-9]{6} · Rynek 1\n\nJestem przed budynkiem/.test(m.text || ""), "no driver -> Adam's chat: '💬 Klient · kurs #… · Rynek 1' + the text", (m.text || "").split("\n")[0]);
ok(/Odpowiedz na tę wiadomość/.test(m.text || "") && qb.map((b) => b.text).join("|") === "Jadę|Będę za 5 min|Jestem na miejscu|Proszę wyjść przed budynek",
   "hint + 4 quick replies under it", qb.map((b) => b.text).join(" | "));
await msg(OWNER, "Dzień dobry, zaraz przydzielę kierowcę", { reply_to_message: { message_id: m._mid } });
g = await get();
const last = (x) => x.messages[x.messages.length - 1] || {};
ok(last(g).from === "taxi" && last(g).who === "Taxi Adam" && last(g).text === "Dzień dobry, zaraz przydzielę kierowcę", "Adam replies -> customer sees it signed 'Taxi Adam'");
ok((await log()).some((x) => x.method === "setMessageReaction"), "Adam's reply gets a quiet 👍 instead of another message");

// 2. Adam gives the reservation to Marek -> status line; Marek gets what the customer said before; new messages go to Marek
const offer = (await log()).filter((x) => String(x.chat_id) === String(OWNER) && x.reply_markup?.inline_keyboard?.flat().some((b) => b.callback_data === `g|${r.id}|f_k1`)).pop();
await reset(); await tap(OWNER, `g|${r.id}|f_k1`, offer && offer._mid);
g = await get();
ok(g.messages.some((x) => x.from === "system" && /^Rezerwacja potwierdzona – kierowca przyjedzie/.test(x.text)), "assigned -> system line 'Rezerwacja potwierdzona…'");
ok((await sentTo(MAREK)).some((x) => /Klient pisał wcześniej:\n• Jestem przed budynkiem/.test(x.text || "")), "Marek gets the earlier customer message");
await reset(); p = await post("Mam dużo bagażu");
const toMarek = (await sentTo(MAREK)).pop() || {};
ok(/Mam dużo bagażu/.test(toMarek.text || "") && !(await sentTo(OWNER)).some((x) => /Mam dużo bagażu/.test(x.text || "")), "driver assigned -> the next message goes to Marek, not Adam");

// 3. Marek: a quick reply button and a typed reply; Kasia can't answer someone else's ride
await reset(); await tap(MAREK, `cm|${r.id}|0`, toMarek._mid);
ok((await alerts()).some((a) => /Wysłano do klienta: Jadę/.test(a)), "Marek taps 'Jadę' -> toast 'Wysłano do klienta: Jadę'");
await msg(MAREK, "Będę 5 minut wcześniej", { reply_to_message: { message_id: toMarek._mid } });
g = await get();
ok(g.messages.slice(-2).map((x) => `${x.who}:${x.text}`).join("|") === "Kierowca:Jadę|Kierowca:Będę 5 minut wcześniej", "customer sees both, signed 'Kierowca'");
await reset(); await tap(KASIA, `cm|${r.id}|1`, toMarek._mid);
ok((await alerts()).some((a) => /To nie Twój kurs/.test(a)), "Kasia's tap on Marek's ride -> 'To nie Twój kurs'");

// 4. the ride: status lines in the chat
for (const a of ["e", "a", "t", "d"]) { await tap(MAREK, `${a}|${r.id}`); await pause(200); }
g = await get();
const sys = g.messages.filter((x) => x.from === "system").map((x) => x.text);
ok(sys.some((s) => /^Kierowca przyjął kurs – będzie ok\. \d\d:\d\d$/.test(s)) && sys.includes("Kierowca jest na miejscu") && sys.includes("Kurs zakończony – dziękujemy!"),
   "status lines: przyjął (HH:MM) / na miejscu / zakończony", sys.join(" · "));
ok(new Set(sys).size === sys.length, "each status line only once");
const since = g.messages[g.messages.length - 1].id;
ok((await get(since)).messages.length === 0, "GET ?after=<last id> -> only new messages (none)");

// 5. privacy: nothing the customer gets carries a phone number or Telegram id
const all = (await get()).messages;
ok(all.every((x) => Object.keys(x).sort().join() === "at,from,id,text,who" && !/600100900|4101|999/.test(x.text + x.who)),
   "customer gets only id/from/who/text/at – no phone number, chat id or Telegram field");

// 6. rate limit: 10 a minute per ride
const burst = [];
for (let i = 0; i < 9; i++) burst.push((await post("test " + i)).status);
ok(burst.slice(0, 8).every((s) => s === 200) && burst[8] === 429, "11th message within a minute -> 429", burst.join(","));

// 7. 2 hours after the end (CHAT_CLOSE_MIN=0.05 here = 3 s): closed for both sides
await pause(3500);
p = await post("Zostawiłam parasol");
g = await get();
ok(p.status === 403 && p.error === "closed" && g.open === false, "after the window: POST -> 403 'closed', GET open:false (history still readable)");
await reset(); await msg(MAREK, "Proszę zadzwonić do biura", { reply_to_message: { message_id: toMarek._mid } });
ok((await sentTo(MAREK)).some((x) => /Czat tego kursu jest już zamknięty/.test(x.text || "")), "a late Telegram reply -> 'Czat tego kursu jest już zamknięty'");
console.log(fails ? fails + " FAILED" : "ALL PASS");
