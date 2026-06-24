import { useState, useEffect, useRef, Component, lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import './App.css'
import { LangProvider } from './i18n/LangContext'
import { useLang } from './i18n/LangContext'
import Onboarding from './components/Onboarding'
import Header from './components/Header'
import Hero from './components/Hero'
const SatelliteTracker = lazy(() => import('./components/SatelliteTracker'))
const SpaceWeather = lazy(() => import('./components/SpaceWeather'))
const EventsCalendar = lazy(() => import('./components/EventsCalendar'))
const SpaceNewsFeed = lazy(() => import('./components/SpaceNewsFeed'))
const SpaceQuiz = lazy(() => import('./components/SpaceQuiz'))
const AstroGallery = lazy(() => import('./components/AstroGallery'))
const ISSTracker = lazy(() => import('./components/ISSTracker'))
import SpaceBackground from './components/SpaceBackground'
const SolarSystem3D = lazy(() => import('./components/SolarSystem3D'))
const NasaAPOD = lazy(() => import('./components/NasaAPOD'))
const ISSAlertSystem = lazy(() => import('./components/ISSAlertSystem'))
const EmailCapture = lazy(() => import('./components/EmailCapture'))
import AdBanner from './components/AdBanner'
const AstronautsInSpace = lazy(() => import('./components/AstronautsInSpace'))
const MoonPhase = lazy(() => import('./components/MoonPhase'))
const LaunchCountdown = lazy(() => import('./components/LaunchCountdown'))
import LiveTicker from './components/LiveTicker'
const StarMap = lazy(() => import('./components/StarMap'))
const ISSPassPredictor = lazy(() => import('./components/ISSPassPredictor'))
const ShareCard = lazy(() => import('./components/ShareCard'))
const AsteroidTracker = lazy(() => import('./components/AsteroidTracker'))
const SpaceHistory = lazy(() => import('./components/SpaceHistory'))
const WeeklyUpdates = lazy(() => import('./components/WeeklyUpdates'))
const MeteorShower3D = lazy(() => import('./components/MeteorShower3D'))
const JWSTGallery = lazy(() => import('./components/JWSTGallery'))
const MarsWeather = lazy(() => import('./components/MarsWeather'))
const MarsCountdown = lazy(() => import('./components/MarsCountdown'))
const SpaceCostChart = lazy(() => import('./components/SpaceCostChart'))
const RocketReusability = lazy(() => import('./components/RocketReusability'))
const ArtemisMoonMap = lazy(() => import('./components/ArtemisMoonMap'))
const SpaceXNewsFeed = lazy(() => import('./components/SpaceXNewsFeed'))
const SpaceMissions = lazy(() => import('./components/SpaceMissions'))
const PlanetExplorer = lazy(() => import('./components/PlanetExplorer'))
const ExoplanetExplorer = lazy(() => import('./components/ExoplanetExplorer'))
const GalaxyExplorer = lazy(() => import('./components/GalaxyExplorer'))
const ARSkyView = lazy(() => import('./components/ARSkyView'))
const ExoplanetTransitPlanner = lazy(() => import('./components/ExoplanetTransitPlanner'))
const AstroPhotoPlanner = lazy(() => import('./components/AstroPhotoPlanner'))
const EclipseCountdown = lazy(() => import('./components/EclipseCountdown'))
const AuroraForecast = lazy(() => import('./components/AuroraForecast'))
const ConjunctionAlert = lazy(() => import('./components/ConjunctionAlert'))
const CometTracker = lazy(() => import('./components/CometTracker'))
const SpaceSounds = lazy(() => import('./components/SpaceSounds'))
const DeepSkyBrowser = lazy(() => import('./components/DeepSkyBrowser'))
const PersonalSkyReport = lazy(() => import('./components/PersonalSkyReport'))
const SeeingForecast = lazy(() => import('./components/SeeingForecast'))
const LightPollutionMeter = lazy(() => import('./components/LightPollutionMeter'))
import Reveal from './components/Reveal'
import NotificationBanner from './components/NotificationBanner'
import MobileNav from './components/MobileNav'
import { ISSProvider, useISS } from './contexts/ISSContext'
import BlogPage from './pages/BlogPage'
import BlogArticlePage from './pages/BlogArticlePage'
import PremiumPage from './pages/PremiumPage'
import CityPage, { CITY_DATA } from './pages/CityPage'
import PrivacyPage from './pages/PrivacyPage'
import SuccessPage from './pages/SuccessPage'
import NotFoundPage from './pages/NotFoundPage'

type Tab = 'dashboard' | 'starmap' | 'tracker' | 'solar' | 'weather' | 'events' | 'news' | 'quiz' | 'blog' | 'gallery' | 'spacex' | 'explore' | 'observe'

const TAB_HASH: Record<Tab, string> = {
  dashboard: '#iss', starmap: '#starmap', tracker: '#tracker',
  solar: '#solar', weather: '#weather', events: '#events',
  news: '#news', quiz: '#quiz', blog: '#blog', gallery: '#gallery',
  spacex: '#spacex', explore: '#explore', observe: '#observe',
}

const TAB_TITLES: Record<Tab, string> = {
  dashboard: 'SpaceHub — Live ISS Tracker & Space Data',
  starmap:   'Star Map — SpaceHub',
  tracker:   'Satellite Tracker — SpaceHub',
  solar:     'Solar System 3D — SpaceHub',
  weather:   'Space Weather — SpaceHub',
  events:    'Space Events Calendar — SpaceHub',
  news:      'Space News — SpaceHub',
  quiz:      'Space Quiz — SpaceHub',
  blog:      'Space Blog — SpaceHub',
  gallery:   'JWST Gallery — SpaceHub',
  spacex:    'SpaceX & Mars — SpaceHub',
  explore:   'Explore the Universe — SpaceHub',
  observe:   'Observer Tools — SpaceHub',
}
const HASH_TAB: Record<string, Tab> = Object.fromEntries(
  Object.entries(TAB_HASH).map(([k, v]) => [v, k as Tab])
)

const TAB_DEFS: { id: Tab; icon: string; tKey: string }[] = [
  { id: 'dashboard', icon: '🛸', tKey: 'tab.dashboard' },
  { id: 'starmap',   icon: '🌌', tKey: 'tab.starmap' },
  { id: 'tracker',   icon: '🛰️', tKey: 'tab.tracker' },
  { id: 'solar',     icon: '🪐', tKey: 'tab.solar' },
  { id: 'weather',   icon: '⛈️', tKey: 'tab.weather' },
  { id: 'events',    icon: '🌠', tKey: 'tab.events' },
  { id: 'observe',   icon: '🔭', tKey: 'tab.observe' },
  { id: 'news',      icon: '📰', tKey: 'tab.news' },
  { id: 'quiz',      icon: '🧠', tKey: 'tab.quiz' },
  { id: 'blog',      icon: '📝', tKey: 'tab.blog' },
  { id: 'gallery',   icon: '🖼️', tKey: 'tab.gallery' },
  { id: 'spacex',    icon: '🚀', tKey: 'tab.spacex' },
  { id: 'explore',   icon: '🔬', tKey: 'tab.explore' },
]

const FOOTER_FEATURES = [
  { icon: '🛸', label: 'ISS Tracker' },
  { icon: '🌌', label: 'Star Map' },
  { icon: '🛰️', label: 'Satellites' },
  { icon: '🌙', label: 'Moon Phase' },
  { icon: '🚀', label: 'Launches' },
  { icon: '⛈️', label: 'Space Weather' },
]

class SafeWrap extends Component<{ children: ReactNode; label?: string; silent?: boolean }, { ok: boolean }> {
  state = { ok: true }
  static getDerivedStateFromError() { return { ok: false } }
  render() {
    if (!this.state.ok) {
      if (this.props.silent || this.props.label === 'background') return null
      return (
        <div className="space-card p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-gray-500 text-sm mb-3">{this.props.label ?? 'Widget'} couldn't load</p>
          <button
            onClick={() => this.setState({ ok: true })}
            className="text-xs px-4 py-2 rounded-xl transition-all"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
          >
            ↺ Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!visible) return null
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      className="fixed bottom-6 right-5 z-50 w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-xl transition-all hover:scale-110"
      style={{ background: 'rgba(99,102,241,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(99,102,241,0.6)' }}
    >
      ↑
    </button>
  )
}

function SkeletonCard() {
  return (
    <div className="space-card p-6 overflow-hidden">
      <div className="flex items-center gap-3 mb-5">
        <div className="skeleton-line w-12 h-12 rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-line h-4 w-40" />
          <div className="skeleton-line h-3 w-24" />
        </div>
      </div>
      <div className="skeleton-line h-52 rounded-2xl mb-4" />
      <div className="space-y-2.5">
        <div className="skeleton-line h-3 w-full" />
        <div className="skeleton-line h-3 w-4/5" />
        <div className="skeleton-line h-3 w-3/5" />
      </div>
    </div>
  )
}

function MainApp() {
  const { t } = useLang()
  const { iss: issCtx } = useISS()
  const initTab = (): Tab => HASH_TAB[window.location.hash] ?? 'dashboard'
  const [activeTab, setActiveTab] = useState<Tab>(initTab)
  const issRef = useRef<HTMLDivElement>(null)
  const tabContentRef = useRef<HTMLDivElement>(null)
  const issData = issCtx ? { lat: issCtx.latitude, lng: issCtx.longitude, alt: issCtx.altitude } : null

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    window.history.replaceState(null, '', TAB_HASH[tab])
    document.title = TAB_TITLES[tab]
    setTimeout(() => {
      tabContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  /* Keyboard shortcuts: 1–9 switch tabs, ←/→ navigate adjacent tabs */
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  useEffect(() => {
    const KEYS: Record<string, Tab> = {
      '1': 'dashboard', '2': 'starmap', '3': 'tracker', '4': 'solar',
      '5': 'weather',   '6': 'events',  '7': 'news',    '8': 'quiz', '9': 'gallery',
    }
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tab = KEYS[e.key]
      if (tab) { switchTab(tab); return }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const idx = TAB_DEFS.findIndex(t => t.id === activeTabRef.current)
        const next = e.key === 'ArrowRight'
          ? TAB_DEFS[(idx + 1) % TAB_DEFS.length]
          : TAB_DEFS[(idx - 1 + TAB_DEFS.length) % TAB_DEFS.length]
        if (next) switchTab(next.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 3-D card tilt on mouse move */
  useEffect(() => {
    const SELECTORS = '.space-card, .stat-card'
    const onMove = (e: MouseEvent) => {
      const card = (e.target as Element).closest(SELECTORS) as HTMLElement | null
      if (!card) return
      const rect = card.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
      card.style.transform = `perspective(900px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg) translateY(-3px)`
      card.style.transition = 'transform 0.08s linear'
    }
    const onLeave = (e: MouseEvent) => {
      const card = (e.target as Element).closest(SELECTORS) as HTMLElement | null
      if (card) {
        card.style.transition = 'transform 0.45s cubic-bezier(0.22,1,0.36,1), border-color 0.3s ease, box-shadow 0.3s ease'
        card.style.transform = ''
      }
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave, true)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave, true)
    }
  }, [])

  useEffect(() => {
    const onHash = () => {
      const tab = HASH_TAB[window.location.hash]
      if (tab) setActiveTab(tab)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const scrollToISS = () => {
    setActiveTab('dashboard')
    setTimeout(() => issRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const goToPremium = () => { window.location.href = '/premium' }

  return (
    <div className="min-h-screen relative" style={{ background: '#020510' }}>
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      <SafeWrap label="background"><SpaceBackground /></SafeWrap>

      <div className="relative" style={{ zIndex: 1 }}>
        <Header onPremium={goToPremium} />
        <LiveTicker />
        <NotificationBanner />
        {activeTab === 'dashboard' && <Hero onPremium={() => {}} onScrollToISS={scrollToISS} />}

        {/* Divider */}
        <div className="divider-glow my-0" />

        <div className="max-w-7xl mx-auto px-4 py-6 mb-2">
          <AdBanner />
        </div>

        <main id="main-content" className="max-w-7xl mx-auto px-4 pb-20 md:pb-20" style={{ paddingBottom: 'max(80px, calc(60px + env(safe-area-inset-bottom)))' }}>

          {/* Tab navigation */}
          <div ref={tabContentRef} style={{ scrollMarginTop: 80 }}>
            <div className="relative mb-8">
              {/* Right fade hint — signals more tabs to scroll */}
              <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-16 z-10 md:hidden"
                style={{ background: 'linear-gradient(270deg, rgba(2,5,16,0.9), transparent)' }} />
            <div
              role="tablist"
              aria-label="Space sections"
              className="flex gap-1.5 overflow-x-auto pb-2"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              {TAB_DEFS.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  id={`tab-${tab.id}`}
                  onClick={() => switchTab(tab.id)}
                  className={`tab-pill flex-shrink-0 flex items-center gap-1.5 ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  <span>{t(tab.tKey)}</span>
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* Tab content */}
          <div
            id={`tabpanel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            tabIndex={-1}
            key={activeTab}
            className="animate-fade-up"
            style={{ animationDuration: '0.4s' }}
          >

            {activeTab === 'dashboard' && (
              <div className="space-y-5">
                <Reveal><SafeWrap label="Updates"><Suspense fallback={<SkeletonCard />}><WeeklyUpdates /></Suspense></SafeWrap></Reveal>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Reveal delay={1}><SafeWrap label="Astronauts"><Suspense fallback={<SkeletonCard />}><AstronautsInSpace /></Suspense></SafeWrap></Reveal>
                  <Reveal delay={2}><SafeWrap label="Moon Phase"><Suspense fallback={<SkeletonCard />}><MoonPhase /></Suspense></SafeWrap></Reveal>
                  <Reveal delay={3}><SafeWrap label="Launch Countdown"><Suspense fallback={<SkeletonCard />}><LaunchCountdown /></Suspense></SafeWrap></Reveal>
                </div>
                <Reveal><SafeWrap label="Space History"><Suspense fallback={<SkeletonCard />}><SpaceHistory /></Suspense></SafeWrap></Reveal>
                <Reveal><SafeWrap label="ISS Alerts"><div ref={issRef}><Suspense fallback={null}><ISSAlertSystem /></Suspense></div></SafeWrap></Reveal>
                <Reveal><SafeWrap label="ISS Pass Predictor"><Suspense fallback={<SkeletonCard />}><ISSPassPredictor /></Suspense></SafeWrap></Reveal>
                <Reveal><SafeWrap label="ISS Tracker"><Suspense fallback={<SkeletonCard />}><ISSTracker /></Suspense></SafeWrap></Reveal>
                <Reveal><SafeWrap label="Share Card"><Suspense fallback={null}><ShareCard issLat={issData?.lat} issLng={issData?.lng} issAlt={issData?.alt} /></Suspense></SafeWrap></Reveal>
                <Reveal><SafeWrap label="NASA APOD"><Suspense fallback={<SkeletonCard />}><NasaAPOD /></Suspense></SafeWrap></Reveal>
                <Reveal><SafeWrap label="Asteroid Tracker"><Suspense fallback={<SkeletonCard />}><AsteroidTracker /></Suspense></SafeWrap></Reveal>
                <AdBanner />
              </div>
            )}

            {activeTab === 'starmap' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><StarMap /></Suspense>
                <div className="space-card p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="icon-box text-xl">🛸</div>
                    <div>
                      <h3 className="text-white font-bold text-base">See ISS in Tonight's Sky</h3>
                      <p className="text-gray-500 text-xs">Switch to ISS Live for exact pass times</p>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('dashboard')} aria-label="Switch to ISS Live tab" className="btn-shimmer px-5 py-2.5 text-sm">
                    🛸 Go to ISS Live
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'tracker' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><ARSkyView /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SatelliteTracker /></Suspense>
              </div>
            )}

            {activeTab === 'solar' && (
              <div className="space-y-5">
                <div className="space-card p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="icon-box">🪐</div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Solar System — 3D</h3>
                      <p className="text-gray-500 text-sm">Interactive real-time planet positions</p>
                    </div>
                  </div>
                  <Suspense fallback={<SkeletonCard />}><SolarSystem3D /></Suspense>
                </div>
                <Suspense fallback={<SkeletonCard />}><PlanetExplorer /></Suspense>
              </div>
            )}

            {activeTab === 'weather' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><AuroraForecast /></Suspense>
                <Suspense fallback={<SkeletonCard />}><MarsWeather /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceWeather /></Suspense>
              </div>
            )}
            {activeTab === 'events' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><MeteorShower3D /></Suspense>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Suspense fallback={<SkeletonCard />}><EclipseCountdown /></Suspense>
                  <Suspense fallback={<SkeletonCard />}><ConjunctionAlert /></Suspense>
                </div>
                <Suspense fallback={<SkeletonCard />}><CometTracker /></Suspense>
                <Suspense fallback={<SkeletonCard />}><EventsCalendar /></Suspense>
              </div>
            )}

            {activeTab === 'news' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><SpaceNewsFeed /></Suspense>
                <AdBanner />
              </div>
            )}

            {activeTab === 'quiz' && (
              <div className="max-w-lg mx-auto">
                <Suspense fallback={<SkeletonCard />}><SpaceQuiz /></Suspense>
              </div>
            )}

            {activeTab === 'spacex' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Suspense fallback={<SkeletonCard />}><MarsCountdown /></Suspense>
                  <Suspense fallback={<SkeletonCard />}><RocketReusability /></Suspense>
                </div>
                <Suspense fallback={<SkeletonCard />}><SpaceCostChart /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceMissions /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ArtemisMoonMap /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceXNewsFeed /></Suspense>
              </div>
            )}

            {activeTab === 'explore' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><PlanetExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ExoplanetExplorer /></Suspense>
                <AdBanner />
                <Suspense fallback={<SkeletonCard />}><GalaxyExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DeepSkyBrowser /></Suspense>
              </div>
            )}

            {activeTab === 'observe' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><PersonalSkyReport /></Suspense>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Suspense fallback={<SkeletonCard />}><SeeingForecast /></Suspense>
                  <Suspense fallback={<SkeletonCard />}><LightPollutionMeter /></Suspense>
                </div>
                <Suspense fallback={<SkeletonCard />}><AstroPhotoPlanner /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ExoplanetTransitPlanner /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceSounds /></Suspense>
              </div>
            )}

            {activeTab === 'blog' && <BlogPage />}

            {activeTab === 'gallery' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><JWSTGallery /></Suspense>
                <AdBanner />
                <Suspense fallback={<SkeletonCard />}><AstroGallery /></Suspense>
              </div>
            )}

          </div>

          <div className="mt-14 mb-4">
            <div className="divider-glow mb-12" />
            <Suspense fallback={null}><EmailCapture /></Suspense>
          </div>
        </main>

        <Onboarding />
        <ScrollToTop />
        <MobileNav active={activeTab} onSwitch={(t) => switchTab(t as Tab)} />

        {/* FOOTER */}
        <footer style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(2,5,16,0.7) 20%, #020510 60%)', borderTop: '1px solid rgba(99,102,241,0.12)', position: 'relative' }}>
          {/* Footer aurora line */}
          <div aria-hidden="true" style={{ position: 'absolute', top: -1, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5), rgba(139,92,246,0.6), transparent)' }} />

          <div className="max-w-5xl mx-auto px-4 pt-16 md:py-16" style={{ paddingBottom: 'max(80px, calc(64px + env(safe-area-inset-bottom)))' }}>

            {/* Top row */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-12 mb-14">
              {/* Brand */}
              <div className="text-center md:text-left flex-shrink-0 max-w-xs">
                <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 flex items-center justify-center text-xl shadow-lg shadow-indigo-900/60 animate-glow-pulse">
                    🚀
                  </div>
                  <div className="font-black text-2xl text-white tracking-tight">Space<span className="gradient-text">Hub</span></div>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">
                  The world's most complete free space data platform.
                </p>
                <div className="flex items-center gap-2 justify-center md:justify-start">
                  <span className="live-dot" />
                  <span className="text-xs text-emerald-400 font-semibold">Live 24/7</span>
                  <span className="text-gray-700 text-xs">• Free forever</span>
                </div>
              </div>

              {/* Features grid */}
              <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {FOOTER_FEATURES.map(f => (
                  <div key={f.label} className="footer-feature-pill">
                    <div className="text-2xl">{f.icon}</div>
                    <div className="text-gray-500 text-[10px] font-semibold tracking-wide">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="divider-glow mb-8" />

            {/* Links */}
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-2 justify-center mb-6">
              <Link to="/blog" className="text-gray-500 hover:text-indigo-400 text-xs font-semibold transition-colors">📝 Blog</Link>
              <Link to="/premium" className="text-gray-500 hover:text-indigo-400 text-xs font-semibold transition-colors">⭐ Premium</Link>
              <Link to="/privacy" className="text-gray-500 hover:text-indigo-400 text-xs font-semibold transition-colors">Privacy Policy</Link>
              <span className="hidden md:contents">
                {Object.entries(CITY_DATA).map(([slug, c]) => (
                  <Link key={slug} to={`/iss/${slug}`} className="text-gray-700 hover:text-gray-400 text-xs transition-colors">
                    ISS {c.name}
                  </Link>
                ))}
              </span>
            </nav>

            {/* Data sources */}
            <div className="text-center">
              <p className="text-gray-700 text-xs mb-2">
                Data: NASA Open APIs • Spaceflight News API • wheretheiss.at (proxy) • open-notify.org (proxy) • NOAA SWPC
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
        <ISSProvider>
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
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </ISSProvider>
      </BrowserRouter>
    </LangProvider>
  )
}
