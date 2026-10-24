# Lite Plus – automatic booking (SMS + WhatsApp) and Telegram report bot for the owner

Branch: `lite-plus` (repo RamyMonir/taxi-adam). Switch: `LITE_PLUS` in `src/data.py` (off = plain Lite, unchanged).

## Problem
In Lite / Lite Plus the customer sends the booking from **their own** WhatsApp/SMS app. The message is editable, so a customer can
change the price ("kurs") before sending. The owner (Adam) wants bookings to arrive **automatically and unchanged**.

## Goal
1. **Server-side booking.** The customer taps "Zamów" → `POST` to the server with the form data. The server validates it, calculates
   the route and price itself (`/api/quote` logic, never trusting a price from the browser), saves the booking in D1 with a short
   booking number, and replies with that number.
2. **Automatic notification – both channels.**
   - **WhatsApp Business Cloud API (Meta)** first: the owner gets the booking (template message), the customer gets a confirmation.
   - **SMS (SMSAPI.pl)** as fallback (and/or for customers without WhatsApp).
   - Message text = server data only (route, date/time, price, flight, phone, name, notes, booking number).
3. **Telegram report bot – owner only, buttons only (no AI).** Daily / weekly / monthly / range reports from saved bookings:
   number of bookings, accepted/not accepted, sum of prices, top destinations and pickups, channel, CSV. Daily summary at 23:00.
   Reuse the full version's report code where possible. No drivers, no dispatch.
4. The customer-side WhatsApp/SMS/Call buttons stay available as a fallback (e.g. server down, keys missing).

## Constraints
- Lite stays 0 zł when the new keys are missing: everything degrades to today's behaviour.
- Secrets only in Cloudflare (never in code): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, templates; `SMSAPI_TOKEN`, sender name;
  Telegram bot token + owner chat id.
- Rate limit + honeypot like `/api/lead`; no booking spam to the owner's phone.
- GDPR: keep only what is needed; same retention as leads (12 months), owner panel can still mark accepted / not accepted.
- Python 3.8-safe `src/build.py`; tests: `node --test tests/*.test.js`, `py tests/build_check.py`, `py tests/schema_check.py`.
- Testing uses Ramy's own accounts/numbers (WhatsApp 503 467 198), never Adam's.

## Costs (to confirm in research)
- SMSAPI.pl ~0.12–0.17 zł / SMS. Meta WhatsApp: per business-initiated (template) message, PL rates; service replies free in 24 h.
- Telegram: free. Cloudflare: free plan.

## Open questions for research
- WhatsApp Cloud API: can the owner keep his WhatsApp Business app number (coexistence) or is a second number needed?
- Which Meta template category (utility) and current PL price; template approval time.
- Do we notify the customer by WhatsApp or SMS by default?
- Telegram cron for the 23:00 summary on the free plan (existing `taxi-cron` Worker or Pages cron alternative).
