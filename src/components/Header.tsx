import { useState } from 'react'

interface Props {
  onThemeToggle: () => void
  lang: 'he' | 'en'
  onLangToggle: () => void
  onPremium: () => void
}

export default function Header({ onThemeToggle, lang, onLangToggle, onPremium }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="glass sticky top-0 z-50 border-b border-space-700">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-2xl">🚀</div>
          <h1 className="gradient-text text-xl font-bold">SpaceHub</h1>
        </div>

        <p className="text-gray-500 text-xs hidden sm:block flex-shrink-0">
          {lang === 'he' ? 'מידע חלל בזמן אמת' : 'Real-time Space Data'}
        </p>

        <div className="flex items-center gap-2 ml-auto">
          {/* Language toggle */}
          <button
            onClick={onLangToggle}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-space-700 text-gray-400 hover:text-white hover:border-indigo-500 transition"
          >
            {lang === 'he' ? '🌐 EN' : '🌐 HE'}
          </button>

          {/* Premium CTA */}
          <button
            onClick={onPremium}
            className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-semibold transition shadow-lg shadow-orange-900/30"
          >
            ⭐ {lang === 'he' ? 'פרמיום' : 'Premium'}
          </button>

          <button
            onClick={onThemeToggle}
            className="p-1.5 hover:bg-space-700 rounded-lg transition text-lg"
          >
            🌙
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-space-700 p-4 flex flex-col gap-2">
          <button className="text-gray-400 text-sm text-right" onClick={() => setMenuOpen(false)}>✕ סגור</button>
        </div>
      )}
    </header>
  )
}
