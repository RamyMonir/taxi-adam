const stats = [
  { icon: "⭐", value: "4.9 / 5", label: "274 opinii w Google" },
  { icon: "🕐", value: "24 / 7", label: "Dostępny całą dobę" },
  { icon: "🚐", value: "do 7 osób", label: "Auta osobowe i vany" },
  { icon: "💳", value: "Karta, BLIK,", label: "gotówka, przelew" },
];

export default function WhyUs() {
  return (
    <section className="bg-taxi-yellow text-black py-12">
      <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-3xl mb-1">{s.icon}</div>
            <div className="font-extrabold text-xl leading-tight">{s.value}</div>
            <div className="text-sm text-black/70 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
