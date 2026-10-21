// POST /api/lead – LITE: the customer tapped WhatsApp / SMS / Zadzwoń (sent with sendBeacon from /assets/lite.js).
// Always answers 204: the customer never waits for this and never sees an error. Spam is dropped silently.
import { sha } from "../../server/util.js";
import { hit } from "../../server/ratelimit.js";
import { fromOurSite } from "../../server/guard.js";
import { cleanLead, insertLead, ldb } from "../../server/leads.js";

const MAX_BYTES = 4096, PER_HOUR = 20;
const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  try {
    if (!fromOurSite(request)) return done();
    const text = await request.text();
    if (!text || text.length > MAX_BYTES) return done();
    let body; try { body = JSON.parse(text); } catch { return done(); }
    const row = cleanLead(body);
    if (!row) return done();
    await ldb(env);   // tables incl. the rate limiter's
    const ip = await sha((request.headers.get("cf-connecting-ip") || "") + (env.LEAD_SALT || "taxi-lite"));
    const rl = await hit(env, "lead", ip, { limit: PER_HOUR, windowS: 3600 });
    if (!rl.allowed) return done();
    await insertLead(env, row, ip);
  } catch (e) {
    console.log("lead", e.message);   // e.g. no database yet – the tap still worked for the customer
  }
  return done();
}
