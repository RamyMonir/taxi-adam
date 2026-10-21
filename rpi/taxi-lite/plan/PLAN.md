# taxi-lite – Implementation plan

Branch `Taxi-Knurow-Lite` (from `origin/Taxi-Knurow-V3`). Every commit: `node --test tests/*.test.js`, `py tests/schema_check.py`,
`py src/build.py` green. Small commits. Push → PR into `Taxi-Knurow-Lite-review` (preview). Never push V3/main.
Budget ~30 h, hard stop. Details: [eng.md](eng.md), [ux.md](ux.md), [pm.md](pm.md).

## Phase 1 – Prices in one file (Fri) · ~4 h
| # | Task | Cx | Dep |
|---|---|---|---|
| 1.1 | `tests/build_check.py`: hash every file in dist/ (V3 data) → baseline | L | – |
| 1.2 | `src/prices.json` with today's values; data.py loads + validates + patches ZONES/VILLAGES/DESTINATIONS/TARIFF; `OVERRIDES`, `WAITING` | M | 1.1 |
| 1.3 | `route_price()` helper in build.py (village pages, priceRange from data) → build byte-identical to baseline | M | 1.2 |
| 1.4 | Add overrides Czerwionka/Ornontowice → Pyrzowice 220 (own commit) | L | 1.3 |
| 1.5 | `scripts/price_table.py`: village × 6 airports "od" table (markdown) for Adam | L | 1.3 |
**Done when:** identical output test passes before 1.4; price table printed; all tests green.

## Phase 2 – Lite site + booking (Fri) · ~7 h
| # | Task | Cx | Dep |
|---|---|---|---|
| 2.1 | `LITE_MODE` flag in data.py → `lite` in server/config.js and client config; BASE: no account/ride banner, load lite.js | L | 1 |
| 2.2 | `src/assets/lite-msg.js` (pure: buildMessage, waLink, smsLink, isNight, validate) + `tests/lite-msg.test.js` | M | – |
| 2.3 | `BOOK_LITE` template + `T_BOOK_LITE` (pl/en): fields, chips, Tu jestem, 3 buttons, "lub 515 650 750", price line, fine print, waiting line | M | 2.1 |
| 2.4 | `src/assets/lite.js`: reuse V3 helpers/menu/reveal/install/lightbox/review link/SW; booking wiring, geolocation, night switch, inline errors, return banner, remember name/phone | M | 2.2, 2.3 |
| 2.5 | CSS for lite box (inside existing style.css, same look); WhatsApp above fold at 390 px | M | 2.3 |
| 2.6 | Content changes behind the flag: lead text, STEPS, rezerwacja, calculator/online mentions, group up to 9, FAQ extra fees + waiting, VIP TODOs, footer credit | M | 2.1 |
| 2.7 | Static reviews block; drop /przejazd/ + /konto/ (sitemap, `_redirects`), sw.js `taxi-lite-1`, manifest | L | 2.1 |
| 2.8 | Privacy page lite version (controller Adam, processor Usługi IT RAMY MOHAMED, Cloudflare, 12 months, geolocation on tap) | L | 2.1 |
**Done when:** lite build passes; `build_check.py` lite asserts (no Google/Turnstile/OAuth, only /api/lead|/api/panel, URL list = V3 minus 2 noindex pages); message tests green; screenshots mobile + desktop.

## Phase 3 – Request logging (Fri) · ~3 h
| # | Task | Cx | Dep |
|---|---|---|---|
| 3.1 | `migrations/0005_lite.sql` (leads, panel_sessions, price_changes) + schema_check.py applies it | L | – |
| 3.2 | `server/leads.js` (validate, insert, retention) + `functions/api/lead.js` (origin, size, honeypot, rate limit, 204) + `tests/lead.test.js` | M | 3.1 |
| 3.3 | `functions/_middleware.js` lite guard (404 other /api/*) + test | L | 2.1 |
| 3.4 | lite.js: sendBeacon on tap (keepalive fallback) | L | 2.4, 3.2 |
| 3.5 | Push, PR → `Taxi-Knurow-Lite-review`; user sets Preview D1 = `taxi-lite-test` + `LEAD_SALT`; test on phone | L | all |
**Done when:** a tap on preview creates a row in the test DB; WhatsApp opens instantly; all tests green.
**➡ Friday prototype for Adam** (preview link, test data).

## Phase 4 – Panel + report (Sun / early next week) · ~7 h
| # | Task | Cx | Dep |
|---|---|---|---|
| 4.1 | `scripts/panel_pin.mjs` (makes slug, salt, hash for a given PIN) | L | – |
| 4.2 | `server/panel.js`: PBKDF2 verify, lockouts, sessions; `functions/api/panel/[[path]].js` router (login/logout) + tests | M | 3.1 |
| 4.3 | Report + CSV + status endpoints (Warsaw day bounds, CSV injection guard) + tests | M | 4.2 |
| 4.4 | `/panel/` page (build.py, noindex, not in sitemap) + `panel.js`: PIN screen, Raport tab, list, status buttons, CSV, logout | M | 4.3 |
| 4.5 | User sets PANEL_* secrets on preview; test on phone | L | 4.4 |
**Done when:** PIN login with lockout works; report numbers match test rows; CSV opens in Excel with Polish characters.

## Phase 5 – Price editor (after Adam signs) · ~6 h
| # | Task | Cx | Dep |
|---|---|---|---|
| 5.1 | `src/prices.schema.json` + `server/prices.js` (validate, diff summary) + tests; build.py uses the same rules | M | 1 |
| 5.2 | `server/github.js` (GET sha, PUT, conflict) + mocked-fetch tests | M | – |
| 5.3 | Endpoints prices GET/POST + history + Resend alert | M | 4.2, 5.1, 5.2 |
| 5.4 | Build writes `dist/version.json`; panel "Ceny" tab: edit, highlight, preview diff, Zatwierdź, status polling, history | M | 5.3 |
| 5.5 | Legacy GitHub Pages workflow: paths-ignore/disable; user creates fine-grained token + RESEND secrets | L | 5.3 |
**Done when:** a price change in the panel produces one commit, the preview rebuilds and shows "Wdrożono"; an invalid value is refused; a conflict is reported.

## Parallel work
2.2 (message builder) and 3.1/3.2 (lead API) don't depend on the templates and can be done alongside 2.3–2.6.
5.1/5.2 are independent of the panel UI.

## Validation checkpoints
1. After Phase 1: identical-output proof.
2. After Phase 3: Friday demo – screenshots + WhatsApp message example + files changed list sent to the user.
3. After Phase 4: report demo with test rows.
4. Before production (user): DPA signed, order signed, hosting moved off personal accounts, production D1 binding, secrets, merge by user.

## Things for the user to do (never typed by Claude)
Preview D1 binding (test DB) + `LEAD_SALT` (Phase 3) · `PANEL_*` secrets (Phase 4) · GitHub token, `GITHUB_*`, `RESEND_API_KEY`, `ALERT_EMAIL` (Phase 5) · confirm prices with Adam using `scripts/price_table.py` output.
