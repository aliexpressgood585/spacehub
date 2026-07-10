export const metadata = {
  title: "הספרייה שלי | SongAI",
};

export default function LibraryPage() {
  return (
    <div className="px-6 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">הספרייה שלי</h1>
      <p className="text-white/50 mb-10">השירים שיצרת יופיעו כאן</p>

      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 border border-dashed border-white/10 rounded-3xl">
        <div className="text-5xl">🎵</div>
        <h2 className="text-xl font-semibold text-white/70">אין עדיין שירים</h2>
        <p className="text-white/40 text-sm">
          כשתיצור שירים הם יישמרו כאן אוטומטית
        </p>
        <a
          href="/create"
          className="mt-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6 py-2.5 rounded-full transition-colors"
        >
          צור שיר ראשון
        </a>
      </div>
    </div>
  );
}
