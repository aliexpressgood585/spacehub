import { useState } from 'react'

interface Mission {
  name: string
  status: 'completed' | 'upcoming' | 'planned'
  date: string
  crew: string
  objective: string
  vehicle: string
  landmark: string
}

interface Spacecraft {
  name: string
  type: string
  manufacturer: string
  crew: number
  description: string
  height: string
  mass: string
  facts: string[]
  color: string
}

interface LandingSite {
  name: string
  lat: number
  lon: number
  rationale: string
  features: string[]
}

const MISSIONS: Mission[] = [
  {
    name: 'Artemis I',
    status: 'completed',
    date: 'Nov 16 – Dec 11, 2022',
    crew: 'Uncrewed (mannequins)',
    objective: 'First integrated flight test of SLS + Orion. Achieved lunar flyby at 130 km altitude and returned at 39,000 km/h.',
    vehicle: 'SLS Block 1 + Orion',
    landmark: 'First flight of Space Launch System',
  },
  {
    name: 'Artemis II',
    status: 'upcoming',
    date: 'April 2026 (planned)',
    crew: 'Reid Wiseman, Victor Glover, Christina Koch, Jeremy Hansen',
    objective: 'First crewed flight around the Moon since Apollo 17. 10-day free-return trajectory with no landing.',
    vehicle: 'SLS Block 1 + Orion',
    landmark: 'First humans beyond low Earth orbit since 1972',
  },
  {
    name: 'Artemis III',
    status: 'planned',
    date: '2026+ (planned)',
    crew: 'TBD — first woman and person of color on Moon',
    objective: 'First crewed lunar landing since Apollo 17 (1972). Near-South Pole landing using SpaceX Starship HLS.',
    vehicle: 'SLS + Orion + Starship HLS',
    landmark: 'Return humans to lunar surface after 50+ year gap',
  },
  {
    name: 'Artemis IV',
    status: 'planned',
    date: '2028 (planned)',
    crew: 'TBD',
    objective: 'First mission to dock with Lunar Gateway. Deliver Gateway\'s HALO habitat module. Extended surface operations.',
    vehicle: 'SLS Block 1B + Orion + Gateway',
    landmark: 'First use of Lunar Gateway station',
  },
  {
    name: 'Artemis V',
    status: 'planned',
    date: '2029+ (planned)',
    crew: 'TBD',
    objective: 'Use Lunar Gateway for crew transfer. Test Blue Origin Blue Moon lander. Sustained surface presence begins.',
    vehicle: 'SLS Block 1B + Orion + Blue Moon',
    landmark: 'Establishment of sustained lunar operations',
  },
]

const SPACECRAFT: Spacecraft[] = [
  {
    name: 'SLS (Space Launch System)',
    type: 'Launch Vehicle',
    manufacturer: 'Boeing / Northrop Grumman / Aerojet',
    crew: 0,
    description: 'The most powerful rocket ever built. Block 1 produces 8.8 million lbs of thrust — 15% more than Saturn V. Uses RS-25 engines (Space Shuttle legacy) and Solid Rocket Boosters.',
    height: '98 m (Block 1)',
    mass: '2,608 tonnes',
    facts: ['8.8M lbs thrust', '4 RS-25 engines', '2 solid boosters', '27+ tonnes to Moon', '$4.1B per launch'],
    color: '#f59e0b',
  },
  {
    name: 'Orion Capsule',
    type: 'Crew Capsule',
    manufacturer: 'Lockheed Martin / ESA (service module)',
    crew: 4,
    description: 'Next-generation crewed spacecraft. Heat shield rated for 32,000°F re-entry from lunar speeds. Solar panel service module by ESA. Designed for deep space missions up to 21 days.',
    height: '8.8 m (with SM)',
    mass: '26.5 tonnes (with SM)',
    facts: ['4 crew members', '21-day deep space rating', '5 m heat shield diameter', 'Re-enters at 11 km/s', 'ESA service module'],
    color: '#3b82f6',
  },
  {
    name: 'Starship HLS',
    type: 'Lunar Lander',
    manufacturer: 'SpaceX',
    crew: 4,
    description: 'SpaceX Starship adapted as Human Landing System. Fully reusable, fueled in Earth orbit via tanker flights. Lands vertically on the Moon using Raptor engines. Won NASA\'s HLS contract in 2021.',
    height: '~50 m',
    mass: '1,300 tonnes (propellant)',
    facts: ['Won $2.9B NASA contract', 'Fully reusable', 'Needs orbital refueling', 'Raptor engines (Vac)', 'Elevator + airlock on lunar surface'],
    color: '#8b5cf6',
  },
  {
    name: 'Lunar Gateway',
    type: 'Space Station',
    manufacturer: 'NASA/ESA/JAXA/CSA',
    crew: 4,
    description: 'A small modular station in near-rectilinear halo orbit around the Moon. 7-day Earth-to-Gateway transit. Serves as staging point for lunar surface missions and deep space exploration.',
    height: '~60 m (assembled)',
    mass: '~40 tonnes',
    facts: ['Lunar orbit station', 'Power & Propulsion: NASA', 'HALO habitat: Northrop', 'Lunar I-Hab: ESA/JAXA', 'Operates intermittently — not always crewed'],
    color: '#10b981',
  },
]

const LANDING_SITES: LandingSite[] = [
  {
    name: 'Artemis III — Nobile Massif Region',
    lat: -85.5,
    lon: 0,
    rationale: 'South Pole permanently shadowed craters contain water ice. Peak illumination ridges provide near-constant sunlight for solar power.',
    features: ['Water ice access', '6.5-day mission duration', 'Permanent shadow nearby', 'High ridge sunlight'],
  },
  {
    name: 'Shackleton Crater Rim',
    lat: -89.9,
    lon: 0,
    rationale: 'Crater rim has >90% sunlight. Interior has water ice confirmed by LRO. Candidate for permanent base.',
    features: ['Confirmed water ice', 'Near-permanent sunlight', 'Candidate base site', 'LCROSS impact site nearby'],
  },
  {
    name: 'Malapert Massif',
    lat: -86,
    lon: 0,
    rationale: 'High point (5 km above datum) with continuous Earth view for communications. Near South Pole water resources.',
    features: ['Unobstructed Earth view', '5 km elevation', 'Near water resources', 'Good for comms relay'],
  },
]

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  upcoming: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  planned: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

type TabType = 'timeline' | 'vehicles' | 'sites'

export default function ArtemisProgram() {
  const [activeTab, setActiveTab] = useState<TabType>('timeline')
  const [selectedVehicle, setSelectedVehicle] = useState<Spacecraft>(SPACECRAFT[0])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🌙</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Artemis Program</h2>
          <p className="text-gray-400 text-sm">NASA's return to the Moon — and gateway to Mars</p>
        </div>
      </div>

      {/* Hero banner */}
      <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-500/30 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-4 justify-around">
          {[
            { value: 'Artemis II', label: 'Next Mission', sub: 'April 2026' },
            { value: '4', label: 'Crew', sub: '(first woman + person of color to Moon)' },
            { value: '2026+', label: 'Moon Landing', sub: 'Artemis III' },
            { value: '2028+', label: 'Gateway Online', sub: 'Artemis IV' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-white font-bold text-xl">{s.value}</div>
              <div className="text-blue-300 text-xs">{s.label}</div>
              <div className="text-gray-400 text-xs">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['timeline', 'vehicles', 'sites'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === t ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'timeline' ? 'Mission Timeline' : t === 'vehicles' ? 'Spacecraft' : 'Landing Sites'}
          </button>
        ))}
      </div>

      {activeTab === 'timeline' && (
        <div className="relative border-l-2 border-blue-500/30 ml-4 space-y-0">
          {MISSIONS.map((m, i) => (
            <div key={i} className="relative pl-6 pb-6">
              <div className={`absolute -left-2 top-1 w-4 h-4 rounded-full border-2 ${
                m.status === 'completed' ? 'bg-green-500 border-green-400' :
                m.status === 'upcoming' ? 'bg-blue-500 border-blue-400' :
                'bg-gray-600 border-gray-400'
              }`} />
              <div className={`border rounded-xl p-4 ${STATUS_COLORS[m.status]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-white font-bold text-lg">{m.name}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[m.status]}`}>{m.status}</span>
                  </div>
                  <span className="text-gray-300 text-sm font-mono">{m.date}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                  <div>
                    <div className="text-gray-400 text-xs">Crew</div>
                    <div className="text-gray-200 text-sm">{m.crew}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Vehicle</div>
                    <div className="text-gray-200 text-sm">{m.vehicle}</div>
                  </div>
                </div>
                <p className="text-gray-300 text-sm mb-2">{m.objective}</p>
                <div className="text-yellow-300 text-xs flex items-center gap-1">
                  <span>⭐</span>
                  <span>{m.landmark}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'vehicles' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {SPACECRAFT.map(sc => (
              <button
                key={sc.name}
                onClick={() => setSelectedVehicle(sc)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedVehicle.name === sc.name
                    ? 'border-blue-500 bg-blue-600/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="text-white text-sm font-medium">{sc.name}</div>
                <div className="text-gray-400 text-xs mt-0.5">{sc.type} · {sc.manufacturer.split('/')[0]}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-3 h-12 rounded-full flex-shrink-0" style={{ background: selectedVehicle.color }} />
              <div>
                <h3 className="text-white text-xl font-bold">{selectedVehicle.name}</h3>
                <p className="text-gray-400 text-sm">{selectedVehicle.type} · {selectedVehicle.manufacturer}</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm mb-4">{selectedVehicle.description}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Height', value: selectedVehicle.height },
                { label: 'Mass', value: selectedVehicle.mass },
                { label: 'Crew Capacity', value: selectedVehicle.crew > 0 ? `${selectedVehicle.crew} astronauts` : 'Uncrewed' },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedVehicle.facts.map(f => (
                <span key={f} className="text-xs px-3 py-1 rounded-full bg-white/10 text-gray-300">{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sites' && (
        <div className="space-y-4">
          {/* Moon South Pole SVG diagram */}
          <div className="flex justify-center">
            <svg viewBox="0 0 200 200" className="w-48 h-48">
              <circle cx="100" cy="100" r="90" fill="#1a1a2e" stroke="#3b82f6" strokeWidth="1" />
              {/* Craters */}
              <circle cx="100" cy="20" r="15" fill="#0d1117" stroke="#374151" strokeWidth="1" />
              <circle cx="60" cy="40" r="10" fill="#0d1117" stroke="#374151" strokeWidth="1" />
              <circle cx="140" cy="35" r="12" fill="#0d1117" stroke="#374151" strokeWidth="1" />
              <circle cx="80" cy="70" r="8" fill="#0d1117" stroke="#374151" strokeWidth="1" />
              {/* Shackleton */}
              <circle cx="100" cy="100" r="20" fill="#000" stroke="#f59e0b" strokeWidth="2" />
              <text x="100" y="95" fill="#f59e0b" fontSize="7" textAnchor="middle">Shackleton</text>
              <text x="100" y="104" fill="#f59e0b" fontSize="6" textAnchor="middle">Crater</text>
              {/* South Pole marker */}
              <circle cx="100" cy="100" r="2" fill="#ef4444" />
              {/* Landing site markers */}
              <circle cx="115" cy="88" r="4" fill="#3b82f6" opacity="0.8" />
              <text x="120" y="85" fill="#60a5fa" fontSize="6">Art. III</text>
              <circle cx="88" cy="80" r="4" fill="#10b981" opacity="0.8" />
              <text x="60" y="78" fill="#34d399" fontSize="6">Malapert</text>
              {/* Sunlight arrows */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
                const rad = (angle * Math.PI) / 180
                const x1 = 100 + 85 * Math.cos(rad)
                const y1 = 100 + 85 * Math.sin(rad)
                const x2 = 100 + 75 * Math.cos(rad)
                const y2 = 100 + 75 * Math.sin(rad)
                return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth="1" opacity="0.3" />
              })}
              <text x="100" y="190" fill="#6b7280" fontSize="7" textAnchor="middle">South Pole View</text>
            </svg>
          </div>

          {LANDING_SITES.map((site, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">📍</span>
                <div>
                  <h3 className="text-white font-bold">{site.name}</h3>
                  <div className="text-gray-400 text-xs font-mono">{site.lat}°N, {site.lon}°E</div>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-3">{site.rationale}</p>
              <div className="flex flex-wrap gap-2">
                {site.features.map(f => (
                  <span key={f} className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">{f}</span>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
            <div className="text-yellow-300 font-bold mb-2">Why the South Pole?</div>
            <p className="text-gray-300 text-sm">
              Permanently shadowed craters at the lunar south pole harbor water ice deposited by comets and asteroids over billions of years. This ice is critical for future missions: it can be split into hydrogen (rocket fuel) and oxygen (breathing air), enabling sustained lunar presence and eventually propelling missions to Mars.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Last Moon Landing', value: '1972', desc: 'Apollo 17' },
          { label: 'SLS Thrust', value: '8.8M lbs', desc: '15% more than Saturn V' },
          { label: 'Water Ice at Pole', value: '600M tons', desc: 'estimated' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-blue-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
