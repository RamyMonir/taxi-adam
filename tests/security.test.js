import { test } from "node:test";
import assert from "node:assert/strict";
import { windowStart, rateKey, overLimit, hit } from "../server/ratelimit.js";
import { turnstileOn, verifyTurnstile } from "../server/turnstile.js";

test("rate limit: fixed windows and keys", () => {
  assert.equal(windowStart(61_000, 60), 60);
  assert.equal(windowStart(119_999, 60), 60);
  assert.equal(windowStart(120_000, 60), 120);
  assert.equal(rateKey("quote", "abc", 61_000, 60), "quote:abc:60");
  assert.notEqual(rateKey("quote", "abc", 61_000, 60), rateKey("quote", "abd", 61_000, 60));
  assert.equal(overLimit(30, 30), false);
  assert.equal(overLimit(31, 30), true);
});

// minimal fake D1: one counter table
function fakeDb() {
  const rows = new Map();
  return {
    prepare(sql) {
      return {
        bind(...a) { this.a = a; return this; },
        async run() { if (/^DELETE/.test(sql)) for (const [k, v] of rows) if (v.win < this.a[0]) rows.delete(k); return {}; },
        async first() {
          const [k, win] = this.a, cur = rows.get(k);
          const n = cur ? cur.n + 1 : 1; rows.set(k, { n, win }); return { n };
        },
      };
    },
  };
}

test("rate limit: 30 quotes a minute per IP, then 429; a new minute starts again", async () => {
  const env = { DB: fakeDb() }, t0 = 1_000_000_020_000;
  for (let i = 1; i <= 30; i++) assert.equal((await hit(env, "quote", "ip1", { limit: 30, now: t0 })).allowed, true, "request " + i);
  assert.equal((await hit(env, "quote", "ip1", { limit: 30, now: t0 })).allowed, false);
  assert.equal((await hit(env, "quote", "ip2", { limit: 30, now: t0 })).allowed, true, "other IP unaffected");
  assert.equal((await hit(env, "quote", "ip1", { limit: 30, now: t0 + 60_000 })).allowed, true, "next window");
});

test("rate limit: no database or a failing one never blocks", async () => {
  assert.equal((await hit({}, "quote", "ip", {})).allowed, true);
  const broken = { DB: { prepare() { throw new Error("D1 down"); } } };
  assert.equal((await hit(broken, "quote", "ip", {})).allowed, true);
});

test("turnstile: off without a secret, verifies with one", async () => {
  assert.equal(turnstileOn({}), false);
  assert.equal(await verifyTurnstile({}, undefined, null), true, "off -> always ok");
  const env = { TURNSTILE_SECRET: "s" };
  const ok = async () => ({ json: async () => ({ success: true }) });
  const no = async () => ({ json: async () => ({ success: false }) });
  const down = async () => { throw new Error("network"); };
  assert.equal(await verifyTurnstile(env, "tok", "1.2.3.4", ok), true);
  assert.equal(await verifyTurnstile(env, "tok", "1.2.3.4", no), false);
  assert.equal(await verifyTurnstile(env, "", "1.2.3.4", ok), false, "missing token");
  assert.equal(await verifyTurnstile(env, "tok", null, down), false, "can't verify -> refuse");
});
