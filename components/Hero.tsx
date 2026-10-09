export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient (replace with real image later) */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black" />
      {/* Yellow accent stripe */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-taxi-yellow" />

      {/* Decorative taxi icon */}
      <div className="absolute inset-0 flex items-center justify-center opacity-5 select-none pointer-events-none">
        <span className="text-[30rem] leading-none">🚖</span>
      </div>

      <div className="relative z-10 text-center px-4 max-w-3xl mx-auto pt-24 pb-16">
        <div className="inline-block bg-taxi-yellow text-black text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-6">
          Dostępny całą dobę · 24/7
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-4">
          Taxi Knurów
          <br />
          <span className="text-taxi-yellow">Adam Mączka</span>
        </h1>

        <p className="text-white/70 text-lg sm:text-xl mb-2">
          Knurów · Gierałtowice · Przyszowice i okolice
        </p>
        <p className="text-white/50 text-base sm:text-lg mb-10">
          Lotnisko Pyrzowice · Balice · Wrocław · Warszawa · Ostrava
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="tel:570762777"
            className="bg-taxi-yellow text-black font-bold text-lg px-8 py-4 rounded-full hover:bg-yellow-400 active:scale-95 transition-all shadow-lg shadow-yellow-500/20"
          >
            📞 570 762 777
          </a>
          <a
            href="https://wa.me/48570762777"
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-white/30 text-white font-bold text-lg px-8 py-4 rounded-full hover:border-taxi-yellow hover:text-taxi-yellow active:scale-95 transition-all"
          >
            💬 WhatsApp
          </a>
        </div>

        <p className="mt-8 text-white/40 text-sm">
          Ocena 4.9 ⭐ · 274 opinii w Google
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/30">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </section>
  );
}
