interface Props {
  lang: 'he' | 'en'
  onPremium: () => void
  onScrollToISS: () => void
}

export default function Hero({ lang, onPremium, onScrollToISS }: Props) {
  const he = lang === 'he'

  return (
    <div className="hero-bg relative overflow-hidden">
      {/* Decorative orbs */}
      <div className="absolute top-10 left-1/4 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 pt-16 pb-12 text-center relative">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 mb-6">
          <span className="section-label">
            <span className="live-dot" />
            {he ? 'נתונים חיים מהחלל' : 'Live data from space'}
          </span>
        </div>

        {/* Title */}
        <h2 className="text-5xl sm:text-6xl font-black text-white mb-5 leading-[1.1] tracking-tight">
          {he ? (
            <>
              עקוב אחרי{' '}
              <span className="gradient-text">תחנת החלל</span>
              <br />בזמן אמת
            </>
          ) : (
            <>
              Track the{' '}
              <span className="gradient-text">Space Station</span>
              <br />in Real Time
            </>
          )}
        </h2>

        <p className="text-base text-gray-400 mb-8 max-w-lg mx-auto leading-relaxed">
          {he
            ? 'קבל התראה כשה-ISS עובר מעליך, ראה מי בחלל עכשיו, עקוב אחרי ירח, שיגורים ומזג אוויר חלל — הכל חינם'
            : 'Get notified when ISS passes overhead, see who\'s in space now, track moon phases, launches & space weather — all free'}
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          <button
            onClick={onScrollToISS}
            className="btn-shimmer px-7 py-3.5 text-sm flex items-center gap-2"
          >
            <span>🛸</span>
            {he ? 'איפה ISS עכשיו?' : 'Where is ISS?'}
          </button>
          <button
            onClick={onPremium}
            className="btn-gold px-7 py-3.5 text-sm flex items-center gap-2"
          >
            <span>⭐</span>
            {he ? 'שדרג לפרמיום' : 'Go Premium'}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent('SpaceHub - Real-time Space Data 🚀 https://spacehub-nu.vercel.app')}`}
            target="_blank" rel="noopener noreferrer"
            className="px-7 py-3.5 text-sm border border-white/10 text-gray-400 hover:text-white hover:border-white/20 rounded-xl transition bg-white/[0.03] flex items-center gap-2"
          >
            📲 {he ? 'שתף' : 'Share'}
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
          {[
            { n: '7+',    sub: he ? 'אסטרונאוטים בחלל' : 'Astronauts in space' },
            { n: '8',     sub: he ? 'כוכבי לכת חיים'   : 'Live planets' },
            { n: '92',    sub: he ? 'דקות להקפה'        : 'Mins per orbit' },
            { n: '24/7',  sub: he ? 'בזמן אמת'          : 'Real-time' },
          ].map(s => (
            <div key={s.n} className="stat-card">
              <p className="text-2xl font-black gradient-text mb-0.5">{s.n}</p>
              <p className="text-xs text-gray-600 leading-tight">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
