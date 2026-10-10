// Google Routes API (server key). Falls back to a straight-line estimate when no key is set
// or Google fails, so booking still works.
import { kmBetween, hasXY } from "./util.js";
import { CONFIG } from "./config.js";

const ll = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

export async function route(env, from, to, traffic = false) {
  if (!hasXY(from) || !hasXY(to)) return null;
  if (env.GOOGLE_SERVER_KEY) {
    try {
      // ROUTES_API_BASE only for local tests with a fake Routes server
      const r = await fetch(`${env.ROUTES_API_BASE || "https://routes.googleapis.com"}/directions/v2:computeRoutes`, {
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

// Google's error text (e.g. "API not enabled", "invalid place ID") – no secrets, safe to show in diagnostics
async function googleError(r) {
  const t = await r.text();
  try { const j = JSON.parse(t); return `${r.status} ${j.error?.status || ""}: ${j.error?.message || t}`.slice(0, 300); } catch { return `${r.status}: ${t.slice(0, 200)}`; }
}


export async function reviews(env) {
  // all of Adam's Google listings (src/data.py GOOGLE_PLACES); GOOGLE_PLACE_ID only as an old fallback
  let places = (CONFIG.places || []).map((p) => ({ name: p.name, id: p.id }));
  if (!places.length && env.GOOGLE_PLACE_ID) places = [{ name: "", id: (env.GOOGLE_PLACE_ID.match(/ChIJ[\w-]+/) || [env.GOOGLE_PLACE_ID.trim()])[0] }];
  if (!env.GOOGLE_SERVER_KEY || !places.length) throw new Error("GOOGLE_SERVER_KEY or places not set");
  const got = await Promise.allSettled(places.map(async (p) => {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(p.id)}?languageCode=pl`, {
      headers: { "X-Goog-Api-Key": env.GOOGLE_SERVER_KEY,
                 "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews,googleMapsUri,nationalPhoneNumber,formattedAddress" },
    });
    if (!r.ok) throw new Error("Places API: " + (await googleError(r)));
    return { p, j: await r.json() };
  }));
  const ok = got.filter((g) => g.status === "fulfilled").map((g) => g.value);
  if (!ok.length) throw new Error(got[0].reason?.message || "Places API failed");
  const out = ok.map(({ p, j }) => ({
    name: p.name || j.displayName?.text || "", rating: j.rating || null, count: j.userRatingCount || 0, url: j.googleMapsUri || null,
    write: `https://search.google.com/local/writereview?placeid=${p.id}`, phone: j.nationalPhoneNumber || null, address: tidy(j.formattedAddress),
  }));
  const seen = new Set();
  const list = ok.flatMap(({ p, j }) => (j.reviews || []).map((v) => ({
      author: v.authorAttribution?.displayName || "Klient Google",
      authorUri: v.authorAttribution?.uri || null,
      photo: v.authorAttribution?.photoUri || null,
      rating: v.rating || 0,
      text: (v.originalText?.text || v.text?.text || "").trim(),
      when: v.relativePublishTimeDescription || "",
      uri: v.googleMapsUri || null,
      place: p.name || j.displayName?.text || "",
    })))
    .filter((v) => v.rating >= 4 && v.text.length >= 10)
    .filter((v) => { const k = v.author + "|" + v.text.slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    // best first: 5 stars, then reviews with more to say (but not walls of text)
    .sort((a, b) => b.rating - a.rating || Math.min(b.text.length, 400) - Math.min(a.text.length, 400));
  const count = out.reduce((s, x) => s + (x.rating ? x.count : 0), 0);
  const rating = count ? Math.round(out.reduce((s, x) => s + (x.rating || 0) * x.count, 0) / count * 10) / 10 : null;
  return { rating, count, url: out[0].url, write: out[0].write, places: out, fetched: list.length, reviews: list };
}

/* ---------- addresses: Places API (New) + Geocoding, called from our own /api so no key sits in the page ---------- */
const BIAS = (c) => ({ circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 50000 } });
const tidy = (a) => String(a || "").replace(/,\s*(Polska|Poland)$/i, "");

export async function autocomplete(env, input, session, center) {
  const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_SERVER_KEY,
               "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" },
    body: JSON.stringify({ input, sessionToken: session, languageCode: "pl", regionCode: "pl",
                           includedRegionCodes: ["pl", "cz", "sk", "de"], locationBias: BIAS(center) }),
  });
  if (!r.ok) throw new Error("Autocomplete: " + (await googleError(r)));
  const j = await r.json();
  return (j.suggestions || []).map((s) => s.placePrediction).filter(Boolean).slice(0, 6).map((p) => ({
    id: p.placeId,
    main: p.structuredFormat?.mainText?.text || p.text?.text || "",
    sub: tidy(p.structuredFormat?.secondaryText?.text || ""),
  }));
}

export async function placeDetails(env, id, session) {
  const q = session ? `?languageCode=pl&sessionToken=${encodeURIComponent(session)}` : "?languageCode=pl";
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${q}`, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_SERVER_KEY, "X-Goog-FieldMask": "location,formattedAddress,displayName,types" },
  });
  if (!r.ok) throw new Error("Place details: " + (await googleError(r)));
  const j = await r.json();
  const fa = tidy(j.formattedAddress), dn = j.displayName?.text || "";
  const isAddress = (j.types || []).some((t) => ["street_address", "premise", "subpremise", "route", "locality"].includes(t));
  return { address: !isAddress && dn && !fa.startsWith(dn) ? `${dn}, ${fa}` : fa, lat: j.location?.latitude, lng: j.location?.longitude };
}

// GPS -> {address, near}. near = closest known place, not the exact street address. Geocoding API first; if that API isn't enabled on the key, nearest place from Places API (New).
export async function reverseGeocode(env, lat, lng) {
  const g = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pl&result_type=street_address|premise|route&key=${env.GOOGLE_SERVER_KEY}`);
  const j = await g.json().catch(() => ({}));
  if (j.status === "OK" && j.results?.[0]) return { address: tidy(j.results[0].formatted_address), near: false };
  if (j.status && j.status !== "ZERO_RESULTS") { console.log("geocoding", j.status, j.error_message); reverseGeocode.lastStatus = j.status; }
  // nearest known place, searching wider until something is found (outskirts, fields, motorway)
  for (const radius of [80, 400, 2000]) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_SERVER_KEY, "X-Goog-FieldMask": "places.formattedAddress" },
      body: JSON.stringify({ maxResultCount: 1, rankPreference: "DISTANCE", languageCode: "pl",
                             locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    if (!r.ok) throw new Error("Reverse geocode: " + (await googleError(r)));
    const a = (await r.json()).places?.[0]?.formattedAddress;
    if (a) return { address: tidy(a), near: true };
  }
  return null;
}

// typed text that wasn't picked from the suggestions -> coordinates
export async function findPlace(env, text, center) {
  const r = await fetch(`${env.PLACES_API_BASE || "https://places.googleapis.com"}/v1/places:searchText`, {   // override only for local tests
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_SERVER_KEY, "X-Goog-FieldMask": "places.location,places.formattedAddress,places.displayName" },
    body: JSON.stringify({ textQuery: text, languageCode: "pl", regionCode: "pl", pageSize: 1, locationBias: BIAS(center) }),
  });
  if (!r.ok) throw new Error("Text search: " + (await googleError(r)));
  const p = (await r.json()).places?.[0];
  return p ? { address: tidy(p.formattedAddress), name: p.displayName?.text || "", lat: p.location.latitude, lng: p.location.longitude } : null;
}
