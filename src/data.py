# -*- coding: utf-8 -*-
"""
Jedno miejsce na wszystkie dane strony – WERSJA DEMO szablonu („Taxi Przykład”, fikcyjne miasto Przykładowo).
Dla nowego klienta zmieniasz TYLKO ten plik (+ src/prices.json, src/fleet.py, logo) – instrukcja: docs/NEW-CLIENT.md.
Potem: py src/build.py

CENY: są w src/prices.json (zmienia je też panel /panel/). Tutaj nazwy, opisy i współrzędne.
"""

SITE_URL = "https://taxi-przyklad.pages.dev"   # docelowa domena klienta
BUSINESS = {
    "name": "Taxi Przykład",
    "short": "Taxi Przykład",
    "phone": "503 467 198",
    "phone_e164": "+48503467198",
    "whatsapp": "48503467198",
    "street": "ul. Przykładowa 1",
    "postal": "00-000",
    "city": "Przykładowo",
    "lat": 50.2218, "lng": 18.7142,
    "email": "kontakt@example.com",
    "facebook": "",                        # pusty = bez linku do Facebooka
    "aka": "",
    # punkty obsługi i numery. Pierwszy = główny.
    "locations": [
        {"name": "Taxi Przykład", "street": "ul. Przykładowa 1", "postal": "00-000", "city": "Przykładowo",
         "phone": "503 467 198", "phone_e164": "+48503467198"},
    ],
    "extra_phones": [],   # dodatkowe numery bez adresu: ("Nazwa", "600 000 000", "+48600000000")
    "google_maps": "https://www.google.com/maps/search/?api=1&query=Taxi+Przyk%C5%82ad",
    "google_review": "https://www.google.com/maps/search/?api=1&query=Taxi+Przyk%C5%82ad",
    "rating": "5,0",      # ocena z wizytówek Google – pokazywana tylko, gdy "reviews" > 0
    "reviews": 0,
    "seats": 7,
    "payments": ["Gotówka", "Karta", "BLIK", "Przelew dla firm (faktura)"],
}

# Strefy odbioru: dopłata do ceny trasy, gdy kurs zaczyna się poza miastem bazowym (kwoty w src/prices.json)
ZONES = {
    "0":  {"label": "Przykładowo i Nowa Wieś", "surcharge": 0},
    "A":  {"label": "strefa A", "surcharge": 10},
    "B":  {"label": "strefa B", "surcharge": 20},
}

# Rejon przyjmowania zleceń. Pierwsza pozycja = miasto bazowe (strona główna). Ceny w src/prices.json.
VILLAGES = [
    # slug, nazwa, miejscownik ("w ..."), strefa odbioru, cena kursu lokalnego
    ("przykladowo",  "Przykładowo",  "w Przykładowie",   "0", 15),
    ("nowa-wies",    "Nowa Wieś",    "w Nowej Wsi",      "0", 20),
    ("dolna",        "Dolna",        "w Dolnej",         "A", 30),
    ("gorna",        "Górna",        "w Górnej",         "A", 30),
    ("zielona",      "Zielona",      "w Zielonej",       "A", 35),
    ("lesna",        "Leśna",        "w Leśnej",         "B", 40),
    ("stawy",        "Stawy",        "w Stawach",        "B", 45),
    ("polana",       "Polana",       "w Polanie",        "B", 45),
]

# Trasy dalekie. kind: airport | spa | clinic | station | city
# Ceny lotnisk i sanatoriów: stałe ceny od właściciela, na stronie jako "od".
DESTINATIONS = [
    # --- Lotniska ---
    dict(slug="lotnisko-pyrzowice", kind="airport", name="Lotnisko Katowice-Pyrzowice", short="Pyrzowice", code="KTW",
         price=170, confirmed=True, region="woj. śląskie"),
    dict(slug="lotnisko-balice", kind="airport", name="Lotnisko Kraków-Balice", short="Balice", code="KRK",
         price=340, confirmed=True, region="woj. małopolskie"),
    dict(slug="lotnisko-wroclaw", kind="airport", name="Lotnisko Wrocław", short="Wrocław", code="WRO",
         price=460, confirmed=True, region="woj. dolnośląskie"),
    dict(slug="lotnisko-ostrava", kind="airport", name="Lotnisko Ostrava", short="Ostrava", code="OSR",
         price=260, confirmed=True, region="Czechy"),
    dict(slug="lotnisko-okecie", kind="airport", name="Lotnisko Warszawa-Okęcie (Chopina)", short="Okęcie", code="WAW",
         price=850, confirmed=True, region="woj. mazowieckie"),
    dict(slug="lotnisko-modlin", kind="airport", name="Lotnisko Warszawa-Modlin", short="Modlin", code="WMI",
         price=900, confirmed=True, region="woj. mazowieckie"),
    # --- Sanatoria ---
    dict(slug="sanatorium-busko-zdroj", gen="Buska-Zdroju", loc="w Busku-Zdroju", kind="spa", name="Busko-Zdrój", short="Busko-Zdrój",
         price=600, confirmed=True, region="woj. świętokrzyskie"),
    dict(slug="sanatorium-szczyrk", gen="Szczyrku", loc="w Szczyrku", kind="spa", name="Szczyrk", short="Szczyrk",
         price=280, confirmed=True, region="Beskid Śląski"),
    dict(slug="sanatorium-ustron", gen="Ustronia", loc="w Ustroniu", kind="spa", name="Ustroń", short="Ustroń",
         price=260, confirmed=True, region="Beskid Śląski"),
    dict(slug="sanatorium-goczalkowice-zdroj", gen="Goczałkowic-Zdroju", loc="w Goczałkowicach-Zdroju", kind="spa", name="Goczałkowice-Zdrój", short="Goczałkowice",
         price=180, confirmed=False, region="powiat pszczyński"),
    # --- Kliniki / szpitale (miasta) ---
    dict(slug="kliniki-katowice", gen="Katowic", loc="w Katowicach", kind="clinic", name="Katowice", short="Katowice", price=110, confirmed=False),
    dict(slug="kliniki-gliwice", gen="Gliwic", loc="w Gliwicach", kind="clinic", name="Gliwice", short="Gliwice", price=50, confirmed=False),
    dict(slug="kliniki-zabrze", gen="Zabrza", loc="w Zabrzu", kind="clinic", name="Zabrze", short="Zabrze", price=70, confirmed=False),
    dict(slug="kliniki-sosnowiec", gen="Sosnowca", loc="w Sosnowcu", kind="clinic", name="Sosnowiec", short="Sosnowiec", price=140, confirmed=False),
    dict(slug="kliniki-czeladz", gen="Czeladzi", loc="w Czeladzi", kind="clinic", name="Czeladź", short="Czeladź", price=140, confirmed=False),
    dict(slug="kliniki-wroclaw", gen="Wrocławia", loc="we Wrocławiu", kind="clinic", name="Wrocław", short="Wrocław (kliniki)", price=420, confirmed=False),
    # --- Dworce ---
    dict(slug="dworzec-gliwice", gen="Gliwic", loc="w Gliwicach", kind="station", name="Gliwice", short="Dworzec Gliwice", price=50, confirmed=False,
         note="PKP i dworzec autobusowy (centrum przesiadkowe)"),
    dict(slug="dworzec-zabrze", gen="Zabrza", loc="w Zabrzu", kind="station", name="Zabrze", short="Dworzec Zabrze", price=70, confirmed=False, note="PKP"),
    dict(slug="dworzec-katowice", gen="Katowic", loc="w Katowicach", kind="station", name="Katowice", short="Dworzec Katowice", price=110, confirmed=False,
         note="PKP i dworzec autobusowy"),
    dict(slug="dworzec-ostrava", gen="Ostravy", loc="w Ostravie", kind="station", name="Ostrava", short="Dworzec Ostrava", price=260, confirmed=False,
         note="Ostrava hlavní nádraží / Svinov"),
    # --- Miasta (rynek, kursy) ---
    dict(slug="taxi-gliwice", gen="Gliwic", loc="w Gliwicach", kind="city", name="Gliwice", short="Gliwice rynek", price=50, confirmed=False),
    dict(slug="taxi-katowice", gen="Katowic", loc="w Katowicach", kind="city", name="Katowice", short="Katowice rynek", price=110, confirmed=False),
    dict(slug="taxi-rybnik", gen="Rybnika", loc="w Rybniku", kind="city", name="Rybnik", short="Rybnik rynek", price=80, confirmed=False),
    dict(slug="taxi-zabrze", gen="Zabrza", loc="w Zabrzu", kind="city", name="Zabrze", short="Zabrze", price=70, confirmed=False),
    dict(slug="taxi-sosnowiec", gen="Sosnowca", loc="w Sosnowcu", kind="city", name="Sosnowiec", short="Sosnowiec", price=140, confirmed=False),
]

# Współrzędne celów (dla mapy i ceny stałej). match_km: jeśli cel klienta jest w tym promieniu,
# liczymy cenę stałą z cennika; None = zawsze wycena za kilometr (kliniki, miasta – różne adresy).
COORDS = {
    "lotnisko-pyrzowice": (50.4743, 19.0800, 3),   "lotnisko-balice": (50.0777, 19.7848, 3),
    "lotnisko-wroclaw": (51.1027, 16.8858, 3),     "lotnisko-ostrava": (49.6963, 18.1111, 3),
    "lotnisko-okecie": (52.1657, 20.9671, 3),      "lotnisko-modlin": (52.4511, 20.6518, 3),
    "sanatorium-busko-zdroj": (50.4705, 20.7186, 5), "sanatorium-szczyrk": (49.7185, 19.0335, 6),
    "sanatorium-ustron": (49.7197, 18.8120, 5),    "sanatorium-goczalkowice-zdroj": (49.9370, 18.9660, 4),
    "dworzec-gliwice": (50.3008, 18.6635, 1.2),    "dworzec-zabrze": (50.3029, 18.7780, 1.2),
    "dworzec-katowice": (50.2575, 19.0170, 1.2),   "dworzec-ostrava": (49.8546, 18.2683, 1.5),
    "kliniki-katowice": (50.2591, 19.0213, None),  "kliniki-gliwice": (50.2945, 18.6714, None),
    "kliniki-zabrze": (50.3249, 18.7857, None),    "kliniki-sosnowiec": (50.2863, 19.1041, None),
    "kliniki-czeladz": (50.3160, 19.0790, None),   "kliniki-wroclaw": (51.1079, 17.0385, None),
    "taxi-gliwice": (50.2945, 18.6714, None),      "taxi-katowice": (50.2591, 19.0213, None),
    "taxi-rybnik": (50.0971, 18.5418, None),       "taxi-zabrze": (50.3249, 18.7857, None),
    "taxi-sosnowiec": (50.2863, 19.1041, None),
}
for _d in DESTINATIONS:
    _d["lat"], _d["lng"], _d["match_km"] = COORDS[_d["slug"]]

# Strefy odbioru liczone odległością od centrum miasta bazowego (km w linii prostej).
# Do ZONE_KM["0"] = miasto bazowe, do "A" = strefa A, do "B" = strefa B, dalej = wycena za kilometr.
BASE_CENTER = (50.2197, 18.6767)
# Drugie miasto bez dopłaty (np. siedziba firmy): do tylu km od jego centrum = strefa "0"
BASE2_CENTER = (50.2241, 18.7271)
BASE2_KM = 2.5
ZONE_KM = {"0": 4.5, "A": 9, "B": 16}

# Wycena kursów spoza cennika (potwierdź z właścicielem): start + zł za km trasy, nie mniej niż minimum.
TARIFF = {"start": 9, "per_km": 3.0, "min": 15, "confirmed": False}

# ---------------- Rezerwacja online (Cloudflare + Telegram + Google) ----------------
# Klucz przeglądarkowy Google Maps (Maps JavaScript API, Places API (New), Geocoding API).
# Jest publiczny z założenia – w Google Cloud ogranicz go do domeny strony (HTTP referrers).
# Pusty = strona działa bez mapy i podpowiedzi adresów (wpisywanie ręczne + GPS).
GOOGLE_MAPS_BROWSER_KEY = ""   # TODO
GOOGLE_MAP_ID = "DEMO_MAP_ID"   # TODO: własny Map ID z Google Cloud (Map Management)
# Logowanie klientów przez Google (opcjonalne). Client ID typu "Web application" z Google Cloud
# (APIs & Services -> Credentials -> OAuth client ID). Publiczny z założenia. Pusty = brak logowania.
GOOGLE_OAUTH_CLIENT_ID = ""
# Kursy nocne: od 22:00 do 5:00 tylko z wcześniejszą rezerwacją, bez rezerwacji w nocy nie jeździmy.
# W tych godzinach nie da się zamówić kursu "teraz"; rezerwacja na noc najpóźniej ahead_min minut przed odbiorem.
NIGHT = {"from": "22:00", "to": "05:00", "ahead_min": 60}   # ahead_min: ile minut wcześniej najpóźniej rezerwacja na noc
# Wizytówki Google firmy – opinie ze wszystkich są pokazywane razem (pierwsza = główna)
GOOGLE_PLACES = []   # wizytówki Google: {"name": "…", "id": "ChIJ…"} (Place ID Finder) – opinie i linki „Oceń ★”
# Ile minut klient czeka na potwierdzenie kursu "teraz", zanim zobaczy prośbę o telefon.
NOW_WAIT_MIN = 3
# Cloudflare Turnstile („czy jesteś człowiekiem”) przy zamówieniu online. Klucz witryny jest publiczny.
# Pusty = bez Turnstile. Sekret ustaw w Cloudflare jako TURNSTILE_SECRET (bez niego serwer nic nie sprawdza).
TURNSTILE_SITE_KEY = ""

# Rozliczenie kierowców (REKOMENDACJA – do potwierdzenia z właścicielem i księgową).
# Domyślnie 50% utargu brutto dla kierowcy, 50% dla firmy (firma płaci paliwo i koszty auta) – typowy model flot w PL.
# Alternatywa na kierowcę: stała opłata dzienna za auto (/prowizja NR dzienna 120). 120 zł to przykład, nie dane rynkowe.
COMMISSION = {"default_driver_pct": 50, "default_daily_fee": 120, "cash_methods": ["gotówka"]}

KIND = {
    "airport": dict(hub="lotniska", hub_name="Transfery lotniskowe", plural="Lotniska"),
    "spa":     dict(hub="sanatoria", hub_name="Przejazdy do sanatoriów", plural="Sanatoria"),
    "clinic":  dict(hub="kliniki", hub_name="Przejazdy do klinik i szpitali", plural="Kliniki i szpitale"),
    "station": dict(hub="dworce", hub_name="Dworce PKP i autobusowe", plural="Dworce"),
    "city":    dict(hub="miasta", hub_name="Kursy do miast", plural="Miasta"),
}

# Zdjęcia do sekcji „Przewozy VIP”: wrzuć pliki .jpg/.webp do src/assets/img/vip/ – pojawią się same.
# Podpisy (opcjonalnie): nazwa pliku -> tekst pod zdjęciem.
VIP_CAPTIONS = {
    # "gala-katowice.jpg": "Gala w Katowicach, 2026",
}

# ---------------- TOŻSAMOŚĆ FIRMY (white-label) ----------------
# Wszystkie teksty zależne od firmy i regionu. Polskie formy wpisujemy RĘCZNIE (nic nie jest odmieniane automatycznie).
OWNER = {
    "nom": "Jan",           # kto? – „Jan przydzielił Ci rezerwację”
    "gen": "Jana",          # kogo? – „Poproś Jana o link”
    "dat": "Janowi",        # komu? – „Do oddania Janowi”
    "full": "Jan Przykładowy",
}
BRAND = {
    "short": "Taxi Przykład",                     # nazwa aplikacji na telefonie, bot, czat
    "city": "Przykładowo",                        # „Taxi Przykładowo – …” w tytułach stron
    "city_loc": "w Przykładowie",                 # „Zamów taxi w Przykładowie”
    "logo_title": "TAXI PRZYKŁAD",                # tekst przy logo w nagłówku
    "logo_sub": "PRZYKŁADOWO · OKOLICE",
    "hero_name": "Taxi Przykład – Przykładowo i okolice",   # nagłówek strony głównej (dla Google)
    "facebook_label": "Taxi Przykład",
    "alternate_names": [],                        # inne nazwy firmy (dane strukturalne)
}
AREA = {
    "nom": "Przykładowo i Nowa Wieś",             # „Taxi Przykładowo i Nowa Wieś – lotniska…”
    "from": "z Przykładowa i Nowej Wsi",          # „Taxi z Przykładowa i Nowej Wsi na lotnisko”
    "from_all": "z Przykładowa, Nowej Wsi i okolic",
    "from_rev": "z Przykładowa i okolic",
    "from_slash": "z Przykładowa / Nowej Wsi",
    "in": "w Przykładowie i Nowej Wsi",
    "in_list": "w Przykładowie, Nowej Wsi i okolicznych miejscowościach",
    "base_nom": "Przykładowo", "base_gen": "Przykładowa",   # „Kurs do Przykładowa od 15 zł”
    "zone_a_gen": "Dolnej",                       # „Z Dolnej i strefy A dochodzi …”
    "zone_a_examples": "Dolna, Górna",
    "region_all": "po całym regionie",
    "region_loc": "w regionie",
    "region_badge": "REGION",
    "en": "Przykładowo and Nowa Wieś", "en_base": "Przykładowo",
}
# Główne lotniska (slugi z DESTINATIONS) i teksty o lotniskach
MAIN_AIRPORT = {"slug": "lotnisko-pyrzowice", "loc": "w Pyrzowicach", "en": "Katowice"}
SECOND_AIRPORT = {"slug": "lotnisko-balice", "en": "Kraków"}
AIRPORTS_GEN = "Pyrzowic, Balic i Okęcia"                         # „Odbiór kontrahentów z …”
EN_AIRPORTS = "Katowice, Kraków, Wrocław, Ostrava and Warsaw"
# Szybkie cele w formularzu: (ikona, slug, etykieta)
CHIPS = [("plane", "lotnisko-pyrzowice", "Pyrzowice"), ("plane", "lotnisko-balice", "Balice"), ("plane", "lotnisko-wroclaw", "Wrocław"),
         ("train", "dworzec-gliwice", "Dworzec Gliwice"), ("train", "dworzec-katowice", "Dworzec Katowice")]
# Opisy na kartach usług (strona główna)
SERVICE_NOTES = {
    "airport": "Pyrzowice, Balice, Wrocław, Warszawa. Śledzimy lot przy powrocie.",
    "spa": "Busko-Zdrój, Szczyrk, Ustroń. Pomoc z bagażem i powrót po turnusie.",
    "clinic": "Katowice, Gliwice, Zabrze. Kierowca może poczekać podczas wizyty.",
}
# Auta firmy (zdjęcia w src/assets/img/fleet/<plik>.webp). Pusta lista = sekcja „Czym pojedziesz” ukryta. Przykład:
# dict(name="Toyota Corolla", tag="do 4 osób", main=("corolla", "Toyota Corolla – Taxi Przykład"), feats=["klimatyzacja"], more=[])
FLEET_CARDS = []
# Przykład wyjątku cenowego w panelu
PANEL_EXAMPLE = "Leśna → Pyrzowice 210 zł"
# Przekierowania starych adresów (np. z poprzedniej strony firmy): (stary, nowy)
REDIRECTS = []
# Przykładowe adresy w pomocy bota i AI (miasto bazowe i ulice z okolicy)
EXAMPLES = {"town": "Przykładowo", "addr": "Rynek 1 Przykładowo", "addr2": "Lipowa 5 Nowa Wieś", "addr3": "Dworcowa 12 Przykładowo", "street": "Rynek 1",
            "probe": "Dworcowa Katowice", "region_en": "Poland", "towns_en": "Przykładowo and Nowa Wieś",
            "airport": "Pyrzowice", "airport_full": "Lotnisko Katowice-Pyrzowice", "station": "Dworzec Gliwice", "station_to": "do dworca w Gliwicach",
            "station_full": "Dworzec PKP Katowice", "hospital": "Szpital Zabrze"}

# ---------------- WERSJA LITE ----------------
# True = strona bez systemu rezerwacji: klient wysyła kurs przez WhatsApp / SMS albo dzwoni, kierowca potwierdza.
# Każde kliknięcie trafia do raportu w panelu (/panel/). False = pełny system (mapa, cena, Telegram, status na żywo).
LITE_MODE = __import__("os").environ.get("TAXI_LITE", "1") != "0"   # TAXI_LITE=0 py src/build.py = pełna wersja (testy)
# Prototyp na osobnym adresie: noindex + robots Disallow, żeby nie konkurował w Google z główną stroną. False po starcie na domenie.
LITE_NOINDEX = True
# Drugi numer pokazywany pod przyciskiem „Zadzwoń”
PHONE2 = None   # np. ("600 000 000", "+48600000000")
# Podpis w stopce (jeden sprzedawca wszędzie: stopka, oferta, faktura, umowa powierzenia)
CREDIT = "Usługi IT RAMY MOHAMED"

# ---------------- CENY z pliku src/prices.json ----------------
# Ceny (kursy lokalne, strefy, trasy, wyjątki, oczekiwanie, taryfa) są w src/prices.json – zmienia je też panel /panel/.
# Tutaj zostają nazwy, opisy i współrzędne. Błędny plik zatrzymuje build (stara wersja strony działa dalej).
import json as _json, os as _os
from prices_check import check_prices as _check
PRICES_FILE = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "prices.json")
PRICES = _json.load(open(PRICES_FILE, encoding="utf-8"))
_err = _check(PRICES, [v[0] for v in VILLAGES], [d["slug"] for d in DESTINATIONS], list(ZONES))
if _err:
    raise SystemExit("BŁĄD w src/prices.json:\n  " + "\n  ".join(_err))
for _z in ZONES: ZONES[_z]["surcharge"] = PRICES["zones"][_z]
VILLAGES = [(s, n, l, PRICES["village_zone"].get(s, z), PRICES["local"][s]) for s, n, l, z, _p in VILLAGES]
for _d in DESTINATIONS:
    _d["price"] = PRICES["destinations"][_d["slug"]]["price"]
    _d["confirmed"] = PRICES["destinations"][_d["slug"]].get("confirmed", False)
TARIFF.update({k: PRICES["tariff"][k] for k in ("start", "per_km", "min")})
OVERRIDES = PRICES.get("overrides") or {}          # {"czerwionka": {"lotnisko-pyrzowice": 220}}
WAITING = PRICES.get("waiting") or {}              # {"free_min": 10, "per_min": 1}
