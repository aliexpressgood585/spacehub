import { useState, useEffect, useRef } from 'react'
import './App.css'
import Header from './components/Header'
import Hero from './components/Hero'
import SatelliteTracker from './components/SatelliteTracker'
import SpaceWeather from './components/SpaceWeather'
import EventsCalendar from './components/EventsCalendar'
import NewsFeed from './components/NewsFeed'
import SpaceBackground from './components/SpaceBackground'
import SolarSystem3D from './components/SolarSystem3D'
import NasaAPOD from './components/NasaAPOD'
import ISSTracker from './components/ISSTracker'
import SpaceNewsFeed from './components/SpaceNewsFeed'
import ISSAlertSystem from './components/ISSAlertSystem'
import EmailCapture from './components/EmailCapture'
import AdBanner from './components/AdBanner'
import PremiumModal from './components/PremiumModal'

type Tab = 'tracker' | 'iss' | 'solar' | 'weather' | 'events' | 'news'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('iss')
  const [isDark, setIsDark] = useState(true)
  const [lang, setLang] = useState<'he' | 'en'>('he')
  const [premiumOpen, setPremiumOpen] = useState(false)
  const issRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  }, [isDark, lang])

  const scrollToISS = () => {
    setActiveTab('iss')
    setTimeout(() => issRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const he = lang === 'he'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'iss',     label: he ? '🛸 ISS Live'        : '🛸 ISS Live' },
    { id: 'tracker', label: he ? '🛰️ לוויינים'        : '🛰️ Satellites' },
    { id: 'solar',   label: he ? '🪐 מערכת השמש'      : '🪐 Solar System' },
    { id: 'weather', label: he ? '⛈️ מזג אוויר חלל'   : '⛈️ Space Weather' },
    { id: 'events',  label: he ? '🌠 אירועים'          : '🌠 Events' },
    { id: 'news',    label: he ? '📰 חדשות'            : '📰 News' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-space-900 via-space-800 to-space-900 relative">
      <SpaceBackground />
      <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} lang={lang} />

      <div className="relative" style={{ zIndex: 1 }}>
        <Header
          onThemeToggle={() => setIsDark(!isDark)}
          lang={lang}
          onLangToggle={() => setLang(l => l === 'he' ? 'en' : 'he')}
          onPremium={() => setPremiumOpen(true)}
        />

        <Hero lang={lang} onPremium={() => setPremiumOpen(true)} onScrollToISS={scrollToISS} />

        {/* Top Ad Banner */}
        <div className="max-w-7xl mx-auto px-4 mb-6">
          <AdBanner slot="leaderboard" />
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-12">
          {/* Navigation Tabs */}
          <div className="flex gap-1 mb-8 border-b border-space-700 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium transition text-sm whitespace-nowrap flex-shrink-0 ${
                  activeTab === tab.id
                    ? 'text-indigo-400 border-b-2 border-indigo-500'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === 'iss' && (
              <div ref={issRef} className="space-y-6">
                <ISSAlertSystem />
                <ISSTracker />
                <NasaAPOD />
                <AdBanner slot="rectangle" />
              </div>
            )}
            {activeTab === 'tracker' && <SatelliteTracker />}
            {activeTab === 'solar' && (
              <div className="neon-border glass rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4">
                  🪐 {he ? 'מערכת השמש — תלת מימד' : 'Solar System — 3D'}
                </h3>
                <SolarSystem3D />
              </div>
            )}
            {activeTab === 'weather' && <SpaceWeather />}
            {activeTab === 'events' && <EventsCalendar />}
            {activeTab === 'news' && (
              <div className="space-y-6">
                <SpaceNewsFeed />
                <AdBanner slot="rectangle" />
                <NewsFeed />
              </div>
            )}
          </div>

          {/* Email capture — shown on all tabs */}
          <div className="mt-12">
            <EmailCapture />
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-space-700 mt-8 py-8 text-center">
          <div className="flex flex-wrap gap-4 justify-center text-gray-600 text-xs mb-4">
            <a href="#" className="hover:text-gray-400 transition">תנאי שימוש</a>
            <a href="#" className="hover:text-gray-400 transition">פרטיות</a>
            <a href="#" className="hover:text-gray-400 transition">צור קשר</a>
            <button onClick={() => setPremiumOpen(true)} className="text-yellow-700 hover:text-yellow-500 transition">⭐ פרמיום</button>
          </div>
          <p className="text-gray-700 text-xs">SpaceHub © 2026 | {he ? 'מידע חלל בזמן אמת' : 'Real-time Space Data'}</p>
          <p className="text-gray-800 text-xs mt-1">Data: NASA • Spaceflight News API • wheretheiss.at</p>
        </footer>
      </div>
    </div>
  )
}
