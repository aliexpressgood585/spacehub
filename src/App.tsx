import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
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
import StarMap from './components/StarMap'
import SpaceQuiz from './components/SpaceQuiz'
import ShareCard from './components/ShareCard'
import BlogPage from './pages/BlogPage'
import CityPage from './pages/CityPage'

type Tab = 'dashboard' | 'starmap' | 'tracker' | 'solar' | 'weather' | 'events' | 'news' | 'quiz' | 'blog'

const TABS: { id: Tab; icon: string; he: string; en: string }[] = [
  { id: 'dashboard', icon: '🛸', he: 'ISS חי',        en: 'ISS Live' },
  { id: 'starmap',   icon: '🌌', he: 'מפת שמיים',    en: 'Star Map' },
  { id: 'tracker',   icon: '🛰️', he: 'לוויינים',     en: 'Satellites' },
  { id: 'solar',     icon: '🪐', he: 'מערכת השמש',   en: 'Solar System' },
  { id: 'weather',   icon: '⛈️', he: 'מזג חלל',      en: 'Space Weather' },
  { id: 'events',    icon: '🌠', he: 'אירועים',       en: 'Events' },
  { id: 'news',      icon: '📰', he: 'חדשות',         en: 'News' },
  { id: 'quiz',      icon: '🧠', he: 'קוויז',         en: 'Quiz' },
  { id: 'blog',      icon: '📝', he: 'בלוג',          en: 'Blog' },
]

function MainApp() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [lang, setLang] = useState<'he' | 'en'>('he')
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [issData, setIssData] = useState<{ lat: number; lng: number; alt: number } | null>(null)
  const issRef = useRef<HTMLDivElement>(null)
  const he = lang === 'he'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  }, [lang])

  // Fetch ISS for ShareCard
  useEffect(() => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => setIssData({ lat: d.latitude, lng: d.longitude, alt: d.altitude }))
      .catch(() => {})
  }, [])

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

        <div className="max-w-7xl mx-auto px-4 mb-6">
          <AdBanner slot="leaderboard" />
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-16">
          {/* Tab bar */}
          <div className="flex gap-1.5 mb-8 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
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

          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AstronautsInSpace />
                <MoonPhase />
                <LaunchCountdown />
              </div>
              <div ref={issRef}><ISSAlertSystem /></div>
              <ISSTracker />
              <ShareCard issLat={issData?.lat} issLng={issData?.lng} issAlt={issData?.alt} />
              <NasaAPOD />
              <AdBanner slot="rectangle" />
            </div>
          )}

          {activeTab === 'starmap' && (
            <div className="space-y-5">
              <StarMap />
              <div className="space-card p-5">
                <h3 className="text-white font-semibold mb-2">💡 ISS בשמיים הלילה</h3>
                <p className="text-gray-400 text-sm">עבור לטאב ISS חי כדי לדעת בדיוק מתי ISS עובר מעליך ובאיזה כיוון.</p>
                <button onClick={() => setActiveTab('dashboard')} className="mt-3 btn-shimmer px-4 py-2 text-sm">
                  🛸 עבור ל-ISS Live
                </button>
              </div>
            </div>
          )}

          {activeTab === 'tracker' && <SatelliteTracker />}

          {activeTab === 'solar' && (
            <div className="space-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🪐</span>
                <h3 className="text-xl font-bold text-white">{he ? 'מערכת השמש — תלת מימד' : 'Solar System — 3D'}</h3>
              </div>
              <SolarSystem3D />
            </div>
          )}

          {activeTab === 'weather' && <SpaceWeather />}
          {activeTab === 'events'  && <EventsCalendar />}

          {activeTab === 'news' && (
            <div className="space-y-5">
              <SpaceNewsFeed />
              <AdBanner slot="rectangle" />
            </div>
          )}

          {activeTab === 'quiz' && (
            <div className="max-w-lg mx-auto">
              <SpaceQuiz />
            </div>
          )}

          {activeTab === 'blog' && <BlogPage />}

          <div className="mt-12"><EmailCapture /></div>
        </div>

        <footer className="border-t border-white/[0.04] py-10 text-center">
          <p className="text-2xl mb-3">🚀</p>
          <p className="text-white font-bold mb-1">SpaceHub</p>
          <p className="text-gray-600 text-xs mb-4">{he ? 'מידע חלל בזמן אמת' : 'Real-time Space Data'}</p>
          <div className="flex flex-wrap gap-3 justify-center text-gray-700 text-xs mb-4">
            <Link to="/blog" className="hover:text-gray-400 transition">בלוג</Link>
            <Link to="/iss/tel-aviv" className="hover:text-gray-400 transition">ISS תל אביב</Link>
            <Link to="/iss/jerusalem" className="hover:text-gray-400 transition">ISS ירושלים</Link>
            <Link to="/iss/eilat" className="hover:text-gray-400 transition">ISS אילת</Link>
            <button onClick={() => setPremiumOpen(true)} className="text-yellow-700 hover:text-yellow-500 transition font-semibold">⭐ פרמיום</button>
          </div>
          <p className="text-gray-800 text-xs">Data: NASA • Spaceflight News API • wheretheiss.at • open-notify</p>
          <p className="text-gray-800 text-xs mt-1">© 2026 SpaceHub</p>
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/blog" element={
          <div style={{ background: '#050816', minHeight: '100vh' }}>
            <div style={{ zIndex: 1, position: 'relative' }}>
              <Link to="/" className="fixed top-4 right-4 z-50 text-indigo-400 text-sm glass px-3 py-2 rounded-lg border border-white/10">
                ← SpaceHub
              </Link>
              <BlogPage />
            </div>
          </div>
        } />
        <Route path="/iss/:city" element={<CityPage />} />
      </Routes>
    </BrowserRouter>
  )
}
