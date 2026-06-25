import { useState } from 'react'

interface Asteroid {
  name: string
  type: string
  diameter: string
  composition: string
  estimatedValue: string
  valuePer100m: string
  nearEarth: boolean
  distance: string
  description: string
  resources: { name: string; pct: string; use: string }[]
  color: string
  icon: string
}

interface MiningMethod {
  name: string
  status: string
  description: string
  pros: string[]
  cons: string[]
  example: string
  icon: string
}

interface Company {
  name: string
  country: string
  status: string
  target: string
  approach: string
  founded: string
  notes: string
}

const asteroids: Asteroid[] = [
  {
    name: '16 Psyche',
    type: 'M-type (metallic)',
    diameter: '279 km',
    composition: 'Mostly iron-nickel with minor amounts of gold, platinum, copper',
    estimatedValue: '$10,000,000,000,000,000 (10 quintillion USD)',
    valuePer100m: '>$1 trillion per 100m³',
    nearEarth: false,
    distance: '3.3 AU (main belt)',
    description: 'The most valuable known asteroid — possibly the exposed core of a protoplanet that lost its rocky mantle through ancient collisions. NASA\'s Psyche mission launched Oct 2023 to study it.',
    resources: [
      { name: 'Iron', pct: '~94%', use: 'Construction, manufacturing' },
      { name: 'Nickel', pct: '~5%', use: 'Alloys, batteries' },
      { name: 'Gold/Platinum', pct: '<1%', use: 'Electronics, catalysts' },
    ],
    color: '#94a3b8',
    icon: '⚙️'
  },
  {
    name: '433 Eros',
    type: 'S-type (silicaceous)',
    diameter: '34 km',
    composition: 'Silicates, olivine, pyroxene, trace metals',
    estimatedValue: '~$11,760 billion USD (precious metals only)',
    valuePer100m: '~$50 billion per 100m³',
    nearEarth: true,
    distance: '1.13–1.78 AU (NEO)',
    description: 'First asteroid orbited and landed on by a spacecraft (NEAR Shoemaker, 2000). A near-Earth object making it accessible. Contains gold, platinum, and rare earth elements.',
    resources: [
      { name: 'Silicates', pct: '~85%', use: 'Building material, ISRU' },
      { name: 'Iron/Nickel', pct: '~10%', use: 'Structural metal' },
      { name: 'Platinum group', pct: '~0.5%', use: 'Catalytic converters, fuel cells' },
    ],
    color: '#d97706',
    icon: '🪨'
  },
  {
    name: '1986 DA',
    type: 'M-type (metallic)',
    diameter: '2.3 km',
    composition: '86% iron/nickel, 6% cobalt, platinum-group metals',
    estimatedValue: '~$13.6 trillion USD',
    valuePer100m: '~$500 billion per 100m³',
    nearEarth: true,
    distance: 'Apollo-type NEO (0.8–2.8 AU)',
    description: 'One of the highest-value near-Earth asteroids by estimated worth. Small enough to potentially be accessible with current launch technology.',
    resources: [
      { name: 'Iron', pct: '~78%', use: 'Steel production' },
      { name: 'Nickel', pct: '~8%', use: 'Alloys' },
      { name: 'Cobalt', pct: '~6%', use: 'Batteries, aerospace alloys' },
      { name: 'Platinum group', pct: '~0.5%', use: 'Electronics' },
    ],
    color: '#64748b',
    icon: '🌑'
  },
  {
    name: '3554 Amun',
    type: 'M-type (metallic)',
    diameter: '2.5 km',
    composition: 'Iron, nickel, cobalt, platinum-group metals',
    estimatedValue: '~$20 trillion USD',
    valuePer100m: '~$600 billion per 100m³',
    nearEarth: true,
    distance: 'Aten-type NEO (crosses Earth orbit)',
    description: 'One of the most valuable near-Earth asteroids per unit mass. Aten-class orbit makes it accessible with low delta-V mission profiles.',
    resources: [
      { name: 'Iron/Nickel', pct: '~88%', use: 'Industrial metals' },
      { name: 'Cobalt', pct: '~5%', use: 'Battery cathodes' },
      { name: 'PGMs', pct: '~0.5%', use: 'Hydrogen fuel cells' },
    ],
    color: '#475569',
    icon: '💎'
  },
]

const miningMethods: MiningMethod[] = [
  {
    name: 'Surface Mining (Regolith)',
    status: 'Near-term feasible',
    description: 'Scooping or vacuum-extracting loose surface regolith. Water ice and volatiles extracted by solar heating. Most feasible for near-term robotic missions.',
    pros: ['Low technology readiness needed', 'Robotic systems straightforward', 'Already demonstrated (Hayabusa2, OSIRIS-REx)'],
    cons: ['Low gravity makes anchoring difficult', 'Dust contamination', 'Limited to surface material'],
    example: 'OSIRIS-REx collected 121g from Bennu (2020)',
    icon: '🏗️'
  },
  {
    name: 'In-Situ Resource Utilization (ISRU)',
    status: 'Active development',
    description: 'Processing asteroid material directly in space. Water ice → propellant (H₂+O₂) via electrolysis. Metals 3D-printed into structures. Reduces Earth launch costs.',
    pros: ['Reduces cargo from Earth', 'Enables refueling depots', 'Closes the economics'],
    cons: ['Energy-intensive', 'Complex autonomous systems', 'Mass processing infrastructure'],
    example: 'NASA MOXIE on Perseverance: O₂ from CO₂ (Mars proof of concept)',
    icon: '⚗️'
  },
  {
    name: 'Magnetic Raking',
    status: 'Conceptual',
    description: 'Using powerful electromagnets to collect metallic particles from M-type asteroids. Particularly suited for iron-nickel rich metallic asteroids.',
    pros: ['Non-contact extraction', 'Can target metal-rich particles', 'Minimal drilling needed'],
    cons: ['Only for metallic/magnetic materials', 'Unproven at scale', 'Power requirements high'],
    example: 'Proposed for M-type asteroids like 16 Psyche',
    icon: '🧲'
  },
  {
    name: 'Shaft Mining / Boring',
    status: 'Long-term',
    description: 'Drilling shafts into asteroid interior. Higher material concentrations than surface. Allows access to pristine mineral veins.',
    pros: ['Access to concentrated ore', 'Anchoring easier once established', 'Can exploit void spaces (rubble pile structure)'],
    cons: ['Challenging anchoring in micro-gravity', 'Heat dissipation in vacuum', 'Complex remote operations'],
    example: 'Envisioned for large M-type or S-type bodies',
    icon: '⛏️'
  },
]

const companies: Company[] = [
  { name: 'Planetary Resources (acquired)', country: 'USA', status: 'Defunct (2018)', target: 'Near-Earth asteroids', approach: 'Prospector spacecraft + water extraction', founded: '2012', notes: 'Acquired by ConsenSys Space. First serious commercial asteroid mining company. Built Arkyd spacecraft line.' },
  { name: 'Deep Space Industries (acquired)', country: 'USA', status: 'Acquired by Bradford Space (2019)', target: 'NEOs under 100m diameter', approach: 'Small prospector fleet + in-space manufacturing', founded: '2013', notes: 'Contributed to rendezvous/proximity ops technology. Patents held by Bradford Space.' },
  { name: 'AstroForge', country: 'USA', status: 'Active (funded)', target: 'Near-Earth metallic asteroids', approach: 'Refinery in space — process ore, return refined metal only', founded: '2022', notes: 'Launched Brokkr-1 testbed on SpaceX Transporter-7 (Apr 2023). Raised $55M Series B 2024.' },
  { name: 'TransAstra', country: 'USA', status: 'Active (R&D)', target: 'Water-rich NEOs', approach: 'Optical Mining™ — focused sunlight vaporizes volatiles from asteroid interior', founded: '2015', notes: 'NASA contracts for Optical Mining and Worker Bee spacecraft. Focus on propellant economy.' },
  { name: 'ispace (JAXA spin-off)', country: 'Japan', status: 'Active — Moon focus', target: 'Lunar regolith → NEO', approach: 'Lunar ISRU first, asteroid mining later', founded: '2010', notes: 'Moon lander missions (M1 Apr 2023). Expanding to asteroid resources long-term.' },
]

export default function AsteroidMining() {
  const [selected, setSelected] = useState<Asteroid>(asteroids[0])
  const [view, setView] = useState<'targets' | 'methods' | 'industry'>('targets')

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Asteroid Mining</h2>
      <p className="text-gray-400 text-sm mb-5">The multi-trillion dollar frontier industry — resources from space to fuel civilization</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[{ id: 'targets', l: 'Target Asteroids' }, { id: 'methods', l: 'Mining Methods' }, { id: 'industry', l: 'Companies' }].map(t => (
          <button key={t.id} onClick={() => setView(t.id as typeof view)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === t.id ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.l}</button>
        ))}
      </div>

      {view === 'targets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {asteroids.map(a => (
              <button key={a.name} onClick={() => setSelected(a)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === a.name ? 'bg-amber-900/40 border border-amber-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{a.icon}</span>
                  <div>
                    <div className="text-white text-sm font-semibold">{a.name}</div>
                    <div className="text-gray-500 text-xs">{a.type}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.nearEarth && <span className="text-xs px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded">NEO</span>}
                  <span className="text-xs text-amber-400 font-mono">{a.estimatedValue.split(' ')[0]}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-5xl">{selected.icon}</span>
                <div>
                  <h3 className="text-2xl font-bold text-white">{selected.name}</h3>
                  <div className="text-amber-400 text-sm">{selected.type} • {selected.diameter}</div>
                  {selected.nearEarth && <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full">Near-Earth Object</span>}
                </div>
              </div>

              <div className="bg-amber-900/20 rounded-lg p-4 border border-amber-800/40 mb-4">
                <div className="text-amber-400 text-xs uppercase font-semibold mb-1">Estimated Economic Value</div>
                <div className="text-3xl font-bold font-mono text-white">{selected.estimatedValue.split(' ')[0]}</div>
                <div className="text-gray-400 text-sm">{selected.estimatedValue}</div>
                <div className="text-gray-500 text-xs mt-1">Density basis: {selected.valuePer100m}</div>
              </div>

              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>

              <div className="bg-gray-900/50 rounded-lg p-3 mb-4">
                <div className="text-gray-500 text-xs uppercase mb-2">Composition</div>
                <div className="space-y-2">
                  {selected.resources.map(r => (
                    <div key={r.name} className="flex items-center gap-3">
                      <div className="text-white text-sm w-24">{r.name}</div>
                      <div className="text-amber-400 font-mono text-sm w-12">{r.pct}</div>
                      <div className="text-gray-500 text-xs">{r.use}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase">Distance</div>
                  <div className="text-white text-sm">{selected.distance}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase">Composition</div>
                  <div className="text-white text-sm">{selected.composition.split(',')[0]}</div>
                </div>
              </div>
            </div>

            <div className="bg-amber-900/10 rounded-xl p-4 border border-amber-800/30">
              <h4 className="text-white font-bold text-sm mb-2">Market Context</h4>
              <p className="text-gray-400 text-sm">Bringing asteroid-mined metals to Earth would collapse commodity prices — 16 Psyche alone contains enough iron to supply Earth for millions of years. The real value is <strong className="text-white">in-space manufacturing</strong>: metals used in orbital construction, space stations, and propellant (water ice → H₂+O₂) to reduce Earth launch costs.</p>
            </div>
          </div>
        </div>
      )}

      {view === 'methods' && (
        <div className="space-y-4">
          {miningMethods.map(m => (
            <div key={m.name} className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl">{m.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-white font-bold">{m.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status.includes('feasible') || m.status.includes('Active') ? 'bg-green-900/40 text-green-400' : m.status.includes('Conceptual') ? 'bg-gray-700 text-gray-400' : 'bg-blue-900/40 text-blue-400'}`}>{m.status}</span>
                  </div>
                  <p className="text-gray-300 text-sm">{m.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="bg-green-900/20 rounded p-3 border border-green-800/30">
                  <div className="text-green-400 text-xs uppercase font-semibold mb-2">Advantages</div>
                  <ul className="space-y-1">
                    {m.pros.map(p => <li key={p} className="text-gray-300 text-xs">• {p}</li>)}
                  </ul>
                </div>
                <div className="bg-red-900/20 rounded p-3 border border-red-800/30">
                  <div className="text-red-400 text-xs uppercase font-semibold mb-2">Challenges</div>
                  <ul className="space-y-1">
                    {m.cons.map(c => <li key={c} className="text-gray-300 text-xs">• {c}</li>)}
                  </ul>
                </div>
              </div>
              <div className="bg-amber-900/20 rounded p-2 border border-amber-800/30">
                <span className="text-amber-400 text-xs font-semibold">Example: </span>
                <span className="text-gray-300 text-xs">{m.example}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'industry' && (
        <div className="space-y-4">
          <div className="bg-amber-900/20 rounded-xl p-4 border border-amber-800/40 text-sm text-gray-300">
            The asteroid mining industry is in its pre-commercial phase. Early pioneers raised hundreds of millions in VC funding but struggled with business models. The current wave focuses on robotic prospectors, propellant economics, and partnerships with NASA/ESA.
          </div>
          <div className="space-y-3">
            {companies.map(c => (
              <div key={c.name} className="bg-gray-800/60 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-white font-bold">{c.name}</h4>
                    <div className="text-gray-400 text-xs">{c.country} • Founded {c.founded}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status.includes('Active') ? 'bg-green-900/40 text-green-400' : c.status.includes('Defunct') ? 'bg-red-900/40 text-red-400' : 'bg-gray-700 text-gray-400'}`}>{c.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                  <div><span className="text-gray-500">Target: </span><span className="text-gray-300">{c.target}</span></div>
                  <div><span className="text-gray-500">Approach: </span><span className="text-gray-300">{c.approach}</span></div>
                </div>
                <p className="text-gray-400 text-xs">{c.notes}</p>
              </div>
            ))}
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4">
            <h4 className="text-white font-bold text-sm mb-3">Legal Framework</h4>
            <p className="text-gray-300 text-sm mb-3">The 1967 Outer Space Treaty prohibits national <em>sovereignty</em> over celestial bodies, but the 2015 US Commercial Space Launch Competitiveness Act (and similar laws in Luxembourg, UAE) allows companies to <strong>own resources</strong> extracted from asteroids. The distinction: you can mine it and keep it, but not claim the asteroid itself.</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-green-900/20 rounded p-2 border border-green-800/30">
                <div className="text-green-400 font-semibold">Allowed</div>
                <p className="text-gray-400 mt-1">Owning extracted materials (US law, Luxembourg law 2017)</p>
              </div>
              <div className="bg-red-900/20 rounded p-2 border border-red-800/30">
                <div className="text-red-400 font-semibold">Prohibited</div>
                <p className="text-gray-400 mt-1">National appropriation or sovereign claims on asteroids (OST Art. II)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
