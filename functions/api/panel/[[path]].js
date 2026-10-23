// /api/panel/* – LITE owner panel (page: /panel/#<secret>). Login with PIN, request report + CSV, status marks, price editor.
import { json, sha } from "../../../server/util.js";
import { fromOurSite } from "../../../server/guard.js";
import { CONFIG } from "../../../server/config.js";
import { login, logout, sessionOk, panelReady } from "../../../server/panel.js";
import { period, report, setStatus, toCsv, deleteOld, ldb } from "../../../server/leads.js";
import { checkPrices, diffPrices, mergeEdit, pricesText } from "../../../server/prices.js";
import { githubReady, readPrices, writePrices } from "../../../server/github.js";
import { randomId } from "../../../server/util.js";
import { OWNER, BRAND, EX } from "../../../server/brand.js";

const ipOf = (request, env) => sha((request.headers.get("cf-connecting-ip") || "") + (env.LEAD_SALT || "taxi-lite"));
const P = CONFIG.panel || { villages: [], destinations: [], zones: [] };
const known = { villages: P.villages.map((v) => v.slug), destinations: P.destinations.map((d) => d.slug), zones: P.zones };
const names = { villages: Object.fromEntries(P.villages.map((v) => [v.slug, v.name])),
  destinations: Object.fromEntries(P.destinations.map((d) => [d.slug, d.short])) };

async function body(request) { try { return await request.json(); } catch { return null; } }

export async function onRequest({ request, env, params, waitUntil }) {
  const path = (params.path || []).join("/"), method = request.method;
  if (!CONFIG.lite) return json({ error: "off" }, 404);
  if (method === "POST" && !fromOurSite(request)) return json({ error: "origin" }, 403);
  try {
    if (path === "login" && method === "POST") {
      const b = (await body(request)) || {};
      const r = await login(env, b, await ipOf(request, env));
      if (r.error === "slug") return json({ error: "not found" }, 404);
      if (r.error === "setup") return json({ error: "setup" }, 503);
      if (r.error === "locked") return json(r, 429, { "retry-after": String(r.retryS) });
      if (r.error) return json(r, 401);
      waitUntil(deleteOld(env).catch(() => {}));   // 12-month clean-up also when the site is quiet
      return json({ ok: true }, 200, { "set-cookie": r.cookie });
    }
    if (path === "status" && method === "GET") return json({ ready: panelReady(env), editor: githubReady(env) });

    if (!(await sessionOk(env, request))) return json({ error: "login" }, 401);

    if (path === "logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": await logout(env, request) });

    if ((path === "report" || path === "report.csv") && method === "GET") {
      const q = new URL(request.url).searchParams;
      const per = q.get("from") ? period({ from: q.get("from"), to: q.get("to") }) : period(q.get("p") || "dzis");
      const rep = await report(env, per);
      if (path === "report.csv") {
        return new Response(toCsv(rep.items), { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
          "content-disposition": `attachment; filename="zapytania_${per.from}_${per.to}.csv"` } });
      }
      return json(rep);
    }

    const m = /^lead\/([a-z0-9]{6,40})$/.exec(path);
    if (m && method === "POST") {
      const b = (await body(request)) || {};
      return (await setStatus(env, m[1], b.status ?? null)) ? json({ ok: true }) : json({ error: "status" }, 400);
    }

    if (path === "prices" && method === "GET") {
      const out = { names: P, editor: githubReady(env) };
      if (githubReady(env)) { const r = await readPrices(env); out.prices = r.prices; out.sha = r.sha; }
      else out.prices = CONFIG.prices;
      return json(out);
    }
    if (path === "prices/preview" && method === "POST") {
      const b = (await body(request)) || {};
      const cur = githubReady(env) ? (await readPrices(env)).prices : CONFIG.prices;
      const next = mergeEdit(cur, b.edit || {});
      return json({ changes: diffPrices(cur, next, names), errors: checkPrices(next, known) });
    }
    if (path === "prices" && method === "POST") {
      if (!githubReady(env)) return json({ error: "editor" }, 503);
      const b = (await body(request)) || {};
      const cur = await readPrices(env);
      if (!b.sha || b.sha !== cur.sha) return json({ error: "conflict" }, 409);
      const next = mergeEdit(cur.prices, b.edit || {});
      const errors = checkPrices(next, known);
      if (errors.length) return json({ error: "invalid", errors }, 400);
      const changes = diffPrices(cur.prices, next, names);
      if (!changes.length) return json({ error: "nochange" }, 400);
      const message = `Ceny (panel): ${changes.slice(0, 10).join("; ")}${changes.length > 10 ? "; …" : ""}`;
      const w = await writePrices(env, { text: pricesText(next), sha: cur.sha, message });
      if (w.conflict) return json({ error: "conflict" }, 409);
      const db = await ldb(env);
      await db.prepare("INSERT INTO price_changes (id, ts, commit_sha, version, summary, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(randomId(14), Date.now(), w.commit || null, next.version, changes.join("\n"), await ipOf(request, env)).run();
      waitUntil(alert(env, changes, w.commit).catch((e) => console.log("alert", e.message)));
      return json({ ok: true, commit: w.commit, version: next.version, changes });
    }
    if (path === "history" && method === "GET") {
      const db = await ldb(env);
      const { results = [] } = await db.prepare("SELECT ts, commit_sha, version, summary FROM price_changes ORDER BY ts DESC LIMIT 20").all();
      return json({ items: results });
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.log("panel", path, e.message);
    return json({ error: e.status === 401 || e.status === 403 ? "github" : "server" }, 502);
  }
}

// e-mail to the seller on every price change (Resend; optional – a failed e-mail never fails the save)
async function alert(env, changes, commit) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) return;
  const text = `${OWNER.nom} zmienił ceny w panelu:\n\n${changes.join("\n")}\n\nCommit: ${commit || "?"}\nCofnięcie: git revert ${commit || "<commit>"}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.ALERT_FROM || "Taxi panel <onboarding@resend.dev>", to: [env.ALERT_EMAIL], subject: "Taxi Lite: zmiana cen", text }),
  });
}
