export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-taxi-dark border-t border-white/10 py-8 text-center text-white/30 text-sm">
      <p className="mb-1 font-semibold text-white/50">Taxi Knurów – Adam Mączka</p>
      <p>Kosmonautów 18, 44-190 Knurów</p>
      <p className="mt-3">
        <a href="tel:570762777" className="hover:text-taxi-yellow transition-colors">
          570 762 777
        </a>{" "}
        ·{" "}
        <a href="tel:515650750" className="hover:text-taxi-yellow transition-colors">
          515 650 750
        </a>
      </p>
      <p className="mt-4 text-white/20">&copy; {year} Adam Mączka. Wszelkie prawa zastrzeżone.</p>
    </footer>
  );
}
