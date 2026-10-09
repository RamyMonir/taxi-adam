"use client";
import { useState } from "react";
import Link from "next/link";

const navLinks = [
  { href: "#uslugi", label: "Usługi" },
  { href: "#obszar", label: "Obszar" },
  { href: "#kontakt", label: "Kontakt" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-taxi-dark/90 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-taxi-yellow">🚖</span>
          <span>Taxi Adam Mączka</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-white/80 hover:text-taxi-yellow transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a
            href="tel:570762777"
            className="bg-taxi-yellow text-black font-semibold text-sm px-4 py-2 rounded-full hover:bg-yellow-400 transition-colors"
          >
            📞 570 762 777
          </a>
        </nav>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-white"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-taxi-dark border-t border-white/10 px-4 pb-4">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-3 text-white/80 hover:text-taxi-yellow transition-colors border-b border-white/5"
            >
              {l.label}
            </a>
          ))}
          <a
            href="tel:570762777"
            className="block mt-4 bg-taxi-yellow text-black font-semibold text-center px-4 py-3 rounded-full hover:bg-yellow-400 transition-colors"
          >
            📞 Zadzwoń: 570 762 777
          </a>
        </div>
      )}
    </header>
  );
}
