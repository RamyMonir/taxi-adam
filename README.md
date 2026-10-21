# Taxi booking & dispatch system – FULL version

Branch **`Taxi-Knurow-Full`** keeps the complete product in one place: the production system (`Taxi-Knurow-V3`)
plus the customer ↔ driver chat (`Taxi-Knurow-V8-chat`). It was built for Taxi Knurów Adam Mączka
(https://www.taxiknurowadam.pl) and is the base version to offer to other taxi firms.

A smaller, zero-cost version for 1–2 car firms (booking by WhatsApp / SMS / phone, no backend) lives on
`Taxi-Knurow-Lite`.

**Step-by-step setup (Cloudflare, Telegram, Google, AI, cron): [SETUP.md](SETUP.md).**
Telegram bot manual for the owner and drivers: [docs/Taxi-Adam-Telegram-bot-documentation.docx](docs/Taxi-Adam-Telegram-bot-documentation.docx).

## What's inside

### Customers (website + PWA)
| Feature | Details |
|---|---|
| SEO website | ~52 pages generated from one data file: airports, sanatoria, clinics, stations, cities, villages, price list, business page, contact, English page. LocalBusiness / Service / FAQPage / BreadcrumbList data |
| Online booking | "Now" or reservation, Google address suggestions or GPS ("Tu jestem"), map, route, drive time and a fixed price calculated on the server |
| Live status `/przejazd/` | Driver, car, colour, plate, photo, ETA countdown, cancel, sound + vibration when the car waits, Google review request at the end |
| Chat | Customer writes to the driver on the status page; driver answers by replying in Telegram or with quick buttons. No phone numbers shown |
| Flights | Flight number on airport bookings → flight watch, pickup moves to landing + 20 min |
| Accounts | Optional "Sign in with Google": rides on every device, name and phone filled in |
| Reviews | Best reviews from up to 3 Google listings (Places API), review links rotate fairly between listings |
| PWA, a11y, privacy | Installs like an app, works offline (price list), Atkinson Hyperlegible font, dark mode, no cookies or trackers |
| Protection | Per-IP rate limits, optional Cloudflare Turnstile |
| Night rule | Configurable hours when only reservations are accepted |

### Owner and drivers (Telegram bot)
| Feature | Details |
|---|---|
| Dispatch | "Now" ride → fastest free driver by drive time with traffic (Google Routes from live location) → after 1 min all free drivers → owner |
| "Kto jedzie?" | ⭐ fastest, 🟢 free, 🚕 on a ride (free at…), 🚫 too few seats, ⚠️ collides with a reservation |
| Reservations | Owner confirms or assigns a driver; reminders before pickup |
| Ride buttons | Przyjmuję → Jestem na miejscu (automatic from GPS) → Klient wsiadł → Zakończ → payment method |
| Phone rides | `/kurs SKĄD > DOKĄD, KIEDY, TELEFON`, or **AI "➕ Nowy kurs"** in plain words or a voice note (Claude + Workers AI Whisper) |
| Auto-assign | When the owner is busy: reservation after 10 min, "now" ride after 2 min |
| Board | "Kursy w toku": the whole day on one screen |
| Fleet | Shared cars, 2-step shift (car + live location), cars/drivers from `src/fleet.py`, photos in R2 |
| Settlement | 50/50, % or daily fee per driver; 23:00 report with cash to hand in, "✅ Rozliczono" |
| Reports | `/raport` any period + CSV; questions in plain words ("Ile zarobił Marek w październiku?"), drivers see only their own data |
| Customers | "Nowy klient" / "Stały klient" marker |

## How it's built
- **Site:** Python + Jinja2. `src/data.py` (business data, prices, zones, villages, destinations) and `src/fleet.py`
  (cars, drivers) → `py src/build.py` → `dist/`. The build also writes `server/config.js` so the server uses the same prices.
- **API:** Cloudflare Pages Functions in `functions/api/` with the logic in `server/`.
- **Data:** Cloudflare D1 (`DB`, migrations in `migrations/`), optional R2 (`PHOTOS`).
- **Timer:** small Worker in `cron-worker/` calls the site every minute (dispatch, reminders, flight watch, 23:00 reports).
- **External services (on the client's own accounts):** Google Maps Platform, Telegram Bot API, Anthropic API (optional AI),
  Workers AI (optional voice), AeroDataBox (optional flights), Turnstile (optional).

## Running costs for the client
Cloudflare free plan; Google Maps usually 0–150 zł / month; AI ~20–60 zł / month; domain ~60–180 zł / year.

## Branches
| Branch | What it is |
|---|---|
| `Taxi-Knurow-V3` | Production for taxiknurowadam.pl (Cloudflare Pages project `taxi-adam`) |
| `Taxi-Knurow-Full` | **This branch:** everything (V3 + chat) |
| `Taxi-Knurow-V8-chat` | Chat feature on its own (sold separately) |
| `Taxi-Knurow-V4-ui` | G2 redesign of `/rezerwacja/` and `/przejazd/` (not merged) |
| `Taxi-Knurow-Lite` | Low-cost version: static site + WhatsApp/SMS booking |
| `main` | Legacy static site |

New work: branch from the target branch, open a PR into a `…-review` branch for a Cloudflare preview; production is merged by hand.

## Checks
```bash
node --test tests/*.test.js     # unit tests
py tests/schema_check.py        # SQL schema check
py src/build.py                 # must print OK: … stron
```
End-to-end suites with fake Telegram / Google / Anthropic: [tests/e2e/README.md](tests/e2e/README.md).

## To adapt for a new taxi firm
1. `src/data.py`: name, phones, addresses, Google Place IDs, `SITE_URL`, villages, destinations, prices, tariff, zones,
   night rule, commission.
2. `src/fleet.py`: real cars and drivers.
3. Logo and images in `src/assets/`.
4. Follow [SETUP.md](SETUP.md) on the client's own Cloudflare, Telegram and Google accounts.
