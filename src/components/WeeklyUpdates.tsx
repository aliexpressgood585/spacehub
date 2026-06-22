import { useState, useEffect } from 'react'

const SITE_UPDATES = [
  { icon: '🔭', title: 'AR Sky View', desc: 'Point your camera at the sky to track satellites in real-time using your device orientation.' },
  { icon: '🌌', title: 'Galaxy Explorer', desc: 'Compare 6 galaxies from the Milky Way to IC 1101 (6 million light-years across) with blanet mode.' },
  { icon: '🪐', title: 'Planet Explorer', desc: 'Deep-dive into any solar system body: climate, geology, habitability scores & travel times.' },
  { icon: '🔬', title: 'Exoplanet Explorer', desc: 'Browse 30+ potentially habitable exoplanets from NASA\'s live archive with habitability scoring.' },
  { icon: '🛸', title: 'Space Missions Hub', desc: '10 active & historic missions — JWST, Artemis, Perseverance, Starship — with full details.' },
  { icon: '🔔', title: 'ISS Pass Alerts', desc: 'Browser push notifications when the ISS is 15 minutes from passing over your location.' },
  { icon: '🌌', title: 'Galaxy Background', desc: 'Toggle a living nebula overlay behind the star field for an immersive experience.' },
]

type Launch = {
  name: string
  net: string
  status: { name: string; abbrev: string }
  rocket?: { configuration?: { name: string } }
  launch_service_provider?: { name: string }
}

function getWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() - day)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'TBD'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days === 0 && hours === 0) return 'Launching soon!'
  if (days === 0) return `${hours}h`
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function statusColor(abbrev: string) {
  if (abbrev === 'Go') return { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' }
  if (abbrev === 'TBD') return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' }
  if (abbrev === 'TBC') return { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' }
  return { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' }
}

export default function WeeklyUpdates() {
  const [activeTab, setActiveTab] = useState<'new' | 'launches'>('new')
  const [launches, setLaunches] = useState<Launch[]>([])
  const [loading, setLoading] = useState(true)
  const week = getWeekRange()

  useEffect(() => {
    fetch('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6&mode=list')
      .then(r => r.json())
      .then(d => { setLaunches(d.results ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🗓️</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">SpaceHub Weekly</h3>
          <p className="text-gray-500 text-xs">{week.label} · Latest updates & upcoming launches</p>
        </div>
        <div className="live-badge">
          <span className="live-dot" />
          <span>LIVE</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {([['new', '✨ What\'s New'], ['launches', '🚀 Upcoming Launches']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="text-xs px-4 py-1.5 rounded-full font-semibold transition-all"
            style={activeTab === id
              ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc' }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* What's New */}
      {activeTab === 'new' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1" style={{ background: 'rgba(99,102,241,0.15)' }} />
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">June 2026 · SpaceHub v3</span>
            <div className="h-px flex-1" style={{ background: 'rgba(99,102,241,0.15)' }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SITE_UPDATES.map((u, i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-xl transition-all"
                style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)' }}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">{u.icon}</span>
                <div>
                  <p className="text-white text-xs font-bold mb-0.5">{u.title}</p>
                  <p className="text-gray-500 text-[10px] leading-relaxed">{u.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-gray-600 text-[10px]">More features coming every week · <span className="text-indigo-500">All free, no account needed</span></p>
          </div>
        </div>
      )}

      {/* Upcoming Launches */}
      {activeTab === 'launches' && (
        <div className="space-y-2">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
            ))
          ) : launches.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">No launch data available</div>
          ) : (
            launches.map((l, i) => {
              const st = statusColor(l.status.abbrev)
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <span className="text-2xl flex-shrink-0">🚀</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold truncate">{l.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: st.bg, color: st.color }}>
                        {l.status.abbrev}
                      </span>
                      {l.launch_service_provider?.name && (
                        <span className="text-[9px] text-gray-600 truncate">{l.launch_service_provider.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-indigo-400 text-xs font-bold">{timeUntil(l.net)}</p>
                    <p className="text-gray-700 text-[9px]">
                      {new Date(l.net).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
