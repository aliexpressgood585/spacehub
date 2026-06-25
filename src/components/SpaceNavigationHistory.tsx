import { useState } from 'react'

interface NavMilestone {
  year: string
  event: string
  tool: string
  accuracy: string
  description: string
  category: 'ancient' | 'maritime' | 'aviation' | 'space' | 'modern'
}

interface NavSystem {
  name: string
  operator: string
  satellites: number
  accuracy: string
  launched: number
  coverage: string
  frequency: string
  applications: string[]
  color: string
}

interface DeepSpaceNav {
  mission: string
  technique: string
  accuracy: string
  challenge: string
  solution: string
}

const MILESTONES: NavMilestone[] = [
  { year: '~3000 BC', event: 'Polaris (North Star) used for direction', tool: 'Naked eye astronomy', accuracy: 'Few degrees', description: 'Ancient mariners used Polaris to determine north and latitude. Consistent across thousands of years.', category: 'ancient' },
  { year: '~150 BC', event: 'Hipparchus creates star catalog', tool: 'Armillary sphere', accuracy: '~0.5°', description: 'Greek astronomer catalogs 850 stars with positions. Foundation of celestial navigation for 1,500 years.', category: 'ancient' },
  { year: '1731', event: 'Sextant invented', tool: 'Sextant + almanac', accuracy: '~0.5 nautical miles', description: 'John Hadley and Thomas Godfrey independently invent the sextant. Allows measuring angle between stars and horizon at sea.', category: 'maritime' },
  { year: '1759', event: 'Marine chronometer (H4)', tool: 'Harrison\'s H4 clock', accuracy: 'Within miles across Atlantic', description: 'John Harrison solves the longitude problem — accurate timekeeping allows longitude calculation from celestial observation.', category: 'maritime' },
  { year: '1920s', event: 'Radio navigation (LORAN)', tool: 'Radio beacons', accuracy: '~1 km', description: 'Long Range Navigation uses time differences between radio signals from multiple stations to fix position.', category: 'aviation' },
  { year: '1957', event: 'Sputnik doppler tracking', tool: 'Doppler radar', accuracy: 'Orbital elements', description: 'Scientists tracked Sputnik\'s radio signals. Doppler shift revealed its orbital parameters — founding principle of satellite navigation.', category: 'space' },
  { year: '1960', event: 'Transit (NAVSAT) system', tool: 'Doppler satellite', accuracy: '~200 m', description: 'First operational satellite navigation system. Used by US Navy submarines for Polaris missile targeting.', category: 'space' },
  { year: '1973', event: 'GPS development begins', tool: 'Atomic clocks + satellites', accuracy: 'Target: <30m', description: 'US DoD begins GPS program. Uses timing signals from multiple satellites to triangulate position.', category: 'modern' },
  { year: '1983', event: 'GPS opened to civilians (after KAL 007)', tool: 'GPS', accuracy: '~100m (selective)', description: 'After Korean Air 007 shot down due to navigation error, Reagan opens GPS to civilian use.', category: 'modern' },
  { year: '2000', event: 'Selective Availability removed', tool: 'GPS', accuracy: '~15m → 5m', description: 'Clinton removes artificial GPS degradation. Civilian accuracy improved 10× overnight.', category: 'modern' },
  { year: '2011', event: 'GLONASS global coverage', tool: 'GLONASS', accuracy: '~5m', description: 'Russia completes GLONASS constellation — first competition for GPS.', category: 'modern' },
  { year: '2016', event: 'Galileo initial services', tool: 'Galileo (EU)', accuracy: '<1m (authenticated)', description: 'EU\'s precision navigation system. First civilian high-accuracy GNSS with authentication.', category: 'modern' },
]

const NAV_SYSTEMS: NavSystem[] = [
  { name: 'GPS', operator: 'USA (USAF)', satellites: 31, accuracy: '3–5 m', launched: 1978, coverage: 'Global', frequency: 'L1, L2, L5', applications: ['Military', 'Aviation', 'Mapping', 'Smartphones', 'Finance timestamps'], color: '#3b82f6' },
  { name: 'GLONASS', operator: 'Russia (Roscosmos)', satellites: 24, accuracy: '4–7 m', launched: 1982, coverage: 'Global', frequency: 'L1, L2', applications: ['Military', 'Aviation', 'Combined with GPS'], color: '#ef4444' },
  { name: 'Galileo', operator: 'EU (ESA)', satellites: 30, accuracy: '1 m (Public) / cm (auth.)', launched: 2011, coverage: 'Global', frequency: 'E1, E5, E6', applications: ['Civilian (highest accuracy)', 'Emergency services', 'Science'], color: '#fbbf24' },
  { name: 'BeiDou-3', operator: 'China (CNSA)', satellites: 35, accuracy: '1.5–2 m', launched: 2000, coverage: 'Global (since 2020)', frequency: 'B1, B2, B3', applications: ['Military', 'Maritime', 'Land transport', 'Asia-Pacific priority'], color: '#ef4444' },
  { name: 'NavIC', operator: 'India (ISRO)', satellites: 7, accuracy: '5 m', launched: 2006, coverage: 'India + 1500 km region', frequency: 'L5, S-band', applications: ['Regional navigation', 'Disaster management', 'Fishing vessels'], color: '#f97316' },
  { name: 'QZSS', operator: 'Japan (JAXA)', satellites: 7, accuracy: '<1 m (augmented)', launched: 2010, coverage: 'Japan + Asia-Oceania', frequency: 'L1, L2, L5, L6', applications: ['GPS augmentation', 'Precision agriculture', 'Autonomous vehicles'], color: '#8b5cf6' },
]

const DEEP_SPACE: DeepSpaceNav[] = [
  { mission: 'Voyager 1 & 2', technique: 'Doppler ranging + stellar triangulation', accuracy: '±300 km at 23 billion km', challenge: 'Radio signals take 21+ hours one-way', solution: 'DSN (Deep Space Network) — 3 giant dishes on Earth 120° apart' },
  { mission: 'Mars Curiosity/Perseverance', technique: 'Entry Guidance + orbital relay', accuracy: 'Within 7 km landing ellipse', challenge: 'Entry blackout, 7 min of terror', solution: 'Pre-programmed EDL sequence + sky crane' },
  { mission: 'New Horizons (Pluto)', technique: 'Optical navigation + ephemeris', accuracy: '±75 km at 4.8 billion km', challenge: 'Pluto position uncertainty; one pass', solution: 'Course correction burns 10 weeks before flyby' },
  { mission: 'Cassini (Saturn)', technique: 'Radio Doppler + optical landmark', accuracy: '±10 km during Titan flybys', challenge: 'Titan atmosphere obscures landmarks', solution: 'Synthetic aperture radar + terrain-relative navigation' },
  { mission: 'James Webb (L2)', technique: 'Star tracker + thruster trim', accuracy: '~0.001 arcsecond pointing', challenge: 'Sun side must face Sun; cannot rotate freely', solution: 'ADCS with reaction wheels + fine guidance sensor' },
]

const CAT_COLORS: Record<string, string> = {
  ancient: 'bg-yellow-500/20 text-yellow-400',
  maritime: 'bg-blue-500/20 text-blue-400',
  aviation: 'bg-purple-500/20 text-purple-400',
  space: 'bg-green-500/20 text-green-400',
  modern: 'bg-cyan-500/20 text-cyan-400',
}

type TabType = 'history' | 'gnss' | 'deepspace'

export default function SpaceNavigationHistory() {
  const [activeTab, setActiveTab] = useState<TabType>('history')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [selected, setSelected] = useState<NavSystem>(NAV_SYSTEMS[0])

  const categories = ['all', 'ancient', 'maritime', 'aviation', 'space', 'modern']
  const filtered = catFilter === 'all' ? MILESTONES : MILESTONES.filter(m => m.category === catFilter)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🧭</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Navigation</h2>
          <p className="text-gray-400 text-sm">From star-guided sailors to GPS, deep space, and beyond</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['history', 'gnss', 'deepspace'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-teal-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'history' ? 'Navigation History' : t === 'gnss' ? 'Global GNSS Systems' : 'Deep Space Nav'}
          </button>
        ))}
      </div>

      {activeTab === 'history' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-5">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1 rounded-full text-xs capitalize transition-all ${
                  catFilter === cat ? 'bg-teal-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative border-l-2 border-teal-500/30 ml-4 space-y-0">
            {filtered.map((m, i) => (
              <div key={i} className="relative pl-6 pb-4">
                <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-teal-700 border-2 border-teal-400" />
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-white font-bold">{m.event}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CAT_COLORS[m.category]}`}>{m.category}</span>
                      <span className="text-teal-300 font-mono text-sm">{m.year}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                    <div>
                      <span className="text-gray-400">Tool: </span>
                      <span className="text-gray-200">{m.tool}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Accuracy: </span>
                      <span className="text-green-400">{m.accuracy}</span>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm">{m.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'gnss' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {NAV_SYSTEMS.map(s => (
              <button
                key={s.name}
                onClick={() => setSelected(s)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected.name === s.name
                    ? 'border-teal-500 bg-teal-600/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                  <div>
                    <div className="text-white text-sm font-medium">{s.name}</div>
                    <div className="text-gray-400 text-xs">{s.operator}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 rounded-full" style={{ background: selected.color }} />
              <h3 className="text-white text-xl font-bold">{selected.name}</h3>
            </div>
            <p className="text-gray-400 text-sm mb-4">{selected.operator} · Since {selected.launched} · {selected.coverage}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Satellites', value: `${selected.satellites} active` },
                { label: 'Accuracy', value: selected.accuracy },
                { label: 'Frequencies', value: selected.frequency },
                { label: 'Coverage', value: selected.coverage },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="mb-3">
              <div className="text-gray-400 text-xs mb-2">Applications</div>
              <div className="flex flex-wrap gap-2">
                {selected.applications.map(a => (
                  <span key={a} className="text-xs px-2 py-1 rounded-full bg-teal-500/20 text-teal-300">{a}</span>
                ))}
              </div>
            </div>

            {/* Constellation diagram */}
            <div className="mt-4">
              <div className="text-gray-400 text-xs mb-2">Orbital Shell ({selected.satellites} satellites)</div>
              <div className="relative h-8 bg-black/30 rounded-full overflow-hidden">
                {Array.from({ length: selected.satellites }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-1 bottom-1 rounded-full w-2"
                    style={{ left: `${(i / selected.satellites) * 95}%`, background: selected.color + 'cc' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deepspace' && (
        <div className="space-y-4">
          <div className="bg-teal-900/20 border border-teal-500/30 rounded-xl p-4 mb-4">
            <div className="text-teal-300 font-bold mb-2">The Deep Space Network</div>
            <p className="text-gray-300 text-sm">
              NASA's Deep Space Network (DSN) consists of three complexes in Goldstone (California), Madrid (Spain), and Canberra (Australia), each 120° apart to maintain continuous contact with deep-space spacecraft. Largest antennas are 70 m across — sensitive enough to detect a cell phone signal from Jupiter.
            </p>
          </div>

          {DEEP_SPACE.map((d, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-teal-400 font-bold text-lg">🛸 {d.mission}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Navigation Technique</div>
                  <div className="text-white text-sm">{d.technique}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Achieved Accuracy</div>
                  <div className="text-green-400 text-sm font-bold">{d.accuracy}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-red-900/20 rounded-lg p-3">
                  <div className="text-red-400 text-xs mb-1">Challenge</div>
                  <div className="text-gray-200 text-sm">{d.challenge}</div>
                </div>
                <div className="bg-green-900/20 rounded-lg p-3">
                  <div className="text-green-400 text-xs mb-1">Solution</div>
                  <div className="text-gray-200 text-sm">{d.solution}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'GPS Accuracy', value: '3–5 m', desc: 'civilian, multi-system: <1m' },
          { label: 'Atomic Clock Error', value: '<1 ns', desc: '38 μs/day relativistic correction' },
          { label: 'Voyager Accuracy', value: '±300 km', desc: 'at 23 billion km — 1 part in 10⁷' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-teal-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
