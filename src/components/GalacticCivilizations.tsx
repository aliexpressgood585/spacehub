import { useState } from 'react'

interface Civilization {
  type: string
  level: string
  energyOutput: string
  energySource: string
  description: string
  earthProgress: string
  example: string
  timeToAchieve: string
  color: string
  icon: string
}

interface FermiSolution {
  name: string
  probability: string
  description: string
  implication: string
  evidence: string
  scary: boolean
  color: string
}

interface SETIProject {
  name: string
  period: string
  method: string
  coverage: string
  result: string
  status: string
}

const civilizations: Civilization[] = [
  {
    type: 'Type I — Planetary',
    level: 'Kardashev I',
    energyOutput: '~4×10¹⁶ W (10¹⁶ W)',
    energySource: 'Full planetary energy budget (all sunlight, wind, geothermal)',
    description: 'Masters all energy available on their home planet. Controls weather, earthquakes, volcanoes. Earth is currently at ~0.73 on the scale.',
    earthProgress: '~72.6% (Michio Kaku estimate)',
    example: 'None known. Earth in ~100–200 years at current growth rate.',
    timeToAchieve: '~100–200 years from now (for Earth)',
    color: '#22c55e',
    icon: '🌍'
  },
  {
    type: 'Type II — Stellar',
    level: 'Kardashev II',
    energyOutput: '~4×10²⁶ W (full solar output)',
    energySource: 'Complete stellar energy (Dyson sphere / swarm around home star)',
    description: 'Harnesses the entire energy output of their home star. Can build megastructures, colonize entire solar systems, potentially affect stellar evolution.',
    earthProgress: '<0.001%',
    example: 'Possibly Boyajian\'s Star (KIC 8462852) — unexplained dimming (likely natural)',
    timeToAchieve: '~1,000–10,000 years from now (speculative)',
    color: '#f59e0b',
    icon: '⭐'
  },
  {
    type: 'Type III — Galactic',
    level: 'Kardashev III',
    energyOutput: '~4×10³⁷ W (full galaxy)',
    energySource: 'Entire galaxy — 10²²+ stars, black holes, galactic core',
    description: 'Controls the energy of an entire galaxy. Can re-engineer galaxies, manipulate spacetime, potentially control black holes as energy sources.',
    earthProgress: '<10⁻¹⁸%',
    example: 'None confirmed; some anomalous galaxies studied but naturally explained',
    timeToAchieve: 'Millions of years (speculative)',
    color: '#a78bfa',
    icon: '🌌'
  },
  {
    type: 'Type IV — Cosmic',
    level: 'Kardashev IV (extended)',
    energyOutput: '~10⁴⁵ W (observable universe)',
    energySource: 'Entire universe — dark energy, vacuum energy, all galaxies',
    description: 'Harnesses the energy of the entire observable universe. Purely theoretical — may be able to manipulate physics itself, create new universes.',
    earthProgress: 'Essentially zero',
    example: 'N/A — theoretical construct',
    timeToAchieve: 'Billions of years or impossible',
    color: '#ec4899',
    icon: '🔮'
  },
]

const fermiSolutions: FermiSolution[] = [
  {
    name: 'The Great Filter (Behind Us)',
    probability: '~15% (optimistic)',
    description: 'The hardest step in life\'s development (abiogenesis? eukaryotes? multicellularity? intelligence?) is already behind us. We\'re rare survivors.',
    implication: 'We are probably alone or nearly alone in the galaxy. Extremely comforting if true.',
    evidence: 'The Cambrian explosion\'s rarity, the extreme improbability of abiogenesis, the uniqueness of eukaryotic endosymbiosis.',
    scary: false,
    color: '#22c55e'
  },
  {
    name: 'The Great Filter (Ahead)',
    probability: '~25% (terrifying)',
    description: 'Life is common, intelligence is common, but something kills advanced civilizations before they become interstellar. Something we haven\'t hit yet.',
    implication: 'We are doomed. If we find complex life elsewhere, it\'s very bad news — filter must be ahead.',
    evidence: 'No signals, no Dyson spheres, no megastructures despite galaxy being 10B years old. If life is common, where is it?',
    scary: true,
    color: '#ef4444'
  },
  {
    name: 'The Zoo Hypothesis',
    probability: '~10%',
    description: 'Advanced civilizations deliberately avoid contacting us — either for our protection or to observe us naturally, as we observe animals in nature.',
    implication: 'We are young, being watched. When we reach sufficient development, first contact may occur.',
    evidence: 'No contact would look exactly the same whether we\'re alone or watched. Non-falsifiable.',
    scary: false,
    color: '#60a5fa'
  },
  {
    name: 'Rare Earth Hypothesis',
    probability: '~20%',
    description: 'Earth\'s conditions are extraordinarily rare: galactic habitable zone, Jupiter shield, Moon stabilizer, plate tectonics, magnetic field, large ocean — all required together.',
    implication: 'Complex life is extremely rare despite life itself being common. We might be 1 in 10^22 Earth-equivalent planets.',
    evidence: 'Ward & Brownlee (2000). The specific combination of factors for complex animal life may be very uncommon.',
    scary: false,
    color: '#34d399'
  },
  {
    name: 'They Are Here Already',
    probability: '~1%',
    description: 'Advanced civilizations are already here, in the form of probes, or they have already colonized but we cannot recognize them. The "dark forest" variant says they stay hidden.',
    implication: 'We may already be in contact with engineered objects (Von Neumann probes, \'Oumuamua?). Verification essentially impossible.',
    evidence: '\'Oumuamua\'s anomalous acceleration (natural explanation: N₂ fragment). UAP data (no confirmed ETI). Entirely speculative.',
    scary: false,
    color: '#f97316'
  },
  {
    name: 'Dark Forest Theory',
    probability: '~5%',
    description: 'The universe is a dark forest where every civilization hides to avoid being destroyed by others. Any civilization that reveals itself is eliminated.',
    implication: 'Sending signals into space (like METI projects) may be an existential risk. We should be quiet.',
    evidence: 'Liu Cixin\'s logical extension of game theory to cosmic scales. No empirical evidence either way.',
    scary: true,
    color: '#475569'
  },
  {
    name: 'Simulation Hypothesis',
    probability: '~5%',
    description: 'We live in a computer simulation. Intelligent civilizations reach a point where they simulate many ancestor civilizations — we are in one of them.',
    implication: 'The "filter" is hitting simulation resource limits. Or simulators have the game set to single-player mode.',
    evidence: 'Nick Bostrom\'s trilemma (2003). No empirical evidence; philosophical argument only. Quantum mechanics\' discrete/probabilistic nature cited.',
    scary: false,
    color: '#8b5cf6'
  },
  {
    name: 'Communication Gap',
    probability: '~19%',
    description: 'Civilizations exist but we\'re not listening right, communicating right, or detecting right. They may use quantum communication, neutrinos, or modes we haven\'t imagined.',
    implication: 'We should diversify SETI approaches. Radio is 20th century tech — an advanced civ might use lasers, quantum channels, or gravitational waves.',
    evidence: 'We\'ve scanned very little of the galaxy in a narrow frequency band. The search space is enormous and incompletely covered.',
    scary: false,
    color: '#0ea5e9'
  },
]

const setiProjects: SETIProject[] = [
  { name: 'Project Ozma', period: '1960', method: 'Radio (1.42 GHz hydrogen line)', coverage: '2 stars (Tau Ceti, Epsilon Eridani)', result: 'No signal', status: 'Completed' },
  { name: 'WOW! Signal search', period: '1977–present', method: 'Radio (Big Ear → Argus → Allen Array)', coverage: 'Northern sky survey', result: 'WOW! (1977) never repeated', status: 'Ongoing' },
  { name: 'Allen Telescope Array', period: '2007–present', method: 'Radio (1–10 GHz), AI-assisted classification', coverage: 'Kepler/TESS targets + full sky', result: 'No confirmed ETI', status: 'Active' },
  { name: 'Breakthrough Listen', period: '2016–present', method: 'Radio + optical laser, Parkes + GBT + MeerKAT', coverage: '1M stars, 100 galaxies', result: 'No confirmed ETI; published all data', status: 'Active (100-year funding)' },
  { name: 'FAST (China)', period: '2016–present', method: 'Radio (70 MHz–3 GHz), world\'s largest dish', coverage: 'Deep sky + exoplanet targets', result: 'Detects FRBs; SETI program active 2021', status: 'Active' },
  { name: 'Optical SETI (OSETI)', period: '2001–present', method: 'Laser pulse detection (nanosecond timescale)', coverage: 'Nearby stars, Kepler targets', result: 'No confirmed ETI signals', status: 'Active' },
]

type TabId = 'scale' | 'fermi' | 'seti'

export default function GalacticCivilizations() {
  const [tab, setTab] = useState<TabId>('scale')
  const [selected, setSelected] = useState(civilizations[0])
  const [fermiSelected, setFermiSelected] = useState(fermiSolutions[0])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'scale', label: 'Kardashev Scale' },
    { id: 'fermi', label: 'Fermi Paradox' },
    { id: 'seti', label: 'SETI Projects' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Galactic Civilizations</h2>
      <p className="text-gray-400 text-sm mb-5">The Kardashev scale, Fermi paradox, and the search for intelligent life — are we alone?</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'scale' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {civilizations.map(c => (
              <button key={c.type} onClick={() => setSelected(c)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.type === c.type ? 'border' : 'bg-gray-800/50 hover:bg-gray-700/50'}`} style={selected.type === c.type ? { borderColor: c.color, backgroundColor: c.color + '15' } : {}}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{c.icon}</span>
                  <div>
                    <div className="text-white text-sm font-bold">{c.level}</div>
                    <div className="text-xs" style={{ color: c.color }}>{c.type.split('—')[1]?.trim()}</div>
                  </div>
                </div>
                <div className="text-gray-500 text-xs mt-1">{c.energyOutput}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-5xl">{selected.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.type}</h3>
                  <div className="font-mono text-sm" style={{ color: selected.color }}>{selected.energyOutput}</div>
                </div>
              </div>

              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Energy Source</div>
                  <div className="text-gray-300 text-sm">{selected.energySource}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Earth Progress</div>
                  <div className="text-white font-bold font-mono">{selected.earthProgress}</div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                    <div className="h-2 rounded-full transition-all" style={{ width: selected.earthProgress.startsWith('<') ? '0.1%' : selected.earthProgress.replace('%', ''), backgroundColor: selected.color }} />
                  </div>
                </div>
                <div className="bg-purple-900/20 rounded p-3 border border-purple-800/30">
                  <div className="text-purple-400 text-xs uppercase mb-1">Known Example</div>
                  <div className="text-gray-300 text-sm">{selected.example}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Time to Achieve</div>
                  <div className="text-gray-300 text-sm">{selected.timeToAchieve}</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Current Earth Position</div>
              <div className="relative h-8 bg-gray-700 rounded-full overflow-hidden">
                <div className="absolute h-full bg-gradient-to-r from-green-600 to-yellow-500 rounded-full" style={{ width: '72.6%' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-xs font-bold drop-shadow">Earth: 0.726 (Kardashev scale)</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>Type 0</span><span>Type I</span><span>Type II</span><span>Type III</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'fermi' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="text-gray-500 text-xs uppercase font-semibold px-1 mb-2">Proposed Solutions</div>
            {fermiSolutions.map(s => (
              <button key={s.name} onClick={() => setFermiSelected(s)} className={`w-full text-left p-3 rounded-lg transition-colors ${fermiSelected.name === s.name ? 'border' : 'bg-gray-800/50 hover:bg-gray-700/50'}`} style={fermiSelected.name === s.name ? { borderColor: s.color, backgroundColor: s.color + '15' } : {}}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-white text-xs font-semibold">{s.name}</div>
                  {s.scary && <span className="text-xs px-1.5 py-0.5 bg-red-900/40 text-red-400 rounded">⚠ Scary</span>}
                </div>
                <div className="text-xs" style={{ color: s.color }}>P ≈ {s.probability}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-xl font-bold text-white">{fermiSelected.name}</h3>
                {fermiSelected.scary && <span className="text-xs px-2 py-1 bg-red-900/40 text-red-400 rounded-full font-bold">TERRIFYING IF TRUE</span>}
              </div>
              <div className="text-purple-400 text-sm mb-4">Estimated probability: {fermiSelected.probability}</div>

              <div className="space-y-3">
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Theory</div>
                  <p className="text-gray-300 text-sm">{fermiSelected.description}</p>
                </div>
                <div className={`rounded p-3 border ${fermiSelected.scary ? 'bg-red-900/20 border-red-800/30' : 'bg-green-900/20 border-green-800/30'}`}>
                  <div className={`text-xs uppercase mb-1 ${fermiSelected.scary ? 'text-red-400' : 'text-green-400'}`}>Implication</div>
                  <p className="text-gray-300 text-sm">{fermiSelected.implication}</p>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Evidence / Support</div>
                  <p className="text-gray-300 text-sm">{fermiSelected.evidence}</p>
                </div>
              </div>
            </div>

            <div className="bg-purple-900/20 rounded-xl p-4 border border-purple-800/40">
              <h4 className="text-white font-bold text-sm mb-2">The Fermi Paradox</h4>
              <p className="text-gray-300 text-sm">Enrico Fermi asked in 1950: "Where is everybody?" Given the age of the universe (13.8 Gyr), the Milky Way's age (~10 Gyr), and the billions of potentially habitable planets, even a single civilization expanding at 1% the speed of light should have colonized the entire galaxy in ~10 million years. Yet we see no evidence of any other civilization. This is the Fermi Paradox.</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'seti' && (
        <div className="space-y-4">
          <div className="bg-purple-900/20 rounded-xl p-4 border border-purple-800/40">
            <p className="text-gray-300 text-sm">SETI (Search for Extraterrestrial Intelligence) began formally in 1960. After 60+ years, no confirmed signal has been found — but we've barely begun to search. The full radio sky in all directions, across all frequencies, at all timescales, represents a search space many orders of magnitude larger than what has been covered.</p>
          </div>
          <div className="space-y-3">
            {setiProjects.map(p => (
              <div key={p.name} className="bg-gray-800/60 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-white font-bold">{p.name}</h4>
                    <div className="text-gray-500 text-xs">{p.period}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status.includes('Active') ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}>{p.status.includes('Active') ? '● Active' : '✓ Completed'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500">Method: </span><span className="text-gray-300">{p.method}</span></div>
                  <div><span className="text-gray-500">Coverage: </span><span className="text-gray-300">{p.coverage}</span></div>
                  <div><span className="text-gray-500">Result: </span><span className={p.result.includes('No confirmed') ? 'text-gray-400' : 'text-yellow-400'}>{p.result}</span></div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4">
            <h4 className="text-white font-bold text-sm mb-3">How Much Have We Actually Searched?</h4>
            <div className="text-gray-300 text-sm space-y-2">
              <p>A common analogy: we've searched the equivalent of a glass of water out of all Earth's oceans. The parameter space (stars × frequency bands × signal types × time) is effectively infinite.</p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-yellow-400 font-bold">~1,000 stars</div>
                  <div className="text-gray-400 text-xs">Carefully targeted by radio SETI (full analysis)</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-400 font-bold">~300 billion</div>
                  <div className="text-gray-400 text-xs">Estimated stars in the Milky Way galaxy</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
