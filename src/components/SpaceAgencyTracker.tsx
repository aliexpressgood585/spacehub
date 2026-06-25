import { useState } from 'react'

interface Agency {
  name: string
  country: string
  flag: string
  founded: number
  budget_B: number
  employees: number
  launches_total: number
  current_missions: string[]
  notable: string[]
  color: string
  status: 'active' | 'limited'
}

const AGENCIES: Agency[] = [
  {
    name: 'NASA', country: 'United States', flag: '🇺🇸',
    founded: 1958, budget_B: 25.4, employees: 17000,
    launches_total: 135,
    current_missions: ['Artemis program', 'Mars 2020 (Perseverance)', 'James Webb Space Telescope', 'Voyager 1 & 2', 'Parker Solar Probe', 'OSIRIS-REx', 'Hubble (joint)'],
    notable: ['Apollo Moon landings', 'Space Shuttle', 'International Space Station', 'Hubble Space Telescope', 'Curiosity & Perseverance rovers'],
    color: '#1d4ed8', status: 'active',
  },
  {
    name: 'ESA', country: 'European Union (22 nations)', flag: '🇪🇺',
    founded: 1975, budget_B: 9.1, employees: 2500,
    launches_total: 300,
    current_missions: ['Ariane 6', 'BepiColombo (Mercury)', 'JUICE (Jupiter)', 'Euclid Space Telescope', 'ExoMars (Rosalind Franklin)', 'Solar Orbiter'],
    notable: ['Rosetta/Philae comet landing', 'Huygens probe (Titan)', 'Mars Express', 'Gaia star catalog', 'Copernicus Earth observation'],
    color: '#2563eb', status: 'active',
  },
  {
    name: 'Roscosmos', country: 'Russia', flag: '🇷🇺',
    founded: 1992, budget_B: 2.8, employees: 170000,
    launches_total: 2900,
    current_missions: ['ISS Russian segment', 'Soyuz missions', 'Progress cargo', 'Luna-25 (2023)', 'Glonass constellation'],
    notable: ['Sputnik 1 (first satellite)', 'Yuri Gagarin (first human in space)', 'Venera Venus probes', 'Mir space station', 'Soyuz rocket (most flown ever)'],
    color: '#dc2626', status: 'active',
  },
  {
    name: 'CNSA', country: 'China', flag: '🇨🇳',
    founded: 1993, budget_B: 12.0, employees: 150000,
    launches_total: 500,
    current_missions: ['CSS Tiangong Station', 'Chang\'e 6 (Moon far side)', 'Tianwen-2 (asteroid)', 'Beidou navigation', 'Fengyun weather sats'],
    notable: ['CSS Tiangong space station', 'Chang\'e Moon missions', 'Yutu-2 (far side rover)', 'Tianwen-1 Mars mission', 'First commercial VTVL rockets'],
    color: '#dc2626', status: 'active',
  },
  {
    name: 'ISRO', country: 'India', flag: '🇮🇳',
    founded: 1969, budget_B: 1.9, employees: 17000,
    launches_total: 90,
    current_missions: ['Chandrayaan-3 (Moon lander)', 'Aditya-L1 (Sun)', 'PSLV/GSLV launches', 'NavIC navigation', 'Gaganyaan (crewed, 2025)'],
    notable: ['Chandrayaan-3 south pole landing', 'Mangalyaan (first Mars orbit by Asia)', 'PSLV reliability record', 'Lowest-cost Mars mission ever ($74M)'],
    color: '#f97316', status: 'active',
  },
  {
    name: 'JAXA', country: 'Japan', flag: '🇯🇵',
    founded: 2003, budget_B: 2.2, employees: 1600,
    launches_total: 90,
    current_missions: ['H3 rocket', 'SLIM moon lander', 'Hayabusa2 (asteroid)', 'MMX (Phobos)', 'ISS Kibō module'],
    notable: ['Hayabusa asteroid sample return', 'Hayabusa2 Ryugu samples', 'SLIM precision moon landing', 'H-IIA launch vehicle'],
    color: '#8b5cf6', status: 'active',
  },
  {
    name: 'SpaceX', country: 'United States (private)', flag: '🚀',
    founded: 2002, budget_B: 9.0, employees: 13000,
    launches_total: 250,
    current_missions: ['Starship development', 'Falcon 9 (weekly launches)', 'Starlink constellation (6000+)', 'Crew Dragon (ISS)', 'Dragon cargo'],
    notable: ['First orbital-class rocket reuse', 'Falcon Heavy (most powerful since Saturn V)', 'Crew Dragon human spaceflight', 'Starlink megaconstellation', 'Starship (largest rocket ever)'],
    color: '#6366f1', status: 'active',
  },
  {
    name: 'Blue Origin', country: 'United States (private)', flag: '🔵',
    founded: 2000, budget_B: 2.5, employees: 11000,
    launches_total: 25,
    current_missions: ['New Shepard tourism', 'New Glenn orbital', 'BE-4 engine production', 'Blue Moon lunar lander', 'Orbital Reef station (with Sierra Space)'],
    notable: ['First vertical VTVL booster landing', 'New Shepard space tourism', 'BE-4 engine for Vulcan Centaur', 'New Glenn orbital rocket'],
    color: '#0284c7', status: 'active',
  },
  {
    name: 'KARI', country: 'South Korea', flag: '🇰🇷',
    founded: 1989, budget_B: 0.7, employees: 3000,
    launches_total: 4,
    current_missions: ['Nuri KSLV-II', 'Danuri lunar orbiter', 'KOMPSAT satellites'],
    notable: ['First fully domestic orbital launch', 'Danuri Moon orbiter 2022', 'KSLV-II Nuri rocket success'],
    color: '#0ea5e9', status: 'active',
  },
  {
    name: 'UAE Space Agency', country: 'UAE', flag: '🇦🇪',
    founded: 2014, budget_B: 0.6, employees: 700,
    launches_total: 3,
    current_missions: ['Emirates Mars Mission (Al-Amal)', 'Emirates Lunar Mission', 'Badr satellites'],
    notable: ['Hope Mars Orbiter (2021) — first Arab interplanetary mission', 'Youngest space agency to reach Mars'],
    color: '#10b981', status: 'active',
  },
]

const COMPARISON_METRICS = [
  { key: 'budget_B', label: 'Annual Budget ($B)', max: 26, unit: '$B', color: '#f59e0b' },
  { key: 'launches_total', label: 'Total Launches', max: 2900, unit: '', color: '#3b82f6' },
  { key: 'founded', label: 'Founded', max: 2024, unit: '', color: '#10b981' },
]

export default function SpaceAgencyTracker() {
  const [selected, setSelected] = useState<Agency | null>(null)
  const [metricIdx, setMetricIdx] = useState(0)
  const [view, setView] = useState<'chart' | 'compare' | 'missions'>('chart')

  const metric = COMPARISON_METRICS[metricIdx]
  const sorted = [...AGENCIES].sort((a, b) => {
    const av = a[metric.key as keyof Agency] as number
    const bv = b[metric.key as keyof Agency] as number
    return metric.key === 'founded' ? av - bv : bv - av
  })

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🌍</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Agency Tracker</h2>
          <p className="text-green-300 text-sm">Every major space agency — budgets, missions, and achievements</p>
        </div>
      </div>

      {/* View selector */}
      <div className="flex gap-2 mb-6">
        {(['chart', 'missions', 'compare'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${view === v ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {v === 'chart' ? '📊 Rankings' : v === 'missions' ? '🛰️ Missions' : '⚖️ Compare'}
          </button>
        ))}
      </div>

      {view === 'chart' && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {COMPARISON_METRICS.map((m, i) => (
              <button
                key={m.key}
                onClick={() => setMetricIdx(i)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${i === metricIdx ? 'text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                style={i === metricIdx ? { backgroundColor: m.color + '40', border: `1px solid ${m.color}` } : {}}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {sorted.map(agency => {
              const val = agency[metric.key as keyof Agency] as number
              const displayVal = metric.key === 'founded' ? val.toString() : metric.key === 'budget_B' ? `$${val}B` : val.toLocaleString()
              const pct = metric.key === 'founded'
                ? ((val - 1958) / (2024 - 1958)) * 100
                : (val / metric.max) * 100
              return (
                <div
                  key={agency.name}
                  onClick={() => setSelected(selected?.name === agency.name ? null : agency)}
                  className="cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{agency.flag}</span>
                      <span className="text-sm font-medium text-white group-hover:text-green-300 transition-colors">{agency.name}</span>
                      <span className="text-xs text-gray-500 hidden sm:block">{agency.country}</span>
                    </div>
                    <span className="text-sm font-mono" style={{ color: metric.color }}>{displayVal}</span>
                  </div>
                  <div className="bg-white/10 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: agency.color }}
                    />
                  </div>

                  {selected?.name === agency.name && (
                    <div className="mt-2 bg-white/5 rounded-lg p-3 border border-white/10 text-sm">
                      <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4">
                        <div><div className="text-xs text-gray-500">Founded</div><div className="text-white">{agency.founded}</div></div>
                        <div><div className="text-xs text-gray-500">Budget</div><div className="text-white">${agency.budget_B}B/yr</div></div>
                        <div><div className="text-xs text-gray-500">Staff</div><div className="text-white">{agency.employees.toLocaleString()}</div></div>
                        <div><div className="text-xs text-gray-500">Launches</div><div className="text-white">{agency.launches_total.toLocaleString()}</div></div>
                      </div>
                      <div className="mb-2">
                        <div className="text-xs text-green-400 mb-1 font-semibold">Notable achievements</div>
                        <ul className="space-y-0.5">
                          {agency.notable.map(n => <li key={n} className="text-xs text-gray-300">• {n}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {view === 'missions' && (
        <div className="space-y-3">
          {AGENCIES.map(agency => (
            <div key={agency.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{agency.flag}</span>
                <span className="font-bold text-white">{agency.name}</span>
                <span className="text-xs text-gray-500">{agency.country}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {agency.current_missions.map(m => (
                  <span key={m} className="text-xs px-2 py-0.5 rounded-full border border-white/20 text-gray-300 bg-white/5">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'compare' && (
        <div>
          <p className="text-sm text-gray-400 mb-4">Side-by-side comparison of all agencies</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 text-gray-400 font-normal">Agency</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-2">Budget</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-2">Staff</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-2">Launches</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-2">Founded</th>
                </tr>
              </thead>
              <tbody>
                {[...AGENCIES].sort((a, b) => b.budget_B - a.budget_B).map(a => (
                  <tr key={a.name} className="border-b border-white/5">
                    <td className="py-1.5">
                      <span className="mr-1">{a.flag}</span>
                      <span className="text-white">{a.name}</span>
                    </td>
                    <td className="text-right px-2 font-mono text-yellow-300">${a.budget_B}B</td>
                    <td className="text-right px-2 font-mono text-blue-300">{a.employees.toLocaleString()}</td>
                    <td className="text-right px-2 font-mono text-green-300">{a.launches_total.toLocaleString()}</td>
                    <td className="text-right px-2 font-mono text-gray-300">{a.founded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Space race timeline */}
          <div className="mt-6">
            <div className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wide">Space Race Timeline</div>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-white/10" />
              {[
                { year: 1957, event: 'Sputnik 1 — First artificial satellite', who: '🇷🇺' },
                { year: 1961, event: 'Yuri Gagarin — First human in space', who: '🇷🇺' },
                { year: 1969, event: 'Apollo 11 — First humans on the Moon', who: '🇺🇸' },
                { year: 1971, event: 'Salyut 1 — First space station', who: '🇷🇺' },
                { year: 1981, event: 'Space Shuttle first flight', who: '🇺🇸' },
                { year: 1998, event: 'ISS construction begins', who: '🌍' },
                { year: 2004, event: 'SpaceShipOne — First private crewed spaceflight', who: '🚀' },
                { year: 2012, event: 'Curiosity lands on Mars', who: '🇺🇸' },
                { year: 2015, event: 'Falcon 9 first stage landing', who: '🚀' },
                { year: 2021, event: 'Ingenuity — First powered flight on Mars', who: '🇺🇸' },
                { year: 2022, event: 'JWST first science images', who: '🇺🇸🇪🇺🇨🇦' },
                { year: 2023, event: 'Chandrayaan-3 lunar south pole landing', who: '🇮🇳' },
                { year: 2024, event: 'Starship IFT-4 success / Chang\'e 6 far-side return', who: '🚀🇨🇳' },
              ].map(({ year, event, who }) => (
                <div key={year} className="flex items-start gap-3 mb-3 ml-8 relative">
                  <div className="absolute -left-5 w-2.5 h-2.5 rounded-full bg-blue-500 border border-blue-300 mt-0.5" />
                  <div className="text-xs text-blue-300 font-mono w-10 flex-shrink-0">{year}</div>
                  <div className="text-xs text-gray-300 flex-1">{event}</div>
                  <div className="text-sm">{who}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Total global space budget */}
      <div className="mt-6 bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="text-xs text-gray-400 mb-1">Total global space economy (2024)</div>
        <div className="text-3xl font-bold text-white">$570 billion</div>
        <div className="text-xs text-gray-500 mt-1">Growing at ~8% per year. Projected to reach $1.8 trillion by 2035.</div>
      </div>
    </div>
  )
}
