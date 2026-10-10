// Rides taken over the phone: the driver types one line to the bot, e.g.
//   /kurs Rynek 1 Knurów > Lotnisko Pyrzowice, jutro 14:30, 600 100 200, Pani Ewa, 3 os
// and the ride goes into the same system as online bookings (status, buttons, customer's live link).
import { nowWarsaw, whenLabel } from "./util.js";

export const HELP =
  "📞 <b>Kurs z telefonu</b> – napisz jedną linijkę:\n" +
  "<code>/kurs SKĄD &gt; DOKĄD, KIEDY, TELEFON, IMIĘ</code>\n\n" +
  "Przykłady:\n" +
  "<code>/kurs Rynek 1 Knurów &gt; Lotnisko Pyrzowice, jutro 14:30, 600100200, Pani Ewa</code>\n" +
  "<code>/kurs Dworcowa 12 Knurów &gt; Dworzec Gliwice, 600100200</code>  (bez godziny = teraz)\n" +
  "<code>/kurs Gierałtowice Lipowa 5 &gt; Szpital Zabrze, 12.11 7:15, 600100200, 2 os, uwagi: wózek</code>\n\n" +
  "Kiedy: <i>dziś / jutro / pojutrze / 12.11</i> + godzina <i>14:30</i>. Imię: <i>Pan …, Pani …</i> albo <i>imię: …</i>.\n" +
  "Najpierw pokażę podgląd – zapiszesz go jednym przyciskiem.";

const pad = (n) => String(n).padStart(2, "0");
function addDays(ymd, n) {
  const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// -> {pickup, dest, when|null, phone, name, pax, notes} or {error}
export function parseRide(text, now = nowWarsaw()) {
  let s = String(text || "").replace(/^\/kurs(@\w+)?/i, "").trim();
  if (!s) return { error: "empty" };
  let notes = "";
  const n = s.match(/[,;]?\s*uwagi\s*:\s*(.+)$/i);
  if (n) { notes = n[1].trim(); s = s.slice(0, n.index); }

  const parts = s.split(/\s*(?:->|→|=>|>)\s*/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { error: "route" };
  const pickup = parts[0].replace(/[,;\s]+$/, "").trim();
  let rest = " " + parts[1] + " ";

  // phone: 9+ digits, maybe with +48, spaces or dashes
  let phone = "";
  rest = rest.replace(/(?:^|[\s,;])(\+?\d[\d \-]{7,}\d)(?=[\s,;]|$)/, (m, p) => {
    if (p.replace(/\D/g, "").length < 9) return m;
    phone = p.trim(); return " , ";
  });

  // passengers: "3 os", "3 osoby"
  let pax = 1;
  rest = rest.replace(/(?:^|[\s,;])(\d)\s*(?:os\.?|osob[ya]?|osób)(?=[\s,;.]|$)/i, (m, p) => { pax = +p; return " , "; });

  // day: dziś / jutro / pojutrze / 12.11(.2026)
  const today = now.slice(0, 10);
  let day = null;
  rest = rest.replace(/(?:^|[\s,;])(dzi[sś]|dzisiaj|jutro|pojutrze)(?=[\s,;]|$)/i, (m, w) => {
    w = w.toLowerCase(); day = addDays(today, w === "jutro" ? 1 : w === "pojutrze" ? 2 : 0); return " , ";
  });
  if (!day) {
    rest = rest.replace(/(?:^|[\s,;])(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?(?=[\s,;]|$)/, (m, dd, mm, yy) => {
      if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return m;   // "14.30" is a time, not a date
      let y = yy ? (yy.length === 2 ? 2000 + +yy : +yy) : +today.slice(0, 4);
      let ymd = `${y}-${pad(mm)}-${pad(dd)}`;
      if (!yy && ymd < today) ymd = `${y + 1}-${pad(mm)}-${pad(dd)}`;
      day = ymd; return " , ";
    });
  }
  // time: 14:30, 7:15, 14.30, "godz. 14"
  let time = null;
  rest = rest.replace(/(?:^|[\s,;])(?:godz\.?\s*|o\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?=[\s,;]|$)/i, (m, h, mi) => { time = `${pad(h)}:${mi}`; return " , "; });
  if (!time) rest = rest.replace(/(?:^|[\s,;])godz\.?\s*([01]?\d|2[0-3])(?=[\s,;]|$)/i, (m, h) => { time = `${pad(h)}:00`; return " , "; });

  let when = null;
  if (day && !time) return { error: "time" };
  if (time) {
    when = `${day || today}T${time}`;
    if (!day && when <= now) when = `${addDays(today, 1)}T${time}`;   // "14:30" already past today -> tomorrow
    if (when <= now) return { error: "past" };
  }

  // name: "Pan Jan", "Pani Ewa", "imię: Ewa" – one comma-separated piece
  let name = "";
  const pieces = rest.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const keep = [];
  for (const p of pieces) {
    const m = p.match(/^(?:imi[eę]\s*:\s*(.+)|((?:pan|pani)\s+.+))$/i);
    if (m && !name) name = (m[1] || m[2]).trim(); else keep.push(p);
  }
  const dest = keep.join(", ").trim();
  if (!dest) return { error: "route" };
  if (!phone) return { error: "phone" };
  return { pickup, dest, when, phone, name: name.slice(0, 60), pax: Math.min(8, Math.max(1, pax)), notes: notes.slice(0, 300) };
}

export const PARSE_ERRORS = {
  empty: "",
  route: "Nie widzę trasy. Oddziel skąd i dokąd znakiem <b>&gt;</b>.",
  phone: "Brakuje numeru telefonu klienta.",
  time: "Podaj też godzinę, np. <i>jutro 14:30</i>.",
  past: "Ta godzina już minęła.",
};

// "Wyślij klientowi link": WhatsApp chat with the customer, message ready to send
export function customerWaUrl(r, origin) {
  const d = r.data;
  let num = String(d.phone || "").replace(/\D/g, "");
  if (num.length === 9) num = "48" + num;
  if (num.length < 11) return null;
  const when = d.when ? whenLabel(d.when) : "teraz";
  const text = `Dzień dobry! Tu Taxi Knurów Adam. Potwierdzam kurs: ${when}, ${d.pickup.address} → ${d.dest.address}.` +
    `\nTutaj zobaczysz na żywo, gdzie jest kierowca i kiedy dojedzie: ${origin}/przejazd/?id=${r.id}&t=${r.token}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
