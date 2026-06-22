import { useState, useEffect } from 'react'
import { useLang } from '../i18n/LangContext'
import type { Lang } from '../i18n/translations'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface Props {
  onPremium: () => void
}

const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: '🇺🇸 EN' },
  { code: 'he', label: '🇮🇱 HE' },
  { code: 'es', label: '🇪🇸 ES' },
  { code: 'fr', label: '🇫🇷 FR' },
  { code: 'de', label: '🇩🇪 DE' },
  { code: 'ar', label: '🇸🇦 AR' },
]

export default function Header({ onPremium }: Props) {
  const { lang, setLang, t } = useLang()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [issAlt, setIssAlt] = useState<number | null>(null)
  const [issSpeed, setIssSpeed] = useState<number | null>(null)
  const [crewCount, setCrewCount] = useState<number | null>(null)

  useEffect(() => {
    const fetchISS = () => {
      fetch('https://api.wheretheiss.at/v1/satellites/25544')
        .then(r => r.json())
        .then(d => { setIssAlt(Math.round(d.altitude)); setIssSpeed(Math.round(d.velocity)) })
        .catch(() => {})
    }
    fetchISS()
    const id = setInterval(fetchISS, 30000)

    fetch('https://api.open-notify.org/astros.json')
      .then(r => r.json())
      .then(d => setCrewCount(d.number))
      .catch(() => {})

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      clearInterval(id)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }

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
            <span className="text-gray-500 text-xs">
              ISS: <span className="text-gray-400 font-semibold">{issAlt !== null ? `${issAlt} km` : '408 km'}</span>
            </span>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">
              <span className="text-gray-400 font-semibold">{crewCount !== null ? crewCount : 7}</span> astronauts in space
            </span>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-gray-500 text-xs">
              <span className="text-gray-400 font-semibold">{issSpeed !== null ? `${issSpeed.toLocaleString()}` : '28,000'}</span> km/h
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={lang}
            onChange={e => setLang(e.target.value as Lang)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#c4b5fd',
              borderRadius: 10,
              padding: '6px 10px',
              fontSize: 12,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {LANGS.map(l => (
              <option key={l.code} value={l.code} style={{ background: '#0d1117', color: '#c4b5fd' }}>
                {l.label}
              </option>
            ))}
          </select>

          {installPrompt && !installed && (
            <button
              onClick={handleInstall}
              aria-label="Install SpaceHub app"
              className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-bold transition-all"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }}
            >
              <span>📲</span>
              <span>Install App</span>
            </button>
          )}

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
