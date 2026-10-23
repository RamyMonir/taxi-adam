// "🗂 Kursy w toku" – the owner's board: what needs him (rides without a driver), who is driving whom and when he'll be free,
// and the reservations. One message, grouped, with a legend; "🔄 Odśwież" redraws it.
import { db, OPEN } from "./rides.js";
import { listDrivers, busyDriverIds, canDrive, freeAtOf } from "./fleet.js";
import { isDemo } from "./cars.js";
import { esc, clockWarsaw, whenLabel } from "./util.js";

const btn = (text, data) => ({ text, callback_data: data });
const part = (a) => esc(String(a || "").split(",")[0]);
const route = (d) => `${part(d.pickup && d.pickup.address)} → ${part(d.dest && d.dest.address)}`;
const first = (n) => esc(String(n || "").trim().split(/\s+/)[0] || "kierowca");
const ago = (ms) => Math.max(0, Math.round((Date.now() - ms) / 60000));

export async function rideBoard(env, now = Date.now()) {
  const [rs, all, busy] = await Promise.all([
    (await db(env)).prepare(`SELECT * FROM rides WHERE status IN (${OPEN.map((s) => `'${s}'`).join(",")}) ORDER BY created DESC LIMIT 40`).all(),
    listDrivers(env), busyDriverIds(env),
  ]);
  const rides = (rs.results || []).map((row) => ({ ...row, data: JSON.parse(row.data) }));
  const team = all.filter((x) => !x.owner && x.chat_id && !isDemo(x));
  const freeN = team.filter((x) => canDrive(x, busy)).length, rideN = team.filter((x) => busy.has(x.id)).length;

  const waiting = rides.filter((r) => r.status === "pending" && !r.data.driverId);
  const going = rides.filter((r) => ["enroute", "arrived", "ontrip"].includes(r.status))
    .sort((a, b) => freeAtOf(a, now) - freeAtOf(b, now));
  const booked = rides.filter((r) => r.status === "scheduled").sort((a, b) => String(a.data.when).localeCompare(String(b.data.when)));

  const L = [`🗂 <b>Kursy w toku</b> · ${clockWarsaw(now)}`,
             `👥 Kierowcy: 🟢 wolni ${freeN} · 🚕 w kursie ${rideN} · ⚪ poza zmianą ${team.length - freeN - rideN}`];
  const rows = [];
  if (!waiting.length && !going.length && !booked.length) {
    L.push("", "☕ Nic się teraz nie dzieje – brak otwartych kursów.", "Nowy kurs: „➕ Nowy kurs”.");
  }
  if (waiting.length) {
    L.push("", `❗ <b>Czeka na kierowcę</b> (${waiting.length}) – zdecyduj, kto jedzie:`);
    for (const r of waiting.slice(0, 8)) {
      const d = r.data, offers = Object.values(d.offers || {}).filter((o) => o.name && o.chat !== String(env.TELEGRAM_CHAT_ID));
      const sent = offers.length ? "wysłano do: " + offers.map((o) => first(o.name) + (o.rejected ? " (odrzucił)" : "")).join(", ")
        : r.mode === "later" ? "rezerwacja – przydziel kierowcę" : d.offers && d.offers.owner ? "u Ciebie – nikt nie był wolny" : "nikt jeszcze nie dostał";
      L.push(`⏳ ${r.mode === "now" ? "teraz" : esc(whenLabel(d.when))} · ${route(d)}${d.name ? " · " + esc(d.name) : ""}`,
             `     ${r.mode === "now" ? `czeka ${ago(d.pendingSince || r.created)} min · ` : ""}${sent}`);
      rows.push([btn(`👥 Kto jedzie? · ${String(d.pickup && d.pickup.address || "").split(",")[0].slice(0, 22)}`, `dpl|${r.id}`)]);
    }
  }
  if (going.length) {
    L.push("", `🚕 <b>W trakcie</b> (${going.length}):`);
    for (const r of going.slice(0, 10)) {
      const d = r.data, who = d.driverId ? first(d.driver && d.driver.name) : "Ty";
      const phase = r.status === "enroute" ? `🚕 ${who} jedzie po klienta${r.eta_at ? `, będzie ${clockWarsaw(r.eta_at)}` : ""}`
        : r.status === "arrived" ? `📍 ${who} czeka pod adresem${d.arrivedAt ? ` od ${ago(d.arrivedAt)} min` : ""}`
        : `🛣 ${who} wiezie klienta`;
      L.push(`${phase} · wolny ok. ${clockWarsaw(freeAtOf(r, now))}`, `     ${route(d)}${d.name ? " · " + esc(d.name) : ""}`);
    }
  }
  if (booked.length) {
    L.push("", `📅 <b>Rezerwacje</b> (${booked.length}):`);
    for (const r of booked.slice(0, 10)) {
      const d = r.data;
      L.push(`📅 ${esc(whenLabel(d.when))} · ${route(d)} · ${d.driverId && d.driverId !== "owner" ? "👤 " + first(d.driver && d.driver.name) : "🙋 Ty"}`);
    }
  }
  L.push("", "<i>⏳ czeka na kierowcę · 🚕 jedzie po klienta · 📍 czeka pod adresem · 🛣 wiezie klienta · 📅 rezerwacja</i>");
  rows.push([btn("🔄 Odśwież", "brd|-")]);
  return { text: L.join("\n"), rows };
}
