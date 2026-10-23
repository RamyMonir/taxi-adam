// Driver settlement (pure functions, unit-tested in tests/settle.test.js).
//   gross        = all money of completed rides (amount entered by the driver, else the quoted price)
//   cash         = paid in cash -> it is in the driver's pocket
//   noncash      = card / BLIK / transfer -> already on the company account
//   driver share = pct% of gross (model "percent")  or  gross − daily car fee (model "daily_fee")
//   hand in      = cash − driver share   (> 0: the driver gives the owner this cash; < 0: the owner pays the driver)
// the owner (owner) has no settlement: everything is the company's.
import { OWNER, BRAND, EX } from "./brand.js";

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const tripMoney = (t) => (t.paid != null ? Number(t.paid) : Number(t.price) || 0);
export const isCash = (t, cashMethods = ["gotówka"]) => !t.method || cashMethods.includes(t.method);   // nothing entered: counted as cash

export function modelOf(drv, cfg = {}) {
  if (!drv || drv.owner) return { model: "owner", pct: null, fee: null };
  if (drv.pay_model === "daily_fee") return { model: "daily_fee", pct: null, fee: r2(drv.daily_fee ?? cfg.default_daily_fee ?? 0) };
  return { model: "percent", pct: Number(drv.driver_pct ?? cfg.default_driver_pct ?? 50), fee: null };
}

// one driver, one day
export function settleDay(trips, drv, cfg = {}) {
  const done = trips.filter((t) => t.status === "done");
  const cashM = cfg.cash_methods || ["gotówka"];
  const gross = r2(done.reduce((s, t) => s + tripMoney(t), 0));
  const cash = r2(done.filter((t) => isCash(t, cashM)).reduce((s, t) => s + tripMoney(t), 0));
  const noncash = r2(gross - cash);
  const m = modelOf(drv, cfg);
  let driverShare, ownerShare;
  if (m.model === "owner") { driverShare = 0; ownerShare = gross; }
  else if (m.model === "daily_fee") { ownerShare = done.length ? m.fee : 0; driverShare = r2(gross - ownerShare); }
  else { driverShare = r2(gross * m.pct / 100); ownerShare = r2(gross - driverShare); }
  const handIn = m.model === "owner" ? 0 : r2(cash - driverShare);
  return { ...m, rides: done.length, gross, cash, noncash, driverShare, ownerShare, handIn,
           unpaid: done.filter((t) => t.paid == null).length, noMethod: done.filter((t) => t.paid != null && !t.method).length };
}

// one driver, several days: the daily fee counts once per day with rides
export function settlePeriod(trips, drv, cfg = {}) {
  const byDay = {};
  for (const t of trips) (byDay[t.day] = byDay[t.day] || []).push(t);
  const days = Object.keys(byDay).sort().map((day) => ({ day, ...settleDay(byDay[day], drv, cfg) }));
  const sum = (k) => r2(days.reduce((s, x) => s + x[k], 0));
  const m = modelOf(drv, cfg);
  return { ...m, days, workDays: days.filter((x) => x.rides).length, rides: days.reduce((s, x) => s + x.rides, 0),
           gross: sum("gross"), cash: sum("cash"), noncash: sum("noncash"), driverShare: sum("driverShare"),
           ownerShare: sum("ownerShare"), handIn: sum("handIn"), unpaid: days.reduce((s, x) => s + x.unpaid, 0),
           noMethod: days.reduce((s, x) => s + x.noMethod, 0) };
}

// "1 205,00 zł"
export function zl2(n) {
  const v = r2(n), neg = v < 0, [i, f] = Math.abs(v).toFixed(2).split(".");
  return (neg ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + f + " zł";
}
export function modelLabel(m) {
  return m.model === "owner" ? "właściciel" : m.model === "daily_fee" ? `opłata za auto ${zl2(m.fee)}/dzień` : `${m.pct}% dla kierowcy`;
}
// the settlement line, from the driver's point of view (you) or the owner's (name)
export function handInText(s, name = null) {
  if (s.model === "owner") return "";
  if (Math.abs(s.handIn) < 0.005) return name ? `✅ ${name}: rozliczone na zero` : "✅ Rozliczenie: 0,00 zł – nic do oddania";
  if (s.handIn > 0) return name ? `💵 ${name} oddaje ${zl2(s.handIn)}` : `💵 Do oddania ${OWNER.dat}: ${zl2(s.handIn)}`;
  return name ? `💸 ${OWNER.nom} dopłaca: ${zl2(-s.handIn)}` : `💸 Firma dopłaca Ci: ${zl2(-s.handIn)}`;
}
