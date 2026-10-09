# -*- coding: utf-8 -*-
"""Generator strony: python3 build.py  ->  ../dist/"""
import json, os, shutil, datetime
from jinja2 import Environment, DictLoader
from data import SITE_URL, BUSINESS as B, ZONES, VILLAGES, DESTINATIONS, KIND

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "dist")
TODAY = datetime.date.today().isoformat()

ICON = {
 "phone": '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
 "wa": '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.1z"/></svg>',
 "cal": '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 7h14v10H5z"/></svg>',
 "star": '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z"/></svg>',
 "check": '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m9 16.2-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z"/></svg>',
}
MARK = ('<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="9" width="24" height="9" rx="2" fill="#1C2430"/>'
        '<text x="13" y="16.4" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7" fill="#FFC72C">TAXI</text>'
        '<rect x="5" y="4" width="4" height="4" fill="#1C2430"/><rect x="13" y="4" width="4" height="4" fill="#1C2430"/>'
        '<rect x="9" y="19" width="4" height="4" fill="#1C2430"/><rect x="17" y="19" width="4" height="4" fill="#1C2430"/></svg>')
# Taxi z boku (animacje: droga w hero i taksometr)
CAR = ('<svg width="64" height="28" viewBox="0 0 64 28" aria-hidden="true"><rect x="25" y="1" width="13" height="5" rx="1.5" fill="#FFC72C" stroke="#1C2430" stroke-width=".8"/>'
       '<path d="M6 18 12 10Q14 8 18 8H42Q46 8 49 11L54 16Q60 17 61 20V23H3V20Q3 18 6 18Z" fill="#FFC72C"/>'
       '<path d="M16 11H30V17H11ZM33 11H43Q45 11 47 13L50 17H33Z" fill="#9FC3E0"/><rect x="3" y="19" width="58" height="1.4" fill="#1C2430" opacity=".35"/>'
       '<circle cx="16" cy="22.5" r="4.5" fill="#1C2430"/><circle cx="16" cy="22.5" r="1.8" fill="#C9D0DA"/>'
       '<circle cx="48" cy="22.5" r="4.5" fill="#1C2430"/><circle cx="48" cy="22.5" r="1.8" fill="#C9D0DA"/><rect x="58" y="17.5" width="3.5" height="2.2" rx="1" fill="#FFF7D6"/></svg>')

DEST = {d["slug"]: d for d in DESTINATIONS}
def by_kind(k): return [d for d in DESTINATIONS if d["kind"] == k]
ZONE_VILL = {z: [v[1] for v in VILLAGES if v[3] == z] for z in ZONES}

def places_json():
    P = []
    for slug, name, loc, zone, price in VILLAGES:
        P.append(dict(id="v:" + slug, type="v", label=name, group="Rejon odbioru", price=price, surcharge=ZONES[zone]["surcharge"]))
    for d in DESTINATIONS:
        P.append(dict(id="d:" + d["slug"], type="d", label=d["short"] if d["kind"] != "clinic" else "Kliniki – " + d["name"],
                      group=KIND[d["kind"]]["plural"], price=d["price"]))
    return json.dumps(dict(places=P, wa=B["whatsapp"], tel=B["phone_e164"]), ensure_ascii=False)

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
<meta name="theme-color" content="#FFC72C">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/icon-192.png">
<link rel="preload" href="/assets/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css">
{% for s in schema %}<script type="application/ld+json">{{ s }}</script>
{% endfor %}</head>
<body>
<a class="skip" href="#main">{{ 'Skip to content' if lang=='en' else 'Przejdź do treści' }}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/"><span class="brand-mark">{{ mark }}</span><span>{{ B.name }}<small>Knurów · Gierałtowice · okolice</small></span></a>
  <button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
  <nav class="nav" id="nav" aria-label="Menu główne">
    {% for href, label in nav %}<a href="{{ href }}"{% if href == path %} aria-current="page"{% endif %}>{{ label }}</a>{% endfor %}
    <a class="call-top" href="tel:{{ B.phone_e164 }}">{{ icon.phone }} {{ B.phone }}</a>
  </nav>
</div></header>
<main id="main">
{{ body }}
</main>
<footer><div class="wrap">
  <div class="cols">
    <div><h3>{{ B.name }}</h3><p>{{ B.street }}<br>{{ B.postal }} {{ B.city }}</p>
      <p><a href="tel:{{ B.phone_e164 }}"><strong>{{ B.phone }}</strong></a><br><a href="https://wa.me/{{ B.whatsapp }}">WhatsApp</a></p></div>
    <div><h3>Trasy</h3><ul>{% for k in kinds %}<li><a href="/{{ k.hub }}/">{{ k.hub_name }}</a></li>{% endfor %}<li><a href="/cennik/">Cennik</a></li></ul></div>
    <div><h3>Rejon odbioru</h3><ul>{% for v in villages[1:8] %}<li><a href="/taxi-{{ v[0] }}/">Taxi {{ v[1] }}</a></li>{% endfor %}<li><a href="/#rejon">Wszystkie miejscowości</a></li></ul></div>
    <div><h3>Informacje</h3><ul><li><a href="/dla-firm/">Dla firm</a></li><li><a href="/kontakt/">Kontakt</a></li><li><a href="/en/">English</a></li><li><a href="/polityka-prywatnosci/">Polityka prywatności</a></li></ul></div>
  </div>
  <div class="foot-bottom"><span>© {{ year }} {{ B.name }}. Strona nie używa plików cookies ani śledzenia.</span><button class="theme-toggle" type="button">Jasny / ciemny motyw</button></div>
</div></footer>
<nav class="actionbar" aria-label="Szybki kontakt">
  <a class="a-call" href="tel:{{ B.phone_e164 }}">{{ icon.phone }}{{ 'Call' if lang=='en' else 'Zadzwoń' }}</a>
  <a class="a-wa" href="https://wa.me/{{ B.whatsapp }}">{{ icon.wa }}WhatsApp</a>
  <a class="a-book" href="{{ '/en/#booking' if lang=='en' else '/rezerwacja/' }}">{{ icon.cal }}{{ 'Book' if lang=='en' else 'Rezerwuj' }}</a>
</nav>
<script>window.TAXI={{ places|safe }};</script>
<script src="/assets/app.js" defer></script>
</body></html>"""

METER = r"""<form class="meter" id="booking" data-from="{{ m_from or 'v:knurow' }}" data-to="{{ m_to or 'd:lotnisko-pyrzowice' }}" onsubmit="return false" novalidate>
  <div class="meter-head">
    <span class="roof-sign" aria-hidden="true">TAXI</span>
    <div><h2>{{ m_title or 'Sprawdź cenę i zarezerwuj' }}</h2><p class="meter-sub"><span class="live" aria-hidden="true"></span>Całodobowo · 7 dni w tygodniu</p></div>
  </div>
  <div class="route">
    <div class="field f-from"><label for="from">Skąd</label><select id="from" name="from"></select></div>
    <button type="button" id="swap" class="swap-btn" aria-label="Zamień kierunek" title="Zamień kierunek"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3 3 7h3v9h2V7h3zm10 18 4-4h-3V8h-2v9h-3z"/></svg></button>
    <div class="field f-to"><label for="to">Dokąd</label><select id="to" name="to"></select></div>
  </div>
  <div class="row2">
    <div class="field"><label for="date">Data</label><input type="date" id="date" name="date" required></div>
    <div class="field"><label for="time">Godzina odbioru</label><input type="time" id="time" name="time" required></div>
  </div>
  <div class="row2">
    <div class="field"><label for="pax">Liczba osób</label><select id="pax">{% for i in range(1,8) %}<option>{{ i }}</option>{% endfor %}</select></div>
    <div class="field"><label for="lug">Bagaż</label><select id="lug"><option value="">bez dużego bagażu</option><option>1–2 walizki</option><option>3–4 walizki</option><option>więcej niż 4</option></select></div>
  </div>
  <label class="chk"><input type="checkbox" id="round"> Kurs powrotny</label>
  <div class="field" id="back-wrap" hidden><label for="back">Data i godzina powrotu</label><input type="text" id="back" placeholder="np. 24.10, przylot 21:40"></div>
  <div class="readout">
    <div class="readout-row" aria-live="polite"><span class="lbl">Cena od</span><span class="val" id="price">–</span></div>
    <div class="meter-road" aria-hidden="true"><span class="car">{{ car }}</span></div>
  </div>
  <p class="readout-note" id="price-note"></p>
  <details class="more"><summary>Dodaj szczegóły (adres, lot, uwagi)</summary>
    <div class="field"><label for="addr">Adres odbioru</label><input id="addr" autocomplete="street-address"></div>
    <div class="field"><label for="flight">Numer lotu / pociągu</label><input id="flight" placeholder="np. FR 1234"></div>
    <div class="row2"><div class="field"><label for="name">Imię</label><input id="name" autocomplete="given-name"></div>
    <div class="field"><label for="tel">Telefon</label><input id="tel" type="tel" autocomplete="tel"></div></div>
    <div class="field"><label for="notes">Uwagi</label><textarea id="notes" placeholder="np. fotelik dla dziecka, pomoc z bagażem, pasażer: mama, tel. ..."></textarea></div>
  </details>
  <p class="form-error" id="form-error" role="alert"></p>
  <p class="readout-note" style="margin:0 0 4px">Wyślij rezerwację:</p>
  <div class="btns">
    <a class="btn btn-wa" id="send-wa" href="https://wa.me/{{ B.whatsapp }}" target="_blank" rel="noopener">{{ icon.wa }} WhatsApp</a>
    <a class="btn btn-sms" id="send-sms" href="sms:{{ B.phone_e164 }}">SMS</a>
    <a class="btn btn-call" href="tel:{{ B.phone_e164 }}">{{ icon.phone }} Zadzwoń: {{ B.phone }}</a>
  </div>
</form>"""

env = Environment(loader=DictLoader({"base": BASE, "meter": METER}), autoescape=False)
NAV = [("/lotniska/", "Lotniska"), ("/sanatoria/", "Sanatoria"), ("/kliniki/", "Kliniki"), ("/dworce/", "Dworce"),
       ("/cennik/", "Cennik"), ("/dla-firm/", "Dla firm"), ("/kontakt/", "Kontakt")]
PLACES = places_json()

def meter(**kw):
    return env.get_template("meter").render(B=B, icon=ICON, car=CAR, **kw)

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
def page(path, title, desc, body, schema=(), lang="pl"):
    pages.append(path)
    html = env.get_template("base").render(
        lang=lang, title=title, desc=desc, path=path, site=SITE_URL, body=body, schema=[ld(s) for s in schema],
        B=B, icon=ICON, mark=MARK, nav=NAV, kinds=[KIND[k] for k in KIND], villages=VILLAGES, year=datetime.date.today().year,
        places=PLACES)
    target = os.path.join(OUT, path.strip("/"), "index.html") if path.endswith("/") else os.path.join(OUT, path.strip("/"))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    open(target, "w", encoding="utf-8").write(html)

def hero(h1, lead, meter_html, crumbs=None, facts=True):
    f = ""
    if facts:
        f = (f'<ul class="hero-facts"><li class="status">Całodobowo, 7 dni w tygodniu</li>'
             f'<li>{ICON["star"]}<span class="stars">{B["rating"]}</span>&nbsp;z {B["reviews"]} opinii w Google</li>'
             f'<li>{ICON["check"]} Auta do {B["seats"]} osób</li><li>{ICON["check"]} Karta, BLIK, przelew</li></ul>')
    return (f'<section class="hero" style="padding:0"><div class="wrap"><div>{crumbs or ""}<h1>{h1}</h1>'
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

STEPS = ('<ol class="steps"><li><h3>Wybierz trasę</h3><p>Kalkulator od razu pokazuje cenę od – bez taksometru i niespodzianek.</p></li>'
         '<li><h3>Wyślij rezerwację</h3><p>Jednym kliknięciem przez WhatsApp lub SMS. Wszystkie szczegóły są już w wiadomości.</p></li>'
         '<li><h3>Dostajesz potwierdzenie</h3><p>Adam potwierdza godzinę i cenę. W dniu kursu auto czeka pod drzwiami.</p></li></ol>')

def village_links():
    return '<ul class="villages">' + "".join(
        f'<li><a href="{"/" if s == "knurow" else "/taxi-" + s + "/"}">{n}</a></li>' for s, n, *_ in VILLAGES) + "</ul>"

def reviews_block():
    return (f'<section class="alt"><div class="wrap rating"><div class="big">{B["rating"]}</div><div><h2 style="margin-bottom:.2em">Ocena klientów w Google</h2>'
            f'<p>{B["reviews"]} opinii o {B["name"]}. Przeczytaj je i dodaj swoją po kursie.</p>'
            f'<a class="btn btn-ink" href="{B["google_maps"]}" target="_blank" rel="noopener">Zobacz opinie w Google</a></div></div></section>')

# ================= HOME =================
home_faq = [
    ("Ile kosztuje taxi z Knurowa na lotnisko w Pyrzowicach?", f"Od {DEST['lotnisko-pyrzowice']['price']} zł z Knurowa. Ceny dla wszystkich lotnisk znajdziesz w cenniku i w kalkulatorze."),
    ("Czy jeździcie w nocy i w święta?", "Tak, przyjmujemy kursy całodobowo, 7 dni w tygodniu. Kursy na lotniska i dworce najlepiej rezerwować z wyprzedzeniem."),
    ("Jak zapłacić za kurs?", "Gotówką, kartą, BLIK-iem, a firmy także przelewem na fakturę."),
    ("Ile osób zmieści się w aucie?", f"Do {B['seats']} osób. Przy 5–7 pasażerach podstawimy auto 7-osobowe – zaznacz liczbę osób w rezerwacji."),
    ("Czy mogę zamówić kurs dla rodzica?", "Tak. W uwagach wpisz imię i telefon pasażera. Przed wyjazdem potwierdzimy z nim godzinę odbioru."),
]
body = hero("Taxi Knurów Adam Mączka: lotniska, sanatoria i kliniki ze stałą ceną",
            f"Pyrzowice od {DEST['lotnisko-pyrzowice']['price']} zł, Balice od {DEST['lotnisko-balice']['price']} zł. Sprawdź cenę swojej trasy i zarezerwuj w 30 sekund – przez WhatsApp, SMS albo telefon.",
            meter())
body += services_block()
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
    body = hero(c["h1"], c["intro"], meter(m_to="d:" + d["slug"], m_title=f"Cena: {d['short']}"), crumbs_html(cr))
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
    body = hero(k["hub_name"] + " z Knurowa", hub_lead[kk], meter(m_to="d:" + first["slug"]), crumbs_html(cr))
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
                meter(m_from="v:" + slug), crumbs_html(cr))
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
body = hero("Rezerwacja kursu", "Wybierz trasę, termin i liczbę osób. Przycisk WhatsApp lub SMS tworzy gotową wiadomość ze wszystkimi szczegółami.", meter(m_title="Twój kurs"),
            crumbs_html([("Strona główna", "/"), ("Rezerwacja", "/rezerwacja/")]))
body += f'<section><div class="wrap"><h2>Jak to działa</h2>{STEPS}</div></section>'
page("/rezerwacja/", f"Rezerwacja taxi Knurów – kalkulator ceny | {B['name']}",
     "Zarezerwuj taxi z Knurowa i okolic w 30 sekund: kalkulator ceny, kurs powrotny, rezerwacja przez WhatsApp, SMS lub telefon.", body, [org()])

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
        f'<section class="alt"><div class="wrap"><h2>Pytania i odpowiedzi</h2>{faq_html(firm_faq)}</div></section>')
page("/dla-firm/", f"Taxi dla firm Knurów – faktura, przelew, transfery gości | {B['name']}",
     "Taxi dla firm z Knurowa i okolic: delegacje, transfery gości z lotnisk, faktura i rozliczenie miesięczne przelewem.", body, [org(), faq_ld(firm_faq)])

# ================= KONTAKT =================
body = (f'<section class="hero" style="padding:0"><div class="wrap"><div>{crumbs_html([("Strona główna","/"),("Kontakt","/kontakt/")])}'
        f'<h1>Kontakt</h1><p class="lead"><a href="tel:{B["phone_e164"]}" style="font-family:var(--font-display);font-weight:800;font-size:2.2rem;text-decoration:none">{B["phone"]}</a></p>'
        f'<p>{B["name"]}<br>{B["street"]}, {B["postal"]} {B["city"]}</p><p>Kursy przyjmujemy całodobowo: telefonicznie, przez WhatsApp lub SMS.</p>'
        f'<p><a class="btn btn-ink" href="{B["google_maps"]}" target="_blank" rel="noopener">Pokaż w Mapach Google</a></p></div>{meter()}</div></section>')
page("/kontakt/", f"Kontakt – {B['name']}, tel. {B['phone']}", f"Zamów taxi w Knurowie: tel. {B['phone']}, WhatsApp, SMS. {B['street']}, {B['city']}.", body, [org()])

# ================= PRIVACY =================
body = ('<section><div class="wrap"><h1>Polityka prywatności</h1>'
        f'<p>Administratorem danych jest {B["name"]}, {B["street"]}, {B["postal"]} {B["city"]}.</p>'
        '<p>Strona nie zbiera danych, nie używa plików cookies ani narzędzi analitycznych i nie przechowuje formularzy. Kalkulator działa wyłącznie w Twojej przeglądarce. '
        'Gdy klikasz „Rezerwuj przez WhatsApp” lub „Wyślij SMS”, Twoja aplikacja tworzy wiadomość, którą sam wysyłasz do przewoźnika.</p>'
        '<p>Dane z rezerwacji (imię, telefon, adres, termin) przetwarzamy wyłącznie w celu wykonania kursu i rozliczenia go (art. 6 ust. 1 lit. b i c RODO), przez czas wymagany przepisami podatkowymi. '
        'Przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania oraz skargi do Prezesa UODO.</p>'
        '<p>Czcionki są hostowane na tym samym serwerze co strona – nie łączymy się z Google ani innymi zewnętrznymi serwisami.</p>'
        f'<p>Kontakt w sprawie danych: tel. {B["phone"]}.</p></div></section>')
page("/polityka-prywatnosci/", f"Polityka prywatności – {B['name']}", "Polityka prywatności strony: brak cookies i śledzenia, zasady przetwarzania danych z rezerwacji.", body)

# ================= ENGLISH =================
air = by_kind("airport")
rows = "".join(f'<tr><td>{d["name"].replace("Lotnisko ", "").replace("Warszawa", "Warsaw")} ({d["code"]})</td><td>from {d["price"]} PLN</td></tr>' for d in air)
en_meter = (meter(m_title="Price and booking").replace(">Skąd<", ">From<").replace(">Dokąd<", ">To<").replace(">Data<", ">Date<")
            .replace(">Godzina odbioru<", ">Pickup time<").replace(">Liczba osób<", ">Passengers<").replace(">Bagaż<", ">Luggage<")
            .replace("Kurs powrotny", "Return trip").replace("Całodobowo · 7 dni w tygodniu", "Open 24/7, every day").replace("Cena od", "From").replace("Wyślij rezerwację:", "Send booking:")
            .replace("Wyślij SMS", "Send SMS").replace("Zadzwoń:", "Call:").replace("Zamień kierunek", "Swap").replace("Dodaj szczegóły (adres, lot, uwagi)", "Add details (address, flight, notes)")
            .replace(">Adres odbioru<", ">Pickup address<").replace(">Numer lotu / pociągu<", ">Flight / train number<").replace(">Imię<", ">Name<")
            .replace(">Telefon<", ">Phone<").replace(">Uwagi<", ">Notes<").replace(">Data i godzina powrotu<", ">Return date and time<"))
body = (f'<section class="hero" style="padding:0"><div class="wrap"><div><h1>Airport taxi from Knurów and Gierałtowice</h1>'
        f'<p class="lead">Fixed prices to Katowice, Kraków, Wrocław, Ostrava and Warsaw airports. Door-to-door pickup 24/7, cars for up to {B["seats"]} people.</p>'
        f'<p>Call or WhatsApp: <a href="tel:{B["phone_e164"]}"><strong>{B["phone"]}</strong></a></p></div>{en_meter}</div></section>'
        f'<section><div class="wrap"><h2>Airport prices from Knurów</h2><div class="table-wrap"><table class="price-table"><tbody>{rows}</tbody></table></div>'
        '<p class="small muted" style="margin-top:12px">Pickup outside Knurów adds 10–20 PLN. We confirm the final price when you book. Pay by cash, card or BLIK.</p></div></section>')
page("/en/", f"Airport taxi Knurów – Katowice from {air[0]['price']} PLN | {B['name']}",
     f"Airport transfers from Knurów and Gierałtowice: Katowice (KTW) from {air[0]['price']} PLN, Kraków (KRK) from {air[1]['price']} PLN. Fixed price, 24/7, book on WhatsApp.",
     body, [org()], lang="en")

# ================= 404 =================
body = ('<section><div class="wrap"><h1>Nie ma takiej strony</h1><p>Adres mógł się zmienić. Sprawdź cenę kursu w kalkulatorze albo zadzwoń.</p>'
        f'<p><a class="btn btn-ink" href="/rezerwacja/">Sprawdź cenę</a> <a class="btn btn-line" href="tel:{B["phone_e164"]}">Zadzwoń: {B["phone"]}</a></p></div></section>')
page("/404.html", f"Nie znaleziono strony | {B['name']}", "Strona nie istnieje.", body)

# ================= static files =================
shutil.copytree(os.path.join(HERE, "assets"), os.path.join(OUT, "assets"), dirs_exist_ok=True)
urls = [p for p in pages if not p.endswith(".html")]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
    f"  <url><loc>{SITE_URL}{u}</loc><lastmod>{TODAY}</lastmod></url>\n" for u in urls) + "</urlset>\n"
open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8").write(sm)
open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8").write(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")
open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps({
    "name": B["name"], "short_name": B["short"], "start_url": "/rezerwacja/", "display": "standalone",
    "background_color": "#FFC72C", "theme_color": "#FFC72C", "lang": "pl",
    "icons": [{"src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}],
    "shortcuts": [{"name": "Zadzwoń", "url": "tel:" + B["phone_e164"]}, {"name": "Lotniska", "url": "/lotniska/"}]}, ensure_ascii=False, indent=1))
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(
    "const C='taxi-v2';const CORE=['/','/rezerwacja/','/cennik/','/assets/style.css','/assets/app.js','/assets/icon.svg','/assets/fonts/archivo-latin-wdth-normal.woff2'];\n"
    "self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));\n"
    "self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));\n"
    "self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;\n"
    " e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))));});\n")
# Netlify / Cloudflare Pages: 404 + stare adresy z taxifest.pl (uzupełnij, jeśli domena będzie przekierowana)
open(os.path.join(OUT, "_redirects"), "w", encoding="utf-8").write("/cennik-transfery-na-lotniska  /lotniska/  301\n/kontakt.html  /kontakt/  301\n")
print(f"OK: {len(pages)} stron -> {os.path.abspath(OUT)}")
