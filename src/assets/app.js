/* Taxi Knurów Adam Mączka – kalkulator ceny i rezerwacja (bez serwera: WhatsApp / SMS / telefon) */
(function () {
  "use strict";
  var D = window.TAXI || {};
  var lang = document.documentElement.lang === "en" ? "en" : "pl";
  var T = {
    pl: {
      from: "Skąd", to: "Dokąd", none: "Zadzwoń po wycenę", sameplace: "Wybierz dwa różne miejsca",
      note: "Cena orientacyjna od – potwierdzamy ją w odpowiedzi.", round: "w obie strony",
      big: "Powyżej 4 osób podstawimy auto 7-osobowe.",
      errWhen: "Podaj datę i godzinę odbioru.", errRoute: "Wybierz, skąd i dokąd jedziesz.",
      msgHead: "Dzień dobry, chcę zarezerwować kurs:", route: "Trasa", date: "Termin", back: "Powrót",
      pax: "Osób", lug: "Bagaż", flight: "Nr lotu", addr: "Adres odbioru", name: "Imię", phone: "Telefon",
      notes: "Uwagi", est: "Cena z kalkulatora", ok: "Dziękuję!", yes: "tak"
    },
    en: {
      from: "From", to: "To", none: "Call for a quote", sameplace: "Choose two different places",
      note: "Estimated starting price – we confirm it in our reply.", round: "return",
      big: "For 5–7 passengers we send a 7-seat car.",
      errWhen: "Enter pickup date and time.", errRoute: "Choose where from and where to.",
      msgHead: "Hello, I would like to book a ride:", route: "Route", date: "Pickup", back: "Return",
      pax: "Passengers", lug: "Luggage", flight: "Flight no.", addr: "Pickup address", name: "Name", phone: "Phone",
      notes: "Notes", est: "Calculator price", ok: "Thank you!", yes: "yes"
    }
  }[lang];

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

  /* ---------- calculator ---------- */
  var form = document.getElementById("booking");
  if (!form || !D.places) return;
  var $ = function (id) { return document.getElementById(id); };
  var fromSel = $("from"), toSel = $("to"), val = $("price"), noteEl = $("price-note"), err = $("form-error");
  var places = {}; D.places.forEach(function (p) { places[p.id] = p; });

  function fill(sel, def) {
    var groups = {};
    D.places.forEach(function (p) {
      if (!groups[p.group]) { groups[p.group] = document.createElement("optgroup"); groups[p.group].label = p.group; sel.appendChild(groups[p.group]); }
      var o = document.createElement("option"); o.value = p.id; o.textContent = p.label; groups[p.group].appendChild(o);
    });
    if (def) sel.value = def;
  }
  fill(fromSel, form.dataset.from || "v:knurow");
  fill(toSel, form.dataset.to || "d:lotnisko-pyrzowice");

  function fare(a, b) {
    if (!a || !b) return null;
    if (a.id === b.id) return "same";
    var av = a.type === "v", bv = b.type === "v";
    if (av && bv) {
      if (a.id === "v:knurow") return b.price;
      if (b.id === "v:knurow") return a.price;
      return Math.max(a.price, b.price) + 10;
    }
    if (av && !bv) return b.price + a.surcharge;
    if (!av && bv) return a.price + b.surcharge;
    return null; // two far destinations – individual quote
  }

  var last = null;
  function update() {
    var a = places[fromSel.value], b = places[toSel.value];
    var f = fare(a, b), round = $("round").checked, pax = parseInt($("pax").value || "1", 10);
    var extra = pax > 4 ? " " + T.big : "";
    if (f === "same") { val.innerHTML = "<small>" + T.sameplace + "</small>"; noteEl.textContent = ""; last = null; return; }
    if (f === null) {
      val.innerHTML = '<small>' + T.none + '</small>'; noteEl.textContent = extra.trim(); last = null; return;
    }
    var total = round ? f * 2 : f;
    if (total !== last) { val.classList.remove("bump"); void val.offsetWidth; val.classList.add("bump"); }
    last = total;
    val.innerHTML = total + " <small>zł" + (round ? " · " + T.round : "") + "</small>";
    noteEl.textContent = T.note + extra;
  }
  ["change", "input"].forEach(function (ev) { form.addEventListener(ev, update); });
  var sw = $("swap");
  if (sw) sw.addEventListener("click", function () { var t = fromSel.value; fromSel.value = toSel.value; toSel.value = t; update(); });
  $("round").addEventListener("change", function () { $("back-wrap").hidden = !this.checked; });
  // default date = tomorrow
  var dt = $("date"); if (dt && !dt.value) { var d = new Date(Date.now() + 864e5); dt.value = d.toISOString().slice(0, 10); dt.min = new Date().toISOString().slice(0, 10); }
  update();

  function message() {
    var a = places[fromSel.value], b = places[toSel.value];
    if (!a || !b || a.id === b.id) { err.textContent = T.errRoute; return null; }
    if (!$("date").value || !$("time").value) { err.textContent = T.errWhen; $("time").focus(); return null; }
    err.textContent = "";
    var L = [T.msgHead, T.route + ": " + a.label + " → " + b.label,
      T.date + ": " + $("date").value + " " + $("time").value];
    if ($("round").checked) L.push(T.back + ": " + ($("back").value || "?"));
    L.push(T.pax + ": " + $("pax").value);
    var opt = [["addr", T.addr], ["lug", T.lug], ["flight", T.flight], ["name", T.name], ["tel", T.phone], ["notes", T.notes]];
    opt.forEach(function (o) { var el = $(o[0]); if (el && el.value.trim()) L.push(o[1] + ": " + el.value.trim()); });
    if (last) L.push(T.est + ": " + last + " zł");
    return L.join("\n");
  }
  $("send-wa").addEventListener("click", function (e) {
    var m = message(); if (!m) { e.preventDefault(); return; }
    this.href = "https://wa.me/" + D.wa + "?text=" + encodeURIComponent(m);
  });
  $("send-sms").addEventListener("click", function (e) {
    var m = message(); if (!m) { e.preventDefault(); return; }
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.href = "sms:" + D.tel + (ios ? "&" : "?") + "body=" + encodeURIComponent(m);
  });
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
}
