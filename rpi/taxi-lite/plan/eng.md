# taxi-lite – Technical specification

Base: branch `Taxi-Knurow-Lite` from `origin/Taxi-Knurow-V3`. PRs into `Taxi-Knurow-Lite-review` (Cloudflare preview).
Nothing in V3 is deleted; the full system comes back by switching one flag.

## 1. Architecture
```
src/prices.json ──► src/data.py (load + validate + patch) ──► src/build.py ──► dist/ (static pages, lite.js, version.json)
                                         LITE_MODE ───────────────┘        └──► server/config.js  (CONFIG.lite, prices)
Browser (lite.js) ── tap ──► wa.me / sms: / tel:   (synchronous link, never blocked)
                   └─ sendBeacon ──► POST /api/lead ──► D1 leads
Adam ──► /panel/<slug>/ (static page) ──► /api/panel/* (PIN session) ──► D1 leads / price_changes
                                                       └─ prices ──► GitHub Contents API ──► commit ──► Cloudflare Pages rebuild
functions/_middleware.js: if CONFIG.lite → 404 for every /api/* except /api/lead and /api/panel/*
```

## 2. Switch and rollback
- `src/data.py`: `LITE_MODE = True` (default `False` on V3, `True` on the Lite branch). The build writes `lite: true/false`
  into `server/config.js`. One source of truth; no env var needed.
- Rollback to the full system: set `LITE_MODE = False`, push. The middleware stops blocking, app.js/BOOK come back.
- Emergency: Cloudflare → Deployments → "Rollback to this deployment" (previous build).

## 3. Prices file (`src/prices.json`)
```json
{
  "version": 1,
  "zones": {"0": 0, "A": 10, "B": 20},
  "local": {"knurow": 15, "gieraltowice": 15, "beksza": 30, "...": 0},
  "village_zone": {"beksza": "A", "...": "B"},
  "destinations": {"lotnisko-pyrzowice": {"price": 170, "confirmed": true}, "...": {}},
  "overrides": {"czerwionka": {"lotnisko-pyrzowice": 220}, "ornontowice": {"lotnisko-pyrzowice": 220}},
  "waiting": {"free_min": null, "per_min": null},
  "tariff": {"start": 9, "per_km": 3.0, "min": 15}
}
```
- `data.py` loads it, validates (see §7) and patches `ZONES`, `VILLAGES` (zone + local price), `DESTINATIONS` (price,
  confirmed), `TARIFF`; exposes `OVERRIDES`, `WAITING`. Names, slugs, copy, coordinates stay in `data.py`.
- New helper in build.py: `route_price(village_slug, dest)` = override if set, else `dest.price + zone surcharge`.
  Used at village pages (V3 build.py 554/557/563) and `zone_table` notes. `org()` priceRange computed from min/max prices.
- Step 1 of the refactor writes the file with today's values → **build output must be byte-identical** (test).
- Initial overrides Czerwionka/Ornontowice → Pyrzowice 220 are added in a separate commit (visible diff).
- `scripts/price_table.py` prints village × 6 airports "od" prices (for Adam to confirm) – also used by the panel preview logic.

## 4. Lite booking (static)
- `build.py`: `book()` renders `BOOK_LITE` when `LITE_MODE`; callers unchanged. Texts in `T_BOOK_LITE` (pl/en).
- BASE when lite: no `acct-top`, no `ride-banner`, load `/assets/lite.js` (not app.js), `window.TAXI` = small config:
  `{lang, wa, tel, telLabel, tel2Label, night, chips:[labels], waiting, site}` – no keys, no place IDs, no OAuth id.
- Pages `/przejazd/` and `/konto/` not generated; removed from sitemap; `_redirects`: `/przejazd/* /rezerwacja/ 302`, `/konto/* / 302`.
- `sw.js`: cache name `taxi-lite-1`, CORE without dynamic pages, never caches `/api/` or `/panel/`.
- Manifest: start_url `/?app=1`, description without "status na żywo".
- `src/assets/lite.js` (~250 lines, no dependencies): helpers, menu/theme, reveal, install prompt, lightbox, random review
  link (copied from app.js V3 lines 96-104, 119-143, 987-1044, 1105) + new booking module:
  - `buildMessage(fields, opts)` – **pure, exported for tests** (UMD-style: `if (typeof module) module.exports`, or a
    separate `src/assets/lite-msg.js` imported by both the page and node tests). Returns plain text.
  - `waLink(msg)`, `smsLink(msg, ua)` (`sms:+48570762777?body=` Android, `&body=` iOS), `telLink()`.
  - `isNight(date, NIGHT)`, `validate(fields, now)` – pure, tested.
  - On tap: validate → set `href` → `navigator.sendBeacon('/api/lead', JSON)` (fallback `fetch(..., {keepalive:true})`), let the link open.
  - Geolocation: `navigator.geolocation.getCurrentPosition` only on "Tu jestem"; stores lat/lng rounded to 5 decimals.
- Reviews: `reviews_block()` lite variant: static `B.rating`/`B.reviews`, 3 listings with "Opinie" / "Oceń ★" links, no fetch.
- Content changes (build.py): home lead 497, STEPS 411-413, rezerwacja 585/589, calculator mentions 99/490/491/521/579,
  "online" 509/612, VIP 444/459 + dla-firm 599 (TODO comments), footer credit 182 → "Strona: Usługi IT RAMY MOHAMED",
  T_BOOK sub, FAQ group-of-9 + extra fees + waiting rule, privacy page lite version (617-642).
  All changes guarded by `LITE_MODE` (V3 text stays when False).

## 5. API
All responses JSON, no CORS (same origin). IP hash = `sha(cf-connecting-ip + env.LEAD_SALT)`.

### POST /api/lead  (public)
Body (≤ 4 KB): `{channel:"wa"|"sms"|"tel", mode:"now"|"later", when:"2026-10-24T04:30"|null, from, to, pax, luggage,
name, phone, notes, geo:{lat,lng}|null, page, website(honeypot)}`.
Checks: `fromOurSite()`, size, field caps (from/to 160, name 60, phone 30, notes 300, page 120), channel enum, pax 1–9,
honeypot empty, `hit(env,'lead',ip,{limit:20, windowS:3600})`. Always **204** (spam silently dropped).
Retention: on ~1 in 50 inserts `DELETE FROM leads WHERE ts < now − 365 days`; the panel login runs it too.
`DB` missing → 204 and console.log (never break the tap).

### Panel (Phase 4) – `functions/api/panel/[[path]].js`, router inside
| Method + path | Auth | Purpose |
|---|---|---|
| POST /api/panel/login `{slug, pin}` | – | slug must equal `env.PANEL_SLUG` (safeEqual) else 404; PIN → PBKDF2-SHA256 (100 000 iters, `env.PANEL_PIN_SALT`) vs `env.PANEL_PIN_HASH` (safeEqual). Limits: 5 fails/IP/15 min, 20 fails/hour global (scope `panel-all`). OK → cookie `ps=<randomId(40)>; HttpOnly; Secure; SameSite=Strict; Path=/api/panel; Max-Age=43200`, store sha in `panel_sessions` |
| POST /api/panel/logout | session | delete session |
| GET /api/panel/report?from=YYYY-MM-DD&to=YYYY-MM-DD | session | `{total, byChannel, topTo[10], topFrom[10], items[≤200, newest first]}` (Warsaw dates) |
| GET /api/panel/report.csv?from&to | session | CSV via report.js `toCsv` style (semicolon, BOM, CRLF), cells starting with `= + - @` prefixed with `'` |
| POST /api/panel/lead/:id `{status:"ok"|"no"|null}` | session | mark request |
| GET /api/panel/prices (Ph5) | session | current prices.json + its git `sha` (GitHub GET) + village/destination names |
| POST /api/panel/prices `{base_sha, prices}` (Ph5) | session | validate → diff → GitHub PUT → `{commit, summary}` ; 409/422 → `{error:"conflict"}` |
| GET /api/panel/history (Ph5) | session | last 20 `price_changes` |
Errors: 401 `{error:"login"}` (no/expired session), 429 `{error:"locked", retryS}`, 400 `{error:"<field>"}`, 502 `{error:"github"}`.

### Price commit (Phase 5)
- `GET https://api.github.com/repos/{GITHUB_REPO}/contents/src/prices.json?ref={GITHUB_BRANCH}` → content + sha.
- If sha ≠ `base_sha` → conflict. Else `PUT` same path `{message, content: base64(JSON pretty, 2 spaces, sorted keys), sha, branch}`.
- Headers: `Authorization: Bearer ${GITHUB_TOKEN}`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: taxi-panel`.
- Commit message: `Ceny (panel): Czerwionka→Pyrzowice 190→220; Balice 340→350` (max 10 items + "…").
- After success: insert `price_changes`, e-mail Ramy via Resend (`RESEND_API_KEY`, `ALERT_EMAIL`) – failure to e-mail never fails the save.
- Deploy status: build writes `dist/version.json` `{commit: CF_PAGES_COMMIT_SHA, prices_version}`; panel polls
  `/version.json?t=…` every 10 s, max 5 min → "Wdrożono" when `commit` starts with the returned commit sha.
- Legacy `.github/workflows/deploy.yml` (GitHub Pages on `main`): add `paths-ignore: ['src/prices.json']` or disable.

## 6. Database (D1, binding `DB`) – new tables only
`migrations/0005_lite.sql` (0004 is taken by the chat branch) + lazy `CREATE TABLE IF NOT EXISTS` in code:
```sql
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, channel TEXT NOT NULL, mode TEXT, when_at TEXT,
  from_txt TEXT, to_txt TEXT, pax INTEGER, luggage TEXT, name TEXT, phone TEXT, notes TEXT,
  geo TEXT, page TEXT, ip_hash TEXT, status TEXT);
CREATE INDEX IF NOT EXISTS leads_ts ON leads(ts);
CREATE TABLE IF NOT EXISTS panel_sessions (sid_hash TEXT PRIMARY KEY, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS price_changes (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, commit_sha TEXT, summary TEXT, ip_hash TEXT);
```
`tests/schema_check.py` extended to apply 0005 after 0001–0003.

## 7. Validation (shared rules)
`src/prices.schema.json` (JSON Schema draft-07 subset) read by build.py (hand-written checker, no new pip deps) and by
`server/prices.js` (JS checker): known slugs only (from data.py lists, written into server/config.js), integers 5–2000,
zones 0–200, waiting `free_min` 0–60 / `per_min` 0–20 or null, overrides only village→known destination, file < 50 KB.
build.py **fails** on invalid prices → Cloudflare keeps the previous deployment live.

## 8. Middleware
`functions/_middleware.js`: `import { CONFIG }` → if `CONFIG.lite` and path starts with `/api/` and not `/api/lead` /
`/api/panel/` → `404`. Also sets `X-Robots-Tag: noindex` on `/panel/*`.

## 9. Secrets / settings (user enters them; never in code)
| Name | Where | Phase |
|---|---|---|
| D1 binding `DB` → **test DB `taxi-lite-test`** in *Preview* environment | Pages settings | 3 |
| `LEAD_SALT` | secret | 3 |
| `PANEL_SLUG`, `PANEL_PIN_HASH`, `PANEL_PIN_SALT` (generated by `scripts/panel_pin.mjs`) | secrets | 4 |
| `GITHUB_TOKEN` (fine-grained, repo `RamyMonir/taxi-adam`, Contents RW, 90 days), `GITHUB_REPO`, `GITHUB_BRANCH` | secrets/vars | 5 |
| `RESEND_API_KEY`, `ALERT_EMAIL` | secrets | 5 |

## 10. Testing
- Unit (node --test): `lite-msg.test.js` (all fields, empty fields omitted, night note, geo link, Polish chars encoded in
  wa/sms links, iOS vs Android separator, validation messages), `lead.test.js` (fakeDb: valid → insert, honeypot → no
  insert + 204, oversize → 204 no insert, rate limit, missing DB), `panel-auth.test.js` (PBKDF2 known vector, wrong PIN,
  lockout, session expiry, slug mismatch 404), `panel-report.test.js` (grouping, Warsaw day bounds, CSV injection),
  `prices.test.js` (validation, diff summary, override precedence), `price-commit.test.js` (mocked fetch: ok, conflict, 401).
- Build tests (python, `tests/build_check.py`): identical output after refactor (hash of dist with V3 data);
  lite build: no `maps.googleapis`, `accounts.google`, `challenges.cloudflare`, `/api/` except `/api/lead`/`/api/panel`;
  all V3 URLs present except /przejazd/, /konto/; titles and JSON-LD unchanged except removed features.
- Existing 50 tests + schema_check stay green with `LITE_MODE` False and True.
- Manual: screenshots 390×844 + 1280 desktop, WhatsApp/SMS on a real Android and iPhone, panel on phone.

## 11. Risks
| Risk | Mitigation |
|---|---|
| Refactor changes prices/pages unexpectedly | byte-identical build test before any content change |
| Token leak / PIN guessing | token server-side only, 1 repo, Contents only, 90-day expiry; secret slug + PBKDF2 + per-IP and global lockout; e-mail on each commit; revoke in 1 min |
| Bad price commit | validated in panel and build; failed build keeps old site; `git revert` |
| Shared production D1 | only new tables; preview uses separate test DB |
| Spam leads | honeypot, size caps, origin check, rate limit; worst case junk rows |
| Lead beacon blocked (ad-blockers) | link still opens; report undercounts – documented in the panel note |
| SEO regression | URL/title/JSON-LD comparison script |
