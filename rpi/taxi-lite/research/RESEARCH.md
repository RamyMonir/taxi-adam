# RESEARCH: taxi-lite – low-cost site for Taxi Knurów Adam Mączka (1–2 cars)

Date: 21.10.2026 · Request: `rpi/taxi-lite/REQUEST.md` · Base: `origin/Taxi-Knurow-V3`

**Scores:** Product Viability **Medium** (High for the MVP slice, Low if everything is given for 3 000 + 600 zł without a signed order) · Technical Feasibility **High (8/10)** · Overall **Medium-High** · Complexity **Medium**

## Executive Summary

**Decision: CONDITIONAL GO (confidence ~80%).** The risk is the deal, not the build.

Your scope decisions stand: full-detail request log, panel with secret link + PIN, price editor via GitHub, fine
print + waiting rule. Research only changes the **order** and the **gating**:

1. **Friday 23.10 – prototype (show, don't sell).** Preview URL with TEST data only: lite template, `/api/lead`,
   API lock-down middleware, privacy page, `prices.json` refactor.
2. **Sunday / early next week – panel** (PIN login, report, CSV, mark przyjęty / nie przyjęty).
3. **Next week, after Adam signs – price editor** (GitHub commit). It is the riskiest part and Adam will use it
   1–3 times a year.

Effort ~30 h total, **hard stop at 30 h**; anything more is billed or deferred.

## Feature Overview

Branch `Taxi-Knurow-Lite` from `Taxi-Knurow-V3`, PR into `Taxi-Knurow-Lite-review`. Same build (`src/data.py` →
`src/build.py` → `dist/`), switched by a `LITE_MODE` flag. The customer fills a short form and taps WhatsApp / SMS /
Call; the message is pre-filled; the driver confirms. No Maps API, no AI, no Telegram, no calculator, no accounts,
no chat. Each tap also sends a small record to D1, which Adam sees in `/panel/`. Prices move to `src/prices.json`
so the panel can edit them later.

## Requirements Summary

| # | Requirement | Friday | Later |
|---|---|---|---|
| 1 | Booking form + WhatsApp / SMS / Call, night rule, "Cenę potwierdza kierowca" | Yes | – |
| 2 | Request log `/api/lead` (fire-and-forget) | Yes (TEST data) | Real data after DPA |
| 3 | Panel: secret link + PIN, report, CSV, mark status | – | Sun / early next week |
| 4 | Price editor → GitHub commit → auto deploy | `prices.json` refactor only | After signed order |
| 5 | Fine print + waiting rule (X/Y from editor) | Yes (placeholder X/Y) | – |
| 6 | Texts: new lead, 3 steps, groups to 9, VIP fix, footer | Yes | – |
| 7 | Retention + privacy policy | Privacy page | Retention job with panel |
| 8 | No SEO regressions, WhatsApp button above fold at 390 px, tests | Yes | – |

## Product Analysis

**What Adam will really use:** the buttons and his Google listings. Maybe a monthly summary. The editor rarely
(prices change 1–3× a year). "Driver confirms" already happens in WhatsApp today. **Over-building risk is high.**

**Report honesty.** The log counts taps, not rides. Calls that bypass the site are not counted. Labels must say
"kliknięcia / zapytania rozpoczęte" (tap ≠ sent message ≠ ride).

**Red flags.**
- Free extras after Adam already declined the full deal.
- Inconsistent seller entity (footer vs offer vs invoice).
- Prices shown as "od" must match what the driver confirms, or trust drops.

**Google listings (his top priority).** Do not create new listings. Audit the 3 existing ones against Google rules
for service-area businesses; if they are really one business, merge. A suspension would kill the main value.

## Technical Discovery

**Build (`src/build.py`, 730 lines).** `book()` at 309 renders `BOOK` (214–276), used by every page meter (home,
destinations, hubs, villages, rezerwacja, kontakt inline 613, en). `BASE` 134–212: acct-top 161, ride-banner 165,
Kemet credit 182, `window.TAXI` 210, `app.js` 211. `client_config` 48–55; `write_server_config` 63–73; STEPS 411–413;
reviews 419; VIP 443 (texts 444 "tabliczką", 459 "artystów"; dla-firm 599 "z kartką z nazwiskiem"); fleet 464;
privacy 617–642; `/przejazd/` 663–684; `/konto/` 687–705; sitemap 710; manifest 715; `sw.js` 722; `_redirects`
729. `org()` has hardcoded priceRange "15–900 zł" at 322.

**Texts to change:** home lead 497 "kierowcę widzisz na żywo"; `T_BOOK.sub` 279/290; calculator mentions
99/490/491/521/579; rezerwacja 585/589; "online" 509/612; manifest 716.

**Prices.** No per-village override today: price = `d.price` + zone surcharge (village price at 554–563).

**`app.js` parts to reuse in `lite.js`:** helpers 96–104, menu/theme 119–133, reveal 134–143, install 987–1023,
lightbox 1025–1035, review link 1037–1044, SW 1105, `message()`/`fallback()` 672–686 (iOS uses "&" as SMS body
separator).

**Server reusables:** `util.js` (json, bad, randomId, sha, esc, nowWarsaw, safeEqual), `ratelimit.js` `hit()`,
`guard.js` `fromOurSite()`, lazy `CREATE TABLE` pattern, `auth.js` session cookie, `report.js` `toCsv`. No
`functions/_middleware.js` yet.

**Tests.** `node --test` ESM; `fakeDb` in `security.test.js`; `schema_check.py` runs migrations.

**Deploy.** Cloudflare Pages Git integration (pip jinja2 + `build.py`, output `dist`, root `functions/`
auto-deployed, D1 binding). No root `wrangler.toml`. Legacy GitHub Pages workflow on `main`. No GitHub API usage
yet. **Production D1 is shared with the full system → only new tables** (`leads`, `panel_sessions`,
`price_changes`). Migration number **0005** (0004 is taken by the chat branch).

## Technical Analysis

**Friday slice.**
1. `LITE_MODE` flag in `data.py` + `BOOK_LITE` template + ~250-line `lite.js`. Content texts, fine print, footer.
   Skip `/przejazd/` and `/konto/`; update sitemap, `sw.js` cache name, manifest `start_url`.
2. `/api/lead` via `navigator.sendBeacon` (never blocks the tap). `0005_leads.sql`, `fromOurSite()`, size and field
   limits, honeypot, `hit()` rate limit, **always 204**.
3. `functions/_middleware.js`: when env `LITE_MODE=1`, every other `/api/*` returns 404. Nothing is deleted.
   Privacy page.
4. `prices.json` refactor with an identical-output test and validation in `build.py`.

**Panel.** `/panel/<PANEL_SLUG>/`. PIN checked with PBKDF2-SHA256 (WebCrypto; env `PANEL_PIN_HASH` +
`PANEL_PIN_SALT`; `safeEqual`). Lockout 5 fails / IP / 15 min + global 20 / h. Session cookie `randomId(40)`, only
its sha stored in `panel_sessions`, HttpOnly Secure SameSite=Strict, 12 h. Report: counts by channel, top 10
destinations / pickups, list, CSV (`toCsv`: semicolon, BOM), mark przyjęty / nie przyjęty.

**Price editor.** `src/prices.json` = `{version, zones, local, destinations, overrides{village:{dest:price}},
waiting{free_min, per_min}, from_prices}`. `data.py` loads it and patches ZONES / VILLAGES / DESTINATIONS; village
price (554–563) checks overrides first. Shared validation in the Function **and** `build.py`: integers 5–2000 zł,
known slugs, waiting 0–60, file < 50 KB. If the build fails, Cloudflare keeps the old deploy live. Commit flow:
GitHub Contents API GET sha + PUT; 409/422 → "zmieniono w międzyczasie, odśwież". Commit message lists changes
(e.g. "Ceny: Czerwionka→Pyrzowice 200→220"). Branch from env `GITHUB_BRANCH`. Build writes `dist/version.json`
`{commit: CF_PAGES_COMMIT_SHA, prices_version}`; the panel polls every 10 s up to 5 min → "wdrożono" / "build
nieudany". History in D1 `price_changes` + git log. **Disable or `paths-ignore` the legacy
`.github/workflows/deploy.yml`** (GitHub Pages on `main`), because commits to `main` trigger it.

**Editor security model.**
- Fine-grained PAT: 1 repo, Contents read/write, 90-day expiry, stored as a Pages secret, never sent to the browser.
- The PIN unlocks a session, not the token; the Function holds the token.
- E-mail alert to Ramy on every commit (Resend, already used in oferta-online).
- Bad data cannot go live: validation twice, failed build = old site stays.

**`LITE_MODE` rollback.**
1. Cloudflare Pages → Settings → Environment variables → delete `LITE_MODE`.
2. Retry the last deployment (or push any commit).
3. Full V3 APIs are back; the lite tables stay in D1 and do no harm. Flag is off by default.

**Data stored and retention.** Name, phone, pickup, destination, time, passengers, channel, page, date. Avoid
free-text medical notes (short notes field, warning text). Retention: **CTO recommends 90 days; request says 12
months – you decide.** If the DPA slips, one flag makes the log anonymous (no name / phone).

**Effort (~30 h).** Lite template 6 · lead 3 · panel auth 3 · report 4 · `prices.json` 4 · editor 6 ·
middleware / privacy / QA 4.

**Risks**

| Risk | Mitigation |
|---|---|
| Building for free again | Gating; editor only after signed order; 30 h stop |
| GitHub token leak | Scoped, expiring, server-side only, commit alert |
| GDPR / sensitive trips (clinics, sanatoria) | Minimal fields, short retention, DPA, anonymous fallback |
| Google listing suspension | Audit / merge, no new listings |
| Friday deadline | Editor deferred |
| Report read as rides | "kliknięcia / zapytania rozpoczęte" labels |
| SEO regressions | Script comparing URL list, titles, JSON-LD between V3 and lite `dist` |
| V3 tests break | `LITE_MODE` off by default; run tests with both flag values |

## Strategic Recommendation

Build the Friday prototype as a **demo**, not a delivery. Gate the rest:

- **Written order before production:** 2 500–3 000 zł one-off + 600 zł / month (e.g. Google care 400 + site
  upkeep 200, incl. 2 price/text changes a month and a monthly summary), minimum 6 months, exact list of what is
  included, no free extras.
- **One seller entity everywhere** (footer, offer, invoice, DPA): Usługi IT RAMY MOHAMED **or** Kemet. Kemet is not
  VAT-registered – check with the accountant first.
- **GDPR roles:** privacy page names Adam as controller and your entity as processor. Short DPA (umowa
  powierzenia) signed before real data.
- **Move hosting, domain, D1 and repo** off your personal demo accounts before the first payment.
- **Google:** audit the 3 listings; no new ones.

These are recommendations; you decide each one.

## Next Steps

1. You confirm the gating (Friday scope = lite template, lead, middleware, privacy, `prices.json`).
2. You choose retention: 90 days or 12 months.
3. Run `/rpi:plan taxi-lite`.
4. In parallel: draft the order + DPA, pick the seller entity, start the Google listings audit.
