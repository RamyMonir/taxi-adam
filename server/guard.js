// Address/flight lookups cost money per call, so only our own pages may use them,
// and identical lookups are answered from Cloudflare's edge cache.
export function fromOurSite(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const ref = request.headers.get("referer") || request.headers.get("origin");
  try { return !!ref && new URL(ref).host === new URL(request.url).host; } catch { return false; }
}

export async function cached(request, waitUntil, seconds, make) {
  const key = new Request(request.url, { method: "GET" });
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const res = await make();
  if (res.status === 200) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set("cache-control", `public, max-age=${seconds}`);
    waitUntil(caches.default.put(key, copy));
  }
  return res;
}
