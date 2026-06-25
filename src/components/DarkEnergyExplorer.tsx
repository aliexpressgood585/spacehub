import { useState, useRef, useEffect } from 'react'

interface CosmicComponent {
  name: string
  percent: number
  color: string
  emoji: string
  description: string
  whatIsIt: string
  detected: string
  candidates: string[]
}

interface UniverseFate {
  name: string
  icon: string
  probability: string
  timeframe: string
  description: string
  driver: string
}

const COSMIC_BUDGET: CosmicComponent[] = [
  {
    name: 'Dark Energy',
    percent: 68.3,
    color: '#7C3AED',
    emoji: '⚡',
    description: 'A mysterious repulsive force accelerating the expansion of the universe',
    whatIsIt: 'Unknown — possibly vacuum energy (cosmological constant Λ), quintessence field, or a modification of gravity. First inferred from observations of distant Type Ia supernovae in 1998.',
    detected: 'Indirectly via accelerating cosmic expansion (1998 Nobel Prize in Physics 2011)',
    candidates: ['Cosmological constant (Λ)', 'Quintessence scalar field', 'Phantom energy (w < −1)', 'Modified gravity (f(R) theories)'],
  },
  {
    name: 'Dark Matter',
    percent: 26.8,
    color: '#1D4ED8',
    emoji: '🌑',
    description: 'Invisible matter that holds galaxies together through gravity but emits no light',
    whatIsIt: 'Interacts gravitationally but not electromagnetically. Makes up 85% of all matter. Causes galaxies to rotate faster at their edges than visible matter predicts (galaxy rotation curves).',
    detected: 'Galaxy rotation curves (Vera Rubin, 1970s), gravitational lensing, CMB power spectrum',
    candidates: ['WIMPs (Weakly Interacting Massive Particles)', 'Axions', 'Sterile neutrinos', 'Primordial black holes'],
  },
  {
    name: 'Ordinary Matter',
    percent: 4.9,
    color: '#059669',
    emoji: '⚛️',
    description: 'Atoms, molecules, stars, planets, gas — everything we can see and touch',
    whatIsIt: 'Baryonic matter made of protons, neutrons, and electrons. Stars and planets account for <1% of total universe content. Most ordinary matter exists as diffuse intergalactic gas.',
    detected: 'Directly observed via electromagnetic radiation across the spectrum',
    candidates: ['Hydrogen (~75%)', 'Helium (~23%)', 'Heavier elements (<2%)', 'Intergalactic medium'],
  },
]

const UNIVERSE_FATES: UniverseFate[] = [
  {
    name: 'Big Freeze (Heat Death)',
    icon: '🥶',
    probability: 'Most likely',
    timeframe: '10¹⁰⁰ years',
    description: 'Universe expands forever, stars burn out, black holes evaporate via Hawking radiation, entropy reaches maximum. All energy becomes uniformly distributed at near absolute zero.',
    driver: 'Dark energy (w = −1, cosmological constant)',
  },
  {
    name: 'Big Rip',
    icon: '💥',
    probability: 'Possible',
    timeframe: '20–200 billion years',
    description: 'If dark energy grows stronger over time (phantom energy, w < −1), expansion accelerates until it tears apart galaxies, solar systems, planets, atoms, and space-time itself.',
    driver: 'Phantom energy (w < −1)',
  },
  {
    name: 'Big Crunch',
    icon: '🔴',
    probability: 'Unlikely',
    timeframe: '> 10¹¹ years',
    description: 'If dark energy weakens or reverses, gravity eventually halts expansion and the universe collapses back to an infinitely dense singularity — the reverse of the Big Bang.',
    driver: 'Negative dark energy / quintessence reversal',
  },
  {
    name: 'Big Bounce',
    icon: '🔁',
    probability: 'Speculative',
    timeframe: 'Cyclic',
    description: 'The Big Crunch triggers a new Big Bang in an infinite cycle of expansion and contraction. Requires quantum gravity effects to prevent true singularity formation.',
    driver: 'Loop quantum cosmology / cyclic models',
  },
  {
    name: 'Big Slurp (Vacuum Decay)',
    icon: '🫧',
    probability: 'Low',
    timeframe: 'Unpredictable',
    description: 'The Higgs field is in a metastable "false vacuum." A quantum tunnel event somewhere in the universe could create a true vacuum bubble expanding at light speed, instantly destroying all physics as we know it.',
    driver: 'Higgs field metastability',
  },
]

const HUBBLE_DATA = [
  { z: 0, age: 13.8, scale: 1.0 },
  { z: 0.1, age: 12.5, scale: 0.909 },
  { z: 0.5, age: 8.6, scale: 0.667 },
  { z: 1.0, age: 5.9, scale: 0.5 },
  { z: 2.0, age: 3.3, scale: 0.333 },
  { z: 5.0, age: 1.0, scale: 0.167 },
  { z: 10.0, age: 0.47, scale: 0.091 },
  { z: 1100, age: 0.00038, scale: 0.0009 },
]

function CosmicPieChart({ components }: { components: CosmicComponent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.38

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, W, H)

    let startAngle = -Math.PI / 2
    components.forEach(comp => {
      const sweep = (comp.percent / 100) * 2 * Math.PI
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, startAngle, startAngle + sweep)
      ctx.closePath()
      ctx.fillStyle = comp.color
      ctx.fill()
      ctx.strokeStyle = '#0a0a1a'
      ctx.lineWidth = 2
      ctx.stroke()

      // Label
      const midAngle = startAngle + sweep / 2
      const lx = cx + Math.cos(midAngle) * r * 0.65
      const ly = cy + Math.sin(midAngle) * r * 0.65
      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.fillText(`${comp.percent}%`, lx, ly)

      startAngle += sweep
    })

    // Center label
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = '#0a0a1a'
    ctx.fill()
    ctx.font = 'bold 12px sans-serif'
    ctx.fillStyle = 'white'
    ctx.textAlign = 'center'
    ctx.fillText('Universe', cx, cy - 6)
    ctx.fillText('Budget', cx, cy + 10)
  }, [components])

  return <canvas ref={canvasRef} width={240} height={240} className="mx-auto" />
}

export default function DarkEnergyExplorer() {
  const [activeTab, setActiveTab] = useState<'budget' | 'fates' | 'expansion'>('budget')
  const [selectedComponent, setSelectedComponent] = useState<CosmicComponent>(COSMIC_BUDGET[0])
  const [selectedFate, setSelectedFate] = useState<UniverseFate>(UNIVERSE_FATES[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Dark Energy & Cosmic Fate</h2>
      <p className="text-slate-400 text-sm mb-5">Explore the invisible forces shaping our universe and its ultimate destiny</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {([['budget', '🌌 Cosmic Budget'], ['fates', '☄️ Universe Fates'], ['expansion', '📈 Expansion History']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'budget' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <CosmicPieChart components={COSMIC_BUDGET} />
            <div className="mt-4 space-y-2">
              {COSMIC_BUDGET.map(comp => (
                <button
                  key={comp.name}
                  onClick={() => setSelectedComponent(comp)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                    selectedComponent.name === comp.name ? 'bg-slate-700 ring-1 ring-indigo-500' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: comp.color }} />
                  <span className="text-white text-sm font-medium flex-1 text-left">{comp.emoji} {comp.name}</span>
                  <span className="text-white font-bold text-sm">{comp.percent}%</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl p-5">
            <div className="text-3xl mb-2">{selectedComponent.emoji}</div>
            <h3 className="text-white font-bold text-lg mb-1">{selectedComponent.name}</h3>
            <div className="text-slate-300 text-sm mb-4">{selectedComponent.description}</div>

            <div className="space-y-4">
              <div>
                <div className="text-slate-500 text-xs mb-1">What is it?</div>
                <p className="text-slate-300 text-sm leading-relaxed">{selectedComponent.whatIsIt}</p>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">How detected?</div>
                <p className="text-slate-300 text-sm">{selectedComponent.detected}</p>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-2">Leading candidates</div>
                <div className="space-y-1">
                  {selectedComponent.candidates.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedComponent.color }} />
                      <span className="text-slate-300">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Fraction bar */}
            <div className="mt-5">
              <div className="text-slate-500 text-xs mb-1">Fraction of universe</div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${selectedComponent.percent}%`, backgroundColor: selectedComponent.color }}
                />
              </div>
              <div className="text-right text-xs mt-1" style={{ color: selectedComponent.color }}>{selectedComponent.percent}%</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            {UNIVERSE_FATES.map(fate => (
              <button
                key={fate.name}
                onClick={() => setSelectedFate(fate)}
                className={`w-full text-left p-3 rounded-lg transition-all ${
                  selectedFate.name === fate.name ? 'bg-slate-700 ring-1 ring-indigo-500' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{fate.icon}</span>
                  <div>
                    <div className="text-white font-semibold text-sm">{fate.name}</div>
                    <div className="text-slate-400 text-xs">{fate.probability} · {fate.timeframe}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-slate-900 rounded-xl p-5">
            <div className="text-4xl mb-3">{selectedFate.icon}</div>
            <h3 className="text-white font-bold text-lg mb-1">{selectedFate.name}</h3>
            <div className="flex gap-3 mb-4">
              <span className="bg-indigo-900/50 text-indigo-300 text-xs px-2 py-1 rounded">{selectedFate.probability}</span>
              <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded">⏱ {selectedFate.timeframe}</span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">{selectedFate.description}</p>
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-slate-500 text-xs mb-1">Driver</div>
              <div className="text-slate-200 text-sm">{selectedFate.driver}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expansion' && (
        <div>
          <p className="text-slate-400 text-sm mb-4">
            The universe has been expanding since the Big Bang 13.8 billion years ago. The Hubble constant (H₀ ≈ 70 km/s/Mpc) describes the current expansion rate. Dark energy began accelerating this expansion ~5 billion years ago.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs border-b border-slate-700">
                  <th className="pb-2 text-left">Redshift (z)</th>
                  <th className="pb-2 text-left">Cosmic Age</th>
                  <th className="pb-2 text-left">Scale Factor</th>
                  <th className="pb-2 text-left">Epoch</th>
                </tr>
              </thead>
              <tbody>
                {HUBBLE_DATA.map((d, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-2 text-indigo-400 font-mono">z = {d.z}</td>
                    <td className="py-2 text-white">
                      {d.age < 0.001 ? `${(d.age * 1000).toFixed(2)} Myr` : `${d.age.toFixed(2)} Gyr`}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-indigo-600 rounded" style={{ width: `${d.scale * 80}px` }} />
                        <span className="text-slate-300 font-mono text-xs">a = {d.scale.toFixed(3)}</span>
                      </div>
                    </td>
                    <td className="py-2 text-slate-400 text-xs">
                      {d.z === 0 ? 'Today' :
                       d.z <= 0.5 ? 'Dark energy dominated' :
                       d.z <= 2 ? 'Matter dominated (late)' :
                       d.z <= 10 ? 'Matter dominated (early)' : 'Recombination / CMB'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-800/60 rounded-lg p-4">
              <div className="text-purple-400 text-lg font-bold mb-1">H₀ ≈ 70</div>
              <div className="text-slate-300 text-sm">km/s/Mpc (Hubble constant)</div>
              <div className="text-slate-500 text-xs mt-1">Tension between CMB (67.4) and local (73.3) measurements is a major open problem</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-4">
              <div className="text-blue-400 text-lg font-bold mb-1">w = −1</div>
              <div className="text-slate-300 text-sm">Dark energy equation of state</div>
              <div className="text-slate-500 text-xs mt-1">w = P/ρc². Value exactly −1 suggests cosmological constant; w &lt; −1 implies Big Rip</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-4">
              <div className="text-green-400 text-lg font-bold mb-1">~5 Gyr ago</div>
              <div className="text-slate-300 text-sm">Dark energy took over</div>
              <div className="text-slate-500 text-xs mt-1">Before z ≈ 0.4, matter dominated. After, dark energy began accelerating expansion</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
