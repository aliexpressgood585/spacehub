import { useState, useEffect } from 'react'
import './App.css'
import Header from './components/Header'
import Hero from './components/Hero'
import SatelliteTracker from './components/SatelliteTracker'
import SpaceWeather from './components/SpaceWeather'
import EventsCalendar from './components/EventsCalendar'
import NewsFeed from './components/NewsFeed'

function App() {
  const [activeTab, setActiveTab] = useState<'tracker' | 'weather' | 'events' | 'news'>('tracker')
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  }, [isDark])

  return (
    <div className="min-h-screen bg-gradient-to-b from-space-900 via-space-800 to-space-900">
      <Header onThemeToggle={() => setIsDark(!isDark)} />
      <Hero />

      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8 border-b border-space-700 flex-wrap">
          {['tracker', 'weather', 'events', 'news'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-3 font-medium transition ${
                activeTab === tab
                  ? 'text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'tracker' && '🛰️ מעקב לוויינים'}
              {tab === 'weather' && '⛈️ מזג אוויר חלל'}
              {tab === 'events' && '🌠 אירועים'}
              {tab === 'news' && '📰 חדשות'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'tracker' && <SatelliteTracker />}
          {activeTab === 'weather' && <SpaceWeather />}
          {activeTab === 'events' && <EventsCalendar />}
          {activeTab === 'news' && <NewsFeed />}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-space-700 mt-16 py-8 text-center text-gray-500">
        <p>SpaceHub © 2026 | מידע חלל בזמן אמת</p>
      </footer>
    </div>
  )
}

export default App
