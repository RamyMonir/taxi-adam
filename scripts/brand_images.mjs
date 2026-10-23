// Placeholder branding for a new client: draws the logo files, app icons and the sharing image with headless Chrome.
//   node scripts/brand_images.mjs "TAXI PRZYKŁAD" "MIASTO · OKOLICE"
// Writes (same file names the site uses): src/assets/img/logo-emblem.webp|png, logo-wide.webp, logo.webp,
// src/assets/favicon.png, icon-192.png, icon-512.png, og.png. Replace them later with the client's real logo.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [title = "TAXI", sub = ""] = process.argv.slice(2);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// a round taxi emblem (roof sign + car front) – pure SVG, no fonts needed except the "TAXI" label
const EMBLEM = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD84D"/><stop offset="1" stop-color="#FF9F0A"/></linearGradient></defs>
  <circle cx="50" cy="50" r="46" fill="none" stroke="url(#g)" stroke-width="8"/>
  <rect x="36" y="24" width="28" height="11" rx="2.5" fill="#FFC81E" stroke="#0A1430" stroke-width="1.5"/>
  <text x="50" y="32.6" font-family="Arial Black,Arial" font-weight="900" font-size="7.5" text-anchor="middle" fill="#0A1430">TAXI</text>
  <path d="M22 66 L29 49 Q31 44 37 44 H63 Q69 44 71 49 L78 66 V74 H22 Z" fill="#FFC81E"/>
  <path d="M33 50 H67 L71 60 H29 Z" fill="#9FC3E0" opacity=".9"/>
  <circle cx="31" cy="66" r="4" fill="#fff"/><circle cx="69" cy="66" r="4" fill="#fff"/>
  <rect x="40" y="64" width="20" height="4" rx="1.5" fill="#0A1430" opacity=".55"/>
  <rect x="24" y="74" width="10" height="7" rx="2" fill="#0A1430"/><rect x="66" y="74" width="10" height="7" rx="2" fill="#0A1430"/>
</svg>`;
const T = esc(title), S = esc(sub);
const font = `font-family:'Arial Black',Arial,sans-serif;font-weight:900;letter-spacing:.02em`;
const JOBS = [
  { file: "src/assets/img/logo-emblem.webp", w: 480, h: 377, fmt: "webp", html: `<div style="display:grid;place-items:center;height:100%">${EMBLEM(360)}</div>` },
  { file: "src/assets/img/logo-emblem.png", w: 480, h: 377, fmt: "png", html: `<div style="display:grid;place-items:center;height:100%">${EMBLEM(360)}</div>` },
  { file: "src/assets/img/logo-wide.webp", w: 900, h: 298, fmt: "webp",
    html: `<div style="display:flex;align-items:center;gap:30px;height:100%;padding:0 30px">${EMBLEM(240)}<div><div style="${font};font-size:78px;color:#fff;line-height:1">${T}</div><div style="font:700 30px Arial;color:#FFC81E;margin-top:12px;letter-spacing:.12em">${S}</div></div></div>` },
  { file: "src/assets/img/logo.webp", w: 560, h: 671, fmt: "webp",
    html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center">${EMBLEM(380)}<div style="${font};font-size:70px;color:#fff;line-height:1.05;margin-top:24px">${T}</div><div style="font:700 26px Arial;color:#FFC81E;margin-top:14px;letter-spacing:.12em">${S}</div></div>` },
  { file: "src/assets/og.png", w: 1200, h: 630, fmt: "png", bg: "#0A1430",
    html: `<div style="display:flex;align-items:center;gap:50px;height:100%;padding:0 80px;background:linear-gradient(135deg,#0A1430,#1A2C5E)">${EMBLEM(360)}<div><div style="${font};font-size:84px;color:#fff;line-height:1.05">${T}</div><div style="font:700 34px Arial;color:#FFC81E;margin-top:18px;letter-spacing:.1em">${S}</div></div></div>` },
  ...[["src/assets/favicon.png", 64], ["src/assets/icon-192.png", 192], ["src/assets/icon-512.png", 512]].map(([file, s]) => ({
    file, w: s, h: s, fmt: "png", bg: "#0A1430",
    html: `<div style="display:grid;place-items:center;height:100%;background:#0A1430">${EMBLEM(Math.round(s * 0.78))}</div>` })),
];

const prof = mkdtempSync(join(tmpdir(), "brandimg-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=9335", `--user-data-dir=${prof}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 60; i++) { try { targets = await (await fetch("http://127.0.0.1:9335/json")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const P = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (P.has(m.id)) { P.get(m.id)(m); P.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
for (const j of JOBS) {
  await send("Emulation.setDeviceMetricsOverride", { width: j.w, height: j.h, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: j.bg ? { r: 10, g: 20, b: 48, a: 1 } : { r: 0, g: 0, b: 0, a: 0 } });
  const html = `<!doctype html><html><body style="margin:0;width:${j.w}px;height:${j.h}px;overflow:hidden;background:transparent">${j.html}</body></html>`;
  await send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) }); await sleep(400);
  const r = await send("Page.captureScreenshot", { format: j.fmt, quality: j.fmt === "webp" ? 90 : undefined, clip: { x: 0, y: 0, width: j.w, height: j.h, scale: 1 } });
  writeFileSync(join(ROOT, j.file), Buffer.from(r.result.data, "base64"));
  console.log("wrote", j.file);
}
ws.close(); chrome.kill(); process.exit(0);
