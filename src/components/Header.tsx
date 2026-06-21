interface Props {
  onThemeToggle: () => void
  lang: 'he' | 'en'
  onLangToggle: () => void
  onPremium: () => void
}

export default function Header({ lang, onLangToggle }: Props) {
  const he = lang === 'he'

  return (
    <header className="sticky top-0 z-50 header-blur">
      <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center gap-4">

        {/* Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="relative">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 flex items-center justify-center text-lg shadow-lg shadow-indigo-900/60 animate-glow-pulse">
              🚀
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#020510] shadow-lg shadow-emerald-500/50" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
          </div>
          <div>
            <div className="font-black text-lg text-white tracking-tight leading-none">
              Space<span className="gradient-text">Hub</span>
            </div>
            <div className="text-[10px] text-gray-600 font-medium tracking-wide leading-none mt-0.5">
              {he ? 'מידע חלל בזמן אמת' : 'Real-time Space Data'}
            </div>
          </div>
        </div>

        {/* Center — live stats bar */}
        <div className="hidden md:flex flex-1 justify-center">
          <div className="flex items-center gap-4 glass px-4 py-2 rounded-full border border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <span className="live-dot" />
              <span className="text-emerald-400 text-xs font-semibold">LIVE</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">ISS: 408 km altitude</span>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">7 astronauts in space</span>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">28,000 km/h</span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onLangToggle}
            className="text-xs px-3 py-2 rounded-xl border border-white/[0.08] text-gray-500 hover:text-white hover:border-indigo-500/40 transition-all bg-white/[0.02] hover:bg-indigo-500/10 font-semibold tracking-wide"
          >
            {lang === 'he' ? '🌐 EN' : '🌐 HE'}
          </button>
          <a
            href="https://spacehub-nu.vercel.app"
            className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all font-semibold"
          >
            <span>⭐</span>
            <span>{he ? 'שתף' : 'Share'}</span>
          </a>
        </div>
      </div>
    </header>
  )
}
