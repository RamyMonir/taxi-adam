// GET /api/admin/setup?key=ADMIN_KEY – one-time setup check: connects the Telegram webhook
// to this site and reports which settings are still missing.
import { json, canonicalOrigin } from "../../../server/util.js";
import { db, tg, isLive } from "../../../server/rides.js";
import { listDrivers } from "../../../server/fleet.js";
import { ensureFleetSynced } from "../../../server/fleetsync.js";
import { reviews, autocomplete, reverseGeocode } from "../../../server/google.js";
import { lookupFlight } from "../../../server/flights.js";
import { CONFIG } from "../../../server/config.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) return new Response("forbidden", { status: 403 });

  const report = {
    TELEGRAM_BOT_TOKEN: !!env.TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: !!env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_CHAT_ID: !!env.TELEGRAM_CHAT_ID, GOOGLE_SERVER_KEY: !!env.GOOGLE_SERVER_KEY, GOOGLE_PLACE_ID: !!env.GOOGLE_PLACE_ID,
    DB: false,
  };
  try { await db(env); report.DB = true; } catch (e) { report.DB_error = String(e.message || e); }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET) {
    const site = canonicalOrigin(request, env);
    const before = await tg(env, "getWebhookInfo", {});
    report.webhook_before = before && before.ok ? before.result.url || "(none)" : null;
    if (before && before.ok && before.result.last_error_message) report.webhook_last_error = before.result.last_error_message;
    const hook = await tg(env, "setWebhook", {
      url: `${site}/api/telegram`, secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "edited_message", "callback_query"], drop_pending_updates: true,
    });
    report.webhook = hook && hook.ok ? `${site}/api/telegram` : hook;
    report.code_version = "2026-10-11 fleet-cars";
    report.photos = !!(env.PHOTOS && env.PHOTO_SECRET);
    // the "/" menu in Telegram
    const driverCmds = [
      { command: "auto", description: "Wybierz / zmień auto na zmianę" },
      { command: "oddaj", description: "Oddaj auto (koniec zmiany)" },
      { command: "ja", description: "Moje dane: auto, telefon, zdjęcie, rozliczenie" },
      { command: "kurs", description: "Dodaj kurs przyjęty przez telefon" },
      { command: "raport", description: "Raport i rozliczenie (np. /raport tydzień)" },
      { command: "zdjecie", description: "Moje zdjęcie dla klienta" },
      { command: "zmiana", description: "Czy jestem na zmianie? Jak zacząć zmianę" },
      { command: "pomoc", description: "Jak to działa – wszystko w jednym miejscu" },
      { command: "start", description: "Pokaż menu z przyciskami" },
    ];
    const cmds = await tg(env, "setMyCommands", { commands: driverCmds });
    // Adam's chat: + fleet and settlement commands
    if (env.TELEGRAM_CHAT_ID) await tg(env, "setMyCommands", { scope: { type: "chat", chat_id: Number(env.TELEGRAM_CHAT_ID) }, commands: [
      { command: "kurs", description: "Nowy kurs z telefonu – potem wybierasz, kto jedzie" },
      { command: "kursy", description: "Kursy teraz: kto jedzie, co czeka na kierowcę" },
      { command: "kierowcy", description: "Kierowcy: kto wolny, kto w kursie, usuń kierowcę" },
      ...driverCmds.slice(0, 5).filter((c) => c.command !== "kurs"),
      { command: "auta", description: "Auta: wolne, zajęte, w serwisie" },
      { command: "prowizja", description: "Rozliczenie kierowców: procent albo opłata dzienna" },
      { command: "dodaj", description: "Dodaj kierowcę: /dodaj Imię telefon" },
      { command: "dodajauto", description: "Dodaj auto: Marka Model; kolor; rejestracja; miejsca" },
      { command: "pomoc", description: "Jak to działa – wszystko w jednym miejscu" },
      { command: "start", description: "Pokaż menu z przyciskami" },
    ] });
    report.bot_menu = !!(cmds && cmds.ok);
    const me = await tg(env, "getMe", {});
    report.bot = me && me.ok ? "@" + me.result.username : null;
    if (env.TELEGRAM_CHAT_ID) {
      const t = await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: "✅ Test: strona połączona z botem. Nowe kursy będą przychodzić tutaj." });
      report.test_message = !!(t && t.ok);
    }
  }
  // fleet from src/fleet.py: cars + drivers, invite links for drivers who haven't joined yet
  try { report.fleet = await ensureFleetSynced(env, { force: true }); } catch (e) { report.fleet = "ERROR " + e.message; }
  // Google + flight checks: show Google's own error message when something isn't enabled
  const check = async (name, fn) => { try { report[name] = await fn(); } catch (e) { report[name] = "ERROR " + e.message; } };
  await check("google_reviews", async () => { const r = await reviews(env); return `${r.place}: ${r.rating}★, ${r.count} opinii, pobrano ${r.fetched}, pokazane ${r.reviews.length}`; });
  await check("google_autocomplete", async () => { const s = await autocomplete(env, "Dworcowa Knurów", "setupcheck123", CONFIG.base); return s.length ? "OK – " + s[0].main : "no results"; });
  await check("google_reverse_geocode", async () => { const r = await reverseGeocode(env, CONFIG.base.lat, CONFIG.base.lng); return r ? r.address + (r.near ? " (nearest place)" : "") : "no address"; });
  report.geocoding_api = reverseGeocode.lastStatus ? reverseGeocode.lastStatus + " – add Geocoding API to the server key for exact street addresses" : "OK";
  try {
    report.drivers = (await listDrivers(env)).map((pos) => `${pos.name || pos.id}${pos.owner ? " (właściciel)" : ""}: ` + (!pos.chat_id ? "nie dołączył jeszcze do bota"
      : pos.lat == null ? "brak lokalizacji"
      : `${isLive(pos) ? "NA ŻYWO" : "NIEAKTUALNA"}: ostatni punkt ${Math.round((Date.now() - pos.ts) / 60000)} min temu` +
        (pos.until ? `, udostępnianie do ${new Date(pos.until).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw" })}` : "")));
  } catch (e) { report.driver_location = "ERROR " + e.message; }
  report.AERODATABOX_KEY = !!env.AERODATABOX_KEY;
  if (env.AERODATABOX_KEY) await check("flight_lookup", async () => { const f = await lookupFlight(env, "FR3014", new Date().toISOString().slice(0, 10)); return f.error ? "ERROR " + f.error : f.found ? "OK" : "OK (test flight not found today)"; });
  report.ready = report.DB && report.TELEGRAM_BOT_TOKEN && report.TELEGRAM_CHAT_ID && report.TELEGRAM_WEBHOOK_SECRET && report.test_message === true;
  return json(report);
}
