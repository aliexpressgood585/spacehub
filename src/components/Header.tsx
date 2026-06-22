import { useLang } from '../i18n/LangContext'
import type { Lang } from '../i18n/translations'

interface Props {
  onThemeToggle: () => void
  onPremium: () => void
}

const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'he', label: 'HE' },
  { code: 'es', label: 'ES' },
]

export default function Header({ onPremium }: Props) {
  const { lang, setLang, t } = useLang()

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
              {t('header.tagline')}
            </div>
          </div>
        </div>

        {/* Center — live stats bar */}
        <div className="hidden md:flex flex-1 justify-center">
          <div className="flex items-center gap-4 glass px-4 py-2 rounded-full border border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <span className="live-dot" />
              <span className="text-emerald-400 text-xs font-semibold">{t('common.live')}</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">{t('header.issAlt')}</span>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">{t('header.astronauts')}</span>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">{t('header.speed')}</span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all"
                style={lang === l.code
                  ? { background: 'rgba(99,102,241,0.3)', color: '#c4b5fd' }
                  : { color: '#4b5563' }}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button
            onClick={onPremium}
            className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-bold transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.25))', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd' }}
          >
            <span>⭐</span>
            <span>{t('header.goPro')}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
