import { useState } from 'react'

interface DebrisZone {
  name: string
  altitude: string
  altitudeKm: [number, number]
  objectCount: string
  density: string
  primarySource: string
  kepler: boolean
  threat: 'Critical' | 'High' | 'Moderate' | 'Low'
  description: string
  color: string
}

interface IncidentRecord {
  year: number
  event: string
  objects: string
  consequence: string
  icon: string
}

interface MitigationMethod {
  name: string
  concept: string
  trl: string
  pros: string[]
  cons: string[]
  example: string
  color: string
}

const debrisZones: DebrisZone[] = [
  {
    name: 'Very Low Earth Orbit (VLEO)',
    altitude: '160–450 km',
    altitudeKm: [160, 450],
    objectCount: '~20,000 tracked objects',
    density: 'High — rapid growth from megaconstellations',
    primarySource: 'ISS region, Starlink/OneWeb, historical debris',
    kepler: false,
    threat: 'Critical',
    description: 'The busiest orbital zone. ISS maintains ~400 km. Atmospheric drag naturally cleans up debris in years to decades. However, Starlink (6,000+ satellites) and upcoming constellations may trigger Kessler Syndrome here.',
    color: '#ef4444'
  },
  {
    name: 'Low Earth Orbit (LEO)',
    altitude: '450–2,000 km',
    altitudeKm: [450, 2000],
    objectCount: '~27,000 tracked (>10 cm)',
    density: 'Very High — peak debris belt',
    primarySource: 'Fengyun-1C (2007), Cosmos-Iridium (2009), old satellites',
    kepler: false,
    threat: 'Critical',
    description: 'The primary debris field. The 2007 Chinese ASAT test created 3,500+ trackable fragments at 850 km. The 2009 Cosmos-Iridium collision added 2,000+ fragments. Nearly all of Earth observation and reconnaissance satellites operate here.',
    color: '#f97316'
  },
  {
    name: 'Medium Earth Orbit (MEO)',
    altitude: '2,000–20,000 km',
    altitudeKm: [2000, 20000],
    objectCount: '~2,000 tracked objects',
    density: 'Lower — but growing',
    primarySource: 'Navigation (GPS, Galileo, GLONASS) satellites',
    kepler: false,
    threat: 'High',
    description: 'GPS (20,200 km), Galileo (23,222 km), GLONASS (19,100 km) orbits. Debris here stays for thousands of years. The Van Allen belts make inspection/remediation difficult.',
    color: '#eab308'
  },
  {
    name: 'Geostationary Orbit (GEO)',
    altitude: '35,786 km',
    altitudeKm: [35700, 35900],
    objectCount: '~1,500+ active + dead satellites',
    density: 'Line of satellites around equator',
    primarySource: 'Weather, comms, TV broadcast satellites',
    kepler: true,
    threat: 'Moderate',
    description: 'The most valuable orbital belt — only 360° of longitude available. Satellites here are usually deorbited to "graveyard orbit" (+300 km above GEO) at end of life. Any collision creates permanent debris in this zone.',
    color: '#22c55e'
  },
]

const incidents: IncidentRecord[] = [
  { year: 1978, event: 'Kessler & Cour-Palais paper published', objects: 'Theoretical', consequence: 'First mathematical proof that cascade collisions are possible. Named after Donald Kessler.', icon: '📄' },
  { year: 1996, event: 'Cerise satellite hit by Ariane debris', objects: '1 fragment hit', consequence: 'First confirmed satellite collision with debris. French Cerise military satellite had its gravity-gradient boom severed.', icon: '🛰️' },
  { year: 2007, event: 'China FY-1C ASAT test', objects: '~3,500+ fragments', consequence: 'Largest single debris-generating event in history. FY-1C was at 865 km — long orbital lifetime. Directly increased collision risk by 10–25%.', icon: '🇨🇳' },
  { year: 2009, event: 'Cosmos 2251 × Iridium 33', objects: '~2,000+ fragments', consequence: 'First accidental satellite-to-satellite collision. Combined ~1.5 tons, relative velocity ~11.7 km/s. Iridium 33 completely destroyed.', icon: '💥' },
  { year: 2021, event: 'Russia destroys Cosmos 1408 (ASAT)', objects: '~1,500 fragments (>10 cm)', consequence: 'ISS crew sheltered in docked spacecraft. Forced emergency maneuver plans. Cloud passes ISS 8x/day. Condemned by US/EU.', icon: '🇷🇺' },
  { year: 2023, event: 'Starlink-Cosmos near-miss', objects: 'Near miss (50 m separation)', consequence: 'SpaceX maneuver prevented collision with Cosmos debris. Highlights increasing conjunction rates as Starlink grew to 5,000+ satellites.', icon: '⚠️' },
]

const mitigationMethods: MitigationMethod[] = [
  {
    name: 'Passive Deorbit (Drag Augmentation)',
    concept: 'Deploy drag sail/balloon at end-of-life to increase atmospheric braking and deorbit naturally within 25 years.',
    trl: 'TRL 7–9 (deployed operationally)',
    pros: ['Simple, low cost', 'No propellant needed', 'Proven technology (Gossamer Orbit Lowering Device)'],
    cons: ['Only works in LEO below ~2,000 km', 'Ineffective for MEO/GEO', 'Increases collision risk during deorbit'],
    example: 'Surrey Space Centre\'s InflateSail; ISIS Gossamer-1',
    color: '#22c55e'
  },
  {
    name: 'Active Debris Removal (ADR)',
    concept: 'Robotic spacecraft rendezvous, capture, and deorbit large debris objects (defunct rocket bodies, dead satellites).',
    trl: 'TRL 4–6 (technology demonstration phase)',
    pros: ['Can remove high-risk objects', 'Address legacy problem', 'ESA ClearSpace-1 targets Vespa'],
    cons: ['Extremely expensive ($100M+ per object)', 'Legal ownership issues', 'Technically very challenging (non-cooperative targets)'],
    example: 'ESA ClearSpace-1 (2026), Astroscale ELSA missions',
    color: '#60a5fa'
  },
  {
    name: 'Harpoon / Net Capture',
    concept: 'Attach a harpoon or deploy a net to capture tumbling debris, then deorbit using a tether or attached propulsion system.',
    trl: 'TRL 4–5 (tested in orbit)',
    pros: ['Works on non-cooperative targets', 'Multiple designs tested', 'Net has large capture envelope'],
    cons: ['Harpoon may fragmentize debris', 'Net tangling risk', 'Tether attitude control difficult'],
    example: 'RemoveDEBRIS satellite (2018, Surrey): tested harpoon and net',
    color: '#f59e0b'
  },
  {
    name: 'Laser Ablation',
    concept: 'Ground- or space-based laser ablates debris surface, creating thrust that slows the object and lowers its orbit to burn up.',
    trl: 'TRL 2–3 (theoretical/laboratory)',
    pros: ['No physical contact', 'Can operate from ground', 'Effective on small debris (1–10 cm)'],
    cons: ['Dual-use weapons concern (treaties)', 'Power requirements very high', 'Small debris hard to track'],
    example: 'RELOS concept (NASA); Chinese research active',
    color: '#a78bfa'
  },
]

export default function SpaceDebrisTracker() {
  const [view, setView] = useState<'zones' | 'history' | 'mitigation'>('zones')
  const [selectedZone, setSelectedZone] = useState(debrisZones[0])

  const totalTracked = 27000
  const totalEstimated = 1000000

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Debris Crisis</h2>
      <p className="text-gray-400 text-sm mb-5">Over 27,000 tracked objects + millions more threatening the future of space access</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[{ id: 'zones', l: 'Orbital Zones' }, { id: 'history', l: 'Incident History' }, { id: 'mitigation', l: 'Cleanup Tech' }].map(t => (
          <button key={t.id} onClick={() => setView(t.id as typeof view)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === t.id ? 'bg-slate-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.l}</button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { val: '27,000+', label: 'Tracked objects (>10 cm)', color: '#ef4444' },
          { val: '~1M', label: 'Objects 1–10 cm (untrackable)', color: '#f97316' },
          { val: '130M+', label: 'Objects <1 cm (untrackable)', color: '#eab308' },
          { val: '9,800', label: 'Active satellites (2024)', color: '#22c55e' },
        ].map(item => (
          <div key={item.label} className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold font-mono" style={{ color: item.color }}>{item.val}</div>
            <div className="text-gray-500 text-xs mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {view === 'zones' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Altitude visualization */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Debris Density by Altitude</div>
            <div className="flex items-end gap-1 h-48">
              {debrisZones.map((z, i) => {
                const heights = [90, 100, 60, 40]
                const isSelected = selectedZone.name === z.name
                return (
                  <button key={z.name} onClick={() => setSelectedZone(z)} className="flex-1 flex flex-col justify-end transition-all" style={{ height: '100%' }}>
                    <div className="rounded-t-lg w-full transition-all" style={{ height: `${heights[i]}%`, backgroundColor: z.color + (isSelected ? 'ff' : '66'), border: isSelected ? `2px solid ${z.color}` : 'none' }} />
                    <div className="text-gray-500 text-xs mt-1 text-center">{z.altitudeKm[0] < 1000 ? z.altitudeKm[0] : `${(z.altitudeKm[0] / 1000).toFixed(0)}k`}km</div>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 space-y-1.5">
              {debrisZones.map(z => (
                <button key={z.name} onClick={() => setSelectedZone(z)} className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${selectedZone.name === z.name ? 'border' : 'bg-gray-700/30 hover:bg-gray-700/60'}`} style={selectedZone.name === z.name ? { borderColor: z.color } : {}}>
                  <div className="flex items-center justify-between">
                    <div style={{ color: z.color }}>{z.name.split('(')[0].trim()}</div>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${z.threat === 'Critical' ? 'bg-red-900/40 text-red-400' : z.threat === 'High' ? 'bg-orange-900/40 text-orange-400' : 'bg-yellow-900/40 text-yellow-400'}`}>{z.threat}</span>
                  </div>
                  <div className="text-gray-500">{z.altitude}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedZone.name}</h3>
                  <div className="text-sm" style={{ color: selectedZone.color }}>{selectedZone.altitude}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${selectedZone.threat === 'Critical' ? 'bg-red-900/40 text-red-400' : selectedZone.threat === 'High' ? 'bg-orange-900/40 text-orange-400' : 'bg-green-900/40 text-green-400'}`}>{selectedZone.threat} Risk</span>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selectedZone.description}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase">Tracked Objects</div>
                  <div className="text-white font-mono">{selectedZone.objectCount}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase">Density</div>
                  <div className="text-white text-sm">{selectedZone.density}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3 col-span-2">
                  <div className="text-gray-500 text-xs uppercase mb-1">Primary Source</div>
                  <div className="text-gray-300 text-sm">{selectedZone.primarySource}</div>
                </div>
              </div>
            </div>

            <div className="bg-red-900/20 rounded-xl p-4 border border-red-800/40">
              <h4 className="text-white font-bold text-sm mb-2">Kessler Syndrome</h4>
              <p className="text-gray-300 text-sm">A collision creates fragments → each fragment raises the overall debris density → raising collision probability → triggering more collisions. A runaway cascade could render certain orbital shells permanently unusable for decades or centuries. Current debris density in 800–1,000 km LEO is near the critical threshold.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-red-900/30 rounded p-2">
                  <div className="text-red-400 font-semibold">Kessler-threshold density</div>
                  <div className="text-gray-300 mt-0.5">~10⁻⁸ objects/km³ (modeled)</div>
                </div>
                <div className="bg-orange-900/30 rounded p-2">
                  <div className="text-orange-400 font-semibold">Current 800–1000 km density</div>
                  <div className="text-gray-300 mt-0.5">Estimated near threshold</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Tracked vs Total Objects</div>
              <div className="relative w-full bg-gray-700 rounded-full h-5">
                <div className="h-5 rounded-full bg-red-500" style={{ width: `${(totalTracked / totalEstimated) * 100 * 10}%` }}>
                  <span className="text-white text-xs ml-2">27,000 tracked</span>
                </div>
              </div>
              <div className="text-gray-500 text-xs mt-1">~1,000,000+ total objects estimated (&gt;1 cm) — 97% untrackable by current radar</div>
            </div>
          </div>
        </div>
      )}

      {view === 'history' && (
        <div className="space-y-4">
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-700" />
            <div className="space-y-4">
              {incidents.map((inc, i) => (
                <div key={i} className="flex gap-4 relative">
                  <div className="w-12 h-12 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center flex-shrink-0 z-10">
                    <span className="text-xl">{inc.icon}</span>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-4 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-bold">{inc.year}</span>
                      <span className="text-red-400 text-xs font-semibold">{inc.objects}</span>
                    </div>
                    <div className="text-white font-semibold text-sm mb-1">{inc.event}</div>
                    <p className="text-gray-400 text-sm">{inc.consequence}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'mitigation' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-gray-800/60 rounded-xl p-4">Active debris removal is essential — passive measures (25-year deorbit rule) cannot solve the legacy problem. ESA has declared debris removal a priority. The economic case: losing GPS alone would cost $1 trillion/year to the global economy.</p>
          <div className="space-y-4">
            {mitigationMethods.map(m => (
              <div key={m.name} className="bg-gray-800/60 rounded-xl p-5 border-l-4" style={{ borderColor: m.color }}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-white font-bold">{m.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full font-mono">{m.trl}</span>
                </div>
                <p className="text-gray-300 text-sm mb-3">{m.concept}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div className="bg-green-900/20 rounded p-2 border border-green-800/30">
                    <div className="text-green-400 text-xs uppercase mb-1">Advantages</div>
                    {m.pros.map(p => <div key={p} className="text-gray-300 text-xs">• {p}</div>)}
                  </div>
                  <div className="bg-red-900/20 rounded p-2 border border-red-800/30">
                    <div className="text-red-400 text-xs uppercase mb-1">Challenges</div>
                    {m.cons.map(c => <div key={c} className="text-gray-300 text-xs">• {c}</div>)}
                  </div>
                </div>
                <div className="text-gray-500 text-xs">Example: {m.example}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
