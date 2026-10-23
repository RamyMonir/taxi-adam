// Questions about the reports in plain words: "Ile zarobił Marek w październiku?", "Ile kursów na lotnisko w tym tygodniu?"
// Claude gets ONE read-only tool – the same report the bot's 📊 Raport uses (server/report.js) – and answers from it.
// the owner sees the whole company; a driver only ever gets his own rides.
import Anthropic from "@anthropic-ai/sdk";
import { buildReport, dayWarsaw } from "./report.js";
import { listDrivers } from "./fleet.js";
import { aiOn } from "./ai.js";
import { nowWarsaw } from "./util.js";
import { OWNER, BRAND, EX } from "./brand.js";

// a question, not a ride: a "?" or a question word first, and no phone number in it
export const looksLikeQuestion = (t) => (String(t).match(/\d/g) || []).length < 9 &&
  (/\?\s*$/.test(t) || /^(ile|ilu|kto|kogo|jaki|jaka|jakie|który|która|które|kiedy|gdzie|pokaż|podaj|policz|porównaj|zestaw|czy)\b/i.test(String(t).trim()));

const TOOL = {
  name: "get_report",
  description: "Read-only ride report for a period (Polish local dates, inclusive): the formatted summary (rides, revenue, cash/card, km, " +
    "per-driver settlement = what each driver earned and owes) and every ride (day, status, driver, from, to, km, price, paid, method, online/phone).",
  input_schema: {
    type: "object", additionalProperties: false, required: ["from", "to"],
    properties: {
      from: { type: "string", description: "YYYY-MM-DD" },
      to: { type: "string", description: "YYYY-MM-DD" },
      driver: { type: "string", description: "optional: one driver's first name or full name; omit for everybody" },
    },
  },
};

async function runTool(env, input, drv, team) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  if (!ok(input.from) || !ok(input.to) || input.from > input.to) return { error: "from/to must be YYYY-MM-DD, from <= to" };
  let id = null;
  if (!drv.owner) id = drv.id;   // a driver: only his own rides, whatever he asks
  else if (input.driver) {
    const q = String(input.driver).toLowerCase();
    const x = team.find((y) => String(y.name || "").toLowerCase() === q) || team.find((y) => String(y.name || "").toLowerCase().split(/\s+/).includes(q.split(/\s+/)[0]));
    if (!x) return { error: `no driver "${input.driver}"`, drivers: team.map((y) => y.name) };
    id = x.id;
  }
  const rep = await buildReport(env, input.from, input.to, id);
  const rides = rep.rows.slice(0, 400).map((t) => ({ day: t.day, status: t.status, driver: t.driver_name, from: t.pickup, to: t.dest, km: t.km,
    price: t.price, paid: t.paid, method: t.method, source: t.source, car: t.car_label }));
  return { period: `${input.from}..${input.to}`, driver: id ? (team.find((y) => y.id === id) || {}).name || OWNER.nom : "all",
           summary: rep.text.replace(/<[^>]+>/g, ""), rides, ridesShown: rides.length, ridesTotal: rep.rows.length };
}

// -> answer text (plain), or null when the AI is off / failed
export async function askReports(env, drv, question) {
  if (!aiOn(env)) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 1, timeout: 40000 });
  const team = (await listDrivers(env)).filter((x) => x.active !== 0);
  const now = nowWarsaw();
  const system = [
    `You answer questions about ${BRAND.name}'s rides for ` + (drv.owner ? `the owner, ${OWNER.nom} (the whole company).` : `the driver ${drv.name} (only his own rides).`),
    `Today in Poland: ${dayWarsaw(Date.now())} (${now.slice(11)}). Weeks start on Monday.`,
    `Drivers: ${team.map((x) => x.name).join(", ")}.`,
    "Always call get_report for the period the question is about before answering, and use only its numbers – never guess.",
    "Answer in Polish, short and concrete (a few lines, numbers first), plain text without HTML. Say which period you counted.",
    "If something can't be answered from the report, say so in one sentence.",
  ].join("\n");
  const messages = [{ role: "user", content: String(question).slice(0, 1000) }];
  try {
    for (let i = 0; i < 4; i++) {
      const res = await client.beta.messages.create({
        model: env.AI_MODEL || "claude-opus-5-5", max_tokens: 4000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        output_config: { effort: "medium" }, system, tools: [TOOL], messages,
      });
      if (res.stop_reason === "refusal") return null;
      const calls = res.content.filter((b) => b.type === "tool_use");
      if (!calls.length) return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || null;
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: await Promise.all(calls.map(async (c) => ({ type: "tool_result", tool_use_id: c.id,
        content: JSON.stringify(await runTool(env, c.input || {}, drv, team).catch((e) => ({ error: e.message }))) }))) });
    }
    return null;
  } catch (e) {
    console.log(e instanceof Anthropic.APIError ? `ask api ${e.status} ${e.message}` : `ask ${e && e.message}`);
    return null;
  }
}
