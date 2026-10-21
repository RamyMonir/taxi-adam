# RESEARCH: taxi-template – white-label version of the full taxi system

Date: 21.10.2026 · Request: `rpi/taxi-template/REQUEST.md`

**Scores:** Product Viability **Medium** · Technical Feasibility **High** · Overall **Medium-High** · Complexity **Complex (wide, not deep)**

## Executive Summary

**Decision: CONDITIONAL GO (confidence high, ~80%) – for a THIN SLICE only.**

The code can become a template. The pipeline is clean (`src/data.py` + `src/fleet.py` → `src/build.py` →
`dist/` + `server/config.js`). The work is wide, not hard: Adam's name and towns are spread over ~10 server files,
the bot, AI prompts and ~100 places in `build.py`. The product case is weaker. There is no second buyer yet. Adam's
case shows that 1–2 car firms buy Google visibility, not dispatch (cap ~3 000 zł + 600 zł/month).

**Sequencing change – for you to decide:** you asked for the template first, then Lite. We recommend the opposite:

1. **Lite for Adam first** – prototype promised by end of week (Fri 23.10 – Sun 25.10). It is the only revenue in
   sight (3 000 zł + 600 zł/month).
2. **Template thin slice next week**, time-boxed to **5 working days**.

## Feature Overview

A new branch `taxi-template` built from `Taxi-Knurow-Full`. A new taxi firm is launched by editing one config area
plus logo/images and following one setup guide. Model: white-label, one fork + one Cloudflare account per client,
client pays running costs. Not multi-tenant. `Taxi-Knurow-V3` (production) and `Taxi-Knurow-Full` stay untouched.

## Requirements Summary

| # | Requirement (REQUEST.md) | Thin slice | Deferred |
|---|---|---|---|
| 1 | One business config with Polish forms | Yes: BRAND, OWNER, BASE_TOWNS, FEATURES, AIRPORTS | Colours cleanup |
| 2 | Remove hard-coded Adam/Knurów/phones | Yes, plus leak test | – |
| 3 | 8 feature switches | 2 switches: AI, chat | Other 6 |
| 4 | Neutral example + Adam's config as example | "Taxi Przykład" only | Adam's config only with his written consent |
| 5 | Guides for all parties | `docs/NEW-CLIENT.md` | Owner, driver, customer guides |
| 6 | Tests pass on example; no-Adam test | Yes, plus golden test | – |
| 7 | Nothing changes for Adam | Yes | – |

## Product Analysis

**Value for you:** a neutral sales demo, and repeatable launches in days instead of a rewrite.
**Value for a taxi firm:** own brand, direct bookings, no 20–25% platform commission, low running cost.

**Market.** The real competitors are radio dispatch and dispatch software (TaxiCaller/Autocab-type tools, local
Polish vendors), not Bolt or Uber. Best fit: **5–15 car firms in small Silesian towns**.

**Weak points.** No native driver app. Telegram is less common than WhatsApp among older drivers. One-person
support is a risk.

**Adam's lesson.** Very small firms (1–2 cars) pay for Google visibility, not dispatch. That is the Lite product,
not this template.

**Risks.**
- Copy drift between Adam's branch and the template.
- Support load grows with every client.
- Client-owned Cloudflare/Google accounts: lost logins, Google Maps bills (set spending caps, keep admin access).
- GDPR: the client is the controller, you are the processor – a processor agreement is needed.
- Building ahead of demand.
- Polish grammar errors in generated text (wrong case forms).

**Pricing.** Rethink before selling: ~4–6k zł setup + monthly fee per car, with tiers.

## Technical Discovery

Verified in code:

- **Config:** `server/config.js` (keys `phone`, `seats`, `waitMin`, `googleClientId`, `night`, `places`, `base`,
  `center`, `center2`/`center2Km`, `commission`, `fleet`, `zoneKm`, `surcharge`, `tariff`, `destinations`) is
  imported by ~10 server files, ~6 functions, 2 tests. ~30 env vars.
- **Deploy:** `cron-worker/wrangler.toml` hard-codes `SITE_URL` `taxi-adam.pages.dev`.
  `.github/workflows/deploy.yml` targets GitHub Pages (legacy).
- **`build.py` hard-coding:** 59× Knur\*, 43× Gierałt\*, 10× Adam, 7× Mączka. Places: logo text, `dest_copy`, hubs,
  village pages, cennik, home FAQ, VIP "Śląsk", FLEET cards, SERVICES, CHIPS, `DEST['lotnisko-pyrzowice']` (~8×),
  English page `air[0]`/`air[1]`, `VILLAGES[0]` = base town, `_redirects` taxifest.pl, Kemet credit, manifest
  "Taxi Adam", `#0A1430`.
- **SEO copy:** ~70% generic with "z Knurowa i Gierałtowic" (~40×); ~30% names real regional places.
- **Browser:** `app.js` – "Adam wiezie innego pasażera", "do Taxi Adam".
- **Bot/server:** `telegram.js` (31× Adam, "Rynek 1 Knurów" examples), `botfleet.js`, `auto.js:52`,
  `settle.js:61-62`, `chat.js:40`, `phone.js` SMS "Tu Taxi Knurów Adam", `report.js` owner fallback,
  `fleet.js:52` seeds owner 'Adam', `admin/setup.js` probe "Dworcowa Knurów".
- **AI prompts:** `ai.js:35,41`, `ask.js:53`.
- **Pricing** (`server/pricing.js`): one centre + optional second, fixed zones 0/A/B – fine for 1–2 base towns.
- **Switches today:** already optional via env – AI, Turnstile, OAuth, photos, flights, maps, cron. Always on –
  chat, `/en/`, VIP, FLEET cards, SERVICES.
- **Tests:** 50 node tests + `schema_check.py`; brand asserts in `chat.test.js:42`, `settle.test.js:14,21`,
  `report.test.js:42,61`; 6 e2e suites (`dispatch.mjs` uses `fleet.py` names, `run.mjs` regex
  "Do oddania Adamowi").
- **Images:** `src/assets/img/` logo-emblem, logo-wide, logo.webp, favicon, icons, og.png.

## Technical Analysis

**Feasibility: High.** Effort: thin slice **4–6 days**; guides + other switches **+3–4 days** (deferred); moving
Adam onto the template later **~1 day**.

**Approach.** Add BRAND / OWNER (nom/gen/dat: Adam/Adama/Adamowi) / BASE_TOWNS (nom/gen/loc:
Knurów/Knurowa/w Knurowie, centre, radius) / FEATURES / AIRPORTS to `src/data.py`. Generate them into
`server/config.js` and `window.TAXI`. Add a small `server/brand.js` (`brand()`, `owner('dat')`, `town(0,'gen')`,
`t(tpl, vars)`) and a Python `fmt()` in `build.py`. Region-specific copy becomes data lists (empty list = section
hidden). A **golden test** proves that Adam's config still builds today's `Taxi-Knurow-Full` `dist/` +
`server/config.js` (whitelisted diffs), so Adam's branch can later become "template + Adam's config". This solves
drift.

**Alternatives rejected.** Search-and-replace fork per client (drift, grammar errors). Jinja/i18n JSON rewrite
(overkill now). Multi-tenant (out of scope).

**Commit sequence (12).**
1. Config blocks with Adam's values, output unchanged.
2. `brand.js` + tests.
3. Bot/server strings.
4. AI prompts.
5. `app.js`, manifest, theme colour, credit, `_redirects`.
6. `build.py` generic copy templates.
7. `build.py` region lists, AIRPORTS, FLEET_CARDS, SERVICES, VILLAGES not base-first.
8. Tests read config.
9. Golden test.
10. Neutral example data (Adam's config only with consent).
11. Leak test (Adam, Mączka, Knur, Gierałt, phones, Place IDs, OAuth client ID, taxiknurowadam, logo/og images).
12. cron-worker `SITE_URL` + `docs/NEW-CLIENT.md`.

**Risks and mitigations.**

| Risk | Mitigation |
|---|---|
| Wrong Polish forms | Explicit forms in config; build fails on empty form; eyeball pages |
| e2e fixtures break | Separate commit |
| Adam data leaks | CI leak test, images included |
| Server/browser config drift | One Python dict + key-match test |
| Golden diff not exact | Whitelist of allowed diffs |
| ~198 hex colours outside CSS vars | Deferred |

## Strategic Recommendation

Do the **thin slice**, but **after Lite for Adam**. Conditions:

1. Adam's branches (`Taxi-Knurow-V3`, `Taxi-Knurow-Full`) stay untouched.
2. The golden test passes before the refactor merges.
3. Adam's real config does **not** go into `examples/` without his written consent – use an anonymous example, the
   same rule as the Kemet case study.
4. Stop at day 5 and ship what is green.
5. Rethink full-system pricing (~4–6k zł setup + monthly per car, tiers) before selling.

**Thin slice includes:** config blocks, `brand.js` + `fmt()`, data-driven region copy, golden test, Adam-data
removal + leak test, "Taxi Przykład" example, `docs/NEW-CLIENT.md` (incl. GDPR processor agreement and
client-owned accounts), 2 switches (AI, chat).
**Deferred until a buyer:** owner/driver/customer guides, the other 6 switches, English page work, CSS hex cleanup.

## Next Steps

1. **You decide the order** (recommended: Lite first).
2. Lite: run `/rpi:research taxi-lite` (request exists at `rpi/taxi-lite/REQUEST.md`).
3. Template, when it is time: run `/rpi:plan taxi-template`.
4. Ask Adam whether his config may be shown as an example (written consent).
