import { useState, useEffect } from 'react'
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

type Tab = 'tracker' | 'weather' | 'events' | 'news' | 'solar' | 'live'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tracker')
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  }, [isDark])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tracker', label: '🛰️ לוויינים' },
    { id: 'live', label: '🛸 ISS Live' },
    { id: 'solar', label: '🪐 מערכת השמש' },
    { id: 'weather', label: '⛈️ מזג אוויר חלל' },
    { id: 'events', label: '🌠 אירועים' },
    { id: 'news', label: '📰 חדשות' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-space-900 via-space-800 to-space-900 relative">
      <SpaceBackground />
      <div className="relative" style={{ zIndex: 1 }}>
        <Header onThemeToggle={() => setIsDark(!isDark)} />
        <Hero />

        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Navigation Tabs */}
          <div className="flex gap-1 mb-8 border-b border-space-700 flex-wrap">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium transition text-sm ${
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
            {activeTab === 'tracker' && <SatelliteTracker />}
            {activeTab === 'live' && (
              <div className="space-y-6">
                <ISSTracker />
                <NasaAPOD />
              </div>
            )}
            {activeTab === 'solar' && (
              <div className="space-y-6">
                <div className="neon-border glass rounded-lg p-6">
                  <h3 className="text-xl font-bold text-white mb-4">🪐 מערכת השמש — תלת מימד</h3>
                  <SolarSystem3D />
                </div>
              </div>
            )}
            {activeTab === 'weather' && <SpaceWeather />}
            {activeTab === 'events' && <EventsCalendar />}
            {activeTab === 'news' && (
              <div className="space-y-6">
                <SpaceNewsFeed />
                <NewsFeed />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-space-700 mt-16 py-8 text-center text-gray-500">
          <p>SpaceHub © 2026 | מידע חלל בזמן אמת</p>
        </footer>
      </div>
    </div>
  )
}

export default App
