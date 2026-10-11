# Taxi Knurów Adam Mączka – strona www

Strona (51 podstron) generowana z jednego pliku danych + zamawianie kursów online jak w Uber/Bolt: kurs teraz lub rezerwacja, powiadomienie kierowcy na Telegramie, status na żywo. Hosting: Cloudflare Pages (darmowy plan). **Konfiguracja krok po kroku: [SETUP.md](SETUP.md).**

## Co jest w środku

| Funkcja | Opis |
|---|---|
| Zamówienie online | Teraz / na później, adres z podpowiedziami Google lub GPS („Tu jestem”), mapa, trasa, czas i cena |
| Kierowca | Zamówienie trafia na Telegram; przyciski: potwierdź (za ile minut), odrzuć, jestem na miejscu, zakończ |
| Flota | 5 aut wspólnych dla kierowców: wybór auta jednym kliknięciem na początku zmiany, auto i kierowca w każdym kursie, rozliczenie (50/50 albo opłata dzienna), raport 23:00 z gotówką do oddania – [SETUP.md §6](SETUP.md#6-fleet-shared-cars-settlement-photos) |
| Status na żywo | Strona /przejazd/ – odliczanie do przyjazdu, anulowanie; bez backendu: WhatsApp / SMS |
| Opinie | Najlepsze opinie z wizytówki Google (Places API) |
| 50 podstron SEO | 6 lotnisk, 4 sanatoria, 6 miast z klinikami, 4 dworce, 5 miast, 12 miejscowości, huby, cennik, dla firm, kontakt, EN |
| Dane strukturalne | LocalBusiness, Service z ceną, FAQPage, BreadcrumbList |
| PWA | Instalacja na telefonie, działa offline (cennik i kalkulator) |
| Dostępność | Czcionka Atkinson Hyperlegible (czytelność dla seniorów), pełna obsługa klawiatury, tryb ciemny |
| Prywatność | Czcionki lokalnie, bez cookies i trackerów; Google Maps ładuje się dopiero przy użyciu formularza |

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
