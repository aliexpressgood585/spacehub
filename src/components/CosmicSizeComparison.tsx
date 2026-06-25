import { useState, useRef, useEffect } from 'react'

interface CosmicObject {
  name: string
  size_m: number
  emoji: string
  color: string
  category: string
  desc: string
  fun: string
}

const OBJECTS: CosmicObject[] = [
  { name: 'Proton', size_m: 1.7e-15, emoji: '⚛️', color: '#a78bfa', category: 'Quantum', desc: 'Core particle in every atomic nucleus', fun: 'A hydrogen atom is ~60,000× larger than its proton' },
  { name: 'DNA Strand', size_m: 2.5e-9, emoji: '🧬', color: '#34d399', category: 'Nano', desc: 'Width of a DNA double helix', fun: 'Your DNA stretched out would reach the Sun and back ~600 times' },
  { name: 'Bacterium', size_m: 2e-6, emoji: '🦠', color: '#10b981', category: 'Micro', desc: 'Typical bacterial cell size', fun: 'A bacterium is to an apple what a mouse is to Earth' },
  { name: 'Human Hair', size_m: 7e-5, emoji: '💈', color: '#f59e0b', category: 'Micro', desc: 'Width of a human hair (~70μm)', fun: 'A red blood cell is 100× thinner than a hair' },
  { name: 'Ant', size_m: 0.002, emoji: '🐜', color: '#fbbf24', category: 'Small', desc: 'Length of a typical ant', fun: 'Ants can lift 20× their own weight' },
  { name: 'Human', size_m: 1.7, emoji: '🧑', color: '#60a5fa', category: 'Human', desc: 'Average adult height', fun: 'You are the geometric mean between an atom and a star' },
  { name: 'Mount Everest', size_m: 8848, emoji: '🏔️', color: '#6b7280', category: 'Earth', desc: 'Earth\'s highest peak (8,848 m)', fun: 'Everest grows ~4mm per year due to tectonic activity' },
  { name: 'Earth', size_m: 1.274e7, emoji: '🌍', color: '#3b82f6', category: 'Planet', desc: 'Earth\'s diameter: 12,742 km', fun: 'Earth\'s radius is only 1/109th of the Sun\'s' },
  { name: 'Moon', size_m: 3.474e6, emoji: '🌕', color: '#9ca3af', category: 'Moon', desc: 'Moon\'s diameter: 3,474 km', fun: 'You could fit all 8 planets between Earth and the Moon' },
  { name: 'Jupiter', size_m: 1.43e8, emoji: '🪐', color: '#f97316', category: 'Planet', desc: 'Jupiter\'s diameter: 139,820 km', fun: '1,321 Earths could fit inside Jupiter' },
  { name: 'Sun', size_m: 1.392e9, emoji: '☀️', color: '#fcd34d', category: 'Star', desc: 'Solar diameter: 1.39 million km', fun: '109 Earths line up across the Sun\'s face' },
  { name: 'Sirius A', size_m: 2.4e9, emoji: '⭐', color: '#bfdbfe', category: 'Star', desc: 'Brightest star in the night sky, 1.7× Sun\'s diameter', fun: 'Sirius is 25× more luminous than our Sun' },
  { name: 'Arcturus', size_m: 3.5e10, emoji: '🌟', color: '#fde68a', category: 'Giant Star', desc: 'Orange giant, 25× Sun\'s diameter', fun: 'Arcturus is the brightest star in the northern celestial hemisphere' },
  { name: 'Antares', size_m: 1.05e12, emoji: '🔴', color: '#ef4444', category: 'Supergiant', desc: 'Red supergiant, ~700× Sun\'s diameter', fun: 'Antares is so large, Earth\'s orbit fits inside it' },
  { name: 'VY Canis Majoris', size_m: 2e12, emoji: '💥', color: '#dc2626', category: 'Hypergiant', desc: 'Hypergiant, ~1,400× Sun\'s diameter', fun: 'Largest known stars are ~2,000× the Sun\'s diameter' },
  { name: 'Pistol Nebula', size_m: 9.5e15, emoji: '🌌', color: '#8b5cf6', category: 'Nebula', desc: 'Pistol Nebula, ~1 light-year across', fun: 'Most nebulae are the birthplaces and graveyards of stars' },
  { name: 'Orion Nebula', size_m: 3.8e16, emoji: '💫', color: '#a78bfa', category: 'Nebula', desc: 'M42 — 4 light-years across', fun: 'The Orion Nebula contains ~700 young stars in formation' },
  { name: 'Solar System', size_m: 9e12, emoji: '🌀', color: '#22d3ee', category: 'System', desc: 'Diameter to Kuiper Belt edge: ~60 AU', fun: 'Light takes over 5 hours to cross our Solar System' },
  { name: 'Milky Way', size_m: 9.46e20, emoji: '🌌', color: '#6366f1', category: 'Galaxy', desc: 'Our galaxy: ~100,000 light-years across', fun: 'The Milky Way is estimated to have 200-400 billion stars' },
  { name: 'Andromeda Galaxy', size_m: 2.1e21, emoji: '🔮', color: '#7c3aed', category: 'Galaxy', desc: 'M31 — 220,000 light-years across, our nearest large neighbor', fun: 'Andromeda and Milky Way will collide in ~4.5 billion years' },
  { name: 'Local Group', size_m: 9.46e22, emoji: '🌐', color: '#4f46e5', category: 'Group', desc: '~10 million light-years across, ~50 galaxies', fun: 'The Local Group is falling toward the Virgo Supercluster' },
  { name: 'Observable Universe', size_m: 8.8e26, emoji: '🔭', color: '#f0abfc', category: 'Universe', desc: '93 billion light-years in diameter', fun: 'There are ~2 trillion galaxies in the observable universe' },
]

const CATEGORIES = ['All', 'Quantum', 'Nano', 'Micro', 'Small', 'Human', 'Earth', 'Moon', 'Planet', 'Star', 'Giant Star', 'Supergiant', 'Hypergiant', 'Nebula', 'System', 'Galaxy', 'Group', 'Universe']

function formatSize(m: number): string {
  if (m < 1e-9) return `${(m * 1e15).toFixed(1)} fm`
  if (m < 1e-6) return `${(m * 1e9).toFixed(1)} nm`
  if (m < 1e-3) return `${(m * 1e6).toFixed(1)} μm`
  if (m < 1) return `${(m * 100).toFixed(1)} cm`
  if (m < 1000) return `${m.toFixed(1)} m`
  if (m < 1e6) return `${(m / 1e3).toFixed(1)} km`
  if (m < 9.46e15) return `${(m / 1e9).toFixed(2)} million km`
  const ly = m / 9.461e15
  if (ly < 1) return `${(ly * 365.25).toFixed(2)} light-days`
  if (ly < 1000) return `${ly.toFixed(2)} light-years`
  if (ly < 1e6) return `${(ly / 1e3).toFixed(2)} kly`
  if (ly < 1e9) return `${(ly / 1e6).toFixed(2)} Mly`
  return `${(ly / 1e9).toFixed(2)} Gly`
}

function formatExponent(m: number): string {
  const exp = Math.floor(Math.log10(m))
  const coef = m / Math.pow(10, exp)
  return `${coef.toFixed(2)} × 10^${exp} m`
}

export default function CosmicSizeComparison() {
  const [objA, setObjA] = useState<CosmicObject>(OBJECTS[5])
  const [objB, setObjB] = useState<CosmicObject>(OBJECTS[10])
  const [filterCat, setFilterCat] = useState('All')
  const [searchQ, setSearchQ] = useState('')
  const [mode, setMode] = useState<'compare' | 'scale'>('compare')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const filtered = OBJECTS.filter(o =>
    (filterCat === 'All' || o.category === filterCat) &&
    (searchQ === '' || o.name.toLowerCase().includes(searchQ.toLowerCase()))
  )

  const ratio = objB.size_m / objA.size_m

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#010810'
    ctx.fillRect(0, 0, W, H)

    // Draw scale bar
    const logA = Math.log10(objA.size_m)
    const logB = Math.log10(objB.size_m)
    const logMin = Math.log10(OBJECTS[0].size_m) - 1
    const logMax = Math.log10(OBJECTS[OBJECTS.length - 1].size_m) + 1
    const logRange = logMax - logMin

    const toX = (logVal: number) => ((logVal - logMin) / logRange) * (W - 40) + 20

    // Background scale gradient
    const grad = ctx.createLinearGradient(20, 0, W - 20, 0)
    grad.addColorStop(0, 'rgba(167,139,250,0.1)')
    grad.addColorStop(0.3, 'rgba(96,165,250,0.1)')
    grad.addColorStop(0.6, 'rgba(34,211,238,0.1)')
    grad.addColorStop(1, 'rgba(240,171,252,0.1)')
    ctx.fillStyle = grad
    ctx.fillRect(20, H / 2 - 2, W - 40, 4)

    // Scale tick marks for powers of 10
    for (let logVal = Math.ceil(logMin); logVal <= Math.floor(logMax); logVal++) {
      const x = toX(logVal)
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(x, 20)
      ctx.lineTo(x, H - 20)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`10^${logVal}`, x, H - 8)
    }

    // Draw object markers
    OBJECTS.forEach(obj => {
      const x = toX(Math.log10(obj.size_m))
      const isA = obj.name === objA.name
      const isB = obj.name === objB.name

      if (isA || isB) {
        const color = isA ? objA.color : objB.color
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, H / 2, isA || isB ? 7 : 3, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = color
        ctx.font = `bold 10px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(obj.emoji + ' ' + obj.name, x, isA ? H / 2 - 18 : H / 2 + 28)
      } else {
        ctx.fillStyle = 'rgba(200,200,255,0.35)'
        ctx.beginPath()
        ctx.arc(x, H / 2, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    })

    // Highlight span between A and B
    const xA = toX(logA)
    const xB = toX(logB)
    const xMin = Math.min(xA, xB)
    const xMax = Math.max(xA, xB)
    ctx.fillStyle = 'rgba(99,102,241,0.12)'
    ctx.fillRect(xMin, H / 2 - 10, xMax - xMin, 20)
    ctx.strokeStyle = 'rgba(99,102,241,0.5)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(xMin, H / 2 - 10, xMax - xMin, 20)

    ctx.textAlign = 'left'
  }, [objA, objB])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">📏</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Cosmic Size Comparison</h2>
          <p className="text-cyan-300 text-sm">From quarks to the observable universe — 42 orders of magnitude</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        {(['compare', 'scale'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-cyan-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {m === 'compare' ? '⚖️ Compare Two' : '📏 Scale View'}
          </button>
        ))}
      </div>

      {mode === 'compare' && (
        <>
          {/* Search + filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              placeholder="Search objects..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 w-40"
            />
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Object list */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 max-h-48 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {filtered.map(obj => (
              <div key={obj.name} className="flex gap-1">
                <button
                  onClick={() => setObjA(obj)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs text-left transition-all border ${objA.name === obj.name ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-white/10 text-gray-400 hover:border-white/30'}`}
                >
                  <span className="mr-1">{obj.emoji}</span>{obj.name}
                </button>
                <button
                  onClick={() => setObjB(obj)}
                  className={`px-1.5 py-1.5 rounded-lg text-xs transition-all border ${objB.name === obj.name ? 'border-red-500 bg-red-900/30 text-red-300' : 'border-white/10 text-gray-500 hover:border-white/30'}`}
                  title="Set as Object B"
                >
                  B
                </button>
              </div>
            ))}
          </div>

          {/* Comparison display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[{ obj: objA, label: 'A', color: 'blue' }, { obj: objB, label: 'B', color: 'red' }].map(({ obj, label, color }) => (
              <div key={label} className={`bg-white/5 rounded-xl p-4 border ${color === 'blue' ? 'border-blue-500/30' : 'border-red-500/30'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-4xl">{obj.emoji}</span>
                  <div>
                    <div className={`font-bold text-white text-base`}>{obj.name}</div>
                    <div className="text-xs text-gray-500">{obj.category}</div>
                  </div>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${color === 'blue' ? 'bg-blue-900/30 text-blue-300' : 'bg-red-900/30 text-red-300'}`}>{label}</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-cyan-300 font-mono font-bold">{formatSize(obj.size_m)}</div>
                  <div className="text-gray-500 font-mono text-xs">{formatExponent(obj.size_m)}</div>
                  <div className="text-gray-400 text-xs mt-2">{obj.desc}</div>
                  <div className="text-yellow-400/80 text-xs mt-1 italic">💡 {obj.fun}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Ratio display */}
          <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-xl p-4 border border-indigo-500/20 mb-6 text-center">
            <div className="text-3xl mb-1">
              {ratio >= 1 ? `${objB.name} is` : `${objA.name} is`}
            </div>
            <div className="text-4xl font-black text-white font-mono mb-1">
              {ratio >= 1 ? ratio.toExponential(2) : (1/ratio).toExponential(2)}×
            </div>
            <div className="text-gray-300 text-sm">
              {ratio >= 1 ? `larger than ${objA.name}` : `larger than ${objB.name}`}
            </div>
            <div className="text-gray-500 text-xs mt-2">
              ({Math.abs(Math.log10(ratio)).toFixed(1)} orders of magnitude difference)
            </div>
          </div>
        </>
      )}

      {/* Scale canvas */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">Log scale — all {OBJECTS.length} objects from proton to observable universe</div>
        <canvas
          ref={canvasRef}
          width={700}
          height={100}
          className="w-full rounded-xl border border-white/10"
          style={{ height: 100 }}
        />
      </div>

      {mode === 'scale' && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {OBJECTS.map(obj => {
            const logVal = Math.log10(obj.size_m)
            const logMin = Math.log10(OBJECTS[0].size_m)
            const logMax = Math.log10(OBJECTS[OBJECTS.length - 1].size_m)
            const pct = ((logVal - logMin) / (logMax - logMin)) * 100
            return (
              <div key={obj.name} className="flex items-center gap-3 group">
                <span className="text-lg w-8 text-center flex-shrink-0">{obj.emoji}</span>
                <div className="w-32 text-xs text-gray-300 flex-shrink-0">{obj.name}</div>
                <div className="flex-1 bg-white/5 rounded-full h-2 relative">
                  <div
                    className="absolute left-0 top-0 h-2 rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: obj.color, opacity: 0.8 }}
                  />
                </div>
                <div className="w-28 text-xs text-gray-400 font-mono text-right flex-shrink-0">{formatSize(obj.size_m)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Fun fact strip */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-center">
        {[
          { label: 'Size range', value: '10⁴²', icon: '📏' },
          { label: 'Objects shown', value: `${OBJECTS.length}`, icon: '🔢' },
          { label: 'Smallest', value: 'Proton (1.7 fm)', icon: '⚛️' },
          { label: 'Largest', value: 'Observable Universe', icon: '🔭' },
        ].map(f => (
          <div key={f.label} className="bg-white/5 rounded-lg p-2 border border-white/10">
            <div className="text-xl">{f.icon}</div>
            <div className="font-bold text-white font-mono">{f.value}</div>
            <div className="text-gray-500">{f.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
