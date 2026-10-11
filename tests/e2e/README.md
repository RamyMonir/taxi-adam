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
