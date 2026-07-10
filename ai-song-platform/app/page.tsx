import Link from "next/link";

const features = [
  { icon: "✍️", title: "מילות שיר מקוריות", desc: "Claude כותב מילות שיר מותאמות אישית לנושא ולמצב הרוח שלך" },
  { icon: "🎼", title: "מוזיקה אינסטרומנטלית", desc: "MusicGen יוצר לך פסקול מקורי בסגנון שבחרת" },
  { icon: "🌍", title: "כל שפה שתרצה", desc: "עברית, אנגלית, ספרדית, ערבית ועוד — אתה בוחר" },
  { icon: "⬇️", title: "הורד והשתמש", desc: "קבל את המילות + קובץ MP3 לשימוש חופשי" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 py-24 space-y-8">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 text-sm text-purple-300">
          ✨ מופעל על ידי Claude + MusicGen
        </div>
        <h1 className="text-5xl md:text-6xl font-bold max-w-2xl leading-tight">
          צור שירים מקוריים{" "}
          <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            בשניות
          </span>
        </h1>
        <p className="text-white/50 text-lg max-w-xl">
          הכנס נושא, מצב רוח וסגנון — ה-AI יכתוב לך מילות שיר ויייצר מוזיקה מקורית.
          ללא ידע מוסיקלי נדרש.
        </p>
        <Link
          href="/create"
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold px-8 py-3.5 rounded-full text-lg hover:opacity-90 transition-opacity"
        >
          🎵 התחל ליצור — חינם
        </Link>
      </section>

      {/* Features */}
      <section className="px-6 pb-24 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2"
            >
              <div className="text-3xl">{f.icon}</div>
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-white/50">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10 px-6 py-16 text-center space-y-4">
        <h2 className="text-2xl font-bold">מוכן לנסות?</h2>
        <p className="text-white/50">3 שירים חינמיים ללא צורך בהרשמה</p>
        <Link
          href="/create"
          className="inline-block border border-purple-500/50 text-purple-300 font-semibold px-6 py-2.5 rounded-full hover:bg-purple-500/10 transition-colors"
        >
          צור שיר עכשיו
        </Link>
      </section>
    </div>
  );
}
