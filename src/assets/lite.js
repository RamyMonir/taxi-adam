/* Taxi Lite – the website without a booking backend: the customer sends the ride by WhatsApp / SMS or calls.
   Each tap is counted for the owner's report (POST /api/lead with sendBeacon – it never delays opening the app).
   Menu, theme, reveal, install panel, lightbox and review link are the same as in app.js (full version). */
import { buildMessage, waLink, smsLink, validate, leadPayload, isNight } from "./lite-msg.js";

const C = window.TAXI || {};
const $ = (id) => document.getElementById(id);
const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

/* ---------- menu & theme ---------- */
const mb = document.querySelector(".menu-btn"), nav = document.querySelector(".nav");
if (mb && nav) mb.addEventListener("click", () => { const o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", o ? "true" : "false"); });
const tt = document.querySelector(".theme-toggle");
try { const saved = localStorage.getItem("theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); } catch (e) {}
if (tt) tt.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const dark = cur ? cur === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (e) {}
});

/* ---------- scroll reveal ---------- */
const rv = document.querySelectorAll("[data-reveal]");
if (rv.length && !reduce && "IntersectionObserver" in window) {
  document.documentElement.classList.add("reveal-ready");
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
  rv.forEach((el) => io.observe(el));
}

/* ---------- booking box ---------- */
function initBooking(form) {
  const q = (id) => form.querySelector("#" + id);
  const err = q("form-error"), note = q("lite-night");
  let geo = null, plus = null;
  // Lite Plus: address suggestions, price from the route, map, flight (same ?v= stamp as this file)
  if (C.plus) import("./lite-plus.js" + new URL(import.meta.url).search).then((m) => { plus = m.initPlus(form, () => form.dataset.mode); }).catch(() => {});

  const fields = () => ({
    mode: form.dataset.mode, date: q("date").value, time: q("time").value, from: q("pickup").value, to: q("dest").value, geo,
    pax: q("pax").value, luggage: q("lug").value, name: q("name").value, phone: q("tel").value, notes: q("notes").value, website: q("website").value,
    extra: plus ? plus.extra() : [],
  });

  // remember the customer's name and phone on this device (like the full version)
  const me = store.get("taxi.lite.me");
  if (me) { if (me.name && !q("name").value) q("name").value = me.name; if (me.phone && !q("tel").value) q("tel").value = me.phone; }

  function showNight() {
    const f = fields(), now = new Date();
    const hh = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    const n = f.mode === "later" ? isNight(f.time, C.night) : isNight(hh, C.night);
    note.hidden = !n;
  }

  function setMode(mode) {
    form.dataset.mode = mode;
    form.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-checked", b.dataset.mode === mode ? "true" : "false"));
    form.querySelectorAll(".later-only").forEach((el) => { el.hidden = mode !== "later"; });
    if (mode === "later" && !q("date").value) {
      const t = new Date(Date.now() + 864e5); t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
      q("date").value = t.toISOString().slice(0, 10);
    }
    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    q("date").min = today.toISOString().slice(0, 10);
    showNight();
  }
  form.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => { setMode(b.dataset.mode); if (plus) plus.modeChanged(); }));
  q("time").addEventListener("change", showNight);
  q("date").addEventListener("change", showNight);

  // chips fill "Dokąd"
  form.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { q("dest").value = c.dataset.dest; c.blur(); if (plus) plus.typed("dest"); }));

  // "Tu jestem": browser location only (no Google API) – the link goes into the message
  const gps = q("gps"), gpsOk = q("gps-ok");
  function setGeo(g) {
    geo = g; gpsOk.hidden = !g; gps.hidden = !!g;
    if (g && !q("pickup").value) q("pickup").placeholder = "Moja lokalizacja (link w wiadomości)";
    if (plus) plus.gps(g);
  }
  gps.addEventListener("click", () => {
    if (!navigator.geolocation) { err.textContent = "Ta przeglądarka nie podaje lokalizacji – wpisz adres."; return; }
    gps.classList.add("busy"); err.textContent = "";
    navigator.geolocation.getCurrentPosition((p) => { gps.classList.remove("busy"); setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { gps.classList.remove("busy"); err.textContent = "Nie udało się pobrać lokalizacji – wpisz adres."; },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
  q("gps-x").addEventListener("click", () => setGeo(null));

  function fail(v) {
    err.textContent = v.msg;
    const f = q(v.field); if (f) { f.setAttribute("aria-invalid", "true"); f.focus(); }
  }
  form.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid")) e.target.removeAttribute("aria-invalid"); err.textContent = ""; });

  function count(channel, f) {
    const body = JSON.stringify(leadPayload(f, channel, location.pathname));
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/lead", new Blob([body], { type: "application/json" }))) return;
    } catch (e) {}
    try { fetch("/api/lead", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {}); } catch (e) {}
  }

  function send(channel, a, ev) {
    const f = fields();
    if (channel !== "tel") {
      const v = validate(f, { night: C.night });
      if (v) { ev.preventDefault(); if (v.field === "time" && f.mode === "now") setMode("later"); fail(v); return; }
      const msg = buildMessage(f, { site: C.site, night: C.night });
      a.href = channel === "wa" ? waLink(C.wa, msg) : smsLink(C.tel, msg, navigator.userAgent);
    }
    store.set("taxi.lite.me", { name: f.name, phone: f.phone });
    count(channel, f);
    sessionStorage.setItem("taxi.lite.sent", "1");
  }
  q("go-wa").addEventListener("click", function (ev) { send("wa", this, ev); });
  q("go-sms").addEventListener("click", function (ev) { send("sms", this, ev); });
  form.querySelectorAll("a[data-lead='tel']").forEach((a) => a.addEventListener("click", function (ev) { send("tel", this, ev); }));
  form.addEventListener("submit", (e) => { e.preventDefault(); q("go-wa").click(); });

  // SMS only where phones can send it
  if (window.matchMedia && matchMedia("(pointer: fine)").matches && !/Android|iPhone|iPad/.test(navigator.userAgent)) q("go-sms").hidden = true;

  // route pages: destination given by the page
  if (form.dataset.dest && !q("dest").value) q("dest").value = form.dataset.dest;
  setMode(form.dataset.mode || "now");
}
const bookForm = $("booking");
if (bookForm) initBooking(bookForm);

/* ---------- back from WhatsApp / SMS: what happens next ---------- */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  let sent = false; try { sent = sessionStorage.getItem("taxi.lite.sent") === "1"; } catch (e) {}
  const b = $("lite-back"); if (!sent || !b) return;
  b.hidden = false;
  try { sessionStorage.removeItem("taxi.lite.sent"); } catch (e) {}
});
const lb0 = $("lite-back-x"); if (lb0) lb0.addEventListener("click", () => { $("lite-back").hidden = true; });

/* ---------- "add to home screen" panel (PWA) ---------- */
(function () {
  const box = $("install"); if (!box) return;
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  let later = 0; try { later = parseInt(localStorage.getItem("taxi.install") || "0", 10); } catch (e) {}
  if (standalone || Date.now() < later) return;
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  const android = /Android/.test(ua), chromium = !!window.chrome && !/OPR|SamsungBrowser/.test(ua);
  let promptEvt = window.__bip || null, shown = false;
  function show() { if (shown) return; shown = true; box.hidden = false; box.classList.toggle("is-ios", ios); requestAnimationFrame(() => box.classList.add("open")); }
  function hide(days) {
    box.classList.remove("open"); setTimeout(() => { box.hidden = true; }, 400);
    try { localStorage.setItem("taxi.install", String(Date.now() + days * 864e5)); } catch (e) {}
  }
  function useEvent(e) { if (ios) return; promptEvt = e; $("install-go").hidden = false; box.querySelector(".install-android").hidden = true; box.querySelector(".install-desktop").hidden = true; }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); useEvent(e); });
  if (promptEvt) useEvent(promptEvt);
  else if (ios) box.querySelector(".install-ios").hidden = false;
  else if (android) box.querySelector(".install-android").hidden = false;
  else if (chromium) box.querySelector(".install-desktop").hidden = false;
  else return;
  setTimeout(show, 9000);
  $("install-go").addEventListener("click", () => {
    if (!promptEvt) return;
    promptEvt.prompt();
    promptEvt.userChoice.then((c) => { hide(c.outcome === "accepted" ? 3650 : 14); promptEvt = null; });
  });
  $("install-x").addEventListener("click", () => hide(14));
  window.addEventListener("appinstalled", () => hide(3650));
})();

/* ---------- photos: tap to enlarge ---------- */
const lb = $("lightbox");
if (lb && lb.showModal) {
  document.querySelectorAll(".vip-ph").forEach((b) => b.addEventListener("click", () => {
    lb.querySelector("img").src = b.getAttribute("data-full"); lb.querySelector("p").textContent = b.getAttribute("data-cap") || ""; lb.showModal();
  }));
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("lb-x")) lb.close(); });
}

/* ---------- "Dodaj swoją opinię": the Google listings share the reviews fairly ---------- */
(function () {
  const a = $("rv-add"), pl = C.places || [];
  if (!a || pl.length < 2) return;
  const p = pl[Math.floor(Math.random() * pl.length)];
  a.href = "https://search.google.com/local/writereview?placeid=" + encodeURIComponent(p.id);
  a.title = p.name;
})();

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
