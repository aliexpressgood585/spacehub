import { useState, useRef, useEffect, useCallback } from 'react'

interface GalaxyObject {
  name: string
  x: number
  y: number
  type: string
  dist_kly: number
  emoji: string
  desc: string
}

const OBJECTS: GalaxyObject[] = [
  { name: 'Galactic Center / Sgr A*', x: 0, y: 0, type: 'SMBH', dist_kly: 0, emoji: '⚫', desc: 'Sagittarius A* — our 4-million solar mass supermassive black hole. The center of everything.' },
  { name: 'Sun / Solar System', x: -26, y: 3, type: 'Star system', dist_kly: 26.7, emoji: '☀️', desc: 'We are here! Located in the Orion-Cygnus arm, ~26,700 light-years from the galactic center.' },
  { name: 'Galactic Bar', x: 0, y: 0, type: 'Structure', dist_kly: 0, emoji: '📏', desc: 'A central stellar bar structure ~27,000 light-years long.' },
  { name: 'Sagittarius Arm', x: -10, y: -20, type: 'Spiral arm', dist_kly: 15, emoji: '🌀', desc: 'Major spiral arm inside our position.' },
  { name: 'Perseus Arm', x: -35, y: 15, type: 'Spiral arm', dist_kly: 45, emoji: '🌀', desc: 'Major outer spiral arm, discovered via radio astronomy.' },
  { name: 'Cygnus Region', x: -18, y: -8, type: 'Star-forming', dist_kly: 5, emoji: '🌟', desc: 'Intense star-forming region in the Orion arm near our local neighborhood.' },
  { name: 'Orion Nebula', x: -28, y: 5, type: 'Nebula', dist_kly: 1.34, emoji: '💫', desc: 'Our nearest massive star-forming region. 1,344 light-years away.' },
  { name: 'Globular Cluster M13', x: -18, y: 28, type: 'Globular cluster', dist_kly: 22, emoji: '🔮', desc: 'Great Hercules Cluster. SETI message sent here in 1974. It\'ll arrive in 22,000 years.' },
  { name: 'Crab Nebula Pulsar', x: -24, y: 11, type: 'Pulsar/SNR', dist_kly: 6.5, emoji: '💥', desc: 'Remnant of the 1054 AD supernova seen by Chinese astronomers.' },
  { name: 'Galactic halo (edge)', x: 0, y: 0, type: 'Boundary', dist_kly: 100, emoji: '⭕', desc: 'The Milky Way\'s dark matter halo extends up to ~500,000 ly.' },
]

const SPIRAL_ARMS = [
  { name: 'Norma Arm', color: 'rgba(239,68,68,0.25)' },
  { name: 'Crux-Scutum Arm', color: 'rgba(249,115,22,0.25)' },
  { name: 'Sagittarius Arm', color: 'rgba(234,179,8,0.25)' },
  { name: 'Orion Arm (Local)', color: 'rgba(34,197,94,0.35)' },
  { name: 'Perseus Arm', color: 'rgba(99,102,241,0.25)' },
  { name: 'Outer Arm', color: 'rgba(168,85,247,0.2)' },
]

function drawArm(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, startAngle: number, color: string, nTurns: number, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  let first = true
  for (let t = 0; t <= nTurns * Math.PI * 2; t += 0.04) {
    const r = (t / (nTurns * Math.PI * 2)) * 45 * scale
    const angle = startAngle + t
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (first) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

export default function MilkyWayMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredObj, setHoveredObj] = useState<GalaxyObject | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showArms, setShowArms] = useState(true)
  const [showObjects, setShowObjects] = useState(true)
  const animRef = useRef<number>(0)
  const tRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#010108'
    ctx.fillRect(0, 0, W, H)

    // Background stars (milky way glow)
    for (let i = 0; i < 300; i++) {
      const sx = ((i * 137 + 7) % 100) / 100 * W
      const sy = ((i * 61 + 31) % 100) / 100 * H
      const opacity = 0.1 + (i % 10) * 0.05
      ctx.fillStyle = `rgba(255,255,240,${opacity})`
      ctx.beginPath()
      ctx.arc(sx, sy, Math.random() < 0.02 ? 1.2 : 0.6, 0, Math.PI * 2)
      ctx.fill()
    }

    const cx = W / 2
    const cy = H / 2
    const scale = (Math.min(W, H) / 2) / 50 * zoom

    // Galaxy glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 * scale)
    glow.addColorStop(0, 'rgba(255,255,200,0.3)')
    glow.addColorStop(0.2, 'rgba(200,180,255,0.15)')
    glow.addColorStop(0.5, 'rgba(100,100,200,0.08)')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, 45 * scale, 0, Math.PI * 2)
    ctx.fill()

    // Spiral arms
    if (showArms) {
      const t = tRef.current * 0.002
      SPIRAL_ARMS.forEach((arm, i) => {
        const startAngle = (i / SPIRAL_ARMS.length) * Math.PI * 2 + t
        drawArm(ctx, cx, cy, scale, startAngle, arm.color, 1.8, 12 * scale / zoom)
        // Mirror arm
        drawArm(ctx, cx, cy, scale, startAngle + Math.PI, arm.color, 1.8, 12 * scale / zoom)
      })
    }

    // Central bulge
    const bulge = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8 * scale)
    bulge.addColorStop(0, 'rgba(255,220,100,0.9)')
    bulge.addColorStop(0.3, 'rgba(255,180,50,0.5)')
    bulge.addColorStop(1, 'transparent')
    ctx.fillStyle = bulge
    ctx.beginPath()
    ctx.arc(cx, cy, 8 * scale, 0, Math.PI * 2)
    ctx.fill()

    // Bar
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(0.3)
    const barGrad = ctx.createLinearGradient(-15 * scale, 0, 15 * scale, 0)
    barGrad.addColorStop(0, 'transparent')
    barGrad.addColorStop(0.3, 'rgba(255,200,100,0.3)')
    barGrad.addColorStop(0.5, 'rgba(255,200,100,0.5)')
    barGrad.addColorStop(0.7, 'rgba(255,200,100,0.3)')
    barGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = barGrad
    ctx.fillRect(-15 * scale, -2 * scale, 30 * scale, 4 * scale)
    ctx.restore()

    // Objects
    if (showObjects) {
      OBJECTS.forEach(obj => {
        if (obj.name === 'Galactic Bar' || obj.name === 'Sagittarius Arm' || obj.name === 'Perseus Arm' || obj.name.includes('halo')) return

        const px = cx + obj.x * scale
        const py = cy + obj.y * scale

        const isHovered = hoveredObj?.name === obj.name
        const isSun = obj.name.includes('Sun')

        if (isSun) {
          // Glowing Sun marker
          const sunGlow = ctx.createRadialGradient(px, py, 0, px, py, 8)
          sunGlow.addColorStop(0, 'rgba(255,255,100,0.9)')
          sunGlow.addColorStop(0.4, 'rgba(255,200,50,0.4)')
          sunGlow.addColorStop(1, 'transparent')
          ctx.fillStyle = sunGlow
          ctx.beginPath()
          ctx.arc(px, py, 8, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = '#ffff44'
          ctx.beginPath()
          ctx.arc(px, py, 3, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = 'rgba(255,255,100,0.8)'
          ctx.font = 'bold 10px monospace'
          ctx.fillText('YOU ARE HERE', px + 6, py - 6)
        } else {
          ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(200,200,255,0.7)'
          ctx.beginPath()
          ctx.arc(px, py, isHovered ? 5 : 3, 0, Math.PI * 2)
          ctx.fill()

          if (isHovered || obj.type === 'SMBH') {
            ctx.fillStyle = 'rgba(255,255,255,0.8)'
            ctx.font = '9px monospace'
            ctx.fillText(obj.name, px + 6, py - 4)
          }
        }
      })
    }

    // Scale bar
    const barLengthKly = 10
    const barPx = barLengthKly * scale
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W - barPx - 20, H - 20)
    ctx.lineTo(W - 20, H - 20)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${barLengthKly} kly`, W - 20, H - 25)
    ctx.textAlign = 'left'

    tRef.current++
    animRef.current = requestAnimationFrame(draw)
  }, [zoom, showArms, showObjects, hoveredObj])

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width)
    const my = (e.clientY - rect.top) * (canvas.height / rect.height)
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const scale = (Math.min(canvas.width, canvas.height) / 2) / 50 * zoom

    let found: GalaxyObject | null = null
    for (const obj of OBJECTS) {
      if (obj.name.includes('Arm') || obj.name === 'Galactic Bar' || obj.name.includes('halo')) continue
      const px = cx + obj.x * scale
      const py = cy + obj.y * scale
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2)
      if (dist < 12) { found = obj; break }
    }
    setHoveredObj(found)
  }, [zoom])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🌌</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Milky Way Map</h2>
          <p className="text-purple-300 text-sm">Top-down view of our galaxy — 100,000 light-years across</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Zoom:</label>
          <input type="range" min={0.5} max={3} step={0.1} value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))} className="w-24 accent-purple-500" />
          <span className="text-xs text-purple-300">{zoom.toFixed(1)}×</span>
        </div>
        <button
          onClick={() => setShowArms(a => !a)}
          className={`px-3 py-1 text-xs rounded transition-all ${showArms ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-400'}`}
        >
          🌀 Arms
        </button>
        <button
          onClick={() => setShowObjects(o => !o)}
          className={`px-3 py-1 text-xs rounded transition-all ${showObjects ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-400'}`}
        >
          📍 Objects
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full rounded-xl border border-white/10 cursor-crosshair"
        style={{ height: 340 }}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setHoveredObj(null)}
      />

      {/* Hovered object info */}
      {hoveredObj ? (
        <div className="mt-3 bg-white/5 rounded-xl p-3 border border-purple-500/30 flex items-start gap-3">
          <span className="text-2xl">{hoveredObj.emoji}</span>
          <div>
            <div className="font-bold text-white">{hoveredObj.name}</div>
            <div className="text-xs text-gray-400">{hoveredObj.type} · {hoveredObj.dist_kly > 0 ? `${hoveredObj.dist_kly.toLocaleString()} kly from center` : 'Galactic Center'}</div>
            <div className="text-sm text-gray-300 mt-1">{hoveredObj.desc}</div>
          </div>
        </div>
      ) : (
        <div className="mt-3 bg-white/5 rounded-xl p-3 border border-white/10 text-xs text-gray-400">
          Hover over objects to learn about them. <span className="text-yellow-300">☀️ = You are here</span> — 26,700 ly from the galactic center, in the Orion-Cygnus spiral arm.
        </div>
      )}

      {/* Spiral arm legend */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SPIRAL_ARMS.map((arm) => (
          <div key={arm.name} className="flex items-center gap-2">
            <div className="w-4 h-2 rounded" style={{ backgroundColor: arm.color.replace('0.25', '0.8').replace('0.35', '0.9').replace('0.2', '0.7') }} />
            <span className="text-xs text-gray-400">{arm.name}</span>
            {arm.name.includes('Orion') && <span className="text-xs text-green-400">(us)</span>}
          </div>
        ))}
      </div>

      {/* Fun facts */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs text-center">
        {[
          { label: 'Diameter', value: '100,000 ly', icon: '⬌' },
          { label: 'Stars', value: '~200-400B', icon: '✨' },
          { label: 'Age', value: '13.6 billion yr', icon: '📅' },
          { label: 'Orbital period of Sun', value: '~225 million yr', icon: '⏱️' },
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
