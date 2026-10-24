/* Taxi Lite PLUS – extras for the Lite booking box; the ride is still sent by WhatsApp / SMS.
   Address suggestions (/api/places + /api/place), street from GPS and typed text (/api/geocode), distance + price
   (/api/quote), flight check (/api/flight) and a small map (Google Maps JS, browser key). Same look as the full
   version (quote cells, flight card). Loaded by lite.js only when window.TAXI.plus is set (LITE_PLUS = True in
   src/data.py). Everything fails quietly: the form works without it. */
const C = window.TAXI || {};
const en = C.lang === "en";
const T = en ? {
  km: "km", min: "min", h: "h", fixed: "Fixed price", est: "Approx. price", none: "on request",
  looking: "Looking for the flight…", noneDay: "No flight {no} on {d}. Check the number and date.", noneWeek: "No flight {no} in the next 7 days. Check the number.",
  dep: "Departs", arr: "Arrives", other: "Other days:", set: "pickup date and time filled in", use: "Use this time",
  sugDep: "Pickup: {d}, {t} (2 h before departure + drive).", sugArr: "The driver waits from {t}, {d} (20 min after landing).",
  st: {}, route: "Route", flight: "Flight", pickupAt: "pickup",
} : {
  km: "km", min: "min", h: "h", fixed: "Cena stała", est: "Cena ok.", none: "do ustalenia",
  looking: "Szukam lotu…", noneDay: "Nie znaleźliśmy lotu {no} w dniu {d}. Sprawdź numer i datę.", noneWeek: "Nie znaleźliśmy lotu {no} w najbliższych 7 dniach. Sprawdź numer.",
  dep: "Wylot", arr: "Przylot", other: "Inne dni:", set: "ustawiliśmy datę i godzinę odbioru", use: "Ustaw tę godzinę",
  sugDep: "Odbiór: {d}, {t} (2 h przed wylotem + dojazd).", sugArr: "Kierowca czeka od {t}, {d} (20 min po lądowaniu).",
  st: { Expected: "planowo", Scheduled: "planowo", Delayed: "opóźniony", Departed: "wystartował", EnRoute: "w powietrzu", Approaching: "podchodzi do lądowania",
    Arrived: "wylądował", Canceled: "ODWOŁANY", Cancelled: "ODWOŁANY", Diverted: "przekierowany", CheckIn: "odprawa", Boarding: "boarding", GateClosed: "bramka zamknięta" },
  route: "Trasa", flight: "Lot", pickupAt: "odbiór",
};
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] != null ? o[k] : ""));
const hasXY = (p) => !!p && p.lat != null && isFinite(p.lat) && isFinite(p.lng);
const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function api(path, body, ms = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }
      : { signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    j._ok = r.ok; j._status = r.status; return j;
  } finally { clearTimeout(t); }
}

export function initPlus(form, { getMode, setMode }) {
  const q = (id) => form.querySelector("#" + id);
  const S = { pickup: null, dest: null, quote: null };
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- address suggestions ---------- */
  function suggest(which) {
    const input = q(which), list = q(which + "-list");
    let items = [], active = -1, timer = null, seq = 0, token = null;
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
    const close = () => { list.hidden = true; list.textContent = ""; items = []; active = -1; input.setAttribute("aria-expanded", "false"); };
    function render() {
      if (!items.length || document.activeElement !== input) { close(); return; }
      list.textContent = "";
      items.forEach((p, i) => {
        const li = el("li"); li.setAttribute("role", "option"); li.id = list.id + "-" + i; li.dataset.i = String(i);
        li.append(el("b", null, p.main), el("small", null, p.sub || "")); list.append(li);
      });
      list.hidden = false; input.setAttribute("aria-expanded", "true"); active = -1;
    }
    function highlight(i) {
      active = i;
      [...list.children].forEach((li, k) => li.setAttribute("aria-selected", k === i ? "true" : "false"));
      if (i >= 0) input.setAttribute("aria-activedescendant", list.id + "-" + i);
    }
    async function pick(i) {
      const it = items[i]; if (!it) return;
      const label = it.main + (it.sub ? ", " + it.sub : "");
      input.value = label; close();
      const s = token; token = null;
      set(which, { address: label, lat: null, lng: null });
      try {
        const p = await api("/api/place?id=" + encodeURIComponent(it.id) + "&s=" + (s || ""));
        if (p._ok && p.lat != null && input.value === label) { input.value = p.address || label; set(which, { address: input.value, lat: p.lat, lng: p.lng }); }
      } catch (e) {}
    }
    input.addEventListener("input", () => {
      clearTimeout(timer); S[which] = null; if (which === "pickup") form.classList.remove("geo-named"); changed();
      const text = input.value.trim();
      if (text.length < 3) { close(); return; }
      timer = setTimeout(async () => {
        if (!token) token = uuid();
        const my = ++seq;
        try { const r = await api("/api/places?q=" + encodeURIComponent(text) + "&s=" + token); if (my === seq) { items = r.suggestions || []; render(); } }
        catch (e) { close(); }
      }, 250);
    });
    input.addEventListener("keydown", (e) => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(Math.min(items.length - 1, active + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(Math.max(0, active - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); pick(active >= 0 ? active : 0); }
      else if (e.key === "Escape") close();
    });
    list.addEventListener("mousedown", (e) => e.preventDefault());   // keep focus in the input
    list.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) pick(+li.dataset.i); });
    // typed by hand without picking: find the address when the customer leaves the field
    input.addEventListener("blur", () => setTimeout(() => { close(); if (!S[which] && input.value.trim().length >= 3) typed(which); }, 150));
  }

  async function typed(which) {
    const input = q(which), text = input.value.trim();
    if (text.length < 3) return;
    try {
      const r = await api("/api/geocode?q=" + encodeURIComponent(text));
      if (r._ok && r.place && input.value.trim() === text) set(which, { address: text, lat: r.place.lat, lng: r.place.lng });
    } catch (e) {}
  }

  // "Tu jestem": the street goes into the field, the green badge shrinks to ✓ × so it never covers the address
  async function gps(g) {
    form.classList.remove("geo-named");
    if (!g) { if (S.pickup && S.pickup.gps) { S.pickup = null; changed(); } return; }
    set("pickup", { address: "", lat: g.lat, lng: g.lng, gps: true });
    try {
      const r = await api("/api/geocode?lat=" + g.lat.toFixed(6) + "&lng=" + g.lng.toFixed(6));
      if (r._ok && r.address && S.pickup && S.pickup.gps) { q("pickup").value = r.address; S.pickup.address = r.address; form.classList.add("geo-named"); }
    } catch (e) {}
  }

  function set(which, p) { S[which] = p; changed(); }

  /* ---------- distance, time, price (same panel as the full version) ---------- */
  let qSeq = 0;
  async function changed() {
    flightBox();
    showMap();
    if (!hasXY(S.pickup) || !hasXY(S.dest)) { S.quote = null; showQuote(); return; }
    const my = ++qSeq;
    try {
      const r = await api("/api/quote", { pickup: S.pickup, dest: S.dest, mode: "later" }, 12000);
      if (my !== qSeq) return;
      S.quote = r._ok && r.distanceM ? r : null;
    } catch (e) { if (my === qSeq) S.quote = null; }
    showQuote(); showMap(); if (fLegs.length) renderFlight();
  }
  const kmText = (m) => (m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", en ? "." : ",") + " " + T.km;
  const durText = (s) => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + " " + T.min : Math.floor(m / 60) + " " + T.h + " " + pad(m % 60) + " " + T.min; };
  function showQuote() {
    const x = S.quote, box = q("quote");
    if (!x) { box.hidden = true; return; }
    box.hidden = false;
    q("q-dist").textContent = kmText(x.distanceM);
    q("q-time").textContent = x.durationS ? durText(x.durationS) : "–";
    q("q-price-lbl").textContent = x.priceKind === "fixed" ? T.fixed : T.est;
    q("q-price").textContent = x.price != null ? x.price + " zł" : T.none;
    box.classList.toggle("approx", !!x.approx);
    if (!reduce) { box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop"); }
  }

  /* ---------- map ---------- */
  const mapWrap = q("map-wrap"), mapEl = q("map");
  let gm = null, gmLoading = null, map = null, marks = [], line = null;
  function loadMaps() {
    if (gm || !C.key) return Promise.resolve(gm);
    if (gmLoading) return gmLoading;
    gmLoading = new Promise((ok) => {
      window.gm_authFailure = () => { mapWrap.hidden = true; C.key = ""; };   // key not allowed on this address: no map, no error
      window.__gmLite = () => { gm = window.google && google.maps; ok(gm); };
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(C.key) + "&v=weekly&libraries=geometry&language=" + (en ? "en" : "pl") + "&region=PL&callback=__gmLite";
      s.async = true; s.onerror = () => ok(null);
      document.head.append(s);
    });
    return gmLoading;
  }
  async function showMap() {
    const pts = [S.pickup, S.dest].filter(hasXY);
    if (!pts.length || !C.key) { mapWrap.hidden = true; return; }
    const g = await loadMaps(); if (!g || !C.key) return;
    mapWrap.hidden = false;
    if (!map) map = new g.Map(mapEl, { center: pts[0], zoom: 13, disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false });
    marks.forEach((m) => m.setMap(null)); marks = [];
    [[S.pickup, "A"], [S.dest, "B"]].forEach(([p, l]) => { if (hasXY(p)) marks.push(new g.Marker({ map, position: { lat: p.lat, lng: p.lng }, label: l })); });
    if (line) { line.setMap(null); line = null; }
    const bounds = new g.LatLngBounds(); pts.forEach((p) => bounds.extend(p));
    if (S.quote && S.quote.polyline && g.geometry) {
      const path = g.geometry.encoding.decodePath(S.quote.polyline);
      line = new g.Polyline({ map, path, strokeColor: "#F5B301", strokeWeight: 5, strokeOpacity: 0.9 });
      path.forEach((p) => bounds.extend(p));
    }
    if (pts.length > 1) map.fitBounds(bounds, 40); else { map.setCenter(pts[0]); map.setZoom(15); }
  }

  /* ---------- flight number -> flight card + pickup time (like the full version) ---------- */
  const fWrap = q("flight-wrap"), fIn = q("flight"), fInfo = q("flight-info");
  let fTimer = null, fSeq = 0, fLast = null, fLegs = [], fSel = 0, timeTouched = false, auto = false;
  const near = (p) => hasXY(p) && (C.airports || []).some((a) => Math.abs(a.lat - p.lat) + Math.abs(a.lng - p.lng) < 0.06);
  const airportText = (s) => /lotnisk|airport|pyrzowice|balice|okęcie|modlin/i.test(s || "");
  function flightBox() {
    fWrap.hidden = !(near(S.pickup) || near(S.dest) || airportText(q("pickup").value) || airportText(q("dest").value) || fIn.value.trim());
  }
  const dayLabel = (date) => new Date(date + "T12:00:00").toLocaleDateString(en ? "en-GB" : "pl-PL", { weekday: "short", day: "numeric", month: "short" });
  function shift(date, time, mins, up) {   // flight time +/- minutes, rounded to 5 min
    const d = new Date(date + "T" + time + ":00"); d.setMinutes(d.getMinutes() + mins);
    const m = d.getMinutes(); d.setMinutes(up ? Math.ceil(m / 5) * 5 : Math.floor(m / 5) * 5);
    return { date: ymd(d), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
  }
  function suggestion(f) {
    if (f.kind === "dep" && f.dep && f.dep.time && f.dep.date) {
      const drive = S.quote && S.quote.durationS ? Math.round(S.quote.durationS / 60) + 10 : 70;
      return { at: shift(f.dep.date, f.dep.time, -(120 + drive), false), text: T.sugDep };
    }
    if (f.kind === "arr" && f.arr && f.arr.time && f.arr.date) return { at: shift(f.arr.date, f.arr.time, 20, true), text: T.sugArr };
    return null;
  }
  function applyPickup(at) {
    if (getMode() !== "later") setMode("later");
    auto = true;
    const d = q("date"), t = q("time");
    d.value = at.date; t.value = at.time;
    d.dispatchEvent(new Event("change", { bubbles: true })); t.dispatchEvent(new Event("change", { bubbles: true }));
    auto = false;
    [d, t].forEach((x) => { const box = x.closest(".when-f") || x; box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash"); });
  }
  q("time").addEventListener("change", () => { if (!auto) { timeTouched = true; if (fLegs.length) renderFlight(); } });
  function renderFlight() {
    const f = fLegs[fSel]; if (!f) return;
    const sug = suggestion(f);
    const end = (e, lbl) => {
      const sp = el("span"); if (!e) { sp.append(el("small", null, lbl), el("b", null, "–")); return sp; }
      sp.append(el("small", null, lbl + (e.date ? " · " + dayLabel(e.date) : "")), el("b", null, e.time || "–"));
      if (e.time && e.scheduled && e.time !== e.scheduled) sp.append(el("s", null, e.scheduled));
      sp.append(el("em", null, e.iata ? e.iata + " · " + e.name : e.name || ""));
      return sp;
    };
    fInfo.className = "flight-info"; fInfo.textContent = "";
    const head = el("div", "fl-head"); head.append(el("b", null, f.number), document.createTextNode(" " + (f.airline || "")));
    if (f.status && f.status !== "Unknown") head.append(document.createTextNode(" "), el("span", "fl-st" + (/Delayed|Cancel|Diverted/.test(f.status) ? " bad" : ""), T.st[f.status] || f.status));
    const route = el("div", "fl-route"), plane = el("i", null, "✈"); plane.setAttribute("aria-hidden", "true");
    route.append(end(f.dep, T.dep), plane, end(f.arr, T.arr));
    fInfo.append(head, route);
    if (sug) {
      const sp = el("p", "fl-sug"); sp.append(el("span", null, fmt(sug.text, { t: sug.at.time, d: dayLabel(sug.at.date) })));
      if (timeTouched) { const ub = el("button", "fl-use", T.use); ub.type = "button"; sp.append(ub); ub.addEventListener("click", () => { timeTouched = false; applyPickup(sug.at); renderFlight(); }); }
      else sp.append(el("span", "fl-ok", "✓ " + T.set));
      fInfo.append(sp);
    }
    if (fLegs.length > 1) {
      const days = el("div", "fl-days"); days.append(el("small", null, T.other));
      fLegs.forEach((l, i) => {
        const e = (l.kind === "arr" ? l.arr : l.dep) || {}, db = el("button", null, e.date ? dayLabel(e.date) : "?");
        db.type = "button"; if (i === fSel) db.setAttribute("aria-pressed", "true");
        db.addEventListener("click", () => { fSel = i; renderFlight(); });
        days.append(db);
      });
      fInfo.append(days);
    }
    if (sug && !timeTouched) applyPickup(sug.at);
  }
  async function lookFlight() {
    const no = fIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/.test(no)) { fInfo.hidden = true; fLast = null; fLegs = []; return; }
    if (no === fLast) return; fLast = no;
    const my = ++fSeq;
    fInfo.hidden = false; fInfo.className = "flight-info loading"; fInfo.textContent = "";
    const spn = el("span", "spin"); spn.setAttribute("aria-hidden", "true"); fInfo.append(spn, document.createTextNode(" " + T.looking));
    try {
      const r = await api("/api/flight?no=" + no, null, 15000);   // the next flights with this number (7 days); the customer picks the day
      if (my !== fSeq) return;
      if (r._status === 503 || r._status === 403) { fInfo.hidden = true; return; }
      if (!r._ok || !r.found) { fInfo.className = "flight-info warn"; fInfo.textContent = fmt(T.noneWeek, { no }); fLegs = []; return; }
      fLegs = r.legs || [r]; fSel = 0; renderFlight();
    } catch (e) { if (my === fSeq) fInfo.hidden = true; }
  }
  fIn.addEventListener("input", () => { clearTimeout(fTimer); flightBox(); fTimer = setTimeout(lookFlight, 600); });
  fIn.addEventListener("change", lookFlight);

  suggest("pickup"); suggest("dest");
  if (q("dest").value) typed("dest");   // route pages: destination already filled in

  return {
    gps, typed, modeChanged() {},
    // extra lines for the WhatsApp / SMS message
    extra() {
      const L = [], x = S.quote;
      if (x) L.push(`${T.route}: ${kmText(x.distanceM)}, ${x.durationS ? durText(x.durationS) : ""}${x.price != null ? ` · ${T.est.toLowerCase()} ${x.price} zł` : ""}`);
      const f = fLegs[fSel], no = fIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (f) {
        const e = f.kind === "dep" ? f.dep : f.arr || f.dep;
        L.push(`${T.flight}: ${f.number}${f.airline ? " " + f.airline : ""} – ${f.kind === "dep" ? T.dep.toLowerCase() : T.arr.toLowerCase()} ${e && e.date ? dayLabel(e.date) : ""} ${e && e.time ? e.time : ""}`.trim());
      } else if (no) L.push(`${T.flight}: ${no}`);
      return L;
    },
  };
}
