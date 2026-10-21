# -*- coding: utf-8 -*-
"""Tabela cen „od” z każdej miejscowości na 6 lotnisk (do potwierdzenia z Adamem).
Uruchom:  py scripts/price_table.py   (wynik w Markdown; * = wyjątek z prices.json)"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from data import VILLAGES, DESTINATIONS, ZONES, OVERRIDES

air = [d for d in DESTINATIONS if d["kind"] == "airport"]
print("| Miejscowość | Strefa | Lokalny | " + " | ".join(d["short"] for d in air) + " |")
print("|---|---|---|" + "---|" * len(air))
for slug, name, _loc, zone, local in VILLAGES:
    cells = []
    for d in air:
        o = OVERRIDES.get(slug, {}).get(d["slug"])
        cells.append(f"{o} *" if o is not None else str(d["price"] + ZONES[zone]["surcharge"]))
    print(f"| {name} | {zone} | {local} | " + " | ".join(cells) + " |")
