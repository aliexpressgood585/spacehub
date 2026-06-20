export default function Hero() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16 text-center">
      <h2 className="text-5xl font-bold text-white mb-4">ברוכים הבאים לחלל</h2>
      <p className="text-xl text-gray-300 mb-8">
        עקוב אחרי לוויינים, אירועים אסטרונומיים ומזג אוויר חלל בזמן אמת
      </p>
      <div className="flex gap-4 justify-center">
        <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition">
          התחל חקר
        </button>
        <button className="px-6 py-3 border border-indigo-500 text-indigo-400 hover:bg-indigo-500 hover:bg-opacity-10 rounded-lg font-medium transition">
          למידע נוסף
        </button>
      </div>
    </div>
  )
}
