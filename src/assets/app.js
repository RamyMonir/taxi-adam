/* Taxi Knurów Adam Mączka – zamawianie kursu (teraz / na później), status na żywo, opinie Google.
   Backend: Cloudflare Pages Functions (/api/*). Bez backendu formularz proponuje WhatsApp / SMS. */
(function () {
  "use strict";
  var C = window.TAXI || {};
  var lang = C.lang === "en" || /[?&]lang=en\b/.test(location.search) ? "en" : "pl";
  var T = {
    pl: {
      myLoc: "Moja lokalizacja", locating: "Szukam Twojej lokalizacji…", fromPh: "", gpsDenied: "Zezwól przeglądarce na dostęp do lokalizacji albo wpisz adres.",
      gpsFail: "Nie udało się ustalić lokalizacji. Wpisz adres.", gpsRough: "Lokalizacja przybliżona (±{m} m) – sprawdź adres.",
      errFrom: "Podaj, skąd mamy Cię odebrać.", errTo: "Podaj, dokąd jedziesz.", errPhone: "Podaj numer telefonu – kierowca może potrzebować zadzwonić.",
      errWhen: "Wybierz datę i godzinę odbioru (najwcześniej za 15 minut).", errMany: "Za dużo zamówień z tego urządzenia. Zadzwoń, proszę.",
      nightNow: "W nocy ({from}–{to}) jeździmy tylko z wcześniejszą rezerwacją – wybierz godzinę odbioru.",
      errNight: "Kursy nocne ({from}–{to}) rezerwuj najpóźniej {ahead} min przed odbiorem. W pilnej sprawie zadzwoń.", nightTag: "w nocy tylko rezerwacja",
      errSend: "Nie udało się wysłać zamówienia online. Wyślij je jednym kliknięciem:", sending: "Wysyłam do kierowcy…",
      priceFixed: "Cena", priceEst: "Cena ok.", priceNone: "do ustalenia", etaNow: "Kierowca może być u Ciebie za ok. {m} min.",
      km: "km", min: "min", h: "godz.", approx: "w przybliżeniu",
      msgHead: "Dzień dobry, chcę zamówić kurs:", route: "Trasa", whenNow: "Termin: teraz", when: "Termin", pax: "Osób", lug: "Bagaż",
      flight: "Nr lotu", name: "Imię", phone: "Telefon", notes: "Uwagi", back: "Powrót",
      banner: "Masz aktywny kurs – zobacz status", rvMore: "Więcej", rvLess: "Mniej", rvFrom: "Opinia z Google",
      // status page
      kicker: { now: "Kurs teraz", later: "Rezerwacja" },
      st: {
        pending_now: ["Szukamy Twojego kierowcy…", "Zgłoszenie jest już na telefonie kierowcy. Zwykle potwierdza w 1–2 minuty."],
        pending_later: ["Rezerwacja wysłana", "Kierowca potwierdzi termin: {when}. Możesz zamknąć stronę – ta przeglądarka zapamięta link do statusu."],
        waiting: ["Kierowca jeszcze nie odpowiedział", "Może być w trasie. Zadzwoń, a potwierdzi kurs od ręki."],
        scheduled: ["Rezerwacja potwierdzona", "Kierowca przyjedzie {when}. W dniu kursu zobaczysz tu, kiedy wyjedzie."],
        enroute: ["Kierowca jedzie do Ciebie", "Będzie ok. {clock}. Przygotuj się do wyjścia."],
        arrived: ["Kierowca czeka na Ciebie", "Auto stoi pod adresem odbioru. Wyjdź, kiedy będziesz gotowy."],
        ontrip: ["Jesteś w drodze", "Miłej podróży! Na miejscu będziesz ok. {dclock}."],
        noshow: ["Kierowca Cię nie zastał", "Czekał pod adresem odbioru, ale nikt nie przyszedł. Zadzwoń, jeśli nadal potrzebujesz kursu."],
        done: ["Dziękujemy za wspólną trasę!", "Jeśli było dobrze, zostaw opinię w Google – bardzo nam to pomaga."],
        declined: ["Kierowca jest teraz zajęty", "Adam wiezie innego pasażera i nie zdąży do Ciebie na czas. Przepraszamy! Zarezerwuj kurs na późniejszą godzinę albo zadzwoń – podpowiemy najbliższy wolny termin."],
        cancelled: ["Kurs anulowany", "Kierowca dostał informację o anulowaniu."],
        cancelled_driver: ["Kierowca anulował kurs", "Przepraszamy. Zadzwoń, jeśli potrzebujesz pomocy albo zamów nowy kurs."],
        private: ["Ten kurs jest prywatny", "Status kursu widać tylko na telefonie, z którego go zamówiono."],
        expired: ["Kierowca jest teraz w trasie", "Nie zdążył odpowiedzieć na zgłoszenie. Zadzwoń – ustalimy kurs od ręki – albo zarezerwuj na później."],
        notfound: ["Nie znaleziono kursu", "Link mógł wygasnąć. Zamów nowy kurs albo zadzwoń."],
      },
      steps: { sent: "Zgłoszenie wysłane", confirmed: "Kierowca jedzie po Ciebie", scheduled: "Rezerwacja potwierdzona", enroute: "Kierowca w drodze", arrived: "Kierowca na miejscu", ontrip: "W trasie", done: "Kurs zakończony" },
      carKm: "Auto jest {km} km od Ciebie", carKmDest: "Do celu zostało {km} km", destLbl: "min do celu", byGoogle: " · czas z Google Maps, z korkami",
      flLooking: "Szukam lotu…", flNone: "Nie znaleźliśmy lotu {no} w dniu {date}. Sprawdź numer i datę.", flNoneWeek: "Nie znaleźliśmy lotu {no} w najbliższych 7 dniach. Sprawdź numer.",
      flDep: "Wylot", flArr: "Przylot", flOther: "Inne dni:", flSet: "ustawiliśmy datę i godzinę odbioru",
      flSugDep: "Odbiór: {d}, {t} (2 h przed wylotem + dojazd).", flSugArr: "Kierowca czeka od {t}, {d} (20 min po lądowaniu).", flUse: "Ustaw tę godzinę",
      flStatus: { Expected: "planowo", Scheduled: "planowo", Delayed: "opóźniony", Departed: "wystartował", EnRoute: "w powietrzu", Approaching: "podchodzi do lądowania", Arrived: "wylądował", Canceled: "ODWOŁANY", Cancelled: "ODWOŁANY", Diverted: "przekierowany", CheckIn: "odprawa", Boarding: "boarding", GateClosed: "bramka zamknięta", Unknown: "brak danych" },
      anyMoment: "lada chwila", etaLbl: "min do przyjazdu", at: "ok. {clock}", cancel: "Anuluj kurs", cancelQ: "Na pewno anulować kurs?", stop: "Przerwij kurs", stopQ: "Na pewno przerwać kurs w trakcie jazdy? Kierowca dostanie informację.",
      review: "Dodaj opinię w Google", offline: "Brak połączenia – próbuję ponownie…",
      d: { from: "Skąd", to: "Dokąd", when: "Termin", now: "teraz", pax: "Osoby", dist: "Trasa", price: "Cena", flight: "Lot" },
      call: "Zadzwoń do kierowcy", newRide: "Zamów nowy kurs",
    },
    en: {
      myLoc: "My location", locating: "Finding your location…", fromPh: "", gpsDenied: "Allow location access in your browser or type the address.",
      gpsFail: "Couldn't get your location. Please type the address.", gpsRough: "Approximate location (±{m} m) – please check the address.",
      errFrom: "Enter your pickup address.", errTo: "Enter your destination.", errPhone: "Enter your phone number so the driver can call you.",
      errWhen: "Choose a pickup date and time (at least 15 minutes from now).", errMany: "Too many bookings from this device. Please call us.",
      nightNow: "At night ({from}–{to}) we only drive booked rides – please choose a pickup time.",
      errNight: "Night rides ({from}–{to}) must be booked at least {ahead} min before pickup. If it's urgent, please call.", nightTag: "nights: booking only",
      errSend: "Online booking failed. Send it with one tap instead:", sending: "Sending to the driver…",
      priceFixed: "Price", priceEst: "Price approx.", priceNone: "to be agreed", etaNow: "The driver can be with you in about {m} min.",
      km: "km", min: "min", h: "h", approx: "approximately",
      msgHead: "Hello, I'd like to book a ride:", route: "Route", whenNow: "When: now", when: "When", pax: "Passengers", lug: "Luggage",
      flight: "Flight", name: "Name", phone: "Phone", notes: "Notes", back: "Return",
      banner: "You have an active ride – see status", rvMore: "More", rvLess: "Less", rvFrom: "Google review",
      kicker: { now: "Ride now", later: "Booking" },
      st: {
        pending_now: ["Finding your driver…", "Your request is on the driver's phone. He usually confirms within 1–2 minutes."],
        pending_later: ["Booking sent", "The driver will confirm {when}. You can close this page – this browser remembers the status link."],
        waiting: ["No answer from the driver yet", "He may be driving. Call and he'll confirm right away."],
        scheduled: ["Booking confirmed", "The driver will pick you up {when}. On the day you'll see here when he sets off."],
        enroute: ["Your driver is on the way", "Arriving around {clock}. Get ready to go."],
        arrived: ["Your driver is waiting", "The car is at your pickup address. Come out when you're ready."],
        ontrip: ["You're on your way", "Enjoy the ride! Arriving around {dclock}."],
        noshow: ["The driver couldn't find you", "He waited at the pickup address. Call us if you still need a ride."],
        done: ["Thanks for riding with us!", "If you enjoyed it, please leave a Google review – it helps a lot."],
        declined: ["The driver is busy right now", "Adam is driving another passenger and can't reach you in time. Sorry! Book for a later time or call us for the next free slot."],
        cancelled: ["Ride cancelled", "The driver has been notified."],
        cancelled_driver: ["The driver cancelled the ride", "We're sorry. Call us if you need help, or book a new ride."],
        private: ["This ride is private", "Its status is visible only on the phone it was booked from."],
        expired: ["The driver is on the road", "He couldn't answer your request in time. Call us or book for later."],
        notfound: ["Ride not found", "The link may have expired. Book a new ride or call us."],
      },
      steps: { sent: "Request sent", confirmed: "Driver on the way", scheduled: "Booking confirmed", enroute: "Driver on the way", arrived: "Driver arrived", ontrip: "On the trip", done: "Ride finished" },
      carKm: "The car is {km} km away", carKmDest: "{km} km to go", destLbl: "min to destination", byGoogle: " · Google Maps time incl. traffic",
      flLooking: "Looking up the flight…", flNone: "We couldn't find flight {no} on {date}. Check the number and date.", flNoneWeek: "We couldn't find flight {no} in the next 7 days. Check the number.",
      flDep: "Departs", flArr: "Arrives", flOther: "Other days:", flSet: "pickup date and time filled in",
      flSugDep: "Pickup: {d}, {t} (2 h before departure + drive).", flSugArr: "The driver waits from {t}, {d} (20 min after landing).", flUse: "Use this time",
      flStatus: {},
      anyMoment: "any moment", etaLbl: "min away", at: "around {clock}", cancel: "Cancel ride", cancelQ: "Cancel this ride?", stop: "Stop the ride", stopQ: "Stop the ride now? The driver will be notified.",
      review: "Leave a Google review", offline: "Connection lost – retrying…",
      d: { from: "From", to: "To", when: "When", now: "now", pax: "Passengers", dist: "Route", price: "Price", flight: "Flight" },
      call: "Call the driver", newRide: "Book a new ride",
    },
  }[lang];

  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fmt = function (s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); };
  var escH = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var hasXY = function (p) { return p && p.lat != null && p.lng != null; };
  var shortAddr = function (a) { return String(a || "").replace(/,\s*(Polska|Poland|Czechy|Česko)$/i, ""); };

  function api(url, body, timeoutMs, headers) {
    var ctl = "AbortController" in window ? new AbortController() : null;
    var t = ctl && setTimeout(function () { ctl.abort(); }, timeoutMs || 15000);
    var h = headers || {}; if (body) h["content-type"] = "application/json";
    return fetch(url, {
      method: body ? "POST" : "GET", headers: h,
      body: body ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined, cache: "no-store",
    }).then(function (r) {
      clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; j._ok = r.ok; return j; });
    });
  }

  /* ---------- menu & theme ---------- */
  var mb = document.querySelector(".menu-btn"), nav = document.querySelector(".nav");
  if (mb && nav) mb.addEventListener("click", function () {
    var o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", o ? "true" : "false");
  });
  var tt = document.querySelector(".theme-toggle");
  try { var saved = localStorage.getItem("theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); } catch (e) {}
  if (tt) tt.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  /* ---------- scroll reveal ---------- */
  var rv = document.querySelectorAll("[data-reveal]");
  if (rv.length && !reduce && "IntersectionObserver" in window) {
    document.documentElement.classList.add("reveal-ready");
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    Array.prototype.forEach.call(rv, function (el) { io.observe(el); });
  }

  /* ---------- my rides (this browser only) ---------- */
  var Rides = {
    all: function () { try { return JSON.parse(localStorage.getItem("taxi.rides") || "[]"); } catch (e) { return []; } },
    put: function (list) { try { localStorage.setItem("taxi.rides", JSON.stringify(list.slice(0, 10))); } catch (e) {} },
    add: function (r) { var l = Rides.all().filter(function (x) { return x.id !== r.id; }); l.unshift(r); Rides.put(l); },
    get: function (id) { return Rides.all().filter(function (x) { return x.id === id; })[0] || null; },
    close: function (id) { Rides.put(Rides.all().map(function (x) { if (x.id === id) x.closed = true; return x; })); },
    active: function () {
      var now = Date.now();
      return Rides.all().filter(function (x) {
        if (x.closed) return false;
        if (x.mode === "later" && x.when) return new Date(x.when).getTime() + 3 * 3600e3 > now;
        return now - x.created < 4 * 3600e3;
      })[0] || null;
    },
  };
  /* ---------- customer account (optional "Sign in with Google") ---------- */
  var Account = {
    on: !!C.gid,
    get: function () { try { return JSON.parse(localStorage.getItem("taxi.user") || "null"); } catch (e) { return null; } },
    set: function (u) { try { if (u) localStorage.setItem("taxi.user", JSON.stringify(u)); else localStorage.removeItem("taxi.user"); } catch (e) {} },
    // server list -> this device, so the status page and the ride banner work here too
    sync: function () {
      return api("/api/me", null, 10000).then(function (j) {
        if (!j._ok) throw 0;
        Account.set(j.user);
        if (j.user && j.rides) {
          var final = ["done", "declined", "cancelled", "expired", "noshow"];
          j.rides.slice().reverse().forEach(function (x) {
            if (!Rides.get(x.id)) Rides.add({ id: x.id, token: x.token, created: x.created, mode: x.mode, when: x.when, closed: final.indexOf(x.status) >= 0 });
          });
        }
        accountLink();
        return j;
      });
    },
  };
  function accountLink() {
    var a = $("acct-top"); if (!a || !Account.on) return;
    var u = Account.get();
    a.hidden = false;
    a.querySelector(".acct-lbl").textContent = u ? (u.name || (lang === "en" ? "Account" : "Konto")) : (lang === "en" ? "Sign in" : "Zaloguj");
    a.querySelector(".acct-ava").textContent = u ? (u.name || u.email || "?").charAt(0).toUpperCase() : "";
    a.classList.toggle("in", !!u);
  }
  accountLink();
  if (Account.on && Account.get() && !$("acct")) {
    var lastSync = 0; try { lastSync = +sessionStorage.getItem("taxi.sync") || 0; } catch (e) {}
    if (Date.now() - lastSync > 60000) {
      try { sessionStorage.setItem("taxi.sync", String(Date.now())); } catch (e) {}
      Account.sync().catch(function () {});
    }
  }
  function googleButton(el, onDone, onFail) {
    function go() {
      google.accounts.id.initialize({
        client_id: C.gid, ux_mode: "popup",
        callback: function (resp) {
          var mine = Rides.all().map(function (x) { return { id: x.id, token: x.token }; });
          api("/api/auth/google", { credential: resp.credential, rides: mine }).then(function (j) {
            if (!j._ok) throw 0;
            return Account.sync().then(onDone);
          }).catch(onFail);
        },
      });
      google.accounts.id.renderButton(el, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", locale: lang, width: 300 });
    }
    if (window.google && google.accounts && google.accounts.id) { go(); return; }
    var sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = go; sc.onerror = onFail;
    document.head.appendChild(sc);
  }
  var banner = $("ride-banner"), act = Rides.active();
  if (banner && act && !$("track")) {
    banner.href = "/przejazd/?id=" + act.id + (lang === "en" ? "&lang=en" : "");
    banner.innerHTML = '<span class="live" aria-hidden="true"></span>' + escH(T.banner) + " →";
    banner.hidden = false;
  }

  /* ---------- Google Maps (loaded only when needed) ---------- */
  var mapsP = null, mapsBroken = false;
  window.gm_authFailure = function () { mapsBroken = true; Array.prototype.forEach.call(document.querySelectorAll(".map-wrap,.map"), function (m) { m.hidden = true; }); };
  function loadMaps() {
    if (!C.key || mapsBroken) return Promise.resolve(null);
    if (mapsP) return mapsP;
    mapsP = new Promise(function (res) {
      window.__gmReady = function () { res(window.google && window.google.maps ? window.google : null); };
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(C.key) + "&v=weekly&loading=async&libraries=places,marker,geometry&language=" + lang + "&region=PL&callback=__gmReady";
      s.async = true; s.onerror = function () { res(null); };
      document.head.appendChild(s);
    });
    return mapsP;
  }
  function pinEl(cls) { var d = document.createElement("div"); d.className = "mk " + cls; return d; }

  // one map instance per container: markers A/B + route line
  function TripMap(el) {
    var m = null, a = null, b = null, line = null, g = null;
    var box = el.classList.contains("map-lg") ? el : el.parentNode;   // element to show/hide
    var carM = null;
    return {
      car: function (c) {
        if (!m || !g || !g.marker) return;
        if (!c) { if (carM) carM.map = null; carM = null; return; }
        if (!carM) { var el = document.createElement("div"); el.className = "mk-car"; el.textContent = "🚕"; carM = new g.marker.AdvancedMarkerElement({ map: m, content: el }); }
        carM.position = { lat: c.lat, lng: c.lng };
      },
      show: function (pick, dest, polyline) {
        if (!hasXY(pick) && !hasXY(dest)) { box.hidden = true; return; }
        loadMaps().then(function (G) {
          if (!G || mapsBroken) return;
          g = G.maps;
          box.hidden = false;
          if (!m) {
            m = new g.Map(el, { mapId: C.mapId || "DEMO_MAP_ID", center: pick && hasXY(pick) ? pick : C.base, zoom: 13,
              disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false, colorScheme: "DARK" });
          }
          var Adv = g.marker && g.marker.AdvancedMarkerElement;
          if (a) a.map = null;
          if (b) b.map = null;
          if (line) line.setMap(null);
          a = b = line = null;
          if (Adv && hasXY(pick)) a = new Adv({ map: m, position: { lat: pick.lat, lng: pick.lng }, content: pinEl("mk-a") });
          if (Adv && hasXY(dest)) b = new Adv({ map: m, position: { lat: dest.lat, lng: dest.lng }, content: pinEl("mk-b") });
          if (hasXY(pick) && hasXY(dest)) {
            var path = polyline && g.geometry ? g.geometry.encoding.decodePath(polyline) : [pick, dest];
            line = new g.Polyline({ map: m, path: path, strokeColor: "#4D86FF", strokeOpacity: polyline ? 0.95 : 0, strokeWeight: 5,
              icons: polyline ? [] : [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#4D86FF", scale: 3 }, offset: "0", repeat: "14px" }] });
            var bounds = new g.LatLngBounds(); path.forEach(function (p) { bounds.extend(p); });
            m.fitBounds(bounds, 48);
          } else {
            m.setCenter(hasXY(pick) ? pick : dest); m.setZoom(15);
          }
        });
      },
    };
  }

  /* ---------- address search: our /api asks Google (Places API New), so no key sits in the page ---------- */
  function uuid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function Autocomplete(input, list, onPick) {
    var token = null, timer = null, items = [], active = -1, seq = 0;
    function close() { list.hidden = true; list.innerHTML = ""; items = []; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
    function highlight(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (li, k) { li.setAttribute("aria-selected", k === i ? "true" : "false"); });
      if (i >= 0) input.setAttribute("aria-activedescendant", list.id + "-" + i);
    }
    function render() {
      if (!items.length || document.activeElement !== input) { close(); return; }
      list.innerHTML = items.map(function (p, i) {
        return '<li role="option" id="' + list.id + "-" + i + '" data-i="' + i + '"><b>' + escH(p.main) + "</b><small>" + escH(p.sub) + "</small></li>";
      }).join("");
      list.hidden = false; input.setAttribute("aria-expanded", "true"); active = -1;
    }
    function search(q) {
      if (!token) token = uuid();
      var my = ++seq;
      api("/api/places?q=" + encodeURIComponent(q) + "&s=" + token, null, 8000).then(function (r) {
        if (my !== seq) return;
        items = r.suggestions || []; render();
      }).catch(function () { close(); });
    }
    function pick(i) {
      var it = items[i]; if (!it) return;
      var label = it.main + (it.sub ? ", " + it.sub : "");
      input.value = label; close();
      var s = token; token = null;
      onPick({ address: label, lat: null, lng: null, pending: true });
      api("/api/place?id=" + encodeURIComponent(it.id) + "&s=" + (s || ""), null, 8000).then(function (p) {
        if (p._ok && p.lat != null) { input.value = p.address || label; onPick({ address: p.address || label, lat: p.lat, lng: p.lng }); }
        else onPick({ address: label, lat: null, lng: null });
      }).catch(function () { onPick({ address: label, lat: null, lng: null }); });
    }
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3) { close(); return; }
      timer = setTimeout(function () { search(q); }, 250);
    });
    input.addEventListener("keydown", function (e) {
      if (list.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(Math.min(items.length - 1, active + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(Math.max(0, active - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); pick(active >= 0 ? active : 0); }
      else if (e.key === "Escape") { close(); }
    });
    list.addEventListener("mousedown", function (e) {
      var li = e.target.closest("li"); if (!li) return;
      e.preventDefault(); pick(parseInt(li.getAttribute("data-i"), 10));
    });
    input.addEventListener("blur", function () { setTimeout(close, 150); });
  }

  // typed address without picking a suggestion -> coordinates
  function geocode(text) {
    if (!text) return Promise.resolve(null);
    return api("/api/geocode?q=" + encodeURIComponent(text), null, 8000).then(function (r) { return r._ok ? r.place : null; }).catch(function () { return null; });
  }
  // GPS position -> street address
  function reverse(p) {
    return api("/api/geocode?lat=" + p.lat.toFixed(6) + "&lng=" + p.lng.toFixed(6), null, 8000)
      .then(function (r) { return r._ok && r.address ? r.address : null; }).catch(function () { return null; });
  }

  /* ---------- booking form ---------- */
  var form = $("booking");
  if (form) initBooking(form);

  function initBooking(form) {
    var S = { pickup: null, dest: null, quote: null, mode: form.getAttribute("data-mode") || "now" };
    var pIn = $("pickup"), dIn = $("dest"), err = $("form-error"), btn = $("book-btn"), gps = $("gps");
    T.fromPh = pIn.placeholder;
    var me = Account.on && Account.get();
    if (me) { if (me.name && !$("name").value) $("name").value = me.name; if (me.phone && !$("tel").value) $("tel").value = me.phone; }
    var map = $("map") ? TripMap($("map")) : null, qSeq = 0, warmed = false;

    // load Google only once the visitor starts using the form
    form.addEventListener("focusin", function () { if (!warmed) { warmed = true; loadMaps(); } });

    try { var pre = JSON.parse(form.getAttribute("data-dest") || "null"); if (pre) { S.dest = pre; dIn.value = pre.address; } } catch (e) {}
    // "Zarezerwuj na później" from a declined ride: same route, later mode
    if (location.hash === "#again") {
      try {
        var last = JSON.parse(localStorage.getItem("taxi.last") || "null");
        if (last) {
          S.pickup = last.pickup; S.dest = last.dest; pIn.value = last.pickup ? last.pickup.address : ""; dIn.value = last.dest ? last.dest.address : "";
          $("pax").value = last.pax || "1"; $("name").value = last.name || ""; $("tel").value = last.phone || ""; if (last.flight) $("flight").value = last.flight;
          S.mode = "later";
          setTimeout(function () { form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); $("time").focus(); }, 300);
        }
      } catch (e) {}
    }

    // night (Warsaw time): no "now" rides, only earlier reservations
    var NI = C.night;
    function hm(s) { return +s.slice(0, 2) * 60 + +s.slice(3, 5); }
    function nightAt(ms) {
      if (!NI) return false;
      var m = hm(new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
      var f = hm(NI.from), t = hm(NI.to);
      return f > t ? m >= f || m < t : m >= f && m < t;
    }
    var nightTxt = NI ? { from: NI.from, to: NI.to, ahead: NI.ahead_min } : {};
    function nightCheck() {
      var night = nightAt(Date.now()), nb = form.querySelector('.seg-btn[data-mode="now"]');
      if (nb) { nb.classList.toggle("off", night); nb.setAttribute("aria-disabled", night ? "true" : "false");
        var sm = nb.querySelector("small"); if (sm) { if (!sm.getAttribute("data-day")) sm.setAttribute("data-day", sm.textContent); sm.textContent = night ? T.nightTag : sm.getAttribute("data-day"); } }
      return night;
    }
    function setMode(m) {
      if (m === "now" && nightCheck()) { m = "later"; err.textContent = fmt(T.nightNow, nightTxt); }
      else if (err.textContent === fmt(T.nightNow, nightTxt)) err.textContent = "";
      S.mode = m; form.setAttribute("data-mode", m);
      Array.prototype.forEach.call(form.querySelectorAll(".seg-btn"), function (b) { b.setAttribute("aria-checked", b.getAttribute("data-mode") === m ? "true" : "false"); });
      Array.prototype.forEach.call(form.querySelectorAll(".later-only"), function (el) { el.hidden = m !== "later"; });
      if (m === "later") {
        var d = $("date");
        var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        d.min = today.toISOString().slice(0, 10);
        if (!d.value) { var t = new Date(Date.now() + 864e5); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); d.value = t.toISOString().slice(0, 10); }
      }
      quote();
    }
    Array.prototype.forEach.call(form.querySelectorAll(".seg-btn"), function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
    });

    function setPoint(which, p) {
      S[which] = p;
      (which === "pickup" ? pIn : dIn).value = p ? p.address : "";
      quote();
    }
    Autocomplete(pIn, $("pickup-list"), function (p) { S.pickup = p; quote(); });
    Autocomplete(dIn, $("dest-list"), function (p) { S.dest = p; quote(); });
    [[pIn, "pickup"], [dIn, "dest"]].forEach(function (x) {
      var el = x[0], which = x[1];
      el.addEventListener("input", function () { S[which] = el.value.trim() ? { address: el.value.trim(), lat: null, lng: null } : null; S.quote = null; showQuote(); });
      el.addEventListener("change", function () {
        var p = S[which];
        if (p && !hasXY(p) && !p.pending) geocode(p.address).then(function (g) { if (g && S[which] === p) { S[which] = g; el.value = g.address; quote(); } });
      });
    });

    // "Tu jestem": show a quick (cached / wifi) position at once, then sharpen it with GPS for a few seconds
    var watchId = null, gpsTimer = null;
    function stopGps() {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null; clearTimeout(gpsTimer);
      gps.classList.remove("busy"); gps.disabled = false; pIn.classList.remove("locating");
    }
    if (gps) gps.addEventListener("click", function () {
      if (!navigator.geolocation) { err.textContent = T.gpsFail; return; }
      stopGps(); err.textContent = "";
      gps.classList.add("busy"); gps.disabled = true; pIn.classList.add("locating");
      pIn.value = ""; pIn.placeholder = T.locating;
      var best = null, named = null, got = false, p = null;
      function use(pos) {
        var c = pos.coords;
        if (best && c.accuracy >= best.accuracy) return;
        best = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy };
        got = true;
        p = { address: p ? p.address : T.myLoc, lat: best.lat, lng: best.lng, gps: true };
        S.pickup = p; pIn.value = p.address; pIn.placeholder = T.fromPh;
        err.textContent = c.accuracy > 150 ? fmt(T.gpsRough, { m: Math.round(c.accuracy) }) : "";
        quote();
        // ask for the street name only when the position moved noticeably
        if (!named || Math.abs(named.lat - best.lat) + Math.abs(named.lng - best.lng) > 0.0005) {
          named = { lat: best.lat, lng: best.lng };
          var mine = p;
          reverse(mine).then(function (a) { if (a && S.pickup === mine) { mine.address = a; pIn.value = a; } });
        }
        if (c.accuracy <= 40) stopGps();
      }
      function fail(e) {
        if (got) return;
        stopGps(); pIn.placeholder = T.fromPh;
        err.textContent = e && e.code === 1 ? T.gpsDenied : T.gpsFail;
      }
      navigator.geolocation.getCurrentPosition(use, function () {}, { enableHighAccuracy: false, maximumAge: 300000, timeout: 4000 });
      watchId = navigator.geolocation.watchPosition(use, fail, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      gpsTimer = setTimeout(function () { if (!got) fail(null); stopGps(); }, 15000);
    });
    pIn.addEventListener("input", function () { if (watchId != null) stopGps(); });

    var sw = $("swap");
    if (sw) sw.addEventListener("click", function () {
      var a = S.pickup; S.pickup = S.dest; S.dest = a;
      pIn.value = S.pickup ? S.pickup.address : ""; dIn.value = S.dest ? S.dest.address : "";
      sw.classList.toggle("flip"); quote();
    });

    Array.prototype.forEach.call(form.querySelectorAll(".chip"), function (c) {
      c.addEventListener("click", function () {
        var x = (C.chips || [])[parseInt(c.getAttribute("data-chip"), 10)];
        if (x) setPoint("dest", { address: x.address, lat: x.lat, lng: x.lng });
      });
    });

    function fmtDur(s) {
      var m = Math.max(1, Math.round(s / 60));
      return m < 60 ? m + " " + T.min : Math.floor(m / 60) + " " + T.h + " " + (m % 60) + " " + T.min;
    }
    function showQuote() {
      var q = S.quote, box = $("quote");
      if (!q) { box.hidden = true; return; }
      box.hidden = false;
      $("q-dist").textContent = q.distanceM ? (q.distanceM / 1000).toFixed(q.distanceM < 10000 ? 1 : 0).replace(".", lang === "pl" ? "," : ".") + " " + T.km : "–";
      $("q-time").textContent = q.durationS ? fmtDur(q.durationS) : "–";
      $("q-price-lbl").textContent = q.priceKind === "fixed" ? T.priceFixed : T.priceEst;
      $("q-price").textContent = q.price ? q.price + " zł" : T.priceNone;
      box.classList.toggle("approx", !!q.approx);
      var eta = $("q-eta");
      if (S.mode === "now" && q.approachS) { eta.hidden = false; eta.textContent = fmt(T.etaNow, { m: Math.max(5, Math.round(q.approachS / 60) + 3) }); }
      else eta.hidden = true;
      if (!reduce) { box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop"); }
    }
    function localQuote() {   // no backend (e.g. local preview): straight line estimate, no price
      var R = 6371, r = Math.PI / 180, a = S.pickup, b = S.dest;
      var s = Math.pow(Math.sin((b.lat - a.lat) * r / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin((b.lng - a.lng) * r / 2), 2);
      var km = 2 * R * Math.asin(Math.sqrt(s)) * 1.3;
      return { distanceM: km * 1000, durationS: km / 55 * 3600 + 120, approx: true, price: null };
    }
    function quote() {
      if (map) map.show(S.pickup, S.dest, null);
      updateFlightBox();
      if (!hasXY(S.pickup) || !hasXY(S.dest)) { S.quote = null; showQuote(); return; }
      var my = ++qSeq;
      api("/api/quote", { pickup: S.pickup, dest: S.dest, mode: S.mode }, 12000).then(function (q) {
        if (my !== qSeq) return;
        S.quote = q._ok ? q : localQuote(); showQuote();
        if (map) map.show(S.pickup, S.dest, S.quote.polyline);
      }).catch(function () { if (my === qSeq) { S.quote = localQuote(); showQuote(); } });
    }


    /* ---------- flight number -> next flight, date, time, status (AeroDataBox via /api/flight) ---------- */
    var fWrap = $("flight-wrap"), fIn = $("flight"), fInfo = $("flight-info"), fTimer = null, fSeq = 0, fLast = null;
    var fLegs = [], fSel = 0, dateTouched = false, timeTouched = false;
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function nearAirport(p) {
      return hasXY(p) && (C.airports || []).some(function (a) { return Math.abs(a.lat - p.lat) + Math.abs(a.lng - p.lng) < 0.06; });
    }
    function updateFlightBox() {
      if (fWrap) fWrap.hidden = !(S.mode === "later" || nearAirport(S.pickup) || nearAirport(S.dest) || fIn.value.trim());
    }
    function dayLabel(date) {
      return new Date(date + "T12:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "pl-PL", { weekday: "short", day: "numeric", month: "short" });
    }
    // flight time +/- minutes, rounded to 5 min, as {date, time}
    function shift(date, time, mins, up) {
      var d = new Date(date + "T" + time + ":00"); d.setMinutes(d.getMinutes() + mins);
      var m = d.getMinutes(); d.setMinutes(up ? Math.ceil(m / 5) * 5 : Math.floor(m / 5) * 5);
      return { date: ymd(d), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
    }
    function suggestion(f) {
      if (f.kind === "dep" && f.dep.time && f.dep.date) {
        var drive = S.quote && S.quote.durationS ? Math.round(S.quote.durationS / 60) + 10 : 70;
        return { at: shift(f.dep.date, f.dep.time, -(120 + drive), false), text: T.flSugDep };
      }
      if (f.kind === "arr" && f.arr.time && f.arr.date) return { at: shift(f.arr.date, f.arr.time, 20, true), text: T.flSugArr };
      return null;
    }
    function applyPickup(at) {
      if (S.mode !== "later") setMode("later");
      $("date").value = at.date; $("time").value = at.time;
      [$("date"), $("time")].forEach(function (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });
    }
    function renderFlight() {
      var f = fLegs[fSel]; if (!f) return;
      var sug = suggestion(f);
      var end = function (e, lbl) {
        var late = e.time && e.scheduled && e.time !== e.scheduled;
        return "<span><small>" + lbl + " · " + escH(dayLabel(e.date)) + "</small><b>" + escH(e.time || "–") + "</b>" + (late ? "<s>" + escH(e.scheduled) + "</s>" : "") +
          "<em>" + escH(e.iata ? e.iata + " · " + e.name : e.name) + "</em></span>";
      };
      var days = fLegs.length > 1 ? '<div class="fl-days"><small>' + escH(T.flOther) + "</small>" + fLegs.map(function (l, i) {
        var e = l.kind === "arr" ? l.arr : l.dep;
        return '<button type="button" data-leg="' + i + '"' + (i === fSel ? ' aria-pressed="true"' : "") + ">" + escH(dayLabel(e.date)) + "</button>";
      }).join("") + "</div>" : "";
      fInfo.className = "flight-info";
      fInfo.innerHTML = '<div class="fl-head"><b>' + escH(f.number) + "</b> " + escH(f.airline) +
        (f.status && f.status !== "Unknown" ? ' <span class="fl-st' + (/Delayed|Cancel|Diverted/.test(f.status) ? " bad" : "") + '">' + escH(T.flStatus[f.status] || f.status) + "</span>" : "") + "</div>" +
        '<div class="fl-route">' + end(f.dep, T.flDep) + '<i aria-hidden="true">✈</i>' + end(f.arr, T.flArr) + "</div>" +
        (sug ? '<p class="fl-sug"><span>' + escH(fmt(sug.text, { t: sug.at.time, d: dayLabel(sug.at.date) })) + "</span>" +
          (timeTouched ? '<button type="button" class="fl-use">' + escH(T.flUse) + "</button>" : '<span class="fl-ok">✓ ' + escH(T.flSet) + "</span>") + "</p>" : "") + days;
      if (sug && !timeTouched) applyPickup(sug.at);
      var use = fInfo.querySelector(".fl-use");
      if (use) use.addEventListener("click", function () { timeTouched = false; applyPickup(sug.at); renderFlight(); });
      Array.prototype.forEach.call(fInfo.querySelectorAll("[data-leg]"), function (b) {
        b.addEventListener("click", function () { fSel = parseInt(b.getAttribute("data-leg"), 10); renderFlight(); });
      });
    }
    function lookupFlight() {
      var no = fIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!/^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/.test(no)) { fInfo.hidden = true; fLast = null; fLegs = []; return; }
      // a date the customer picked themselves wins; otherwise find the next flight with this number
      var date = S.mode === "later" && dateTouched && $("date").value ? $("date").value : "";
      var key = no + "|" + date; if (key === fLast) return; fLast = key;
      var my = ++fSeq;
      fInfo.hidden = false; fInfo.className = "flight-info loading"; fInfo.innerHTML = '<span class="spin" aria-hidden="true"></span> ' + escH(T.flLooking);
      api("/api/flight?no=" + no + (date ? "&date=" + date : ""), null, 15000).then(function (f) {
        if (my !== fSeq) return;
        if (f._status === 503 || f._status === 403) { fInfo.hidden = true; return; }   // lookup not set up: plain text field
        if (!f._ok || !f.found) {
          fInfo.className = "flight-info warn";
          fInfo.textContent = date ? fmt(T.flNone, { no: no, date: dayLabel(date) }) : fmt(T.flNoneWeek, { no: no });
          fLegs = []; return;
        }
        fLegs = f.legs || [f]; fSel = 0; renderFlight();
      }).catch(function () { if (my === fSeq) fInfo.hidden = true; });
    }
    if (fIn) {
      fIn.addEventListener("input", function () { clearTimeout(fTimer); fTimer = setTimeout(lookupFlight, 600); });
      fIn.addEventListener("change", lookupFlight);
      $("date").addEventListener("change", function () { dateTouched = true; if (fIn.value) lookupFlight(); });
      $("time").addEventListener("change", function () { timeTouched = true; if (fLegs.length) renderFlight(); });
    }

    function payload() {
      return {
        mode: S.mode, pickup: S.pickup, dest: S.dest, lang: lang,
        when: S.mode === "later" ? $("date").value + "T" + $("time").value : null,
        pax: $("pax").value, luggage: $("lug").value, name: $("name").value, phone: $("tel").value,
        flight: $("flight").value, notes: $("notes").value, returnTrip: S.mode === "later" ? $("back").value : "",
        website: $("website").value,
      };
    }
    function validate() {
      if (!S.pickup || !S.pickup.address) { pIn.focus(); return T.errFrom; }
      if (!S.dest || !S.dest.address) { dIn.focus(); return T.errTo; }
      if (S.mode === "later") {
        var d = $("date").value, t = $("time").value;
        if (!d || !t || new Date(d + "T" + t).getTime() < Date.now() + 14 * 60000) { (d ? $("time") : $("date")).focus(); return T.errWhen; }
        var at = new Date(d + "T" + t).getTime();
        if (NI && nightAt(at) && at < Date.now() + NI.ahead_min * 60000) { $("time").focus(); return fmt(T.errNight, nightTxt); }
      }
      if ($("tel").value.replace(/\D/g, "").length < 9) { $("tel").focus(); return T.errPhone; }
      return null;
    }
    function message(p) {
      var L = [T.msgHead, T.route + ": " + p.pickup.address + " → " + p.dest.address, p.when ? T.when + ": " + p.when.replace("T", " ") : T.whenNow, T.pax + ": " + p.pax];
      [["luggage", T.lug], ["flight", T.flight], ["returnTrip", T.back], ["name", T.name], ["phone", T.phone], ["notes", T.notes]].forEach(function (o) {
        if (p[o[0]] && String(p[o[0]]).trim()) L.push(o[1] + ": " + String(p[o[0]]).trim());
      });
      if (S.quote && S.quote.price) L.push((S.quote.priceKind === "fixed" ? T.priceFixed : T.priceEst) + ": " + S.quote.price + " zł");
      return L.join("\n");
    }
    function fallback(p) {
      var m = encodeURIComponent(message(p)), ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      err.innerHTML = escH(T.errSend) + '<span class="fb-btns"><a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/' + C.wa + "?text=" + m + '">WhatsApp</a>' +
        '<a class="btn btn-sms" href="sms:' + C.tel + (ios ? "&" : "?") + "body=" + m + '">SMS</a></span>';
    }
    $("send-wa").addEventListener("click", function () {
      if (S.pickup && S.dest) this.href = "https://wa.me/" + C.wa + "?text=" + encodeURIComponent(message(payload()));
    });

    var busy = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      var v = validate(); err.textContent = v || ""; if (v) return;
      busy = true; btn.classList.add("busy"); btn.setAttribute("aria-busy", "true");
      var old = btn.innerHTML; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + escH(T.sending);
      var fix = [];
      ["pickup", "dest"].forEach(function (w) {
        if (!hasXY(S[w])) fix.push(geocode(S[w].address).then(function (g) { if (g) S[w] = { address: S[w].address, lat: g.lat, lng: g.lng }; }));
      });
      Promise.all(fix).then(function () {
        var p = payload();
        return api("/api/rides", p, 20000).then(function (r) {
          if (r._ok && r.id) {
            Rides.add({ id: r.id, token: r.token, created: Date.now(), mode: p.mode, when: p.when });
            try { localStorage.setItem("taxi.last", JSON.stringify({ pickup: p.pickup, dest: p.dest, pax: p.pax, name: p.name, phone: p.phone, flight: p.flight })); } catch (e) {}
            location.href = "/przejazd/?id=" + r.id + (lang === "en" ? "&lang=en" : "");
            return;
          }
          if (r._status === 429) err.textContent = T.errMany;
          else if (r.error === "night") { err.textContent = fmt(T.errNight, nightTxt); if (p.mode === "now") setMode("later"); }
          else fallback(p);
          throw 0;
        }, function () { fallback(p); throw 0; });
      }).catch(function () {
        busy = false; btn.classList.remove("busy"); btn.removeAttribute("aria-busy"); btn.innerHTML = old;
      });
    });

    setMode(S.mode);
    setInterval(function () { if (nightCheck() && S.mode === "now") setMode("later"); }, 60000);
  }

  /* ---------- ride status page ---------- */
  var track = $("track");
  if (track) initTrack();

  function initTrack() {
    var id = new URLSearchParams(location.search).get("id") || (Rides.active() || {}).id;
    var tok = new URLSearchParams(location.search).get("t");
    if (id && tok && /^[a-z0-9]{24}$/.test(tok) && !Rides.get(id)) Rides.add({ id: id, token: tok, created: Date.now(), mode: "now" });
    if (tok) try { history.replaceState(null, "", location.pathname + "?id=" + id + (lang === "en" ? "&lang=en" : "")); } catch (e) {}
    var mine = id && Rides.get(id), last = null, skew = 0, total = 0, timer = null, tick = null, fails = 0;
    var map = TripMap($("t-map")), mapDone = false;
    if (lang === "en") {
      document.querySelector(".track-actions .btn-call").lastChild.textContent = " " + T.call;
      $("t-cancel").textContent = T.cancel; $("t-new").textContent = T.newRide; $("t-new").href = "/en/#booking";
    }

    function whenTxt(r) {
      if (!r.when) return T.d.now;
      var d = new Date(r.when);
      return d.toLocaleString(lang === "en" ? "en-GB" : "pl-PL", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    }
    function clock(ms) { return new Date(ms).toLocaleTimeString(lang === "en" ? "en-GB" : "pl-PL", { hour: "2-digit", minute: "2-digit" }); }

    function steps(r) {
      var order = r.mode === "now" ? ["sent", "confirmed", "arrived", "ontrip", "done"] : ["sent", "scheduled", "enroute", "arrived", "ontrip", "done"];
      var at = { pending: 0, scheduled: 1, enroute: r.mode === "now" ? 1 : 2, arrived: order.indexOf("arrived"), ontrip: order.indexOf("ontrip"), done: order.length - 1 }[r.status];
      var failed = at == null;
      $("t-steps").innerHTML = order.map(function (k, i) {
        var cls = failed ? (i === 0 ? "done" : "off") : i < at || r.status === "done" ? "done" : i === at ? "now" : "";
        return '<li class="' + cls + '"><span></span>' + escH(T.steps[k]) + "</li>";
      }).join("");
    }

    function render(r) {
      var key = r.status === "pending" ? (r.mode === "now" ? "pending_now" : "pending_later")
        : r.status === "cancelled" && r.cancelledBy === "driver" ? "cancelled_driver" : r.status;
      var waiting = r.status === "pending" && r.mode === "now" && Date.now() + skew - r.created > (r.waitMin || 3) * 60000;
      var txt = T.st[waiting ? "waiting" : key] || T.st.notfound;
      var o = { when: whenTxt(r), clock: r.etaAt ? clock(r.etaAt - skew) : "", dclock: destAt(r) ? clock(destAt(r) - skew) : "–" };
      $("t-kicker").textContent = T.kicker[r.mode] || "";
      $("t-title").textContent = fmt(txt[0], o);
      $("t-sub").textContent = fmt(txt[1], o);
      $("t-visual").setAttribute("data-state", waiting ? "waiting" : r.status);
      track.setAttribute("data-state", r.status);
      track.classList.toggle("urgent", waiting || ["declined", "expired"].indexOf(r.status) >= 0);
      document.title = $("t-title").textContent + " | Taxi Knurów";
      steps(r);
      var open = ["pending", "scheduled", "enroute", "arrived", "ontrip"].indexOf(r.status) >= 0;
      var busy = r.status === "declined" || r.status === "expired" || r.status === "noshow" || (r.status === "cancelled" && r.cancelledBy === "driver");
      track.classList.toggle("busy", busy);
      $("t-steps").hidden = busy;
      $("t-later").hidden = !busy;
      $("t-cancel").hidden = !(open && mine && mine.token);
      $("t-cancel").textContent = r.status === "ontrip" ? T.stop : T.cancel;
      if (map.car) map.car(r.car);
      $("t-new").hidden = open;
      if (r.status === "done") {
        $("t-new").hidden = false; $("t-new").href = C.review || C.maps; $("t-new").textContent = T.review; $("t-new").target = "_blank";
      }
      if (!open) Rides.close(r.id);

      var dl = [[T.d.from, r.pickup && r.pickup.address], [T.d.to, r.dest && r.dest.address], [T.d.when, whenTxt(r)], [T.d.pax, r.pax]];
      if (r.distanceM) dl.push([T.d.dist, (r.distanceM / 1000).toFixed(1).replace(".", lang === "pl" ? "," : ".") + " km · ~" + Math.round(r.durationS / 60) + " min"]);
      if (r.price) dl.push([T.d.price, (r.priceKind === "fixed" ? "" : "~") + r.price + " zł"]);
      if (r.flightInfo || r.flight) dl.push([T.d.flight, r.flightInfo || r.flight]);
      $("t-details").innerHTML = dl.map(function (x) { return "<div><dt>" + escH(x[0]) + "</dt><dd>" + escH(x[1]) + "</dd></div>"; }).join("");
      if (!mapDone) { mapDone = true; map.show(r.pickup, r.dest, r.polyline); }

      if (last && last.status !== r.status) alertChange();
      last = r;
      countdown();
    }

    function destAt(r) { return r && r.destEtaAt ? r.destEtaAt : r && r.startedAt && r.durationS ? r.startedAt + r.durationS * 1000 : null; }
    // the little taxi drives along the road: by live GPS distance when the driver shares it, otherwise by time
    function countdown() {
      var r = last, eta = $("t-eta"), bar = $("t-progress"), note = $("t-car");
      var trip = r && r.status === "ontrip", end = r && (trip ? destAt(r) : r.etaAt);
      if (!r || !(r.status === "enroute" || trip) || !end) { eta.hidden = true; bar.hidden = true; note.hidden = true; return; }
      var now = Date.now() + skew, left = end - now;
      var start = trip ? r.startedAt : (r.enrouteAt || r.updated);
      var p = Math.min(1, Math.max(0, (now - start) / Math.max(60000, end - start)));
      if (r.car && r.car.km != null && r.car.startKm) p = Math.min(1, Math.max(0, 1 - r.car.km / r.car.startKm));
      eta.hidden = false; bar.hidden = false;
      var m = Math.ceil(left / 60000);
      $("t-eta-min").textContent = m > 0 ? m : "0";
      $("t-eta-lbl").textContent = m > 0 ? (trip ? T.destLbl : T.etaLbl) : T.anyMoment;
      $("t-eta-at").textContent = fmt(T.at, { clock: clock(end - skew) });
      bar.style.setProperty("--p", (Math.max(0.03, p) * 100).toFixed(1) + "%");
      bar.classList.toggle("trip", trip); bar.classList.toggle("has-car", !!r.car);
      var km = r.roadKm != null ? r.roadKm : r.car && r.car.km;
      note.hidden = km == null;
      if (!note.hidden) note.textContent = fmt(trip ? T.carKmDest : T.carKm, { km: String(km).replace(".", lang === "pl" ? "," : ".") }) + (r.etaSource === "google" ? T.byGoogle : "");
    }

    function alertChange() {
      try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
      try {
        var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
        var ctx = new A(), o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.5);
      } catch (e) {}
    }

    function poll() {
      clearTimeout(timer);
      api("/api/rides/" + encodeURIComponent(id), null, 10000, { "X-Ride-Token": mine.token }).then(function (r) {
        if (r._status === 404) { notFound(); return; }
        if (!r._ok) throw 0;
        fails = 0; $("t-sub").classList.remove("muted");
        skew = r.now ? r.now - Date.now() : 0;
        render(r);
        var next = { pending: 4000, enroute: 5000, arrived: 6000, ontrip: 10000, scheduled: 30000 }[r.status];
        if (next) timer = setTimeout(poll, document.hidden ? next * 3 : next);
      }).catch(function () {
        fails++;
        if (!last) { $("t-sub").textContent = T.offline; }
        timer = setTimeout(poll, Math.min(30000, 3000 * fails));
      });
    }
    function notFound() {
      $("t-title").textContent = T.st.notfound[0]; $("t-sub").textContent = T.st.notfound[1];
      $("t-visual").setAttribute("data-state", "declined"); $("t-new").hidden = false; $("t-steps").innerHTML = "";
      if (id) Rides.close(id);
    }

    $("t-cancel").addEventListener("click", function () {
      if (!mine || !window.confirm(last && last.status === "ontrip" ? T.stopQ : T.cancelQ)) return;
      this.disabled = true;
      api("/api/rides/" + id + "/cancel", { token: mine.token }).then(function (r) { if (r._ok) render(r); }).finally(function () { $("t-cancel").disabled = false; });
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && last) poll(); });

    if (!id) { notFound(); return; }
    if (!mine || !mine.token) {   // someone else's link: the ride stays private
      $("t-title").textContent = T.st.private[0]; $("t-sub").textContent = T.st.private[1];
      $("t-visual").setAttribute("data-state", "declined"); $("t-new").hidden = false; $("t-steps").innerHTML = "";
      if (Account.on && !Account.get()) {
        $("t-login").hidden = false;
        $("t-login").href = "/konto/?next=" + encodeURIComponent(location.pathname + location.search);
      }
      return;
    }
    poll();
    tick = setInterval(function () {
      countdown();
      if (last && last.status === "pending") render(last);   // switches to "call us" after a few minutes
    }, 1000);
  }

  /* ---------- account page ---------- */
  if ($("acct")) initAccount();
  function initAccount() {
    var ST = { pending: "czeka na kierowcę", scheduled: "potwierdzony", enroute: "kierowca jedzie", arrived: "kierowca czeka", ontrip: "w trasie",
               done: "zakończony", declined: "kierowca zajęty", cancelled: "anulowany", expired: "bez odpowiedzi", noshow: "nieodebrany" };
    var LIVE = ["pending", "scheduled", "enroute", "arrived", "ontrip"];
    var next = new URLSearchParams(location.search).get("next");
    if (next && !/^\/[a-z0-9\-\/]*\/?(\?[a-z0-9=&\-]*)?$/i.test(next)) next = null;   // only our own pages
    function show(id) { ["acct-out", "acct-in", "acct-off"].forEach(function (x) { $(x).hidden = x !== id; }); }
    function when(x) {
      var d = new Date(x.when || x.created);
      return d.toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    function signedIn(j) {
      var u = j.user; show("acct-in");
      $("acct-hello").textContent = "Cześć" + (u.name ? ", " + u.name : "") + "!";
      $("acct-email").textContent = u.email || "";
      if (u.picture) { $("acct-pic").src = u.picture; $("acct-pic").hidden = false; $("acct-ini").hidden = true; }
      else $("acct-ini").textContent = (u.name || u.email || "?").charAt(0).toUpperCase();
      $("acct-n").value = u.name || ""; $("acct-t").value = u.phone || "";
      var rides = j.rides || [];
      $("acct-rides").innerHTML = rides.length ? rides.map(function (x) {
        var live = LIVE.indexOf(x.status) >= 0;
        var st = x.status === "cancelled" && x.cancelledBy === "driver" ? "anulowany przez kierowcę" : ST[x.status] || x.status;
        return '<li><a href="/przejazd/?id=' + x.id + '"' + (live ? ' class="live-ride"' : "") + '>'
          + '<span class="ar-when">' + escH(x.mode === "later" ? when(x) : when(x) + " · teraz") + '</span>'
          + '<span class="ar-route"><b>' + escH(x.from) + '</b><i aria-hidden="true">→</i><b>' + escH(x.to) + '</b></span>'
          + '<span class="ar-meta"><span class="ar-st st-' + escH(x.status) + '">' + escH(st) + '</span>'
          + (x.price ? '<span>' + (x.priceKind === "fixed" ? "" : "~") + x.price + ' zł</span>' : "") + '</span></a></li>';
      }).join("") : '<li class="ar-empty">Nie masz jeszcze przejazdów z ostatnich 30 dni.</li>';
    }
    function load() {
      return Account.sync().then(function (j) {
        if (j.user) { if (next) { location.replace(next); return; } signedIn(j); }
        else signedOut();
      });
    }
    function signedOut() {
      show("acct-out");
      googleButton($("g-btn"), function () { load(); }, function () {
        $("acct-err").hidden = false; $("acct-err").textContent = "Nie udało się zalogować. Spróbuj ponownie.";
      });
    }
    if (!Account.on) { show("acct-off"); return; }
    load().catch(function () { if (Account.get()) { $("acct-err").hidden = false; $("acct-err").textContent = "Brak połączenia. Spróbuj za chwilę."; } signedOut(); });

    $("acct-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var saved = $("acct-saved");
      api("/api/me", { name: $("acct-n").value, phone: $("acct-t").value }).then(function (j) {
        saved.hidden = false; saved.textContent = j._ok ? "Zapisano ✓" : (j.error === "phone" ? "Sprawdź numer telefonu" : "Nie zapisano – spróbuj ponownie");
        if (j._ok) { var u = Account.get() || {}; u.name = $("acct-n").value.trim(); u.phone = $("acct-t").value.trim(); Account.set(u); accountLink(); }
        setTimeout(function () { saved.hidden = true; }, 3000);
      });
    });
    $("acct-logout").addEventListener("click", function () {
      api("/api/auth/logout", {}).finally(function () {
        Account.set(null);
        // a shared phone: the account's rides leave with the account
        try { localStorage.removeItem("taxi.rides"); localStorage.removeItem("taxi.last"); } catch (e) {}
        try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
        location.reload();
      });
    });
  }

  /* ---------- "add to home screen" panel (PWA) ---------- */
  (function () {
    var box = $("install"); if (!box) return;
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
    var later = 0; try { later = parseInt(localStorage.getItem("taxi.install") || "0", 10); } catch (e) {}
    if (standalone || Date.now() < later) return;
    var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
    var android = /Android/.test(ua), chromium = !!window.chrome && !/OPR|SamsungBrowser/.test(ua);
    var promptEvt = window.__bip || null, shown = false;
    function show() {
      if (shown) return; shown = true;
      box.hidden = false; box.classList.toggle("is-ios", ios);
      requestAnimationFrame(function () { box.classList.add("open"); });
    }
    function hide(days) {
      box.classList.remove("open");
      setTimeout(function () { box.hidden = true; }, 400);
      try { localStorage.setItem("taxi.install", String(Date.now() + days * 864e5)); } catch (e) {}
    }
    // after a booking the customer is most likely to want it; otherwise wait a bit
    var delay = $("track") ? 2500 : 7000;
    function useEvent(e) { if (ios) return; promptEvt = e; $("install-go").hidden = false; box.querySelector(".install-android").hidden = true; box.querySelector(".install-desktop").hidden = true; }
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); useEvent(e); });
    if (promptEvt) useEvent(promptEvt);
    else if (ios) box.querySelector(".install-ios").hidden = false;
    else if (android) box.querySelector(".install-android").hidden = false;
    else if (chromium) box.querySelector(".install-desktop").hidden = false;
    else return;   // e.g. desktop Firefox: can't install sites, don't nag
    setTimeout(show, delay);
    $("install-go").addEventListener("click", function () {
      if (!promptEvt) return;
      promptEvt.prompt();
      promptEvt.userChoice.then(function (c) { hide(c.outcome === "accepted" ? 3650 : 14); promptEvt = null; });
    });
    $("install-x").addEventListener("click", function () { hide(14); });
    window.addEventListener("appinstalled", function () { hide(3650); });
  })();

  /* ---------- VIP photos: tap to enlarge ---------- */
  var lb = $("lightbox");
  if (lb && lb.showModal) {
    Array.prototype.forEach.call(document.querySelectorAll(".vip-ph"), function (b) {
      b.addEventListener("click", function () {
        lb.querySelector("img").src = b.getAttribute("data-full"); lb.querySelector("p").textContent = b.getAttribute("data-cap") || "";
        lb.showModal();
      });
    });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lb-x")) lb.close(); });
  }

  /* ---------- Google reviews ---------- */
  var rvTrack = $("rv-track");
  if (rvTrack) {
    api("/api/reviews", null, 10000).then(function (d) {
      if (!d || !d.reviews || !d.reviews.length) return;
      if (d.rating) $("g-num").textContent = String(d.rating.toFixed(1)).replace(".", lang === "pl" ? "," : ".");
      if (d.count) $("g-count").textContent = d.count + (lang === "pl" ? " opinii w Google" : " Google reviews");
      if (d.url) $("rv-all").href = d.url;
      var star = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z"/></svg>';
      rvTrack.innerHTML = d.reviews.map(function (v, i) {
        var initial = escH((v.author || "?").trim().charAt(0).toUpperCase());
        var av = v.photo ? '<img src="' + escH(v.photo) + '" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer">' : "<span>" + initial + "</span>";
        var name = v.authorUri ? '<a href="' + escH(v.authorUri) + '" target="_blank" rel="noopener">' + escH(v.author) + "</a>" : escH(v.author);
        var long = v.text.length > 220;
        return '<figure class="rv" style="--i:' + i + '"><div class="rv-stars" aria-label="' + v.rating + '/5">' + new Array(v.rating + 1).join(star) + "</div>" +
          '<blockquote class="' + (long ? "clamp" : "") + '">' + escH(v.text) + "</blockquote>" +
          (long ? '<button type="button" class="rv-more">' + T.rvMore + "</button>" : "") +
          '<figcaption><span class="rv-av">' + av + "</span><span><b>" + name + "</b><small>" + escH(v.when) + " · " + T.rvFrom + "</small></span></figcaption></figure>";
      }).join("");
      Array.prototype.forEach.call(rvTrack.querySelectorAll(".rv-more"), function (b) {
        b.addEventListener("click", function () { var q = b.previousSibling; var c = q.classList.toggle("clamp"); b.textContent = c ? T.rvMore : T.rvLess; });
      });
      var navEl = $("rv-nav");
      if (navEl && rvTrack.scrollWidth > rvTrack.clientWidth + 10) {
        navEl.hidden = false;
        Array.prototype.forEach.call(navEl.querySelectorAll("button"), function (b) {
          b.addEventListener("click", function () {
            var card = rvTrack.querySelector(".rv");
            rvTrack.scrollBy({ left: (card ? card.offsetWidth + 16 : 300) * parseInt(b.getAttribute("data-dir"), 10), behavior: reduce ? "auto" : "smooth" });
          });
        });
      }
    }).catch(function () {});
  }
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
}
