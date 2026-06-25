import { useState, useEffect, useRef } from 'react'

interface GalaxyType {
  hubble: string
  name: string
  shape: string
  starFormation: string
  age: string
  darkMatter: string
  percentage: string
  description: string
  examples: string[]
  color: string
}

interface MilkyWayFeature {
  name: string
  size: string
  location: string
  description: string
  significance: string
  icon: string
}

interface GalaxyMerger {
  event: string
  timeframe: string
  galaxies: string
  outcome: string
  evidence: string
}

const GALAXY_TYPES: GalaxyType[] = [
  {
    hubble: 'E0–E7',
    name: 'Elliptical',
    shape: 'Smooth, oval to spherical',
    starFormation: 'Very low (red & dead)',
    age: 'Old (10–13 Gyr)',
    darkMatter: 'Dark matter dominated',
    percentage: '~13% of galaxies',
    description: 'Spheroidal systems of old stars with little gas or dust. Product of galaxy mergers. Range from nearly round (E0) to elongated (E7). Giant ellipticals host the most massive black holes.',
    examples: ['M87 (Virgo A)', 'NGC 1300 (bar test)', 'NGC 4889'],
    color: '#f59e0b',
  },
  {
    hubble: 'Sa–Sc',
    name: 'Spiral',
    shape: 'Disk with spiral arms',
    starFormation: 'Active in arms',
    age: 'Mixed (arms: young; bulge: old)',
    darkMatter: 'Flat rotation curves',
    percentage: '~77% of bright galaxies',
    description: 'Rotating disks with spiral arms traced by young stars and HII regions. Flat rotation curves (Rubin, 1970s) were first direct evidence for dark matter. Milky Way and Andromeda are spirals.',
    examples: ['Milky Way', 'Andromeda (M31)', 'M51 (Whirlpool)', 'NGC 1300'],
    color: '#3b82f6',
  },
  {
    hubble: 'SB',
    name: 'Barred Spiral',
    shape: 'Spiral with central bar',
    starFormation: 'Active (bar channels gas to center)',
    age: 'Mixed',
    darkMatter: 'Dark matter halo',
    percentage: '~67% of spirals have bars',
    description: 'Spiral with a linear bar of stars through the center. The Milky Way is a barred spiral (Sbc type). Bars funnel gas toward the center, triggering central star formation and feeding the black hole.',
    examples: ['Milky Way (SBc)', 'NGC 1300 (SBb)', 'NGC 1365', 'M58'],
    color: '#8b5cf6',
  },
  {
    hubble: 'S0',
    name: 'Lenticular',
    shape: 'Disk, no spiral arms',
    starFormation: 'Very low (gas-poor)',
    age: 'Old',
    darkMatter: 'Moderate',
    percentage: '~22% of nearby galaxies',
    description: 'Transitional type between ellipticals and spirals. Has the disk of a spiral but lacks spiral structure — gas stripped by cluster environment. Common in galaxy cluster cores.',
    examples: ['NGC 5866', 'M84', 'M85'],
    color: '#06b6d4',
  },
  {
    hubble: 'Irr',
    name: 'Irregular',
    shape: 'No distinct shape',
    starFormation: 'Intense, chaotic',
    age: 'Variable',
    darkMatter: 'Variable',
    percentage: '~7% of galaxies (by number: more)',
    description: 'No symmetric structure. Often caused by gravitational interactions or mergers. High star formation rates — many produce blue compact dwarf galaxies. Includes the Magellanic Clouds.',
    examples: ['Large Magellanic Cloud', 'Small Magellanic Cloud', 'M82 (starburst)'],
    color: '#10b981',
  },
]

const MW_FEATURES: MilkyWayFeature[] = [
  { name: 'Galactic Bar', size: '~27,000 ly', location: 'Center', description: 'A central bar of old stars connecting the spiral arms. Rotates as a rigid body.', significance: 'Channels gas inward; slows down spiral arm winding', icon: '📊' },
  { name: 'Sagittarius A*', size: '4M solar masses', location: '26,000 ly from Earth', description: 'Supermassive black hole at the Milky Way center. EHT imaged it in 2022.', significance: 'Gravitational anchor of the galaxy; occasionally flares', icon: '⚫' },
  { name: 'Perseus Arm', size: '~75,000 ly long', location: 'Outer spiral arm', description: 'Major spiral arm with active star formation regions.', significance: 'Home to many HII regions and young star clusters', icon: '🌀' },
  { name: 'Galactic Halo', size: '~300,000 ly', location: 'Surrounding disk', description: 'Sparse population of old globular clusters and dark matter. Extends far beyond disk.', significance: 'Contains the majority of the Milky Way\'s dark matter', icon: '🔮' },
  { name: 'Stellar Disk', size: '100,000 ly × 1,000 ly', location: 'Main galaxy body', description: 'Thin disk of ~250 billion stars where most star formation occurs.', significance: 'The visible main body — where solar system resides', icon: '💫' },
  { name: 'Fermi Bubbles', size: '25,000 ly each', location: 'Above and below center', description: 'Two giant gamma-ray emitting lobes discovered by Fermi in 2010.', significance: 'Evidence of past AGN activity or starburst event ~6 Myr ago', icon: '💥' },
]

const MERGERS: GalaxyMerger[] = [
  {
    event: 'Milky Way – Gaia-Sausage merger',
    timeframe: '8–11 billion years ago',
    galaxies: 'Milky Way + dwarf galaxy',
    outcome: 'Inner stellar halo formed; thick disk disrupted',
    evidence: 'Radially biased (sausage-shaped) star orbits found by Gaia satellite',
  },
  {
    event: 'Milky Way – Andromeda collision',
    timeframe: '~4.5 billion years from now',
    galaxies: 'Milky Way + M31',
    outcome: 'Giant elliptical galaxy "Milkomeda"',
    evidence: 'Proper motion measured by Hubble; approach at 110 km/s',
  },
  {
    event: 'M82 Starburst (M81 interaction)',
    timeframe: '~500 million years ago',
    galaxies: 'M81 + M82',
    outcome: 'M82 starforming at 10× normal rate; galaxy distorted',
    evidence: 'Tidal tails, superwind in X-ray/radio imaging',
  },
  {
    event: 'Antennae Galaxies (NGC 4038/4039)',
    timeframe: 'Ongoing (last 700 Myr)',
    galaxies: 'Two equal spirals',
    outcome: 'Tidal tails, massive star formation, future giant elliptical',
    evidence: 'HST/Chandra imaging of thousands of young star clusters',
  },
]

function GalaxyCanvas({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, W, H)

    if (type === 'Spiral' || type === 'Barred Spiral') {
      // Draw spiral
      const arms = 2
      for (let arm = 0; arm < arms; arm++) {
        const startAngle = (arm * Math.PI) + (type === 'Barred Spiral' ? 0.3 : 0)
        for (let t = 0; t < 20; t += 0.05) {
          const r = t * 5 + 5
          if (r > 85) break
          const angle = startAngle + t * 0.6
          const x = cx + r * Math.cos(angle)
          const y = cy + r * 0.4 * Math.sin(angle)
          const brightness = 1 - t / 20
          ctx.fillStyle = `rgba(150,180,255,${brightness * 0.8})`
          ctx.beginPath()
          ctx.arc(x, y, 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      // Bar
      if (type === 'Barred Spiral') {
        ctx.strokeStyle = 'rgba(255,220,150,0.7)'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(cx - 30, cy)
        ctx.lineTo(cx + 30, cy)
        ctx.stroke()
      }
      // Bulge
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20)
      g.addColorStop(0, '#fffde7')
      g.addColorStop(1, 'rgba(255,220,100,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(cx, cy, 20, 12, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (type === 'Elliptical') {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 75)
      g.addColorStop(0, '#fff8dc')
      g.addColorStop(0.4, 'rgba(255,200,100,0.5)')
      g.addColorStop(1, 'rgba(200,150,50,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(cx, cy, 75, 50, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (type === 'Irregular') {
      // Random blobs
      for (let i = 0; i < 200; i++) {
        const x = cx + (Math.random() - 0.5) * 130
        const y = cy + (Math.random() - 0.5) * 100
        const r = Math.random() * 2 + 0.5
        ctx.fillStyle = `rgba(100,200,255,${Math.random() * 0.8})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      // Lenticular - disk, no arms
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60)
      g.addColorStop(0, '#fffde7')
      g.addColorStop(0.6, 'rgba(255,220,150,0.3)')
      g.addColorStop(1, 'rgba(200,180,100,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(cx, cy, 80, 20, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(cx, cy, 20, 20, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [type])
  return <canvas ref={canvasRef} width={200} height={160} className="rounded-xl mx-auto block" />
}

type TabType = 'types' | 'milkyway' | 'mergers'

export default function GalacticArchitecture() {
  const [activeTab, setActiveTab] = useState<TabType>('types')
  const [selected, setSelected] = useState<GalaxyType>(GALAXY_TYPES[1])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🌌</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Galactic Architecture</h2>
          <p className="text-gray-400 text-sm">Galaxy types, structure, and the evolution of cosmic cities</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['types', 'milkyway', 'mergers'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-indigo-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'types' ? 'Galaxy Types' : t === 'milkyway' ? 'Milky Way' : 'Galaxy Mergers'}
          </button>
        ))}
      </div>

      {activeTab === 'types' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {GALAXY_TYPES.map(g => (
              <button
                key={g.hubble}
                onClick={() => setSelected(g)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected.hubble === g.hubble
                    ? 'bg-indigo-600/20 border-indigo-500'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ background: g.color }} />
                  <div>
                    <div className="text-white text-sm font-medium">{g.name}</div>
                    <div className="text-gray-400 text-xs">Hubble: {g.hubble} · {g.percentage}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <GalaxyCanvas type={selected.name} />
            <h3 className="text-white text-xl font-bold mt-4 mb-1">{selected.name} Galaxies</h3>
            <div className="text-gray-400 text-xs mb-3">Hubble Classification: {selected.hubble}</div>
            <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Star Formation', value: selected.starFormation },
                { label: 'Stellar Age', value: selected.age },
                { label: 'Dark Matter', value: selected.darkMatter },
                { label: 'Prevalence', value: selected.percentage },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-gray-400 text-xs mb-2">Examples</div>
              <div className="flex flex-wrap gap-2">
                {selected.examples.map(ex => (
                  <span key={ex} className="text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-300">{ex}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'milkyway' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MW_FEATURES.map((f, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start gap-3 mb-2">
                <span className="text-2xl">{f.icon}</span>
                <div>
                  <div className="text-white font-bold">{f.name}</div>
                  <div className="text-indigo-400 text-xs">{f.size} · {f.location}</div>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-2">{f.description}</p>
              <div className="text-yellow-300 text-xs">★ {f.significance}</div>
            </div>
          ))}

          <div className="md:col-span-2 bg-gradient-to-r from-indigo-900/30 to-blue-900/30 border border-indigo-500/30 rounded-xl p-4">
            <div className="text-indigo-300 font-bold text-lg mb-2">The Milky Way at a Glance</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Diameter', value: '~100,000 ly' },
                { label: 'Stars', value: '200–400 billion' },
                { label: 'Mass', value: '~1.5 × 10¹² M☉' },
                { label: 'Age', value: '~13.5 billion yrs' },
                { label: 'Type', value: 'Barred Spiral (SBc)' },
                { label: 'Distance to Center', value: '26,000 ly' },
                { label: 'Orbital Speed', value: '220 km/s (Sun)' },
                { label: 'Central BH', value: 'Sgr A* — 4M M☉' },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-2">
                  <div className="text-gray-400 text-xs">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mergers' && (
        <div className="space-y-4">
          {MERGERS.map((m, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="text-white font-bold">{m.event}</div>
                <span className="text-indigo-400 text-xs font-mono whitespace-nowrap">{m.timeframe}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                <div className="bg-white/5 rounded-lg p-2">
                  <div className="text-gray-400 text-xs">Galaxies</div>
                  <div className="text-white text-sm">{m.galaxies}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2 md:col-span-2">
                  <div className="text-gray-400 text-xs">Outcome</div>
                  <div className="text-white text-sm">{m.outcome}</div>
                </div>
              </div>
              <div className="text-blue-400 text-xs">🔭 Evidence: {m.evidence}</div>
            </div>
          ))}

          <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
            <div className="text-purple-300 font-bold mb-2">The Milkomeda Future</div>
            <p className="text-gray-300 text-sm">
              In ~4.5 billion years, the Milky Way and Andromeda galaxies will collide and merge into a single giant elliptical galaxy (nicknamed "Milkomeda"). Despite the galaxies colliding, individual stars are so far apart that direct stellar collisions are extremely unlikely. The Sun will survive — but the night sky will be dramatically transformed.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Galaxies Observable', value: '~2 trillion', desc: 'in observable universe' },
          { label: 'Milky Way Stars', value: '250 billion', desc: 'estimated' },
          { label: 'Andromeda Collision', value: '4.5 Gyr', desc: 'from now' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-indigo-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
