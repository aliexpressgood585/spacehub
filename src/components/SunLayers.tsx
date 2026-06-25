import { useState, useRef, useEffect, useCallback } from 'react'

interface SunLayer {
  name: string
  depth: string
  temp: string
  density: string
  radius_pct: number
  color: string
  desc: string
  facts: string[]
}

const LAYERS: SunLayer[] = [
  {
    name: 'Corona', depth: '~2,000 km above surface', temp: '1–10 million K',
    density: '10⁻¹² kg/m³', radius_pct: 100, color: '#fde68a',
    desc: 'The Sun\'s outer atmosphere extends millions of kilometers into space. Mysteriously, the corona is 300× hotter than the photosphere below it — the "coronal heating problem" is still unsolved. Solar wind, CMEs, and solar flares originate here. Visible only during total solar eclipses or with a coronagraph.',
    facts: ['Temperature: 1-10 million K (vs 5,778K surface)', 'Source of the solar wind', 'Extends 1–3 solar radii', 'Plasma density < Earth\'s best vacuum', 'Parker Solar Probe is studying it'],
  },
  {
    name: 'Chromosphere', depth: '500–2,500 km above photosphere', temp: '4,000–25,000 K',
    density: '~10⁻⁶ kg/m³', radius_pct: 100.2, color: '#fca5a5',
    desc: 'A thin layer of plasma just above the photosphere. Visible as a reddish-pink ring during total solar eclipses — the "color sphere". Contains spicules (jets of plasma), prominences, and filaments. The Hα (hydrogen-alpha) spectral line originates here, giving it its characteristic red color.',
    facts: ['Named for its reddish color (chroma = color)', 'Contains spicules: 10,000 km plasma jets', 'Prominences loop from here into corona', 'Visible in Hα (656nm) light'],
  },
  {
    name: 'Photosphere', depth: 'Surface layer (~500 km thick)', temp: '~5,778 K',
    density: '0.2 kg/m³', radius_pct: 99.5, color: '#fcd34d',
    desc: 'The visible "surface" of the Sun — though the Sun has no solid surface. This layer emits most of the visible light we receive. Sunspots appear here as cooler regions (4,000 K) with intense magnetic fields. Convection from below creates a granulation pattern of 1,000-km cells visible through telescopes.',
    facts: ['The layer we see as sunlight', 'Sunspots: 4,000 K (dark because cooler)', 'Granulation cells: 1,000 km across', 'Opacity is high — photons escape here', 'About 400 km thick'],
  },
  {
    name: 'Convective Zone', depth: '70–100% of solar radius', temp: '2 – 2 million K',
    density: '0.2 – 200 kg/m³', radius_pct: 85, color: '#f97316',
    desc: 'Energy from the radiative zone is transported by convection — hot plasma rises, cools, and sinks again in giant columns. This churning generates the solar magnetic field via a dynamo effect. The 11-year sunspot cycle and solar activity originate here from magnetic field amplification.',
    facts: ['Convection cells: hundreds of thousands km', 'Location of solar dynamo', 'Drives the 11-year solar cycle', 'Plasma moves at ~100 m/s', 'Extends from 70% to surface'],
  },
  {
    name: 'Radiative Zone', depth: '25–70% of solar radius', temp: '2–7 million K',
    density: '20,000–150,000 kg/m³', radius_pct: 50, color: '#ef4444',
    desc: 'Energy produced in the core travels outward as photons, but the plasma is so dense that photons are constantly absorbed and re-emitted, bouncing in random directions. A single photon may take 100,000 to 200,000 years to travel from the core to the edge of this zone. Energy transport is purely radiative — no convection.',
    facts: ['Light takes 100,000-200,000 years to cross', 'Photons undergo billions of collisions', 'No turbulent mixing here', 'Plasma 150× denser than water (at base)', 'Rotates differently from convective zone'],
  },
  {
    name: 'Core', depth: '0–25% of solar radius', temp: '~15 million K',
    density: '~150,000 kg/m³', radius_pct: 25, color: '#7c3aed',
    desc: 'The Sun\'s nuclear furnace. Gravitational pressure is so extreme that hydrogen atoms are forced together despite their positive charge. The proton-proton chain converts 620 million tons of hydrogen into helium every second, releasing energy as gamma rays. 99% of solar energy is produced in the inner 24% of the Sun\'s radius.',
    facts: ['620 million tons of H → He per second', 'Proton-proton chain fusion reaction', 'Energy: 3.8 × 10²⁶ watts', 'Temperature: 15 million K', '4 million tons converted to energy/second (E=mc²)', 'Neutrinos escape instantly — we can detect them!'],
  },
]

export default function SunLayers() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<SunLayer>(LAYERS[5])
  const animRef = useRef<number>(0)
  const tRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const maxR = Math.min(W, H) / 2 - 20

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#010108'
    ctx.fillRect(0, 0, W, H)

    const t = tRef.current * 0.01

    // Draw layers from outside in
    const layerRadii = [maxR * 1.3, maxR, maxR * 0.98, maxR * 0.7, maxR * 0.45, maxR * 0.25]
    const layerColors = [
      'rgba(253,230,138,0.15)',
      'rgba(252,165,165,0.3)',
      'rgba(252,211,77,0.9)',
      'rgba(249,115,22,0.95)',
      'rgba(239,68,68,0.98)',
      'rgba(124,58,237,1.0)',
    ]

    for (let i = 0; i < layerRadii.length; i++) {
      const r = layerRadii[i]
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, layerColors[i])
      grad.addColorStop(0.8, layerColors[i])
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Animated prominences
    for (let i = 0; i < 5; i++) {
      const angle = t * 0.3 + (i * Math.PI * 2) / 5
      const baseR = maxR * 0.98
      const tipR = baseR + 20 + 10 * Math.sin(t * 2 + i)
      const tipX = cx + tipR * Math.cos(angle)
      const tipY = cy + tipR * Math.sin(angle)
      const baseX1 = cx + baseR * Math.cos(angle - 0.08)
      const baseY1 = cy + baseR * Math.sin(angle - 0.08)
      const baseX2 = cx + baseR * Math.cos(angle + 0.08)
      const baseY2 = cy + baseR * Math.sin(angle + 0.08)

      ctx.beginPath()
      ctx.moveTo(baseX1, baseY1)
      ctx.quadraticCurveTo(
        cx + (tipR + 15) * Math.cos(angle + 0.1),
        cy + (tipR + 15) * Math.sin(angle + 0.1),
        tipX, tipY
      )
      ctx.quadraticCurveTo(
        cx + (tipR + 15) * Math.cos(angle - 0.1),
        cy + (tipR + 15) * Math.sin(angle - 0.1),
        baseX2, baseY2
      )
      ctx.closePath()
      ctx.fillStyle = 'rgba(252,165,165,0.5)'
      ctx.fill()
    }

    // Solar wind particles
    for (let i = 0; i < 80; i++) {
      const angle = ((i * 137.5 + t * 30) % 360) * Math.PI / 180
      const r = maxR * 1.1 + ((i * 61 + t * 15) % (maxR * 0.4))
      const px = cx + r * Math.cos(angle)
      const py = cy + r * Math.sin(angle)
      const opacity = 0.1 + ((i % 5) * 0.06)
      ctx.fillStyle = `rgba(253,230,138,${opacity})`
      ctx.beginPath()
      ctx.arc(px, py, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Granulation on photosphere surface
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2 + t * 0.05
      const r = maxR * 0.985
      const px = cx + r * Math.cos(angle)
      const py = cy + r * Math.sin(angle)
      const size = 3 + 2 * Math.sin(t + i)
      ctx.fillStyle = `rgba(255,220,100,${0.4 + 0.3 * Math.sin(t * 0.5 + i)})`
      ctx.beginPath()
      ctx.arc(px, py, size, 0, Math.PI * 2)
      ctx.fill()
    }

    // Highlight selected layer ring
    const selectedIdx = LAYERS.indexOf(selected)
    if (selectedIdx >= 0) {
      const r = layerRadii[selectedIdx] ?? maxR * 0.25
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Labels
    const labelLayers = [
      { name: 'Corona', r: maxR * 1.25 },
      { name: 'Chromosphere', r: maxR * 1.01 },
      { name: 'Photosphere', r: maxR * 0.94 },
    ]
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'center'
    for (const l of labelLayers) {
      ctx.fillText(l.name, cx, cy - l.r - 4)
    }
    ctx.textAlign = 'left'

    tRef.current++
    animRef.current = requestAnimationFrame(draw)
  }, [selected])

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">☀️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">The Sun — Layer by Layer</h2>
          <p className="text-yellow-300 text-sm">Explore the structure, temperatures, and physics of our star</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Canvas */}
        <div>
          <canvas
            ref={canvasRef}
            width={380}
            height={340}
            className="w-full rounded-xl border border-white/10"
            style={{ height: 300 }}
          />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {LAYERS.map(layer => (
              <button
                key={layer.name}
                onClick={() => setSelected(layer)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${selected.name === layer.name ? 'text-white border-white/40' : 'text-gray-400 border-white/10 hover:border-white/30'}`}
                style={{ backgroundColor: selected.name === layer.name ? layer.color + '30' : undefined }}
              >
                {layer.name}
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="space-y-3">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h3 className="text-xl font-bold mb-1" style={{ color: selected.color }}>{selected.name}</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { label: 'Depth/Location', value: selected.depth },
                { label: 'Temperature', value: selected.temp },
                { label: 'Density', value: selected.density },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/5 rounded-lg p-2">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-xs font-mono text-white">{value}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{selected.desc}</p>
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 font-semibold mb-2 uppercase">Key Facts</div>
            <ul className="space-y-1.5">
              {selected.facts.map(f => (
                <li key={f} className="text-xs text-gray-300 flex gap-2">
                  <span style={{ color: selected.color }}>▸</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-center">
        {[
          { label: 'Age', value: '4.6 billion yr', icon: '📅' },
          { label: 'Mass', value: '1.989 × 10³⁰ kg', icon: '⚖️' },
          { label: 'Luminosity', value: '3.8 × 10²⁶ W', icon: '💡' },
          { label: 'Time left on MS', value: '~5 billion yr', icon: '⏳' },
        ].map(f => (
          <div key={f.label} className="bg-white/5 rounded-lg p-2 border border-white/10">
            <div className="text-xl">{f.icon}</div>
            <div className="font-bold text-white font-mono text-xs">{f.value}</div>
            <div className="text-gray-500">{f.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
