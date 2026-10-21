# REQUEST: taxi-template – white-label version of the full taxi system

## Goal
Turn the full Taxi Knurów system (branch `Taxi-Knurow-Full` = production `Taxi-Knurow-V3` + customer↔driver chat)
into a **white-label template** on a new branch **`taxi-template`**, so a new taxi firm can be launched by editing
**one config area** (plus logo/images) and following one setup guide – no code changes.

`Taxi-Knurow-Full` / `Taxi-Knurow-V3` stay Adam's (Taxi Knurów Adam Mączka) and are not changed.

## Model
- White-label, NOT multi-tenant: one copy (fork/branch) + one Cloudflare account per client. The client pays their own
  running costs (Cloudflare free, Google Maps, AI optional).

## Requirements
1. **One business config** (e.g. `src/data.py` / `src/business.py` + `src/fleet.py`): name, short brand, owner name
   with Polish forms (nominative/genitive/dative – "Adam / Adama / Adamowi"), base towns with Polish forms
   (nominative/genitive/locative – "Knurów / Knurowa / w Knurowie"), region, phones, addresses, Google Place IDs,
   domain, villages + zones, destinations + prices, tariff, night rule, commission, colours/logo, feature switches.
2. Remove every hard-coded "Adam", "Mączka", "Taxi Adam", "Knurów", "Gierałtowice", "Śląsk", example addresses,
   phone numbers from: website copy (`src/build.py`), bot texts (`functions/api/telegram.js`, `server/*.js`),
   AI prompts (`server/ai.js`, `server/ask.js`), chat labels, manifest, footer credit, privacy policy.
   Generated `server/config.js` carries the values to the server.
3. **Feature switches** in config: chat, AI, auto-assign, flight watch, Google sign-in, photos, Turnstile, English page.
4. Template ships with neutral **example data** ("Taxi Przykład", fictional town, fictional numbers) that builds and
   passes all tests, plus Adam's real config kept as an example file (e.g. `examples/taxi-knurow/`) to show a real client.
5. **Clear instructions for all parties** (Polish where the reader is Polish):
   - `docs/NEW-CLIENT.md` – for me (seller/integrator): checklist from signed contract to live site (fork, config,
     Cloudflare, Telegram, Google, domain, handover), what the client must give me, time estimate.
   - Owner guide (PL) – the taxi owner: dispatching, reports, settlement, adding drivers/cars.
   - Driver guide (PL) – one page: shift, buttons, payments.
   - Customer help (PL) – on the site: how to book, status, install the app.
   - README + SETUP updated for the template.
6. Tests: all existing unit/e2e tests pass against the example config; add a test that the built site and server
   config contain none of Adam's data (name, phones, Place IDs) when the example config is used.
7. Nothing changes for Adam's production.

## Out of scope
Multi-tenant hosting, sign-up, billing.
