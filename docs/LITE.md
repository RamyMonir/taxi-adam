# Taxi Lite – website + WhatsApp/SMS booking + request report + price editor

Branch `Taxi-Knurow-Lite`. One switch in `src/data.py`: `LITE_MODE = True` (False = the full system; nothing was deleted).

## What it does
- **Customer:** fills in from / to / when / phone (and optionally people, luggage, name, notes, "Tu jestem" location) and taps
  **WhatsApp**, **SMS** or **Zadzwoń**. The message is ready in the app – the customer only sends it. The driver confirms ride and price.
- **Owner panel** `/panel/#<secret>` + 6-digit PIN: report (today / week / month / range), channels, top destinations and pickups,
  list of requests with "przyjęty / nie przyjęty", CSV for Excel; tab **Ceny** to change prices (saved to GitHub, site rebuilds in ~2 min).
- No Google Maps, no AI, no Telegram, no accounts. Running cost 0 zł (Cloudflare free plan).
- Numbers in the report = taps ("kliknięcia / zapytania rozpoczęte"), not rides.

## Files
| File | Purpose |
|---|---|
| `src/prices.json` | All prices (local rides, zones, routes, exceptions, waiting rule). Checked by `src/prices_check.py`; a bad file stops the build and the old site stays live |
| `src/assets/lite.js`, `lite-msg.js` | Booking box in the browser; message builder (tested) |
| `src/assets/panel.js` + `/panel/` page | Owner panel |
| `functions/api/lead.js` | Saves each tap (D1 table `leads`, 12 months) |
| `functions/api/panel/[[path]].js` | Panel API: login, report, CSV, status, prices, history |
| `functions/_middleware.js` | In lite, every other API of the full system answers 404 |
| `server/leads.js`, `panel.js`, `prices.js`, `github.js` | Logic (tested in `tests/lite-*.test.js`) |
| `migrations/0005_lite.sql` | New tables only (also created automatically) |
| `scripts/panel_pin.mjs` | Makes the panel secrets for a PIN |
| `scripts/price_table.py` | Village × airport price table to confirm with the owner |

## Cloudflare setup (separate project – the full site stays untouched)
1. **Workers & Pages → Create → Pages → Connect to Git** → repo `RamyMonir/taxi-adam`, project name e.g. `taxi-adam-lite`,
   **production branch `Taxi-Knurow-Lite`**, build command `pip install jinja2 && python3 src/build.py`, output `dist`.
2. **Storage & Databases → D1 → Create** `taxi-lite`. Project → **Settings → Bindings → D1**: name `DB`, database `taxi-lite`.
3. **Settings → Variables and Secrets** (type Secret):
   | Name | Value |
   |---|---|
   | `LEAD_SALT` | any long random text |
   | `PANEL_SLUG`, `PANEL_PIN_SALT`, `PANEL_PIN_HASH` | from `node scripts/panel_pin.mjs 123456` (your PIN) |
   | `GITHUB_TOKEN` | price editor (optional): github.com → Settings → Developer settings → Fine-grained token → only repo `taxi-adam`, **Contents: Read and write**, 90 days |
   | `GITHUB_REPO` / `GITHUB_BRANCH` | `RamyMonir/taxi-adam` / `Taxi-Knurow-Lite` (Text) |
   | `RESEND_API_KEY`, `ALERT_EMAIL`, `ALERT_FROM` | optional e-mail to you on every price change |
4. **Deployments → Retry deployment.** Panel link: `https://taxi-adam-lite.pages.dev/panel/#<PANEL_SLUG>`.

Without `GITHUB_TOKEN` the **Ceny** tab is read-only ("edycja po podpisaniu umowy").

## Going to the real domain later
`LITE_NOINDEX = False` in `src/data.py` (the demo is hidden from Google until then), add the custom domain to this project,
and move the domain away from the full project. Keep `PUBLIC_URL`/`SITE_URL` = the domain.

## Checks
```bash
node --test tests/*.test.js     # incl. lite-msg + lite-server (real SQLite)
py tests/schema_check.py
py tests/build_check.py         # full vs lite: no Google calls, no lost pages, same titles
py src/build.py
```
Local: `.dev.vars` with the four secrets, then `npx wrangler pages dev dist --d1 DB=taxi-lite-local`.

---

## Instrukcja dla właściciela (panel)
1. Otwórz link do panelu od Ramego (kończy się znakiem `#…`) i dodaj go do ekranu głównego telefonu.
2. Wpisz 6-cyfrowy PIN. Po 5 błędnych próbach panel blokuje się na 15 minut.
3. **Raport:** Dziś / Tydzień / Miesiąc / Od–do. Liczba to kliknięcia w WhatsApp, SMS i „Zadzwoń” na stronie – nie każde kończy się wiadomością.
   Stuknij numer, żeby zadzwonić. Oznaczaj „✓ Przyjęty” / „✗ Nie przyjęty” – wtedy widać, ile zapytań zamieniło się w kursy.
   „Pobierz CSV” – plik do Excela.
4. **Ceny:** wpisz nowe ceny (zmienione pola świecą na pomarańczowo) → **Sprawdź zmiany** → **Zatwierdź i opublikuj**.
   Po 1–3 minutach pojawi się „✅ Wdrożono” i nowe ceny są na stronie. „Wyjątki” to ceny z konkretnej miejscowości na konkretną trasę
   (np. Czerwionka → Pyrzowice 220 zł). „Oczekiwanie” – ile minut gratis i ile zł za minutę.
5. Dane klientów są usuwane automatycznie po 12 miesiącach.
