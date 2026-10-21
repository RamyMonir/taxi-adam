# taxi-lite – UX design

Keep the existing V3 look (colours, fonts, header, cards). Only the booking box and a few texts change. All customer text in Polish.

## Flow 1 – Customer books (home, /rezerwacja/, route and village pages)
Booking box in the hero (mobile: first screen):
```
┌ Zamów taxi ───────────────────────────────┐
│ Kierowca potwierdza w kilka minut         │
│ [ Teraz ] [ Na później ]                  │
│ Skąd?  [ ul. ...              ] [📍 Tu jestem]
│ Dokąd? [ ...                  ]           │
│ (Pyrzowice)(Balice)(Wrocław)(Dw. Gliwice)(Dw. Katowice)
│ Telefon* [600 100 200]                    │
│ [ 🟢 Zamów przez WhatsApp              → ]│  ← visible without scrolling at 390 px
│ [ ✉ Wyślij SMS ]  [ 📞 Zadzwoń 570 762 777 ]
│ lub 515 650 750                           │
│ Cenę potwierdza kierowca przy przyjęciu zlecenia.
│ ▸ Więcej: data i godzina, osoby, bagaż, imię, uwagi
│ *Wszelkie dodatkowe opłaty pokrywa zamawiający (parkingi, wjazdy na tereny płatne itd.).
└───────────────────────────────────────────┘
```
- To keep WhatsApp above the fold, the first screen shows only: Teraz/Na później, Skąd, Dokąd, chips, Telefon, the buttons.
  "Na później" reveals Data + Godzina right under the toggle (required). People (1–9), bagaż, imię, uwagi sit under
  "Więcej" (open by default on desktop).
- Route pages pre-fill Dokąd (e.g. "Lotnisko Katowice-Pyrzowice") and start in "Na później" for airports/spa/stations.
  Village pages pre-fill the placeholder "Adres odbioru, Czerwionka".
- Chips fill Dokąd; tapping again replaces it.
- **Tu jestem**: asks the browser for location → button shows "📍 Lokalizacja dodana ✓" (and a small × to remove).
  Refused/failed: "Nie udało się pobrać lokalizacji – wpisz adres." Nothing is sent anywhere until a channel button is tapped.
- **Night** (22:00–5:00, for "Teraz" now, or for the chosen later time): yellow note
  "Kursy nocne (22:00–5:00) tylko po wcześniejszej rezerwacji." – "Teraz" at night switches the form to "Na później"
  with the note; message gets "(kurs nocny – rezerwacja)".
- **Validation** (on tap, before opening the app; inline, red text under the field, focus moves there):
  - no phone → "Podaj numer telefonu, żeby kierowca mógł potwierdzić kurs."
  - phone < 9 digits → "Sprawdź numer telefonu (min. 9 cyfr)."
  - Na później without date/time → "Wybierz datę i godzinę odbioru."
  - later time in the past → "Ta godzina już minęła – wybierz późniejszą."
  - Skąd/Dokąd empty → allowed (customer may write in WhatsApp), but message says "Skąd: (do ustalenia)".
  **Zadzwoń** never validates (a call must always work).
- After tap: WhatsApp/SMS/phone opens. On return to the page a small banner: "Wysłałeś zapytanie? Kierowca odpisze lub
  oddzwoni w kilka minut. Nie dostałeś odpowiedzi? Zadzwoń: 570 762 777." Form values are remembered on the device
  (name, phone) as in V3.

### WhatsApp/SMS message (example)
```
Dzień dobry, chcę zamówić taxi (taxiknurowadam.pl)
Kiedy: 24.10 (sob.) 04:30 (kurs nocny – rezerwacja)
Skąd: ul. Szpitalna 25, Knurów
Moja lokalizacja: https://maps.google.com/?q=50.21970,18.67670
Dokąd: Lotnisko Katowice-Pyrzowice
Osoby: 3 · Bagaż: 3–4 walizki
Imię: Ewa · Telefon: 600 100 200
Uwagi: fotelik dla dziecka
```

## Flow 2 – Prices and waiting time (cennik, route pages, FAQ)
- Tables keep "od" prices. Village pages: table "Ceny z miejscowości X" uses per-village overrides when set.
- Waiting rule block on cennik + FAQ + under the booking box (small):
  "Oczekiwanie: pierwsze {X} min gratis, potem {Y} zł za każdą rozpoczętą minutę." Until Adam sets X/Y:
  "Czas oczekiwania ustalamy przy zamówieniu."
- FAQ new entries: "Większa grupa? Zorganizujemy transport do 9 osób (busy partnerskie)." and the extra-fees rule.

## Flow 3 – Adam's panel (phone first)
URL `https://www.taxiknurowadam.pl/panel/<secret>/` (Adam saves it to his home screen).
1. **PIN screen**: 6 big digit boxes, numeric keyboard. Wrong: "Błędny PIN (zostały 4 próby)". Locked: "Za dużo prób – spróbuj za 15 minut."
2. **Raport** (default tab):
   ```
   [Dziś] [Tydzień] [Miesiąc] [Od–do]
   Kliknięcia / zapytania rozpoczęte: 47
   WhatsApp 28 · SMS 6 · Telefon 13
   Najczęstsze cele: Pyrzowice 9, Balice 4, Dw. Gliwice 3 …
   Najczęstsze miejsca odbioru: Knurów 21, Czerwionka 5 …
   ⓘ Nie każde kliknięcie kończy się wiadomością; telefony wybrane ręcznie nie są liczone.
   Lista: 24.10 04:30 · Szpitalna 25 → Pyrzowice · 3 os · Ewa 600 100 200 · WhatsApp  [✓ Przyjęty] [✗ Nie]
   [Pobierz CSV (Excel)]
   ```
   Tap a phone number → call. Empty state: "Brak zapytań w tym okresie."
3. **Ceny** tab (Phase 5): sections Miejscowości (price + zone), Lotniska, Sanatoria, Kliniki, Dworce, Miasta,
   "Wyjątki" (village → destination, e.g. Czerwionka → Pyrzowice 220), "Oczekiwanie" (X min, Y zł/min).
   Changed fields highlighted. **Sprawdź zmiany** → list "Czerwionka → Pyrzowice: 190 → 220 zł" → **Zatwierdź**.
   Status: "Zapisano – publikuję…" (spinner) → "✅ Wdrożono 14:32" or "⚠ Nie udało się opublikować – stare ceny dalej działają. Zadzwoń do Ramego."
   Conflict: "Ceny zmieniono w międzyczasie – odśwież stronę." Out of range: "Cena musi być od 5 do 2000 zł."
   History list: last 10 changes with date.
4. **Wyloguj** in the corner; session ends after 12 h.

## Accessibility
- Big tap targets (≥ 48 px), labels on all fields, errors with `role="alert"` and focus, keyboard usable, contrast as V3,
  Atkinson Hyperlegible font kept, buttons have text not only icons, `prefers-reduced-motion` respected.

## Edge cases
- Desktop without WhatsApp → wa.me opens WhatsApp Web; SMS button hidden on desktop (shown as "Wyślij SMS z telefonu" tip).
- Lead logging fails/offline → no message to the customer; the channel still opens.
- Installed PWA offline → static pages and prices work; buttons still open apps.
- English page: same lite box with English labels; the message stays Polish-first with English field names.
