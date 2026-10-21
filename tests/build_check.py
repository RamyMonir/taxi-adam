# -*- coding: utf-8 -*-
"""LITE build check: builds the full version and the LITE version and compares them.
- LITE pages make no calls to Google APIs, Google sign-in or Turnstile; the only API paths are /api/lead and /api/panel/
- every page of the full version exists in LITE (except /przejazd/ and /konto/, the noindex app pages) with the same <title>
- the WhatsApp button and the exact fine print are on every page with a booking box
Run: py tests/build_check.py   (rebuilds dist/ as LITE at the end)"""
import os, re, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DIST = os.path.join(ROOT, "dist")
FINE = "*Wszelkie dodatkowe opłaty pokrywa zamawiający (parkingi, wjazdy na tereny płatne itd.)."

def build(lite):
    env = {**os.environ, "TAXI_LITE": "1" if lite else "0"}
    shutil.rmtree(DIST, ignore_errors=True)
    subprocess.run([sys.executable, os.path.join(ROOT, "src", "build.py")], check=True, env=env, stdout=subprocess.DEVNULL)
    pages = {}
    for d, _, files in os.walk(DIST):
        for f in files:
            if f.endswith(".html"):
                p = os.path.join(d, f)
                pages["/" + os.path.relpath(p, DIST).replace("\\", "/")] = open(p, encoding="utf-8").read()
    return pages

title = lambda h: (re.search(r"<title>(.*?)</title>", h) or [None, None])[1]
full = build(False)
lite = build(True)
problems = []

for path, html in lite.items():
    for bad in ("maps.googleapis.com", "accounts.google.com/gsi", "challenges.cloudflare.com", "/assets/app.js"):
        if bad in html: problems.append(f"{path}: contains {bad}")
    for api in re.findall(r"/api/[a-z0-9_./-]+", html):
        if api != "/api/lead" and not api.startswith("/api/panel/"): problems.append(f"{path}: calls {api}")
    if 'id="booking"' in html:
        if 'id="go-wa"' not in html: problems.append(f"{path}: no WhatsApp button")
        if FINE not in html: problems.append(f"{path}: fine print missing")
for js in ("lite.js", "lite-msg.js", "panel.js"):
    src = open(os.path.join(DIST, "assets", js), encoding="utf-8").read()
    if "googleapis" in src or "accounts.google" in src: problems.append(f"assets/{js}: calls Google")
    for api in re.findall(r"/api/[a-z0-9_./-]+", src):
        if api != "/api/lead" and not api.startswith("/api/panel"): problems.append(f"assets/{js}: calls {api}")

gone = {"/przejazd/index.html", "/konto/index.html"}
for path in full:
    if path in gone: continue
    if path not in lite: problems.append(f"missing page {path}"); continue
    if title(full[path]) != title(lite[path]): problems.append(f"title changed on {path}: {title(lite[path])!r}")
extra = set(lite) - set(full) - {"/panel/index.html"}
if extra: problems.append(f"unexpected pages: {sorted(extra)}")
sm = open(os.path.join(DIST, "sitemap.xml"), encoding="utf-8").read()
if "/panel/" in sm or "/przejazd/" in sm: problems.append("sitemap lists panel or status page")

if problems:
    print("build_check: FAILED\n  " + "\n  ".join(problems)); sys.exit(1)
print(f"build_check: OK – {len(lite)} LITE pages, {len(full)} full pages, no Google/Turnstile calls, only /api/lead and /api/panel/")
