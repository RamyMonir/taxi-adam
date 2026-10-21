# REQUEST: taxi-lite – low-cost site for Taxi Knurów Adam Mączka (1–2 cars)

Built FIRST (decided 21.10.2026; prototype promised to Adam by end of week, ~23–25.10). `taxi-template` follows next week. Branch `Taxi-Knurow-Lite` from `Taxi-Knurow-V3`; PR into `Taxi-Knurow-Lite-review`.
Full original spec (steps 1–4, quality rules) is in the conversation; Step 1 (inventory) is done. Changes agreed since:

## Decisions after research (21.10.2026)
- Order/gating approved: Friday 23.10 prototype on TEST data (lite site, /api/lead with migration 0005, /api/* 404
  middleware, privacy, prices.json refactor) → Sunday/early next week /panel/ (PIN, report, CSV, status) → price editor
  only after Adam signs. Hard stop ~30 h.
- Retention: **12 months**.
- One seller entity everywhere: **Usługi IT RAMY MOHAMED** (footer, offer, invoice, DPA). DPA (umowa powierzenia) before real data.
- Offer: 2 500–3 000 zł one-off + 600 zł/month (Google care 400 + site upkeep 200 incl. 2 price/text changes/month,
  monthly summary), min 6 months; move hosting off Ramy's personal demo accounts before first payment.
- Google: no new listings; audit the 3 existing ones against Google rules.

## Why
Adam (JDG, not a VAT payer, 1–2 cars, ~90–100k zł turnover) can pay max ~3 000 zł one-off + 600 zł/month.
He wants a "mini app": tap to order via WhatsApp / SMS / call, the driver confirms. Most important to him: 3 Google listings.

## Booking (as in the spec)
Static site + PWA. Form: Teraz/Na później, Skąd, Dokąd (+ chips), osoby 1–9, bagaż, imię, telefon, uwagi; optional
"Tu jestem" (browser geolocation only). Buttons: WhatsApp (wa.me/48570762777), SMS, Zadzwoń 570 762 777 (+ "lub 515 650 750").
Night rule 22:00–5:00. "Cenę potwierdza kierowca przy przyjęciu zlecenia." No Google Maps API, no AI, no Telegram, no
calculator, no /przejazd/, no accounts, no chat, no Turnstile. Static reviews with links per listing.
Prefer a `LITE_MODE` flag in data.py + a small `lite.js` instead of editing `app.js`.

## NEW 1 – request log + report (decided: log full details, free Cloudflare D1 + one small function)
- Each tap on WhatsApp / SMS / Call sends a small record to `/api/lead` (fire-and-forget, never blocks opening WhatsApp):
  date, channel, now/later + time, from, to, passengers, luggage, name, phone, notes, page it came from.
- Report page `/panel/` behind secret link + 6-digit PIN: today / week / month / custom range, count by channel,
  top destinations, top pickup places, list of requests, CSV export for Excel. Adam can mark a request
  "przyjęty / nie przyjęty" (optional, simple).
- Rate limit + basic spam check. Data deleted after 12 months. Privacy policy updated (data stored on Cloudflare, purpose,
  retention; geolocation only on button press).

## NEW 2 – price editor (decided: same secret link + PIN)
- In `/panel/`: a list of all villages (local price + zone) and all destinations (airports, sanatoria, clinics, stations,
  cities), plus per-village overrides for long routes (e.g. Czerwionka → Pyrzowice 220 zł), the waiting-time rule and
  the "od" start prices. Adam types prices, sees a preview of changes, taps "Zatwierdź".
- On confirm: a Pages Function commits the updated prices file (e.g. `src/prices.json`, read by `src/data.py`) to the
  GitHub branch via the GitHub API (fine-grained token, secret `GITHUB_TOKEN`, only this repo, contents:write).
  Cloudflare Pages rebuilds and deploys automatically (~1–2 min). The panel shows "wdrożono" status / history of changes.
- Validation (numbers, sane ranges), commit message names what changed.

## NEW 3 – fine print + waiting in the car (decided: both)
- Under the form, exactly: "*Wszelkie dodatkowe opłaty pokrywa zamawiający (parkingi, wjazdy na tereny płatne itd.)."
- Waiting-time rule shown on the price list / FAQ / booking: e.g. "Pierwsze X min oczekiwania gratis, potem Y zł za każdą
  rozpoczętą minutę" – X and Y set by Adam in the price editor (placeholder until he sets them).

## Content (from the spec + chat)
- Texts: "Cenę od poznasz na stronie, a kierowca potwierdzi kurs w kilka minut."; new 3 steps; "Większa grupa?
  Zorganizujemy transport do 9 osób (busy partnerskie)."; VIP without "artystów"/"tabliczka" (TODO); footer
  "Strona: Usługi IT RAMY MOHAMED".
- Prices to confirm with Adam (he'll do it in the editor): Gierałtowice from 20 zł (he said 14.10; data.py has 15);
  Czerwionka/Ornontowice → Pyrzowice from 220 zł; possibly add Nieborowice, Szczygłowice, Paniówki.

## Quality
As in the spec: no SEO regressions, WhatsApp button visible without scrolling at 390px, tests (message builder,
lead API, panel auth, price commit), grep dist for Google API calls (only /api/lead and /api/panel allowed),
screenshots, small commits.
