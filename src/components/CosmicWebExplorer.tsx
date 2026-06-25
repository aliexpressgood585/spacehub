import { useState, useEffect, useRef } from 'react'

interface Structure {
  name: string
  type: 'supercluster' | 'filament' | 'void' | 'wall' | 'cluster'
  size: string
  distance: string
  mass: string
  description: string
  discovered: number
  galaxies?: string
}

interface ScaleLevel {
  name: string
  size: string
  example: string
  description: string
  color: string
}

const STRUCTURES: Structure[] = [
  {
    name: 'Laniakea Supercluster',
    type: 'supercluster',
    size: '520 Mly',
    distance: '250 Mly (center)',
    mass: '10¹⁷ solar masses',
    description: 'Our home supercluster containing ~100,000 galaxies including the Milky Way. Mapped in 2014 using galaxy peculiar velocities.',
    discovered: 2014,
    galaxies: '~100,000',
  },
  {
    name: 'Hercules–Corona Borealis Great Wall',
    type: 'wall',
    size: '10 Gly',
    distance: '10 Gly',
    mass: 'Trillions of solar masses',
    description: 'Largest known structure in the observable universe — a gamma-ray burst concentration spanning 10 billion light-years.',
    discovered: 2013,
    galaxies: 'Billions',
  },
  {
    name: 'Boötes Void',
    type: 'void',
    size: '250 Mly',
    distance: '700 Mly',
    mass: 'Near zero',
    description: 'One of the largest known cosmic voids. Contains only ~60 galaxies in a region where hundreds of thousands would be expected.',
    discovered: 1981,
    galaxies: '~60',
  },
  {
    name: 'Perseus-Pisces Filament',
    type: 'filament',
    size: '300 Mly',
    distance: '250 Mly',
    mass: '10¹⁵ solar masses',
    description: 'A major filamentary structure connecting galaxy clusters across 300 million light-years.',
    discovered: 1985,
    galaxies: 'Thousands',
  },
  {
    name: 'Sloan Great Wall',
    type: 'wall',
    size: '1.38 Gly',
    distance: '1 Gly',
    mass: '10¹⁷ solar masses',
    description: 'A galaxy filament discovered by the Sloan Digital Sky Survey. One of the largest galaxy structures known at discovery.',
    discovered: 2003,
    galaxies: 'Millions',
  },
  {
    name: 'Coma Cluster',
    type: 'cluster',
    size: '20 Mly',
    distance: '321 Mly',
    mass: '7 × 10¹⁴ solar masses',
    description: 'A rich galaxy cluster with ~1,000 identified galaxies. First evidence of dark matter discovered here by Fritz Zwicky in 1933.',
    discovered: 1933,
    galaxies: '~1,000',
  },
  {
    name: 'KBC Void',
    type: 'void',
    size: '1 Gly',
    distance: 'We are inside it',
    mass: 'Near zero',
    description: 'A giant supervoid surrounding the Milky Way that may explain our galaxy\'s anomalous motion.',
    discovered: 2013,
    galaxies: 'Sparse',
  },
  {
    name: 'Virgo Supercluster',
    type: 'supercluster',
    size: '110 Mly',
    distance: '65 Mly (center)',
    mass: '10¹⁵ solar masses',
    description: 'Our former "home" supercluster — now understood as part of Laniakea. Contains the Virgo Cluster at its center.',
    discovered: 1953,
    galaxies: '~100',
  },
]

const SCALE_LEVELS: ScaleLevel[] = [
  { name: 'Planet', size: '10⁴ km', example: 'Earth', description: 'Rocky or gas worlds orbiting stars', color: '#10b981' },
  { name: 'Solar System', size: '10 light-hours', example: 'Our Solar System', description: 'Star + orbiting bodies', color: '#3b82f6' },
  { name: 'Star Cluster', size: '10–100 ly', example: 'Pleiades', description: 'Hundreds to thousands of stars', color: '#8b5cf6' },
  { name: 'Galaxy', size: '100,000 ly', example: 'Milky Way', description: '100–400 billion stars', color: '#f59e0b' },
  { name: 'Galaxy Group', size: '10 Mly', example: 'Local Group', description: 'Dozens of galaxies', color: '#ef4444' },
  { name: 'Galaxy Cluster', size: '10–30 Mly', example: 'Virgo Cluster', description: 'Hundreds to thousands of galaxies', color: '#ec4899' },
  { name: 'Supercluster', size: '100–500 Mly', example: 'Laniakea', description: 'Millions of galaxies', color: '#06b6d4' },
  { name: 'Cosmic Web', size: '10 Gly', example: 'Observable Universe', description: 'Filaments, voids, walls', color: '#a78bfa' },
]

const TYPE_COLORS: Record<string, string> = {
  supercluster: 'bg-cyan-500/20 text-cyan-300',
  filament: 'bg-purple-500/20 text-purple-300',
  void: 'bg-gray-500/20 text-gray-300',
  wall: 'bg-yellow-500/20 text-yellow-300',
  cluster: 'bg-orange-500/20 text-orange-300',
}

function WebCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = '#02040a'
    ctx.fillRect(0, 0, W, H)

    // Seed node positions for clusters
    const nodes: { x: number; y: number; r: number; brightness: number }[] = []
    for (let i = 0; i < 60; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 12 + 2,
        brightness: Math.random() * 0.8 + 0.2,
      })
    }

    // Draw filaments between nearby nodes
    ctx.lineWidth = 0.5
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          const opacity = (1 - dist / 120) * 0.6
          const grad = ctx.createLinearGradient(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y)
          grad.addColorStop(0, `rgba(147,112,219,${opacity})`)
          grad.addColorStop(1, `rgba(100,160,255,${opacity})`)
          ctx.strokeStyle = grad
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.stroke()
        }
      }
    }

    // Draw void regions
    for (let i = 0; i < 8; i++) {
      const vx = Math.random() * W
      const vy = Math.random() * H
      const vr = Math.random() * 50 + 30
      const grad = ctx.createRadialGradient(vx, vy, 0, vx, vy, vr)
      grad.addColorStop(0, 'rgba(0,0,0,0.5)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(vx, vy, vr, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw nodes (galaxy clusters)
    nodes.forEach(n => {
      // Glow
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4)
      glow.addColorStop(0, `rgba(200,180,255,${n.brightness * 0.5})`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2)
      ctx.fill()

      // Core
      ctx.fillStyle = `rgba(220,210,255,${n.brightness})`
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r * 0.6, 0, Math.PI * 2)
      ctx.fill()
    })

    // Label Laniakea region
    ctx.fillStyle = 'rgba(6,182,212,0.6)'
    ctx.font = '11px monospace'
    ctx.fillText('Laniakea ▼', W / 2 - 35, H / 2 + 5)
    ctx.strokeStyle = 'rgba(6,182,212,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, 35, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }, [])
  return <canvas ref={canvasRef} width={600} height={260} className="w-full rounded-xl" />
}

type TabType = 'map' | 'structures' | 'scale'

export default function CosmicWebExplorer() {
  const [activeTab, setActiveTab] = useState<TabType>('map')
  const [selected, setSelected] = useState<Structure>(STRUCTURES[0])
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const types = ['all', 'supercluster', 'filament', 'void', 'wall', 'cluster']

  const filtered = typeFilter === 'all'
    ? STRUCTURES
    : STRUCTURES.filter(s => s.type === typeFilter)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🕸️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Cosmic Web Explorer</h2>
          <p className="text-gray-400 text-sm">The large-scale structure of the observable universe</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['map', 'structures', 'scale'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === t ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'map' ? 'Web Visualization' : t === 'structures' ? 'Major Structures' : 'Cosmic Scale'}
          </button>
        ))}
      </div>

      {activeTab === 'map' && (
        <div className="space-y-4">
          <WebCanvas />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { color: '#9370db', label: 'Filaments', desc: 'Gas & galaxy bridges' },
              { color: '#64a0ff', label: 'Clusters', desc: 'Dense galaxy groups' },
              { color: '#222', label: 'Voids', desc: 'Near-empty regions' },
              { color: '#06b6d4', label: 'Superclusters', desc: 'Vast galaxy networks' },
            ].map(item => (
              <div key={item.label} className="bg-white/5 rounded-lg p-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: item.color }} />
                <div>
                  <div className="text-white text-xs font-medium">{item.label}</div>
                  <div className="text-gray-400 text-xs">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-4">
            <p className="text-gray-300 text-sm">
              The cosmic web is the largest known structure: a network of <strong className="text-purple-300">filaments</strong> (strands of dark matter and galaxies), <strong className="text-cyan-300">galaxy clusters</strong> at intersections, and vast <strong className="text-gray-400">voids</strong> in between. It spans hundreds of millions of light-years and formed from quantum fluctuations in the first seconds after the Big Bang.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'structures' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {types.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                  typeFilter === t ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              {filtered.map(s => (
                <button
                  key={s.name}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected.name === s.name
                      ? 'bg-purple-600/30 border-purple-500'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="text-white text-sm font-medium">{s.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[s.type]}`}>{s.type}</span>
                    <span className="text-gray-400 text-xs">{s.size}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
              <h3 className="text-white text-xl font-bold mb-1">{selected.name}</h3>
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[selected.type]}`}>{selected.type}</span>
                <span className="text-gray-400 text-xs">Discovered {selected.discovered}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Size', value: selected.size },
                  { label: 'Distance', value: selected.distance },
                  { label: 'Mass', value: selected.mass },
                  { label: 'Galaxies', value: selected.galaxies ?? 'Unknown' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                    <div className="text-white text-sm font-semibold">{s.value}</div>
                  </div>
                ))}
              </div>
              <p className="text-gray-300 text-sm">{selected.description}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'scale' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">
            The universe organizes matter on increasingly large scales. Each level contains the structure below it and is embedded within the structure above.
          </p>
          {SCALE_LEVELS.map((level, i) => (
            <div key={level.name} className="flex items-center gap-4 bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl font-bold text-gray-500 w-8 text-center">{i + 1}</div>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: level.color }} />
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-white font-semibold">{level.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{level.size}</span>
                </div>
                <div className="text-gray-300 text-sm">{level.description}</div>
                <div className="text-gray-500 text-xs mt-0.5">Example: {level.example}</div>
              </div>
              {/* Width bar */}
              <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, (i + 1) * 12.5)}%`, background: level.color }}
                />
              </div>
            </div>
          ))}

          <div className="mt-4 bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-xl p-4">
            <div className="text-purple-300 font-bold mb-2">Dark Matter Scaffolding</div>
            <p className="text-gray-300 text-sm">
              The cosmic web is shaped primarily by <strong className="text-purple-300">dark matter</strong> — invisible matter that outweighs visible matter 5:1. It forms the gravitational skeleton along which gas and galaxies accumulate. Without dark matter, the cosmic web we observe could not have formed in the ~13.8 billion years since the Big Bang.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Observable Universe', value: '93 Gly', desc: 'diameter' },
          { label: 'Largest Structure', value: '10 Gly', desc: 'Hercules-Corona Borealis Wall' },
          { label: 'Void Fraction', value: '~80%', desc: 'of universe volume' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-purple-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
