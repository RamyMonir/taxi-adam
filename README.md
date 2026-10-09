# Taxi Knurów – Adam Mączka

Strona internetowa dla firmy **Taxi Knurów Adam Mączka** zbudowana w Next.js 14 + Tailwind CSS.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Otwórz [http://localhost:3000](http://localhost:3000).

## Budowanie produkcyjne

```bash
npm run build
npm start
```

## Wdrożenie na Vercel

1. Wrzuć repo na GitHub (prywatne)
2. Wejdź na [vercel.com](https://vercel.com) → **Add New Project** → importuj repo
3. Vercel wykryje Next.js automatycznie → kliknij **Deploy**
4. Podepnij własną domenę w ustawieniach projektu

## Struktura projektu

```
app/
  layout.tsx       # metadane SEO, fonty
  page.tsx         # główna strona
  globals.css
components/
  Header.tsx       # sticky nav z numerem telefonu
  Hero.tsx         # sekcja główna z CTA
  WhyUs.tsx        # pasek zaufania (oceny, 24/7, płatności)
  Services.tsx     # 3 karty usług
  CoverageArea.tsx # siatka 9 miejscowości
  Contact.tsx      # numery, WhatsApp, BLIK, Maps
  Footer.tsx
public/            # tu wrzuć zdjęcia auta i logo
```

## Personalizacja

- **Zdjęcia**: wrzuć do `public/` i dodaj `<Image>` w `Hero.tsx`
- **Numery**: zmień w `components/Contact.tsx` i `components/Header.tsx`
- **Miejscowości**: edytuj tablicę `towns` w `components/CoverageArea.tsx`
- **Usługi**: edytuj tablicę `services` w `components/Services.tsx`
