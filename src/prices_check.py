# -*- coding: utf-8 -*-
"""Sprawdzanie pliku src/prices.json (te same zasady co server/prices.js w panelu).
Błędny plik = build się nie uda, a Cloudflare zostawia poprzednią, działającą wersję strony."""

PRICE_MIN, PRICE_MAX = 5, 3000


def _int_in(v, lo, hi):
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


def _num_in(v, lo, hi):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi


def check_prices(p, villages, destinations, zones):
    """-> lista błędów (pusta = OK). villages / destinations / zones = znane slugi."""
    e = []
    if not isinstance(p, dict):
        return ["plik nie jest obiektem JSON"]
    if not _int_in(p.get("version"), 1, 10**9):
        e.append("version: liczba całkowita >= 1")
    z = p.get("zones") or {}
    if sorted(z) != sorted(zones):
        e.append(f"zones: potrzebne dokładnie {', '.join(zones)}")
    e += [f"zones.{k}: 0–200 zł" for k, v in z.items() if not _int_in(v, 0, 200)]
    loc = p.get("local") or {}
    e += [f"local: brak ceny dla {v}" for v in villages if v not in loc]
    for k, v in loc.items():
        if k not in villages: e.append(f"local.{k}: nieznana miejscowość")
        elif not _int_in(v, PRICE_MIN, PRICE_MAX): e.append(f"local.{k}: {PRICE_MIN}–{PRICE_MAX} zł")
    for k, v in (p.get("village_zone") or {}).items():
        if k not in villages: e.append(f"village_zone.{k}: nieznana miejscowość")
        elif v not in zones: e.append(f"village_zone.{k}: nieznana strefa {v}")
    dst = p.get("destinations") or {}
    e += [f"destinations: brak ceny dla {d}" for d in destinations if d not in dst]
    for k, v in dst.items():
        if k not in destinations: e.append(f"destinations.{k}: nieznana trasa")
        elif not isinstance(v, dict) or not _int_in(v.get("price"), PRICE_MIN, PRICE_MAX):
            e.append(f"destinations.{k}.price: {PRICE_MIN}–{PRICE_MAX} zł")
        elif not isinstance(v.get("confirmed", False), bool):
            e.append(f"destinations.{k}.confirmed: true/false")
    for vil, row in (p.get("overrides") or {}).items():
        if vil not in villages: e.append(f"overrides.{vil}: nieznana miejscowość"); continue
        if not isinstance(row, dict): e.append(f"overrides.{vil}: obiekt"); continue
        for d, v in row.items():
            if d not in destinations: e.append(f"overrides.{vil}.{d}: nieznana trasa")
            elif not _int_in(v, PRICE_MIN, PRICE_MAX): e.append(f"overrides.{vil}.{d}: {PRICE_MIN}–{PRICE_MAX} zł")
    w = p.get("waiting") or {}
    if w.get("free_min") is not None and not _int_in(w.get("free_min"), 0, 60): e.append("waiting.free_min: 0–60 min")
    if w.get("per_min") is not None and not _num_in(w.get("per_min"), 0, 20): e.append("waiting.per_min: 0–20 zł")
    t = p.get("tariff") or {}
    if not _num_in(t.get("start"), 0, 100): e.append("tariff.start: 0–100 zł")
    if not _num_in(t.get("per_km"), 0, 20): e.append("tariff.per_km: 0–20 zł")
    if not _num_in(t.get("min"), 0, 200): e.append("tariff.min: 0–200 zł")
    return e
