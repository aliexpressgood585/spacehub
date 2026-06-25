import { useState, useEffect, useRef } from 'react'

interface QuantumEffect {
  name: string
  discoverer: string
  year: number
  description: string
  equation: string
  significance: string
  status: 'proven' | 'theoretical' | 'observed-indirect' | 'speculative'
  category: 'black-hole' | 'early-universe' | 'multiverse' | 'fundamental'
}

interface UniverseModel {
  name: string
  description: string
  prediction: string
  evidence: string
  probability: string
  icon: string
}

interface PlanckEra {
  epoch: string
  time: string
  temp: string
  energy: string
  event: string
  physics: string
}

const QUANTUM_EFFECTS: QuantumEffect[] = [
  {
    name: 'Hawking Radiation',
    discoverer: 'Stephen Hawking',
    year: 1974,
    description: 'Black holes are not truly black — they emit thermal radiation due to quantum effects near the event horizon. Virtual particle-antiparticle pairs form, one falls in, one escapes.',
    equation: 'T = ℏc³ / (8πGMk_B)',
    significance: 'Black holes slowly evaporate. Information paradox: what happens to info that falls in? Unresolved.',
    status: 'theoretical',
    category: 'black-hole',
  },
  {
    name: 'Quantum Tunneling in Stars',
    discoverer: 'Gamow / Atkinson & Houtermans',
    year: 1928,
    description: 'Stellar nuclear fusion should be impossible classically — protons don\'t have enough energy to overcome Coulomb repulsion. Quantum tunneling allows them to "pass through" the energy barrier.',
    equation: 'T ≈ e^(-2√(2mE)/ℏ × d)',
    significance: 'Without quantum tunneling, stars could not fuse hydrogen and the Sun would not shine.',
    status: 'proven',
    category: 'fundamental',
  },
  {
    name: 'Cosmic Inflation',
    discoverer: 'Alan Guth',
    year: 1980,
    description: 'The universe underwent exponential expansion (10^78 times in 10^-36 seconds) driven by a quantum vacuum energy field (inflaton). Explains flatness, horizon, and monopole problems.',
    equation: 'a(t) ∝ e^{Ht}',
    significance: 'Explains large-scale structure — quantum fluctuations during inflation seeded galaxy formation.',
    status: 'observed-indirect',
    category: 'early-universe',
  },
  {
    name: 'Vacuum Fluctuations / Dark Energy',
    discoverer: 'Pauli / Casimir (1948)',
    year: 1948,
    description: 'Quantum vacuum is not empty — virtual particles fluctuate in and out of existence. Casimir effect demonstrates this. Vacuum energy may be responsible for dark energy (cosmological constant).',
    equation: '⟨E⟩ = ½ℏω (zero-point energy)',
    significance: 'The cosmological constant problem: predicted vacuum energy is 10^120 times observed — biggest discrepancy in physics.',
    status: 'observed-indirect',
    category: 'fundamental',
  },
  {
    name: 'CMB Quantum Seeds',
    discoverer: 'Starobinsky, Mukhanov, Hawking',
    year: 1982,
    description: 'The tiny temperature fluctuations in the CMB (1 part in 100,000) originate from quantum vacuum fluctuations during inflation, stretched to cosmic scale.',
    equation: 'δT/T ≈ 10^-5',
    significance: 'Quantum mechanics explains the large-scale structure of the universe — galaxies grew from quantum seeds.',
    status: 'proven',
    category: 'early-universe',
  },
  {
    name: 'Eternal Inflation & Multiverse',
    discoverer: 'Vilenkin / Linde',
    year: 1983,
    description: 'If inflation is quantum, it never stops globally — other "pocket universes" continuously nucleate. Each may have different physical constants. The observable universe is one bubble.',
    equation: 'P(universe) ∝ e^{S}',
    significance: 'Potentially explains fine-tuned constants via anthropic selection. Cannot be directly tested.',
    status: 'speculative',
    category: 'multiverse',
  },
  {
    name: 'Quantum Gravity (Planck Scale)',
    discoverer: 'Planck (1899)',
    year: 1899,
    description: 'At the Planck scale (10^-35 m, 10^19 GeV), quantum effects and gravity cannot be separated. Current physics breaks down. String theory, LQG, and causal sets attempt to unify.',
    equation: 'l_P = √(ℏG/c³) ≈ 1.6 × 10^-35 m',
    significance: 'The fundamental limit of current physics. No confirmed quantum gravity theory exists.',
    status: 'theoretical',
    category: 'fundamental',
  },
  {
    name: 'Black Hole Information Paradox',
    discoverer: 'Hawking / Page / Susskind',
    year: 1976,
    description: 'If Hawking radiation is thermal, information about infalling matter is destroyed — violating quantum unitarity. Recent progress suggests information escapes in subtle correlations (Page curve).',
    equation: 'S_rad = S_BH (Page curve)',
    significance: 'Resolved (partially) in 2019 using holography + island formula. Deep connection between gravity and quantum info.',
    status: 'theoretical',
    category: 'black-hole',
  },
]

const UNIVERSE_MODELS: UniverseModel[] = [
  { name: 'Hot Big Bang', description: 'Standard model — universe began hot, dense, expanded and cooled. Supported by CMB, BBN, galaxy recession.', prediction: 'CMB, light element abundances', evidence: 'Overwhelming', probability: 'Established', icon: '💥' },
  { name: 'Inflationary Universe', description: 'Big Bang preceded by quantum-driven exponential expansion. Explains flatness, horizon uniformity, and CMB fluctuations.', prediction: 'Flat universe, scale-invariant CMB spectrum', evidence: 'Strong (Planck satellite data)', probability: '~90%', icon: '🚀' },
  { name: 'Cyclic Universe', description: 'Universe bounces through cycles of expansion and contraction. Big Bang is a "brane collision" in extra dimensions (Steinhardt/Turok).', prediction: 'No gravitational waves in CMB', evidence: 'Weak', probability: '<5%', icon: '🔄' },
  { name: 'String Landscape Multiverse', description: '10^500 possible vacua in string theory. Each gives a universe with different constants. We live in one compatible with life.', prediction: 'Untestable directly', evidence: 'No direct evidence', probability: 'Speculative', icon: '🌐' },
  { name: 'Many-Worlds Interpretation', description: 'Every quantum measurement splits the universe into branches. All outcomes exist in parallel wavefunctions.', prediction: 'No observable difference from standard QM', evidence: 'Mathematically equivalent to QM', probability: 'Untestable', icon: '🔀' },
]

const PLANCK_ERAS: PlanckEra[] = [
  { epoch: 'Planck Epoch', time: '< 10^-43 s', temp: '> 10^32 K', energy: '10^19 GeV', event: 'Quantum gravity dominates. Space-time itself is quantized.', physics: 'Unknown — no theory' },
  { epoch: 'Grand Unification', time: '10^-43 – 10^-36 s', temp: '10^29 K', energy: '10^16 GeV', event: 'Strong and electroweak forces separate. Baryon asymmetry created.', physics: 'Grand Unified Theories (GUT)' },
  { epoch: 'Inflation', time: '10^-36 – 10^-32 s', temp: '10^27 K', energy: '10^14 GeV', event: 'Inflaton field drives exponential expansion — 10^78 volume increase.', physics: 'Quantum field theory (inflaton)' },
  { epoch: 'Quark Epoch', time: '10^-12 – 10^-6 s', temp: '10^13 K', energy: '100 GeV', event: 'Quarks and gluons form quark-gluon plasma. Higgs mechanism gives mass.', physics: 'Quantum chromodynamics (QCD)' },
  { epoch: 'Nucleosynthesis (BBN)', time: '3 min – 20 min', temp: '10^9 K', energy: 'MeV', event: 'Protons and neutrons fuse into H, He, Li nuclei. Predicts ~25% He.', physics: 'Nuclear physics (tested)' },
  { epoch: 'Recombination', time: '380,000 years', temp: '3000 K', energy: 'eV', event: 'Electrons combine with nuclei. Universe becomes transparent. CMB emitted.', physics: 'Atomic physics (well understood)' },
]

function QuantumCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#020408'
    ctx.fillRect(0, 0, W, H)

    // Draw quantum foam background
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const r = Math.random() * 3
      const brightness = Math.random()
      ctx.fillStyle = `rgba(100,150,255,${brightness * 0.3})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Virtual particle pairs
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const r = Math.random() * 15 + 5

      // Particle
      ctx.strokeStyle = 'rgba(100,200,255,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x - r, y, 4, 0, Math.PI * 2)
      ctx.stroke()

      // Antiparticle
      ctx.strokeStyle = 'rgba(255,100,100,0.6)'
      ctx.beginPath()
      ctx.arc(x + r, y, 4, 0, Math.PI * 2)
      ctx.stroke()

      // Connection arc
      ctx.strokeStyle = 'rgba(200,100,255,0.3)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI, true)
      ctx.stroke()
    }

    // Black hole event horizon
    const bhx = W * 0.75, bhy = H * 0.5
    const grad = ctx.createRadialGradient(bhx, bhy, 0, bhx, bhy, 60)
    grad.addColorStop(0, '#000')
    grad.addColorStop(0.7, '#000')
    grad.addColorStop(1, 'rgba(255,150,0,0.5)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(bhx, bhy, 60, 0, Math.PI * 2)
    ctx.fill()

    // Hawking radiation
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2
      const px = bhx + 62 * Math.cos(angle)
      const py = bhy + 62 * Math.sin(angle)
      ctx.fillStyle = `rgba(255,${100 + i * 5},0,0.8)`
      ctx.beginPath()
      ctx.arc(px, py, 2, 0, Math.PI * 2)
      ctx.fill()
      // Escape arrow
      ctx.strokeStyle = 'rgba(255,150,0,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + 15 * Math.cos(angle), py + 15 * Math.sin(angle))
      ctx.stroke()
    }

    ctx.fillStyle = '#9ca3af'
    ctx.font = '10px sans-serif'
    ctx.fillText('Hawking radiation', bhx - 48, bhy + 80)
    ctx.fillText('Virtual pairs', 8, H - 8)
  }, [])
  return <canvas ref={canvasRef} width={500} height={220} className="w-full rounded-xl" />
}

const STATUS_COLORS: Record<string, string> = {
  proven: 'bg-green-500/20 text-green-400',
  theoretical: 'bg-blue-500/20 text-blue-400',
  'observed-indirect': 'bg-yellow-500/20 text-yellow-400',
  speculative: 'bg-red-500/20 text-red-400',
}

const CAT_COLORS: Record<string, string> = {
  'black-hole': 'text-gray-400',
  'early-universe': 'text-yellow-400',
  multiverse: 'text-purple-400',
  fundamental: 'text-blue-400',
}

type TabType = 'effects' | 'models' | 'planck'

export default function QuantumCosmology() {
  const [activeTab, setActiveTab] = useState<TabType>('effects')
  const [selected, setSelected] = useState<QuantumEffect>(QUANTUM_EFFECTS[0])
  const [catFilter, setCatFilter] = useState<string>('all')

  const categories = ['all', 'black-hole', 'early-universe', 'multiverse', 'fundamental']
  const filtered = catFilter === 'all' ? QUANTUM_EFFECTS : QUANTUM_EFFECTS.filter(e => e.category === catFilter)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🌀</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Quantum Cosmology</h2>
          <p className="text-gray-400 text-sm">Where quantum mechanics meets the structure and origin of the universe</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['effects', 'models', 'planck'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-violet-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'effects' ? 'Quantum Effects' : t === 'models' ? 'Universe Models' : 'Planck Epoch'}
          </button>
        ))}
      </div>

      {activeTab === 'effects' && (
        <div className="space-y-4">
          <QuantumCanvas />

          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1 rounded-full text-xs capitalize transition-all ${
                  catFilter === cat ? 'bg-violet-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {cat.replace('-', ' ')}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              {filtered.map(e => (
                <button
                  key={e.name}
                  onClick={() => setSelected(e)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected.name === e.name
                      ? 'bg-violet-600/20 border-violet-500'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="text-white text-sm font-medium">{e.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[e.status]}`}>{e.status.replace('-', ' ')}</span>
                    <span className={`text-xs ${CAT_COLORS[e.category]}`}>{e.year}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <h3 className="text-white text-xl font-bold">{selected.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>{selected.status.replace('-', ' ')}</span>
              </div>
              <div className="text-gray-400 text-xs mb-3">{selected.discoverer} · {selected.year}</div>
              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>

              <div className="bg-black/40 border border-violet-500/30 rounded-lg p-3 mb-4 font-mono text-center">
                <span className="text-violet-300 text-sm">{selected.equation}</span>
              </div>

              <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-3">
                <div className="text-violet-400 text-xs mb-1">Significance</div>
                <div className="text-gray-200 text-sm">{selected.significance}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'models' && (
        <div className="space-y-4">
          {UNIVERSE_MODELS.map((m, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl">{m.icon}</span>
                <div>
                  <div className="text-white font-bold text-lg">{m.name}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-green-400 text-xs">Evidence: {m.evidence}</span>
                    <span className="text-yellow-400 text-xs">Confidence: {m.probability}</span>
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-2">{m.description}</p>
              <div className="text-blue-400 text-xs">Prediction: {m.prediction}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'planck' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">The first fraction of a second after the Big Bang — a timeline of cosmic phase transitions from quantum gravity to the first atoms.</p>
          <div className="relative border-l-2 border-violet-500/30 ml-4">
            {PLANCK_ERAS.map((era, i) => (
              <div key={i} className="relative pl-6 pb-4">
                <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-violet-700 border-2 border-violet-400" />
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-white font-bold">{era.epoch}</span>
                    <span className="text-violet-300 font-mono text-xs">{era.time}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2 text-xs">
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-gray-400">Temperature</div>
                      <div className="text-yellow-400">{era.temp}</div>
                    </div>
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-gray-400">Energy Scale</div>
                      <div className="text-blue-400">{era.energy}</div>
                    </div>
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-gray-400">Physics</div>
                      <div className="text-gray-200">{era.physics}</div>
                    </div>
                  </div>
                  <div className="text-gray-300 text-sm">{era.event}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Planck Length', value: '1.6×10⁻³⁵ m', desc: 'smallest meaningful length' },
          { label: 'Planck Time', value: '5.4×10⁻⁴⁴ s', desc: 'smallest time unit' },
          { label: 'Inflation Factor', value: '10⁷⁸×', desc: 'volume increase in 10⁻³² s' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-violet-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
