// fake Claude API on :8997 for tests/e2e/smart.mjs – answers /v1/messages with the ride fields picked out by simple rules
// (the real model is not needed to test the bot's conversation). /_log = the requests it got, /_reset clears them.
// A note containing "AWARIA" gets a 500 (the bot must fall back to the one-line format).
import http from "node:http";
const log = [];
const PLACES = [[/rynk|rynek/i, "Rynek 1, Knurów"], [/gliwic/i, "Dworzec PKP Gliwice"], [/pyrzowic/i, "Lotnisko Katowice-Pyrzowice"], [/szpital/i, "Szpital Zabrze"]];
function fields(text, now) {
  const [note, fix = ""] = text.split(/\nPoprawka: /);
  const all = note + " " + fix;
  const places = [];
  for (const [re, name] of PLACES) { const m = all.search(re); if (m >= 0) places.push([m, name]); }
  places.sort((a, b) => a[0] - b[0]);
  const phone = ((all.match(/(\d[\d ]{7,}\d)/) || [])[1] || "").replace(/\D/g, "");
  let when = "";
  const t = (fix.match(/(\d{1,2}):(\d{2})/) || note.match(/(\d{1,2}):(\d{2})/));
  if (t) {
    const day = new Date(now.slice(0, 10) + "T12:00:00Z"); if (/jutro/i.test(all)) day.setUTCDate(day.getUTCDate() + 1);
    when = `${day.toISOString().slice(0, 10)}T${t[1].padStart(2, "0")}:${t[2]}`;
  }
  return {
    is_ride: places.length > 0 || phone.length >= 9, pickup: places[0] ? places[0][1] : "", dest: places[1] ? places[1][1] : "",
    when, phone, name: (all.match(/(pan[i]? \p{L}+)/iu) || [])[1] || "", pax: +((all.match(/(\d) osob/) || [])[1] || 1),
    luggage: /walizk/.test(all) ? "walizki" : "", flight: "", notes: "",
  };
}
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    if (req.url === "/_log") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(log)); }
    if (req.url === "/_reset") { log.length = 0; return res.end("ok"); }
    const j = JSON.parse(body || "{}");
    log.push({ url: req.url, beta: req.headers["anthropic-beta"] || "", key: req.headers["x-api-key"] || "", body: j });
    const text = j.messages?.[0]?.content || "";
    res.setHeader("content-type", "application/json");
    if (/AWARIA/.test(text)) { res.statusCode = 500; return res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "test outage" } })); }
    const now = (String(j.system).match(/Now in Poland: (\S+)/) || [])[1] || new Date().toISOString().slice(0, 16);
    res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: j.model, stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(fields(text, now)) }], usage: { input_tokens: 10, output_tokens: 10 } }));
  });
}).listen(8997, () => console.log("fake anthropic on 8997"));
