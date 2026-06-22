import { useState, useEffect, useRef, Component, lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import './App.css'
import { LangProvider } from './i18n/LangContext'
import { useLang } from './i18n/LangContext'
import Header from './components/Header'
import Hero from './components/Hero'
const SatelliteTracker = lazy(() => import('./components/SatelliteTracker'))
import SpaceWeather from './components/SpaceWeather'
import EventsCalendar from './components/EventsCalendar'
import SpaceBackground from './components/SpaceBackground'
const SolarSystem3D = lazy(() => import('./components/SolarSystem3D'))
import NasaAPOD from './components/NasaAPOD'
import ISSTracker from './components/ISSTracker'
import SpaceNewsFeed from './components/SpaceNewsFeed'
import ISSAlertSystem from './components/ISSAlertSystem'
import EmailCapture from './components/EmailCapture'
import AdBanner from './components/AdBanner'
import AstronautsInSpace from './components/AstronautsInSpace'
import MoonPhase from './components/MoonPhase'
import LaunchCountdown from './components/LaunchCountdown'
import LiveTicker from './components/LiveTicker'
import StarMap from './components/StarMap'
import ISSPassPredictor from './components/ISSPassPredictor'
import SpaceQuiz from './components/SpaceQuiz'
import ShareCard from './components/ShareCard'
import AstroGallery from './components/AstroGallery'
import BlogPage from './pages/BlogPage'
import BlogArticlePage from './pages/BlogArticlePage'
import PremiumPage from './pages/PremiumPage'
import CityPage, { CITY_DATA } from './pages/CityPage'
import PrivacyPage from './pages/PrivacyPage'
import SuccessPage from './pages/SuccessPage'

type Tab = 'dashboard' | 'starmap' | 'tracker' | 'solar' | 'weather' | 'events' | 'news' | 'quiz' | 'blog' | 'gallery'

const TAB_DEFS: { id: Tab; icon: string; tKey: string }[] = [
  { id: 'dashboard', icon: '🛸', tKey: 'tab.dashboard' },
  { id: 'starmap',   icon: '🌌', tKey: 'tab.starmap' },
  { id: 'tracker',   icon: '🛰️', tKey: 'tab.tracker' },
  { id: 'solar',     icon: '🪐', tKey: 'tab.solar' },
  { id: 'weather',   icon: '⛈️', tKey: 'tab.weather' },
  { id: 'events',    icon: '🌠', tKey: 'tab.events' },
  { id: 'news',      icon: '📰', tKey: 'tab.news' },
  { id: 'quiz',      icon: '🧠', tKey: 'tab.quiz' },
  { id: 'blog',      icon: '📝', tKey: 'tab.blog' },
  { id: 'gallery',   icon: '🔭', tKey: 'tab.gallery' },
]

const FOOTER_FEATURES = [
  { icon: '🛸', label: 'ISS Tracker' },
  { icon: '🌌', label: 'Star Map' },
  { icon: '🛰️', label: 'Satellites' },
  { icon: '🌙', label: 'Moon Phase' },
  { icon: '🚀', label: 'Launches' },
  { icon: '⛈️', label: 'Space Weather' },
]

class SafeWrap extends Component<{ children: ReactNode }, { ok: boolean }> {
  state = { ok: true }
  static getDerivedStateFromError() { return { ok: false } }
  render() { return this.state.ok ? this.props.children : null }
}

function SkeletonCard() {
  return (
    <div className="space-card p-8 animate-pulse">
      <div className="h-4 bg-white/10 rounded-full w-48 mb-4" />
      <div className="h-3 bg-white/05 rounded-full w-64 mb-8" />
      <div className="h-64 bg-white/05 rounded-2xl" />
    </div>
  )
}

function MainApp() {
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [issData, setIssData] = useState<{ lat: number; lng: number; alt: number } | null>(null)
  const issRef = useRef<HTMLDivElement>(null)
  const tabContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => setIssData({ lat: d.latitude, lng: d.longitude, alt: d.altitude }))
      .catch(() => {})
  }, [])

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    setTimeout(() => {
      tabContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const scrollToISS = () => {
    setActiveTab('dashboard')
    setTimeout(() => issRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const goToPremium = () => { window.location.href = '/premium' }

  return (
    <div className="min-h-screen relative" style={{ background: '#020510' }}>
      <SafeWrap><SpaceBackground /></SafeWrap>

      <div className="relative" style={{ zIndex: 1 }}>
        <Header
          onThemeToggle={() => {}}
          onPremium={goToPremium}
        />
        <LiveTicker />
        <Hero onPremium={() => {}} onScrollToISS={scrollToISS} />

        {/* Divider */}
        <div className="divider-glow my-0" />

        <div className="max-w-7xl mx-auto px-4 py-6 mb-2">
          <AdBanner />
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-20">

          {/* Tab navigation */}
          <div ref={tabContentRef} style={{ scrollMarginTop: 80 }}>
            <div
              className="flex gap-1.5 mb-8 overflow-x-auto pb-2"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              {TAB_DEFS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={`tab-pill flex-shrink-0 flex items-center gap-1.5 ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <span>{tab.icon}</span>
                  <span>{t(tab.tKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div key={activeTab} className="animate-fade-up" style={{ animationDuration: '0.4s' }}>

            {activeTab === 'dashboard' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <AstronautsInSpace />
                  <MoonPhase />
                  <LaunchCountdown />
                </div>
                <div ref={issRef}><ISSAlertSystem /></div>
                <ISSPassPredictor />
                <ISSTracker />
                <ShareCard issLat={issData?.lat} issLng={issData?.lng} issAlt={issData?.alt} />
                <NasaAPOD />
                <AdBanner />
              </div>
            )}

            {activeTab === 'starmap' && (
              <div className="space-y-5">
                <StarMap />
                <div className="space-card p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="icon-box text-xl">🛸</div>
                    <div>
                      <h3 className="text-white font-bold text-base">See ISS in Tonight's Sky</h3>
                      <p className="text-gray-500 text-xs">Switch to ISS Live for exact pass times</p>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('dashboard')} className="btn-shimmer px-5 py-2.5 text-sm">
                    🛸 Go to ISS Live
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'tracker' && (
              <Suspense fallback={<SkeletonCard />}>
                <SatelliteTracker />
              </Suspense>
            )}

            {activeTab === 'solar' && (
              <div className="space-card p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="icon-box">🪐</div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Solar System — 3D</h3>
                    <p className="text-gray-500 text-sm">Interactive real-time planet positions</p>
                  </div>
                </div>
                <Suspense fallback={<SkeletonCard />}>
                  <SolarSystem3D />
                </Suspense>
              </div>
            )}

            {activeTab === 'weather' && <SpaceWeather />}
            {activeTab === 'events'  && <EventsCalendar />}

            {activeTab === 'news' && (
              <div className="space-y-5">
                <SpaceNewsFeed />
                <AdBanner />
              </div>
            )}

            {activeTab === 'quiz' && (
              <div className="max-w-lg mx-auto">
                <SpaceQuiz />
              </div>
            )}

            {activeTab === 'blog' && <BlogPage />}

            {activeTab === 'gallery' && <AstroGallery />}

          </div>

          <div className="mt-14 mb-4">
            <div className="divider-glow mb-12" />
            <EmailCapture />
          </div>
        </div>

        {/* FOOTER */}
        <footer style={{ background: 'linear-gradient(180deg, rgba(2,5,16,0) 0%, rgba(2,5,16,0.8) 30%, #020510 100%)', borderTop: '1px solid rgba(99,102,241,0.1)' }}>
          <div className="max-w-5xl mx-auto px-4 py-16">

            {/* Top row */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-10 mb-12">
              {/* Brand */}
              <div className="text-center md:text-left flex-shrink-0">
                <div className="flex items-center gap-3 justify-center md:justify-start mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 flex items-center justify-center text-xl shadow-lg shadow-indigo-900/60">
                    🚀
                  </div>
                  <div className="font-black text-2xl text-white">Space<span className="gradient-text">Hub</span></div>
                </div>
                <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
                  The world's most complete free space data platform. Track the ISS live, monitor space weather, explore the solar system.
                </p>
              </div>

              {/* Features grid */}
              <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-3">
                {FOOTER_FEATURES.map(f => (
                  <div key={f.label} className="text-center p-3 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:border-indigo-500/30 hover:bg-indigo-500/[0.05] transition-all cursor-default">
                    <div className="text-xl mb-1">{f.icon}</div>
                    <div className="text-gray-600 text-[10px] font-medium">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="divider-glow mb-8" />

            {/* Links */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center mb-6">
              <Link to="/blog" className="text-gray-600 hover:text-indigo-400 text-xs font-medium transition-colors">📝 Blog</Link>
              <Link to="/privacy" className="text-gray-600 hover:text-indigo-400 text-xs font-medium transition-colors">Privacy Policy</Link>
              {Object.entries(CITY_DATA).map(([slug, c]) => (
                <Link key={slug} to={`/iss/${slug}`} className="text-gray-700 hover:text-gray-400 text-xs transition-colors">
                  ISS {c.name}
                </Link>
              ))}
            </div>

            {/* Data sources */}
            <div className="text-center">
              <p className="text-gray-700 text-xs mb-2">
                Data: NASA Open APIs • Spaceflight News API • wheretheiss.at • open-notify.org
              </p>
              <p className="text-gray-800 text-xs">© 2026 SpaceHub · Made with ❤️ for space enthusiasts everywhere</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SafeWrap><MainApp /></SafeWrap>} />
          <Route path="/blog" element={
            <div style={{ background: '#020510', minHeight: '100vh' }}>
              <div style={{ zIndex: 1, position: 'relative' }}>
                <Link to="/" className="fixed top-4 right-4 z-50 text-indigo-400 text-xs px-4 py-2 rounded-xl transition-all font-semibold" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}>
                  ← SpaceHub
                </Link>
                <BlogPage />
              </div>
            </div>
          } />
          <Route path="/blog/:slug" element={<BlogArticlePage />} />
          <Route path="/premium" element={<PremiumPage />} />
          <Route path="/iss/:city" element={<CityPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/success" element={<SuccessPage />} />
        </Routes>
      </BrowserRouter>
    </LangProvider>
  )
}
