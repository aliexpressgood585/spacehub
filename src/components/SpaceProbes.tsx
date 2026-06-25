import { useState } from 'react'

interface Probe {
  name: string
  agency: string
  launched: number
  target: string
  status: 'active' | 'completed' | 'lost'
  distance: string
  speed: string
  powerSource: string
  flag: string
  achievements: string[]
  description: string
  type: 'flyby' | 'orbiter' | 'lander' | 'rover' | 'sample return' | 'impactor'
}

interface ProbeEra {
  era: string
  years: string
  description: string
  keyMissions: string[]
  color: string
}

interface DistantProbe {
  name: string
  distanceAU: number
  launched: number
  signal: string
  power: number
}

const probes: Probe[] = [
  { name: 'Voyager 1', agency: 'NASA/JPL', launched: 1977, target: 'Jupiter, Saturn, Interstellar', status: 'active', distance: '163+ AU', speed: '17.0 km/s', powerSource: 'RTG (Pu-238)', flag: '🇺🇸', type: 'flyby', description: 'Farthest human-made object, now in interstellar space. Crossed heliopause in 2012. Still transmitting.', achievements: ['Jupiter flyby 1979', 'Saturn flyby 1980', 'First interstellar probe', 'Pale Blue Dot photograph'] },
  { name: 'New Horizons', agency: 'NASA/APL', launched: 2006, target: 'Pluto, Arrokoth', status: 'active', distance: '60+ AU', speed: '14.0 km/s', powerSource: 'RTG (Pu-238)', flag: '🇺🇸', type: 'flyby', description: 'Fastest spacecraft at launch. First detailed images of Pluto (2015) showing mountains, nitrogen glaciers, and tenuous atmosphere.', achievements: ['Pluto flyby 2015', 'Arrokoth flyby 2019', 'Farthest solar system object visited', 'Smallest KBO explored'] },
  { name: 'Cassini-Huygens', agency: 'NASA/ESA/ASI', launched: 1997, target: 'Saturn system', status: 'completed', distance: 'N/A (ended 2017)', speed: 'N/A (deorbited)', powerSource: 'RTG (Pu-238)', flag: '🇺🇸🇪🇺', type: 'orbiter', description: '13-year Saturn orbital mission. Huygens probe landed on Titan. Discovered Enceladus water plumes hinting at habitability.', achievements: ['Huygens Titan landing 2005', 'Enceladus plumes discovered', 'Titan lakes and seas mapped', 'Saturn ring structure revealed'] },
  { name: 'Curiosity Rover', agency: 'NASA/JPL', launched: 2011, target: 'Mars (Gale Crater)', status: 'active', distance: 'Mars (~225 M km avg)', speed: 'Stationary', powerSource: 'RTG (Pu-238)', flag: '🇺🇸', type: 'rover', description: 'Car-sized rover detecting organic molecules in Martian rocks and measuring radiation environment for future human missions.', achievements: ['Organic molecules confirmed', 'Methane detections', 'Lake bed paleoenvironment', 'Radiation baseline for humans'] },
  { name: 'Perseverance', agency: 'NASA/JPL', launched: 2020, target: 'Mars (Jezero Crater)', status: 'active', distance: 'Mars', speed: 'Stationary', powerSource: 'RTG (Pu-238)', flag: '🇺🇸', type: 'rover', description: 'Most sophisticated Mars rover. Caching samples for Mars Sample Return. Ingenuity helicopter achieved first powered flight on another planet.', achievements: ['Ingenuity helicopter', 'MOXIE O₂ production', 'Jezero delta samples', 'Ancient river delta explored'] },
  { name: 'OSIRIS-REx', agency: 'NASA/UA', launched: 2016, target: 'Asteroid Bennu', status: 'active', distance: 'En route to Apophis', speed: 'Variable', powerSource: 'Solar', flag: '🇺🇸', type: 'sample return', description: 'Returned 121g of Bennu asteroid material to Earth in 2023 — largest off-Earth sample since Apollo. Now heading to asteroid Apophis.', achievements: ['Bennu sample returned 2023', '121.6g pristine material', 'Carbon-rich material confirmed', 'Now renamed OSIRIS-APEX'] },
  { name: 'Juno', agency: 'NASA/JPL', launched: 2011, target: 'Jupiter', status: 'active', distance: 'Jupiter system', speed: 'Orbital', powerSource: 'Solar (largest solar-powered in deep space)', flag: '🇺🇸', type: 'orbiter', description: 'Polar orbiter mapping Jupiter\'s interior structure, magnetic field, and atmosphere. Extended to explore Ganymede and Io.', achievements: ['Jupiter interior mapped', 'Cyclone clusters at poles', 'Magnetic field detailed', 'Ganymede and Io flybys'] },
  { name: 'Parker Solar Probe', agency: 'NASA/APL', launched: 2018, target: 'Sun corona', status: 'active', distance: '< 0.1 AU from Sun', speed: '635,000 km/h (fastest ever)', powerSource: 'Solar', flag: '🇺🇸', type: 'orbiter', description: 'Touches the Sun — entered solar corona in 2021. Fastest human-made object, using Venus gravity assists to tighten its orbit.', achievements: ['First spacecraft in corona', '635,000 km/h speed record', 'Solar wind source traced', 'Dust-free zone discovered'] },
]

const eras: ProbeEra[] = [
  { era: 'Pioneer Era', years: '1958–1975', description: 'First attempts to escape Earth gravity well and explore inner solar system. Pioneer 10 first to cross asteroid belt and reach Jupiter.', keyMissions: ['Pioneer 10/11', 'Mariner 2/4', 'Luna program', 'Venera 4'], color: '#60a5fa' },
  { era: 'Grand Tour', years: '1975–1990', description: 'Rare planetary alignment enabled grand tour missions. Voyager 2 visited all four giant planets in one mission.', keyMissions: ['Viking 1/2', 'Voyager 1/2', 'Pioneer Venus', 'Giotto (Halley)'], color: '#a78bfa' },
  { era: 'Renaissance', years: '1990–2005', description: 'Sophisticated orbiters and landers enabled long-duration planetary science. Mars proved to have abundant water in its past.', keyMissions: ['Galileo', 'Cassini-Huygens', 'Mars Pathfinder', 'MESSENGER'], color: '#34d399' },
  { era: 'Modern Era', years: '2005–present', description: 'Sample return, precision landing, helicopter flight. Science converging with commercial spaceflight and reusable launch vehicles.', keyMissions: ['New Horizons', 'Curiosity', 'Perseverance', 'OSIRIS-REx', 'Parker Solar Probe'], color: '#fb923c' },
]

const distantProbes: DistantProbe[] = [
  { name: 'Voyager 1', distanceAU: 164, launched: 1977, signal: '22 hours 30 min', power: 4 },
  { name: 'Voyager 2', distanceAU: 136, launched: 1977, signal: '18 hours 45 min', power: 4 },
  { name: 'Pioneer 10', distanceAU: 133, launched: 1972, signal: 'Last contact 2003', power: 0 },
  { name: 'New Horizons', distanceAU: 60, launched: 2006, signal: '8 hours 35 min', power: 180 },
]

type Tab = 'probes' | 'eras' | 'distance'

export default function SpaceProbes() {
  const [tab, setTab] = useState<Tab>('probes')
  const [selected, setSelected] = useState<Probe>(probes[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'probes', label: 'Flagship Probes' },
    { id: 'eras', label: 'Exploration Eras' },
    { id: 'distance', label: 'How Far?' },
  ]

  const statusColor = { active: 'text-green-400 bg-green-900/30', completed: 'text-gray-400 bg-gray-800', lost: 'text-red-400 bg-red-900/30' }
  const typeColor = { flyby: 'text-blue-400', orbiter: 'text-purple-400', lander: 'text-orange-400', rover: 'text-green-400', 'sample return': 'text-yellow-400', impactor: 'text-red-400' }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Probes</h2>
      <p className="text-gray-400 text-sm mb-5">Robotic explorers of our solar system and beyond</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'probes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {probes.map(p => (
              <button key={p.name} onClick={() => setSelected(p)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === p.name ? 'bg-orange-900/40 border border-orange-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white text-sm">{p.flag} {p.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${statusColor[p.status]}`}>{p.status}</span>
                </div>
                <div className="text-gray-400 text-xs">{p.target}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs capitalize ${typeColor[p.type]}`}>{p.type}</span>
                  <span className="text-gray-600 text-xs">{p.launched}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-gray-800/60 rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-xl font-bold text-white">{selected.flag} {selected.name}</h3>
                <div className="text-gray-400 text-sm">{selected.agency} · Launched {selected.launched}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusColor[selected.status]}`}>{selected.status}</span>
            </div>
            <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Distance from Sun', value: selected.distance },
                { label: 'Current Speed', value: selected.speed },
                { label: 'Power Source', value: selected.powerSource },
                { label: 'Mission Type', value: selected.type },
              ].map(item => (
                <div key={item.label} className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">{item.label}</div>
                  <div className="text-white text-sm font-medium mt-1 capitalize">{item.value}</div>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-gray-400 text-xs font-semibold uppercase mb-2">Key Achievements</h4>
              <ul className="space-y-1">
                {selected.achievements.map(a => (
                  <li key={a} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-orange-400 mt-0.5 flex-shrink-0">▸</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'eras' && (
        <div className="space-y-4">
          {eras.map(era => (
            <div key={era.era} className="bg-gray-800/60 rounded-lg p-5 border-l-4" style={{ borderColor: era.color }}>
              <div className="flex items-center gap-4 mb-2">
                <h3 className="text-white font-bold text-lg">{era.era}</h3>
                <span className="text-sm font-mono" style={{ color: era.color }}>{era.years}</span>
              </div>
              <p className="text-gray-400 text-sm mb-3">{era.description}</p>
              <div className="flex flex-wrap gap-2">
                {era.keyMissions.map(m => (
                  <span key={m} className="text-xs px-2 py-1 rounded text-gray-300 bg-gray-700">{m}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'distance' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-orange-900/20 rounded-lg p-4 border border-orange-800/40">
            1 AU = 149.6 million km (Earth-Sun distance). Voyager 1 at 164 AU has traveled so far that radio signals, even at light speed, take over 22 hours each way. Its RTG power is down to ~4W — powering just 3 science instruments.
          </p>
          {distantProbes.map(p => (
            <div key={p.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <h4 className="text-white font-bold">{p.name}</h4>
                <div className="text-right">
                  <div className="text-orange-300 font-bold text-xl">{p.distanceAU} AU</div>
                  <div className="text-gray-500 text-xs">{(p.distanceAU * 149.6).toFixed(0)} M km</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Launched</div>
                  <div className="text-white text-sm font-medium">{p.launched}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Signal Delay</div>
                  <div className="text-white text-sm font-medium">{p.signal}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Power (W)</div>
                  <div className="text-white text-sm font-medium">{p.power > 0 ? `~${p.power}W` : 'Defunct'}</div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Distance from Sun (scale to Voyager 1 = 100%)</span>
                  <span>{Math.round((p.distanceAU / 164) * 100)}%</span>
                </div>
                <div className="bg-gray-700 rounded-full h-2">
                  <div className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400" style={{ width: `${(p.distanceAU / 164) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
