import { useState, useEffect } from 'react'
import { useLang } from '../i18n/LangContext'
import { useISS } from '../contexts/ISSContext'
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
  const { iss, astros, liveOk } = useISS()
  const issAlt = iss ? Math.round(iss.altitude) : null
  const issSpeed = iss ? Math.round(iss.velocity) : null
  const crewCount = astros
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('spacehub_theme') === 'light')
  const [galaxyBg, setGalaxyBg] = useState(() => localStorage.getItem('spacehub_galaxy') === '1')

  useEffect(() => {

    document.documentElement.classList.toggle('light-mode', lightMode)

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only PWA install listener
  }, [])

  const toggleTheme = () => {
    const next = !lightMode
    setLightMode(next)
    localStorage.setItem('spacehub_theme', next ? 'light' : 'dark')
    document.documentElement.classList.toggle('light-mode', next)
  }

  const toggleGalaxy = () => {
    const next = !galaxyBg
    setGalaxyBg(next)
    localStorage.setItem('spacehub_galaxy', next ? '1' : '0')
    window.dispatchEvent(new Event('spacehub-galaxy'))
  }

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
            {/* Mobile: compact ISS stat under logo */}
            <div className="flex items-center gap-1.5 md:hidden mt-0.5">
              {liveOk
                ? <><span className="live-dot" style={{ width: 5, height: 5 }} /><span className="text-[10px] text-emerald-400 font-semibold">LIVE</span></>
                : <span className="text-[10px] text-gray-600 font-semibold">CACHED</span>
              }
              {issAlt !== null && (
                <span className="text-[10px] text-gray-600">· ISS <span className="text-gray-400 font-bold">{issAlt} km</span></span>
              )}
            </div>
            {/* Desktop tagline */}
            <div className="hidden md:block text-[10px] text-gray-600 font-medium tracking-wide leading-none mt-0.5">
              {t('header.tagline')}
            </div>
          </div>
        </div>

        {/* Center — live stats bar (desktop only) */}
        <div className="hidden md:flex flex-1 justify-center">
          <div
            className="flex items-center gap-4 glass px-4 py-2 rounded-full border border-white/[0.06]"
            aria-live="polite"
            aria-label="Live ISS statistics"
          >
            <div className="flex items-center gap-1.5">
              {liveOk ? (
                <><span className="live-dot" /><span className="text-emerald-400 text-xs font-semibold">{t('common.live')}</span></>
              ) : (
                <span className="text-gray-600 text-xs font-semibold">CACHED</span>
              )}
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
          <button
            onClick={toggleGalaxy}
            aria-label={galaxyBg ? 'Galaxy background on — click to disable' : 'Enable galaxy background'}
            title={galaxyBg ? 'Galaxy Background: ON' : 'Enable Galaxy Background'}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all"
            style={galaxyBg
              ? { background: 'rgba(139,92,246,0.22)', border: '1px solid rgba(139,92,246,0.5)' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span aria-hidden="true">🌌</span>
          </button>

          <button
            onClick={toggleTheme}
            aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            title={lightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span aria-hidden="true">{lightMode ? '🌙' : '☀️'}</span>
          </button>

          <select
            value={lang}
            onChange={e => setLang(e.target.value as Lang)}
            aria-label="Language"
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
