import { useState } from 'react'

interface MultiverseType {
  name: string
  level: string
  description: string
  basis: string
  testable: boolean
  keyProponent: string
  implication: string
  icon: string
  color: string
}

interface InflationFeature {
  feature: string
  description: string
  evidence: string
}

interface StringLandscape {
  number: string
  description: string
  implication: string
}

const multiverseTypes: MultiverseType[] = [
  {
    name: 'Level I: Infinite Space',
    level: 'Level I',
    description: 'If space is infinite (or large enough), every possible configuration of matter must repeat infinitely. An identical Earth exists ~10^(10^29) meters away.',
    basis: 'Inflationary cosmology + infinite spatial extent + quantum mechanics',
    testable: false,
    keyProponent: 'Max Tegmark',
    implication: 'Every possible history of you is happening somewhere right now.',
    icon: '🌌',
    color: '#60a5fa'
  },
  {
    name: 'Level II: Bubble Universes',
    level: 'Level II',
    description: 'Eternal inflation produces an infinite number of "bubble" universes, each with different physical constants, particle types, and fundamental laws from quantum fluctuations.',
    basis: 'Eternal inflation (Linde) + Inflationary landscape theory',
    testable: false,
    keyProponent: 'Andrei Linde, Alan Guth',
    implication: 'Other bubble universes may have no atoms, no stars, or completely different physics.',
    icon: '💫',
    color: '#a78bfa'
  },
  {
    name: 'Level III: Many-Worlds',
    level: 'Level III',
    description: 'Quantum mechanics without wavefunction collapse: every quantum event spawns a new branch. Every possibility actually occurs in a superposition of parallel worlds.',
    basis: 'Everett\'s many-worlds interpretation (1957) of quantum mechanics',
    testable: false,
    keyProponent: 'Hugh Everett III, David Deutsch',
    implication: 'There is a branch where every quantum coin flip went the other way.',
    icon: '⚛️',
    color: '#34d399'
  },
  {
    name: 'Level IV: Mathematical Multiverse',
    level: 'Level IV',
    description: 'All mathematically consistent structures exist physically. Our universe is just one particular mathematical structure. Tegmark\'s "Mathematical Universe Hypothesis."',
    basis: 'Philosophy of mathematics applied to physics',
    testable: false,
    keyProponent: 'Max Tegmark',
    implication: 'There exist universes with different dimensions, different logic, different types of infinity.',
    icon: '🔢',
    color: '#f9a8d4'
  },
  {
    name: 'String Theory Landscape',
    level: 'Level II (variant)',
    description: 'String theory permits ~10^500 different vacuum states, each corresponding to a different universe with different low-energy physics and fundamental constants.',
    basis: 'String/M-theory flux compactifications',
    testable: false,
    keyProponent: 'Leonard Susskind, Joseph Polchinski',
    implication: 'The fine-tuning of physical constants (cosmological constant, Higgs mass) is explained by anthropic selection across the landscape.',
    icon: '🧵',
    color: '#fb923c'
  },
]

const inflationFeatures: InflationFeature[] = [
  { feature: 'Flatness', description: 'Inflation solves the flatness problem — why is the universe so geometrically flat (Ω=1)? Rapid expansion flattens any initial curvature exponentially.', evidence: 'CMB measurements show Ω = 1.000 ± 0.002' },
  { feature: 'Horizon', description: 'Why is the CMB so uniform to 1 in 100,000 across regions never in causal contact? Inflation stretches a single causally connected region to the observable universe.', evidence: 'CMB temperature uniformity 2.725 K ± 0.00003 K across sky' },
  { feature: 'Monopole', description: 'Grand Unified Theories predict magnetic monopoles should be abundant. Inflation dilutes them to undetectable densities — we\'ve never found one.', evidence: 'Zero monopole detections despite extensive searches' },
  { feature: 'Structure', description: 'Quantum fluctuations during inflation are stretched to macroscopic scales, seeding density variations that grow into galaxies and large-scale structure.', evidence: 'CMB power spectrum matches ΛCDM predictions' },
  { feature: 'Eternal Inflation', description: 'Once started, inflation may be eternal — new bubble universes constantly nucleating. Our Big Bang was just one local end of inflation in a much larger eternal inflationary space.', evidence: 'Theoretical — derived from slow-roll inflation models' },
]

const landscape: StringLandscape[] = [
  { number: '10^500', description: 'Number of distinct vacuum states in the string landscape — each a different possible universe', implication: 'The cosmological constant problem is explained: we live in a rare bubble with Λ small enough for structure' },
  { number: '26', description: 'Number of spatial dimensions in bosonic string theory before compactification', implication: '22 dimensions are compactified at the Planck scale — invisible to our physics' },
  { number: '11', description: 'Dimensions in M-theory (10 spatial + 1 time)', implication: 'All five string theories are limits of one underlying 11D theory' },
  { number: '~10^-122', description: 'Value of cosmological constant in Planck units (measured)', implication: 'Most finely tuned number in physics — anthropic landscape provides the only known explanation' },
]

type Tab = 'types' | 'inflation' | 'strings'

export default function MultiverseTheory() {
  const [tab, setTab] = useState<Tab>('types')
  const [selected, setSelected] = useState<MultiverseType>(multiverseTypes[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'types', label: 'Multiverse Types' },
    { id: 'inflation', label: 'Inflation & Origins' },
    { id: 'strings', label: 'String Landscape' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Multiverse Theory</h2>
      <p className="text-gray-400 text-sm mb-5">Beyond the observable universe — theoretical frameworks for parallel realities</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'types' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {multiverseTypes.map(m => (
              <button key={m.name} onClick={() => setSelected(m)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === m.name ? 'bg-violet-900/40 border border-violet-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{m.icon}</span>
                  <span className="font-semibold text-white text-sm leading-snug">{m.level}</span>
                </div>
                <div className="text-gray-400 text-xs leading-snug">{m.name.split(': ')[1]}</div>
                <div className={`text-xs mt-1 ${m.testable ? 'text-green-400' : 'text-red-400'}`}>{m.testable ? 'Testable' : 'Not testable'}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-gray-800/60 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{selected.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <div className="text-gray-400 text-sm">{selected.keyProponent}</div>
              </div>
            </div>
            <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
            <div className="space-y-3">
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs font-semibold uppercase mb-1">Physical Basis</div>
                <p className="text-gray-300 text-sm">{selected.basis}</p>
              </div>
              <div className="bg-violet-900/20 rounded p-3 border border-violet-800/30">
                <div className="text-violet-400 text-xs font-semibold uppercase mb-1">Key Implication</div>
                <p className="text-gray-300 text-sm">{selected.implication}</p>
              </div>
              <div className={`rounded p-2 text-center text-sm font-medium ${selected.testable ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {selected.testable ? '✓ May be observationally testable' : '✗ Not directly testable — philosophical / mathematical status debated'}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'inflation' && (
        <div className="space-y-4">
          <div className="bg-violet-900/20 rounded-lg p-4 border border-violet-800/40">
            <h3 className="text-white font-bold mb-2">Cosmic Inflation (10⁻³⁶ – 10⁻³² seconds)</h3>
            <p className="text-gray-300 text-sm">Proposed by Alan Guth in 1981: the very early universe underwent exponential expansion, doubling in size ~60–80 times in ~10⁻³² seconds. The universe expanded by a factor of at least 10²⁶. This solves major cosmological puzzles and naturally generates the conditions for a Level II multiverse through eternal inflation.</p>
          </div>
          <div className="space-y-3">
            {inflationFeatures.map(f => (
              <div key={f.feature} className="bg-gray-800/60 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-white font-bold">{f.feature} Problem Solved</h4>
                </div>
                <p className="text-gray-300 text-sm mb-2">{f.description}</p>
                <div className="bg-green-900/20 rounded p-2 border border-green-800/30">
                  <span className="text-green-400 text-xs">Evidence: </span>
                  <span className="text-gray-300 text-sm">{f.evidence}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'strings' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-violet-900/20 rounded-lg p-4 border border-violet-800/40">
            String theory replaces point particles with 1-dimensional strings vibrating at different frequencies. Different vibration modes correspond to different particles. The theory requires extra dimensions compactified at the Planck scale (~10⁻³⁵ m). Different ways to compact these dimensions give different physics — the "landscape."
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {landscape.map(l => (
              <div key={l.number} className="bg-gray-800/60 rounded-lg p-4">
                <div className="text-3xl font-bold text-violet-300 mb-2 font-mono">{l.number}</div>
                <p className="text-white font-medium text-sm mb-2">{l.description}</p>
                <p className="text-gray-400 text-sm">{l.implication}</p>
              </div>
            ))}
          </div>
          <div className="bg-gray-800/60 rounded-lg p-4">
            <h4 className="text-white font-bold mb-3">The Anthropic Principle</h4>
            <p className="text-gray-300 text-sm mb-2">The fine-tuning of physical constants (e.g., cosmological constant is 10¹²² times smaller than quantum field theory predicts) is explained if there are enough universes: observers will only find themselves in universes compatible with complex structures and life.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-green-900/20 rounded p-2 border border-green-800/30">
                <div className="text-green-400 text-xs font-semibold">Weak Anthropic Principle</div>
                <p className="text-gray-400 text-xs mt-1">We must observe conditions compatible with our existence. Trivially true.</p>
              </div>
              <div className="bg-orange-900/20 rounded p-2 border border-orange-800/30">
                <div className="text-orange-400 text-xs font-semibold">Strong Anthropic Principle</div>
                <p className="text-gray-400 text-xs mt-1">The universe must have properties that allow observers to arise. More controversial.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
