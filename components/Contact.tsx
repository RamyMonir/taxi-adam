export default function Contact() {
  return (
    <section id="kontakt" className="py-20 bg-zinc-900">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">
          Zamów <span className="text-taxi-yellow">kurs</span>
        </h2>
        <p className="text-white/50 mb-12">
          Zadzwoń, napisz na WhatsApp lub wyślij BLIK. Odbieramy całą dobę.
        </p>

        <div className="grid sm:grid-cols-2 gap-6 mb-10">
          {/* Primary phone */}
          <a
            href="tel:570762777"
            className="bg-taxi-yellow text-black rounded-2xl p-6 flex flex-col items-center gap-2 hover:bg-yellow-400 active:scale-95 transition-all shadow-lg shadow-yellow-500/10"
          >
            <span className="text-3xl">📞</span>
            <span className="font-extrabold text-2xl tracking-wide">570 762 777</span>
            <span className="text-sm font-medium text-black/60">Numer główny – Taxi Knurów</span>
          </a>

          {/* Secondary phone */}
          <a
            href="tel:515650750"
            className="bg-zinc-800 text-white rounded-2xl p-6 flex flex-col items-center gap-2 hover:bg-zinc-700 active:scale-95 transition-all border border-white/5 hover:border-taxi-yellow/40"
          >
            <span className="text-3xl">📞</span>
            <span className="font-extrabold text-2xl tracking-wide">515 650 750</span>
            <span className="text-sm text-white/50">Numer alternatywny – Fest Taxi</span>
          </a>
        </div>

        {/* Action row */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
          <a
            href="https://wa.me/48570762777"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border-2 border-white/20 text-white font-semibold px-6 py-3 rounded-full hover:border-taxi-yellow hover:text-taxi-yellow transition-all"
          >
            💬 WhatsApp
          </a>
          <a
            href="https://maps.app.goo.gl/search/?q=Taxi+Knur%C3%B3w+Adam+M%C4%85czka"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border-2 border-white/20 text-white font-semibold px-6 py-3 rounded-full hover:border-taxi-yellow hover:text-taxi-yellow transition-all"
          >
            📍 Google Maps
          </a>
        </div>

        {/* BLIK & address */}
        <div className="bg-zinc-800 rounded-2xl p-6 inline-block text-left border border-white/5 w-full sm:w-auto">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">💳</span>
            <div>
              <div className="text-xs text-white/50 uppercase tracking-widest">BLIK</div>
              <div className="font-bold text-lg">570 762 777</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📍</span>
            <div>
              <div className="text-xs text-white/50 uppercase tracking-widest">Lokalizacja</div>
              <div className="font-bold">Kosmonautów 18, Knurów</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
