// Test helper: a Cloudflare D1-like database on Node's built-in SQLite (same SQL engine as D1).
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.db, this.sql, a); }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
}

export function d1() {
  const db = new DatabaseSync(":memory:");
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
  };
}
