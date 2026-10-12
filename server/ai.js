// "➕ Nowy kurs" in plain words: Adam types (or says, in a voice message) the ride the way he would tell a colleague –
// "pani Ewa z Rynku do dworca w Gliwicach za 20 minut, 600 100 200" – and Claude turns it into the ride fields.
// Optional: without ANTHROPIC_API_KEY the bot keeps the one-line format of server/phone.js.
// Voice messages need the Workers AI binding "AI" (speech to text with Whisper).
import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "./config.js";
import { nowWarsaw, whenLabel } from "./util.js";

export const aiOn = (env) => !!env.ANTHROPIC_API_KEY;
export const voiceOn = (env) => !!(env.AI && typeof env.AI.run === "function");

const FIELDS = ["is_ride", "pickup", "dest", "when", "phone", "name", "pax", "luggage", "flight", "notes"];
const SCHEMA = {
  type: "object", additionalProperties: false, required: FIELDS,
  properties: {
    is_ride: { type: "boolean", description: "false when the note is not a taxi order at all" },
    pickup: { type: "string", description: "pickup as a Google Maps search query, '' if not given" },
    dest: { type: "string", description: "destination as a Google Maps search query, '' if not given" },
    when: { type: "string", description: "'' = as soon as possible, otherwise local time YYYY-MM-DDTHH:MM" },
    phone: { type: "string", description: "customer's phone, digits only, '' if not given" },
    name: { type: "string" },
    pax: { type: "integer", description: "passengers, 1 if not said" },
    luggage: { type: "string" },
    flight: { type: "string", description: "flight number like FR1234, '' if none" },
    notes: { type: "string" },
  },
};

const WEEKDAY = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
function systemPrompt(now) {
  const [d] = now.split("T");
  const wd = WEEKDAY[new Date(d + "T12:00:00Z").getUTCDay()];
  const places = (CONFIG.destinations || []).map((x) => x.short + (x.code ? ` (lotnisko ${x.code})` : "")).join(", ");
  return [
    "You turn a taxi dispatcher's note into a ride order for Taxi Knurów (Adam Mączka), based in Knurów and Gierałtowice, Silesia, Poland.",
    "The note is Polish, informal, maybe with typos, or a speech-to-text transcript of a voice message (numbers may be spelled out or split).",
    `Now in Poland: ${now} (${wd}).`,
    "",
    "pickup / dest: a query Google Maps will find – street with number and town, or a named place and town.",
    "- Keep the street, number and place as the dispatcher said them; convert Polish case endings to the base form (\"z Rynku\" -> \"Rynek\", \"na dworzec w Gliwicach\" -> \"Dworzec PKP Gliwice\").",
    "- A street or local place with no town: add \"Knurów\" (the default town). Never invent a house number.",
    "- Well-known places get their full name, e.g. \"Lotnisko Katowice-Pyrzowice\", \"Dworzec PKP Katowice\".",
    `- Places we often drive to: ${places}.`,
    "when: '' for now / as soon as possible / no time given. \"za 20 minut\" -> now + 20 min rounded up to 5 minutes.",
    "  A clock time already past today means tomorrow. \"jutro\", \"pojutrze\", weekdays and dates relative to now.",
    "phone: the customer's number, digits only (9 digits for Polish numbers; keep a + country code if said).",
    "name: as said, with Pan/Pani when used. pax: number of passengers (1 if not said).",
    "luggage, flight: only if said. notes: anything else useful for the driver (child seat, wheelchair, wait time, return trip).",
    "If the dispatcher adds a correction (\"Poprawka:\"), it overrides the earlier note.",
    "Use '' for anything not said. Do not guess a phone number or address.",
  ].join("\n");
}

// -> {pickup, dest, when, phone, name, pax, notes, luggage, flight, isRide} or null when the AI is off / failed
export async function aiParse(env, text, now = nowWarsaw()) {
  if (!aiOn(env)) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 1, timeout: 25000 });
  try {
    const res = await client.beta.messages.create({
      model: env.AI_MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: systemPrompt(now),
      messages: [{ role: "user", content: String(text).slice(0, 2000) }],
    });
    if (res.stop_reason === "refusal") { console.log("ai refusal", JSON.stringify(res.stop_details)); return null; }
    const block = res.content.find((b) => b.type === "text");
    return block ? normalize(JSON.parse(block.text), now) : null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.log("ai api", e.status, e.message);
    else console.log("ai", e && e.message);
    return null;
  }
}

// trust nothing from the model blindly: formats, a time in the past, silly passenger counts
export function normalize(j, now = nowWarsaw()) {
  const s = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  let when = s(j.when, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when) || when <= now) when = "";
  const phone = s(j.phone, 20).replace(/[^\d+]/g, "");
  return {
    isRide: j.is_ride !== false, pickup: s(j.pickup), dest: s(j.dest), when: when || null,
    phone: phone.replace(/\D/g, "").length >= 9 ? phone : "", name: s(j.name, 60),
    pax: Math.min(8, Math.max(1, parseInt(j.pax, 10) || 1)), luggage: s(j.luggage, 60), flight: s(j.flight, 10).toUpperCase().replace(/[^A-Z0-9]/g, ""), notes: s(j.notes, 300),
  };
}

// what is still missing before the ride can be shown
export function missingOf(p) {
  const m = [];
  if (!p.pickup) m.push("skąd (adres odbioru)");
  if (!p.dest) m.push("dokąd");
  if (!p.phone) m.push("numer telefonu klienta");
  return m;
}

// "🧠 Zrozumiałem:" – what the bot got so far, before asking for the rest
export function understoodText(p, esc) {
  const L = [];
  if (p.pickup) L.push(`📍 ${esc(p.pickup)}`);
  if (p.dest) L.push(`🏁 ${esc(p.dest)}`);
  L.push(`🕒 ${p.when ? esc(whenLabel(p.when)) : "teraz"}`);
  if (p.name || p.phone) L.push(`👤 ${esc(p.name || "—")}${p.phone ? "   ☎️ " + esc(p.phone) : ""}`);
  if (p.pax > 1) L.push(`👥 ${p.pax} os.`);
  return L.join("\n");
}

// Telegram voice message -> text (Workers AI Whisper, Polish). null if not set up or it failed.
export async function transcribe(env, bytes) {
  if (!voiceOn(env)) return null;
  try {
    let bin = "";
    const u8 = new Uint8Array(bytes);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: btoa(bin), language: "pl" });
    const t = out && out.text;
    return t && String(t).trim() ? String(t).trim() : null;
  } catch (e) { console.log("whisper", e && e.message); return null; }
}
