import { useState, useMemo } from 'react'

interface Destination {
  id: string
  name: string
  icon: string
  color: string
  distanceKm: number
  category: 'earth' | 'solar' | 'stellar' | 'galactic' | 'cosmic'
  funFact: string
  context: string
}

const DESTINATIONS: Destination[] = [
  {
    id: 'moon',
    name: 'The Moon',
    icon: '🌕',
    color: '#94a3b8',
    distanceKm: 384400,
    category: 'earth',
    funFact: 'When you see the Moon, you\'re seeing it as it was 1.28 seconds ago.',
    context: 'This delay is why Apollo astronauts had a ~2.5 second lag when talking to Earth.'
  },
  {
    id: 'sun',
    name: 'The Sun',
    icon: '☀️',
    color: '#fbbf24',
    distanceKm: 149600000,
    category: 'solar',
    funFact: 'If the Sun went dark right now, we wouldn\'t know for 8 minutes 20 seconds.',
    context: 'Earth is 1 AU from the Sun. Light at 300,000 km/s takes 499 seconds to cross this distance.'
  },
  {
    id: 'mars',
    name: 'Mars',
    icon: '🔴',
    color: '#ef4444',
    distanceKm: 225000000,
    category: 'solar',
    funFact: 'Sending a command to a Mars rover takes 3-22 minutes — rovers must be autonomous.',
    context: 'Distance varies from 54M km (closest) to 401M km (farthest). Average ~225M km.'
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    icon: '🪐',
    color: '#f97316',
    distanceKm: 778500000,
    category: 'solar',
    funFact: 'The Juno spacecraft orbiting Jupiter receives commands with a 43-minute delay.',
    context: 'At closest approach (588M km), light takes 32 minutes. At farthest (968M km), 53 minutes.'
  },
  {
    id: 'pluto',
    name: 'Pluto',
    icon: '🥏',
    color: '#a78bfa',
    distanceKm: 5900000000,
    category: 'solar',
    funFact: 'New Horizons data from Pluto took 4.5 hours to arrive on Earth.',
    context: 'New Horizons reached Pluto in 2015 after 9.5 years of travel.'
  },
  {
    id: 'voyager',
    name: 'Voyager 1 (current)',
    icon: '🛸',
    color: '#22c55e',
    distanceKm: 23500000000,
    category: 'solar',
    funFact: 'A signal from Voyager 1 takes over 21 hours to reach Earth.',
    context: 'Launched in 1977. Now the most distant human-made object at ~157 AU.'
  },
  {
    id: 'proxima',
    name: 'Proxima Centauri',
    icon: '⭐',
    color: '#f97316',
    distanceKm: 40208000000000,
    category: 'stellar',
    funFact: 'The light you see from Proxima Centauri left that star 4.24 years ago.',
    context: 'Nearest star to our Sun. Has at least one planet in the habitable zone — Proxima b.'
  },
  {
    id: 'sirius',
    name: 'Sirius (brightest star)',
    icon: '✨',
    color: '#3b82f6',
    distanceKm: 81370000000000,
    category: 'stellar',
    funFact: 'When ancient Egyptians looked at Sirius, the light was leaving it around the time of their era.',
    context: 'The brightest star in the night sky at 8.6 light-years away.'
  },
  {
    id: 'galactic_center',
    name: 'Galactic Center',
    icon: '🌀',
    color: '#a855f7',
    distanceKm: 246960000000000000,
    category: 'galactic',
    funFact: 'Light from the Milky Way\'s center showing events from 26,000 years ago reaches us now.',
    context: 'Home to Sagittarius A* — a supermassive black hole 4 million times the Sun\'s mass.'
  },
  {
    id: 'andromeda',
    name: 'Andromeda Galaxy',
    icon: '🌌',
    color: '#06b6d4',
    distanceKm: 2.365e19,
    category: 'galactic',
    funFact: 'Andromeda is visible to the naked eye — you\'re seeing light from 2.5 million years ago.',
    context: 'The most distant object visible to the naked eye. On a collision course with the Milky Way.'
  },
  {
    id: 'observable_edge',
    name: 'Edge of Observable Universe',
    icon: '🌐',
    color: '#fbbf24',
    distanceKm: 8.8e23,
    category: 'cosmic',
    funFact: 'The light from the edge of the observable universe has been traveling since 380,000 years after the Big Bang.',
    context: 'We cannot see beyond this — not because there\'s nothing there, but because light hasn\'t had time to reach us.'
  },
]

const CATEGORIES = [
  { id: 'earth' as const, label: 'Earth-Moon', icon: '🌍', color: '#3b82f6' },
  { id: 'solar' as const, label: 'Solar System', icon: '☀️', color: '#fbbf24' },
  { id: 'stellar' as const, label: 'Stellar', icon: '⭐', color: '#f97316' },
  { id: 'galactic' as const, label: 'Galactic', icon: '🌌', color: '#a855f7' },
  { id: 'cosmic' as const, label: 'Cosmic', icon: '🌐', color: '#06b6d4' },
]

function formatLightTime(distanceKm: number): { value: string; unit: string; exact: string } {
  const seconds = distanceKm / 299792.458
  if (seconds < 1) return { value: (seconds * 1000).toFixed(0), unit: 'milliseconds', exact: `${seconds.toFixed(3)}s` }
  if (seconds < 60) return { value: seconds.toFixed(2), unit: 'seconds', exact: '' }
  if (seconds < 3600) return { value: (seconds / 60).toFixed(2), unit: 'minutes', exact: `${seconds.toFixed(0)}s` }
  if (seconds < 86400) return { value: (seconds / 3600).toFixed(2), unit: 'hours', exact: `${(seconds / 60).toFixed(0)} min` }
  if (seconds < 31557600) return { value: (seconds / 86400).toFixed(1), unit: 'days', exact: `${(seconds / 3600).toFixed(1)} hrs` }
  if (seconds < 31557600 * 1000) return { value: (seconds / 31557600).toFixed(2), unit: 'light-years', exact: `${(seconds / 31557600 * 365.25).toFixed(0)} days` }
  return { value: (seconds / 31557600).toExponential(2), unit: 'light-years', exact: '' }
}

function formatDistance(km: number): string {
  if (km < 1e6) return `${km.toLocaleString()} km`
  if (km < 1e9) return `${(km / 1e6).toFixed(1)}M km`
  if (km < 1e12) return `${(km / 1e9).toFixed(1)}B km`
  if (km < 1e15) return `${(km / 1e12).toFixed(2)} trillion km`
  return `${km.toExponential(2)} km`
}

export default function LightTravelTime() {
  const [selected, setSelected] = useState<Destination>(DESTINATIONS[1])
  const [catFilter, setCatFilter] = useState<Destination['category'] | 'all'>('all')

  const filtered = catFilter === 'all' ? DESTINATIONS : DESTINATIONS.filter(d => d.category === catFilter)
  const lightTime = useMemo(() => formatLightTime(selected.distanceKm), [selected])

  const barPct = useMemo(() => {
    const logMin = Math.log10(DESTINATIONS[0].distanceKm)
    const logMax = Math.log10(DESTINATIONS[DESTINATIONS.length - 1].distanceKm)
    return ((Math.log10(selected.distanceKm) - logMin) / (logMax - logMin)) * 100
  }, [selected])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Speed of Light Visualizer</h2>
      <p className="text-gray-400 text-sm mb-5">How long does light take to reach each destination? The answer is always humbling.</p>

      {/* Distance bar */}
      <div className="mb-5 bg-gray-800/60 rounded-xl p-4">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Moon (1.3s)</span>
          <span className="font-bold" style={{ color: selected.color }}>{selected.name}</span>
          <span>Observable Universe (93B ly)</span>
        </div>
        <div className="h-3 bg-gray-900 rounded-full overflow-hidden mb-1">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${barPct}%`, background: `linear-gradient(90deg, #3b82f6, #a855f7, #fbbf24)` }} />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setCatFilter('all')}
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{
            background: catFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: catFilter === 'all' ? 'white' : '#6b7280',
            border: `1px solid ${catFilter === 'all' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >All</button>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCatFilter(c.id)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: catFilter === c.id ? c.color + '25' : 'rgba(255,255,255,0.04)',
              color: catFilter === c.id ? c.color : '#6b7280',
              border: `1px solid ${catFilter === c.id ? c.color + '50' : 'rgba(255,255,255,0.06)'}`,
            }}
          >{c.icon} {c.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Destination list */}
        <div className="space-y-1.5">
          {filtered.map(dest => {
            const lt = formatLightTime(dest.distanceKm)
            return (
              <button
                key={dest.id}
                onClick={() => setSelected(dest)}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: selected.id === dest.id ? dest.color + '18' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${selected.id === dest.id ? dest.color + '50' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{dest.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: selected.id === dest.id ? dest.color : '#e2e8f0' }}>{dest.name}</div>
                    <div className="text-gray-600 text-xs">{lt.value} {lt.unit}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Big number */}
          <div className="rounded-xl p-5 text-center" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="text-5xl mb-2">{selected.icon}</div>
            <h3 className="text-lg font-bold text-white mb-3">{selected.name}</h3>
            <div className="font-black mb-1" style={{ fontSize: '3rem', color: selected.color, lineHeight: 1 }}>
              {lightTime.value}
            </div>
            <div className="text-xl text-gray-300 font-semibold mb-2">{lightTime.unit}</div>
            {lightTime.exact && <div className="text-gray-500 text-sm">({lightTime.exact})</div>}
            <div className="text-gray-500 text-xs mt-3">Distance: {formatDistance(selected.distanceKm)}</div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What This Means</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.funFact}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">Context</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.context}</p>
          </div>

          {/* Comparison */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">In That Time, Light Also Travels...</div>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Around Earth', times: selected.distanceKm / 40075, icon: '🌍' },
                { label: 'Earth → Moon', times: selected.distanceKm / 384400, icon: '🌕' },
                { label: 'Earth → Sun', times: selected.distanceKm / 149600000, icon: '☀️' },
              ].filter(c => c.times >= 0.01).map(c => (
                <div key={c.label} className="flex items-center justify-between">
                  <span className="text-gray-400">{c.icon} {c.label}</span>
                  <span className="font-mono font-bold text-white">
                    {c.times >= 1000 ? c.times.toExponential(1) + '×' : c.times >= 1 ? c.times.toFixed(0) + '×' : (c.times * 100).toFixed(1) + '%'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
