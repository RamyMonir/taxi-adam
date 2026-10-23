# New client: from signed order to a live site

For Ramy (integrator). Typical time: **LITE 1 day**, **FULL 2–3 days** (+ waiting for the client's accounts and data).
Seller on all documents: one entity (e.g. Usługi IT RAMY MOHAMED) – footer credit `CREDIT` in `src/data.py`, offer, invoice, DPA.

## 0. Before you start
- [ ] Signed order / contract and the deposit.
- [ ] **Data processing agreement (umowa powierzenia, RODO)** – the client is the controller, you are the processor
      (customer names, phones, addresses are stored in D1 for 12 months).
- [ ] Decide LITE or FULL.

## 1. Ask the client for
| What | Used for |
|---|---|
| Company name, short brand name, owner's first name (+ how it changes: *Jan / Jana / Janowi*) | `BUSINESS`, `BRAND`, `OWNER` |
| Addresses and **phone numbers to publish** (only those!), WhatsApp number, e-mail, Facebook | `BUSINESS["locations"]`, `PHONE2` |
| Base town(s) + list of villages they serve (+ which are "far" = zone A/B) | `VILLAGES`, `ZONES`, `AREA` |
| Prices: local ride per village, airports, sanatoria, clinics, stations, cities; zone surcharges; waiting rule; night rule | `src/prices.json`, `NIGHT` |
| Main airport(s) and typical destinations | `DESTINATIONS`, `MAIN_AIRPORT`, `CHIPS`, `SERVICE_NOTES` |
| Google Business listings (manager access to `ramymonirr@gmail.com`) | `GOOGLE_PLACES` (Place IDs), rating, review links |
| Logo (SVG/PNG), car photos | `src/assets/img/…`, `FLEET_CARDS` |
| Domain (or buy one in the client's name) | `SITE_URL` |
| FULL only: cars (plate, model, seats), drivers (name, phone or empty), settlement model | `src/fleet.py`, `COMMISSION` |

## 2. Make the copy
```bash
git clone <template repo> client-name && cd client-name
git switch -c client-name taxi-template      # or a new repo for the client
```

## 3. Edit the config (only these files)
1. `src/data.py`
   - `SITE_URL`, `BUSINESS` (name, phones, addresses, e-mail, facebook, Google links, `rating`/`reviews` – 0 hides the numbers)
   - **identity block**: `OWNER` (3 forms), `BRAND`, `AREA` – every Polish form typed by hand, read each one aloud
   - `ZONES["0"]["label"]`, `VILLAGES` (first = base town = home page), `DESTINATIONS` (+ `COORDS`), `BASE_CENTER`, `BASE2_CENTER`, `ZONE_KM`
   - `MAIN_AIRPORT`, `SECOND_AIRPORT`, `AIRPORTS_GEN`, `EN_AIRPORTS`, `CHIPS`, `SERVICE_NOTES`, `FLEET_CARDS`, `REDIRECTS`, `EXAMPLES`, `PANEL_EXAMPLE`
   - `GOOGLE_PLACES`, `NIGHT`, `COMMISSION`, `PHONE2`, `LITE_MODE`, `LITE_NOINDEX` (True until the real domain), `CREDIT`
2. `src/prices.json` – every village slug from `VILLAGES` must have a price (the build stops and says what is missing).
   Check with `py scripts/price_table.py` and send the table to the client to confirm.
3. `src/fleet.py` (FULL) – cars and drivers. Driver phone empty = customers call the company number.
4. Branding: `node scripts/brand_images.mjs "TAXI NAZWA" "MIASTO · OKOLICE"` (placeholders), or replace
   `src/assets/img/logo*.webp`, `logo-emblem.png`, `src/assets/og.png`, `favicon.png`, `icon-192.png`, `icon-512.png` with the real logo.
   Car photos: `src/assets/img/fleet/<name>.webp` + `FLEET_CARDS`.
5. `tests/leak_check.py` – add the **previous client's** markers to `OLD_CLIENT` if you started from another client's copy.

## 4. Check
```bash
py src/build.py && TAXI_LITE=0 py src/build.py
node --test tests/*.test.js && py tests/schema_check.py && py tests/build_check.py && py tests/leak_check.py
npx wrangler pages dev dist --d1 DB=local         # click through on a phone (WhatsApp button on the first screen)
```

## 5. Cloudflare (on the client's account, or yours with access handed over later)
- **LITE:** [docs/LITE.md](LITE.md) – Pages project from Git, D1 `DB`, secrets (`LEAD_SALT`, `PANEL_*` from `node scripts/panel_pin.mjs`,
  optional `GITHUB_*` for the price editor, `RESEND_*` for change alerts).
- **FULL:** [SETUP.md](../SETUP.md) – Telegram bot, Google Maps keys, D1, cron Worker (`cron-worker/`, set `SITE_URL`), optional AI and Turnstile.
- Budget alert in Google Cloud (FULL), spending caps.

## 6. Go live
- [ ] Custom domain on the Pages project; `SITE_URL` = domain; `LITE_NOINDEX = False`; rebuild.
- [ ] Google listings: website link → new domain, review QR card.
- [ ] Panel link + PIN to the owner (separate messages). FULL: bot `/start` on the owner's phone, drivers' invite links.
- [ ] 15–30 min training (panel or bot). Driver guide: SETUP.md „Instrukcja dla kierowcy”, owner guide: LITE.md „Instrukcja dla właściciela”.
- [ ] Monthly: summary from the panel / reports, Google listings care, price changes.

## Notes
- Owner texts in the bot use masculine past tense („przydzielił”). For a female owner adjust those few lines in
  `functions/api/telegram.js`, `server/auto.js`, `server/botfleet.js` (search for `${OWNER.nom}`).
- Never type client secrets into chats or code – they go only into Cloudflare settings.
