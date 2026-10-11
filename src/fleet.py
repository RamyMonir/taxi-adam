# -*- coding: utf-8 -*-
"""
FLOTA – auta i kierowcy. Zmieniasz TYLKO ten plik, potem: py src/build.py i wdrożenie (push).

Przy pierwszej wiadomości do bota (albo po otwarciu /api/admin/setup) system sam się z tym plikiem zsynchronizuje:
  • nowe auto / nowy kierowca  -> dodany,
  • zmienione dane             -> poprawione,
  • usunięte z listy           -> wycofane (stare kursy i raporty zostają bez zmian).
Kierowcy dołączają przez jednorazowy link zaproszenia – Adam dostaje linki w Telegramie (i w /kierowcy).

⚠️ Poniżej są DANE PRZYKŁADOWE (zmyślone nazwiska, telefony i rejestracje). Podmień je na prawdziwe.

AUTA
  plate  – numer rejestracyjny; po nim system rozpoznaje auto (nie zmieniaj go, jeśli to to samo auto)
  make, model, color – klient widzi to na stronie statusu kursu („Toyota Corolla · biała”)
  seats  – liczba miejsc dla pasażerów (kurs na 5 osób dostanie tylko auto z min. 5 miejscami)

KIEROWCY
  key    – stały, krótki identyfikator (np. "k1"); nie zmieniaj go dla tej samej osoby
  name   – imię, które widzi klient
  phone  – numer, pod który klient może zadzwonić do kierowcy (może być pusty – wtedy dzwoni na numer firmy)
  pay    – rozliczenie: {"percent": 50} = 50% utargu dla kierowcy, {"daily_fee": 120} = stała opłata dzienna za auto,
           None = domyślne (COMMISSION w data.py)
Każdy kierowca może jeździć każdym autem: na początku zmiany wybiera wolne auto jednym przyciskiem w bocie.
"""

CARS = [
    # plate (unikalna)  marka       model      kolor        miejsca
    dict(plate="SGL 1A234", make="Toyota",     model="Corolla", color="biała",      seats=4),
    dict(plate="SGL 2B567", make="Škoda",      model="Octavia", color="czarna",     seats=4),
    dict(plate="SGL 3C890", make="Toyota",     model="Camry",   color="grafitowa",  seats=4),
    dict(plate="SGL 4D123", make="Kia",        model="Ceed",    color="srebrna",    seats=4),
    dict(plate="SGL 5E456", make="Volkswagen", model="Touran",  color="niebieski",  seats=7),
]

DRIVERS = [
    dict(key="k1", name="Marek Nowak",      phone="+48 500 000 001", pay={"percent": 50}),
    dict(key="k2", name="Katarzyna Wójcik", phone="+48 500 000 002", pay={"daily_fee": 120}),
    dict(key="k3", name="Tomasz Kowalczyk", phone="+48 500 000 003", pay=None),
    dict(key="k4", name="Paweł Zieliński",  phone="+48 500 000 004", pay={"percent": 55}),
]
