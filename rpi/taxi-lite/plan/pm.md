# taxi-lite – Product requirements

Date 21.10.2026 · Research: CONDITIONAL GO (gating agreed) · Seller: **Usługi IT RAMY MOHAMED**

## Problem
Adam Mączka (Taxi Knurów, JDG, not a VAT payer, 1–2 cars) declined the full booking/dispatch system (10–14k zł).
His budget is max ~3 000 zł one-off + 600 zł/month. His priority is the 3 Google listings. He asked for a
"mini app": the customer taps, the order goes by WhatsApp / SMS / phone, the driver confirms.

## Goal
A fast, clean website + phone app (PWA) on taxiknurowadam.pl that turns Google visitors into WhatsApp/SMS/phone
requests, shows Adam how many requests the site brings, and lets him change his prices himself.
Running cost 0 zł (Cloudflare free plan).

## Users
| Persona | Needs |
|---|---|
| **Customer** (often older, on a phone, from Google) | See "od" price, send a request in seconds, no account, no app store |
| **Adam** (owner, drives himself) | Requests arrive in his normal WhatsApp/SMS/phone; a simple monthly picture of demand; change prices without calling Ramy |
| **Partner drivers** | Nothing new – Adam forwards rides as today |
| **Ramy** (seller/maintainer) | Small, low-maintenance build; one switch to roll back; alert on price changes |

## User stories
1. As a customer I fill in from / to / when / people and tap **WhatsApp** – WhatsApp opens with a ready Polish message.
2. As a customer without WhatsApp I tap **SMS** (works on iPhone and Android) or **Zadzwoń**.
3. As a customer I tap **Tu jestem** and my location link is added to the message (only when I tap).
4. As a customer booking at night (22:00–5:00) I see that night rides need a reservation, and the message says so.
5. As a customer I see "od" prices per route and village, the waiting-time rule and that extra fees (parking, paid areas) are mine.
6. As Adam I open my secret panel link, type my PIN and see requests today / this week / this month, by channel, top destinations, top pickup places, and the list; I can export CSV.
7. As Adam I mark a request "przyjęty" or "nie przyjęty".
8. As Adam I change a price (e.g. Czerwionka → Pyrzowice 220 zł), see what changes, tap **Zatwierdź**, and within ~2 minutes the site shows the new price ("wdrożono").
9. As Ramy I get an e-mail for every price change and can undo it with one git revert.

## Scope and gating (agreed)
| When | Scope |
|---|---|
| **Fri 23.10 – prototype (TEST data, preview URL)** | Phases 1–3 of PLAN.md: prices file, lite site + booking, request logging, privacy |
| **Sun 25.10 / early next week** | Phase 4: panel with PIN, report, CSV, status marking |
| **After Adam signs the order** | Phase 5: price editor (GitHub commit + auto deploy) |
| Hard stop | ~30 h total; anything more is billed or deferred |

## Acceptance criteria (product)
- WhatsApp button visible without scrolling on a 390×844 phone (home, /rezerwacja/, route pages).
- Message contains every filled field, Polish characters correct, night note when 22:00–5:00, location link when used.
- Exact fine print under the form: "*Wszelkie dodatkowe opłaty pokrywa zamawiający (parkingi, wjazdy na tereny płatne itd.)."
- Line "Cenę potwierdza kierowca przy przyjęciu zlecenia." near the buttons.
- Texts replaced as in the spec (lead text, 3 steps, group up to 9 people, VIP without "artystów"/"tabliczka", footer "Strona: Usługi IT RAMY MOHAMED").
- Report numbers are labelled **"Kliknięcia / zapytania rozpoczęte"** with the note "nie każde kliknięcie kończy się wiadomością; telefony wybrane ręcznie nie są liczone".
- No page URL, title or sitemap entry lost (except /przejazd/ and /konto/, which are noindex app pages).
- Zero requests from the built site to Google APIs; the only API calls are /api/lead and /api/panel/*.

## Data and legal
- Stored per request: time, channel, now/later + time, from, to, people, luggage, name, phone, notes (short), page, status.
  **Retention 12 months**, deleted automatically.
- Adam = controller, Usługi IT RAMY MOHAMED = processor. Short DPA (umowa powierzenia) signed **before real data**.
  Until then the preview runs on a test database.
- Privacy policy (in Adam's name) lists: purpose (handling the ride request), legal basis, Cloudflare as sub-processor,
  12 months, WhatsApp/SMS go through the customer's own apps, geolocation only on button press, no cookies for customers.

## Commercial prerequisites (before production)
- Written order: 2 500–3 000 zł one-off + 600 zł/month (Google care 400 + site upkeep 200 incl. 2 price/text changes a month
  and a monthly summary), minimum 6 months, exact list of what is included.
- Move hosting / D1 / repo access off Ramy's personal demo accounts before the first payment; domain in Adam's name or transferred.
- Google: no new listings; audit the 3 existing listings against Google rules.

## Success metrics
- Prototype shown to Adam by Sun 25.10.
- Adam signs the order.
- After 1 month: ≥ 30 started requests/month from the site (baseline unknown – first month sets it).

## Out of scope
Maps, price calculator, online status page, customer accounts, chat, Telegram, AI, Turnstile, online payments,
new Google listings, Google Ads (separate annex).
