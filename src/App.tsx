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
const MarsRoverDashboard = lazy(() => import('./components/MarsRoverDashboard'))
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
const SpaceTimeline = lazy(() => import('./components/SpaceTimeline'))
const NightSessionPlanner = lazy(() => import('./components/NightSessionPlanner'))
const ObservationLog = lazy(() => import('./components/ObservationLog'))
const AstroCalculator = lazy(() => import('./components/AstroCalculator'))
const PlanetVisibilityCalendar = lazy(() => import('./components/PlanetVisibilityCalendar'))
const ARStarFinder = lazy(() => import('./components/ARStarFinder'))
const TelescopeAdvisor = lazy(() => import('./components/TelescopeAdvisor'))
const TonightsSky = lazy(() => import('./components/TonightsSky'))
const PlanetaryMoons = lazy(() => import('./components/PlanetaryMoons'))
const HRDiagram = lazy(() => import('./components/HRDiagram'))
const SpaceDebris = lazy(() => import('./components/SpaceDebris'))
const BlackHoleVisualizer = lazy(() => import('./components/BlackHoleVisualizer'))
const VariableStarTracker = lazy(() => import('./components/VariableStarTracker'))
const CosmicScale = lazy(() => import('./components/CosmicScale'))
const SpacecraftSpeed = lazy(() => import('./components/SpacecraftSpeed'))
const SolarFlareAlerts = lazy(() => import('./components/SolarFlareAlerts'))
const DwarfPlanets = lazy(() => import('./components/DwarfPlanets'))
const MarsColonyPlanner = lazy(() => import('./components/MarsColonyPlanner'))
const RadiationCalculator = lazy(() => import('./components/RadiationCalculator'))
const GravitationalWaveExplorer = lazy(() => import('./components/GravitationalWaveExplorer'))
const TimeDilationCalculator = lazy(() => import('./components/TimeDilationCalculator'))
const RocketEngineComparison = lazy(() => import('./components/RocketEngineComparison'))
const StellarEvolutionSimulator = lazy(() => import('./components/StellarEvolutionSimulator'))
const SpaceAgencyTracker = lazy(() => import('./components/SpaceAgencyTracker'))
const NeutronStarVisualizer = lazy(() => import('./components/NeutronStarVisualizer'))
const OrbitalMechanicsLab = lazy(() => import('./components/OrbitalMechanicsLab'))
const TelescopeHistory = lazy(() => import('./components/TelescopeHistory'))
const SpaceFoodGuide = lazy(() => import('./components/SpaceFoodGuide'))
const CosmicDistanceCalculator = lazy(() => import('./components/CosmicDistanceCalculator'))
const MilkyWayMap = lazy(() => import('./components/MilkyWayMap'))
const CosmologyTimeline = lazy(() => import('./components/CosmologyTimeline'))
const AstrobioExplorer = lazy(() => import('./components/AstrobioExplorer'))
const AtmosphereComparison = lazy(() => import('./components/AtmosphereComparison'))
const CosmicSizeComparison = lazy(() => import('./components/CosmicSizeComparison'))
const SpaceHealthEffects = lazy(() => import('./components/SpaceHealthEffects'))
const DrakeEquation = lazy(() => import('./components/DrakeEquation'))
const SpacePropulsion = lazy(() => import('./components/SpacePropulsion'))
const StellarNucleosynthesis = lazy(() => import('./components/StellarNucleosynthesis'))
const SunLayers = lazy(() => import('./components/SunLayers'))
const LunarGeology = lazy(() => import('./components/LunarGeology'))
const AsteroidTypes = lazy(() => import('./components/AsteroidTypes'))
const SpaceWeatherHistory = lazy(() => import('./components/SpaceWeatherHistory'))
const InterstellarTravel = lazy(() => import('./components/InterstellarTravel'))
const PlanetaryRings = lazy(() => import('./components/PlanetaryRings'))
const ConstellationGuide = lazy(() => import('./components/ConstellationGuide'))
const DarkEnergyExplorer = lazy(() => import('./components/DarkEnergyExplorer'))
const IceGiants = lazy(() => import('./components/IceGiants'))
const SpaceDebrisDashboard = lazy(() => import('./components/SpaceDebrisDashboard'))
const CosmicEvents = lazy(() => import('./components/CosmicEvents'))
const NightSkyCalendar = lazy(() => import('./components/NightSkyCalendar'))
const SpaceRaceHistory = lazy(() => import('./components/SpaceRaceHistory'))
const SpectroscopyExplorer = lazy(() => import('./components/SpectroscopyExplorer'))
const ExoplanetAtmospheres = lazy(() => import('./components/ExoplanetAtmospheres'))
const SpaceColonization = lazy(() => import('./components/SpaceColonization'))
const RadioAstronomy = lazy(() => import('./components/RadioAstronomy'))
const CosmicWebExplorer = lazy(() => import('./components/CosmicWebExplorer'))
const SpaceTelescopes = lazy(() => import('./components/SpaceTelescopes'))
const ArtemisProgram = lazy(() => import('./components/ArtemisProgram'))
const AstrobiologyTimeline = lazy(() => import('./components/AstrobiologyTimeline'))
const SolarSystemFormation = lazy(() => import('./components/SolarSystemFormation'))
const SpaceEconomics = lazy(() => import('./components/SpaceEconomics'))
const NuclearFusionInSpace = lazy(() => import('./components/NuclearFusionInSpace'))
const GalacticArchitecture = lazy(() => import('./components/GalacticArchitecture'))
const PlanetaryAtmospheres = lazy(() => import('./components/PlanetaryAtmospheres'))
const QuantumCosmology = lazy(() => import('./components/QuantumCosmology'))
const SpaceNavigationHistory = lazy(() => import('./components/SpaceNavigationHistory'))
const SupernovaExplosions = lazy(() => import('./components/SupernovaExplosions'))
const CometExplorer = lazy(() => import('./components/CometExplorer'))
const MeteorShowers = lazy(() => import('./components/MeteorShowers'))
const DarkMatterDetectors = lazy(() => import('./components/DarkMatterDetectors'))
const GravitationalWaves = lazy(() => import('./components/GravitationalWaves'))
const SpaceLaw = lazy(() => import('./components/SpaceLaw'))
const NeutronStars = lazy(() => import('./components/NeutronStars'))
const EarthFromSpace = lazy(() => import('./components/EarthFromSpace'))
const InterstellarMedium = lazy(() => import('./components/InterstellarMedium'))
const CelestialMechanics = lazy(() => import('./components/CelestialMechanics'))
const SpaceProbes = lazy(() => import('./components/SpaceProbes'))
const CosmicExplosions = lazy(() => import('./components/CosmicExplosions'))
const TidesAndGravity = lazy(() => import('./components/TidesAndGravity'))
const PlanetaryScience = lazy(() => import('./components/PlanetaryScience'))
const AstronomyGlossary = lazy(() => import('./components/AstronomyGlossary'))
const MultiverseTheory = lazy(() => import('./components/MultiverseTheory'))
const LiveSpaceWeather = lazy(() => import('./components/LiveSpaceWeather'))
const RocketScienceCalculator = lazy(() => import('./components/RocketScienceCalculator'))
const BinaryStars = lazy(() => import('./components/BinaryStars'))
const CosmicElements = lazy(() => import('./components/CosmicElements'))
const SpaceHabitation = lazy(() => import('./components/SpaceHabitation'))
const DeepSpaceNetwork = lazy(() => import('./components/DeepSpaceNetwork'))
const AsteroidMining = lazy(() => import('./components/AsteroidMining'))
const ExoplanetWeather = lazy(() => import('./components/ExoplanetWeather'))
const GalacticCivilizations = lazy(() => import('./components/GalacticCivilizations'))
const NuclearAstrophysics = lazy(() => import('./components/NuclearAstrophysics'))
const SpaceDebrisTracker = lazy(() => import('./components/SpaceDebrisTracker'))
const AstroAI = lazy(() => import('./components/AstroAI'))
const CosmicCalendar = lazy(() => import('./components/CosmicCalendar'))
const PlanetaryDefense = lazy(() => import('./components/PlanetaryDefense'))
const StarlightCalculator = lazy(() => import('./components/StarlightCalculator'))
const ConstellationMythology = lazy(() => import('./components/ConstellationMythology'))
const CosmicDistanceLadder = lazy(() => import('./components/CosmicDistanceLadder'))
const SpaceHazards = lazy(() => import('./components/SpaceHazards'))
const AstroPhotography = lazy(() => import('./components/AstroPhotography'))
const BigBangTimeline = lazy(() => import('./components/BigBangTimeline'))
const ExtremeUniverse = lazy(() => import('./components/ExtremeUniverse'))
const SpaceMythsDebunked = lazy(() => import('./components/SpaceMythsDebunked'))
const QuantumInSpace = lazy(() => import('./components/QuantumInSpace'))
const CosmicNeighborhood = lazy(() => import('./components/CosmicNeighborhood'))
const SpaceWeirdObjects = lazy(() => import('./components/SpaceWeirdObjects'))
const OceanWorldsGuide = lazy(() => import('./components/OceanWorldsGuide'))
const CosmicClocks = lazy(() => import('./components/CosmicClocks'))
const NebulaeTypes = lazy(() => import('./components/NebulaeTypes'))
const SpaceFutureTech = lazy(() => import('./components/SpaceFutureTech'))
const DeepSpaceMessages = lazy(() => import('./components/DeepSpaceMessages'))
const SpaceInNumbers = lazy(() => import('./components/SpaceInNumbers'))
const AstronomyMilestones = lazy(() => import('./components/AstronomyMilestones'))
const SpaceAnimalExplorers = lazy(() => import('./components/SpaceAnimalExplorers'))
const StellarClassification = lazy(() => import('./components/StellarClassification'))
const SpaceSurvivalGuide = lazy(() => import('./components/SpaceSurvivalGuide'))
const CosmicRays = lazy(() => import('./components/CosmicRays'))
const PlanetaryGeology = lazy(() => import('./components/PlanetaryGeology'))
const SpaceDebrisTimeline = lazy(() => import('./components/SpaceDebrisTimeline'))
const FermiParadox = lazy(() => import('./components/FermiParadox'))
const AsteroidImpactSimulator = lazy(() => import('./components/AsteroidImpactSimulator'))
const UniverseScaleExplorer = lazy(() => import('./components/UniverseScaleExplorer'))
const CosmicHistoryTimeline = lazy(() => import('./components/CosmicHistoryTimeline'))
const LightTravelTime = lazy(() => import('./components/LightTravelTime'))
const SpaceTelescopeComparison = lazy(() => import('./components/SpaceTelescopeComparison'))
const PlanetaryFates = lazy(() => import('./components/PlanetaryFates'))
const ExoplanetHabitability = lazy(() => import('./components/ExoplanetHabitability'))
const SpaceSurvivalCalculator = lazy(() => import('./components/SpaceSurvivalCalculator'))
const CosmicRecipeBook = lazy(() => import('./components/CosmicRecipeBook'))
const StellarSizeComparison = lazy(() => import('./components/StellarSizeComparison'))
const SpaceMissionTimeline = lazy(() => import('./components/SpaceMissionTimeline'))
const UniverseRecords = lazy(() => import('./components/UniverseRecords'))
const PlanetWeightCalculator = lazy(() => import('./components/PlanetWeightCalculator'))
const WarpDriveCalculator = lazy(() => import('./components/WarpDriveCalculator'))
const SpaceAgeCalculator = lazy(() => import('./components/SpaceAgeCalculator'))
const StellarLifecycle = lazy(() => import('./components/StellarLifecycle'))
const BlackHoleJourney = lazy(() => import('./components/BlackHoleJourney'))
const CosmicAddress = lazy(() => import('./components/CosmicAddress'))
const DarkMatterDetective = lazy(() => import('./components/DarkMatterDetective'))
const FutureOfUniverse = lazy(() => import('./components/FutureOfUniverse'))
const AtomicOrigins = lazy(() => import('./components/AtomicOrigins'))
const GalacticMerger = lazy(() => import('./components/GalacticMerger'))
const SpacePsychology = lazy(() => import('./components/SpacePsychology'))
const SpaceMegastructures = lazy(() => import('./components/SpaceMegastructures'))
const CosmicMysteries = lazy(() => import('./components/CosmicMysteries'))
const CosmicOdds = lazy(() => import('./components/CosmicOdds'))
const CosmicCounters = lazy(() => import('./components/CosmicCounters'))
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

type Tab = 'dashboard' | 'starmap' | 'tracker' | 'solar' | 'weather' | 'events' | 'news' | 'quiz' | 'blog' | 'gallery' | 'spacex' | 'explore' | 'observe' | 'science' | 'ai'

const TAB_HASH: Record<Tab, string> = {
  dashboard: '#iss', starmap: '#starmap', tracker: '#tracker',
  solar: '#solar', weather: '#weather', events: '#events',
  news: '#news', quiz: '#quiz', blog: '#blog', gallery: '#gallery',
  spacex: '#spacex', explore: '#explore', observe: '#observe', science: '#science', ai: '#ai',
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
  science:   'Space Science Lab — SpaceHub',
  ai:        'AstroAI — Space Intelligence — SpaceHub',
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
  { id: 'science',   icon: '🔬', tKey: 'tab.science' },
  { id: 'news',      icon: '📰', tKey: 'tab.news' },
  { id: 'quiz',      icon: '🧠', tKey: 'tab.quiz' },
  { id: 'blog',      icon: '📝', tKey: 'tab.blog' },
  { id: 'gallery',   icon: '🖼️', tKey: 'tab.gallery' },
  { id: 'spacex',    icon: '🚀', tKey: 'tab.spacex' },
  { id: 'explore',   icon: '🔬', tKey: 'tab.explore' },
  { id: 'ai',        icon: '🤖', tKey: 'tab.ai' },
]

const FOOTER_FEATURES = [
  { icon: '🛸', label: 'ISS Tracker' },
  { icon: '🌌', label: 'Star Map' },
  { icon: '🛰️', label: 'Satellites' },
  { icon: '🌙', label: 'Moon Phase' },
  { icon: '🚀', label: 'Launches' },
  { icon: '⛈️', label: 'Space Weather' },
]

class SafeWrap extends Component<{ children: ReactNode; label?: string; root?: boolean }, { ok: boolean; err?: string }> {
  state: { ok: boolean; err?: string } = { ok: true }
  static getDerivedStateFromError(e: Error) { return { ok: false, err: e?.message } }
  componentDidCatch(e: Error) { console.error('[SafeWrap]', this.props.label ?? 'unknown', e) }
  render() {
    if (!this.state.ok) {
      if (this.props.root) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#020510', color: '#6b7280', fontFamily: 'system-ui, sans-serif', gap: 16, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>🚀</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>SpaceHub</div>
            <div style={{ fontSize: 13, color: '#f87171', maxWidth: 340, wordBreak: 'break-word', background: 'rgba(255,0,0,0.06)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,50,50,0.2)', fontFamily: 'monospace' }}>{this.state.err ?? 'Unknown error'}</div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '10px 24px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.2)', color: '#c4b5fd', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              ↺ Refresh
            </button>
          </div>
        )
      }
      return null
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
   
  }, [])

  /* Mobile swipe between tabs */
  useEffect(() => {
    let startX = 0, startY = 0
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.8) return
      const target = e.target as Element
      if (target.closest('canvas') || target.closest('[data-noswipe]')) return
      const idx = TAB_DEFS.findIndex(t => t.id === activeTabRef.current)
      if (dx < 0) {
        const next = TAB_DEFS[(idx + 1) % TAB_DEFS.length]
        if (next) switchTab(next.id)
      } else {
        const prev = TAB_DEFS[(idx - 1 + TAB_DEFS.length) % TAB_DEFS.length]
        if (prev) switchTab(prev.id)
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
   
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
        <SafeWrap label="Header"><Header onPremium={goToPremium} /></SafeWrap>
        <SafeWrap label="LiveTicker"><LiveTicker /></SafeWrap>
        <SafeWrap label="NotificationBanner"><NotificationBanner /></SafeWrap>
        {activeTab === 'dashboard' && <SafeWrap label="Hero"><Hero onPremium={() => {}} onScrollToISS={scrollToISS} /></SafeWrap>}

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
              data-noswipe
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
                <Reveal><SafeWrap label="TonightsSky"><Suspense fallback={<SkeletonCard />}><TonightsSky /></Suspense></SafeWrap></Reveal>
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
                <SafeWrap label="StarMap"><Suspense fallback={<SkeletonCard />}><StarMap /></Suspense></SafeWrap>
                <Suspense fallback={<SkeletonCard />}><MilkyWayMap /></Suspense>
                <SafeWrap label="ARStarFinder"><Suspense fallback={<SkeletonCard />}><ARStarFinder /></Suspense></SafeWrap>
                <Suspense fallback={<SkeletonCard />}><ConstellationGuide /></Suspense>
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
                <SafeWrap label="ARSkyView"><Suspense fallback={<SkeletonCard />}><ARSkyView /></Suspense></SafeWrap>
                <SafeWrap label="SatelliteTracker"><Suspense fallback={<SkeletonCard />}><SatelliteTracker /></Suspense></SafeWrap>
                <SafeWrap label="SpaceDebris"><Suspense fallback={<SkeletonCard />}><SpaceDebris /></Suspense></SafeWrap>
                <Suspense fallback={<SkeletonCard />}><SpaceDebrisDashboard /></Suspense>
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
                <Suspense fallback={<SkeletonCard />}><PlanetVisibilityCalendar /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetaryMoons /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetaryRings /></Suspense>
                <Suspense fallback={<SkeletonCard />}><IceGiants /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetaryAtmospheres /></Suspense>
                <Suspense fallback={<SkeletonCard />}><LunarGeology /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CometExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><MeteorShowers /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetaryScience /></Suspense>
              </div>
            )}

            {activeTab === 'weather' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><LiveSpaceWeather /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SolarFlareAlerts /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AuroraForecast /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceWeatherHistory /></Suspense>
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
                <Suspense fallback={<SkeletonCard />}><NightSkyCalendar /></Suspense>
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
                <Suspense fallback={<SkeletonCard />}><ExoplanetAtmospheres /></Suspense>
                <Suspense fallback={<SkeletonCard />}><MarsRoverDashboard /></Suspense>
                <AdBanner />
                <Suspense fallback={<SkeletonCard />}><GalaxyExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DeepSkyBrowser /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceTimeline /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DwarfPlanets /></Suspense>
                <Suspense fallback={<SkeletonCard />}><MarsColonyPlanner /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceAgencyTracker /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceFoodGuide /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AsteroidTypes /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceColonization /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ArtemisProgram /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceEconomics /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceNavigationHistory /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceRaceHistory /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceLaw /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceHabitation /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DeepSpaceNetwork /></Suspense>
              </div>
            )}

            {activeTab === 'science' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><StellarEvolutionSimulator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><HRDiagram /></Suspense>
                <Suspense fallback={<SkeletonCard />}><BlackHoleVisualizer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><GravitationalWaveExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><NeutronStarVisualizer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><TimeDilationCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><OrbitalMechanicsLab /></Suspense>
                <Suspense fallback={<SkeletonCard />}><TelescopeHistory /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicDistanceCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmologyTimeline /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AstrobioExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AtmosphereComparison /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicSizeComparison /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceHealthEffects /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DrakeEquation /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpacePropulsion /></Suspense>
                <Suspense fallback={<SkeletonCard />}><StellarNucleosynthesis /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicScale /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SunLayers /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpacecraftSpeed /></Suspense>
                <Suspense fallback={<SkeletonCard />}><VariableStarTracker /></Suspense>
                <Suspense fallback={<SkeletonCard />}><RadiationCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><RocketEngineComparison /></Suspense>
                <Suspense fallback={<SkeletonCard />}><InterstellarTravel /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DarkEnergyExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicEvents /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpectroscopyExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><RadioAstronomy /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AstrobiologyTimeline /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SolarSystemFormation /></Suspense>
                <Suspense fallback={<SkeletonCard />}><NuclearFusionInSpace /></Suspense>
                <Suspense fallback={<SkeletonCard />}><GalacticArchitecture /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicWebExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceTelescopes /></Suspense>
                <Suspense fallback={<SkeletonCard />}><QuantumCosmology /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SupernovaExplosions /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DarkMatterDetectors /></Suspense>
                <Suspense fallback={<SkeletonCard />}><GravitationalWaves /></Suspense>
                <Suspense fallback={<SkeletonCard />}><NeutronStars /></Suspense>
                <Suspense fallback={<SkeletonCard />}><InterstellarMedium /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CelestialMechanics /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceProbes /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicExplosions /></Suspense>
                <Suspense fallback={<SkeletonCard />}><TidesAndGravity /></Suspense>
                <Suspense fallback={<SkeletonCard />}><MultiverseTheory /></Suspense>
                <Suspense fallback={<SkeletonCard />}><BinaryStars /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicElements /></Suspense>
                <Suspense fallback={<SkeletonCard />}><RocketScienceCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AsteroidMining /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ExoplanetWeather /></Suspense>
                <Suspense fallback={<SkeletonCard />}><GalacticCivilizations /></Suspense>
                <Suspense fallback={<SkeletonCard />}><NuclearAstrophysics /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceDebrisTracker /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetaryDefense /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ConstellationMythology /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicDistanceLadder /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceHazards /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AstroPhotography /></Suspense>
                <Suspense fallback={<SkeletonCard />}><BigBangTimeline /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ExtremeUniverse /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceMythsDebunked /></Suspense>
                <Suspense fallback={<SkeletonCard />}><QuantumInSpace /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicNeighborhood /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceWeirdObjects /></Suspense>
                <Suspense fallback={<SkeletonCard />}><OceanWorldsGuide /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicClocks /></Suspense>
                <Suspense fallback={<SkeletonCard />}><NebulaeTypes /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceFutureTech /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DeepSpaceMessages /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceInNumbers /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AstronomyMilestones /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceAnimalExplorers /></Suspense>
                <Suspense fallback={<SkeletonCard />}><StellarClassification /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceSurvivalGuide /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicRays /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetaryGeology /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceDebrisTimeline /></Suspense>
                <Suspense fallback={<SkeletonCard />}><FermiParadox /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AsteroidImpactSimulator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><UniverseScaleExplorer /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicHistoryTimeline /></Suspense>
                <Suspense fallback={<SkeletonCard />}><LightTravelTime /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceTelescopeComparison /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetaryFates /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ExoplanetHabitability /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceSurvivalCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicRecipeBook /></Suspense>
                <Suspense fallback={<SkeletonCard />}><StellarSizeComparison /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceMissionTimeline /></Suspense>
                <Suspense fallback={<SkeletonCard />}><UniverseRecords /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PlanetWeightCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><WarpDriveCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceAgeCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><StellarLifecycle /></Suspense>
                <Suspense fallback={<SkeletonCard />}><BlackHoleJourney /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicAddress /></Suspense>
                <Suspense fallback={<SkeletonCard />}><DarkMatterDetective /></Suspense>
                <Suspense fallback={<SkeletonCard />}><FutureOfUniverse /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AtomicOrigins /></Suspense>
                <Suspense fallback={<SkeletonCard />}><GalacticMerger /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpacePsychology /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceMegastructures /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicMysteries /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicOdds /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicCounters /></Suspense>
              </div>
            )}

            {activeTab === 'observe' && (
              <div className="space-y-5">
                <Suspense fallback={<SkeletonCard />}><ObservationLog /></Suspense>
                <Suspense fallback={<SkeletonCard />}><NightSessionPlanner /></Suspense>
                <Suspense fallback={<SkeletonCard />}><PersonalSkyReport /></Suspense>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Suspense fallback={<SkeletonCard />}><SeeingForecast /></Suspense>
                  <Suspense fallback={<SkeletonCard />}><LightPollutionMeter /></Suspense>
                </div>
                <Suspense fallback={<SkeletonCard />}><AstroPhotoPlanner /></Suspense>
                <Suspense fallback={<SkeletonCard />}><TelescopeAdvisor /></Suspense>
                <Suspense fallback={<SkeletonCard />}><ExoplanetTransitPlanner /></Suspense>
                <Suspense fallback={<SkeletonCard />}><SpaceSounds /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AstroCalculator /></Suspense>
                <Suspense fallback={<SkeletonCard />}><EarthFromSpace /></Suspense>
                <Suspense fallback={<SkeletonCard />}><AstronomyGlossary /></Suspense>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="max-w-3xl mx-auto space-y-5">
                <Suspense fallback={<SkeletonCard />}><AstroAI /></Suspense>
                <Suspense fallback={<SkeletonCard />}><CosmicCalendar /></Suspense>
                <Suspense fallback={<SkeletonCard />}><StarlightCalculator /></Suspense>
              </div>
            )}

            {activeTab === 'blog' && <SafeWrap label="BlogPage"><BlogPage /></SafeWrap>}

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
            <SafeWrap label="EmailCapture"><Suspense fallback={null}><EmailCapture /></Suspense></SafeWrap>
          </div>
        </main>

        <SafeWrap label="Onboarding"><Onboarding /></SafeWrap>
        <SafeWrap label="ScrollToTop"><ScrollToTop /></SafeWrap>
        <SafeWrap label="MobileNav"><MobileNav active={activeTab} onSwitch={(t) => switchTab(t as Tab)} /></SafeWrap>

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
          <Route path="/" element={<SafeWrap root label="MainApp"><MainApp /></SafeWrap>} />
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
