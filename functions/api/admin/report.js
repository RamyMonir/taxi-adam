// GET /api/admin/report?key=ADMIN_KEY&okres=miesiąc  (or &from=2026-10-01&to=2026-10-31)
//   &format=csv  -> file for Excel / Google Sheets;  default: the same summary as /raport in Telegram (plain text)
import { parsePeriod, buildReport } from "../../../server/report.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), q = url.searchParams;
  if (!env.ADMIN_KEY || q.get("key") !== env.ADMIN_KEY) return new Response("forbidden", { status: 403 });
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const per = iso.test(q.get("from") || "") && iso.test(q.get("to") || "") ? { from: q.get("from"), to: q.get("to") } : parsePeriod(q.get("okres") || "");
  if (!per) return new Response("okres: dziś, wczoraj, tydzień, miesiąc, zeszły miesiąc, rok, 12.10, 01.10-15.10 – albo from/to (RRRR-MM-DD)", { status: 400 });
  const rep = await buildReport(env, per.from, per.to);
  if (q.get("format") === "csv") {
    return new Response(rep.csv, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
      "content-disposition": `attachment; filename="raport_${per.from}_${per.to}.csv"` } });
  }
  const text = rep.text.replace(/<[^>]+>/g, "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
