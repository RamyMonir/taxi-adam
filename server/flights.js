// Flight schedule lookup (AeroDataBox via RapidAPI, secret AERODATABOX_KEY).
// Returns the leg that touches one of our airports and whether the customer is flying out (dep) or landing (arr).
import { CONFIG } from "./config.js";

const OURS = new Set(CONFIG.destinations.filter((d) => d.code).map((d) => d.code));

export const normFlight = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const validFlight = (s) => /^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/.test(s);

// "2026-10-24 06:15+02:00" -> {date:"2026-10-24", time:"06:15"}
function local(t) {
  const s = (t && (t.local || t)) || "";
  return typeof s === "string" && s.length >= 16 ? { date: s.slice(0, 10), time: s.slice(11, 16) } : null;
}

function end(x) {
  if (!x) return null;
  const sched = local(x.scheduledTime || x.scheduledTimeLocal);
  const best = local(x.revisedTime || x.predictedTime || x.actualTime) || sched;
  return {
    iata: x.airport?.iata || null, name: x.airport?.municipalityName || x.airport?.name || x.airport?.iata || "",
    date: best?.date || null, time: best?.time || null, scheduled: sched?.time || null, terminal: x.terminal || null,
  };
}

function normLeg(l, number) {
  const dep = end(l.departure), arr = end(l.arrival);
  const kind = OURS.has(dep?.iata) ? "dep" : OURS.has(arr?.iata) ? "arr" : null;
  return { found: true, number: l.number || number, airline: l.airline?.name || "", status: l.status || "", dep, arr, kind };
}

// No date given: the next 7 days, upcoming flights touching our airports (soonest first)
export async function lookupFlightNext(env, number, todayWarsaw, nowWarsawStr) {
  if (!env.AERODATABOX_KEY) return { error: "not configured" };
  const d = new Date(todayWarsaw + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 6);
  const to = d.toISOString().slice(0, 10);
  const r = await fetch(`${env.AERODATABOX_BASE || "https://aerodatabox.p.rapidapi.com"}/flights/number/${number}/${todayWarsaw}/${to}?withAircraftImage=false&withLocation=false&dateLocalRole=Both`, {
    headers: { "X-RapidAPI-Key": env.AERODATABOX_KEY, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" },
  });
  if (r.status === 204 || r.status === 404) return { found: false };
  if (!r.ok) { console.log("aerodatabox", r.status, await r.text()); return { error: `flight API ${r.status}` }; }
  const all = (await r.json().catch(() => [])) || [];
  let legs = all.map((l) => normLeg(l, number));
  const ours = legs.filter((l) => l.kind);
  if (ours.length) legs = ours;
  const key = (l) => { const e = l.kind === "arr" ? l.arr : l.dep; return e && e.date && e.time ? `${e.date}T${e.time}` : ""; };
  legs = legs.filter((l) => key(l) >= nowWarsawStr).sort((a, b) => (key(a) < key(b) ? -1 : 1));
  // one entry per day
  const seen = new Set(); legs = legs.filter((l) => { const k = key(l).slice(0, 10); if (seen.has(k)) return false; seen.add(k); return true; });
  return legs.length ? { found: true, legs } : { found: false };
}

export async function lookupFlight(env, number, date) {
  if (!env.AERODATABOX_KEY) return { error: "not configured" };
  const r = await fetch(`${env.AERODATABOX_BASE || "https://aerodatabox.p.rapidapi.com"}/flights/number/${number}/${date}?withAircraftImage=false&withLocation=false&dateLocalRole=Both`, {
    headers: { "X-RapidAPI-Key": env.AERODATABOX_KEY, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" },
  });
  if (r.status === 204 || r.status === 404) return { found: false };
  if (!r.ok) { console.log("aerodatabox", r.status, await r.text()); return { error: `flight API ${r.status}` }; }
  const legs = await r.json().catch(() => []);
  if (!Array.isArray(legs) || !legs.length) return { found: false };
  const pick = legs.find((l) => OURS.has(l.departure?.airport?.iata) || OURS.has(l.arrival?.airport?.iata)) || legs[0];
  const dep = end(pick.departure), arr = end(pick.arrival);
  const kind = OURS.has(dep?.iata) ? "dep" : OURS.has(arr?.iata) ? "arr" : null;
  return { found: true, number: pick.number || number, airline: pick.airline?.name || "", status: pick.status || "", dep, arr, kind };
}

export function flightLine(f) {
  if (!f || !f.found) return "";
  const t = (e) => `${e.iata || e.name} ${e.time || "?"}${e.time && e.scheduled && e.time !== e.scheduled ? ` (plan ${e.scheduled})` : ""}`;
  return `${f.number}${f.airline ? " " + f.airline : ""}: ${t(f.dep)} → ${t(f.arr)}${f.status && f.status !== "Unknown" ? " · " + f.status : ""}`;
}
