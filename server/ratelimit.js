// Small per-IP rate limit kept in D1 (fixed window, e.g. 30 requests a minute).
// Used by POST /api/quote, which calls Google Routes (paid) on every request.
// If the database is missing or fails, the request is allowed – a broken counter must never stop a booking.

// pure helpers (unit-tested)
export const windowStart = (nowMs, windowS) => Math.floor(nowMs / 1000 / windowS) * windowS;
export const rateKey = (scope, ipHash, nowMs, windowS) => `${scope}:${ipHash}:${windowStart(nowMs, windowS)}`;
export const overLimit = (count, limit) => count > limit;

let ready = false;
export async function hit(env, scope, ipHash, { limit = 30, windowS = 60, now = Date.now() } = {}) {
  if (!env.DB || !ipHash) return { allowed: true, count: 0 };
  try {
    if (!ready) {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_hits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, win INTEGER NOT NULL)").run();
      ready = true;
    }
    const k = rateKey(scope, ipHash, now, windowS), win = windowStart(now, windowS);
    const row = await env.DB.prepare(
      "INSERT INTO rate_hits (k, n, win) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n"
    ).bind(k, win).first();
    const count = row ? row.n : 1;
    // now and then, drop old windows (cheap, no cron needed)
    if (count === 1 && Math.random() < 0.05) await env.DB.prepare("DELETE FROM rate_hits WHERE win < ?").bind(win - 3600).run();
    return { allowed: !overLimit(count, limit), count };
  } catch (e) {
    console.log("rate limit", e.message);
    return { allowed: true, count: 0 };
  }
}
