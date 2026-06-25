import { useState, useRef, useEffect } from 'react'

interface BinarySystem {
  name: string
  type: string
  distance: string
  period: string
  m1: number
  m2: number
  separation: string
  interest: string
  icon: string
  color1: string
  color2: string
  description: string
}

const systems: BinarySystem[] = [
  {
    name: 'Alpha Centauri AB',
    type: 'Visual Binary',
    distance: '4.37 ly',
    period: '79.9 years',
    m1: 1.1, m2: 0.9,
    separation: '11–36 AU (varies)',
    interest: 'Nearest stellar system to Sun; G2+K1 pair orbit each other visibly',
    icon: '⭐',
    color1: '#fff7cc',
    color2: '#ffd580',
    description: 'Closest star system to Earth. Component A is nearly twin of our Sun (G2V), component B slightly cooler (K1V). They orbit each other in ~80 years. Proxima Centauri is a distant third member — possibly gravitationally bound.'
  },
  {
    name: 'Sirius A+B',
    type: 'Visual + WD Binary',
    distance: '8.6 ly',
    period: '50.1 years',
    m1: 2.1, m2: 1.02,
    separation: '8–31 AU',
    interest: 'Brightest star in sky; B component is a white dwarf (8,000–10,000 K, Earth-sized)',
    icon: '💎',
    color1: '#d0eaff',
    color2: '#aad4ff',
    description: 'Sirius A (A1V) is the brightest star visible from Earth. Sirius B, discovered in 1862, is a burned-out white dwarf remnant — 1.02 M☉ compressed to Earth\'s diameter. One of the first white dwarfs discovered.'
  },
  {
    name: 'Algol (β Persei)',
    type: 'Eclipsing Binary',
    distance: '92.8 ly',
    period: '2.87 days',
    m1: 3.17, m2: 0.7,
    separation: '0.062 AU',
    interest: 'The "Demon Star" — brightness dips 1.3 mag every 2.87 days as cooler star eclipses hotter',
    icon: '👁',
    color1: '#b0cfff',
    color2: '#ffd0a0',
    description: 'A prototype eclipsing binary: the dim K2 subgiant partially eclipses the bright B8V primary. Visible to naked eye, its regular dimming has been noted since antiquity. The "Algol paradox" — the less massive star is more evolved — solved by past mass transfer.'
  },
  {
    name: 'Mizar + Alcor',
    type: 'Sextuple System',
    distance: '82.9 ly',
    period: '≈20.5 years (Aa–Ab)',
    m1: 2.2, m2: 1.6,
    separation: '0.4 AU inner, wide',
    interest: 'First binary system telescopically resolved (1617). Mizar is itself a spectroscopic binary pair — 6 stars total',
    icon: '🌟',
    color1: '#d0d8ff',
    color2: '#c8d8ff',
    description: 'In Ursa Major\'s handle. Mizar consists of two pairs (Mizar Aa/Ab + Ba/Bb) orbiting each other, plus distant Alcor — itself a binary. Six stars total. A test of naked-eye visual acuity for ancient astronomers.'
  },
  {
    name: 'Cygnus X-1',
    type: 'X-ray Binary (BH)',
    distance: '6,070 ly',
    period: '5.6 days',
    m1: 21.2, m2: 40.6,
    separation: '0.2 AU',
    interest: 'First confirmed black hole (1971). 21 M☉ BH accretes from 40 M☉ O-supergiant companion',
    icon: '🕳️',
    color1: '#ffa0a0',
    color2: '#000000',
    description: 'A stellar-mass black hole accreting from a blue supergiant (HDE 226868). The black hole\'s X-ray luminosity ~10⁵ L☉. The subject of a famous bet between Hawking and Thorne — Hawking conceded in 1990. Hawking used it to argue for no firewalls.'
  },
  {
    name: 'PSR J0737-3039',
    type: 'Double Pulsar',
    distance: '1,700 ly',
    period: '2.4 hours',
    m1: 1.338, m2: 1.249,
    separation: '0.0089 AU',
    interest: 'Only known double pulsar system — both components are active pulsars. Tests of GR to 0.05% precision',
    icon: '⚡',
    color1: '#60efff',
    color2: '#40d0f0',
    description: 'Discovered in 2003 — the only system where both neutron stars are visible as pulsars. Orbital period shrinking by 7 mm/day due to gravitational wave emission, perfectly matching GR predictions. The most precise test of strong-field gravity.'
  },
]

interface LCPoint {
  phase: number
  mag: number
}

function visualBinaryCanvas(canvas: HTMLCanvasElement, m1: number, m2: number, color1: string, color2: string, t: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#03061a'
  ctx.fillRect(0, 0, W, H)

  // Stars, draw background stars
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137.5 * 13 + 7) % W
    const sy = (i * 97.3 * 7 + 11) % H
    ctx.beginPath()
    ctx.arc(sx, sy, 0.8, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.08})`
    ctx.fill()
  }

  const cx = W / 2, cy = H / 2
  const totalMass = m1 + m2
  const orbR = 70
  const r1 = orbR * m2 / totalMass
  const r2 = orbR * m1 / totalMass

  // Draw orbit paths
  ctx.beginPath()
  ctx.arc(cx, cy, r1, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, r2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Star positions
  const x1 = cx + Math.cos(t) * r1
  const y1 = cy + Math.sin(t) * r1
  const x2 = cx + Math.cos(t + Math.PI) * r2
  const y2 = cy + Math.sin(t + Math.PI) * r2

  const rad1 = Math.max(6, Math.sqrt(m1) * 7)
  const rad2 = Math.max(4, Math.sqrt(m2) * 5)

  // Glow + star 1
  const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, rad1 * 2.5)
  g1.addColorStop(0, color1 + 'ff')
  g1.addColorStop(0.4, color1 + '88')
  g1.addColorStop(1, color1 + '00')
  ctx.beginPath()
  ctx.arc(x1, y1, rad1 * 2.5, 0, Math.PI * 2)
  ctx.fillStyle = g1
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x1, y1, rad1, 0, Math.PI * 2)
  ctx.fillStyle = color1
  ctx.fill()

  // Glow + star 2
  const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, rad2 * 2)
  g2.addColorStop(0, color2 + 'ff')
  g2.addColorStop(0.4, color2 + '88')
  g2.addColorStop(1, color2 + '00')
  ctx.beginPath()
  ctx.arc(x2, y2, rad2 * 2, 0, Math.PI * 2)
  ctx.fillStyle = g2
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x2, y2, rad2, 0, Math.PI * 2)
  ctx.fillStyle = color2
  ctx.fill()

  // Center of mass dot
  ctx.beginPath()
  ctx.arc(cx, cy, 2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fill()

  // Labels
  ctx.font = '10px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(`${m1} M☉`, x1 + rad1 + 3, y1 - 4)
  ctx.fillText(`${m2} M☉`, x2 + rad2 + 3, y2 - 4)
}

function eclipsingLightCurve(type: string): LCPoint[] {
  const points: LCPoint[] = []
  for (let i = 0; i <= 100; i++) {
    const phase = i / 100
    let mag = 0
    if (type === 'Eclipsing Binary' || type === 'X-ray Binary (BH)') {
      // Primary minimum at phase 0 (or 1), secondary at 0.5
      const prim = Math.exp(-Math.pow((phase - 0) * 100 / 8, 2)) + Math.exp(-Math.pow((phase - 1) * 100 / 8, 2))
      const sec = Math.exp(-Math.pow((phase - 0.5) * 100 / 8, 2)) * 0.5
      mag = (prim + sec) * 1.3
    }
    points.push({ phase, mag })
  }
  return points
}

function LightCurveCanvas({ system }: { system: BinarySystem }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const isEclipsing = system.type.includes('Eclipsing') || system.type.includes('X-ray')

    if (isEclipsing) {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      const points = eclipsingLightCurve(system.type)
      ctx.beginPath()
      points.forEach((p, i) => {
        const x = (p.phase) * (W - 40) + 20
        const y = H - 20 - (p.mag / 1.5) * (H - 50)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.fillText('Phase', W / 2, H - 4)
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('Brightness', 4, 12)
      ctx.fillText('▼ Eclipse', 12, H / 2)
      return
    }

    const draw = () => {
      visualBinaryCanvas(canvas, system.m1, system.m2, system.color1, system.color2, tRef.current)
      tRef.current += 0.015
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [system])

  return <canvas ref={ref} width={300} height={200} className="w-full rounded-lg" />
}

export default function BinaryStars() {
  const [selected, setSelected] = useState(systems[0])

  const typeColor: Record<string, string> = {
    'Visual Binary': '#60a5fa',
    'Visual + WD Binary': '#a78bfa',
    'Eclipsing Binary': '#f59e0b',
    'Sextuple System': '#34d399',
    'X-ray Binary (BH)': '#ef4444',
    'Double Pulsar': '#38bdf8',
  }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Binary Star Systems</h2>
      <p className="text-gray-400 text-sm mb-5">Over 50% of stars are in multiple systems — laboratories for stellar physics, gravity, and evolution</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System list */}
        <div className="space-y-2">
          {systems.map(s => (
            <button key={s.name} onClick={() => setSelected(s)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === s.name ? 'bg-blue-900/40 border border-blue-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{s.icon}</span>
                <span className="font-semibold text-white text-sm">{s.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: typeColor[s.type] || '#94a3b8', backgroundColor: (typeColor[s.type] || '#94a3b8') + '22' }}>{s.type}</span>
                <span className="text-gray-500 text-xs">{s.distance}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <span className="text-sm px-2 py-0.5 rounded" style={{ color: typeColor[selected.type] || '#94a3b8', backgroundColor: (typeColor[selected.type] || '#94a3b8') + '22' }}>{selected.type}</span>
              </div>
            </div>

            <LightCurveCanvas system={selected} />

            <p className="text-gray-300 text-sm mt-4 leading-relaxed">{selected.description}</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Distance</div>
                <div className="text-white font-mono">{selected.distance}</div>
              </div>
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Orbital Period</div>
                <div className="text-white font-mono">{selected.period}</div>
              </div>
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Separation</div>
                <div className="text-white font-mono text-sm">{selected.separation}</div>
              </div>
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Mass 1</div>
                <div className="text-white font-mono">{selected.m1} M☉</div>
              </div>
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Mass 2</div>
                <div className="text-white font-mono">{selected.m2} M☉</div>
              </div>
              <div className="bg-blue-900/20 rounded p-3 border border-blue-800/30">
                <div className="text-blue-400 text-xs uppercase">Why Important</div>
                <div className="text-gray-300 text-xs mt-1">{selected.interest}</div>
              </div>
            </div>
          </div>

          {/* Types explainer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { type: 'Visual Binary', desc: 'Two stars resolved as separate points through a telescope. Orbital motion observed over years to decades.', color: '#60a5fa' },
              { type: 'Spectroscopic Binary', desc: 'Too close to resolve visually; detected via Doppler shift of spectral lines. Reveals radial velocities and mass ratio.', color: '#a78bfa' },
              { type: 'Eclipsing Binary', desc: 'Orbital plane aligned with Earth. Stars eclipse each other, producing a characteristic light curve with primary and secondary minima.', color: '#f59e0b' },
              { type: 'X-ray / Compact Binary', desc: 'One component is a neutron star or black hole. Accretes matter from companion, producing brilliant X-ray emission.', color: '#ef4444' },
            ].map(t => (
              <div key={t.type} className="bg-gray-800/60 rounded-lg p-3 border-l-2" style={{ borderColor: t.color }}>
                <div className="text-sm font-semibold mb-1" style={{ color: t.color }}>{t.type}</div>
                <p className="text-gray-400 text-xs">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
