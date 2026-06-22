import { useState } from 'react'

const MISSIONS = [
  {
    id: 'jwst', name: 'James Webb Space Telescope', agency: 'NASA/ESA/CSA', emoji: '🔭',
    status: 'active', target: 'Deep Universe', launched: '2021-12-25',
    color: '#fbbf24',
    summary: 'The most powerful space telescope ever built. Observes in infrared, seeing the first galaxies formed 400 million years after the Big Bang.',
    achievements: ['First images released July 2022', 'Detected CO₂ on exoplanet WASP-39b', 'Deepest infrared image of universe', 'Found water vapor on exoplanets'],
    link: 'https://www.nasa.gov/webb',
  },
  {
    id: 'artemis', name: 'Artemis Program', agency: 'NASA', emoji: '🌕',
    status: 'active', target: 'Moon', launched: '2022 (Artemis I)',
    color: '#f87171',
    summary: 'NASA\'s flagship lunar return program. Artemis I flew uncrewed (2022), Artemis II will send 4 astronauts around the Moon (2025), Artemis III will land on the lunar South Pole (2026).',
    achievements: ['Artemis I: 26-day Orion mission success', 'SLS rocket validated', 'South Pole landing site selected', 'Commercial landers contracted (SpaceX Starship, Blue Origin)'],
    link: 'https://www.nasa.gov/artemis',
  },
  {
    id: 'juno', name: 'Juno', agency: 'NASA', emoji: '🟠',
    status: 'active', target: 'Jupiter', launched: '2011-08-05',
    color: '#f97316',
    summary: 'Orbiting Jupiter since 2016. Studies Jupiter\'s composition, gravity, magnetic field and polar magnetosphere. Extended mission now explores Jupiter\'s moons.',
    achievements: ['First images of Jupiter\'s poles', 'Discovered cyclone clusters at poles', 'Measured deepest ammonia plumes', 'Flyby of Ganymede, Europa, Io'],
    link: 'https://www.nasa.gov/juno',
  },
  {
    id: 'perseverance', name: 'Perseverance Rover', agency: 'NASA', emoji: '🔴',
    status: 'active', target: 'Mars', launched: '2020-07-30',
    color: '#ef4444',
    summary: 'Mars rover searching for signs of ancient microbial life. Carries Ingenuity helicopter — first powered flight on another planet.',
    achievements: ['First Mars helicopter flights (Ingenuity)', 'Produced oxygen on Mars (MOXIE)', 'Collected 23 rock core samples for return', 'Detected organic molecules in Jezero Crater'],
    link: 'https://mars.nasa.gov/mars2020',
  },
  {
    id: 'voyager', name: 'Voyager 1 & 2', agency: 'NASA', emoji: '🌌',
    status: 'active', target: 'Interstellar Space', launched: '1977',
    color: '#818cf8',
    summary: 'Launched in 1977, now the farthest human-made objects. Voyager 1 is 23+ billion km from Earth. Both have entered interstellar space beyond the heliosphere.',
    achievements: ['Discovered active volcanoes on Io', 'First detailed images of Jupiter/Saturn', 'Entered interstellar space (V1: 2012, V2: 2018)', 'Still transmitting data after 47 years'],
    link: 'https://voyager.jpl.nasa.gov',
  },
  {
    id: 'newhorizons', name: 'New Horizons', agency: 'NASA', emoji: '⚡',
    status: 'active', target: 'Kuiper Belt', launched: '2006-01-19',
    color: '#34d399',
    summary: 'Flew past Pluto in 2015, revealing it as a complex world with mountains and ice plains. Now exploring the outer Kuiper Belt, billions of km from Earth.',
    achievements: ['First close-up images of Pluto', "Discovered Pluto's heart (Tombaugh Regio)", 'Flyby of Arrokoth — most distant object explored', 'Measured Pluto atmosphere & moons'],
    link: 'https://www.nasa.gov/new-horizons',
  },
  {
    id: 'parker', name: 'Parker Solar Probe', agency: 'NASA', emoji: '☀️',
    status: 'active', target: 'Sun', launched: '2018-08-12',
    color: '#fb923c',
    summary: 'The fastest human-made object ever — up to 692,000 km/h. Flying closer to the Sun than any spacecraft before, diving into the solar corona.',
    achievements: ['Fastest human-made object (692,000 km/h)', 'First spacecraft to enter solar corona', 'Observed "switchbacks" in solar wind', 'Reached 6.1 million km from Sun surface'],
    link: 'https://www.nasa.gov/parker-solar-probe',
  },
  {
    id: 'css', name: 'Chinese Space Station (CSS)', agency: 'CNSA', emoji: '🇨🇳',
    status: 'active', target: 'Earth Orbit', launched: '2021-04-29',
    color: '#f87171',
    summary: 'China\'s permanent modular space station in low Earth orbit, completed in 2022. Plans up to 6 astronauts and regular science missions through 2030s.',
    achievements: ['Core module Tianhe launched 2021', 'Fully assembled by 2022', 'Multiple crew rotations completed', 'Permanent crewed presence established'],
    link: 'https://www.cnsa.gov.cn',
  },
  {
    id: 'osiris', name: 'OSIRIS-REx', agency: 'NASA', emoji: '☄️',
    status: 'completed', target: 'Asteroid Bennu', launched: '2016-09-08',
    color: '#a78bfa',
    summary: 'Returned the largest asteroid sample to Earth (250g from Bennu, 2023). The sample may reveal how Earth got its water and building blocks of life. Spacecraft continues as OSIRIS-APEX to asteroid Apophis.',
    achievements: ['250g sample returned from Bennu (2023)', 'Most material ever from beyond Moon', 'Mapped Bennu surface completely', 'Now heading to Apophis (2029 flyby)'],
    link: 'https://www.nasa.gov/osiris-rex',
  },
  {
    id: 'starship', name: 'SpaceX Starship', agency: 'SpaceX', emoji: '🚀',
    status: 'testing', target: 'Moon & Mars', launched: '2023 (tests)',
    color: '#60a5fa',
    summary: 'Fully reusable 2-stage rocket — the largest & most powerful ever flown. Selected by NASA for Artemis lunar lander. SpaceX goal: Mars by ~2030.',
    achievements: ['Integrated Flight Test 4 success (2024)', 'Super Heavy booster caught by mechazilla arms', 'Both stages recovered in test 5', 'Selected as NASA Artemis Moon lander'],
    link: 'https://www.spacex.com/vehicles/starship',
  },
]

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'ACTIVE',     color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  completed: { label: 'COMPLETED',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  testing:   { label: 'TESTING',    color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
}

export default function SpaceMissions() {
  const [selId, setSelId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all'|'active'|'completed'|'testing'>('all')

  const filtered = MISSIONS.filter(m => filter === 'all' || m.status === filter)
  const sel = selId ? MISSIONS.find(m => m.id === selId) : null

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🛸</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Space Missions</h3>
          <p className="text-gray-500 text-xs">Active & historic missions across the solar system</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all','active','completed','testing'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="text-[10px] px-3 py-1 rounded-lg font-semibold transition-all capitalize"
            style={filter === f
              ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc' }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
          >
            {f === 'all' ? `🌍 All (${MISSIONS.length})` : f === 'active' ? `✅ Active` : f === 'completed' ? '🏁 Completed' : '⚡ Testing'}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Mission list */}
        <div className="flex-shrink-0 w-full md:w-52 space-y-1.5 max-h-96 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {filtered.map(m => {
            const st = STATUS_STYLE[m.status]
            return (
              <button
                key={m.id}
                onClick={() => setSelId(selId === m.id ? null : m.id)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all"
                style={selId === m.id
                  ? { background: `${m.color}15`, border: `1px solid ${m.color}40` }
                  : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-lg flex-shrink-0">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{m.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    <span className="text-[8px] text-gray-600 truncate">{m.target}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Mission detail */}
        <div className="flex-1">
          {sel ? (
            <div className="space-y-3">
              <div className="rounded-2xl p-4" style={{ background: `${sel.color}08`, border: `1px solid ${sel.color}30` }}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl">{sel.emoji}</span>
                  <div>
                    <h4 className="text-white font-black text-base leading-tight">{sel.name}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: STATUS_STYLE[sel.status].bg, color: STATUS_STYLE[sel.status].color }}>
                        {STATUS_STYLE[sel.status].label}
                      </span>
                      <span className="text-[10px] text-gray-500">{sel.agency}</span>
                      <span className="text-[10px] text-gray-600">Launched: {sel.launched}</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed">{sel.summary}</p>
              </div>

              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">🏆 Key Achievements</p>
                {sel.achievements.map(a => (
                  <div key={a} className="flex items-start gap-2 py-1">
                    <span style={{ color: sel.color }} className="mt-0.5 flex-shrink-0 text-xs">◆</span>
                    <p className="text-gray-400 text-xs leading-relaxed">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p className="text-4xl mb-3">🛸</p>
                <p className="text-gray-500 text-sm">Select a mission to see details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
