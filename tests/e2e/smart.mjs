// "➕ Nowy kurs" in plain words (AI) + smart "Kto jedzie?" + the "🗂 Kursy w toku" board, end to end.
// Needs: fake Telegram :8999, fake Google :8998, fake Claude API :8997 (fake-anthropic.mjs), and wrangler with the fleet sync ON
// plus ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:8997 – see README.
const S = "http://localhost:8788", TG = "http://127.0.0.1:8999", AI = "http://127.0.0.1:8997";
let uid = 1, fails = 0;
const ok = (c, m, x = "") => { console.log((c ? "✔ " : "✘ ") + m + (x ? " | " + x : "")); if (!c) fails++; };
const hook = (u) => fetch(S + "/api/telegram", { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "hooksecret" }, body: JSON.stringify({ update_id: uid++, ...u }) });
const msg = (chat, text, extra = {}) => hook({ message: { message_id: uid * 10, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat }, text, ...extra } });
const tap = (chat, data, message_id = 1) => hook({ callback_query: { id: "q" + uid, from: { id: chat }, data, message: { message_id, chat: { id: chat } } } });
const loc = (chat, lat, lng) => hook({ message: { message_id: 77, date: Math.floor(Date.now() / 1000), chat: { id: chat }, location: { latitude: lat, longitude: lng, live_period: 28800 } } });
const log = () => fetch(TG + "/_log").then((r) => r.json());
const reset = () => Promise.all([fetch(TG + "/_reset"), fetch(AI + "/_reset")]);
const sentTo = async (chat, method = "sendMessage") => (await log()).filter((x) => x.method === method && String(x.chat_id) === String(chat));
const last = async (chat) => (await sentTo(chat)).pop() || {};
const inl = (m) => (m?.reply_markup?.inline_keyboard || []).flat();
const OWNER = 999, MAREK = 4101, KASIA = 4102;

const setup = await fetch(S + "/api/admin/setup?key=adminkey").then((r) => r.json());
const join = async (chat, name) => msg(chat, "/start " + setup.fleet.invites.find((i) => i.name === name).link.split("start=")[1]);
await join(MAREK, "Marek Nowak"); await join(KASIA, "Katarzyna Wójcik");
// Marek right by the Rynek, Kasia 4 km away
await tap(MAREK, "car|f_sgl1a234"); await loc(MAREK, 50.2215, 18.68);
await tap(KASIA, "car|f_sgl2b567"); await loc(KASIA, 50.255, 18.68);

// 1. "➕ Nowy kurs" asks for the ride in plain words
await reset(); await msg(OWNER, "➕ Nowy kurs");
let m = await last(OWNER);
ok(/własnymi słowami/.test(m.text) && inl(m).some((b) => b.callback_data === "aw|x"), "'➕ Nowy kurs' -> 'napisz kurs własnymi słowami' + ✖️ Anuluj", (m.text || "").split("\n")[0]);

// 2. one sentence -> preview with the price + smart panel: Marek ⭐ (nearest by drive time), Kasia 🟢
await reset(); await msg(OWNER, "pani Ewa z Rynku do dworca w Gliwicach, 600 100 200");
m = await last(OWNER);
const req = (await fetch(AI + "/_log").then((r) => r.json()))[0];
ok(req && req.body.model === "claude-opus-5-5" && req.body.output_config?.effort === "low" && req.body.output_config?.format?.type === "json_schema"
   && req.body.fallbacks === "default" && /server-side-fallback-2026-07-01/.test(req.beta) && req.key === "test",
   "Claude call: claude-opus-5-5, low effort, JSON schema, fallbacks default", req && JSON.stringify({ model: req.body.model, beta: req.beta }));
ok(/KURS TERAZ/.test(m.text) && /🗣 <i>„pani Ewa z Rynku/.test(m.text) && /Rynek 1, 44-190 Knurów/.test(m.text) && /Dworzec PKP, Gliwice/.test(m.text) && /pani Ewa   ☎️ 600100200/i.test(m.text),
   "understood -> preview: addresses found, name, what he said", (m.text || "").split("\n").slice(0, 6).join(" / "));
ok(/⭐ <b>Marek<\/b>[^\n]*~\d+ min[\s\S]*🟢 Katarzyna[^\n]*~\d+ min/.test(m.text), "panel: ⭐ Marek (fastest) then 🟢 Katarzyna, each with drive time",
   (m.text || "").split("\n").filter((l) => /⭐|🟢|🧠/.test(l)).join(" / "));
ok(/^⭐ Daj: Marek/.test(inl(m)[0]?.text || "") && inl(m).some((b) => /^dps\|/.test(b.callback_data)) && inl(m).some((b) => /^dpo\|/.test(b.callback_data)),
   "first button '⭐ Daj: Marek', then the others, 📨 and 🙋", inl(m).map((b) => b.text).join(" | "));
const id1 = inl(m).find((b) => /^dpo\|/.test(b.callback_data)).callback_data.split("|")[1];

// 3. Kasia takes it and drives -> in a new panel she is 'w kursie, wolny ok. HH:MM'
await tap(OWNER, `dpa|${id1}|f_k2`); await tap(KASIA, "e|" + id1); await tap(KASIA, "a|" + id1); await tap(KASIA, "t|" + id1);
await reset(); await msg(OWNER, "/kurs Rynek 1 Knurów > Dworzec Gliwice, 600100201");
m = await last(OWNER);
ok(/🚕 Katarzyna · w kursie, wolny ok\. \d\d:\d\d → u klienta ok\. \d\d:\d\d/.test(m.text), "busy driver: 'w kursie, wolny ok. HH:MM → u klienta ok. HH:MM'",
   (m.text || "").split("\n").find((l) => /🚕 Katarzyna/.test(l)));
const id2 = inl(m).find((b) => /^del\|/.test(b.callback_data)).callback_data.split("|")[1];
await tap(OWNER, "del|" + id2, (await last(OWNER)).message_id);

// 4. something missing -> the bot asks only for that; the next message completes it (a reservation)
await reset(); await msg(OWNER, "➕ Nowy kurs"); await msg(OWNER, "jutro 14:30 z Rynku na Pyrzowice, 3 osoby, walizki");
m = await last(OWNER);
ok(/Zrozumiałem[\s\S]*Brakuje: <b>numer telefonu klienta<\/b>/.test(m.text), "no phone -> 'Brakuje: numer telefonu klienta'", (m.text || "").replace(/\n/g, " / "));
await reset(); await msg(OWNER, "600 300 400");
m = await last(OWNER);
ok(/REZERWACJA:/.test(m.text) && /14:30/.test(m.text) && /3 os\./.test(m.text) && /Kto może pojechać o tej porze/.test(m.text), "next message completes it -> reservation preview + who can drive then",
   (m.text || "").split("\n")[0]);
ok(inl(m).some((b) => /^⭐ Przydziel:/.test(b.text)), "reservation: ⭐ Przydziel for the best free driver", inl(m).map((b) => b.text).join(" | "));
const prevMsg = m._mid;

// 5. reply to the preview with a correction -> new preview with the new time, old one deleted
await reset(); await msg(OWNER, "o 15:30", { reply_to_message: { message_id: prevMsg } });
m = await last(OWNER);
ok(/REZERWACJA:[^\n]*15:30/.test(m.text) && (await sentTo(OWNER, "deleteMessage")).some((x) => x.message_id === prevMsg), "reply 'o 15:30' -> corrected preview, old one deleted",
   (m.text || "").split("\n")[0]);
const resv = inl(m).find((b) => /^dpa\|/.test(b.callback_data) && /Marek/.test(b.text));
await tap(OWNER, resv.callback_data);

// 6. small talk is not a ride; the AI being down falls back to the one-line format
await reset(); await msg(OWNER, "co tam u ciebie słychać dzisiaj");
ok(/Nie rozumiem/.test((await last(OWNER)).text || ""), "small talk -> 'Nie rozumiem' (no ride made)");
await reset(); await msg(OWNER, "/kurs AWARIA Rynek 1 Knurów > Dworzec Gliwice, 600100202");
m = await last(OWNER);
ok(/KURS TERAZ/.test(m.text) && /Wpisałeś/.test(m.text), "Claude API down -> the one-line format still works", (m.text || "").split("\n")[0]);
await tap(OWNER, "del|" + inl(m).find((b) => /^del\|/.test(b.callback_data)).callback_data.split("|")[1], m._mid);

// 7. the board: grouped, legend, refresh; the old button name still works and the menu is renamed
await fetch(S + "/api/rides", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "10.1.1.7" },
  body: JSON.stringify({ mode: "now", pickup: { address: "Rynek 1, Knurów", lat: 50.2197, lng: 18.6767 }, dest: { address: "Dworzec PKP Gliwice", lat: 50.3008, lng: 18.6635 }, phone: "600100300", name: "Jan", pax: 1 }) });
await reset(); await msg(OWNER, "🗂 Kursy w toku");
m = await last(OWNER);
ok(/Kursy w toku/.test(m.text) && /Kierowcy: 🟢 wolni \d · 🚕 w kursie 1/.test(m.text), "board header: drivers free / on a ride / off duty", (m.text || "").split("\n").slice(0, 2).join(" / "));
ok(/❗ <b>Czeka na kierowcę<\/b> \(1\)[\s\S]*wysłano do: Marek/.test(m.text) && inl(m).some((b) => /^👥 Kto jedzie\?/.test(b.text) && /^dpl\|/.test(b.callback_data)),
   "board: the website ride waits (sent to Marek) + '👥 Kto jedzie?'", (m.text || "").split("\n").filter((l) => /⏳|wysłano/.test(l)).join(" / "));
ok(/🚕 <b>W trakcie<\/b> \(1\)[\s\S]*🛣 Katarzyna wiezie klienta · wolny ok\. \d\d:\d\d/.test(m.text), "board: Kasia 'wiezie klienta · wolny ok. HH:MM'");
ok(/📅 <b>Rezerwacje<\/b> \(1\)[\s\S]*15:30[^\n]*👤 Marek/.test(m.text) && /<i>⏳ czeka na kierowcę/.test(m.text), "board: reservation with its driver + legend");
await reset(); await tap(OWNER, "brd|-", 4242);
ok((await sentTo(OWNER, "editMessageText")).some((x) => x.message_id === 4242 && /Kursy w toku/.test(x.text)), "🔄 Odśwież redraws the same message");
await reset(); await msg(OWNER, "📋 Kursy teraz");
const two = await sentTo(OWNER);
ok(/Kursy w toku/.test(two[0]?.text || "") && /nazywa się teraz/.test(two[1]?.text || "") && two[1]?.reply_markup?.keyboard?.flat().some((b) => b.text === "🗂 Kursy w toku"),
   "old '📋 Kursy teraz' button -> the board + the renamed menu");

// 8. a voice message without speech-to-text set up -> a clear answer
await reset(); await hook({ message: { message_id: 991, date: Math.floor(Date.now() / 1000), chat: { id: OWNER }, from: { id: OWNER }, voice: { file_id: "v1", duration: 5 } } });
ok(/Głosówki nie są jeszcze włączone/.test((await last(OWNER)).text || ""), "voice without Workers AI -> 'Głosówki nie są jeszcze włączone'");

console.log(fails ? fails + " FAILED" : "ALL PASS");
