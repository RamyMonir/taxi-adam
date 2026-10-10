// GET /api/reviews – best Google reviews (Places API), cached for 12 h at the edge.
import { json } from "../../server/util.js";
import { reviews } from "../../server/google.js";

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL("/api/reviews?v=1", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const data = await reviews(env).catch(() => null);
  if (!data) return json({ reviews: [] }, 200, { "cache-control": "public, max-age=300" });
  const res = json(data, 200, { "cache-control": "public, max-age=43200" });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
