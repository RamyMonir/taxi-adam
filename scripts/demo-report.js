// Prints the demo 23:00 reports (owner + one driver) from the DEMO seed names and cars – for the client demo / PR.
//   node scripts/demo-report.js
import { renderReport } from "../server/report.js";

const day = "2026-10-10", at = (h) => Date.parse(`${day}T${h}:00+02:00`);
const CAR = { c1: "Toyota Corolla · SGL 1A234", c2: "Škoda Octavia · SGL 2B567", c3: "Toyota Camry · SK 3C890", c4: "Kia Ceed · SGL 4D123" };
const DRV = { d1: "Marek Nowak", d2: "Katarzyna Wójcik", d3: "Tomasz Kowalczyk", owner: "Adam" };
let n = 0;
const T = (time, d, c, from, to, paid, method, km, extra = {}) => ({ id: "demo" + ++n, day, status: "done", mode: "now", source: "online",
  driver_id: d === "owner" ? "owner" : "demo_" + d, driver_name: DRV[d], car_id: "demo_" + c, car_label: CAR[c], pickup: from, dest: to,
  price: paid, paid, method, started_at: at(time), ended_at: at(time) + Math.round(km * 1.6) * 60000, enroute_at: at(time) - 9 * 60000,
  km, approach_km: 2.5, ...extra });
const rows = [
  T("07:40", "d1", "c1", "Rynek, Knurów", "Dworzec PKP, Gliwice", 85, "gotówka", 14),
  T("08:55", "d1", "c1", "Szpitalna, Knurów", "Galeria Gliwicka, Gliwice", 120, "karta", 16, { mode: "later" }),
  T("09:30", "d2", "c3", "Dworcowa, Knurów", "Gierałtowice", 60, "gotówka", 7),
  T("10:15", "d3", "c4", "Szczygłowice", "Rynek, Knurów", 70, "gotówka", 6, { source: "telefon" }),
  T("11:05", "d2", "c3", "Knurów", "Szpital, Zabrze", 95, "gotówka", 19),
  T("12:20", "d1", "c2", "Ogrodowa, Knurów", "Krywałd", 45, "gotówka", 4, { source: "telefon" }),
  T("13:10", "owner", "c1", "Knurów", "Uzdrowisko Goczałkowice", 180, "przelew", 52, { mode: "later", source: "telefon" }),
  T("14:35", "d1", "c2", "Knurów", "Lotnisko Katowice-Pyrzowice", 210, "BLIK", 48, { mode: "later" }),
  T("15:50", "d3", "c4", "Knurów", "Pilchowice", 55, "karta", 9),
  T("16:40", "d2", "c3", "Gliwice", "Knurów", 40, "karta", 13, { source: "telefon" }),
  T("18:05", "owner", "c1", "Dworzec, Knurów", "Rynek, Knurów", 65, "gotówka", 3, { source: "telefon" }),
  T("19:30", "d2", "c3", "Knurów", "Focus Mall, Rybnik", 150, "gotówka", 27, { mode: "later" }),
  T("21:10", "d1", "c2", "Rynek, Knurów", "Szczygłowice", 30, "gotówka", 5),
  { id: "demoX", day, status: "cancelled", driver_id: "demo_d3", price: 40 },
  { id: "demoY", day, status: "noshow", driver_id: "demo_d1", price: 35 },
];
const drivers = [
  { id: "owner", name: "Adam", owner: 1 },
  { id: "demo_d1", name: "Marek Nowak", pay_model: "percent", driver_pct: 50 },
  { id: "demo_d2", name: "Katarzyna Wójcik", pay_model: "daily_fee", daily_fee: 120 },
  { id: "demo_d3", name: "Tomasz Kowalczyk", pay_model: "percent", driver_pct: 50 },
  { id: "demo_d4", name: "Paweł Zieliński", pay_model: "percent", driver_pct: 55 },
];
const S = (c, d, from, to) => ({ car_id: "demo_" + c, driver_id: d === "owner" ? "owner" : "demo_" + d, driver_name: DRV[d],
  make: CAR[c].split(" ")[0], model: CAR[c].split(" · ")[0].split(" ").slice(1).join(" "), plate: CAR[c].split(" · ")[1], started: at(from), ended: to ? at(to) : null });
const sessions = [S("c1", "d1", "07:12", "11:58"), S("c2", "d1", "12:05", null), S("c1", "owner", "12:40", "18:30"), S("c3", "d2", "08:50", "20:15"), S("c4", "d3", "09:45", "16:30")];
const cars = [
  { id: "demo_c1", make: "Toyota", model: "Corolla", plate: "SGL 1A234", status: "active" },
  { id: "demo_c2", make: "Škoda", model: "Octavia", plate: "SGL 2B567", status: "active" },
  { id: "demo_c3", make: "Toyota", model: "Camry", plate: "SK 3C890", status: "active" },
  { id: "demo_c4", make: "Kia", model: "Ceed", plate: "SGL 4D123", status: "active" },
  { id: "demo_c5", make: "Hyundai", model: "i30", plate: "SK 5E456", status: "service", note: "wymiana klocków" },
];
const cfg = { default_driver_pct: 50, default_daily_fee: 120, cash_methods: ["gotówka"] };
const plain = (s) => s.replace(/<[^>]+>/g, "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const owner = renderReport({ from: day, to: day, rows, drivers, sessions, cars, cfg });
console.log("🌙 Podsumowanie dnia\n\n" + plain(owner.text));
console.log("\n[ ✅ Rozliczono: " + owner.settlements.map((s) => s.name).join(" ]  [ ✅ Rozliczono: ") + " ]\n\n==========\n");
for (const id of ["demo_d1", "demo_d2"]) console.log("🌙 Twój dzień\n\n" + plain(renderReport({ from: day, to: day, rows, drivers, sessions, cfg, driverId: id }).text) + "\n\n==========\n");
