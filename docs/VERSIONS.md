# Taxi system – guide to all versions (for Ramy)

Status: 23.10.2026. One code base (GitHub `RamyMonir/taxi-adam`), three products. Local folder:
`C:\Users\ramy7\Downloads\taxi-knurow-adam-website-push`.

---

## 1. The three versions in one minute

| | **LITE** | **FULL** | **TEMPLATE** |
|---|---|---|---|
| What it is | Website + booking by **WhatsApp / SMS / phone** + owner panel | Website + **online booking** + **Telegram dispatch bot** | Neutral copy of both (LITE + FULL) to sell to new firms |
| For whom | 1–3 cars, small budget (Adam) | 4+ cars, a real dispatcher | You – start point for every new client |
| Branch | `Taxi-Knurow-Lite` | `Taxi-Knurow-Full` (= `Taxi-Knurow-V3` + chat) | `taxi-template` |
| Data inside | Adam (real) | Adam (real) | „Taxi Przykład”, only your number 503 467 198 |
| Live at | **www.taxiknurowadam.pl** (after the switch in §4) | was live on taxiknurowadam.pl (branch V3) until the switch | not deployed |
| Running cost for the client | 0 zł | Google Maps ~0–150 zł/month + AI ~20–60 zł/month | – |
| What we sell it for | 2 400 / 2 900 zł + 600 zł/month (offer RM/2026/10/002) | 10 000–14 000 zł + 699–790 zł/month (Adam said no) – rethink: ~4–6k + per-car monthly | – |

LITE and FULL are **the same code**: one switch in `src/data.py` → `LITE_MODE` (True = LITE, False = FULL).
Nothing was deleted for LITE – the full system's APIs simply answer 404 in LITE mode.

## 2. What each version does

| Feature | LITE | FULL |
|---|---|---|
| SEO pages (airports, sanatoria, clinics, stations, cities, villages, price list, business, contact, EN), PWA app | ✅ | ✅ |
| Booking | Form → ready message in WhatsApp / SMS, or call. Driver confirms ride and price | Address suggestions + GPS, map, route, fixed price on the server, booking saved |
| Customer sees | Nothing after sending (driver answers in WhatsApp) | Live status page `/przejazd/`: driver, car, plate, ETA, cancel, **chat with the driver** |
| Owner tools | **Panel** `/panel/#secret` + PIN: report (today/week/month/range), channels, top routes, list with phones, przyjęty/nie przyjęty, CSV, **price editor** | **Telegram bot**: Kto jedzie?, fastest driver with traffic, AI „➕ Nowy kurs” (text or voice), auto-assign, flight watch, Kursy w toku board, shared cars, settlement, 23:00 reports, questions about reports |
| Reviews | Static rating + links to the 3 listings | Live best reviews from Google (Places API) |
| Prices | `src/prices.json` – change in the panel (saves to GitHub, site rebuilds in ~2 min) or edit the file | Same file + server-side price calculator |
| Fine print, waiting rule, night rule 22–5 | ✅ | ✅ |
| Needs | Cloudflare (free): Pages + D1 | Cloudflare + Telegram bot + Google Maps keys + (optional) Anthropic key, cron Worker, R2, Turnstile |

Numbers in the LITE report = **taps** („kliknięcia / zapytania rozpoczęte”), not rides. Only „✓ Przyjęty” marks show real rides.

## 3. Branches – the map

```
Taxi-Knurow-V3  ── production of the FULL system until 23.10 (never push/merge to it yourself)
   ├── Taxi-Knurow-V8-chat ── + customer↔driver chat (sold separately)
   │       └── Taxi-Knurow-Full ── V3 + chat (Adam's complete system, kept as a snapshot)
   └── Taxi-Knurow-Lite ── V3 + LITE_MODE + prices.json + panel + price editor  ← LIVE on taxiknurowadam.pl
           └── taxi-template ── Lite + chat + everything from config + demo data (Taxi Przykład)
main ── old static site (unused)
```
Other branches (`V4-ui` G2 redesign, `V5`…`V7`, `…-review`) are history / previews.

## 4. Make LITE live on taxiknurowadam.pl (one-time, your clicks)

The domain belongs to the Cloudflare Pages project **`taxi-adam`**. We keep the project and only change the branch it builds.

1. Cloudflare → **Workers & Pages → taxi-adam → Settings → Variables and Secrets** (Production) → **Add** (type *Secret*):
   `LEAD_SALT`, `PANEL_SLUG`, `PANEL_PIN_SALT`, `PANEL_PIN_HASH` – values in
   `C:\Users\ramy7\AppData\Local\Temp\claude\c--Users-ramy7-Downloads-kemet\02bf63d5-4046-4104-96ff-80c56b32fd5f\scratchpad\LIVE-SECRETS.txt`
   (copy it somewhere safe – that folder is temporary). The D1 binding `DB` already exists – LITE adds only new tables.
2. **Settings → Builds & deployments → Branch control → Production branch** → change `Taxi-Knurow-V3` to **`Taxi-Knurow-Lite`** → Save.
3. **Deployments → Create deployment / Retry** the latest `Taxi-Knurow-Lite` build (~1–2 min).
4. Open https://www.taxiknurowadam.pl on your phone: the booking box shows WhatsApp / SMS / Zadzwoń.
   Panel: `https://www.taxiknurowadam.pl/panel/#<PANEL_SLUG>`, PIN in the secrets file.
5. Optional later (after Adam signs): price editor – add `GITHUB_TOKEN` (fine-grained, repo `taxi-adam` only, Contents read/write,
   90 days), `GITHUB_REPO` = `RamyMonir/taxi-adam`, `GITHUB_BRANCH` = `Taxi-Knurow-Lite`; e-mail alerts: `RESEND_API_KEY`, `ALERT_EMAIL`.

What stops working after the switch (on purpose): the online booking + Telegram bot of the full system (your demo bot answers 404).
The old status links `/przejazd/…` redirect to `/rezerwacja/`.

## 5. Switch back to FULL (any time, 1 minute)
Cloudflare → taxi-adam → Branch control → Production branch → `Taxi-Knurow-V3` (or `Taxi-Knurow-Full` with chat) → redeploy.
Then open `https://www.taxiknurowadam.pl/api/admin/setup?key=<ADMIN_KEY>` once (reconnects the Telegram webhook).
The LITE request log stays in D1 (tables `leads`, …) and is back the next time LITE runs.

## 6. Everyday tasks

| Task | LITE | FULL |
|---|---|---|
| Change a price | Panel → Ceny (with GitHub token) **or** edit `src/prices.json` on branch `Taxi-Knurow-Lite`, push | edit `src/prices.json` on the FULL branch, push |
| Price for one village to one place (e.g. Czerwionka → Pyrzowice 220) | „Wyjątki” in the panel or `overrides` in prices.json | same file |
| Waiting rule (X min free, Y zł/min) | Panel → Oczekiwanie, or `waiting` in prices.json | same |
| Add a village | `src/data.py` → `VILLAGES` (slug, name, „w …”, zone, price) **and** its price in prices.json | same |
| Phone numbers, texts, names | `src/data.py` (BUSINESS, OWNER, BRAND, AREA on the template; BUSINESS + build.py texts on Adam's branches) | same |
| See requests | Panel → Raport / CSV | `/raport` in Telegram, CSV via `/api/admin/report?key=…` |
| New PIN for the owner | `node scripts/panel_pin.mjs 123456` → replace the 3 `PANEL_*` secrets → redeploy | – |
| Price table to confirm with the client | `py scripts/price_table.py` | same |

Every push to the production branch redeploys automatically. A bad `prices.json` stops the build – the old site stays live.

## 7. A new client (from the template)
Follow `docs/NEW-CLIENT.md` on branch `taxi-template`. In short:
1. Copy `taxi-template` (new branch or new repo), decide LITE or FULL.
2. Edit only: `src/data.py` (identity block OWNER/BRAND/AREA + business data), `src/prices.json`, `src/fleet.py`, logos
   (`node scripts/brand_images.mjs "TAXI NAZWA" "MIASTO · OKOLICE"` for placeholders).
3. Run the checks (§9) – `leak_check` must say no data of a previous client.
4. Cloudflare project from Git (LITE: docs/LITE.md, FULL: SETUP.md), secrets, domain, training.
5. DPA (umowa powierzenia) signed before real customer data; one seller entity everywhere.

## 8. Moving a fix between versions
The branches share most files. Fix where the bug is, then copy the commit:
```bash
git switch Taxi-Knurow-Lite && git cherry-pick <commit>      # e.g. a fix made on taxi-template
```
Careful with `src/data.py` / `prices.json` / logos – those hold each version's own data; never cherry-pick data commits into the template.
On the template, texts must stay in config (no names in code) – run `py tests/leak_check.py`.

## 9. Checks (before every push)
```bash
node --test tests/*.test.js     # unit tests (LITE backend on real SQLite)
py tests/schema_check.py        # database migrations
py tests/build_check.py         # LITE vs FULL: no Google calls in LITE, no lost pages
py tests/leak_check.py          # template only: no previous client's data, only the client's phone links
py src/build.py                 # must print OK: … stron   (TAXI_LITE=0 py src/build.py = FULL)
```
Local: `npx wrangler pages dev dist --d1 DB=local` → http://localhost:8788 (LITE secrets in `.dev.vars`).

## 10. Secrets and settings per version (Cloudflare → Variables and Secrets)

| Name | LITE | FULL | What |
|---|---|---|---|
| D1 binding `DB` | ✅ | ✅ | database |
| `LEAD_SALT` | ✅ | – | hashing visitor IPs for the rate limit |
| `PANEL_SLUG`, `PANEL_PIN_SALT`, `PANEL_PIN_HASH` | ✅ | – | owner panel link + PIN |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` | optional | – | price editor |
| `RESEND_API_KEY`, `ALERT_EMAIL`, `ALERT_FROM` | optional | – | e-mail to you on every price change |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_KEY` | – | ✅ | bot + admin |
| `GOOGLE_SERVER_KEY`, `GOOGLE_PLACE_ID` (+ browser key in data.py) | – | ✅ | maps, routes, reviews |
| `CRON_KEY` (+ Worker `taxi-cron`) | – | ✅ | dispatch timers, 23:00 reports |
| `ANTHROPIC_API_KEY`, Workers AI `AI` | – | optional | AI „Nowy kurs”, voice, report questions |
| `TURNSTILE_SECRET`, R2 `PHOTOS` + `PHOTO_SECRET`, `AERODATABOX_KEY` | – | optional | bot protection, photos, flights |

## 11. Documents and files
| Where | What |
|---|---|
| `docs/LITE.md` (Lite / template branch) | LITE setup + owner's panel guide (PL) |
| `SETUP.md` | FULL setup + driver guide (PL) |
| `docs/NEW-CLIENT.md` (template) | new client checklist |
| `Downloads/taxi-adam-demo/` | films, offer PDFs, this guide, `TAXI-ADAM-CONTEXT.md` (for claude.ai) |
| `oferta-online` repo | online offers: Adam's current offer RM/2026/10/002 (LITE), link oferta.kemetpoland.pl/taxi-knurow |

## 12. If something goes wrong
| Problem | Fix |
|---|---|
| Site shows the old FULL version | Branch control still on V3, or the LITE build failed → Deployments → see log; retry |
| Build failed after a price change | Read the log line „BŁĄD w src/prices.json” → fix the value (5–3000 zł) → push. Old site stays live meanwhile |
| Panel says „nie jest jeszcze włączony” | `PANEL_*` secrets missing on the **Production** environment → add → redeploy |
| PIN locked | wait 15 min (5 wrong tries per device, 20 per hour for everyone) |
| Report empty | D1 binding `DB` missing, or nobody tapped yet; check `SELECT COUNT(*) FROM leads` in D1 console |
| Price editor „editor” error | `GITHUB_*` missing or token expired (90 days) → new token → redeploy |
| Want the bot back | §5 |
