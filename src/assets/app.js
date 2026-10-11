/* Taxi Knurów Adam Mączka – zamawianie kursu (teraz / na później), status na żywo, opinie Google.
   Backend: Cloudflare Pages Functions (/api/*). Bez backendu formularz proponuje WhatsApp / SMS. */
(function () {
  "use strict";
  var C = window.TAXI || {};
  // the ride status page (/przejazd/) is Polish only; the /en/ landing pages keep English
  var lang = !document.getElementById("track") && (C.lang === "en" || /[?&]lang=en\b/.test(location.search)) ? "en" : "pl";
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

  // tiny DOM builder: el("b", "cls", "text") – text is always set with textContent
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

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
    var dot = el("span", "live"); dot.setAttribute("aria-hidden", "true");
    banner.textContent = ""; banner.append(dot, document.createTextNode(T.banner + " →"));
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
    function close() { list.hidden = true; list.textContent = ""; items = []; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
    function highlight(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (li, k) { li.setAttribute("aria-selected", k === i ? "true" : "false"); });
      if (i >= 0) input.setAttribute("aria-activedescendant", list.id + "-" + i);
    }
    function render() {
      if (!items.length || document.activeElement !== input) { close(); return; }
      list.textContent = "";
      items.forEach(function (p, i) {
        var li = el("li"); li.setAttribute("role", "option"); li.id = list.id + "-" + i; li.setAttribute("data-i", String(i));
        li.append(el("b", null, p.main), el("small", null, p.sub)); list.append(li);
      });
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
        var late = e.time && e.scheduled && e.time !== e.scheduled, sp = el("span");
        sp.append(el("small", null, lbl + " · " + dayLabel(e.date)), el("b", null, e.time || "–"));
        if (late) sp.append(el("s", null, e.scheduled));
        sp.append(el("em", null, e.iata ? e.iata + " · " + e.name : e.name));
        return sp;
      };
      fInfo.className = "flight-info"; fInfo.textContent = "";
      var head = el("div", "fl-head"); head.append(el("b", null, f.number), document.createTextNode(" " + (f.airline || "")));
      if (f.status && f.status !== "Unknown") { head.append(document.createTextNode(" "), el("span", "fl-st" + (/Delayed|Cancel|Diverted/.test(f.status) ? " bad" : ""), T.flStatus[f.status] || f.status)); }
      var route = el("div", "fl-route"), plane = el("i", null, "✈"); plane.setAttribute("aria-hidden", "true");
      route.append(end(f.dep, T.flDep), plane, end(f.arr, T.flArr));
      fInfo.append(head, route);
      if (sug) {
        var sp = el("p", "fl-sug"); sp.append(el("span", null, fmt(sug.text, { t: sug.at.time, d: dayLabel(sug.at.date) })));
        if (timeTouched) { var ub = el("button", "fl-use", T.flUse); ub.type = "button"; sp.append(ub); } else sp.append(el("span", "fl-ok", "✓ " + T.flSet));
        fInfo.append(sp);
      }
      if (fLegs.length > 1) {
        var days = el("div", "fl-days"); days.append(el("small", null, T.flOther));
        fLegs.forEach(function (l, i) {
          var e = l.kind === "arr" ? l.arr : l.dep, db = el("button", null, dayLabel(e.date));
          db.type = "button"; db.setAttribute("data-leg", String(i)); if (i === fSel) db.setAttribute("aria-pressed", "true");
          days.append(db);
        });
        fInfo.append(days);
      }
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
      fInfo.hidden = false; fInfo.className = "flight-info loading"; fInfo.textContent = "";
      var spn = el("span", "spin"); spn.setAttribute("aria-hidden", "true"); fInfo.append(spn, document.createTextNode(" " + T.flLooking));
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
      var wa = el("a", "btn btn-wa", "WhatsApp"); wa.target = "_blank"; wa.rel = "noopener"; wa.href = "https://wa.me/" + C.wa + "?text=" + m;
      var sms = el("a", "btn btn-sms", "SMS"); sms.href = "sms:" + C.tel + (ios ? "&" : "?") + "body=" + m;
      var fb = el("span", "fb-btns"); fb.append(wa, sms);
      err.textContent = ""; err.append(document.createTextNode(T.errSend), fb);
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
      var old = Array.prototype.map.call(btn.childNodes, function (n) { return n.cloneNode(true); });
      var sp0 = el("span", "spin"); sp0.setAttribute("aria-hidden", "true"); btn.textContent = ""; btn.append(sp0, document.createTextNode(T.sending));
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
        busy = false; btn.classList.remove("busy"); btn.removeAttribute("aria-busy"); btn.textContent = ""; old.forEach(function (n) { btn.append(n); });
      });
    });

    setMode(S.mode);
    setInterval(function () { if (nightCheck() && S.mode === "now") setMode("later"); }, 60000);
  }

  /* =====================================================================================
     G2 – app-like booking (/rezerwacja/) and ride status (/przejazd/). Polish only.
     All customer, driver, car and address data is written with textContent / setAttribute.
     ===================================================================================== */
  var mk = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var ownPhoto = function (u) { return typeof u === "string" && /^\/api\/photo\/[dc]\/[a-z0-9]{12}\?t=[a-f0-9]{32}$/.test(u); };
  var plClock = function (ms) { return new Date(ms).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }); };
  var plWhen = function (iso) {
    var d = new Date(iso);
    return d.toLocaleString("pl-PL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  var firstPart = function (a) { return shortAddr(a).split(",")[0]; };
  var telHref = function (t) { var n = String(t || C.tel || "").replace(/[^\d+]/g, ""); if (/^\d{9}$/.test(n)) n = "+48" + n; return "tel:" + n; };
  var kmTxt = function (m) { return (m / 1000).toFixed(1).replace(".", ",") + " km"; };
  var minTxt = function (s) { var m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + " min" : Math.floor(m / 60) + " godz. " + (m % 60) + " min"; };
  function nightAtMs(ms) {
    var N = C.night; if (!N) return false;
    var h = function (s) { return +s.slice(0, 2) * 60 + +s.slice(3, 5); };
    var m = h(new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
    var f = h(N.from), t = h(N.to);
    return f > t ? m >= f || m < t : m >= f && m < t;
  }

  /* ---------- sheets: open/close, focus trap, Esc ---------- */
  var g2Open = null, g2Back = null;
  function g2Focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])'),
      function (e) { return !e.disabled && e.offsetParent !== null && !e.closest(".hp"); });
  }
  function sheetOpen(over, focusEl) {
    if (g2Open && g2Open !== over) sheetClose(g2Open, true);
    if (!g2Open) g2Back = document.activeElement;
    g2Open = over; over.hidden = false; document.documentElement.style.overflow = "hidden";
    setTimeout(function () { var f = focusEl || g2Focusables(over)[0]; if (f) f.focus(); }, 40);
  }
  function sheetClose(over, keepFocus) {
    if (!over || over.hidden) return;
    over.hidden = true; if (g2Open === over) g2Open = null;
    document.documentElement.style.overflow = "";
    if (!keepFocus && g2Back && g2Back.focus) g2Back.focus();
    if (over.onclosed) over.onclosed();
  }
  if (document.body.classList.contains("app-g2")) {
    document.addEventListener("keydown", function (e) {
      if (!g2Open) return;
      if (e.key === "Escape") { e.preventDefault(); sheetClose(g2Open); return; }
      if (e.key !== "Tab") return;
      var f = g2Focusables(g2Open); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll(".g2-over [data-close]"), function (b) {
      b.addEventListener("click", function () { sheetClose(b.closest(".g2-over")); });
    });
  }

  /* ---------- map: Google Maps when a browser key is set, otherwise a calm background ---------- */
  var DARKQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var isDark = function () { return !!(DARKQ && DARKQ.matches); };
  var MAP_LIGHT = [
    { elementType: "geometry", stylers: [{ color: "#F2F1ED" }] }, { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#7C8499" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#F7F6F3" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] }, { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ECEBE7" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#DCE3EC" }] }, { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] }, { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] }];
  var MAP_DARK = [
    { elementType: "geometry", stylers: [{ color: "#121A2E" }] }, { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#97A1BA" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#121A2E" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1B2540" }] }, { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#26314F" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0D1424" }] }, { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] }, { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] }];
  function G2Map(box) {
    var m = null, g = null, marks = {}, line = null, fitted = false;
    var ink = function () { return isDark() ? "#E9ECF4" : "#2A3553"; }, card = function () { return isDark() ? "#1B2540" : "#FFFFFF"; };
    function svgIcon(kind) {
      var s;
      if (kind === "taxi") s = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="18" fill="' + card() + '" stroke="' + (isDark() ? "#EBC65E" : "#F4CF5D") + '" stroke-width="3"/><text x="22" y="28" font-size="17" text-anchor="middle">🚕</text></svg>';
      else s = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="9" fill="' + card() + '" stroke="' + ink() + '" stroke-width="4"/>' + (kind === "b" ? '<circle cx="13" cy="13" r="4" fill="' + ink() + '"/>' : "") + "</svg>";
      var n = kind === "taxi" ? 44 : 26;
      return { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(s), scaledSize: new g.Size(n, n), anchor: new g.Point(n / 2, n / 2) };
    }
    function ready() {
      return loadMaps().then(function (G) {
        if (!G || mapsBroken) return null;
        g = G.maps;
        if (!m) {
          box.classList.add("live");
          m = new g.Map(box, { center: C.base, zoom: 12, disableDefaultUI: true, clickableIcons: false, gestureHandling: "greedy",
            keyboardShortcuts: false, styles: isDark() ? MAP_DARK : MAP_LIGHT, backgroundColor: isDark() ? "#121A2E" : "#F7F6F3" });
          if (DARKQ && DARKQ.addEventListener) DARKQ.addEventListener("change", function () {
            m.setOptions({ styles: isDark() ? MAP_DARK : MAP_LIGHT });
            Object.keys(marks).forEach(function (k) { marks[k].setIcon(svgIcon(marks[k].kind)); });
            if (line) line.setOptions({ strokeColor: ink() });
          });
        }
        return m;
      });
    }
    function mark(key, pos, kind) {
      if (!pos) { if (marks[key]) { marks[key].setMap(null); delete marks[key]; } return; }
      if (!marks[key]) { marks[key] = new g.Marker({ map: m, icon: svgIcon(kind), clickable: false, zIndex: kind === "taxi" ? 3 : 2 }); marks[key].kind = kind; }
      marks[key].setPosition(pos);
    }
    function fit(points) {
      var sheet = document.getElementById("g2-sheet"), bottom = sheet && window.innerWidth < 760 ? sheet.offsetHeight + 24 : 60;
      var b = new g.LatLngBounds(); points.forEach(function (p) { b.extend(p); });
      m.fitBounds(b, { top: 90, left: 40, right: 40, bottom: bottom });
      if (points.length < 2) m.setZoom(15);
    }
    var xy = function (p) { return hasXY(p) ? { lat: +p.lat, lng: +p.lng } : null; };
    return {
      route: function (a, b, polyline) {
        ready().then(function (mm) {
          if (!mm) return;
          mark("a", xy(a), "a"); mark("b", xy(b), "b");
          if (line) { line.setMap(null); line = null; }
          var pts = [xy(a), xy(b)].filter(Boolean);
          if (!pts.length) return;
          var path = polyline && g.geometry ? g.geometry.encoding.decodePath(polyline) : null;
          if (path && pts.length === 2) line = new g.Polyline({ map: mm, path: path, strokeColor: ink(), strokeOpacity: 0.8, strokeWeight: 4, clickable: false });
          fit(path && path.length ? path : pts);
        });
      },
      // status page: pickup (or destination during the trip) + the live taxi
      track: function (target, targetKind, car) {
        ready().then(function (mm) {
          if (!mm) return;
          mark("a", targetKind === "a" ? xy(target) : null, "a"); mark("b", targetKind === "b" ? xy(target) : null, "b");
          mark("t", xy(car), "taxi");
          var pts = [xy(target), xy(car)].filter(Boolean);
          if (pts.length && (!fitted || pts.length === 2 && !fitted.both)) { fit(pts); fitted = { both: pts.length === 2 }; }
        });
      },
    };
  }

  /* ---------- G2 booking (/rezerwacja/) ---------- */
  var g2b = $("g2-book");
  if (g2b) initG2Book(g2b);

  function initG2Book(root) {
    var S = { pickup: null, dest: null, mode: "now", date: "", time: "", quote: null, pax: 1, which: "pickup", tsToken: "", sending: false };
    var map = G2Map($("g2-map")), qSeq = 0;
    var go = $("g2-go"), msg = $("g2-msg"), qBox = $("g2-quote");
    var last = null; try { last = JSON.parse(localStorage.getItem("taxi.last") || "null"); } catch (e) {}
    var me = Account.on && Account.get();

    function say(box, text, links) {
      box.textContent = "";
      if (!text) { box.hidden = true; return; }
      box.append(document.createTextNode(text));
      if (links && links.length) {
        var w = mk("span", "g2-links");
        links.forEach(function (l) { var a = mk("a", null, l[0]); a.href = l[1]; if (/^https?:/.test(l[1])) { a.target = "_blank"; a.rel = "noopener"; } w.append(a); });
        box.append(w);
      }
      box.hidden = false;
    }
    var callLinks = function () { return [["Zadzwoń: " + (C.telLabel || C.tel), "tel:" + C.tel]]; };

    // ---- when: Teraz / Później ----
    function whenLabel() { return S.mode === "now" ? "Teraz" : (S.date && S.time ? plWhen(S.date + "T" + S.time) : "Później"); }
    function refresh() {
      $("g2-when-lbl").textContent = whenLabel();
      go.textContent = S.mode === "now" ? "Zamów teraz" : "Zarezerwuj";
      go.disabled = !(S.pickup && S.dest && (S.mode === "now" || (S.date && S.time)));
    }
    var nightNow = function () { return nightAtMs(Date.now()); };
    function setRow(which, p) {
      var v = $(which === "pickup" ? "g2-from-v" : "g2-to-v");
      v.textContent = p ? shortAddr(p.address) : (which === "pickup" ? "Wybierz miejsce odbioru" : "Wybierz cel");
      v.classList.toggle("ph", !p);
    }
    function setPoint(which, p) { S[which] = p; setRow(which, p); refresh(); quote(); }

    // ---- quote ----
    function localQuote() {
      var R = 6371, r = Math.PI / 180, a = S.pickup, b = S.dest;
      var s = Math.pow(Math.sin((b.lat - a.lat) * r / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin((b.lng - a.lng) * r / 2), 2);
      var km = 2 * R * Math.asin(Math.sqrt(s)) * 1.3;
      return { distanceM: km * 1000, durationS: km / 55 * 3600 + 120, approx: true, price: null };
    }
    function showQuote() {
      var q = S.quote;
      if (!q) { qBox.hidden = true; return; }
      qBox.classList.remove("loading"); qBox.hidden = false;
      $("g2-q-title").textContent = "Taxi · " + (q.price ? (q.priceKind === "fixed" ? "cena stała" : "cena orientacyjna") : "cena do ustalenia");
      var bits = [];
      if (S.mode === "now" && q.approachS) bits.push("Kierowca za " + Math.max(3, Math.round(q.approachS / 60) + 2) + " min");
      if (S.mode === "later" && S.date && S.time) bits.push(plWhen(S.date + "T" + S.time));
      if (q.distanceM) bits.push(kmTxt(q.distanceM));
      if (q.durationS) bits.push(minTxt(q.durationS));
      $("g2-q-sub").textContent = bits.join(" · ");
      $("g2-q-price").textContent = q.price ? (q.priceKind === "fixed" ? "" : "~") + q.price + " zł" : "";
    }
    function quote() {
      say(msg, "");
      map.route(S.pickup, S.dest, null);
      if (!hasXY(S.pickup) || !hasXY(S.dest)) { S.quote = null; showQuote(); return; }
      var my = ++qSeq;
      qBox.hidden = false; qBox.classList.add("loading");
      api("/api/quote", { pickup: S.pickup, dest: S.dest, mode: S.mode }, 12000).then(function (q) {
        if (my !== qSeq) return;
        if (q._status === 429) { S.quote = localQuote(); showQuote(); say(msg, q.error || "Za dużo zapytań o cenę. Spróbuj za minutę albo zadzwoń.", callLinks()); return; }
        S.quote = q._ok ? q : localQuote(); showQuote();
        if (q._ok) map.route(S.pickup, S.dest, q.polyline);
      }).catch(function () { if (my === qSeq) { S.quote = localQuote(); showQuote(); } });
    }

    // ---- address search sheet ----
    var srch = $("g2-search"), qIn = $("g2-q"), qList = $("g2-q-list"), sMsg = $("g2-s-msg"), gpsB = $("g2-gps");
    var token = null, timer = null, items = [], active = -1, aSeq = 0;
    function uuid2() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
    function optButton(icon, main, sub) {
      var b = mk("button", "g2-opt"); b.type = "button";
      var t = mk("span"); t.append(mk("b", null, main)); if (sub) t.append(mk("small", null, sub));
      b.append(mk("i", null, icon), t); b.querySelector("i").setAttribute("aria-hidden", "true");
      return b;
    }
    function renderSugg() {
      qList.textContent = ""; active = -1; qIn.removeAttribute("aria-activedescendant");
      qIn.setAttribute("aria-expanded", items.length ? "true" : "false");
      items.forEach(function (p, i) {
        var li = mk("li"); li.setAttribute("role", "presentation");
        var b = optButton("📍", p.main, shortAddr(p.sub)); b.id = "g2-o-" + i; b.setAttribute("role", "option"); b.setAttribute("aria-selected", "false"); b.tabIndex = -1;
        b.addEventListener("click", function () { pickSugg(i); });
        li.append(b); qList.append(li);
      });
    }
    function highlight(i) {
      active = i;
      Array.prototype.forEach.call(qList.querySelectorAll(".g2-opt"), function (b, k) { b.setAttribute("aria-selected", k === i ? "true" : "false"); });
      if (i >= 0) qIn.setAttribute("aria-activedescendant", "g2-o-" + i);
    }
    function pickSugg(i) {
      var it = items[i]; if (!it) return;
      var label = it.main + (it.sub ? ", " + it.sub : ""), which = S.which, s = token; token = null;
      chosen(which, { address: label, lat: null, lng: null });
      api("/api/place?id=" + encodeURIComponent(it.id) + "&s=" + (s || ""), null, 8000).then(function (p) {
        if (p._ok && p.lat != null && S[which] && S[which].address === label) setPoint(which, { address: p.address || label, lat: p.lat, lng: p.lng });
        else if (S[which] && S[which].address === label) geocode(label).then(function (g) { if (g && S[which] && S[which].address === label) setPoint(which, { address: label, lat: g.lat, lng: g.lng }); });
      }).catch(function () {});
    }
    function chosen(which, p) {
      setPoint(which, p); sheetClose(srch, true);
      // first the pickup, then straight on to the destination
      if (which === "pickup" && !S.dest) setTimeout(function () { openSearch("dest"); }, 120);
      else setTimeout(function () { go.focus(); }, 60);
    }
    function openSearch(which) {
      S.which = which; stopGps();
      $("g2-search-h").textContent = which === "pickup" ? "Skąd jedziesz?" : "Dokąd jedziesz?";
      qIn.value = ""; items = []; renderSugg(); say(sMsg, "");
      gpsB.hidden = which !== "pickup";
      sheetOpen(srch, qIn);
    }
    function renderPopular() {
      var ul = $("g2-pop"); ul.textContent = "";
      var list = (C.sugg || []).slice();
      if (last && last.dest && last.dest.address && hasXY(last.dest)) list.unshift({ kind: "last", address: last.dest.address, lat: last.dest.lat, lng: last.dest.lng });
      list.forEach(function (p) {
        var li = mk("li");
        var icon = p.kind === "airport" ? "✈️" : p.kind === "station" ? "🚆" : p.kind === "last" ? "🕘" : "📍";
        var sub = p.kind === "airport" ? "Lotnisko" : p.kind === "station" ? "Dworzec" : p.kind === "last" ? "Ostatnio" : "";
        var b = optButton(icon, shortAddr(p.address), sub);
        b.addEventListener("click", function () { chosen(S.which, { address: p.address, lat: p.lat, lng: p.lng }); });
        li.append(b); ul.append(li);
      });
    }
    qIn.addEventListener("input", function () {
      clearTimeout(timer);
      var q = qIn.value.trim();
      if (q.length < 3) { items = []; renderSugg(); return; }
      timer = setTimeout(function () {
        if (!token) token = uuid2();
        var my = ++aSeq;
        api("/api/places?q=" + encodeURIComponent(q) + "&s=" + token, null, 8000).then(function (r) {
          if (my !== aSeq) return;
          items = r.suggestions || []; renderSugg();
        }).catch(function () {});
      }, 250);
    });
    qIn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" && items.length) { e.preventDefault(); highlight(Math.min(items.length - 1, active + 1)); }
      else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); highlight(Math.max(0, active - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (items.length) { pickSugg(active >= 0 ? active : 0); return; }
        var t = qIn.value.trim(); if (t.length < 3) return;
        say(sMsg, "Szukam adresu…");
        geocode(t).then(function (g) { if (g) chosen(S.which, g); else say(sMsg, "Nie znaleźliśmy tego adresu. Dopisz miejscowość albo wybierz podpowiedź."); });
      }
    });
    $("g2-from").addEventListener("click", function () { openSearch("pickup"); });
    $("g2-to").addEventListener("click", function () { openSearch("dest"); });

    // ---- "Moja lokalizacja": a quick position at once, then sharper GPS for a few seconds ----
    var watchId = null, gpsTimer = null;
    function stopGps() { if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; clearTimeout(gpsTimer); gpsB.disabled = false; }
    gpsB.addEventListener("click", function () {
      if (!navigator.geolocation) { say(sMsg, "Ta przeglądarka nie udostępnia lokalizacji. Wpisz adres."); return; }
      stopGps(); gpsB.disabled = true; say(sMsg, "Szukam Twojej lokalizacji…");
      var best = null, p = null, done = false;
      function use(pos) {
        var c = pos.coords;
        if (best && c.accuracy >= best.accuracy) return;
        best = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy };
        p = { address: "Moja lokalizacja", lat: best.lat, lng: best.lng, gps: true };
        if (!done) { done = true; chosen("pickup", p); } else { S.pickup = p; quote(); }
        var mine = p;
        reverse(mine).then(function (a) { if (a && S.pickup === mine) { mine.address = a; setRow("pickup", mine); } });
        if (c.accuracy <= 40) stopGps();
      }
      function fail(e) {
        if (done) return;
        stopGps();
        say(sMsg, e && e.code === 1 ? "Zezwól przeglądarce na dostęp do lokalizacji albo wpisz adres." : "Nie udało się ustalić lokalizacji. Wpisz adres.");
      }
      navigator.geolocation.getCurrentPosition(use, function () {}, { enableHighAccuracy: false, maximumAge: 300000, timeout: 4000 });
      watchId = navigator.geolocation.watchPosition(use, fail, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      gpsTimer = setTimeout(function () { if (!done) fail(null); stopGps(); }, 15000);
    });
    srch.onclosed = stopGps;

    // ---- time sheet ----
    var tSheet = $("g2-time"), dIn = $("g2-date"), hIn = $("g2-hour"), tMsg = $("g2-t-msg"), segs = tSheet.querySelectorAll(".g2-segb"), tMode = "now";
    var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
    var localYmd = function (d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
    function setSeg(m) {
      tMode = m;
      Array.prototype.forEach.call(segs, function (b) { b.setAttribute("aria-checked", b.getAttribute("data-mode") === m ? "true" : "false"); });
      $("g2-dt").hidden = m !== "later";
      if (m === "later" && !dIn.value) {
        var t = new Date(Date.now() + 2 * 3600e3); t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
        dIn.value = localYmd(t); hIn.value = pad2(t.getHours()) + ":" + pad2(t.getMinutes());
      }
    }
    function nightNote() {
      var n = nightNow(), nb = tSheet.querySelector('[data-mode="now"]');
      nb.setAttribute("aria-disabled", n ? "true" : "false");
      var note = $("g2-night");
      note.hidden = !n;
      if (n) note.textContent = "W nocy (" + C.night.from + "–" + C.night.to + ") jeździmy tylko z wcześniejszą rezerwacją – wybierz godzinę odbioru (najpóźniej " + C.night.ahead_min + " min wcześniej).";
      return n;
    }
    Array.prototype.forEach.call(segs, function (b) {
      b.addEventListener("click", function () {
        if (b.getAttribute("aria-disabled") === "true") { say(tMsg, "Teraz – tylko w dzień. W nocy wybierz godzinę odbioru."); return; }
        say(tMsg, ""); setSeg(b.getAttribute("data-mode"));
      });
    });
    function openTime() {
      dIn.min = localYmd(new Date());
      say(tMsg, "");
      setSeg(nightNote() ? "later" : S.mode);
      if (S.mode === "later" && S.date) { dIn.value = S.date; hIn.value = S.time; }
      sheetOpen(tSheet, tSheet.querySelector('[aria-checked="true"]'));
    }
    $("g2-when-btn").addEventListener("click", openTime);
    $("g2-time-ok").addEventListener("click", function () {
      if (tMode === "now") {
        if (nightNow()) { say(tMsg, "W nocy jeździmy tylko z rezerwacją – wybierz godzinę."); setSeg("later"); return; }
        S.mode = "now"; S.date = S.time = "";
      } else {
        var d = dIn.value, t = hIn.value, at = d && t ? new Date(d + "T" + t).getTime() : 0;
        if (!at || at < Date.now() + 14 * 60000) { say(tMsg, "Wybierz datę i godzinę odbioru – najwcześniej za 15 minut."); (d ? hIn : dIn).focus(); return; }
        if (nightAtMs(at) && at < Date.now() + C.night.ahead_min * 60000) { say(tMsg, "Kurs nocny zarezerwuj najpóźniej " + C.night.ahead_min + " min przed odbiorem albo zadzwoń."); hIn.focus(); return; }
        S.mode = "later"; S.date = d; S.time = t;
      }
      root.setAttribute("data-mode", S.mode);
      sheetClose(tSheet); refresh(); quote();
    });

    // ---- confirmation sheet ----
    var cf = $("g2-confirm"), cMsg = $("g2-c-msg"), send = $("g2-send"), nameIn = $("g2-name"), telIn = $("g2-tel"), fIn = $("g2-flight"), fl = $("g2-fl");
    var nearAirport = function (p) { return hasXY(p) && (C.airports || []).some(function (a) { return Math.abs(a.lat - p.lat) + Math.abs(a.lng - p.lng) < 0.06; }); };
    function paxSet(n) { S.pax = Math.min(C.seats || 7, Math.max(1, n)); $("g2-pax").textContent = S.pax; $("g2-pax-m").disabled = S.pax <= 1; $("g2-pax-p").disabled = S.pax >= (C.seats || 7); }
    $("g2-pax-m").addEventListener("click", function () { paxSet(S.pax - 1); });
    $("g2-pax-p").addEventListener("click", function () { paxSet(S.pax + 1); });
    function summary() {
      var s = $("g2-sum"); s.textContent = "";
      s.append(mk("b", null, firstPart(S.pickup.address) + " → " + firstPart(S.dest.address)), document.createElement("br"),
        document.createTextNode(whenLabel() + (S.quote && S.quote.price ? " · " + (S.quote.priceKind === "fixed" ? "" : "~") + S.quote.price + " zł" : "")));
      send.textContent = "Potwierdzam" + (S.quote && S.quote.price ? " · " + (S.quote.priceKind === "fixed" ? "" : "~") + S.quote.price + " zł" : "");
    }
    // Turnstile (only when a site key is configured)
    var tsWidget = null;
    function turnstile() {
      if (!C.ts) return;
      var box = $("g2-ts"); box.hidden = false;
      function render() { if (tsWidget != null || !window.turnstile) return; tsWidget = window.turnstile.render(box, { sitekey: C.ts, language: "pl", size: "flexible",
        callback: function (t) { S.tsToken = t; }, "expired-callback": function () { S.tsToken = ""; }, "error-callback": function () { S.tsToken = ""; } }); }
      if (window.turnstile) { render(); return; }
      if (document.getElementById("cf-ts")) return;
      window.__tsReady = render;
      var sc = document.createElement("script"); sc.id = "cf-ts"; sc.async = true; sc.defer = true;
      sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsReady";
      document.head.appendChild(sc);
    }
    go.addEventListener("click", function () {
      if (go.disabled) return;
      if (S.mode === "now" && nightNow()) { openTime(); return; }
      if (!nameIn.value) nameIn.value = (me && me.name) || (last && last.name) || "";
      if (!telIn.value) telIn.value = (me && me.phone) || (last && last.phone) || "";
      if (S.pax === 1 && last && last.pax) paxSet(parseInt(last.pax, 10) || 1); else paxSet(S.pax);
      $("g2-flight-w").hidden = !(nearAirport(S.pickup) || nearAirport(S.dest));
      summary(); say(cMsg, ""); turnstile();
      sheetOpen(cf, nameIn.value ? (telIn.value ? send : telIn) : nameIn);
    });

    // flight number -> the flight's time, and a suggested pickup time
    var fTimer = null, fSeq = 0;
    fIn.addEventListener("input", function () {
      clearTimeout(fTimer);
      fTimer = setTimeout(function () {
        var no = fIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        fl.textContent = "";
        if (!/^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/.test(no)) { fl.hidden = true; return; }
        var my = ++fSeq; fl.hidden = false; fl.textContent = "Szukam lotu…";
        api("/api/flight?no=" + no + (S.mode === "later" && S.date ? "&date=" + S.date : ""), null, 15000).then(function (f) {
          if (my !== fSeq) return;
          fl.textContent = "";
          if (!f._ok || !f.found) { fl.hidden = !(f._ok); if (f._ok) fl.textContent = "Nie znaleźliśmy lotu " + no + " w najbliższych dniach – sprawdź numer."; return; }
          var leg = (f.legs || [f])[0], e = leg.kind === "arr" ? leg.arr : leg.dep;
          if (!e || !e.date) { fl.hidden = true; return; }
          fl.append(document.createTextNode("✈ "), mk("b", null, leg.number), document.createTextNode(" · " + (leg.kind === "arr" ? "przylot " : "wylot ") +
            new Date(e.date + "T12:00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" }) + ", " + (e.time || "–") + (e.iata ? " (" + e.iata + ")" : "")));
          var at = null;
          if (leg.kind === "dep" && e.time) { var drive = S.quote && S.quote.durationS ? Math.round(S.quote.durationS / 60) + 10 : 70; at = new Date(e.date + "T" + e.time + ":00"); at.setMinutes(at.getMinutes() - 120 - drive); at.setMinutes(Math.floor(at.getMinutes() / 5) * 5); }
          if (leg.kind === "arr" && e.time) { at = new Date(e.date + "T" + e.time + ":00"); at.setMinutes(at.getMinutes() + 20); at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5); }
          if (at && at.getTime() > Date.now() + 15 * 60000) {
            var sd = localYmd(at), st = pad2(at.getHours()) + ":" + pad2(at.getMinutes());
            if (!(S.mode === "later" && S.date === sd && S.time === st)) {
              var b = mk("button", "g2-pill", "Ustaw odbiór: " + plWhen(sd + "T" + st)); b.type = "button"; b.style.marginTop = "8px";
              b.addEventListener("click", function () { S.mode = "later"; S.date = sd; S.time = st; root.setAttribute("data-mode", "later"); refresh(); summary(); quote(); b.remove(); });
              fl.append(document.createElement("br"), b);
            }
          }
        }).catch(function () { if (my === fSeq) fl.hidden = true; });
      }, 600);
    });

    function fallback(p) {
      var text = ["Dzień dobry, chcę zamówić kurs:", "Trasa: " + p.pickup.address + " → " + p.dest.address, p.when ? "Termin: " + p.when.replace("T", " ") : "Termin: teraz",
                  "Osób: " + p.pax, p.name ? "Imię: " + p.name : "", "Telefon: " + p.phone, p.flight ? "Nr lotu: " + p.flight : "", p.notes ? "Uwagi: " + p.notes : ""].filter(Boolean).join("\n");
      var m = encodeURIComponent(text), ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      say(cMsg, "Nie udało się wysłać zamówienia online. Wyślij je jednym dotknięciem albo zadzwoń:",
        [["WhatsApp", "https://wa.me/" + C.wa + "?text=" + m], ["SMS", "sms:" + C.tel + (ios ? "&" : "?") + "body=" + m], ["Zadzwoń", "tel:" + C.tel]]);
    }
    cf.addEventListener("submit", function (e) {
      e.preventDefault();
      if (S.sending) return;
      say(cMsg, "");
      if (!nameIn.value.trim()) { say(cMsg, "Podaj imię – kierowca będzie wiedział, kogo odbiera."); nameIn.focus(); return; }
      if (telIn.value.replace(/\D/g, "").length < 9) { say(cMsg, "Podaj numer telefonu (9 cyfr) – kierowca może potrzebować zadzwonić."); telIn.focus(); return; }
      if (C.ts && !S.tsToken) { say(cMsg, "Potwierdź, że nie jesteś robotem (pole powyżej)."); return; }
      S.sending = true; send.classList.add("busy"); send.setAttribute("aria-busy", "true");
      var label = send.textContent; send.textContent = ""; send.append(mk("span", "spin"), document.createTextNode(" Wysyłam do kierowcy…"));
      function reset() { S.sending = false; send.classList.remove("busy"); send.removeAttribute("aria-busy"); send.textContent = label; }
      var fix = [];
      ["pickup", "dest"].forEach(function (w) { if (!hasXY(S[w])) fix.push(geocode(S[w].address).then(function (g) { if (g) S[w] = { address: S[w].address, lat: g.lat, lng: g.lng }; })); });
      Promise.all(fix).then(function () {
        var p = { mode: S.mode, when: S.mode === "later" ? S.date + "T" + S.time : null, pickup: S.pickup, dest: S.dest, lang: "pl",
                  name: nameIn.value.trim(), phone: telIn.value.trim(), pax: S.pax, flight: fIn.value.trim(), notes: $("g2-notes").value.trim(),
                  website: $("g2-website").value, turnstile: S.tsToken || undefined };
        return api("/api/rides", p, 20000).then(function (r) {
          if (r._ok && r.id) {
            Rides.add({ id: r.id, token: r.token, created: Date.now(), mode: p.mode, when: p.when });
            try { localStorage.setItem("taxi.last", JSON.stringify({ pickup: p.pickup, dest: p.dest, pax: p.pax, name: p.name, phone: p.phone, flight: p.flight })); } catch (e2) {}
            location.href = "/przejazd/?id=" + r.id;
            return;
          }
          reset();
          if (window.turnstile && tsWidget != null) { try { window.turnstile.reset(tsWidget); } catch (e3) {} S.tsToken = ""; }
          if (r._status === 429) say(cMsg, "Za dużo zamówień z tego urządzenia w ostatniej godzinie. Zadzwoń, proszę.", callLinks());
          else if (r.error === "night") { say(cMsg, "W nocy (" + C.night.from + "–" + C.night.to + ") jeździmy tylko z wcześniejszą rezerwacją. Wybierz godzinę odbioru.", callLinks()); }
          else if (r.error === "phone") { say(cMsg, "Sprawdź numer telefonu."); telIn.focus(); }
          else if (r.error === "when") say(cMsg, "Ten termin jest już niedostępny – wybierz inną godzinę.");
          else if (r.error === "captcha") say(cMsg, "Nie udało się potwierdzić, że nie jesteś robotem. Spróbuj ponownie.");
          else fallback(p);
        }, function () { reset(); fallback(p); });
      });
    });

    // ---- start ----
    paxSet(1);
    renderPopular();
    if (location.hash === "#again" && last && last.pickup && last.dest) {   // "Zamów ponownie" after a failed ride: same route
      S.pickup = last.pickup; S.dest = last.dest; setRow("pickup", S.pickup); setRow("dest", S.dest);
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
    }
    if (nightNow()) { S.mode = "later"; root.setAttribute("data-mode", "later"); }
    refresh(); quote();
    if (nightNow() && S.pickup && S.dest) setTimeout(openTime, 300);
    setInterval(function () { if (S.mode === "now" && nightNow() && !g2Open) { S.mode = "later"; S.date = S.time = ""; refresh(); } }, 60000);
  }

  /* ---------- G2 ride status (/przejazd/) ---------- */
  var track = $("track");
  if (track) initTrack();

  // driver row: photo (only with the driver's consent – the server sends it then), name, car, car photo
  function renderDriver(dc, dv, vh) {
    var sig = JSON.stringify([dv, vh]);
    if (dc.getAttribute("data-sig") === sig) return;   // polled every few seconds: don't reload the photos each time
    dc.setAttribute("data-sig", sig);
    dc.textContent = "";
    if (!dv) return;
    var initial = function () { var s = mk("span", "g2-dava", (dv.name || "?").trim().charAt(0).toUpperCase()); s.setAttribute("aria-hidden", "true"); return s; };
    var ava = initial();
    if (ownPhoto(dv.photo)) {
      ava = mk("img", "g2-dava"); ava.src = dv.photo; ava.alt = "Zdjęcie kierowcy"; ava.width = 52; ava.height = 52; ava.decoding = "async"; ava.referrerPolicy = "no-referrer";
      ava.onerror = function () { ava.replaceWith(initial()); };
    }
    var txt = mk("span", "g2-dtxt");
    txt.append(mk("b", null, dv.name || "Twój kierowca"));
    var model = vh ? vh.model : dv.car, color = vh ? vh.color : dv.color;
    if (model) txt.append(mk("span", null, [model, color].filter(Boolean).join(" · ")));
    dc.append(ava, txt);
    if (vh && ownPhoto(vh.photo)) {
      var ci = mk("img", "g2-dcar"); ci.src = vh.photo; ci.alt = "Zdjęcie auta"; ci.width = 84; ci.height = 50;
      ci.loading = "lazy"; ci.decoding = "async"; ci.referrerPolicy = "no-referrer"; ci.onerror = function () { ci.remove(); };
      dc.append(ci);
    }
  }

  function initTrack() {
    var qs = new URLSearchParams(location.search);
    var id = qs.get("id") || (Rides.active() || {}).id, tok = qs.get("t");
    if (id && tok && /^[a-z0-9]{24}$/.test(tok) && !Rides.get(id)) Rides.add({ id: id, token: tok, created: Date.now(), mode: "now" });
    if (tok) try { history.replaceState(null, "", location.pathname + "?id=" + id); } catch (e) {}
    var mine = id && Rides.get(id), last = null, skew = 0, timer = null, fails = 0;
    var map = G2Map($("g2-map"));
    var el = { title: $("t-title"), sub: $("t-sub"), pulse: $("t-pulse"), prog: $("t-prog"), bar: $("t-bar"), steps: $("t-steps"),
               plate: $("t-plate"), plateNo: $("t-plate-no"), drv: $("t-driver"), call: $("t-call"), cancel: $("t-cancel"),
               again: $("t-again"), review: $("t-review"), phone: $("t-phone"), login: $("t-login") };
    var OPENS = ["pending", "scheduled", "enroute", "arrived", "ontrip"], FAILED = ["cancelled", "expired", "declined", "noshow"];
    var STAGE = { enroute: 1, arrived: 2, ontrip: 3, done: 4 };
    function text(node, t) { if (node.textContent !== t) node.textContent = t; }
    function destAt(r) { return r.destEtaAt ? r.destEtaAt : r.startedAt && r.durationS ? r.startedAt + r.durationS * 1000 : null; }
    function words(r) {
      var now = Date.now() + skew, st = r.status;
      if (st === "pending") {
        if (r.mode === "later") return ["Rezerwacja wysłana", "Kierowca potwierdzi termin: " + (r.when ? plWhen(r.when) : "")];
        var waiting = now - r.created > (r.waitMin || 3) * 60000;
        return ["Szukamy kierowcy…", waiting ? "Trwa to dłużej niż zwykle – możesz do nas zadzwonić" : "Zwykle trwa to chwilę"];
      }
      if (st === "scheduled") return ["Rezerwacja potwierdzona", r.when ? plWhen(r.when) : ""];
      if (st === "enroute") {
        if (!r.etaAt) return ["Kierowca jedzie do Ciebie", firstPart(r.dest && r.dest.address)];
        var m = Math.max(1, Math.ceil((r.etaAt - now) / 60000));
        return ["Będzie za " + m + " min", "ok. " + plClock(r.etaAt - skew) + " · " + firstPart(r.dest && r.dest.address)];
      }
      if (st === "arrived") return ["Kierowca czeka na Ciebie", "Auto stoi pod adresem odbioru"];
      if (st === "ontrip") { var da = destAt(r); return ["W trasie", da ? "Na miejscu ok. " + plClock(da - skew) : "Miłej podróży!"]; }
      if (st === "done") return ["Dojechałeś na miejsce", "Dziękujemy!"];
      if (st === "cancelled") return r.cancelledBy === "driver" ? ["Kierowca anulował kurs", "Przepraszamy. Zamów ponownie albo zadzwoń."] : ["Kurs anulowany", "Kierowca dostał informację."];
      if (st === "expired") return ["Nikt nie zdążył odpowiedzieć", "Kierowcy są teraz w trasie. Zamów ponownie albo zadzwoń."];
      if (st === "declined") return ["Kierowcy są teraz zajęci", "Przepraszamy! Zamów na później albo zadzwoń."];
      if (st === "noshow") return ["Kierowca Cię nie zastał", "Czekał pod adresem odbioru. Zamów ponownie, jeśli nadal potrzebujesz kursu."];
      return ["Nie znaleziono kursu", "Link mógł wygasnąć."];
    }
    function render(r) {
      var st = r.status, w = words(r);
      text(el.title, w[0]); text(el.sub, w[1]);
      document.title = w[0] + " | Taxi Knurów";
      el.pulse.hidden = st !== "pending";
      var stage = STAGE[st] || 0;
      el.prog.hidden = !stage;
      el.bar.style.setProperty("--p", stage * 25 + "%");
      Array.prototype.forEach.call(el.steps.children, function (li, i) { li.classList.toggle("on", i < stage); });
      var showDrv = !!r.driver && ["scheduled", "enroute", "arrived", "ontrip", "done"].indexOf(st) >= 0;
      var plate = showDrv ? ((r.vehicle && r.vehicle.plate) || r.driver.plate || "") : "";
      el.plate.hidden = !plate;
      if (plate) { text(el.plateNo, plate); el.plate.setAttribute("aria-label", "Numer rejestracyjny " + plate); }
      el.drv.hidden = !showDrv;
      renderDriver(el.drv, showDrv ? r.driver : null, showDrv ? r.vehicle : null);
      el.call.hidden = !showDrv || st === "done";
      el.call.href = telHref(r.tel);
      var open = OPENS.indexOf(st) >= 0, failed = FAILED.indexOf(st) >= 0;
      el.cancel.hidden = !(open && mine && mine.token);
      text(el.cancel, st === "ontrip" ? "Przerwij kurs" : "Anuluj");
      el.again.hidden = !failed;
      el.again.href = "/rezerwacja/" + (failed ? "#again" : "");
      el.review.hidden = !(st === "done" && r.reviewUrl);
      if (r.reviewUrl) el.review.href = r.reviewUrl;
      var waiting = st === "pending" && r.mode === "now" && Date.now() + skew - r.created > (r.waitMin || 3) * 60000;
      el.phone.hidden = !(failed || waiting);
      if (!open) Rides.close(r.id);
      // map: pickup + taxi on the way, destination + taxi during the trip
      if (st === "ontrip") map.track(r.dest, "b", r.car);
      else map.track(r.pickup, "a", (st === "enroute" || st === "arrived") ? r.car : null);
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
      if (document.hidden) return;   // paused while the tab is in the background; resumes on return
      api("/api/rides/" + encodeURIComponent(id), null, 10000, { "X-Ride-Token": mine.token }).then(function (r) {
        if (r._status === 404) { notFound(); return; }
        if (!r._ok) throw 0;
        fails = 0;
        skew = r.now ? r.now - Date.now() : 0;
        if (last && last.status !== r.status) alertChange();
        last = r; render(r);
        var next = { pending: 4000, enroute: 5000, arrived: 6000, ontrip: 10000, scheduled: 30000 }[r.status];
        if (next) timer = setTimeout(poll, next);   // finished rides: no more polling
      }).catch(function () {
        fails++;
        if (!last) text(el.sub, "Brak połączenia – próbuję ponownie…");
        timer = setTimeout(poll, Math.min(30000, 3000 * fails));
      });
    }
    function notFound() {
      text(el.title, "Nie znaleziono kursu"); text(el.sub, "Link mógł wygasnąć. Zamów nowy kurs albo zadzwoń.");
      el.again.hidden = false; el.phone.hidden = false; el.pulse.hidden = true;
      if (id) Rides.close(id);
    }
    var cDlg = $("t-cancel-dlg");
    el.cancel.addEventListener("click", function () {
      text($("t-cancel-dlg-h"), last && last.status === "ontrip" ? "Przerwać kurs?" : "Anulować kurs?");
      text($("t-cancel-q"), last && last.status === "ontrip" ? "Kierowca dostanie informację, że kończysz kurs w trakcie jazdy." : "Kierowca dostanie informację o anulowaniu.");
      sheetOpen(cDlg, $("t-cancel-yes"));
    });
    $("t-cancel-yes").addEventListener("click", function () {
      var b = this; b.disabled = true;
      api("/api/rides/" + id + "/cancel", { token: mine.token }).then(function (r) {
        sheetClose(cDlg);
        if (r._ok) { last = r; render(r); }
      }).finally(function () { b.disabled = false; });
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && mine && mine.token && (!last || OPENS.indexOf(last.status) >= 0)) poll(); });

    if (!id) { notFound(); return; }
    if (!mine || !mine.token) {   // someone else's link: the ride stays private
      text(el.title, "Ten kurs jest prywatny"); text(el.sub, "Status kursu widać tylko na telefonie, z którego go zamówiono.");
      el.again.hidden = false; text(el.again, "Zamów kurs");
      if (Account.on && !Account.get()) { el.login.hidden = false; el.login.href = "/konto/?next=" + encodeURIComponent(location.pathname + location.search); }
      return;
    }
    poll();
    setInterval(function () { if (last) render(last); }, 1000);   // the minutes count down between polls
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
      var ul = $("acct-rides"); ul.textContent = "";
      if (!rides.length) ul.append(el("li", "ar-empty", "Nie masz jeszcze przejazdów z ostatnich 30 dni."));
      rides.forEach(function (x) {
        var live = LIVE.indexOf(x.status) >= 0;
        var st = x.status === "cancelled" && x.cancelledBy === "driver" ? "anulowany przez kierowcę" : ST[x.status] || x.status;
        var a = el("a", live ? "live-ride" : null); a.href = "/przejazd/?id=" + encodeURIComponent(x.id);
        var route = el("span", "ar-route"), arrow = el("i", null, "→"); arrow.setAttribute("aria-hidden", "true");
        route.append(el("b", null, x.from), arrow, el("b", null, x.to));
        var meta = el("span", "ar-meta"); meta.append(el("span", "ar-st st-" + String(x.status).replace(/[^a-z]/g, ""), st));
        if (x.price) meta.append(el("span", null, (x.priceKind === "fixed" ? "" : "~") + x.price + " zł"));
        a.append(el("span", "ar-when", x.mode === "later" ? when(x) : when(x) + " · teraz"), route, meta);
        var li = el("li"); li.append(a); ul.append(li);
      });
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
    var box = $("install"); if (!box || $("track")) return;   // never over the live ride status
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

  /* ---------- "Dodaj swoją opinię": the three Google listings share the reviews fairly (random pick per visit) ---------- */
  (function () {
    var a = $("rv-add"), pl = C.places || [];
    if (!a || pl.length < 2) return;
    var p = pl[Math.floor(Math.random() * pl.length)];
    a.href = "https://search.google.com/local/writereview?placeid=" + encodeURIComponent(p.id);
    a.title = p.name;
  })();

  /* ---------- Google reviews ---------- */
  var rvTrack = $("rv-track");
  if (rvTrack) {
    api("/api/reviews", null, 10000).then(function (d) {
      if (!d || !d.reviews || !d.reviews.length) return;
      if (d.rating) $("g-num").textContent = String(d.rating.toFixed(1)).replace(".", lang === "pl" ? "," : ".");
      if (d.count) $("g-count").textContent = d.count + (lang === "pl" ? " opinii w Google" : " Google reviews");
      if (d.url) $("rv-all").href = d.url;
      // each listing: its own score and links
      (d.places || []).forEach(function (pl, k) {
        var li = document.querySelector('#g-places [data-place="' + k + '"]'); if (!li) return;
        if (pl.rating) li.querySelector(".gp-num").textContent = String(pl.rating.toFixed(1)).replace(".", lang === "pl" ? "," : ".") + " (" + pl.count + ")";
        else li.querySelector(".gp-num").textContent = lang === "pl" ? "brak ocen" : "no reviews yet";
        if (pl.url) li.querySelector("a").href = pl.url;
      });
      var SVGNS = "http://www.w3.org/2000/svg";
      var star = function () {
        var sv = document.createElementNS(SVGNS, "svg"); sv.setAttribute("width", "16"); sv.setAttribute("height", "16"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("aria-hidden", "true");
        var pa = document.createElementNS(SVGNS, "path"); pa.setAttribute("fill", "currentColor"); pa.setAttribute("d", "m12 2 3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z");
        sv.append(pa); return sv;
      };
      var safeUrl = function (u) { return typeof u === "string" && /^https:\/\//.test(u) ? u : null; };
      rvTrack.textContent = "";
      d.reviews.forEach(function (v, i) {
        var fig = el("figure", "rv"); fig.style.setProperty("--i", String(i));
        var rating = Math.max(0, Math.min(5, parseInt(v.rating, 10) || 0));
        var stars = el("div", "rv-stars"); stars.setAttribute("aria-label", rating + "/5");
        for (var k = 0; k < rating; k++) stars.append(star());
        var long = String(v.text || "").length > 220;
        var q = el("blockquote", long ? "clamp" : null, v.text || "");
        fig.append(stars, q);
        if (long) { var more = el("button", "rv-more", T.rvMore); more.type = "button"; fig.append(more); }
        var av = el("span", "rv-av");
        if (safeUrl(v.photo)) { var im = el("img"); im.src = v.photo; im.alt = ""; im.width = 44; im.height = 44; im.loading = "lazy"; im.referrerPolicy = "no-referrer"; av.append(im); }
        else av.append(el("span", null, (v.author || "?").trim().charAt(0).toUpperCase()));
        var who = el("span"), nm = el("b");
        if (safeUrl(v.authorUri)) { var an = el("a", null, v.author || ""); an.href = v.authorUri; an.target = "_blank"; an.rel = "noopener"; nm.append(an); }
        else nm.textContent = v.author || "";
        who.append(nm, el("small", null, (v.when || "") + " · " + (v.place || T.rvFrom)));
        var cap = el("figcaption"); cap.append(av, who); fig.append(cap);
        rvTrack.append(fig);
      });
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
