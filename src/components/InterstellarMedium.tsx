import { useState, useRef, useEffect } from 'react'

interface ISMPhase {
  name: string
  temp: string
  density: string
  fraction: number
  state: string
  description: string
  examples: string[]
  color: string
}

interface Nebula {
  name: string
  type: 'emission' | 'reflection' | 'dark' | 'supernova remnant' | 'planetary'
  distance: number
  size: string
  constellation: string
  description: string
  color: string
}

interface StarFormationStep {
  stage: string
  timescale: string
  description: string
  temp: string
  size: string
}

const ismPhases: ISMPhase[] = [
  { name: 'Molecular Clouds', temp: '10–30 K', density: '10²–10⁶ cm⁻³', fraction: 1, state: 'Molecular', description: 'Dense, cold clouds of H₂ and CO — the nurseries of new stars. Gravity eventually overcomes thermal pressure causing collapse.', examples: ['Orion Molecular Cloud', 'Taurus MC', 'Rho Ophiuchi'], color: '#6b7280' },
  { name: 'Cold Neutral Medium', temp: '50–100 K', density: '20–50 cm⁻³', fraction: 4, state: 'Atomic (HI)', description: 'Cool atomic hydrogen detectable via 21 cm radio emission. Self-shielded from UV radiation. Fills ~4% of ISM volume.', examples: ['HI 21cm radio clouds', 'Diffuse clouds'], color: '#3b82f6' },
  { name: 'Warm Neutral Medium', temp: '6,000–10,000 K', density: '0.1–0.5 cm⁻³', fraction: 30, state: 'Atomic (HI)', description: 'Lukewarm atomic hydrogen in thermal equilibrium with WIM. Pervasive and fills large volume fractions.', examples: ['General ISM clouds', 'Local Bubble boundary'], color: '#60a5fa' },
  { name: 'Warm Ionized Medium', temp: '8,000 K', density: '0.1–0.3 cm⁻³', fraction: 25, state: 'Ionized (HII)', description: 'Diffuse ionized gas filling much of the galactic disk. Maintained by UV from hot stars and supernovae. Visible in Hα emission.', examples: ['Reynolds Layer', 'Diffuse HII regions'], color: '#f59e0b' },
  { name: 'HII Regions', temp: '8,000–10,000 K', density: '100–10,000 cm⁻³', fraction: 0.1, state: 'Ionized (HII)', description: 'Dense nebulae of ionized hydrogen around hot O/B stars. Emit characteristic hydrogen emission lines.', examples: ['Orion Nebula', 'Eagle Nebula', 'Lagoon Nebula'], color: '#ec4899' },
  { name: 'Hot Ionized Medium', temp: '10⁵–10⁶ K', density: '0.003–0.01 cm⁻³', fraction: 50, state: 'Highly ionized plasma', description: 'Million-degree plasma from supernova shockwaves filling ~50% of ISM volume. Emits X-rays. The "coronal gas."', examples: ['Local Hot Bubble', 'Supernova remnants'], color: '#ef4444' },
]

const nebulae: Nebula[] = [
  { name: 'Orion Nebula (M42)', type: 'emission', distance: 1344, size: '24 ly', constellation: 'Orion', description: 'Closest stellar nursery to Earth. Active star formation including the Trapezium OB cluster and protoplanetary disks (proplyds).', color: '#f9a8d4' },
  { name: 'Pillars of Creation', type: 'emission', distance: 6500, size: '4–5 ly tall', constellation: 'Serpens', description: 'Elephant trunks of cold hydrogen in the Eagle Nebula (M16). Stars forming within but also being photevaporated by UV from cluster.', color: '#a78bfa' },
  { name: 'Horsehead Nebula', type: 'dark', distance: 1500, size: '3.5 ly', constellation: 'Orion', description: 'Cold dark cloud silhouetted against bright IC 434 emission nebula. Globule of dense gas and dust blocking background light.', color: '#374151' },
  { name: 'Crab Nebula (M1)', type: 'supernova remnant', distance: 6500, size: '11 ly', constellation: 'Taurus', description: 'Expanding shockwave from SN 1054, recorded by Chinese astronomers. Powered by Crab Pulsar at center. Synchrotron radiation.', color: '#fde68a' },
  { name: 'Ring Nebula (M57)', type: 'planetary', distance: 2300, size: '1 ly', constellation: 'Lyra', description: 'Ejected envelope of a dying sun-like star. Central white dwarf ionizes surrounding shells creating the "ring" appearance.', color: '#34d399' },
  { name: 'Pleiades Nebula (IC 349)', type: 'reflection', distance: 440, size: '14 ly', constellation: 'Taurus', description: 'Dust reflecting blue light from the hot Pleiades stars. Blue color not intrinsic — pure scattering of stellar light.', color: '#93c5fd' },
]

const starFormation: StarFormationStep[] = [
  { stage: '1. Molecular Cloud Core', timescale: 'Millions of years', description: 'Dense region in molecular cloud reaches critical Jeans mass. Magnetic fields and turbulence resist collapse.', temp: '10 K', size: '0.1–0.3 pc' },
  { stage: '2. Gravitational Collapse', timescale: '100,000 years', description: 'Thermal pressure overcome. Core collapses in free-fall while outer envelope follows. Rotation causes flattening.', temp: '10–100 K', size: '0.01 pc' },
  { stage: '3. Protostar Formation', timescale: '10,000–100,000 yr', description: 'Hydrostatic core forms (First Larson Core). Accretion heats interior. Bipolar jets and outflows launch from magnetic poles.', temp: '170–2,000 K', size: '0.0001 pc' },
  { stage: '4. T Tauri Phase', timescale: '1–10 million years', description: 'Visible young stellar object with protoplanetary disk. Variable brightness, strong winds, X-ray emission. Planet formation underway.', temp: '3,000–5,000 K', size: '0.5–2 R☉' },
  { stage: '5. Main Sequence Arrival', timescale: 'Millions of years', description: 'Core reaches 10 million K. Hydrogen fusion ignites. Stellar wind clears remaining disk material. Stable star achieved.', temp: '3,000–50,000 K', size: '0.1–100 R☉' },
]

function ISMCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height

    interface Particle { x: number; y: number; vx: number; vy: number; r: number; color: string }
    const particles: Particle[] = []

    // Hot medium — fast sparse
    for (let i = 0; i < 30; i++) {
      particles.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, r: 1.5, color: '#ef4444' })
    }
    // Warm medium — medium
    for (let i = 0; i < 50; i++) {
      particles.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, r: 1.8, color: '#60a5fa' })
    }
    // Cold clouds — slow, clumped
    for (let i = 0; i < 20; i++) {
      const cx = 60 + Math.random() * (W - 120), cy = 40 + Math.random() * (H - 80)
      for (let j = 0; j < 8; j++) {
        particles.push({ x: cx + (Math.random() - 0.5) * 30, y: cy + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, r: 2.5, color: '#6b728088' })
      }
    }

    let frame: number
    const animate = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#030712'
      ctx.fillRect(0, 0, W, H)

      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      })

      // Legend
      ctx.font = '11px sans-serif'
      const legend = [['Hot ionized (10⁶K)', '#ef4444'], ['Warm neutral/ionized', '#60a5fa'], ['Cold molecular clouds', '#6b7280']]
      legend.forEach(([label, color], i) => {
        ctx.fillStyle = color
        ctx.fillRect(10, H - 55 + i * 17, 10, 10)
        ctx.fillStyle = '#9ca3af'
        ctx.fillText(label, 26, H - 46 + i * 17)
      })

      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} width={420} height={240} className="w-full rounded-lg" />
}

type Tab = 'phases' | 'nebulae' | 'starformation'

export default function InterstellarMedium() {
  const [tab, setTab] = useState<Tab>('phases')
  const [selectedPhase, setSelectedPhase] = useState<ISMPhase>(ismPhases[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'phases', label: 'ISM Phases' },
    { id: 'nebulae', label: 'Nebulae' },
    { id: 'starformation', label: 'Star Formation' },
  ]

  const typeColor = { emission: 'text-pink-400', reflection: 'text-blue-400', dark: 'text-gray-400', 'supernova remnant': 'text-yellow-400', planetary: 'text-green-400' }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Interstellar Medium</h2>
      <p className="text-gray-400 text-sm mb-5">The gas and dust between stars — not empty, but full of complex physics</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'phases' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {ismPhases.map(p => (
              <button key={p.name} onClick={() => setSelectedPhase(p)} className={`w-full text-left p-3 rounded-lg transition-colors ${selectedPhase.name === p.name ? 'bg-violet-900/40 border border-violet-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="font-semibold text-white text-sm leading-snug">{p.name}</span>
                </div>
                <div className="text-gray-500 text-xs">{p.temp}</div>
                <div className="text-gray-600 text-xs mt-0.5">{p.state}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <ISMCanvas />
            <div className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedPhase.color }} />
                <h3 className="text-lg font-bold text-white">{selectedPhase.name}</h3>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selectedPhase.description}</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { label: 'Temperature', value: selectedPhase.temp },
                  { label: 'Density', value: selectedPhase.density },
                  { label: 'Phase State', value: selectedPhase.state },
                  { label: 'Volume Fraction', value: `~${selectedPhase.fraction}%` },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900/50 rounded p-2">
                    <div className="text-gray-500 text-xs">{item.label}</div>
                    <div className="text-white text-sm font-medium mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-2">Examples</div>
                <div className="flex flex-wrap gap-2">
                  {selectedPhase.examples.map(ex => (
                    <span key={ex} className="text-xs bg-violet-900/30 text-violet-300 px-2 py-1 rounded">{ex}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'nebulae' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nebulae.map(n => (
            <div key={n.name} className="bg-gray-800/60 rounded-lg p-4 border-l-4" style={{ borderColor: n.color }}>
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-white font-bold">{n.name}</h4>
                <span className={`text-xs capitalize ${typeColor[n.type]}`}>{n.type}</span>
              </div>
              <p className="text-gray-400 text-sm mb-3">{n.description}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-white text-sm font-bold">{n.distance.toLocaleString()}</div>
                  <div className="text-gray-500 text-xs">ly away</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-white text-sm font-bold">{n.size}</div>
                  <div className="text-gray-500 text-xs">size</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-white text-sm font-bold">{n.constellation}</div>
                  <div className="text-gray-500 text-xs">location</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'starformation' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-violet-900/20 rounded-lg p-4 border border-violet-800/40">
            Stars form from gravitational collapse of cold molecular cloud cores. The Jeans criterion determines when gravity overcomes thermal pressure: M_J ∝ T^(3/2) / ρ^(1/2). A typical solar-mass star takes ~50 million years from initial collapse to joining the main sequence.
          </p>
          <div className="relative">
            {starFormation.map((s, i) => (
              <div key={s.stage} className="flex gap-4 mb-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{i + 1}</div>
                  {i < starFormation.length - 1 && <div className="w-0.5 flex-1 bg-violet-800/50 mt-2" />}
                </div>
                <div className="pb-4 flex-1">
                  <div className="bg-gray-800/60 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-white font-semibold">{s.stage}</h4>
                      <span className="text-violet-400 text-xs">{s.timescale}</span>
                    </div>
                    <p className="text-gray-400 text-sm mb-2">{s.description}</p>
                    <div className="flex gap-4">
                      <div className="text-xs"><span className="text-gray-500">T: </span><span className="text-orange-300">{s.temp}</span></div>
                      <div className="text-xs"><span className="text-gray-500">Size: </span><span className="text-blue-300">{s.size}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
