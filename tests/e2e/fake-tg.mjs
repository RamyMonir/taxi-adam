import http from "node:http";
import fs from "node:fs";
let mid = 1000; const log = [];
const jpeg = fs.readFileSync(process.env.PHOTO_FILE || new URL("../../src/assets/icon-192.png", import.meta.url));
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    if (req.url === "/_log") { res.end(JSON.stringify(log)); return; }
    if (req.url === "/_reset") { log.length = 0; res.end("ok"); return; }
    if (req.url.startsWith("/file/")) { res.setHeader("content-type", "image/jpeg"); res.end(jpeg); return; }
    const method = req.url.split("/").pop();
    let j = {}; try { j = JSON.parse(body || "{}"); } catch { j = { raw: "multipart" }; }
    log.push({ method, ...j });
    let result = { message_id: ++mid };
    if (method === "getMe") result = { username: "taxi_test_bot" };
    if (method === "getFile") result = { file_id: j.file_id, file_path: "photos/p.jpg", file_size: jpeg.length };
    if (method === "getUserProfilePhotos") result = { total_count: 1, photos: [[{ file_id: "PROF_S", width: 160, height: 160 }, { file_id: "PROF_M", width: 640, height: 640 }]] };
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true, result }));
  });
}).listen(8999, () => console.log("fake tg on 8999"));
