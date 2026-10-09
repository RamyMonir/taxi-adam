const towns = [
  "Knurów",
  "Gierałtowice",
  "Przyszowice",
  "Nieborowice",
  "Szczygłowice",
  "Czerwionka",
  "Chudów",
  "Paniówki",
  "Wilcza",
];

export default function CoverageArea() {
  return (
    <section id="obszar" className="py-20 bg-taxi-dark">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">
            Obszar <span className="text-taxi-yellow">działania</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            Obsługujemy Knurów, Gierałtowice i wszystkie okoliczne miejscowości.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          {towns.map((town) => (
            <div
              key={town}
              className="bg-zinc-800 rounded-xl px-5 py-4 text-center font-semibold border border-white/5 hover:border-taxi-yellow/40 hover:text-taxi-yellow transition-all"
            >
              {town}
            </div>
          ))}
        </div>

        <p className="text-center text-white/40 text-sm mt-8">
          Nie widzisz swojej miejscowości? Zadzwoń – na pewno się dogadamy.
        </p>
      </div>
    </section>
  );
}
