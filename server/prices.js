// LITE price editor: the same rules as src/prices_check.py (the build checks the file again – a bad file never goes live).
export const PRICE_MIN = 5, PRICE_MAX = 3000;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

// p = prices object; known = {villages: [slug], destinations: [slug], zones: ["0","A","B"]} -> list of errors (empty = OK)
export function checkPrices(p, known) {
  const e = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) return ["plik nie jest obiektem JSON"];
  if (!isInt(p.version, 1, 1e9)) e.push("version: liczba całkowita >= 1");
  const z = p.zones || {};
  if (Object.keys(z).sort().join() !== [...known.zones].sort().join()) e.push(`zones: potrzebne dokładnie ${known.zones.join(", ")}`);
  for (const [k, v] of Object.entries(z)) if (!isInt(v, 0, 200)) e.push(`zones.${k}: 0–200 zł`);
  const loc = p.local || {};
  for (const v of known.villages) if (!(v in loc)) e.push(`local: brak ceny dla ${v}`);
  for (const [k, v] of Object.entries(loc)) {
    if (!known.villages.includes(k)) e.push(`local.${k}: nieznana miejscowość`);
    else if (!isInt(v, PRICE_MIN, PRICE_MAX)) e.push(`local.${k}: ${PRICE_MIN}–${PRICE_MAX} zł`);
  }
  for (const [k, v] of Object.entries(p.village_zone || {})) {
    if (!known.villages.includes(k)) e.push(`village_zone.${k}: nieznana miejscowość`);
    else if (!known.zones.includes(v)) e.push(`village_zone.${k}: nieznana strefa ${v}`);
  }
  const dst = p.destinations || {};
  for (const d of known.destinations) if (!(d in dst)) e.push(`destinations: brak ceny dla ${d}`);
  for (const [k, v] of Object.entries(dst)) {
    if (!known.destinations.includes(k)) e.push(`destinations.${k}: nieznana trasa`);
    else if (!v || typeof v !== "object" || !isInt(v.price, PRICE_MIN, PRICE_MAX)) e.push(`destinations.${k}.price: ${PRICE_MIN}–${PRICE_MAX} zł`);
    else if (v.confirmed !== undefined && typeof v.confirmed !== "boolean") e.push(`destinations.${k}.confirmed: true/false`);
  }
  for (const [vil, row] of Object.entries(p.overrides || {})) {
    if (!known.villages.includes(vil)) { e.push(`overrides.${vil}: nieznana miejscowość`); continue; }
    if (!row || typeof row !== "object") { e.push(`overrides.${vil}: obiekt`); continue; }
    for (const [d, v] of Object.entries(row)) {
      if (!known.destinations.includes(d)) e.push(`overrides.${vil}.${d}: nieznana trasa`);
      else if (!isInt(v, PRICE_MIN, PRICE_MAX)) e.push(`overrides.${vil}.${d}: ${PRICE_MIN}–${PRICE_MAX} zł`);
    }
  }
  const w = p.waiting || {};
  if (w.free_min != null && !isInt(w.free_min, 0, 60)) e.push("waiting.free_min: 0–60 min");
  if (w.per_min != null && !isNum(w.per_min, 0, 20)) e.push("waiting.per_min: 0–20 zł");
  const t = p.tariff || {};
  if (!isNum(t.start, 0, 100)) e.push("tariff.start: 0–100 zł");
  if (!isNum(t.per_km, 0, 20)) e.push("tariff.per_km: 0–20 zł");
  if (!isNum(t.min, 0, 200)) e.push("tariff.min: 0–200 zł");
  return e;
}

// what changed, in words the owner understands -> ["Czerwionka → Pyrzowice: 190 → 220 zł", ...]
export function diffPrices(a, b, names) {
  const vn = (s) => names.villages[s] || s, dn = (s) => names.destinations[s] || s, out = [];
  const zl = (v) => (v == null ? "–" : `${v} zł`);
  for (const k of Object.keys(b.zones || {})) if ((a.zones || {})[k] !== b.zones[k]) out.push(`Dopłata strefa ${k}: ${zl(a.zones?.[k])} → ${zl(b.zones[k])}`);
  for (const k of Object.keys(b.local || {})) if ((a.local || {})[k] !== b.local[k]) out.push(`Kurs lokalny ${vn(k)}: ${zl(a.local?.[k])} → ${zl(b.local[k])}`);
  for (const k of Object.keys(b.village_zone || {})) if ((a.village_zone || {})[k] !== b.village_zone[k]) out.push(`Strefa ${vn(k)}: ${a.village_zone?.[k] ?? "–"} → ${b.village_zone[k]}`);
  for (const k of Object.keys(b.destinations || {})) {
    const x = (a.destinations || {})[k] || {}, y = b.destinations[k];
    if (x.price !== y.price) out.push(`${dn(k)}: ${zl(x.price)} → ${zl(y.price)}`);
  }
  const vils = new Set([...Object.keys(a.overrides || {}), ...Object.keys(b.overrides || {})]);
  for (const v of vils) {
    const x = (a.overrides || {})[v] || {}, y = (b.overrides || {})[v] || {};
    for (const d of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (x[d] !== y[d]) out.push(`${vn(v)} → ${dn(d)}: ${y[d] == null ? `usunięty wyjątek (${zl(x[d])})` : `${zl(x[d])} → ${zl(y[d])}`}`);
    }
  }
  const wa = a.waiting || {}, wb = b.waiting || {};
  if (wa.free_min !== wb.free_min) out.push(`Oczekiwanie gratis: ${wa.free_min ?? "–"} → ${wb.free_min ?? "–"} min`);
  if (wa.per_min !== wb.per_min) out.push(`Oczekiwanie za minutę: ${zl(wa.per_min)} → ${zl(wb.per_min)}`);
  for (const k of ["start", "per_km", "min"]) if ((a.tariff || {})[k] !== (b.tariff || {})[k]) out.push(`Taryfa ${k}: ${(a.tariff || {})[k]} → ${b.tariff[k]}`);
  return out;
}

// the owner edits only prices: names, slugs and anything else in the file stay exactly as they were
export function mergeEdit(current, edit) {
  const next = JSON.parse(JSON.stringify(current));
  const num = (v) => (v === "" || v == null ? null : Number(v));
  for (const k of Object.keys(next.zones || {})) if (edit.zones && k in edit.zones) next.zones[k] = num(edit.zones[k]);
  for (const k of Object.keys(next.local || {})) if (edit.local && k in edit.local) next.local[k] = num(edit.local[k]);
  for (const k of Object.keys(next.village_zone || {})) if (edit.village_zone && k in edit.village_zone) next.village_zone[k] = String(edit.village_zone[k]);
  for (const k of Object.keys(next.destinations || {})) {
    if (edit.destinations && k in edit.destinations) {
      const price = num(edit.destinations[k]), old = next.destinations[k];
      next.destinations[k] = { ...old, price, confirmed: price !== old.price ? true : old.confirmed };   // a price the owner typed is confirmed
    }
  }
  if (edit.overrides && typeof edit.overrides === "object") {
    const o = {};
    for (const [v, row] of Object.entries(edit.overrides)) {
      for (const [d, val] of Object.entries(row || {})) {
        const n = num(val); if (n == null) continue;
        (o[v] = o[v] || {})[d] = n;
      }
    }
    next.overrides = o;
  }
  if (edit.waiting) next.waiting = { free_min: num(edit.waiting.free_min), per_min: num(edit.waiting.per_min) };
  next.version = (Number(current.version) || 0) + 1;
  return next;
}

export const pricesText = (p) => JSON.stringify(p, null, 2) + "\n";
