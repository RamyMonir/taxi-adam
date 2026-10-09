import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Taxi Knurów – Adam Mączka | Transfery lotniskowe 24/7",
  description:
    "Taxi Knurów, Gierałtowice, Przyszowice i okolice. Transfery na lotnisko Pyrzowice, Balice, Wrocław, Warszawa. Całą dobę. Zadzwoń: 570 762 777.",
  keywords: [
    "taxi Knurów",
    "taksówka Knurów",
    "taxi Gierałtowice",
    "transfer lotnisko Pyrzowice",
    "transfer Balice",
    "taxi 24h Knurów",
    "Adam Mączka taxi",
  ],
  openGraph: {
    title: "Taxi Knurów – Adam Mączka | Transfery lotniskowe 24/7",
    description:
      "Taxi Knurów i okolice. Lotnisko Pyrzowice, Balice, dworce, sanatoria. Całą dobę. Tel: 570 762 777.",
    locale: "pl_PL",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
