# -*- coding: utf-8 -*-
"""
Jedno miejsce na wszystkie dane strony.
Zmieniasz ceny / telefon / miejscowości TUTAJ, potem: python3 build.py

CENY: pola "price" to cena OD Knurowa w zł.
  confirmed=True  -> cena z cennika Adama (taxifest.pl)
  confirmed=False -> SZACUNEK – do potwierdzenia z Adamem przed publikacją
"""

SITE_URL = "https://www.taxiknurowadam.pl"   # TODO: docelowa domena (sprawdź dostępność)
BUSINESS = {
    "name": "Taxi Knurów Adam Mączka",
    "short": "Taxi Adam",
    "phone": "570 762 777",
    "phone_e164": "+48570762777",
    "whatsapp": "48570762777",
    "street": "ul. Kosmonautów 18",
    "postal": "44-190",          # TODO: potwierdzić kod pocztowy
    "city": "Knurów",
    "lat": 50.2316, "lng": 18.6610,  # przybliżone – podmień na dokładne z wizytówki
    "google_maps": "https://www.google.com/maps/search/?api=1&query=Taxi+Knur%C3%B3w+Adam+M%C4%85czka",
    "google_review": "https://www.google.com/maps/search/?api=1&query=Taxi+Knur%C3%B3w+Adam+M%C4%85czka",  # TODO: link "Poproś o opinię" z panelu wizytówki
    "rating": "4,9",
    "reviews": 274,
    "seats": 7,
    "payments": ["Gotówka", "Karta", "BLIK", "Przelew dla firm (faktura)"],
}

# Strefy odbioru: dopłata do ceny trasy, gdy kurs zaczyna się poza Knurowem
ZONES = {
    "0":  {"label": "Knurów (z Szczygłowicami i Krywałdem)", "surcharge": 0},
    "A":  {"label": "strefa A", "surcharge": 10},
    "B":  {"label": "strefa B", "surcharge": 20},
}

# Rejon przyjmowania zleceń (od Adama). price = kurs lokalny z Knurowa (SZACUNEK)
VILLAGES = [
    # slug, nazwa, miejscownik ("w ..."), strefa odbioru, cena kursu z Knurowa
    ("knurow",       "Knurów",       "w Knurowie",       "0", 15),
    ("gieraltowice", "Gierałtowice", "w Gierałtowicach", "A", 30),
    ("beksza",       "Beksza",       "w Bekszy",         "A", 30),
    ("bojkow",       "Bojków",       "w Bojkowie",       "A", 25),
    ("przyszowice",  "Przyszowice",  "w Przyszowicach",  "A", 35),
    ("wilcza",       "Wilcza",       "w Wilczy",         "A", 35),
    ("zernica",      "Żernica",      "w Żernicy",        "A", 35),
    ("chudow",       "Chudów",       "w Chudowie",       "B", 45),
    ("pilchowice",   "Pilchowice",   "w Pilchowicach",   "B", 40),
    ("smolnica",     "Smolnica",     "w Smolnicy",       "B", 45),
    ("stanica",      "Stanica",      "w Stanicy",        "B", 45),
    ("czerwionka",   "Czerwionka",   "w Czerwionce",     "B", 40),
    ("ornontowice",  "Ornontowice",  "w Ornontowicach",  "B", 45),
]

# Trasy dalekie. kind: airport | spa | clinic | station | city
DESTINATIONS = [
    # --- Lotniska ---
    dict(slug="lotnisko-pyrzowice", kind="airport", name="Lotnisko Katowice-Pyrzowice", short="Pyrzowice", code="KTW",
         price=150, confirmed=True, region="woj. śląskie"),
    dict(slug="lotnisko-balice", kind="airport", name="Lotnisko Kraków-Balice", short="Balice", code="KRK",
         price=320, confirmed=True, region="woj. małopolskie"),
    dict(slug="lotnisko-wroclaw", kind="airport", name="Lotnisko Wrocław", short="Wrocław", code="WRO",
         price=420, confirmed=True, region="woj. dolnośląskie"),
    dict(slug="lotnisko-ostrava", kind="airport", name="Lotnisko Ostrava", short="Ostrava", code="OSR",
         price=260, confirmed=False, region="Czechy"),
    dict(slug="lotnisko-okecie", kind="airport", name="Lotnisko Warszawa-Okęcie (Chopina)", short="Okęcie", code="WAW",
         price=800, confirmed=True, region="woj. mazowieckie"),
    dict(slug="lotnisko-modlin", kind="airport", name="Lotnisko Warszawa-Modlin", short="Modlin", code="WMI",
         price=850, confirmed=False, region="woj. mazowieckie"),
    # --- Sanatoria ---
    dict(slug="sanatorium-busko-zdroj", gen="Buska-Zdroju", loc="w Busku-Zdroju", kind="spa", name="Busko-Zdrój", short="Busko-Zdrój",
         price=620, confirmed=False, region="woj. świętokrzyskie"),
    dict(slug="sanatorium-szczyrk", gen="Szczyrku", loc="w Szczyrku", kind="spa", name="Szczyrk", short="Szczyrk",
         price=280, confirmed=False, region="Beskid Śląski"),
    dict(slug="sanatorium-ustron", gen="Ustronia", loc="w Ustroniu", kind="spa", name="Ustroń", short="Ustroń",
         price=260, confirmed=False, region="Beskid Śląski"),
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

KIND = {
    "airport": dict(hub="lotniska", hub_name="Transfery lotniskowe", plural="Lotniska"),
    "spa":     dict(hub="sanatoria", hub_name="Przejazdy do sanatoriów", plural="Sanatoria"),
    "clinic":  dict(hub="kliniki", hub_name="Przejazdy do klinik i szpitali", plural="Kliniki i szpitale"),
    "station": dict(hub="dworce", hub_name="Dworce PKP i autobusowe", plural="Dworce"),
    "city":    dict(hub="miasta", hub_name="Kursy do miast", plural="Miasta"),
}
