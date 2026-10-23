# Taxi booking website – white-label template

A complete website + booking system for a local taxi firm, ready to launch for a new client by editing **one config file**.
Demo business in this branch: **„Taxi Przykład”** (fictional town *Przykładowo*), phone **503 467 198**.

Two versions in one code base – one switch in `src/data.py`:

| | **LITE** (`LITE_MODE = True`, default) | **FULL** (`LITE_MODE = False`) |
|---|---|---|
| For | 1–3 cars, low budget | 4+ cars, dispatch |
| Booking | Form → ready message via **WhatsApp / SMS / phone**, driver confirms | Online booking with map, route and price, live status page |
| Owner tools | **Panel** `/panel/` (PIN): request report, CSV, „przyjęty / nie przyjęty”, **price editor** (saves to GitHub, site rebuilds) | **Telegram bot**: dispatch, fastest driver, AI „Nowy kurs”, auto-assign, flight watch, shared cars, settlement, 23:00 reports, chat with customers |
| Running cost | 0 zł (Cloudflare free) | Cloudflare free + Google Maps (~0–150 zł/month) + optional AI (~20–60 zł/month) |

Both: ~45 SEO pages (airports, sanatoria, clinics, stations, cities, villages, price list, business page, contact, English), PWA
(installs like an app), no cookies or trackers, accessible font, dark mode.

## Make it for a new client
→ **[docs/NEW-CLIENT.md](docs/NEW-CLIENT.md)** – the full checklist (what to ask the client, what to edit, Cloudflare, handover).

Short version: copy this branch, edit `src/data.py` (identity block + business data), `src/prices.json`, `src/fleet.py`,
draw placeholder logos with `node scripts/brand_images.mjs "TAXI NAZWA" "MIASTO · OKOLICE"` (or add the client's logo files),
run the checks, deploy.

## Guides
| File | For whom |
|---|---|
| [docs/NEW-CLIENT.md](docs/NEW-CLIENT.md) | you (integrator): new client from A to Z |
| [docs/LITE.md](docs/LITE.md) | LITE setup + **owner's panel guide (PL)** |
| [SETUP.md](SETUP.md) | FULL setup (Cloudflare, Telegram, Google, AI, cron) + **driver guide (PL)** |
| [tests/e2e/README.md](tests/e2e/README.md) | end-to-end tests of the bot |

## How it's built
- Static site: Python + Jinja2. `src/data.py` + `src/prices.json` + `src/fleet.py` → `py src/build.py` → `dist/`.
  The build also writes `server/config.js`, so the server uses the same data (names, prices, owner's name forms).
- API: Cloudflare Pages Functions (`functions/api/`, logic in `server/`), D1 database, optional R2 photos.
- All business texts come from config: `OWNER` (name in 3 Polish cases), `BRAND`, `AREA` (town names in Polish cases),
  airports, chips, fleet cards, examples (`src/data.py`) → website, bot, SMS, chat, reports and AI prompts (`server/brand.js`).

## Checks (run before every handover)
```bash
node --test tests/*.test.js     # unit tests (incl. LITE backend on real SQLite)
py tests/schema_check.py        # database migrations
py tests/build_check.py         # FULL vs LITE: no Google calls in LITE, no lost pages
py tests/leak_check.py          # no data of a previous client; phone links only to this client's numbers
py src/build.py                 # must print OK: … stron
```
Local preview: `npx wrangler pages dev dist --d1 DB=local` → http://localhost:8788
