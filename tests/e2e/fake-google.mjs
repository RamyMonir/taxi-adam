// fake Google Places (text search) + Routes on :8998 for the dispatch test
import http from "node:http";
const PLACES = [[/rynek/i, "Rynek 1, 44-190 Knurów", 50.2197, 18.6767], [/gliwice/i, "Dworzec PKP, Gliwice", 50.3008, 18.6635],
                [/pyrzowice|lotnisko/i, "Lotnisko Katowice-Pyrzowice", 50.4743, 19.08], [/.*/, "Szpitalna 1, Knurów", 50.215, 18.67]];
// + fake AeroDataBox for tests/e2e/auto.mjs: POST /_flight {number, sched, rev, status} sets a flight landing in Katowice
const FLIGHTS = {};
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const j = JSON.parse(body || "{}"); res.setHeader("content-type", "application/json");
    if (req.url === "/_flight") { FLIGHTS[j.number] = j; return res.end("{}"); }
    const fm = req.url.match(/\/flights\/number\/([A-Z0-9]+)\//);
    if (fm) {
      const f = FLIGHTS[fm[1]];
      if (!f) { res.statusCode = 404; return res.end("[]"); }
      return res.end(JSON.stringify([{ number: f.number, airline: { name: "Ryanair" }, status: f.status || "Delayed",
        departure: { airport: { iata: "STN", name: "London" }, scheduledTime: { local: f.sched.slice(0, 10) + " 10:00+01:00" } },
        arrival: { airport: { iata: "KTW", name: "Katowice" }, scheduledTime: { local: f.sched + "+02:00" }, revisedTime: { local: f.rev + "+02:00" } } }]));
    }
    if (req.url.includes("searchText")) {
      const [, address, lat, lng] = PLACES.find(([re]) => re.test(j.textQuery || ""));
      res.end(JSON.stringify({ places: [{ formattedAddress: address, displayName: { text: "" }, location: { latitude: lat, longitude: lng } }] }));
    } else {   // Routes: road = 1.3 × straight line at 45 km/h, so nearer drivers really are faster
      const o = j.origin?.location?.latLng || {}, d = j.destination?.location?.latLng || {}, r = Math.PI / 180;
      const h = Math.sin((d.latitude - o.latitude) * r / 2) ** 2 + Math.cos(o.latitude * r) * Math.cos(d.latitude * r) * Math.sin((d.longitude - o.longitude) * r / 2) ** 2;
      const km = 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3 || 12;
      res.end(JSON.stringify({ routes: [{ distanceMeters: Math.round(km * 1000), duration: Math.round(km / 45 * 3600 + 60) + "s", polyline: { encodedPolyline: "" } }] }));
    }
  });
}).listen(8998, () => console.log("fake google on 8998"));
