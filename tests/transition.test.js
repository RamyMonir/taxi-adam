// State transitions with a tiny in-memory stand-in for D1 (only the ride queries used by load / save / saveIfUnchanged).
import { test } from "node:test";
import assert from "node:assert/strict";
import { transition, save, load, saveIfUnchanged } from "../server/rides.js";

function fakeD1() {
  const rides = new Map();
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async run() {
      if (/^\s*INSERT INTO rides/.test(sql)) {
        const [id, token, status, mode, created, updated, eta_at, tg_msg, ip, data] = args;
        const old = rides.get(id);
        rides.set(id, old ? { ...old, status, updated, eta_at, tg_msg, data } : { id, token, status, mode, created, updated, eta_at, tg_msg, ip, data });
        return { meta: { changes: 1 } };
      }
      if (/^\s*UPDATE rides SET status = \?1/.test(sql)) {
        const [status, eta_at, data, updated, id, prev, tg_msg] = args, row = rides.get(id);
        if (!row || row.updated !== prev) return { meta: { changes: 0 } };
        rides.set(id, { ...row, status, eta_at, data, updated, tg_msg });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };   // CREATE / ALTER / trips log: not needed here
    },
    async first() { return /FROM rides WHERE id = \?/.test(sql) ? (rides.get(args[0]) ? { ...rides.get(args[0]) } : null) : null; },
    async all() { return { results: [] }; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())), rides };
}

const newRide = (status) => ({ id: "r1", token: "t".repeat(24), status, mode: "now", created: Date.now(), ip: "x", eta_at: null, tg_msg: 5,
                               data: { driverId: "d1", pickup: { address: "A" }, dest: { address: "B" } } });

test("transition moves only from an allowed status", async () => {
  const env = { DB: fakeD1() };
  await save(env, newRide("enroute"));
  const r = await transition(env, "r1", ["enroute"], (x) => { x.status = "arrived"; });
  assert.equal(r.status, "arrived");
  assert.equal(await transition(env, "r1", ["enroute"], (x) => { x.status = "arrived"; }), null);
  assert.equal((await load(env, "r1")).status, "arrived");
});

test("customer cancel and driver tap at the same moment: one wins, the other is refused (no revival)", async () => {
  const env = { DB: fakeD1() };
  await save(env, newRide("enroute"));
  let release;
  const gate = new Promise((res) => { release = res; });
  // the driver's "arrived" read the ride, then is slow (e.g. a Telegram call) before writing
  const driver = transition(env, "r1", ["enroute"], async (x) => { await gate; x.status = "arrived"; });
  await new Promise((r) => setTimeout(r, 5));
  const cancel = await transition(env, "r1", ["pending", "scheduled", "enroute", "arrived", "ontrip"], (x) => { x.status = "cancelled"; x.data.cancelledBy = "client"; });
  assert.equal(cancel.status, "cancelled");
  release();
  assert.equal(await driver, null);                        // his stale write lost, and the re-check saw "cancelled"
  const now = await load(env, "r1");
  assert.equal(now.status, "cancelled"); assert.equal(now.data.cancelledBy, "client");
});

test("saveIfUnchanged refuses a stale copy (two drivers accepting)", async () => {
  const env = { DB: fakeD1() };
  await save(env, newRide("pending"));
  const a = await load(env, "r1"), b = await load(env, "r1");
  a.status = "enroute"; a.data.driverId = "A";
  b.status = "enroute"; b.data.driverId = "B";
  assert.equal(await saveIfUnchanged(env, a, a.updated), true);
  assert.equal(await saveIfUnchanged(env, b, b.updated), false);
  assert.equal((await load(env, "r1")).data.driverId, "A");
});

test("mutate returning false aborts without writing", async () => {
  const env = { DB: fakeD1() };
  await save(env, newRide("scheduled"));
  const before = (await load(env, "r1")).updated;
  assert.equal(await transition(env, "r1", ["scheduled"], () => false), null);
  assert.equal((await load(env, "r1")).updated, before);
});
