# -*- coding: utf-8 -*-
"""Generator strony: python3 build.py  ->  ../dist/"""
import json, os, shutil, datetime, hashlib
from jinja2 import Environment, DictLoader
from data import (VIP_CAPTIONS, SITE_URL, BUSINESS as B, ZONES, VILLAGES, DESTINATIONS, KIND, TARIFF, ZONE_KM, KNUROW_CENTER,
                  GOOGLE_MAPS_BROWSER_KEY, GOOGLE_MAP_ID, NOW_WAIT_MIN)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "dist")
TODAY = datetime.date.today().isoformat()

ICON = {
 "phone": '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
 "wa": '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.1z"/></svg>',
 "cal": '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 7h14v10H5z"/></svg>',
 "star": '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z"/></svg>',
 "check": '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m9 16.2-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z"/></svg>',
 "bolt": '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
 "gps": '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.1A7 7 0 0 0 13 5.1V3h-2v2.1A7 7 0 0 0 5.1 11H3v2h2.1a7 7 0 0 0 5.9 5.9V21h2v-2.1a7 7 0 0 0 5.9-5.9H21zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>',
 "swap": '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3 3 7h3v9h2V7h3zm10 18 4-4h-3V8h-2v9h-3z"/></svg>',
 "plane": '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>',
 "train": '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8 2 4 2.5 4 6v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5v.5h2.2l2-2h3.6l2 2H18v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5-7H6V6h5zm2 0V6h5v4zm3.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
 "spa": '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c2 2.4 3 4.7 3 7a3 3 0 0 1-6 0c0-2.3 1-4.6 3-7zm-8 9c3 0 5.5 1.5 7 4-1.6 2.5-4 4-7 4zm16 0v8c-3 0-5.4-1.5-7-4 1.5-2.5 4-4 7-4z"/></svg>',
}
# Logo z pliku od klienta (czarne tło zamienione na przezroczyste, do ciemnych teł)
LOGO_HEAD = ('<img class="brand-logo" src="/assets/img/logo-emblem.webp" alt="" width="240" height="188">'
             '<span class="brand-text"><b>TAXI KNURÓW</b><small>ADAM MĄCZKA</small></span>')
# Taxi z boku (animacje: droga w hero i taksometr)
CAR = ('<svg width="64" height="28" viewBox="0 0 64 28" aria-hidden="true"><rect x="25" y="1" width="13" height="5" rx="1.5" fill="#FFC72C" stroke="#1C2430" stroke-width=".8"/>'
       '<path d="M6 18 12 10Q14 8 18 8H42Q46 8 49 11L54 16Q60 17 61 20V23H3V20Q3 18 6 18Z" fill="#FFC72C"/>'
       '<path d="M16 11H30V17H11ZM33 11H43Q45 11 47 13L50 17H33Z" fill="#9FC3E0"/><rect x="3" y="19" width="58" height="1.4" fill="#1C2430" opacity=".35"/>'
       '<circle cx="16" cy="22.5" r="4.5" fill="#1C2430"/><circle cx="16" cy="22.5" r="1.8" fill="#C9D0DA"/>'
       '<circle cx="48" cy="22.5" r="4.5" fill="#1C2430"/><circle cx="48" cy="22.5" r="1.8" fill="#C9D0DA"/><rect x="58" y="17.5" width="3.5" height="2.2" rx="1" fill="#FFF7D6"/></svg>')

DEST = {d["slug"]: d for d in DESTINATIONS}
def by_kind(k): return [d for d in DESTINATIONS if d["kind"] == k]
ZONE_VILL = {z: [v[1] for v in VILLAGES if v[3] == z] for z in ZONES}

def place_of(d):
    """Cel trasy jako punkt dla formularza: adres + współrzędne."""
    label = d["name"] if d["kind"] in ("airport", "spa") else (d["short"] if d["kind"] == "station" else d["name"])
    return dict(address=label, lat=d["lat"], lng=d["lng"])

CHIPS = [("plane", "lotnisko-pyrzowice", "Pyrzowice"), ("plane", "lotnisko-balice", "Balice"), ("plane", "lotnisko-wroclaw", "Wrocław"),
         ("train", "dworzec-gliwice", "Dworzec Gliwice"), ("train", "dworzec-katowice", "Dworzec Katowice")]

def client_config(lang):
    """window.TAXI – ustawienia dla app.js (formularz rezerwacji, status, opinie)."""
    return json.dumps(dict(
        lang=lang, key=GOOGLE_MAPS_BROWSER_KEY, mapId=GOOGLE_MAP_ID, wa=B["whatsapp"], tel=B["phone_e164"], telLabel=B["phone"],
        base=dict(lat=B["lat"], lng=B["lng"]), waitMin=NOW_WAIT_MIN, review=B["google_review"], maps=B["google_maps"],
        chips=[dict(icon=i, label=l, **place_of({**DEST_BY_SLUG[s]})) for i, s, l in CHIPS],
        airports=[dict(code=d["code"], lat=d["lat"], lng=d["lng"]) for d in DESTINATIONS if d["kind"] == "airport"]), ensure_ascii=False)

def write_server_config():
    """server/config.js – te same ceny i strefy dla funkcji Cloudflare (liczą cenę po stronie serwera)."""
    cfg = dict(
        phone=B["phone_e164"], seats=B["seats"], waitMin=NOW_WAIT_MIN,
        base=dict(lat=B["lat"], lng=B["lng"]), center=dict(lat=KNUROW_CENTER[0], lng=KNUROW_CENTER[1]),
        zoneKm=ZONE_KM, surcharge={z: ZONES[z]["surcharge"] for z in ZONES}, tariff=TARIFF,
        destinations=[dict(slug=d["slug"], code=d.get("code"), short=d["short"], price=d["price"], lat=d["lat"], lng=d["lng"], matchKm=d["match_km"]) for d in DESTINATIONS])
    path = os.path.join(HERE, "..", "server", "config.js")
    open(path, "w", encoding="utf-8").write("// GENERATED by src/build.py from src/data.py – do not edit by hand.\nexport const CONFIG = "
                                           + json.dumps(cfg, ensure_ascii=False, indent=1) + ";\n")
DEST_BY_SLUG = {d["slug"]: d for d in DESTINATIONS}

# ---------------- per-kind copy ----------------
def dest_copy(d):
    n, p = d["name"], d["price"]
    if d["kind"] == "airport":
        return dict(
            h1=f"Taxi z Knurowa na lotnisko {n.replace('Lotnisko ', '')} ({d['code']})",
            title=f"Taxi Knurów – {n} ({d['code']}) od {p} zł | {B['name']}",
            desc=f"Transfer z Knurowa i okolic na lotnisko {n.replace('Lotnisko ', '')} od {p} zł. Stała cena ustalona przed wyjazdem, odbiór spod domu 24/7, auta do 7 osób, pomoc z bagażem.",
            intro=f"Odbieramy spod domu w Knurowie, Gierałtowicach i okolicznych miejscowościach i wozimy prosto pod terminal. Cenę znasz przed wyjazdem, a przy powrocie czekamy w hali przylotów.",
            points=["Odbiór spod drzwi o dowolnej porze, także w nocy", "Przy przylocie śledzimy numer lotu – opóźnienie nie podnosi ceny",
                    "Auta do 7 osób i miejsce na walizki", "Płatność gotówką, kartą, BLIK-iem lub przelewem dla firm"],
            faq=[(f"Ile kosztuje taxi z Knurowa na {d['short']}?", f"Kurs z Knurowa kosztuje od {p} zł. Z Gierałtowic, Przyszowic i strefy A dochodzi {ZONES['A']['surcharge']} zł, ze strefy B {ZONES['B']['surcharge']} zł. Dokładną cenę potwierdzamy przy rezerwacji."),
                 ("Z jakim wyprzedzeniem rezerwować?", "Najlepiej dzień wcześniej, a przy wylotach w sezonie świątecznym i wakacyjnym kilka dni wcześniej. Kursy na już przyjmujemy telefonicznie, jeśli auto jest wolne."),
                 ("Co jeśli samolot się spóźni?", "Podaj numer lotu w rezerwacji. Sprawdzamy godzinę lądowania i przyjeżdżamy na rzeczywisty przylot."),
                 ("Czy można zarezerwować od razu powrót?", "Tak. W formularzu zaznacz „Kurs powrotny” i wpisz datę przylotu.")])
    if d["kind"] == "spa":
        return dict(
            h1=f"Taxi z Knurowa do sanatorium – {n}",
            title=f"Taxi do sanatorium {n} z Knurowa od {p} zł | {B['name']}",
            desc=f"Przejazd na turnus sanatoryjny do {d['gen']} z Knurowa i okolic od {p} zł. Odbiór spod domu, pomoc z bagażem, przywóz po turnusie w jednej rezerwacji.",
            intro=f"Wozimy kuracjuszy z Knurowa i okolic prosto pod drzwi ośrodka {d['loc']}. Pomagamy z walizkami, a kurs powrotny po zakończeniu turnusu możesz zarezerwować od razu.",
            points=["Odbiór spod domu i podjazd pod wejście ośrodka", "Pomoc przy wnoszeniu i znoszeniu bagażu",
                    "Powrót po turnusie w tej samej rezerwacji", "Rezerwację może złożyć rodzina – dzwonimy do pasażera przed wyjazdem"],
            faq=[(f"Ile kosztuje przejazd do {d['gen']}?", f"Od {p} zł z Knurowa w jedną stronę. Cenę za kurs w obie strony pokazuje kalkulator po zaznaczeniu „Kurs powrotny”."),
                 ("Czy pomożecie z bagażem?", "Tak, kierowca pomaga z walizkami przy domu i w ośrodku."),
                 ("Czy mogę zamówić kurs dla mamy lub taty?", "Tak. Wpisz w uwagach imię i telefon pasażera. Przed wyjazdem potwierdzimy z nim godzinę odbioru."),
                 ("Kiedy zarezerwować?", "Najlepiej od razu po otrzymaniu skierowania i terminu turnusu. Turnusy w popularnych terminach startują w te same dni, więc auta szybko się zajmują.")])
    if d["kind"] == "clinic":
        return dict(
            h1=f"Taxi z Knurowa do klinik i szpitali – {n}",
            title=f"Taxi Knurów – kliniki i szpitale {n} od {p} zł | {B['name']}",
            desc=f"Przejazdy na wizyty, badania i zabiegi {d['loc']}: od {p} zł z Knurowa. Odbiór spod domu, czekanie podczas wizyty, kurs powrotny.",
            intro=f"Dowozimy na wizyty, badania i zabiegi w szpitalach i klinikach {d['loc']}. Możemy poczekać na miejscu albo przyjechać po zakończeniu wizyty.",
            points=["Podjazd pod wskazane wejście lub izbę przyjęć", "Czekanie podczas wizyty albo odbiór po telefonie",
                    "Pomoc przy wsiadaniu i wysiadaniu", "Stali pacjenci: stała godzina i stały kierowca"],
            faq=[(f"Ile kosztuje taxi do {d['gen']}?", f"Od {p} zł z Knurowa w jedną stronę. Czas oczekiwania ustalamy przy rezerwacji."),
                 ("Czy kierowca poczeka na mnie?", "Tak, przy krótszych wizytach kierowca czeka na miejscu. Przy dłuższych przyjeżdża po telefonie."),
                 ("Czy wozicie osoby starsze lub z ograniczoną sprawnością?", "Tak. Napisz w uwagach, jakiej pomocy potrzebuje pasażer, żebyśmy mogli się przygotować.")])
    if d["kind"] == "station":
        return dict(
            h1=f"Taxi z Knurowa na dworzec – {n}",
            title=f"Taxi Knurów – dworzec {n} od {p} zł | {B['name']}",
            desc=f"Dojazd na dworzec {d['loc']} ({d.get('note','')}) z Knurowa i okolic od {p} zł. Odbiór o każdej porze, także na pierwsze i ostatnie pociągi.",
            intro=f"Zawozimy na pociągi i autobusy dalekobieżne {d['loc']} i odbieramy po przyjeździe. Podaj godzinę odjazdu, a dobierzemy godzinę wyjazdu z zapasem.",
            points=["Odbiór także na pierwsze poranne i ostatnie wieczorne połączenia", "Przy odbiorze czekamy przy wyjściu z dworca",
                    "Bagaż i walizki bez dopłat", "Stała cena ustalona przed kursem"],
            faq=[(f"Ile kosztuje taxi na dworzec {d['loc']}?", f"Od {p} zł z Knurowa."),
                 ("Czy odbierzecie mnie z pociągu?", "Tak. Podaj w rezerwacji numer lub godzinę przyjazdu pociągu.")])
    return dict(
        h1=f"Taxi z Knurowa do {d['gen']}",
        title=f"Taxi Knurów – {n} od {p} zł | {B['name']}",
        desc=f"Kurs z Knurowa do {d['gen']} od {p} zł: rynek, zakupy, imprezy, powroty nocą. Odbiór spod domu, płatność kartą lub BLIK-iem.",
        intro=f"Jeździmy do {d['gen']} na zakupy, spotkania i wieczorne wyjścia, a w nocy odbieramy z rynku i odwozimy pod dom.",
        points=["Powroty nocne z rynku", "Kursy z postojem, np. na zakupy", "Płatność kartą i BLIK-iem w aucie", "Stała cena ustalona przed kursem"],
        faq=[(f"Ile kosztuje kurs z Knurowa do {d['gen']}?", f"Od {p} zł. Z Gierałtowic i strefy A dochodzi {ZONES['A']['surcharge']} zł, ze strefy B {ZONES['B']['surcharge']} zł."),
             ("Czy można zamówić odbiór z rynku w nocy?", "Tak. Zadzwoń albo napisz na WhatsApp z adresem odbioru.")])

# ---------------- templates ----------------
BASE = r"""<!doctype html>
<html lang="{{ lang or 'pl' }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{{ title }}</title>
<meta name="description" content="{{ desc }}">
<link rel="canonical" href="{{ site }}{{ path }}">
<meta property="og:type" content="website"><meta property="og:title" content="{{ title }}"><meta property="og:description" content="{{ desc }}">
<meta property="og:url" content="{{ site }}{{ path }}"><meta property="og:image" content="{{ site }}/assets/og.png"><meta property="og:locale" content="{{ 'en_GB' if lang=='en' else 'pl_PL' }}">
<meta name="theme-color" content="#0A1430">{% if noindex %}<meta name="robots" content="noindex">{% endif %}
<link rel="manifest" href="/manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Taxi Knurów"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="icon" href="/assets/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/assets/icon-192.png">
<link rel="preload" href="/assets/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css?v={{ av }}">
<script>(function(h){var m=h.match(/^[0-9a-f]{8}\.([^.]+\.pages\.dev)$/);if(m)location.replace("https://"+m[1]+location.pathname+location.search+location.hash);})(location.hostname);
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__bip=e;});</script>
{% for s in schema %}<script type="application/ld+json">{{ s }}</script>
{% endfor %}</head>
<body>
<a class="skip" href="#main">{{ 'Skip to content' if lang=='en' else 'Przejdź do treści' }}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="{{ '/en/' if lang=='en' else '/' }}" aria-label="{{ B.name }}">{{ logo }}</a>
  <button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
  <nav class="nav" id="nav" aria-label="Menu główne">
    {% for href, label in nav %}<a href="{{ href }}"{% if href == path %} aria-current="page"{% endif %}>{{ label }}</a>{% endfor %}
    <a class="call-top" href="tel:{{ B.phone_e164 }}">{{ icon.phone }} {{ B.phone }}</a>
  </nav>
</div></header>
<a class="ride-banner" id="ride-banner" href="/przejazd/" hidden></a>
<main id="main">
{{ body }}
</main>
<footer><div class="wrap">
  <img class="foot-logo" src="/assets/img/logo-wide.webp" alt="{{ B.name }}" width="720" height="398" loading="lazy">
  <div class="cols">
    <div><h3>{{ B.name }}</h3><p>{{ B.street }}<br>{{ B.postal }} {{ B.city }}</p>
      <p><a href="tel:{{ B.phone_e164 }}"><strong>{{ B.phone }}</strong></a><br><a href="https://wa.me/{{ B.whatsapp }}">WhatsApp</a></p></div>
    <div><h3>Trasy</h3><ul>{% for k in kinds %}<li><a href="/{{ k.hub }}/">{{ k.hub_name }}</a></li>{% endfor %}<li><a href="/cennik/">Cennik</a></li></ul></div>
    <div><h3>Rejon odbioru</h3><ul>{% for v in villages[1:8] %}<li><a href="/taxi-{{ v[0] }}/">Taxi {{ v[1] }}</a></li>{% endfor %}<li><a href="/#rejon">Wszystkie miejscowości</a></li></ul></div>
    <div><h3>Informacje</h3><ul><li><a href="/dla-firm/">Dla firm</a></li><li><a href="/kontakt/">Kontakt</a></li><li><a href="/en/">English</a></li><li><a href="/polityka-prywatnosci/">Polityka prywatności</a></li></ul></div>
  </div>
  <div class="foot-bottom"><span>© {{ year }} {{ B.name }}. Bez reklam i śledzenia.</span>
    <span class="credit">{{ 'Website & booking system:' if lang=='en' else 'Strona i system rezerwacji:' }} <a href="https://okredo.com/pl-pl/firma/kemet-poland-spolka-z-ograniczona-odpowiedzialnoscia-krs-0001270297" target="_blank" rel="noopener">Kemet Poland sp. z o.o.</a></span>
    <button class="theme-toggle" type="button">Jasny / ciemny motyw</button></div>
</div></footer>
<nav class="actionbar" aria-label="Szybki kontakt">
  <a class="a-call" href="tel:{{ B.phone_e164 }}">{{ icon.phone }}{{ 'Call' if lang=='en' else 'Zadzwoń' }}</a>
  <a class="a-wa" href="https://wa.me/{{ B.whatsapp }}">{{ icon.wa }}WhatsApp</a>
  <a class="a-book" href="{{ '/en/#booking' if lang=='en' else '/rezerwacja/' }}">{{ icon.bolt }}{{ 'Book' if lang=='en' else 'Zamów' }}</a>
</nav>
<div class="install" id="install" role="dialog" aria-labelledby="install-title" hidden>
  <button type="button" class="install-x" id="install-x" aria-label="{{ 'Close' if lang=='en' else 'Zamknij' }}">×</button>
  <div class="install-art" aria-hidden="true">
    <div class="phone"><div class="notch"></div><div class="apps">{% for i in range(11) %}<i></i>{% endfor %}<span class="slot"></span></div></div>
    <img class="fly-icon" src="/assets/icon-192.png" alt="" width="64" height="64">
  </div>
  <div class="install-text">
    <h2 id="install-title">{{ 'Taxi Knurów on your phone' if lang=='en' else 'Taxi Knurów w Twoim telefonie' }}</h2>
    <p>{{ 'Add the site to your home screen and book a ride with one tap – just like an app. No download, no account.' if lang=='en' else 'Dodaj stronę do ekranu głównego i zamawiaj kurs jednym dotknięciem – jak w aplikacji. Bez pobierania i zakładania konta.' }}</p>
    <ol class="install-ios" hidden>
      <li>{{ 'Tap' if lang=='en' else 'Dotknij' }} <span class="ios-share"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4zM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-4v2h2v8H7v-8h2v-2z"/></svg> {{ 'Share' if lang=='en' else 'Udostępnij' }}</span> {{ 'in Safari' if lang=='en' else 'na dole Safari' }}</li>
      <li>{{ 'Choose' if lang=='en' else 'Wybierz' }} <b>{{ '„Add to Home Screen”' if lang=='en' else '„Do ekranu początkowego”' }}</b></li>
    </ol>
    <p class="install-hint install-android" hidden>{{ 'Open the browser menu' if lang=='en' else 'Otwórz menu przeglądarki' }} <b>⋮</b> {{ 'and choose' if lang=='en' else 'i wybierz' }} <b>{{ '„Install app” / „Add to Home screen”' if lang=='en' else '„Zainstaluj aplikację” / „Dodaj do ekranu głównego”' }}</b>.</p>
    <p class="install-hint install-desktop" hidden>{{ 'Click the install icon' if lang=='en' else 'Kliknij ikonę instalacji' }} <b>⊕</b> {{ 'on the right of the address bar, or open the menu ⋮ → „Install”.' if lang=='en' else 'po prawej stronie paska adresu albo menu ⋮ → „Zainstaluj”.' }}</p>
    <button type="button" class="btn btn-book install-go" id="install-go" hidden>{{ 'Add to home screen' if lang=='en' else 'Dodaj do ekranu' }}</button>
  </div>
  <span class="ios-arrow" aria-hidden="true">↓</span>
</div>
<dialog class="lightbox" id="lightbox"><button type="button" class="lb-x" aria-label="Zamknij">×</button><img alt=""><p></p></dialog>
<script>window.TAXI={{ config|safe }};</script>
<script src="/assets/app.js?v={{ av }}" defer></script>
</body></html>"""

BOOK = r"""<form class="book" id="booking" data-mode="{{ mode }}"{% if dest %} data-dest='{{ dest }}'{% endif %} novalidate>
  <div class="book-head">
    <h2>{{ title or t.title }}</h2>
    <p class="book-sub"><span class="live" aria-hidden="true"></span>{{ t.sub }}</p>
  </div>
  <div class="seg" role="radiogroup" aria-label="{{ t.whenq }}">
    <button type="button" role="radio" class="seg-btn" data-mode="now" aria-checked="{{ 'true' if mode=='now' else 'false' }}">{{ icon.bolt }}<span>{{ t.now }}<small>{{ t.now_s }}</small></span></button>
    <button type="button" role="radio" class="seg-btn" data-mode="later" aria-checked="{{ 'true' if mode=='later' else 'false' }}">{{ icon.cal }}<span>{{ t.later }}<small>{{ t.later_s }}</small></span></button>
    <span class="seg-ind" aria-hidden="true"></span>
  </div>
  <div class="trip">
    <div class="loc">
      <span class="pin pin-a" aria-hidden="true"></span>
      <label class="sr-only" for="pickup">{{ t.from_ }}</label>
      <input id="pickup" type="text" placeholder="{{ pickup_ph or t.from_ph }}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pickup-list">
      <button type="button" class="gps" id="gps" title="{{ t.gps }}">{{ icon.gps }}<span>{{ t.gps_s }}</span></button>
      <ul class="sugg" id="pickup-list" role="listbox" hidden></ul>
    </div>
    <div class="trip-line" aria-hidden="true"></div>
    <button type="button" class="swap-btn" id="swap" aria-label="{{ t.swap }}" title="{{ t.swap }}">{{ icon.swap }}</button>
    <div class="loc">
      <span class="pin pin-b" aria-hidden="true"></span>
      <label class="sr-only" for="dest">{{ t.to }}</label>
      <input id="dest" type="text" placeholder="{{ t.to_ph }}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="dest-list">
      <ul class="sugg" id="dest-list" role="listbox" hidden></ul>
    </div>
  </div>
  <div class="chips" role="group" aria-label="{{ t.popular }}">{% for c in chips %}<button type="button" class="chip" data-chip="{{ loop.index0 }}">{{ icon[c.icon] }}{{ c.label }}</button>{% endfor %}</div>
  <div class="row2 later-only"{% if mode != 'later' %} hidden{% endif %}>
    <div class="field"><label for="date">{{ t.date }}</label><input type="date" id="date"></div>
    <div class="field"><label for="time">{{ t.time }}</label><input type="time" id="time" step="300"></div>
  </div>
  <div class="flight-wrap" id="flight-wrap" hidden>
    <div class="field"><label for="flight">{{ t.flight }}</label><input id="flight" placeholder="{{ t.flight_ph }}" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
    <div class="flight-info" id="flight-info" aria-live="polite" hidden></div>
  </div>
  <div class="map-wrap" id="map-wrap" hidden><div class="map" id="map"></div></div>
  <div class="quote" id="quote" hidden>
    <div class="q-cells" aria-live="polite">
      <div><span>{{ t.distance }}</span><b id="q-dist">–</b></div>
      <div><span>{{ t.duration }}</span><b id="q-time">–</b></div>
      <div class="q-price"><span id="q-price-lbl">{{ t.price }}</span><b id="q-price">–</b></div>
    </div>
    <p class="q-eta" id="q-eta" hidden></p>
  </div>
  <div class="row2">
    <div class="field"><label for="name">{{ t.name }}</label><input id="name" autocomplete="given-name"></div>
    <div class="field"><label for="tel">{{ t.phone }} <span class="req">*</span></label><input id="tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="{{ t.phone_ph }}"></div>
  </div>
  <div class="row2">
    <div class="field"><label for="pax">{{ t.pax }}</label><select id="pax">{% for i in range(1, B.seats + 1) %}<option>{{ i }}</option>{% endfor %}</select></div>
    <div class="field"><label for="lug">{{ t.luggage }}</label><select id="lug">{% for o in t.lug_opts %}<option value="{{ '' if loop.first else o }}">{{ o }}</option>{% endfor %}</select></div>
  </div>
  <details class="more"><summary>{{ t.more }}</summary>
    <div class="field later-only"{% if mode != 'later' %} hidden{% endif %}><label for="back">{{ t.back }}</label><input id="back" placeholder="{{ t.back_ph }}"></div>
    <div class="field"><label for="notes">{{ t.notes }}</label><textarea id="notes" placeholder="{{ t.notes_ph }}"></textarea></div>
  </details>
  <div class="hp" aria-hidden="true"><label>Website<input id="website" tabindex="-1" autocomplete="off"></label></div>
  <p class="form-error" id="form-error" role="alert"></p>
  <button type="submit" class="btn btn-book" id="book-btn"><span class="for-now">{{ t.book_now }}</span><span class="for-later">{{ t.book_later }}</span><span class="arrow" aria-hidden="true">→</span></button>
  <p class="alt-contact">{{ t.or_ }} <a href="tel:{{ B.phone_e164 }}">{{ icon.phone }} {{ B.phone }}</a> <a id="send-wa" href="https://wa.me/{{ B.whatsapp }}" target="_blank" rel="noopener">{{ icon.wa }} WhatsApp</a></p>
</form>"""

T_BOOK = {
 "pl": dict(title="Zamów taxi", sub="Całodobowo · kierowca potwierdza w kilka minut", whenq="Kiedy jedziesz?",
            now="Teraz", now_s="auto jak najszybciej", later="Na później", later_s="lotnisko, sanatorium…",
            from_="Skąd", from_ph="Skąd? Wpisz adres odbioru", to="Dokąd", to_ph="Dokąd jedziesz?",
            gps="Użyj mojej lokalizacji", gps_s="Tu jestem", swap="Zamień kierunek", popular="Popularne cele",
            date="Data", time="Godzina odbioru", distance="Trasa", duration="Czas jazdy", price="Cena",
            name="Imię", phone="Telefon", phone_ph="np. 600 100 200", pax="Osoby", luggage="Bagaż",
            lug_opts=["bez dużego bagażu", "1–2 walizki", "3–4 walizki", "więcej niż 4"],
            more="Szczegóły: powrót, uwagi", flight="Numer lotu (sprawdzimy godzinę)", flight_ph="np. FR 1234",
            back="Kurs powrotny (data, godzina)", back_ph="np. 24.10, przylot 21:40",
            notes="Uwagi dla kierowcy", notes_ph="np. fotelik dla dziecka, pomoc z bagażem, brama od podwórza",
            book_now="Zamów teraz", book_later="Zarezerwuj kurs", or_="albo zadzwoń:"),
 "en": dict(title="Book a taxi", sub="24/7 · the driver confirms within minutes", whenq="When?",
            now="Now", now_s="as soon as possible", later="Later", later_s="airport, scheduled…",
            from_="From", from_ph="Pickup address", to="To", to_ph="Where to?",
            gps="Use my location", gps_s="I'm here", swap="Swap", popular="Popular destinations",
            date="Date", time="Pickup time", distance="Distance", duration="Drive", price="Price",
            name="Name", phone="Phone", phone_ph="e.g. +44 7700 900123", pax="Passengers", luggage="Luggage",
            lug_opts=["no large luggage", "1–2 suitcases", "3–4 suitcases", "more than 4"],
            more="Details: return, notes", flight="Flight number (we'll check the time)", flight_ph="e.g. FR 1234",
            back="Return trip (date, time)", back_ph="e.g. 24 Oct, landing 21:40",
            notes="Notes for the driver", notes_ph="e.g. child seat, help with luggage",
            book_now="Book now", book_later="Book this ride", or_="or call:"),
}

env = Environment(loader=DictLoader({"base": BASE, "book": BOOK}), autoescape=False)
# version stamp for style.css / app.js: a new deploy always loads the new files (no stale copies in phones / the installed app)
_here = os.path.dirname(os.path.abspath(__file__))
env.globals["av"] = hashlib.sha1(b"".join(open(os.path.join(_here, "assets", f), "rb").read() for f in ("style.css", "app.js"))).hexdigest()[:10]
NAV = [("/lotniska/", "Lotniska"), ("/sanatoria/", "Sanatoria"), ("/kliniki/", "Kliniki"), ("/dworce/", "Dworce"),
       ("/cennik/", "Cennik"), ("/dla-firm/", "Dla firm"), ("/kontakt/", "Kontakt")]
def book(dest=None, mode="now", title=None, pickup_ph=None, lang="pl"):
    """Formularz zamówienia. dest = slug celu (strony lotnisk itd.) – wpisany od razu w „Dokąd”."""
    d = json.dumps(place_of(DEST[dest]), ensure_ascii=False).replace("'", "&#39;") if dest else None
    chips = [dict(icon=i, label=l) for i, s, l in CHIPS]
    return env.get_template("book").render(B=B, icon=ICON, t=T_BOOK[lang], mode=mode, dest=d, title=title, pickup_ph=pickup_ph, chips=chips)

def ld(obj): return json.dumps(obj, ensure_ascii=False)

def org():
    return {"@context": "https://schema.org", "@type": "LocalBusiness", "@id": SITE_URL + "/#firma", "name": B["name"],
            "telephone": B["phone_e164"], "url": SITE_URL + "/", "image": SITE_URL + "/assets/og.png", "priceRange": "15–850 zł",
            "address": {"@type": "PostalAddress", "streetAddress": B["street"].replace("ul. ", ""), "postalCode": B["postal"],
                        "addressLocality": B["city"], "addressCountry": "PL"},
            "geo": {"@type": "GeoCoordinates", "latitude": B["lat"], "longitude": B["lng"]},
            "openingHoursSpecification": {"@type": "OpeningHoursSpecification",
                "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"], "opens": "00:00", "closes": "23:59"},
            "areaServed": [v[1] for v in VILLAGES], "paymentAccepted": ", ".join(B["payments"])}

def faq_ld(faq):
    return {"@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}

def crumbs_ld(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": SITE_URL + u} for i, (n, u) in enumerate(items)]}

def faq_html(faq):
    return '<div class="faq">' + "".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in faq) + "</div>"

def crumbs_html(items):
    return '<nav class="crumbs" aria-label="Okruszki">' + " / ".join(
        f'<a href="{u}">{n}</a>' if i < len(items) - 1 else f"<span>{n}</span>" for i, (n, u) in enumerate(items)) + "</nav>"

def zone_table(price):
    rows = "".join(f"<tr><td>{'Knurów (z Szczygłowicami i Krywałdem)' if z == '0' else 'Strefa ' + z + ': ' + ', '.join(ZONE_VILL[z])}</td><td>{price + ZONES[z]['surcharge']} zł</td></tr>" for z in ZONES)
    return f'<div class="table-wrap"><table class="price-table"><thead><tr><th>Odbiór z</th><th>Cena od</th></tr></thead><tbody>{rows}</tbody></table></div>'

def board(groups):
    html = '<div class="board">'
    for k in groups:
        items = by_kind(k)
        html += f'<div class="board-group"><h3><a href="/{KIND[k]["hub"]}/">{KIND[k]["plural"]}</a></h3><ul>'
        for d in items:
            code = f'<span class="code">{d["code"]}</span>' if d.get("code") else ""
            label = d["name"] if k != "airport" else d["name"].replace("Lotnisko ", "")
            html += f'<li><a href="/{d["slug"]}/"><span>{code}{label}</span><span class="price"><small>od </small>{d["price"]} zł</span></a></li>'
        html += "</ul></div>"
    return html + "</div>"

pages = []
NOINDEX = set()
def page(path, title, desc, body, schema=(), lang="pl", noindex=False):
    pages.append(path)
    if noindex: NOINDEX.add(path)
    body = body.replace('<section class="hero" style="padding:0">', '<section class="hero">' + STREAKS)
    html = env.get_template("base").render(
        lang=lang, title=title, desc=desc, path=path, site=SITE_URL, body=body, schema=[ld(s) for s in schema],
        B=B, icon=ICON, logo=LOGO_HEAD, nav=NAV, kinds=[KIND[k] for k in KIND], villages=VILLAGES, year=datetime.date.today().year,
        config=client_config(lang), noindex=noindex)
    target = os.path.join(OUT, path.strip("/"), "index.html") if path.endswith("/") else os.path.join(OUT, path.strip("/"))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    open(target, "w", encoding="utf-8").write(html)

# Światła nocnego ruchu w tle hero (niebieskie i żółte smugi)
STREAKS = '<div class="streaks" aria-hidden="true">' + "".join(f'<i style="--y:{y}%;--d:{d}s;--w:{w}%;--c:var(--{c})"></i>' for y, d, w, c in
           [(18, 9, 30, "blue-2"), (34, 13, 22, "yellow"), (52, 7.5, 34, "blue-2"), (67, 11, 18, "yellow"), (81, 15, 28, "blue-2")]) + "</div>"

def hero(h1, lead, meter_html, crumbs=None, facts=True, logo=False):
    f = ""
    if facts:
        f = (f'<ul class="hero-facts"><li class="status">Całodobowo, 7 dni w tygodniu</li>'
             f'<li>{ICON["star"]}<span class="stars">{B["rating"]}</span>&nbsp;z {B["reviews"]} opinii w Google</li>'
             f'<li>{ICON["check"]} Auta do {B["seats"]} osób</li><li>{ICON["check"]} Karta, BLIK, przelew</li></ul>')
    lg = ('<img class="hero-logo" src="/assets/img/logo.webp" alt="" width="560" height="671" fetchpriority="high">' if logo else "")
    return (f'<section class="hero" style="padding:0"><div class="wrap"><div class="hero-copy">{crumbs or ""}{lg}<h1>{h1}</h1>'
            f'<p class="lead">{lead}</p>{f}</div>{meter_html}</div>{ROAD}</section>')

ROAD = f'<div class="hero-road" aria-hidden="true"><span class="car">{CAR}</span></div>'

# Usługi jako karty ze zdjęciami (zdjęcia: Unsplash License, hostowane lokalnie)
def min_price(k): return min(d["price"] for d in by_kind(k))
SERVICES = [
    ("lotniska", "/lotniska/", "Lotniska", f"Transfer od {min_price('airport')} zł", "Pyrzowice, Balice, Wrocław, Warszawa. Śledzimy lot przy powrocie.", "Podróżny z walizką na lotnisku, w tle startujący samolot"),
    ("sanatoria", "/sanatoria/", "Sanatoria", f"Przejazd od {min_price('spa')} zł", "Busko-Zdrój, Szczyrk, Ustroń. Pomoc z bagażem i powrót po turnusie.", "Zabieg relaksacyjny w ośrodku uzdrowiskowym"),
    ("kliniki", "/kliniki/", "Kliniki", f"Wizyty od {min_price('clinic')} zł", "Katowice, Gliwice, Zabrze. Kierowca może poczekać podczas wizyty.", "Lekarz w białym fartuchu ze stetoskopem"),
    ("dworce", "/dworce/", "Dworce", f"Dojazd od {min_price('station')} zł", "PKP i autobusy dalekobieżne, także pierwsze i ostatnie połączenia.", "Pociągi na peronach pod zadaszeniem dworca"),
    ("miasta", "/miasta/", "Miasta", f"Kursy od {min_price('city')} zł", "Rynek, zakupy, wieczorne wyjścia i bezpieczne powroty nocą.", "Podświetlony znak TAXI na dachu samochodu nocą"),
    ("firmy", "/dla-firm/", "Dla firm", "Faktura i przelew", "Delegacje, transfery gości i rozliczenie raz w miesiącu.", "Kierowca z zegarkiem na nadgarstku prowadzi samochód o zmierzchu"),
]
def services_block():
    cards = "".join(
        f'<li class="svc" data-reveal style="--i:{i}"><a href="{href}">'
        f'<span class="svc-ph"><img src="/assets/img/{img}.webp" alt="{alt}" width="900" height="760" loading="lazy" decoding="async"></span>'
        f'<span class="svc-cap"><span class="svc-title">{title}</span><span class="svc-sub">{sub}</span></span>'
        f'<span class="svc-more"><span>{more}</span><b>Zobacz ceny <span aria-hidden="true">→</span></b></span></a></li>'
        for i, (img, href, title, sub, more, alt) in enumerate(SERVICES))
    return (f'<section class="services"><div class="wrap"><div class="sec-head"><h2>Nasze usługi</h2>'
            f'<p class="muted">Jeden numer, każdy kurs: {B["phone"]}</p></div><ul class="svc-grid">{cards}</ul></div></section>')

STEPS = ('<ol class="steps"><li><h3>Wskaż trasę</h3><p>Kliknij „Tu jestem” albo wpisz adres. Od razu widzisz trasę, czas jazdy i cenę.</p></li>'
         '<li><h3>Zamów teraz lub na później</h3><p>Kurs teraz trafia od razu do telefonu kierowcy. Lotnisko czy sanatorium rezerwujesz na wybrany dzień i godzinę.</p></li>'
         '<li><h3>Śledź status na żywo</h3><p>Widzisz, kiedy kierowca potwierdzi kurs i za ile minut będzie. Bez dzwonienia i czekania.</p></li></ol>')

def village_links():
    return '<ul class="villages">' + "".join(
        f'<li><a href="{"/" if s == "knurow" else "/taxi-" + s + "/"}">{n}</a></li>' for s, n, *_ in VILLAGES) + "</ul>"

def reviews_block():
    """Opinie z Google – karty ładuje app.js z /api/reviews; bez backendu zostaje sama ocena i link."""
    stars = ICON["star"] * 5
    return (f'<section class="reviews" id="opinie"><div class="wrap">'
            f'<div class="rv-head"><div><h2>Co mówią klienci</h2><p class="muted">Najlepsze opinie z naszej wizytówki Google.</p></div>'
            f'<div class="g-score"><span class="g-num" id="g-num">{B["rating"]}</span><span><span class="g-stars">{stars}</span>'
            f'<small id="g-count">{B["reviews"]} opinii w Google</small></span></div></div>'
            f'<div class="rv-track" id="rv-track" tabindex="0" aria-label="Opinie klientów"></div>'
            f'<div class="rv-foot"><div class="rv-nav" id="rv-nav" hidden><button type="button" data-dir="-1" aria-label="Poprzednie opinie">←</button>'
            f'<button type="button" data-dir="1" aria-label="Następne opinie">→</button></div>'
            f'<p><a class="btn btn-ink" id="rv-all" href="{B["google_maps"]}" target="_blank" rel="noopener">Wszystkie opinie w Google</a> '
            f'<a class="btn btn-line" href="{B["google_review"]}" target="_blank" rel="noopener">Dodaj swoją opinię</a></p></div>'
            f'</div></section>')

VIP_DIR = os.path.join(HERE, "assets", "img", "vip")
def vip_photos():
    if not os.path.isdir(VIP_DIR): return []
    return sorted(f for f in os.listdir(VIP_DIR) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))

def vip_block():
    feats = [("Punktualnie co do minuty", "Śledzimy lot i korki, czekamy z tabliczką z nazwiskiem gościa."),
             ("Pełna dyskrecja", "Plany, rozmowy i trasa zostają w aucie."),
             ("Komfort na długą trasę", "Czyste, klimatyzowane auto i miejsce na bagaż całej ekipy."),
             ("Rozliczenie dla firm", "Faktura i przelew, także zbiorczo raz w miesiącu.")]
    photos = vip_photos()
    gallery = ""
    if photos:
        gallery = '<ul class="vip-gallery">' + "".join(
            f'<li data-reveal style="--i:{i}"><button type="button" class="vip-ph" data-full="/assets/img/vip/{f}" data-cap="{VIP_CAPTIONS.get(f, "")}">'
            f'<img src="/assets/img/vip/{f}" alt="{VIP_CAPTIONS.get(f, "Przewóz VIP – Taxi Knurów Adam Mączka")}" loading="lazy" decoding="async">'
            + (f'<span>{VIP_CAPTIONS[f]}</span>' if VIP_CAPTIONS.get(f) else "") + '</button></li>'
            for i, f in enumerate(photos)) + "</ul>"
    items = "".join(f'<li><b>{t}</b><span>{d}</span></li>' for t, d in feats)
    return (f'<section class="vip" id="vip"><div class="wrap"><div class="vip-grid"><div>'
            f'<span class="vip-badge">VIP · ŚLĄSK</span><h2>Przewozy VIP na Śląsku</h2>'
            f'<p class="lead">Wozimy gości biznesowych, artystów i delegacje – z lotniska na spotkanie, galę czy koncert, i z powrotem. Dyskretnie, punktualnie i w komfortowym aucie.</p>'
            f'<p class="vip-cta"><a class="btn btn-gold" href="tel:{B["phone_e164"]}">{ICON["phone"]} Zarezerwuj przejazd VIP</a> <a class="btn btn-line" href="/dla-firm/">Oferta dla firm</a></p>'
            f'</div><ul class="vip-feats">{items}</ul></div>{gallery}</div></section>')

# ================= HOME =================
home_faq = [
    ("Ile kosztuje taxi z Knurowa na lotnisko w Pyrzowicach?", f"Od {DEST['lotnisko-pyrzowice']['price']} zł z Knurowa. Ceny dla wszystkich lotnisk znajdziesz w cenniku i w kalkulatorze."),
    ("Czy jeździcie w nocy i w święta?", "Tak, przyjmujemy kursy całodobowo, 7 dni w tygodniu. Kursy na lotniska i dworce najlepiej rezerwować z wyprzedzeniem."),
    ("Jak zapłacić za kurs?", "Gotówką, kartą, BLIK-iem, a firmy także przelewem na fakturę."),
    ("Ile osób zmieści się w aucie?", f"Do {B['seats']} osób. Przy 5–7 pasażerach podstawimy auto 7-osobowe – zaznacz liczbę osób w rezerwacji."),
    ("Czy mogę zamówić kurs dla rodzica?", "Tak. W uwagach wpisz imię i telefon pasażera. Przed wyjazdem potwierdzimy z nim godzinę odbioru."),
]
body = hero('<span class="sr-only">Taxi Knurów Adam Mączka – </span>Twoje taxi w Knurowie, <em>na teraz</em> i na lotnisko',
            f"Zamów jak w aplikacji: wskaż adres, zobacz cenę i śledź, za ile minut będzie kierowca. Pyrzowice od {DEST['lotnisko-pyrzowice']['price']} zł, Balice od {DEST['lotnisko-balice']['price']} zł.",
            book(), logo=True)
body += services_block()
body += vip_block()
body += ('<section class="alt"><div class="wrap"><div class="sec-head"><h2>Najczęstsze trasy</h2><p class="muted">Ceny od, z Knurowa. Odbiór z innych miejscowości: +10 lub +20 zł.</p></div>'
         + board(["airport", "spa"]) + '<p style="margin-top:14px">Kliniki, dworce i miasta: <a href="/kliniki/">kliniki</a>, <a href="/dworce/">dworce</a>, <a href="/miasta/">miasta</a> albo <a href="/cennik/">pełny cennik</a>.</p></div></section>')
body += f'<section><div class="wrap"><h2>Jak zarezerwować kurs</h2>{STEPS}</div></section>'
body += reviews_block()
body += (f'<section id="rejon"><div class="wrap"><h2>Rejon odbioru</h2><p>Przyjeżdżamy po pasażerów w tych miejscowościach. Wybierz swoją, żeby zobaczyć ceny z Twojej okolicy.</p>{village_links()}</div></section>')
body += f'<section class="alt"><div class="wrap"><h2>Pytania i odpowiedzi</h2>{faq_html(home_faq)}</div></section>'
page("/", f"Taxi Knurów Adam Mączka – lotniska od {DEST['lotnisko-pyrzowice']['price']} zł, sanatoria, kliniki | 24/7",
     f"Taxi w Knurowie i Gierałtowicach: transfery na lotniska (Pyrzowice od {DEST['lotnisko-pyrzowice']['price']} zł), do sanatoriów i klinik. Stała cena przed kursem, rezerwacja przez WhatsApp, 24/7.",
     body, [org(), faq_ld(home_faq)])

# ================= DESTINATIONS =================
for d in DESTINATIONS:
    c = dest_copy(d); k = KIND[d["kind"]]
    cr = [("Strona główna", "/"), (k["hub_name"], f"/{k['hub']}/"), (d["short"], f"/{d['slug']}/")]
    related = [x for x in by_kind(d["kind"]) if x["slug"] != d["slug"]][:5]
    rel = '<ul class="villages">' + "".join(f'<li><a href="/{x["slug"]}/">{x["short"]} – od {x["price"]} zł</a></li>' for x in related) + "</ul>"
    pts = '<ul style="padding-left:1.1em">' + "".join(f"<li>{p}</li>" for p in c["points"]) + "</ul>"
    body = hero(c["h1"], c["intro"], book(dest=d["slug"], mode="now" if d["kind"] == "city" else "later", title=f"Zamów: {d['short']}"), crumbs_html(cr))
    body += (f'<section><div class="wrap cols"><div><h2>Ceny z Twojej okolicy</h2>{zone_table(d["price"])}'
             f'<p class="small muted" style="margin-top:10px">Kurs w obie strony: zaznacz „Kurs powrotny” w kalkulatorze.</p></div>'
             f'<div><h2>Co zawiera kurs</h2>{pts}</div></div></section>')
    body += f'<section class="alt"><div class="wrap"><h2>Pytania i odpowiedzi</h2>{faq_html(c["faq"])}</div></section>'
    body += f'<section><div class="wrap"><h2>Inne trasy: {k["plural"].lower()}</h2>{rel}</div></section>'
    svc = {"@context": "https://schema.org", "@type": "Service", "serviceType": "Taxi", "name": c["h1"],
           "provider": {"@id": SITE_URL + "/#firma"}, "areaServed": [v[1] for v in VILLAGES],
           "offers": {"@type": "Offer", "priceCurrency": "PLN", "price": d["price"], "description": "Cena od, z Knurowa"}}
    page(f"/{d['slug']}/", c["title"], c["desc"], body, [org(), svc, faq_ld(c["faq"]), crumbs_ld(cr)])

# ================= HUBS =================
hub_lead = {
    "airport": "Odbiór spod domu i podjazd pod terminal. Śledzimy lot przy powrocie, a cenę znasz przed wyjazdem.",
    "spa": "Wozimy kuracjuszy na turnusy i odbieramy po ich zakończeniu. Pomoc z bagażem w cenie.",
    "clinic": "Przejazdy na wizyty, badania i zabiegi. Kierowca może poczekać albo przyjechać po telefonie.",
    "station": "Dojazdy na pociągi i autobusy dalekobieżne, także na pierwsze i ostatnie połączenia.",
    "city": "Kursy na rynek, zakupy i wieczorne wyjścia, z odbiorem także w nocy.",
}
for kk, k in KIND.items():
    items = by_kind(kk)
    cr = [("Strona główna", "/"), (k["hub_name"], f"/{k['hub']}/")]
    first = items[0]
    body = hero(k["hub_name"] + " z Knurowa", hub_lead[kk], book(dest=first["slug"], mode="now" if kk == "city" else "later"), crumbs_html(cr))
    body += f'<section><div class="wrap"><div class="sec-head"><h2>{k["plural"]} i ceny</h2><p class="muted">Ceny od, z Knurowa.</p></div>{board([kk])}</div></section>'
    body += f'<section class="alt"><div class="wrap"><h2>Jak zarezerwować kurs</h2>{STEPS}</div></section>'
    page(f"/{k['hub']}/", f"{k['hub_name']} z Knurowa – ceny od {min(x['price'] for x in items)} zł | {B['name']}",
         f"{k['hub_name']} z Knurowa, Gierałtowic i okolic: {', '.join(x['short'] for x in items)}. Stała cena, rezerwacja przez WhatsApp lub telefon.",
         body, [org(), crumbs_ld(cr)])

# ================= VILLAGES =================
for slug, name, loc, zone, price in VILLAGES:
    if slug == "knurow": continue
    sur = ZONES[zone]["surcharge"]
    cr = [("Strona główna", "/"), (f"Taxi {name}", f"/taxi-{slug}/")]
    rows = "".join(f'<tr><td><a href="/{d["slug"]}/">{d["short"]}</a></td><td>{d["price"] + sur} zł</td></tr>'
                   for d in DESTINATIONS if d["kind"] in ("airport", "spa", "station"))
    body = hero(f"Taxi {name}: lotniska, sanatoria i kursy lokalne",
                f"Odbieramy pasażerów {loc} o każdej porze. Kurs do Knurowa od {price} zł, a na lotnisko w Pyrzowicach od {DEST['lotnisko-pyrzowice']['price'] + sur} zł.",
                book(pickup_ph=f"Adres odbioru, {name}"), crumbs_html(cr))
    body += (f'<section><div class="wrap"><h2>Ceny z miejscowości {name}</h2><div class="table-wrap"><table class="price-table"><thead><tr><th>Trasa</th><th>Cena od</th></tr></thead>'
             f'<tbody><tr><td>Knurów</td><td>{price} zł</td></tr>{rows}</tbody></table></div></div></section>')
    body += f'<section class="alt"><div class="wrap"><h2>Inne miejscowości w rejonie</h2>{village_links()}</div></section>'
    page(f"/taxi-{slug}/", f"Taxi {name} – lotniska, sanatoria, kursy 24/7 | {B['name']}",
         f"Taxi {loc}: odbiór spod domu 24/7, Pyrzowice od {DEST['lotnisko-pyrzowice']['price'] + sur} zł, sanatoria i kliniki. Rezerwacja przez WhatsApp lub telefon.",
         body, [org(), crumbs_ld(cr)])

# ================= CENNIK =================
def price_rows(kind):
    return "".join(f'<tr><td><a href="/{d["slug"]}/">{d["name"]}</a></td><td>{d["price"]} zł</td></tr>' for d in by_kind(kind))
tables = ""
for kk, k in KIND.items():
    tables += f'<h2 style="margin-top:1.2em">{k["plural"]}</h2><div class="table-wrap"><table class="price-table"><thead><tr><th>Trasa z Knurowa</th><th>Cena od</th></tr></thead><tbody>{price_rows(kk)}</tbody></table></div>'
local = "".join(f'<tr><td>{n}</td><td>{p} zł</td></tr>' for s, n, l, z, p in VILLAGES)
zones_txt = "".join(f"<li><strong>{'Knurów' if z == '0' else 'Strefa ' + z}</strong> (+{ZONES[z]['surcharge']} zł): {', '.join(ZONE_VILL[z])}</li>" for z in ZONES)
body = (f'<section class="hero" style="padding:0"><div class="wrap" style="grid-template-columns:1fr"><div>{crumbs_html([("Strona główna","/"),("Cennik","/cennik/")])}'
        f'<h1>Cennik</h1><p class="lead">Ceny od, z Knurowa. Przy odbiorze z innej miejscowości doliczamy dopłatę strefową. Cenę każdego kursu potwierdzamy przed wyjazdem.</p></div></div></section>'
        f'<section><div class="wrap"><h2>Dopłata za miejsce odbioru</h2><ul>{zones_txt}</ul>'
        f'<h2 style="margin-top:1.2em">Kursy lokalne z Knurowa</h2><div class="table-wrap"><table class="price-table"><thead><tr><th>Do</th><th>Cena od</th></tr></thead><tbody>{local}</tbody></table></div>'
        f'{tables}<p class="small muted" style="margin-top:16px">Płatność: {", ".join(B["payments"])}. Kursy niewymienione wyceniamy telefonicznie.</p>'
        f'<p><a class="btn btn-ink" href="/rezerwacja/">Sprawdź cenę w kalkulatorze</a></p></div></section>')
page("/cennik/", f"Cennik taxi Knurów – lotniska, sanatoria, kliniki | {B['name']}",
     f"Pełny cennik {B['name']}: kursy lokalne od {VILLAGES[0][4]} zł, Pyrzowice od {DEST['lotnisko-pyrzowice']['price']} zł, Balice od {DEST['lotnisko-balice']['price']} zł, sanatoria, kliniki i dworce.",
     body, [org(), crumbs_ld([("Strona główna", "/"), ("Cennik", "/cennik/")])])

# ================= REZERWACJA =================
body = hero("Zamów taxi", "Kurs teraz albo rezerwacja na wybrany dzień. Zgłoszenie trafia od razu do kierowcy, a status śledzisz na żywo na tej stronie.", book(),
            crumbs_html([("Strona główna", "/"), ("Rezerwacja", "/rezerwacja/")]))
body += f'<section><div class="wrap"><h2>Jak to działa</h2>{STEPS}</div></section>'
page("/rezerwacja/", f"Zamów taxi Knurów online – teraz lub na później | {B['name']}",
     "Zamów taxi z Knurowa i okolic online: Twoja lokalizacja, cena i czas przejazdu od razu, potwierdzenie kierowcy i status kursu na żywo.", body, [org()])

# ================= DLA FIRM =================
firm_faq = [("Czy wystawiacie faktury?", "Tak, za każdy kurs lub zbiorczo na koniec miesiąca."),
            ("Jak wygląda rozliczenie miesięczne?", "Stały klient firmowy zamawia kursy telefonicznie lub przez WhatsApp, a na koniec miesiąca dostaje jedną fakturę z zestawieniem kursów."),
            ("Czy wozicie gości i kontrahentów z lotniska?", "Tak. Podaj numer lotu i nazwisko gościa – kierowca czeka w hali przylotów.")]
body = (f'<section class="hero" style="padding:0"><div class="wrap" style="grid-template-columns:1fr"><div>{crumbs_html([("Strona główna","/"),("Dla firm","/dla-firm/")])}'
        f'<h1>Taxi dla firm z Knurowa i okolic</h1><p class="lead">Delegacje, transfery gości z lotnisk i dojazdy pracowników. Faktura, przelew i jedno rozliczenie na koniec miesiąca.</p>'
        f'<p><a class="btn btn-ink" href="tel:{B["phone_e164"]}">{ICON["phone"]} Zadzwoń: {B["phone"]}</a></p></div></div></section>'
        '<section><div class="wrap cols"><div class="panel"><h3>Faktura i przelew</h3><p>Za każdy kurs albo zbiorczo raz w miesiącu.</p></div>'
        '<div class="panel"><h3>Transfery gości</h3><p>Odbiór kontrahentów z Pyrzowic, Balic i Okęcia z kartką z nazwiskiem.</p></div>'
        '<div class="panel"><h3>Stałe kursy</h3><p>Regularne dojazdy pracowników lub kurierskie przewozy dokumentów.</p></div></div></section>'
        + vip_block() +
        f'<section class="alt"><div class="wrap"><h2>Pytania i odpowiedzi</h2>{faq_html(firm_faq)}</div></section>')
page("/dla-firm/", f"Taxi dla firm Knurów – faktura, przelew, transfery gości | {B['name']}",
     "Taxi dla firm z Knurowa i okolic: delegacje, transfery gości z lotnisk, faktura i rozliczenie miesięczne przelewem.", body, [org(), faq_ld(firm_faq)])

# ================= KONTAKT =================
body = (f'<section class="hero" style="padding:0"><div class="wrap"><div>{crumbs_html([("Strona główna","/"),("Kontakt","/kontakt/")])}'
        f'<h1>Kontakt</h1><p class="lead"><a href="tel:{B["phone_e164"]}" style="font-family:var(--font-display);font-weight:800;font-size:2.2rem;text-decoration:none">{B["phone"]}</a></p>'
        f'<p>{B["name"]}<br>{B["street"]}, {B["postal"]} {B["city"]}</p><p>Kursy przyjmujemy całodobowo: telefonicznie, przez WhatsApp lub SMS.</p>'
        f'<p><a class="btn btn-ink" href="{B["google_maps"]}" target="_blank" rel="noopener">Pokaż w Mapach Google</a></p></div>{book()}</div></section>')
page("/kontakt/", f"Kontakt – {B['name']}, tel. {B['phone']}", f"Zamów taxi w Knurowie: tel. {B['phone']}, WhatsApp, SMS. {B['street']}, {B['city']}.", body, [org()])

# ================= PRIVACY =================
body = ('<section><div class="wrap"><h1>Polityka prywatności</h1>'
        f'<p>Administratorem danych jest {B["name"]}, {B["street"]}, {B["postal"]} {B["city"]}.</p>'
        '<h2>Zamówienia przez formularz</h2>'
        '<p>Gdy zamawiasz kurs przez stronę, zapisujemy podane dane (adres odbioru i cel, termin, imię, telefon, liczba osób, uwagi) i wysyłamy je kierowcy '
        'w komunikatorze Telegram, żeby mógł potwierdzić kurs. Dane przetwarzamy w celu wykonania przewozu (art. 6 ust. 1 lit. b RODO). '
        'Zgłoszenia są przechowywane na serwerach Cloudflare i automatycznie usuwane po 30 dniach; dane potrzebne do rozliczenia przechowujemy przez czas wymagany przepisami podatkowymi (art. 6 ust. 1 lit. c RODO).</p>'
        '<p>Twoja przeglądarka zapamiętuje numer Twojego ostatniego kursu, żeby można było wrócić do strony statusu. Nie używamy plików cookies, reklam ani narzędzi analitycznych.</p>'
        '<h2>Mapa, adresy i lokalizacja</h2>'
        '<p>Mapa, podpowiedzi adresów i wyliczanie trasy działają dzięki usłudze Google Maps (Google Ireland Ltd.). Gdy korzystasz z formularza, '
        'Twoja przeglądarka łączy się z serwerami Google i przekazuje wpisywany adres. Zasady Google: <a href="https://policies.google.com/privacy" rel="noopener">policies.google.com/privacy</a>. '
        'Twoją lokalizację GPS odczytujemy tylko po kliknięciu „Tu jestem” i tylko po Twojej zgodzie w przeglądarce.</p>'
        '<p>Opinie wyświetlane na stronie pochodzą z wizytówki Google firmy.</p>'
        '<h2>Twoje prawa</h2>'
        '<p>Przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania oraz skargi do Prezesa UODO.</p>'
        f'<p>Kontakt w sprawie danych: tel. {B["phone"]}.</p></div></section>')
page("/polityka-prywatnosci/", f"Polityka prywatności – {B['name']}", "Polityka prywatności strony: zamówienia online, Google Maps, brak cookies i śledzenia.", body)

# ================= ENGLISH =================
air = by_kind("airport")
rows = "".join(f'<tr><td>{d["name"].replace("Lotnisko ", "").replace("Warszawa", "Warsaw")} ({d["code"]})</td><td>from {d["price"]} PLN</td></tr>' for d in air)
en_meter = book(lang="en", title="Book your ride")
body = (f'<section class="hero" style="padding:0"><div class="wrap"><div><h1>Airport taxi from Knurów and Gierałtowice</h1>'
        f'<p class="lead">Fixed prices to Katowice, Kraków, Wrocław, Ostrava and Warsaw airports. Door-to-door pickup 24/7, cars for up to {B["seats"]} people.</p>'
        f'<p>Call or WhatsApp: <a href="tel:{B["phone_e164"]}"><strong>{B["phone"]}</strong></a></p></div>{en_meter}</div></section>'
        f'<section><div class="wrap"><h2>Airport prices from Knurów</h2><div class="table-wrap"><table class="price-table"><tbody>{rows}</tbody></table></div>'
        '<p class="small muted" style="margin-top:12px">Pickup outside Knurów adds 10–20 PLN. We confirm the final price when you book. Pay by cash, card or BLIK.</p></div></section>')
page("/en/", f"Airport taxi Knurów – Katowice from {air[0]['price']} PLN | {B['name']}",
     f"Airport transfers from Knurów and Gierałtowice: Katowice (KTW) from {air[0]['price']} PLN, Kraków (KRK) from {air[1]['price']} PLN. Fixed price, 24/7, book on WhatsApp.",
     body, [org()], lang="en")

# ================= 404 =================
body = ('<section><div class="wrap"><h1>Nie ma takiej strony</h1><p>Adres mógł się zmienić. Zamów kurs online albo zadzwoń.</p>'
        f'<p><a class="btn btn-ink" href="/rezerwacja/">Zamów taxi</a> <a class="btn btn-line" href="tel:{B["phone_e164"]}">Zadzwoń: {B["phone"]}</a></p></div></section>')
page("/404.html", f"Nie znaleziono strony | {B['name']}", "Strona nie istnieje.", body)

# ================= STATUS KURSU =================
body = ('<section class="hero track-hero" style="padding:0"><div class="wrap track" id="track">'
        '<div class="track-card" aria-live="polite">'
        '<div class="track-visual" id="t-visual" data-state="loading" aria-hidden="true">'
        '<span class="radar"></span><span class="radar r2"></span><span class="busy-ring"></span><span class="busy-sign">ZAJĘTY</span>'
        '<img src="/assets/img/logo-emblem.webp" alt="" width="240" height="188"></div>'
        '<p class="track-kicker" id="t-kicker">Twój kurs</p>'
        '<h1 id="t-title">Ładuję status…</h1>'
        '<p class="lead" id="t-sub"></p>'
        '<div class="eta" id="t-eta" hidden><b id="t-eta-min">–</b><span><small id="t-eta-lbl">min</small><small id="t-eta-at"></small></span></div>'
        '<div class="eta-road" id="t-progress" hidden><span class="er-fill"></span><span class="er-car">' + CAR + '</span><span class="er-pin"></span></div>'
        '<p class="eta-note" id="t-car" hidden></p>'
        '<ol class="tl" id="t-steps"></ol>'
        f'<div class="track-actions"><a class="btn btn-call" href="tel:{B["phone_e164"]}">{ICON["phone"]} Zadzwoń do kierowcy</a>'
        '<button type="button" class="btn btn-line" id="t-cancel" hidden>Anuluj kurs</button>'
        '<a class="btn btn-ink" id="t-later" href="/rezerwacja/#again" hidden>Zarezerwuj na później</a>'
        '<a class="btn btn-line" id="t-new" href="/rezerwacja/" hidden>Zamów nowy kurs</a></div>'
        '</div>'
        '<div class="track-side"><div class="map map-lg" id="t-map" hidden></div><dl class="t-details" id="t-details"></dl></div>'
        '</div></section>')
page("/przejazd/", f"Status kursu | {B['name']}", "Status Twojego kursu na żywo.", body, noindex=True)

# ================= static files =================
write_server_config()
shutil.copytree(os.path.join(HERE, "assets"), os.path.join(OUT, "assets"), dirs_exist_ok=True)
urls = [p for p in pages if not p.endswith(".html") and p not in NOINDEX]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
    f"  <url><loc>{SITE_URL}{u}</loc><lastmod>{TODAY}</lastmod></url>\n" for u in urls) + "</urlset>\n"
open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8").write(sm)
open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8").write(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")
open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps({
    "id": "/", "name": B["name"], "short_name": "Taxi Knurów", "description": "Zamów taxi w Knurowie – teraz albo na później, status kursu na żywo.",
    "start_url": "/rezerwacja/?app=1", "scope": "/", "display": "standalone", "orientation": "portrait",
    "background_color": "#0A1430", "theme_color": "#0A1430", "lang": "pl",
    "icons": [{"src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}],
    "shortcuts": [{"name": "Zadzwoń", "url": "tel:" + B["phone_e164"]}, {"name": "Lotniska", "url": "/lotniska/"}]}, ensure_ascii=False, indent=1))
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(
    "const C='taxi-v6';const CORE=['/','/rezerwacja/','/cennik/','/assets/favicon.png','/assets/img/logo-emblem.webp','/assets/fonts/archivo-latin-wdth-normal.woff2'];\n"
    "self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));\n"
    "self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));\n"
    "self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;\n"
    " e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))));});\n")
# Netlify / Cloudflare Pages: 404 + stare adresy z taxifest.pl (uzupełnij, jeśli domena będzie przekierowana)
open(os.path.join(OUT, "_redirects"), "w", encoding="utf-8").write("/cennik-transfery-na-lotniska  /lotniska/  301\n/kontakt.html  /kontakt/  301\n")
print(f"OK: {len(pages)} stron -> {os.path.abspath(OUT)}")
