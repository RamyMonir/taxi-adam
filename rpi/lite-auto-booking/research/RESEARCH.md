# Research – Lite Plus automatic booking (WhatsApp + SMS) and owner Telegram report bot

Date: 2026-10-24 · Branch: `lite-plus` · Request: `rpi/lite-auto-booking/REQUEST.md`
Method: phases run inline by one session (no sub-agents) to keep cost low; code facts checked with `git show lite-plus:<path>`.

## Executive summary
**Decision: CONDITIONAL GO · Confidence: Medium-High.** Bookings sent by the server (not from the customer's phone) remove the
price-editing problem, and most building blocks already exist (server price, request log, reports, Telegram helpers, rate limit,
Turnstile). The conditions are outside the code: a Meta (WhatsApp Cloud API) setup on a test number, an SMSAPI.pl account and a new
Telegram bot token for the owner. Because every booking will now cost money (WhatsApp/SMS), the booking endpoint must be protected
(Turnstile + rate limit + daily cap) before going live.

## Feature overview
| | |
|---|---|
| Type | New capability on an existing product variant (Lite Plus) |
| Components | `functions/api/book.js` (new), `server/notify.js` (new: WhatsApp + SMS), `functions/api/owner-bot.js` (new: Telegram webhook), `server/leads.js`, `src/assets/lite.js` / `lite-plus.js`, `functions/_middleware.js`, `src/build.py` (switch + texts) |
| Complexity | Medium (≈ 2–3 dev days incl. tests), plus 2–5 days waiting for Meta approval |

## Requirements summary
Functional: server-side booking with server price + booking number · customer confirmation by WhatsApp template (SMS fallback) ·
owner sees each booking (synced WhatsApp chat and/or Telegram message) · Telegram buttons: Dziś / Tydzień / Miesiąc / Zakres + CSV ·
23:00 daily summary · old WhatsApp/SMS/Call buttons stay as a fallback.
Non-functional: 0 zł and today's behaviour when keys are missing · secrets only in Cloudflare · rate limit + honeypot + Turnstile ·
GDPR retention 12 months · Python 3.8-safe build · tests for message text, price source, fallbacks.

## Product analysis
- **User value: High.** The owner gets complete, unedited bookings with the right price; customers get an instant confirmation with
  a booking number (more trust than "send this message yourself").
- **Fit:** closes the main weakness of Lite (manual, editable messages) without the full dispatch system → a clear upsell step
  between Lite and Full.
- **Concern:** Lite was sold as "0 zł running cost". Each booking now costs ~0.15–0.40 zł (one WhatsApp template or SMS). At
  300 bookings/month ≈ 45–120 zł/month. Must be explained to the client and capped.

## Technical discovery (from the code on `lite-plus`)
- `functions/api/lead.js` + `server/leads.js`: D1 table `leads` (id, ts, channel, mode, when_at, from/to, pax, luggage, name, phone,
  notes, geo, page, ip_hash), 12-month retention, `report(env, period)` and `period()` used by the owner panel → **reuse for Telegram
  reports** (add columns: `price`, `km`, `flight`, `booking_no`, `status`, `sent_via`).
- `functions/api/quote.js` + `server/pricing.js`: server-side route + price → **the booking endpoint calls the same functions**, the
  browser never sends a price.
- `server/rides.js`: `tg()` / `tgFile()` Telegram helpers (bot token from env) → reuse for the owner bot with **its own token**
  (`OWNER_BOT_TOKEN`) so it never collides with the full version's dispatch bot.
- `server/ratelimit.js` (`hit`), `server/guard.js` (`fromOurSite`), `server/turnstile.js` (full version) → reuse for abuse protection.
- `functions/_middleware.js`: Lite blocks every API except a list → add `/api/book` and `/api/owner-bot` to the Lite Plus list.
- Timers: Pages has no cron. Existing pattern: separate `taxi-cron` Worker calling `/api/admin/cron` (not deployed yet for Adam).
  For the 23:00 summary either deploy that Worker (free) or send the summary lazily on the first owner-bot action after 23:00.
- No conflicts found; the full version's `/api/telegram` stays blocked in Lite.

## Technical analysis
**Recommended approach**
1. `POST /api/book` (Turnstile + rate limit + honeypot + daily cap): validate → geocode/quote on the server → save to `leads`
   (new columns) → `notify()` → answer `{bookingNo}`; on any notify failure the booking is still saved and the page offers the old
   WhatsApp/SMS button as a fallback.
2. `server/notify.js`:
   - **WhatsApp Cloud API**: `POST graph.facebook.com/v{N}/{PHONE_ID}/messages` with an approved **utility** template
     (`booking_confirmation`: number, date/time, from, to, price). Preferred setup: **coexistence** – the business number stays in
     the owner's WhatsApp Business app, and messages sent by the API appear there, so the owner sees the confirmation in his normal
     chat and can reply from the app.
   - **SMS (SMSAPI.pl)**: `POST api.smsapi.pl/sms.do` (Bearer token) – fallback to the customer, and optional copy to the owner.
   - Order: WhatsApp → if it fails (no WhatsApp on that number / error) → SMS.
3. Owner Telegram bot (`/api/owner-bot`, own token, only `OWNER_CHAT_ID` is answered): new booking message + inline buttons
   Dziś / Wczoraj / Tydzień / Miesiąc + CSV, built on `leads.report()`.
4. Front end: "Zamów" button posts to `/api/book`, shows the booking number and a success screen; the WhatsApp/SMS links remain as
   "Problem? Napisz na WhatsApp".

**Alternatives considered**: only SMS (simpler, but owner chat history not in WhatsApp) · Telegram for the owner + SMS for the
customer (cheapest) · keep customer-sent messages but add a booking number + server price in the panel (0 zł, but not automatic).

**Feasibility: High** (all APIs are plain HTTPS calls from Workers). **Complexity: Medium.**

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Meta verification / template approval takes days or is rejected | Start the Meta setup first; plain utility wording; SMS works meanwhile |
| Coexistence not available for the number/country, or number must move to the API only | Verify during setup on Ramy's test number 503 467 198; fallback: separate API number + owner notified by Telegram |
| Paid messages abused by bots (cost) | Turnstile, per-IP and per-phone rate limits, daily cap (e.g. 60 messages), only after server validation |
| Message prices change (Meta per-message pricing, PL rates) | Budget alert; show estimated monthly cost in the panel |
| Customer gives a wrong number | Confirmation shows the booking number; the owner still calls if needed; fallback buttons stay |
| 23:00 summary needs a timer | Deploy the free `taxi-cron` Worker, or lazy summary on the next bot action |

## Strategic recommendation
**CONDITIONAL GO.** Build behind the existing `LITE_PLUS` switch plus a second switch `AUTO_BOOKING` (off by default), so Lite and
Lite Plus keep working unchanged. Conditions before planning:
1. Ramy creates (on his own accounts, for testing): Meta Business + WhatsApp Cloud API app with the test number, an SMSAPI.pl account
   with a small top-up, and a new Telegram bot for the owner reports.
2. Agree the per-booking cost with the client (≈ 0.15–0.40 zł) and a monthly cap.
3. Turnstile site + secret key for the test domain.

## Next steps
1. Start the account setups above (they take the longest).
2. `/rpi:plan lite-auto-booking` – the plan can be written now; the implementation's notify step is tested with fake WhatsApp/SMS
   servers (like the existing `tests/e2e/fake-*.mjs`) until the real keys exist.
