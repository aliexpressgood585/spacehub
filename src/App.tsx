import { useState, useEffect, useRef } from 'react'
import './App.css'
import Header from './components/Header'
import Hero from './components/Hero'
import SatelliteTracker from './components/SatelliteTracker'
import SpaceWeather from './components/SpaceWeather'
import EventsCalendar from './components/EventsCalendar'
import SpaceBackground from './components/SpaceBackground'
import SolarSystem3D from './components/SolarSystem3D'
import NasaAPOD from './components/NasaAPOD'
import ISSTracker from './components/ISSTracker'
import SpaceNewsFeed from './components/SpaceNewsFeed'
import ISSAlertSystem from './components/ISSAlertSystem'
import EmailCapture from './components/EmailCapture'
import AdBanner from './components/AdBanner'
import PremiumModal from './components/PremiumModal'
import AstronautsInSpace from './components/AstronautsInSpace'
import MoonPhase from './components/MoonPhase'
import LaunchCountdown from './components/LaunchCountdown'
import LiveTicker from './components/LiveTicker'

type Tab = 'dashboard' | 'tracker' | 'solar' | 'weather' | 'events' | 'news'

const TABS: { id: Tab; icon: string; he: string; en: string }[] = [
  { id: 'dashboard', icon: '🛸', he: 'ISS ולייב',    en: 'ISS & Live' },
  { id: 'tracker',   icon: '🛰️', he: 'לוויינים',     en: 'Satellites' },
  { id: 'solar',     icon: '🪐', he: 'מערכת השמש',   en: 'Solar System' },
  { id: 'weather',   icon: '⛈️', he: 'מזג חלל',      en: 'Space Weather' },
  { id: 'events',    icon: '🌠', he: 'אירועים',       en: 'Events' },
  { id: 'news',      icon: '📰', he: 'חדשות',         en: 'News' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [lang, setLang] = useState<'he' | 'en'>('he')
  const [premiumOpen, setPremiumOpen] = useState(false)
  const issRef = useRef<HTMLDivElement>(null)
  const he = lang === 'he'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  }, [lang])

  const scrollToISS = () => {
    setActiveTab('dashboard')
    setTimeout(() => issRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  return (
    <div className="min-h-screen relative" style={{ background: '#050816' }}>
      <SpaceBackground />
      <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} lang={lang} />

      <div className="relative" style={{ zIndex: 1 }}>
        <Header
          onThemeToggle={() => {}}
          lang={lang}
          onLangToggle={() => setLang(l => l === 'he' ? 'en' : 'he')}
          onPremium={() => setPremiumOpen(true)}
        />

        <LiveTicker />
        <Hero lang={lang} onPremium={() => setPremiumOpen(true)} onScrollToISS={scrollToISS} />

        {/* Ad banner */}
        <div className="max-w-7xl mx-auto px-4 mb-8">
          <AdBanner slot="leaderboard" />
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-16">
          {/* Tab bar */}
          <div className="flex gap-1.5 mb-8 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-pill flex-shrink-0 flex items-center gap-1.5 ${activeTab === tab.id ? 'active' : ''}`}
              >
                <span>{tab.icon}</span>
                <span>{he ? tab.he : tab.en}</span>
              </button>
            ))}
          </div>

          {/* ── Dashboard tab ── */}
          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              {/* 3-col grid: Who's in space, Moon, Launch countdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AstronautsInSpace />
                <MoonPhase />
                <LaunchCountdown />
              </div>

              {/* ISS Alert */}
              <div ref={issRef}>
                <ISSAlertSystem />
              </div>

              {/* ISS Globe */}
              <ISSTracker />

              {/* NASA APOD */}
              <NasaAPOD />

              <AdBanner slot="rectangle" />
            </div>
          )}

          {activeTab === 'tracker'  && <SatelliteTracker />}

          {activeTab === 'solar' && (
            <div className="space-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🪐</span>
                <h3 className="text-xl font-bold text-white">{he ? 'מערכת השמש — תלת מימד' : 'Solar System — 3D'}</h3>
              </div>
              <SolarSystem3D />
            </div>
          )}

          {activeTab === 'weather'  && <SpaceWeather />}
          {activeTab === 'events'   && <EventsCalendar />}

          {activeTab === 'news' && (
            <div className="space-y-5">
              <SpaceNewsFeed />
              <AdBanner slot="rectangle" />
            </div>
          )}

          {/* Email capture — all tabs */}
          <div className="mt-12">
            <EmailCapture />
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-white/[0.04] py-10 text-center">
          <p className="text-2xl mb-3">🚀</p>
          <p className="text-white font-bold mb-1">SpaceHub</p>
          <p className="text-gray-600 text-xs mb-4">{he ? 'מידע חלל בזמן אמת' : 'Real-time Space Data'}</p>
          <div className="flex flex-wrap gap-4 justify-center text-gray-700 text-xs mb-4">
            <span className="hover:text-gray-400 cursor-pointer transition">תנאי שימוש</span>
            <span className="hover:text-gray-400 cursor-pointer transition">פרטיות</span>
            <span className="hover:text-gray-400 cursor-pointer transition">צור קשר</span>
            <button onClick={() => setPremiumOpen(true)} className="text-yellow-700 hover:text-yellow-500 transition font-semibold">⭐ פרמיום</button>
          </div>
          <p className="text-gray-800 text-xs">Data: NASA • Spaceflight News API • wheretheiss.at • open-notify</p>
          <p className="text-gray-800 text-xs mt-1">© 2026 SpaceHub</p>
        </footer>
      </div>
    </div>
  )
}
