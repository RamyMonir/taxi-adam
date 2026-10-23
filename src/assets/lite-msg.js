/* Taxi Lite – pure helpers for the booking box (no DOM): message text, WhatsApp / SMS links, night rule, validation.
   Used by /assets/lite.js in the browser and by tests/lite-msg.test.js in Node. */

const DAYS = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
const pad = (n) => String(n).padStart(2, "0");
const clean = (s, max = 300) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
const minutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ""); return m ? +m[1] * 60 + +m[2] : null; };

// "HH:MM" inside the night window (e.g. 22:00–05:00, wraps over midnight)
export function isNight(hhmm, night) {
  const t = minutes(hhmm), a = minutes(night && night.from), b = minutes(night && night.to);
  if (t == null || a == null || b == null) return false;
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

// "2026-10-24" + "04:30" -> "24.10 (sob.) 04:30"
export function whenLabel(date, time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!m) return clean(time);
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${m[3]}.${m[2]} (${DAYS[d.getDay()]}) ${clean(time)}`.trim();
}

export const digits = (s) => String(s || "").replace(/\D/g, "");
export const geoLink = (g) => (g && isFinite(g.lat) && isFinite(g.lng)
  ? `https://maps.google.com/?q=${(+g.lat).toFixed(5)},${(+g.lng).toFixed(5)}` : "");

// is the ride at night? "now" uses the current time, "later" the chosen time
export function rideAtNight(f, night, now = new Date()) {
  return f.mode === "later" ? isNight(f.time, night) : isNight(`${pad(now.getHours())}:${pad(now.getMinutes())}`, night);
}

/* The text that goes to WhatsApp / SMS. f = {mode, date, time, from, to, geo, pax, luggage, name, phone, notes}
   opts = {site: "example.pl", night: {from, to}, now: Date} */
export function buildMessage(f, opts = {}) {
  const L = [`Dzień dobry, chcę zamówić taxi${opts.site ? ` (${opts.site})` : ""}`];
  const night = opts.night && rideAtNight(f, opts.night, opts.now || new Date());
  const when = f.mode === "later" ? whenLabel(f.date, f.time) : "teraz";
  L.push(`Kiedy: ${when}${night ? " (kurs nocny – rezerwacja)" : ""}`);
  L.push(`Skąd: ${clean(f.from, 160) || "(do ustalenia)"}`);
  const g = geoLink(f.geo);
  if (g) L.push(`Moja lokalizacja: ${g}`);
  L.push(`Dokąd: ${clean(f.to, 160) || "(do ustalenia)"}`);
  const pax = [`Osoby: ${parseInt(f.pax, 10) || 1}`];
  if (clean(f.luggage)) pax.push(`Bagaż: ${clean(f.luggage, 40)}`);
  L.push(pax.join(" · "));
  const who = [];
  if (clean(f.name)) who.push(`Imię: ${clean(f.name, 60)}`);
  if (clean(f.phone)) who.push(`Telefon: ${clean(f.phone, 30)}`);
  if (who.length) L.push(who.join(" · "));
  if (clean(f.notes)) L.push(`Uwagi: ${clean(f.notes, 300)}`);
  return L.join("\n");
}

export const waLink = (wa, msg) => `https://wa.me/${digits(wa)}?text=${encodeURIComponent(msg)}`;
// iPhone uses "&body=", Android "?body="
export const isIOS = (ua) => /iPad|iPhone|iPod/.test(ua || "") || (/Macintosh/.test(ua || "") && /Mobile/.test(ua || ""));
export const smsLink = (tel, msg, ua) => `sms:${tel}${isIOS(ua) ? "&" : "?"}body=${encodeURIComponent(msg)}`;

/* -> null (OK) or {field, msg}. Phone is required; "later" needs date + time in the future; "now" is not possible at night. */
export function validate(f, opts = {}) {
  const now = opts.now || new Date(), night = opts.night;
  const d = digits(f.phone);
  if (!d) return { field: "tel", msg: "Podaj numer telefonu, żeby kierowca mógł potwierdzić kurs." };
  if (d.length < 9) return { field: "tel", msg: "Sprawdź numer telefonu (min. 9 cyfr)." };
  if (f.mode === "later") {
    if (!f.date || !f.time) return { field: f.date ? "time" : "date", msg: "Wybierz datę i godzinę odbioru." };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.date), t = minutes(f.time);
    if (!m || t == null) return { field: "date", msg: "Wybierz datę i godzinę odbioru." };
    const at = new Date(+m[1], +m[2] - 1, +m[3], Math.floor(t / 60), t % 60);
    if (at.getTime() < now.getTime() - 5 * 60000) return { field: "time", msg: "Ta godzina już minęła – wybierz późniejszą." };
  } else if (night && rideAtNight(f, night, now)) {
    return { field: "time", msg: `Kursy nocne (${night.from}–${night.to.replace(/^0/, "")}) tylko po wcześniejszej rezerwacji – wybierz „Na później” i godzinę.` };
  }
  return null;
}

// what /api/lead stores for the owner's report
export function leadPayload(f, channel, page) {
  return {
    channel, mode: f.mode === "later" ? "later" : "now",
    when: f.mode === "later" && f.date && f.time ? `${f.date}T${f.time}` : null,
    from: clean(f.from, 160), to: clean(f.to, 160), pax: parseInt(f.pax, 10) || 1, luggage: clean(f.luggage, 40),
    name: clean(f.name, 60), phone: clean(f.phone, 30), notes: clean(f.notes, 300),
    geo: f.geo && isFinite(f.geo.lat) ? { lat: +(+f.geo.lat).toFixed(5), lng: +(+f.geo.lng).toFixed(5) } : null,
    page: clean(page, 120), website: f.website || "",
  };
}
