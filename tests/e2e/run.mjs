import { OWNER, BRAND } from "../../server/brand.js";
const S = "http://localhost:8788", TG = "http://127.0.0.1:8999";
let uid = 1, fails = 0;
const ok = (c, m) => { console.log((c ? "✔ " : "✘ ") + m); if (!c) fails++; };
const hook = (u) => fetch(S + "/api/telegram", { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hooksecret" }, body: JSON.stringify({ update_id: uid++, ...u }) }).then((r) => r.json());
const msg = (chat, text, extra = {}) => hook({ message: { message_id: uid * 10, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat }, text, ...extra } });
const tap = (chat, data, message_id = 1) => hook({ callback_query: { id: "q" + uid, from: { id: chat }, data, message: { message_id, chat: { id: chat } } } });
const loc = (chat, lat, lng, edited = false, live = 28800) => hook({ [edited ? "edited_message" : "message"]: { message_id: 77, date: Math.floor(Date.now() / 1000), chat: { id: chat }, location: { latitude: lat, longitude: lng, ...(live ? { live_period: live } : {}) } } });
const log = () => fetch(TG + "/_log").then((r) => r.json());
const reset = () => fetch(TG + "/_reset");
const texts = async (chat) => (await log()).filter((x) => String(x.chat_id) === String(chat)).map((x) => x.text || x.raw || "");
const last = async (chat, method = "sendMessage") => (await log()).filter((x) => x.method === method && String(x.chat_id) === String(chat)).pop();
const buttons = (m) => (m?.reply_markup?.inline_keyboard || []).flat();

const setup = await fetch(S + "/api/admin/setup?key=adminkey").then((r) => r.json());
ok(setup.DB === true && setup.photos === true, "setup: DB + photos " + JSON.stringify({ db: setup.DB, photos: setup.photos, ready: setup.ready }));
const menus = (await log()).filter((x) => x.method === "setMyCommands");
ok(menus.length === 2 && menus[1].scope?.chat_id === 999, "two command menus (drivers + the owner's chat)");

await reset();
await msg(999, "/dodajauto Toyota Corolla; biała; SGL 1A234; 4");
await msg(999, "/dodajauto Skoda Octavia; czarna; SGL 2B567; 4");
await msg(999, "/dodajauto Kia Ceed; srebrna; SGL 4D123; 4");
await msg(999, "/serwis 3 wymiana klocków");
let t = (await texts(999)).join("\n");
ok(/Dodano auto nr 1/.test(t) && /Dodano auto nr 2/.test(t) && /w serwisie: wymiana klocków/.test(t), "the owner adds cars, sends one to service");
await msg(999, "/dodajauto Fiat; ; X; 4");
ok(/Napisz: <code>\/dodajauto/.test((await last(999)).text), "bad /dodajauto -> usage hint");

// two drivers join
for (const [name, chat] of [["Marek", 111], ["Kasia", 222]]) {
  await reset(); await msg(999, `/dodaj ${name} 600100${chat}`);
  const link = (await texts(999)).join(" ").match(/start=d_([a-z0-9]{10})/)[1];
  await msg(chat, `/start d_${link}`);
  ok(/Witaj w zespole/.test((await last(chat)).text), `${name} joined`);
}
await msg(999, "/prowizja 3 dzienna 120");
ok(/Kasia: opłata za auto 120,00 zł\/dzień/.test((await last(999)).text), "/prowizja: Kasia daily fee");

// shift start -> car picker
await reset();
await loc(111, 50.2197, 18.6767);
let pick = await last(111);
ok(/Którym autem dziś jeździsz/.test(pick.text) && buttons(pick).length === 2, "Marek goes live -> picker with 2 free cars (service car not offered)");
ok(/🔧 Kia Ceed · SGL 4D123 – w serwisie/.test(pick.text), "service car shown as info line");
const corolla = buttons(pick).find((b) => /Corolla/.test(b.text)).callback_data;
await loc(222, 50.23, 18.69);
// both tap the Corolla at the same time
await reset();
await Promise.all([tap(111, corolla, 5), tap(222, corolla, 6)]);
const answers = (await log()).filter((x) => x.method === "answerCallbackQuery").map((x) => x.text);
ok(answers.filter((a) => /Jeździsz/.test(a)).length === 1 && answers.filter((a) => /właśnie wziął/.test(a)).length === 1, "same car tapped twice at once -> exactly one gets it: " + JSON.stringify(answers));
await msg(111, "/auto"); await msg(222, "/auto");
const m1 = (await last(111)).text, m2 = (await last(222)).text;
const marekHas = /Twoje auto:<\/b> Toyota Corolla/.test(m1), kasiaHas = /Twoje auto:<\/b> Toyota Corolla/.test(m2);
ok(marekHas !== kasiaHas, "exactly one of them holds the Corolla");
const loser = marekHas ? 222 : 111;
const loserPick = await last(loser);
const octavia = buttons(loserPick).find((b) => /Octavia/.test(b.text));
ok(!!octavia && !buttons(loserPick).some((b) => /Corolla/.test(b.text)), "the other one sees only the Octavia");
await tap(loser, octavia.callback_data, 7);

// customer booking near Marek
await reset();
const book = await fetch(S + "/api/rides", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
  mode: "now", pickup: { address: "Rynek 1, Przykładowo", lat: 50.2199, lng: 18.677 }, dest: { address: "Dworzec, Gliwice", lat: 50.3, lng: 18.67 }, phone: "600 700 800", name: "Ewa", pax: 2 }) });
const b = await book.json();
ok(book.status === 201 && b.id, "customer booked a ride " + book.status + " " + JSON.stringify(b).slice(0, 80));
const offer = (await log()).find((x) => x.method === "sendMessage" && /KURS TERAZ/.test(x.text || ""));
ok(offer && String(offer.chat_id) === "111", "offered to the nearest driver with a car (Marek) -> chat " + offer?.chat_id);
const accept = buttons(offer).find((x) => x.callback_data?.startsWith("e|")).callback_data;
await tap(111, accept, offer ? 1001 : 1);
let view = await fetch(`${S}/api/rides/${b.id}`, { headers: { "X-Ride-Token": b.token } }).then((r) => r.json());
const mCar = marekHas ? "Toyota Corolla" : "Skoda Octavia";
ok(view.status === "enroute" && view.driver?.name === "Marek" && view.vehicle?.model === mCar, "customer sees driver + car: " + JSON.stringify({ s: view.status, d: view.driver, v: view.vehicle }));
// switching car during the ride is refused
await reset(); await tap(111, "carrel|-", 9);
ok(/Najpierw zakończ kurs/.test((await log()).find((x) => x.method === "answerCallbackQuery")?.text || ""), "can't release the car during a ride");

// photo with consent
await reset(); await msg(111, "/zdjecie");
ok(buttons(await last(111)).some((x) => x.callback_data === "ph|prof"), "/zdjecie offers profile photo");
await tap(111, "ph|prof", 11);
await reset(); await tap(111, `a|${b.id}`, 12);    // arrived (also refreshes nothing in the snapshot)
view = await fetch(`${S}/api/rides/${b.id}`, { headers: { "X-Ride-Token": b.token } }).then((r) => r.json());
ok(view.status === "arrived", "arrived");
// photo flag is in the snapshot only for rides accepted after consent: book + accept another ride later; here check endpoint protection
const bad = await fetch(`${S}/api/photo/d/${b.id}?t=${"0".repeat(32)}`);
ok(bad.status === 404, "photo with a wrong signature -> 404");
// cancel by customer vs driver tap: customer cancels, then the driver's stale tap must not revive it
await tap(111, `t|${b.id}`, 13);
await tap(111, `d|${b.id}`, 14);
view = await fetch(`${S}/api/rides/${b.id}`, { headers: { "X-Ride-Token": b.token } }).then((r) => r.json());
ok(view.status === "done", "ride done");
await reset(); await tap(111, `pay|${b.id}|g`, 15);
// second ride: photo should appear now
const b2 = await fetch(S + "/api/rides", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
  mode: "now", pickup: { address: "Rynek 1, Przykładowo", lat: 50.2199, lng: 18.677 }, dest: { address: "Szpital, Zabrze", lat: 50.3, lng: 18.78 }, phone: "600 700 801", pax: 1 }) }).then((r) => r.json());
const off2 = (await log()).filter((x) => x.method === "sendMessage" && /KURS TERAZ/.test(x.text || "")).pop();
await tap(Number(off2.chat_id), buttons(off2).find((x) => x.callback_data?.startsWith("e|")).callback_data, 20);
const v2 = await fetch(`${S}/api/rides/${b2.id}`, { headers: { "X-Ride-Token": b2.token } }).then((r) => r.json());
ok(String(off2.chat_id) !== "111" || /^\/api\/photo\/d\/[a-z0-9]{12}\?t=[a-f0-9]{32}$/.test(v2.driver?.photo || ""), "driver photo URL on the status page: " + v2.driver?.photo);
if (v2.driver?.photo) { const ph = await fetch(S + v2.driver.photo); ok(ph.status === 200 && ph.headers.get("content-type") === "image/jpeg" && /private/.test(ph.headers.get("cache-control")), "signed photo link serves the image (private cache)"); }
// customer cancels; a stale driver tap afterwards is refused
await fetch(`${S}/api/rides/${b2.id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: b2.token }) });
await reset(); await tap(Number(off2.chat_id), `a|${b2.id}`, 21);
const v3 = await fetch(`${S}/api/rides/${b2.id}`, { headers: { "X-Ride-Token": b2.token } }).then((r) => r.json());
ok(v3.status === "cancelled", "cancelled ride is not revived by a later driver tap (" + (await log()).find((x) => x.method === "answerCallbackQuery")?.text + ")");

// duplicate update_id is ignored
const dup = { update_id: 99999, message: { message_id: 1, date: 1, chat: { id: 999 }, text: "/auta" } };
const h = { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hooksecret" };
await reset();
const r1 = await fetch(S + "/api/telegram", { method: "POST", headers: h, body: JSON.stringify(dup) }).then((r) => r.json());
const r2 = await fetch(S + "/api/telegram", { method: "POST", headers: h, body: JSON.stringify(dup) }).then((r) => r.json());
ok(!r1.duplicate && r2.duplicate && (await log()).filter((x) => x.method === "sendMessage").length === 1, "duplicate Telegram update handled once");
ok(/🔒 jeździ/.test((await last(999)).text), "/auta shows who drives which car");
const badSecret = await fetch(S + "/api/telegram", { method: "POST", headers: { ...h, "X-Telegram-Bot-Api-Secret-Token": "nope" }, body: "{}" });
ok(badSecret.status === 403, "wrong webhook secret -> 403");

// reports
await reset(); await msg(999, "/raport");
t = (await texts(999)).join("\n");
ok(/RAPORT – CAŁA FIRMA/.test(t) && /Rozliczenie kierowców/.test(t) && /🚗 <b>Auta<\/b>/.test(t) && new RegExp(mCar).test(t), "owner /raport: settlement + cars");
console.log("\n--- owner /raport ---\n" + (await texts(999)).filter((x) => /RAPORT/.test(x))[0]);
await reset(); await msg(111, "/raport");
t = (await texts(111)).join("\n");
ok(/TWÓJ RAPORT – Marek/.test(t) && /Twój udział \(50%\)/.test(t) && new RegExp(`Firma dopłaca Ci|Do oddania ${OWNER.dat}`).test(t), "driver /raport: share + hand-in");
console.log("\n--- Marek /raport ---\n" + (await texts(111)).filter((x) => /RAPORT/.test(x))[0]);
await reset(); await msg(111, "/ja");
ok(/Auto: <b>/.test((await last(111)).text) && /Zdjęcie dla klienta: ✅/.test((await last(111)).text), "/ja shows car + photo");
// end of shift
await reset(); await loc(111, 50.2197, 18.6767, true, 0);
ok(/Koniec zmiany/.test((await last(111))?.text || ""), "live location stopped -> ask to release the car");
await tap(111, "carrel|-", 30);
ok(/Oddałeś/.test((await log()).find((x) => x.method === "editMessageText")?.text || ""), "one tap releases the car");
const cron = await fetch(S + "/api/admin/cron", { method: "POST", headers: { "x-cron-key": "cronkey" } }).then((r) => r.json());
ok(cron && typeof cron.carsReleased === "number", "cron runs: " + JSON.stringify(cron));
console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
