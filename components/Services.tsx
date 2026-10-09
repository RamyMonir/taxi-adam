const services = [
  {
    icon: "🏙️",
    title: "Taxi lokalne",
    description:
      "Kursy w Knurowie, Gierałtowicach i okolicznych miejscowościach. Dostępny całą dobę, 7 dni w tygodniu.",
    highlights: ["Knurów", "Gierałtowice", "Przyszowice", "Szczygłowice"],
  },
  {
    icon: "✈️",
    title: "Transfery lotniskowe",
    description:
      "Bezpieczny i punktualny dojazd na każde lotnisko w Polsce i za granicą. Stałe ceny, wygodny odbiór spod domu.",
    highlights: ["Pyrzowice (KTW)", "Balice (KRK)", "Wrocław (WRO)", "Warszawa (WAW)", "Ostrava (OSR)"],
  },
  {
    icon: "🛤️",
    title: "Trasy dalekobieżne",
    description:
      "Dworce PKP, sanatoria, uzdrowiska, szpitale i kliniki. Auta do 7 osób – idealne dla rodzin i grup.",
    highlights: ["Dworce PKP", "Sanatoria i uzdrowiska", "Szpitale i kliniki", "Auta do 7 osób"],
  },
];

export default function Services() {
  return (
    <section id="uslugi" className="py-20 bg-zinc-900">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">
            Nasze <span className="text-taxi-yellow">usługi</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            Jeden numer telefonu – wszystkie kursy.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {services.map((s) => (
            <div
              key={s.title}
              className="bg-zinc-800 rounded-2xl p-6 flex flex-col border border-white/5 hover:border-taxi-yellow/40 transition-colors"
            >
              <div className="text-4xl mb-4">{s.icon}</div>
              <h3 className="text-xl font-bold mb-2">{s.title}</h3>
              <p className="text-white/60 text-sm mb-5 flex-1">{s.description}</p>
              <ul className="text-sm space-y-1 mb-6">
                {s.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-white/80">
                    <span className="text-taxi-yellow text-xs">▶</span>
                    {h}
                  </li>
                ))}
              </ul>
              <a
                href="tel:570762777"
                className="block text-center bg-taxi-yellow text-black font-bold py-3 rounded-full hover:bg-yellow-400 transition-colors"
              >
                Zadzwoń
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
