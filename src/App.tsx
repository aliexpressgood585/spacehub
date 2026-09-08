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
import LoadingScreen from './components/LoadingScreen'
import CursorGlow from './components/CursorGlow'
import Reveal from './components/Reveal'
import NotificationBanner from './components/NotificationBanner'
import MobileNav from './components/MobileNav'
import PageviewTracker from './components/PageviewTracker'
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
import { ISSProvider, useISS } from './contexts/ISSContext'
import { AuthProvider } from './contexts/AuthContext'
// Every route below is code-split. BlogPage alone carries ~190 KB of article
// prose; statically importing it put the full text of every article into the
// entry bundle that each homepage visitor downloads before seeing anything.
const BlogPage = lazy(() => import('./pages/BlogPage'))
const BlogArticlePage = lazy(() => import('./pages/BlogArticlePage'))
const PremiumPage = lazy(() => import('./pages/PremiumPage'))
const ToolsIndexPage = lazy(() => import('./pages/ToolsIndexPage'))
const ToolPage = lazy(() => import('./pages/ToolPage'))
const CityPage = lazy(() => import('./pages/CityPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const SuccessPage = lazy(() => import('./pages/SuccessPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
import { CITY_DATA } from './data/cities'

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
            <button onClick={() => { try { sessionStorage.setItem('_sw_fail', '1') } catch {} window.location.reload() }} style={{ marginTop: 8, padding: '10px 24px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.2)', color: '#c4b5fd', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
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
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))', backdropFilter: 'blur(16px)', border: '1px solid rgba(167,139,250,0.6)', boxShadow: '0 0 20px rgba(99,102,241,0.5), 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)' }}
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

function RouteFallback() {
  return (
    <div style={{ minHeight: '100vh', background: '#020510', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="skeleton-line" style={{ width: 220, height: 14, borderRadius: 8 }} aria-label="Loading page" role="status" />
    </div>
  )
}

/* Every card in every tab renders through <Section>, which bundles the three
   things each card needs — and which most of them were missing:
   - Reveal defers mounting until the card is within ~1200px of the viewport,
     so opening a long tab (Science holds ~110 cards) fetches a handful of
     chunks instead of firing every one of them at once;
   - SafeWrap keeps a crash inside the one card instead of blanking the page;
   - Suspense shows the skeleton while that card's chunk arrives. */
function Section({ children, label, delay }: { children: ReactNode; label?: string; delay?: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <Reveal delay={delay}>
      <SafeWrap label={label}>
        <Suspense fallback={<SkeletonCard />}>{children}</Suspense>
      </SafeWrap>
    </Reveal>
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
    // Only scroll to tab nav if it's above the viewport (user is in the hero section)
    setTimeout(() => {
      const el = tabContentRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.top > window.innerHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
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
      card.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-6px) scale(1.018)`
      card.style.transition = 'transform 0.06s linear'
    }
    const onLeave = (e: MouseEvent) => {
      const card = (e.target as Element).closest(SELECTORS) as HTMLElement | null
      if (card) {
        card.style.transition = 'transform 0.5s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease, box-shadow 0.4s ease'
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
  const [showDonate, setShowDonate] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShowDonate(true), 90000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen relative" style={{ background: '#020510' }}>
      <SafeWrap label="LoadingScreen"><LoadingScreen /></SafeWrap>
      <SafeWrap label="CursorGlow"><CursorGlow /></SafeWrap>
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      <SafeWrap label="background"><SpaceBackground /></SafeWrap>

      <div className="relative" style={{ zIndex: 1 }}>
        <SafeWrap label="Header"><Header onPremium={goToPremium} /></SafeWrap>
        <SafeWrap label="LiveTicker"><LiveTicker /></SafeWrap>
        <SafeWrap label="NotificationBanner"><NotificationBanner /></SafeWrap>
        {activeTab === 'dashboard' && <SafeWrap label="Hero"><Hero onPremium={() => {}} onScrollToISS={scrollToISS} /></SafeWrap>}

        {/* Divider */}
        <div className="divider-3d my-0" />

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
              className="flex gap-1.5 overflow-x-auto pb-2 px-2 pt-2 rounded-2xl"
              style={{
                scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
                background: 'rgba(8,10,30,0.92)',
                border: '1px solid rgba(99,102,241,0.10)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)',
              }}
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
            className="animate-tab-enter"
          >

            {activeTab === 'dashboard' && (
              <div className="space-y-5">
                <Section label="TonightsSky"><TonightsSky /></Section>
                <Section label="Updates"><WeeklyUpdates /></Section>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Section label="Astronauts" delay={1}><AstronautsInSpace /></Section>
                  <Section label="Moon Phase" delay={2}><MoonPhase /></Section>
                  <Section label="Launch Countdown" delay={3}><LaunchCountdown /></Section>
                </div>
                <Section label="Space History"><SpaceHistory /></Section>
                <Reveal><SafeWrap label="ISS Alerts"><div ref={issRef}><Suspense fallback={null}><ISSAlertSystem /></Suspense></div></SafeWrap></Reveal>
                <Section label="ISS Pass Predictor"><ISSPassPredictor /></Section>
                <Section label="ISS Tracker"><ISSTracker /></Section>
                <Reveal><SafeWrap label="Share Card"><Suspense fallback={null}><ShareCard issLat={issData?.lat} issLng={issData?.lng} issAlt={issData?.alt} /></Suspense></SafeWrap></Reveal>
                <Section label="NASA APOD"><NasaAPOD /></Section>
                <Section label="Asteroid Tracker"><AsteroidTracker /></Section>
                <AdBanner />
              </div>
            )}

            {activeTab === 'starmap' && (
              <div className="space-y-5">
                <Section label="StarMap"><StarMap /></Section>
                <Section label="MilkyWayMap"><MilkyWayMap /></Section>
                <Section label="ARStarFinder"><ARStarFinder /></Section>
                <Section label="ConstellationGuide"><ConstellationGuide /></Section>
                <div className="space-card holo-border p-6">
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
                <Section label="ARSkyView"><ARSkyView /></Section>
                <Section label="SatelliteTracker"><SatelliteTracker /></Section>
                <Section label="SpaceDebris"><SpaceDebris /></Section>
                <Section label="SpaceDebrisDashboard"><SpaceDebrisDashboard /></Section>
              </div>
            )}

            {activeTab === 'solar' && (
              <div className="space-y-5">
                <div className="space-card holo-border sheen p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="icon-box">🪐</div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Solar System — 3D</h3>
                      <p className="text-gray-500 text-sm">Interactive real-time planet positions</p>
                    </div>
                  </div>
                  <Section label="SolarSystem3D"><SolarSystem3D /></Section>
                </div>
                <Section label="PlanetExplorer"><PlanetExplorer /></Section>
                <Section label="PlanetVisibilityCalendar"><PlanetVisibilityCalendar /></Section>
                <Section label="PlanetaryMoons"><PlanetaryMoons /></Section>
                <Section label="PlanetaryRings"><PlanetaryRings /></Section>
                <Section label="IceGiants"><IceGiants /></Section>
                <Section label="PlanetaryAtmospheres"><PlanetaryAtmospheres /></Section>
                <Section label="LunarGeology"><LunarGeology /></Section>
                <Section label="CometExplorer"><CometExplorer /></Section>
                <Section label="MeteorShowers"><MeteorShowers /></Section>
                <Section label="PlanetaryScience"><PlanetaryScience /></Section>
              </div>
            )}

            {activeTab === 'weather' && (
              <div className="space-y-5">
                <Section label="LiveSpaceWeather"><LiveSpaceWeather /></Section>
                <Section label="SolarFlareAlerts"><SolarFlareAlerts /></Section>
                <Section label="AuroraForecast"><AuroraForecast /></Section>
                <Section label="SpaceWeatherHistory"><SpaceWeatherHistory /></Section>
                <Section label="MarsWeather"><MarsWeather /></Section>
                <Section label="SpaceWeather"><SpaceWeather /></Section>
              </div>
            )}
            {activeTab === 'events' && (
              <div className="space-y-5">
                <Section label="MeteorShower3D"><MeteorShower3D /></Section>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Section label="EclipseCountdown"><EclipseCountdown /></Section>
                  <Section label="ConjunctionAlert"><ConjunctionAlert /></Section>
                </div>
                <Section label="CometTracker"><CometTracker /></Section>
                <Section label="EventsCalendar"><EventsCalendar /></Section>
                <Section label="NightSkyCalendar"><NightSkyCalendar /></Section>
              </div>
            )}

            {activeTab === 'news' && (
              <div className="space-y-5">
                <Section label="SpaceNewsFeed"><SpaceNewsFeed /></Section>
                <AdBanner />
              </div>
            )}

            {activeTab === 'quiz' && (
              <div className="max-w-lg mx-auto">
                <Section label="SpaceQuiz"><SpaceQuiz /></Section>
              </div>
            )}

            {activeTab === 'spacex' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Section label="MarsCountdown"><MarsCountdown /></Section>
                  <Section label="RocketReusability"><RocketReusability /></Section>
                </div>
                <Section label="SpaceCostChart"><SpaceCostChart /></Section>
                <Section label="SpaceMissions"><SpaceMissions /></Section>
                <Section label="ArtemisMoonMap"><ArtemisMoonMap /></Section>
                <Section label="SpaceXNewsFeed"><SpaceXNewsFeed /></Section>
              </div>
            )}

            {activeTab === 'explore' && (
              <div className="space-y-5">
                <Section label="PlanetExplorer"><PlanetExplorer /></Section>
                <Section label="ExoplanetExplorer"><ExoplanetExplorer /></Section>
                <Section label="ExoplanetAtmospheres"><ExoplanetAtmospheres /></Section>
                <Section label="MarsRoverDashboard"><MarsRoverDashboard /></Section>
                <AdBanner />
                <Section label="GalaxyExplorer"><GalaxyExplorer /></Section>
                <Section label="DeepSkyBrowser"><DeepSkyBrowser /></Section>
                <Section label="SpaceTimeline"><SpaceTimeline /></Section>
                <Section label="DwarfPlanets"><DwarfPlanets /></Section>
                <Section label="MarsColonyPlanner"><MarsColonyPlanner /></Section>
                <Section label="SpaceAgencyTracker"><SpaceAgencyTracker /></Section>
                <Section label="SpaceFoodGuide"><SpaceFoodGuide /></Section>
                <Section label="AsteroidTypes"><AsteroidTypes /></Section>
                <Section label="SpaceColonization"><SpaceColonization /></Section>
                <Section label="ArtemisProgram"><ArtemisProgram /></Section>
                <Section label="SpaceEconomics"><SpaceEconomics /></Section>
                <Section label="SpaceNavigationHistory"><SpaceNavigationHistory /></Section>
                <Section label="SpaceRaceHistory"><SpaceRaceHistory /></Section>
                <Section label="SpaceLaw"><SpaceLaw /></Section>
                <Section label="SpaceHabitation"><SpaceHabitation /></Section>
                <Section label="DeepSpaceNetwork"><DeepSpaceNetwork /></Section>
              </div>
            )}

            {activeTab === 'science' && (
              <div className="space-y-5">
                <Section label="StellarEvolutionSimulator"><StellarEvolutionSimulator /></Section>
                <Section label="HRDiagram"><HRDiagram /></Section>
                <Section label="BlackHoleVisualizer"><BlackHoleVisualizer /></Section>
                <Section label="GravitationalWaveExplorer"><GravitationalWaveExplorer /></Section>
                <Section label="NeutronStarVisualizer"><NeutronStarVisualizer /></Section>
                <Section label="TimeDilationCalculator"><TimeDilationCalculator /></Section>
                <Section label="OrbitalMechanicsLab"><OrbitalMechanicsLab /></Section>
                <Section label="TelescopeHistory"><TelescopeHistory /></Section>
                <Section label="CosmicDistanceCalculator"><CosmicDistanceCalculator /></Section>
                <Section label="CosmologyTimeline"><CosmologyTimeline /></Section>
                <Section label="AstrobioExplorer"><AstrobioExplorer /></Section>
                <Section label="AtmosphereComparison"><AtmosphereComparison /></Section>
                <Section label="CosmicSizeComparison"><CosmicSizeComparison /></Section>
                <Section label="SpaceHealthEffects"><SpaceHealthEffects /></Section>
                <Section label="DrakeEquation"><DrakeEquation /></Section>
                <Section label="SpacePropulsion"><SpacePropulsion /></Section>
                <Section label="StellarNucleosynthesis"><StellarNucleosynthesis /></Section>
                <Section label="CosmicScale"><CosmicScale /></Section>
                <Section label="SunLayers"><SunLayers /></Section>
                <Section label="SpacecraftSpeed"><SpacecraftSpeed /></Section>
                <Section label="VariableStarTracker"><VariableStarTracker /></Section>
                <Section label="RadiationCalculator"><RadiationCalculator /></Section>
                <Section label="RocketEngineComparison"><RocketEngineComparison /></Section>
                <Section label="InterstellarTravel"><InterstellarTravel /></Section>
                <Section label="DarkEnergyExplorer"><DarkEnergyExplorer /></Section>
                <Section label="CosmicEvents"><CosmicEvents /></Section>
                <Section label="SpectroscopyExplorer"><SpectroscopyExplorer /></Section>
                <Section label="RadioAstronomy"><RadioAstronomy /></Section>
                <Section label="AstrobiologyTimeline"><AstrobiologyTimeline /></Section>
                <Section label="SolarSystemFormation"><SolarSystemFormation /></Section>
                <Section label="NuclearFusionInSpace"><NuclearFusionInSpace /></Section>
                <Section label="GalacticArchitecture"><GalacticArchitecture /></Section>
                <Section label="CosmicWebExplorer"><CosmicWebExplorer /></Section>
                <Section label="SpaceTelescopes"><SpaceTelescopes /></Section>
                <Section label="QuantumCosmology"><QuantumCosmology /></Section>
                <Section label="SupernovaExplosions"><SupernovaExplosions /></Section>
                <Section label="DarkMatterDetectors"><DarkMatterDetectors /></Section>
                <Section label="GravitationalWaves"><GravitationalWaves /></Section>
                <Section label="NeutronStars"><NeutronStars /></Section>
                <Section label="InterstellarMedium"><InterstellarMedium /></Section>
                <Section label="CelestialMechanics"><CelestialMechanics /></Section>
                <Section label="SpaceProbes"><SpaceProbes /></Section>
                <Section label="CosmicExplosions"><CosmicExplosions /></Section>
                <Section label="TidesAndGravity"><TidesAndGravity /></Section>
                <Section label="MultiverseTheory"><MultiverseTheory /></Section>
                <Section label="BinaryStars"><BinaryStars /></Section>
                <Section label="CosmicElements"><CosmicElements /></Section>
                <Section label="RocketScienceCalculator"><RocketScienceCalculator /></Section>
                <Section label="AsteroidMining"><AsteroidMining /></Section>
                <Section label="ExoplanetWeather"><ExoplanetWeather /></Section>
                <Section label="GalacticCivilizations"><GalacticCivilizations /></Section>
                <Section label="NuclearAstrophysics"><NuclearAstrophysics /></Section>
                <Section label="SpaceDebrisTracker"><SpaceDebrisTracker /></Section>
                <Section label="PlanetaryDefense"><PlanetaryDefense /></Section>
                <Section label="ConstellationMythology"><ConstellationMythology /></Section>
                <Section label="CosmicDistanceLadder"><CosmicDistanceLadder /></Section>
                <Section label="SpaceHazards"><SpaceHazards /></Section>
                <Section label="AstroPhotography"><AstroPhotography /></Section>
                <Section label="BigBangTimeline"><BigBangTimeline /></Section>
                <Section label="ExtremeUniverse"><ExtremeUniverse /></Section>
                <Section label="SpaceMythsDebunked"><SpaceMythsDebunked /></Section>
                <Section label="QuantumInSpace"><QuantumInSpace /></Section>
                <Section label="CosmicNeighborhood"><CosmicNeighborhood /></Section>
                <Section label="SpaceWeirdObjects"><SpaceWeirdObjects /></Section>
                <Section label="OceanWorldsGuide"><OceanWorldsGuide /></Section>
                <Section label="CosmicClocks"><CosmicClocks /></Section>
                <Section label="NebulaeTypes"><NebulaeTypes /></Section>
                <Section label="SpaceFutureTech"><SpaceFutureTech /></Section>
                <Section label="DeepSpaceMessages"><DeepSpaceMessages /></Section>
                <Section label="SpaceInNumbers"><SpaceInNumbers /></Section>
                <Section label="AstronomyMilestones"><AstronomyMilestones /></Section>
                <Section label="SpaceAnimalExplorers"><SpaceAnimalExplorers /></Section>
                <Section label="StellarClassification"><StellarClassification /></Section>
                <Section label="SpaceSurvivalGuide"><SpaceSurvivalGuide /></Section>
                <Section label="CosmicRays"><CosmicRays /></Section>
                <Section label="PlanetaryGeology"><PlanetaryGeology /></Section>
                <Section label="SpaceDebrisTimeline"><SpaceDebrisTimeline /></Section>
                <Section label="FermiParadox"><FermiParadox /></Section>
                <Section label="AsteroidImpactSimulator"><AsteroidImpactSimulator /></Section>
                <Section label="UniverseScaleExplorer"><UniverseScaleExplorer /></Section>
                <Section label="CosmicHistoryTimeline"><CosmicHistoryTimeline /></Section>
                <Section label="LightTravelTime"><LightTravelTime /></Section>
                <Section label="SpaceTelescopeComparison"><SpaceTelescopeComparison /></Section>
                <Section label="PlanetaryFates"><PlanetaryFates /></Section>
                <Section label="ExoplanetHabitability"><ExoplanetHabitability /></Section>
                <Section label="SpaceSurvivalCalculator"><SpaceSurvivalCalculator /></Section>
                <Section label="CosmicRecipeBook"><CosmicRecipeBook /></Section>
                <Section label="StellarSizeComparison"><StellarSizeComparison /></Section>
                <Section label="SpaceMissionTimeline"><SpaceMissionTimeline /></Section>
                <Section label="UniverseRecords"><UniverseRecords /></Section>
                <Section label="PlanetWeightCalculator"><PlanetWeightCalculator /></Section>
                <Section label="WarpDriveCalculator"><WarpDriveCalculator /></Section>
                <Section label="SpaceAgeCalculator"><SpaceAgeCalculator /></Section>
                <Section label="StellarLifecycle"><StellarLifecycle /></Section>
                <Section label="BlackHoleJourney"><BlackHoleJourney /></Section>
                <Section label="CosmicAddress"><CosmicAddress /></Section>
                <Section label="DarkMatterDetective"><DarkMatterDetective /></Section>
                <Section label="FutureOfUniverse"><FutureOfUniverse /></Section>
                <Section label="AtomicOrigins"><AtomicOrigins /></Section>
                <Section label="GalacticMerger"><GalacticMerger /></Section>
                <Section label="SpacePsychology"><SpacePsychology /></Section>
                <Section label="SpaceMegastructures"><SpaceMegastructures /></Section>
                <Section label="CosmicMysteries"><CosmicMysteries /></Section>
                <Section label="CosmicOdds"><CosmicOdds /></Section>
                <Section label="CosmicCounters"><CosmicCounters /></Section>
              </div>
            )}

            {activeTab === 'observe' && (
              <div className="space-y-5">
                <Section label="ObservationLog"><ObservationLog /></Section>
                <Section label="NightSessionPlanner"><NightSessionPlanner /></Section>
                <Section label="PersonalSkyReport"><PersonalSkyReport /></Section>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Section label="SeeingForecast"><SeeingForecast /></Section>
                  <Section label="LightPollutionMeter"><LightPollutionMeter /></Section>
                </div>
                <Section label="AstroPhotoPlanner"><AstroPhotoPlanner /></Section>
                <Section label="TelescopeAdvisor"><TelescopeAdvisor /></Section>
                <Section label="ExoplanetTransitPlanner"><ExoplanetTransitPlanner /></Section>
                <Section label="SpaceSounds"><SpaceSounds /></Section>
                <Section label="AstroCalculator"><AstroCalculator /></Section>
                <Section label="EarthFromSpace"><EarthFromSpace /></Section>
                <Section label="AstronomyGlossary"><AstronomyGlossary /></Section>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="max-w-3xl mx-auto space-y-5">
                <Section label="AstroAI"><AstroAI /></Section>
                <Section label="CosmicCalendar"><CosmicCalendar /></Section>
                <Section label="StarlightCalculator"><StarlightCalculator /></Section>
              </div>
            )}

            {activeTab === 'blog' && <Section label="BlogPage"><BlogPage /></Section>}

            {activeTab === 'gallery' && (
              <div className="space-y-5">
                <Section label="JWSTGallery"><JWSTGallery /></Section>
                <AdBanner />
                <Section label="AstroGallery"><AstroGallery /></Section>
              </div>
            )}

          </div>

          <div className="mt-14 mb-4">
            <div className="divider-3d mb-12" />
            <SafeWrap label="EmailCapture"><Suspense fallback={null}><EmailCapture /></Suspense></SafeWrap>
          </div>
        </main>

        {/* Floating donate button — shown after 90s so user has seen the value first */}
        {showDonate && <form
          action="https://www.paypal.com/donate"
          method="post"
          target="_blank"
          style={{ position: 'fixed', bottom: 90, right: 18, zIndex: 9999 }}
        >
          <input type="hidden" name="business" value="Yakov104@gmail.com" />
          <input type="hidden" name="currency_code" value="USD" />
          <button
            type="submit"
            title="Support SpaceHub ❤️"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))',
              color: '#fff',
              border: '1px solid rgba(167,139,250,0.5)',
              boxShadow: '0 0 18px rgba(99,102,241,0.45), 0 6px 20px rgba(0,0,0,0.5)',
              borderRadius: '50%',
              width: 46,
              height: 46,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 20,
              transition: 'transform 0.2s, box-shadow 0.2s',
              backdropFilter: 'blur(12px)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.12)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
          >
            ❤️
          </button>
        </form>}

        <SafeWrap label="Onboarding"><Onboarding /></SafeWrap>
        <SafeWrap label="ScrollToTop"><ScrollToTop /></SafeWrap>
        <SafeWrap label="MobileNav"><MobileNav active={activeTab} onSwitch={(t) => switchTab(t as Tab)} /></SafeWrap>

        {/* FOOTER */}
        <footer style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(2,5,16,0.7) 20%, #020510 60%)', borderTop: '1px solid rgba(99,102,241,0.12)', position: 'relative' }}>
          {/* Footer aurora line */}
          <div aria-hidden="true" style={{ position: 'absolute', top: -1, left: '5%', right: '5%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(167,139,250,0.9), rgba(139,92,246,0.6), transparent)', boxShadow: '0 0 16px rgba(139,92,246,0.4), 0 0 40px rgba(99,102,241,0.2)' }} />

          <div className="max-w-5xl mx-auto px-4 pt-16 md:py-16" style={{ paddingBottom: 'max(80px, calc(64px + env(safe-area-inset-bottom)))' }}>

            {/* Top row */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-12 mb-14">
              {/* Brand */}
              <div className="text-center md:text-left flex-shrink-0 max-w-xs">
                <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl neon-card" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #a855f7)', border: '1px solid rgba(167,139,250,0.5)', boxShadow: '0 0 20px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                    🚀
                  </div>
                  <div className="font-black text-2xl tracking-tight chroma-text" style={{ color: '#fff' }}>Space<span className="gradient-text-aurora">Hub</span></div>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">
                  Real-time ISS tracking, NASA imagery, and space data — free forever.
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

            <div className="divider-3d mb-8" />

            {/* Links */}
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-2 justify-center mb-6">
              <Link to="/tools" className="text-gray-500 hover:text-indigo-400 text-xs font-semibold transition-colors">Tools</Link>
              <Link to="/blog" className="text-gray-500 hover:text-indigo-400 text-xs font-semibold transition-colors">Blog</Link>
              <Link to="/premium" className="text-gray-500 hover:text-indigo-400 text-xs font-semibold transition-colors">Premium</Link>
              <Link to="/privacy" className="text-gray-500 hover:text-indigo-400 text-xs font-semibold transition-colors">Privacy Policy</Link>
              <span className="hidden md:contents">
                {Object.entries(CITY_DATA).map(([slug, c]) => (
                  <Link key={slug} to={`/iss/${slug}`} className="text-gray-700 hover:text-gray-400 text-xs transition-colors">
                    ISS {c.name}
                  </Link>
                ))}
              </span>
            </nav>

            {/* Donate */}
            <div className="flex justify-center mb-8">
              <form action="https://www.paypal.com/donate" method="post" target="_blank">
                <input type="hidden" name="business" value="Yakov104@gmail.com" />
                <input type="hidden" name="currency_code" value="USD" />
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #003087, #009cde)',
                    color: '#fff',
                    border: '1px solid rgba(0,156,222,0.4)',
                    boxShadow: '0 0 20px rgba(0,156,222,0.3)',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.067 8.478c.492.315.844.825.983 1.39C21.6 12.258 20.38 14 18.04 14H16.5l-.5 3H13l2-11h4.067c.844 0 1.508.478 1.508 1.478h-.508zM7.5 6h5.567c2.34 0 3.56 1.742 3.01 4.132-.14.565-.49 1.075-.983 1.39C14.602 12.522 13.938 13 13.094 13H10.5L9.5 17H7L9 6H7.5zM10.5 11h2.594c.468 0 .844-.34.938-.8.094-.46-.188-.8-.656-.8H10.5l-.438 1.6z"/>
                  </svg>
                  Support SpaceHub via PayPal
                </button>
              </form>
            </div>

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
      <AuthProvider>
      <BrowserRouter>
        <PageviewTracker />
        <ISSProvider>
        <Suspense fallback={<RouteFallback />}>
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
          <Route path="/tools" element={<ToolsIndexPage />} />
          <Route path="/tools/:slug" element={<ToolPage />} />
          <Route path="/iss/:city" element={<CityPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
        </ISSProvider>
      </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  )
}
