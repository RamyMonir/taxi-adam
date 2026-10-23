# -*- coding: utf-8 -*-
"""Template check: the built site (full + LITE) and server/config.js contain NO data of a previous client
(Taxi Knurów Adam Mączka – the first client of this system), and every phone / WhatsApp link is the business's own number.
Run: py tests/leak_check.py   (rebuilds dist/ as LITE at the end)
For a new client add the previous client's markers to OLD_CLIENT below before you hand the site over."""
import hashlib, os, re, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DIST = os.path.join(ROOT, "dist")
sys.path.insert(0, os.path.join(ROOT, "src"))
from data import BUSINESS as B, PHONE2

OLD_CLIENT = ["Adam", "Mączk", "Knur", "Gierałt", "Fest", "taxifest", "taxiknurowadam", "taxi-adam.pages.dev", "jo.pako",
              "570 762 777", "570762777", "515 650 750", "515650750", "884 682 430", "884682430", "61569049205468",
              "ChIJCVqphGI1EUcRyoJoD4bKXYg", "ChIJ92CbSAA1EUcRbEW2Me1Sww8", "ChIJGfOL1rg3EUcRot_Kp3g-XCE", "33873511500",
              "Jetour", "Czerwionka", "Przyszowic", "Bojków"]
# the first client's logo / icon files (SHA-1) – the template must ship its own
OLD_IMAGES = {"9cb51ad51ba73282b2f69c549efa12288411f071", "519e18670cff308ecea40b6ebe0a2190a0bc90c5", "f7629f6c7ab389d6725832ee5cbe07b8c4617426",
              "9cbbb1532aa1aa6b21c074f6f660539db0f6d532", "9568786e88917fad09d65043cf855f2235e517b1", "6584577be016c6aac4733ce6143dfa08d3c07c5c",
              "c3c714fefc997957533fa9705424929a3c816907", "f4987622466dbc1af36af37e299556f2e9382379"}
ok_numbers = {re.sub(r"\D", "", B["phone_e164"])} | ({re.sub(r"\D", "", PHONE2[1])} if PHONE2 else set()) | \
             {re.sub(r"\D", "", l["phone_e164"]) for l in B["locations"]} | {re.sub(r"\D", "", e) for _, _, e in B["extra_phones"]}
problems = []

def scan(label):
    files = [os.path.join(d, f) for d, _, fs in os.walk(DIST) for f in fs] + [os.path.join(ROOT, "server", "config.js")]
    for p in files:
        rel = os.path.relpath(p, ROOT)
        data = open(p, "rb").read()
        if p.endswith((".png", ".webp", ".jpg", ".woff2")):
            if hashlib.sha1(data).hexdigest() in OLD_IMAGES: problems.append(f"{label}: {rel} is the previous client's image")
            continue
        text = data.decode("utf-8", "ignore")
        for m in OLD_CLIENT:
            if m in text: problems.append(f"{label}: {rel} contains '{m}'")
        for num in re.findall(r"(?:tel:|wa\.me/|sms:)\+?([\d ]{9,15})", text):
            if re.sub(r"\D", "", num) not in ok_numbers: problems.append(f"{label}: {rel} links to a foreign number {num}")

for lite in ("0", "1"):
    subprocess.run([sys.executable, os.path.join(ROOT, "src", "build.py")], check=True, stdout=subprocess.DEVNULL,
                   env={**os.environ, "TAXI_LITE": lite})
    scan("LITE" if lite == "1" else "full")
if os.path.isdir(os.path.join(ROOT, "src", "assets", "img", "fleet")):
    for f in os.listdir(os.path.join(ROOT, "src", "assets", "img", "fleet")):
        if f.startswith(("suv-7", "c5-aircross")): problems.append(f"src/assets/img/fleet/{f}: previous client's car photo")

if problems:
    print("leak_check: FAILED\n  " + "\n  ".join(sorted(set(problems))[:60])); sys.exit(1)
print(f"leak_check: OK – no data of the previous client; phone links only to {', '.join(sorted(ok_numbers))}")
