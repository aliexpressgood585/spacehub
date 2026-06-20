interface Props {
  lang: 'he' | 'en'
  onPremium: () => void
  onScrollToISS: () => void
}

export default function Hero({ lang, onPremium, onScrollToISS }: Props) {
  const he = lang === 'he'

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 text-center">
      <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-green-500/30 bg-green-900/20 text-green-400 mb-6">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        {he ? 'ISS בזמן אמת • נאס"א • לוויינים' : 'ISS Live • NASA • Satellites'}
      </div>

      <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
        {he ? (
          <>עקוב אחרי <span className="gradient-text">תחנת החלל</span><br />בזמן אמת</>
        ) : (
          <>Track the <span className="gradient-text">Space Station</span><br />in Real Time</>
        )}
      </h2>

      <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
        {he
          ? 'קבל התראה כשה-ISS עובר מעליך, עקוב אחרי לוויינים, אירועי חלל ומזג אוויר חלל — הכל בחינם'
          : 'Get notified when the ISS passes overhead, track satellites, space events & weather — all free'}
      </p>

      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={onScrollToISS}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-white transition shadow-lg shadow-indigo-900/40 text-sm"
        >
          🛸 {he ? 'איפה ISS עכשיו?' : 'Where is ISS now?'}
        </button>
        <button
          onClick={onPremium}
          className="px-6 py-3 bg-gradient-to-r from-yellow-700 to-orange-700 hover:from-yellow-600 hover:to-orange-600 rounded-xl font-semibold text-white transition shadow-lg shadow-orange-900/30 text-sm"
        >
          ⭐ {he ? 'שדרג לפרמיום' : 'Go Premium'}
        </button>
        <a
          href="https://wa.me/?text=SpaceHub%20-%20מידע%20חלל%20בזמן%20אמת%20https://spacehub-nu.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 border border-space-700 hover:border-green-500/50 text-gray-400 hover:text-green-400 rounded-xl font-medium transition text-sm"
        >
          📲 {he ? 'שתף לחברים' : 'Share'}
        </a>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-6 justify-center mt-10 text-center">
        {[
          { n: '2,400+', label: he ? 'משתמשים' : 'Users' },
          { n: '8', label: he ? 'כוכבי לכת' : 'Planets' },
          { n: '4', label: he ? 'לוויינים חיים' : 'Live Satellites' },
          { n: '24/7', label: he ? 'בזמן אמת' : 'Real-time' },
        ].map(s => (
          <div key={s.n}>
            <p className="text-2xl font-bold gradient-text">{s.n}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
