/* Taxi Lite PLUS – extras for the Lite booking box; the ride is still sent by WhatsApp / SMS.
   Address suggestions (/api/places + /api/place), street from GPS and typed text (/api/geocode), distance + price
   (/api/quote), flight check (/api/flight) and a small map (Google Maps JS, browser key). Loaded by lite.js only when
   window.TAXI.plus is set (LITE_PLUS = True in src/data.py). Everything fails quietly: the form works without it. */
const C = window.TAXI || {};
const en = C.lang === "en";
const hasXY = (p) => !!p && p.lat != null && isFinite(p.lat) && isFinite(p.lng);
const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

async function api(path, body, ms = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }
      : { signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    j._ok = r.ok; return j;
  } finally { clearTimeout(t); }
}

export function initPlus(form, getMode) {
  const q = (id) => form.querySelector("#" + id);
  const S = { pickup: null, dest: null, quote: null, flight: null };
  const quoteEl = q("lite-quote"), mapEl = q("lite-map"), fWrap = q("flight-wrap"), fIn = q("flight"), fInfo = q("flight-info");

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
        const li = document.createElement("li"); li.setAttribute("role", "option"); li.id = list.id + "-" + i; li.dataset.i = String(i);
        const b = document.createElement("b"); b.textContent = p.main;
        const s = document.createElement("small"); s.textContent = p.sub || "";
        li.append(b, s); list.append(li);
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
      clearTimeout(timer); S[which] = null; changed();
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

  async function gps(g) {
    if (!g) { if (S.pickup && S.pickup.gps) { S.pickup = null; changed(); } return; }
    set("pickup", { address: "", lat: g.lat, lng: g.lng, gps: true });
    try {
      const r = await api("/api/geocode?lat=" + g.lat.toFixed(6) + "&lng=" + g.lng.toFixed(6));
      if (r._ok && r.address && S.pickup && S.pickup.gps) { q("pickup").value = r.address; S.pickup.address = r.address; }
    } catch (e) {}
  }

  function set(which, p) { S[which] = p; changed(); }

  /* ---------- distance, time, price ---------- */
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
    showQuote(); showMap();
  }
  const km = (m) => (m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",");
  function quoteText() {
    const x = S.quote; if (!x) return "";
    const parts = [`${km(x.distanceM)} km`, `${en ? "approx." : "ok."} ${Math.max(1, Math.round(x.durationS / 60))} min`];
    if (x.price != null) parts.push(`${en ? "price approx." : "cena ok."} ${x.price} zł`);
    return parts.join(" · ");
  }
  function showQuote() {
    const t = quoteText();
    quoteEl.hidden = !t;
    quoteEl.textContent = t ? `🚕 ${t}${en ? " – the driver confirms the final price" : " – kierowca potwierdzi cenę"}` : "";
  }

  /* ---------- map ---------- */
  let gm = null, gmLoading = null, map = null, marks = [], line = null;
  function loadMaps() {
    if (gm || !C.key) return Promise.resolve(gm);
    if (gmLoading) return gmLoading;
    gmLoading = new Promise((ok) => {
      window.gm_authFailure = () => { mapEl.hidden = true; C.key = ""; };   // key not allowed on this address: no map, no error
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
    if (!pts.length || !C.key) { mapEl.hidden = true; return; }
    const g = await loadMaps(); if (!g || !C.key) return;
    mapEl.hidden = false;
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

  /* ---------- flight number ---------- */
  const near = (p) => hasXY(p) && (C.airports || []).some((a) => Math.abs(a.lat - p.lat) + Math.abs(a.lng - p.lng) < 0.06);
  const airportText = (s) => /lotnisk|airport|pyrzowice|balice|okęcie|modlin/i.test(s || "");
  function flightBox() {
    fWrap.hidden = !(near(S.pickup) || near(S.dest) || airportText(q("pickup").value) || airportText(q("dest").value) || fIn.value.trim());
  }
  let fTimer = null, fSeq = 0;
  const dm = (d) => (d ? d.slice(8, 10) + "." + d.slice(5, 7) : "");
  function legText(f) {
    if (!f || !f.found) return "";
    const a = f.kind === "dep" ? f.dep : f.arr || f.dep;
    const what = f.kind === "dep" ? (en ? "departure" : "odlot") : (en ? "arrival" : "przylot");
    const where = a && (a.iata || a.name) ? (f.kind === "dep" ? (en ? " from " : " z ") : (en ? " at " : " do ")) + (a.iata || a.name) : "";
    return `${f.number}${f.airline ? " " + f.airline : ""} – ${what}${where} ${dm(a && a.date)} ${a && a.time ? (en ? "at " : "o ") + a.time : ""}`.replace(/\s+/g, " ").trim()
      + (f.status && !/unknown|expected/i.test(f.status) ? ` (${f.status})` : "");
  }
  async function lookFlight() {
    const no = fIn.value.toUpperCase().replace(/\s+/g, "");
    S.flight = no ? { number: no, found: false } : null;
    if (!/^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/.test(no)) { fInfo.hidden = true; return; }
    const date = getMode() === "later" ? q("date").value : "";
    const my = ++fSeq;
    fInfo.hidden = false; fInfo.textContent = en ? "Checking the flight…" : "Sprawdzam lot…";
    try {
      const r = await api("/api/flight?no=" + encodeURIComponent(no) + (date ? "&date=" + date : ""), null, 12000);
      if (my !== fSeq) return;
      const leg = r.legs ? r.legs[0] : r;
      if (r._ok && leg && leg.found) { S.flight = leg; fInfo.textContent = "✈️ " + legText(leg); }
      else fInfo.textContent = en ? "Flight not found for this date – it will still go into the message." : "Nie znaleziono lotu w tym dniu – numer i tak trafi do wiadomości.";
    } catch (e) { if (my === fSeq) fInfo.hidden = true; }
  }
  fIn.addEventListener("input", () => { clearTimeout(fTimer); flightBox(); fTimer = setTimeout(lookFlight, 600); });
  q("date").addEventListener("change", () => { if (fIn.value.trim()) lookFlight(); });

  suggest("pickup"); suggest("dest");
  if (q("dest").value) typed("dest");   // route pages: destination already filled in

  return {
    gps, typed, modeChanged() { if (fIn.value.trim()) lookFlight(); },
    // extra lines for the WhatsApp / SMS message
    extra() {
      const L = [], t = quoteText();
      if (t) L.push(`${en ? "Route" : "Trasa"}: ${t}`);
      if (S.flight) L.push(`${en ? "Flight" : "Lot"}: ${S.flight.found ? legText(S.flight) : S.flight.number}`);
      return L;
    },
  };
}
