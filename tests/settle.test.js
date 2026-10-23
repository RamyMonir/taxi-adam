import { test } from "node:test";
import assert from "node:assert/strict";
import { settleDay, settlePeriod, modelOf, zl2, handInText } from "../server/settle.js";
import { OWNER, BRAND } from "../server/brand.js";

const cfg = { default_driver_pct: 50, default_daily_fee: 120, cash_methods: ["gotówka"] };
const T = (paid, method, extra = {}) => ({ status: "done", day: "2026-10-10", paid, method, price: paid, ...extra });

test("50/50: cash below the driver's share -> the owner pays the driver", () => {
  const marek = [T(85, "gotówka"), T(120, "karta"), T(45, "gotówka"), T(210, "BLIK"), T(30, "gotówka")];
  const s = settleDay(marek, { id: "d1" }, cfg);
  assert.equal(s.model, "percent"); assert.equal(s.pct, 50);
  assert.deepEqual([s.gross, s.cash, s.noncash, s.driverShare, s.ownerShare, s.handIn], [490, 160, 330, 245, 245, -85]);
  assert.equal(handInText(s), "💸 Firma dopłaca Ci: 85,00 zł");
  assert.equal(handInText(s, "Marek"), `💸 ${OWNER.nom} dopłaca: 85,00 zł`);
});

test("daily car fee: driver keeps gross minus fee, hands in the rest of the cash", () => {
  const kasia = [T(60, "gotówka"), T(95, "gotówka"), T(40, "karta"), T(150, "gotówka")];
  const s = settleDay(kasia, { id: "d2", pay_model: "daily_fee", daily_fee: 120 }, cfg);
  assert.deepEqual([s.gross, s.cash, s.noncash, s.ownerShare, s.driverShare, s.handIn], [345, 305, 40, 120, 225, 80]);
  assert.equal(handInText(s), `💵 Do oddania ${OWNER.dat}: 80,00 zł`);
});

test("per-driver percentage override and rounding to grosze", () => {
  const s = settleDay([T(70, "gotówka"), T(55.55, "karta")], { id: "d3", driver_pct: 55 }, cfg);
  assert.equal(s.gross, 125.55); assert.equal(s.driverShare, 69.05); assert.equal(s.ownerShare, 56.5); assert.equal(s.handIn, 0.95);
});

test("owner: no settlement; unpaid rides use the quoted price and count as cash", () => {
  const s = settleDay([{ status: "done", day: "2026-10-10", paid: null, method: null, price: 65 }, T(180, "przelew")], { owner: 1 }, cfg);
  assert.equal(s.model, "owner"); assert.equal(s.handIn, 0); assert.equal(s.cash, 65); assert.equal(s.unpaid, 1);
  assert.equal(handInText(s), "");
});

test("not completed rides don't count; daily fee only on days with rides", () => {
  const rows = [T(100, "gotówka", { day: "2026-10-01" }), { status: "cancelled", day: "2026-10-02", price: 50 }, T(50, "karta", { day: "2026-10-03" })];
  const s = settlePeriod(rows, { pay_model: "daily_fee", daily_fee: 100 }, cfg);
  assert.equal(s.workDays, 2); assert.equal(s.ownerShare, 200); assert.equal(s.driverShare, -50); assert.equal(s.handIn, 150);
});

test("model defaults and money format", () => {
  assert.deepEqual(modelOf({}, cfg), { model: "percent", pct: 50, fee: null });
  assert.equal(modelOf({ pay_model: "daily_fee" }, cfg).fee, 120);
  assert.equal(zl2(1205), "1 205,00 zł"); assert.equal(zl2(-85.5), "−85,50 zł"); assert.equal(zl2(0.1 + 0.2), "0,30 zł");
});
