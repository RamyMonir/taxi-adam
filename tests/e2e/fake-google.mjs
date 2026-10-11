// fake Google Places (text search) + Routes on :8998 for the dispatch test
import http from "node:http";
const PLACES = [[/rynek/i, "Rynek 1, 44-190 Knurów", 50.2197, 18.6767], [/gliwice/i, "Dworzec PKP, Gliwice", 50.3008, 18.6635],
                [/pyrzowice|lotnisko/i, "Lotnisko Katowice-Pyrzowice", 50.4743, 19.08], [/.*/, "Szpitalna 1, Knurów", 50.215, 18.67]];
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const j = JSON.parse(body || "{}"); res.setHeader("content-type", "application/json");
    if (req.url.includes("searchText")) {
      const [, address, lat, lng] = PLACES.find(([re]) => re.test(j.textQuery || ""));
      res.end(JSON.stringify({ places: [{ formattedAddress: address, displayName: { text: "" }, location: { latitude: lat, longitude: lng } }] }));
    } else res.end(JSON.stringify({ routes: [{ distanceMeters: 12000, duration: "900s", polyline: { encodedPolyline: "" } }] }));
  });
}).listen(8998, () => console.log("fake google on 8998"));
