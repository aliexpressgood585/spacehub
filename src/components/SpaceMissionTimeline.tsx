import { useState } from 'react'

interface Mission {
  id: string
  name: string
  agency: string
  icon: string
  color: string
  launched: string
  launchYear: number
  destination: string
  status: 'active' | 'completed' | 'upcoming' | 'lost'
  type: 'orbiter' | 'lander' | 'rover' | 'flyby' | 'telescope' | 'crewed' | 'sample-return'
  achievement: string
  currentStatus: string
  distanceKm?: number
  funFact: string
}

const MISSIONS: Mission[] = [
  {
    id: 'voyager1',
    name: 'Voyager 1',
    agency: 'NASA',
    icon: '🛸',
    color: '#22c55e',
    launched: 'Sep 5, 1977',
    launchYear: 1977,
    destination: 'Interstellar Space',
    status: 'active',
    type: 'flyby',
    achievement: 'Farthest human-made object — entered interstellar space in 2012',
    currentStatus: 'Still transmitting from ~23.5 billion km away. Signal takes 22+ hours to arrive.',
    distanceKm: 23500000000,
    funFact: 'Voyager 1\'s power source (RTG) loses ~4 watts/year. NASA expects communications until ~2025. It carries a Golden Record with Earth greetings in 55 languages.'
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope',
    agency: 'NASA/ESA/CSA',
    icon: '🌟',
    color: '#f97316',
    launched: 'Dec 25, 2021',
    launchYear: 2021,
    destination: 'L2 Lagrange Point',
    status: 'active',
    type: 'telescope',
    achievement: 'Imaged galaxies from 300 million years after Big Bang — most distant ever seen',
    currentStatus: 'Operating at L2, 1.5M km from Earth. Fuel for 20+ years of operations.',
    distanceKm: 1500000,
    funFact: 'JWST had 344 single points of failure — all worked. It launched so precisely that it used almost no fuel reaching L2, extending mission life from 10 to 20+ years.'
  },
  {
    id: 'perseverance',
    name: 'Mars Perseverance Rover',
    agency: 'NASA',
    icon: '🚗',
    color: '#ef4444',
    launched: 'Jul 30, 2020',
    launchYear: 2020,
    destination: 'Jezero Crater, Mars',
    status: 'active',
    type: 'rover',
    achievement: 'First powered flight on another planet (Ingenuity helicopter). Collected first samples for return.',
    currentStatus: 'Driving through Jezero Crater. Ingenuity flew 72 times before losing communication Jan 2024.',
    funFact: 'Perseverance produced oxygen on Mars using the MOXIE experiment — first time oxygen was made from CO₂ on another planet. A proof-of-concept for future human missions.'
  },
  {
    id: 'artemis',
    name: 'Artemis Program',
    agency: 'NASA',
    icon: '🌕',
    color: '#a855f7',
    launched: 'Nov 16, 2022 (Artemis I)',
    launchYear: 2022,
    destination: 'Moon',
    status: 'active',
    type: 'crewed',
    achievement: 'Artemis I: uncrewed Orion flew around Moon and returned (2022)',
    currentStatus: 'Artemis II (crewed lunar flyby) planned 2026. Artemis III (Moon landing) planned 2027.',
    funFact: 'Artemis will land the first woman and first person of color on the Moon. SpaceX\'s Starship serves as the lunar lander — requiring orbital refueling, never done before at this scale.'
  },
  {
    id: 'new_horizons',
    name: 'New Horizons',
    agency: 'NASA',
    icon: '🥏',
    color: '#6366f1',
    launched: 'Jan 19, 2006',
    launchYear: 2006,
    destination: 'Pluto & Kuiper Belt',
    status: 'active',
    type: 'flyby',
    achievement: 'First close-up images of Pluto (2015). Then flew by Arrokoth — the most distant object ever visited.',
    currentStatus: 'In the Kuiper Belt, ~55 AU from Sun. Looking for more KBOs to fly by.',
    distanceKm: 8200000000,
    funFact: 'New Horizons passed Pluto at 14 km/s — so fast it couldn\'t slow down or orbit. The data from the flyby took 15 months to fully download back to Earth.'
  },
  {
    id: 'hayabusa2',
    name: 'Hayabusa2',
    agency: 'JAXA',
    icon: '🪨',
    color: '#06b6d4',
    launched: 'Dec 3, 2014',
    launchYear: 2014,
    destination: 'Asteroid Ryugu',
    status: 'completed',
    type: 'sample-return',
    achievement: 'Returned 5.4g of asteroid samples from Ryugu — the first confirmed sample from a C-type asteroid',
    currentStatus: 'Samples returned to Earth in Dec 2020. Now en route to next asteroid (1998 KY26) — arriving 2031.',
    funFact: 'Hayabusa2 fired a copper impactor into Ryugu to create an artificial crater, then collected the subsurface material — a world first. The samples contained amino acid precursors.'
  },
  {
    id: 'cassini',
    name: 'Cassini-Huygens',
    agency: 'NASA/ESA/ASI',
    icon: '🪐',
    color: '#fbbf24',
    launched: 'Oct 15, 1997',
    launchYear: 1997,
    destination: 'Saturn System',
    status: 'completed',
    type: 'orbiter',
    achievement: 'Revealed Enceladus has a liquid ocean and plumes — a candidate for life. Huygens landed on Titan.',
    currentStatus: 'Deliberately crashed into Saturn Sep 15, 2017 to avoid contaminating Enceladus.',
    funFact: 'Cassini detected organic molecules in Enceladus\'s water plumes — the ingredients for life. Its final act was a 22-orbit "Grand Finale" dipping between Saturn and its rings.'
  },
  {
    id: 'osiris_rex',
    name: 'OSIRIS-REx / OSIRIS-APEX',
    agency: 'NASA',
    icon: '☄️',
    color: '#22c55e',
    launched: 'Sep 8, 2016',
    launchYear: 2016,
    destination: 'Asteroid Bennu → Apophis',
    status: 'active',
    type: 'sample-return',
    achievement: 'Returned 121g of Bennu samples to Earth in 2023 — largest asteroid sample return ever by NASA',
    currentStatus: 'Renamed OSIRIS-APEX, now en route to asteroid Apophis — arriving April 13, 2029.',
    funFact: 'Opening the sample container from Bennu revealed pristine material from 4.5 billion years ago — including water-bearing minerals and organic compounds. The container had to be opened in a nitrogen atmosphere.'
  },
  {
    id: 'europa_clipper',
    name: 'Europa Clipper',
    agency: 'NASA',
    icon: '🧊',
    color: '#06b6d4',
    launched: 'Oct 14, 2024',
    launchYear: 2024,
    destination: 'Europa (Jupiter Moon)',
    status: 'active',
    type: 'orbiter',
    achievement: 'Largest planetary spacecraft NASA has ever built. Arriving at Jupiter system 2030.',
    currentStatus: 'En route to Jupiter. 49 close Europa flybys planned — investigating habitability of subsurface ocean.',
    funFact: 'Europa Clipper carries a poem by Ada Limón and 2.6 million names. Its science goal: determine if Europa\'s hidden ocean could support life. Evidence suggests the ocean has had water for billions of years.'
  },
  {
    id: 'dragonfly',
    name: 'Dragonfly',
    agency: 'NASA',
    icon: '🚁',
    color: '#f97316',
    launched: 'Expected 2028',
    launchYear: 2028,
    destination: 'Titan (Saturn Moon)',
    status: 'upcoming',
    type: 'rover',
    achievement: 'First rotorcraft on another world — exploring Titan\'s prebiotic chemistry',
    currentStatus: 'In development. Will arrive Titan ~2034. Plans to fly 175 km across Titan\'s surface.',
    funFact: 'Titan\'s thick atmosphere (1.5× Earth pressure) and low gravity (0.14g) make flight easy — Dragonfly can fly between sites 8 km apart in one hop, vs Perseverance\'s 50m/day average drive.'
  },
  {
    id: 'lunar_gateway',
    name: 'Lunar Gateway',
    agency: 'NASA/ESA/JAXA/CSA',
    icon: '🏗️',
    color: '#94a3b8',
    launched: 'First module ~2026',
    launchYear: 2026,
    destination: 'Lunar Orbit',
    status: 'upcoming',
    type: 'crewed',
    achievement: 'First permanent human outpost beyond Earth orbit',
    currentStatus: 'In development. Will be a staging point for Moon surface missions and eventually Mars.',
    funFact: 'The Lunar Gateway will orbit the Moon in a highly elliptical "near-rectilinear halo orbit" — 3,000 km at closest to 70,000 km at farthest from the Moon\'s surface.'
  },
]

const STATUS_CONFIG = {
  active: { label: '● ACTIVE', color: '#22c55e', bg: 'bg-green-900/40' },
  completed: { label: '✓ COMPLETED', color: '#94a3b8', bg: 'bg-gray-800/60' },
  upcoming: { label: '⏳ UPCOMING', color: '#a855f7', bg: 'bg-purple-900/40' },
  lost: { label: '✗ LOST', color: '#ef4444', bg: 'bg-red-900/40' },
}

const TYPE_ICONS: Record<Mission['type'], string> = {
  orbiter: '🛰️',
  lander: '🛬',
  rover: '🚗',
  flyby: '✈️',
  telescope: '🔭',
  crewed: '👨‍🚀',
  'sample-return': '📦',
}

export default function SpaceMissionTimeline() {
  const [selected, setSelected] = useState<Mission>(MISSIONS[0])
  const [statusFilter, setStatusFilter] = useState<Mission['status'] | 'all'>('all')

  const filtered = statusFilter === 'all' ? MISSIONS : MISSIONS.filter(m => m.status === statusFilter)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Mission Tracker</h2>
      <p className="text-gray-400 text-sm mb-5">Every major mission — past, present, future. What humanity has sent to the cosmos.</p>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(['all', 'active', 'upcoming', 'completed'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: statusFilter === s
                ? (s === 'all' ? 'rgba(255,255,255,0.15)' : STATUS_CONFIG[s]?.color + '25' || 'rgba(255,255,255,0.15)')
                : 'rgba(255,255,255,0.04)',
              color: statusFilter === s
                ? (s === 'all' ? 'white' : STATUS_CONFIG[s]?.color || 'white')
                : '#6b7280',
              border: `1px solid ${statusFilter === s ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {s === 'all' ? 'All Missions' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Mission list */}
        <div className="space-y-1.5 lg:overflow-y-auto lg:max-h-[600px] pr-1">
          {filtered.sort((a, b) => b.launchYear - a.launchYear).map(m => {
            const sc = STATUS_CONFIG[m.status]
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: selected.id === m.id ? m.color + '18' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${selected.id === m.id ? m.color + '50' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: selected.id === m.id ? m.color : '#e2e8f0' }}>{m.name}</div>
                    <div className="text-[10px] text-gray-600">{m.agency} • {m.destination}</div>
                  </div>
                  <span className="text-[9px] font-bold shrink-0" style={{ color: sc.color }}>{sc.label}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-4 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="text-sm text-gray-400">{selected.agency}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ color: STATUS_CONFIG[selected.status].color, background: STATUS_CONFIG[selected.status].color + '20' }}>
                    {STATUS_CONFIG[selected.status].label}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-800 text-gray-400">
                    {TYPE_ICONS[selected.type]} {selected.type.replace('-', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">📅 Launched:</span> <span className="text-gray-300"> {selected.launched}</span></div>
              <div><span className="text-gray-500">🎯 Target:</span> <span className="text-gray-300"> {selected.destination}</span></div>
              {selected.distanceKm && (
                <div className="col-span-2">
                  <span className="text-gray-500">📏 Current distance:</span>
                  <span className="text-gray-300"> {(selected.distanceKm / 1e9).toFixed(1)} billion km</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🏆 Key Achievement</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.achievement}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">📡 Current Status</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.currentStatus}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🚀 Fun Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
