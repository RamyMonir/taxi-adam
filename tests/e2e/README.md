# End-to-end check (local, nothing leaves the machine)

Runs the real Pages Functions with a local D1 + R2 (wrangler / Miniflare) against a fake Telegram API, and plays a whole
day: Adam adds cars, two drivers join, both tap the same car at once, a customer books, the nearest driver with a car
accepts, photo with consent, signed photo link, customer cancel vs a late driver tap, duplicate Telegram update,
/raport for Adam and for a driver, end of shift releases the car, cron.

Needs Node.js 22+ and wrangler 4 (`npm i -g wrangler`).

```bash
python3 src/build.py                       # builds dist/
node tests/e2e/fake-tg.mjs &               # fake Telegram on :8999
wrangler pages dev dist --port 8788 --d1 DB=local-taxi --r2 PHOTOS=photos --persist-to /tmp/taxi-e2e \
  --binding TELEGRAM_BOT_TOKEN=123:TEST TELEGRAM_WEBHOOK_SECRET=hooksecret TELEGRAM_CHAT_ID=999 ADMIN_KEY=adminkey \
            CRON_KEY=cronkey PHOTO_SECRET=photosecret TELEGRAM_API_BASE=http://127.0.0.1:8999 MAX_BOOKINGS_PER_HOUR=100 FLEET_FROM_FILE=0 &
node tests/e2e/run.mjs                     # prints ✔ / ✘ per step and the two reports
```
Start with an empty `--persist-to` directory each time.

`FLEET_FROM_FILE=0` turns off the automatic sync with `src/fleet.py`, because this run adds its own cars and drivers.

## Adam as dispatcher (`dispatch.mjs`)

Phone ride → "Kto jedzie?" panel → give it to one driver / send to the free ones / take it himself, "🗂 Kursy w toku",
grouped "👥 Kierowcy" with 🗑, a hand-picked driver saying no, reservations. Uses the cars and drivers from `src/fleet.py`,
so start wrangler on a fresh `--persist-to` **without** `FLEET_FROM_FILE=0`, plus a fake Google for the addresses:

```bash
node tests/e2e/fake-google.mjs &           # fake Places + Routes on :8998
wrangler pages dev dist ... (same bindings, no FLEET_FROM_FILE) GOOGLE_SERVER_KEY=fake \
  PLACES_API_BASE=http://127.0.0.1:8998 ROUTES_API_BASE=http://127.0.0.1:8998 &
node tests/e2e/dispatch.mjs
```

## "➕ Nowy kurs" in plain words + smart "Kto jedzie?" + the board (`smart.mjs`)

Adam writes a ride in his own words (understood by a **fake** Claude API, so no key and no cost), the bot asks for a
missing phone number, a reply corrects the preview, the panel ranks drivers by drive time and shows when a busy one is
free, "🗂 Kursy w toku" groups waiting / in progress / reservations, the old "📋 Kursy teraz" button still works, and
with the Claude API down the one-line format still works. Same setup as `dispatch.mjs`, plus:

```bash
node tests/e2e/fake-anthropic.mjs &        # fake Claude API on :8997
wrangler pages dev dist ... (as for dispatch.mjs) ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:8997 &
node tests/e2e/smart.mjs
```

## Auto-assign + flight watch (`auto.mjs`)

Through the minute timer: a ride left with Adam goes to a driver who just became free, an unassigned reservation goes
to the ⭐ driver, a delayed landing moves the pickup. Same setup as `dispatch.mjs` (its fake Google also fakes AeroDataBox), plus
`AUTO_ASSIGN_MIN=0.01 AUTO_NOW_MIN=0.01 AERODATABOX_KEY=fake AERODATABOX_BASE=http://127.0.0.1:8998`, then `node tests/e2e/auto.mjs`.
Note: website "now" bookings are refused at night (22:00–05:00), so `run.mjs`, `dispatch.mjs` and `smart.mjs` need a daytime run.
