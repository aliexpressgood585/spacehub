interface Props {
  onThemeToggle: () => void
  lang: 'he' | 'en'
  onLangToggle: () => void
  onPremium: () => void
}

export default function Header({ lang, onLangToggle, onPremium }: Props) {
  const he = lang === 'he'

  return (
    <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-base shadow-lg shadow-indigo-900/50">
              🚀
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black animate-pulse" />
          </div>
          <div>
            <span className="font-black text-lg text-white tracking-tight">Space<span className="gradient-text">Hub</span></span>
            <p className="text-gray-600 text-xs leading-none -mt-0.5">{he ? 'מידע חלל בזמן אמת' : 'Real-time Space Data'}</p>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onLangToggle}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-indigo-500/50 transition bg-white/[0.03]"
          >
            {lang === 'he' ? '🌐 EN' : '🌐 HE'}
          </button>

          <button
            onClick={onPremium}
            className="btn-gold text-xs px-4 py-2 flex items-center gap-1.5 shadow-lg shadow-yellow-900/20"
          >
            <span>⭐</span>
            <span>{he ? 'פרמיום' : 'Premium'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
