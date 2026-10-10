// Google Routes API (server key). Falls back to a straight-line estimate when no key is set
// or Google fails, so booking still works.
import { kmBetween, hasXY } from "./util.js";

const ll = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

export async function route(env, from, to, traffic = false) {
  if (!hasXY(from) || !hasXY(to)) return null;
  if (env.GOOGLE_SERVER_KEY) {
    try {
      const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_SERVER_KEY,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: ll(from), destination: ll(to), travelMode: "DRIVE",
          routingPreference: traffic ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE", languageCode: "pl", units: "METRIC",
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const x = j.routes && j.routes[0];
        if (x && x.distanceMeters != null) {
          return { distanceM: x.distanceMeters, durationS: parseInt(x.duration, 10) || 0, polyline: x.polyline?.encodedPolyline || null, approx: false };
        }
      } else {
        console.log("routes api", r.status, await r.text());
      }
    } catch (e) { console.log("routes api error", e); }
  }
  // fallback: road ≈ 1.3 × straight line, average 55 km/h
  const km = kmBetween(from, to) * 1.3;
  return { distanceM: Math.round(km * 1000), durationS: Math.round((km / 55) * 3600) + 120, polyline: null, approx: true };
}

export async function reviews(env) {
  if (!env.GOOGLE_SERVER_KEY || !env.GOOGLE_PLACE_ID) return null;
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(env.GOOGLE_PLACE_ID)}?languageCode=pl`, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_SERVER_KEY, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
  });
  if (!r.ok) { console.log("places api", r.status, await r.text()); return null; }
  const j = await r.json();
  const list = (j.reviews || [])
    .map((v) => ({
      author: v.authorAttribution?.displayName || "Klient Google",
      authorUri: v.authorAttribution?.uri || null,
      photo: v.authorAttribution?.photoUri || null,
      rating: v.rating || 0,
      text: (v.originalText?.text || v.text?.text || "").trim(),
      when: v.relativePublishTimeDescription || "",
      uri: v.googleMapsUri || null,
    }))
    .filter((v) => v.rating >= 4 && v.text.length >= 20)
    // best first: 5 stars, then reviews with more to say (but not walls of text)
    .sort((a, b) => b.rating - a.rating || Math.min(b.text.length, 400) - Math.min(a.text.length, 400));
  return { rating: j.rating || null, count: j.userRatingCount || null, url: j.googleMapsUri || null, reviews: list };
}
