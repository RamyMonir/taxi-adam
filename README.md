# Taxi Knurów Adam Mączka – strona www

Statyczna strona (50 podstron) generowana z jednego pliku danych. Bez bazy danych, bez cookies, bez opłat za hosting.

## Co jest w środku

| Funkcja | Opis |
|---|---|
| Kalkulator ceny | Skąd → dokąd → cena od, z dopłatą strefową i kursem powrotnym |
| Rezerwacja | Gotowa wiadomość na WhatsApp lub SMS (trasa, termin, osoby, bagaż, lot, uwagi) – bez serwera |
| 50 podstron SEO | 6 lotnisk, 4 sanatoria, 6 miast z klinikami, 4 dworce, 5 miast, 12 miejscowości, huby, cennik, dla firm, kontakt, EN |
| Dane strukturalne | LocalBusiness, Service z ceną, FAQPage, BreadcrumbList |
| PWA | Instalacja na telefonie, działa offline (cennik i kalkulator) |
| Dostępność | Czcionka Atkinson Hyperlegible (czytelność dla seniorów), pełna obsługa klawiatury, tryb ciemny |
| Prywatność | Czcionki hostowane lokalnie, zero zewnętrznych skryptów i trackerów |

## Zmiana cen, telefonu, miejscowości

Wszystko jest w `src/data.py`. Po zmianie:

```bash
pip install jinja2
python3 src/build.py      # wynik w dist/
```

Pozycje z `confirmed=False` to **szacunki** – potwierdź je z Adamem przed publikacją.

## Przed publikacją (TODO)

1. `SITE_URL` w `src/data.py` – docelowa domena
2. Kod pocztowy i dokładne współrzędne (z wizytówki Google)
3. Link do opinii Google (`google_review`) – z panelu wizytówki: „Poproś o opinie”
4. Ceny oznaczone `confirmed=False`
5. Czy opłaty za autostradę są w cenie lotnisk (dopisać na stronach lotnisk)

## Publikacja

- **GitHub Pages:** workflow `.github/workflows/deploy.yml` buduje i publikuje po każdym `git push` na `main`. W ustawieniach repo: Settings → Pages → Source: GitHub Actions. Domenę ustawiasz w Settings → Pages → Custom domain.
- **Cloudflare Pages / Netlify:** build command `pip install jinja2 && python3 src/build.py`, output `dist`. Plik `dist/_redirects` obsługują obie platformy.
