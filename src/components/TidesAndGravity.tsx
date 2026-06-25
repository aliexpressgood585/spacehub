import { useState, useRef, useEffect } from 'react'

interface TidalEffect {
  name: string
  bodies: string
  description: string
  magnitude: string
  consequence: string
  icon: string
}

interface GravityFact {
  title: string
  value: string
  detail: string
  color: string
}

interface RocheBody {
  body: string
  primary: string
  rocheLimit: number
  unit: string
  context: string
}

const tidalEffects: TidalEffect[] = [
  { name: 'Ocean Tides', bodies: 'Earth – Moon – Sun', description: 'Differential gravitational pull across Earth\'s diameter creates bulges on both Moon-facing and far sides. Sun adds ~46% of Moon\'s tidal force.', magnitude: '~0.5m differential gravity', consequence: 'Spring tides (syzygy) = 20–30% stronger. Neap tides (quadrature) = 20–30% weaker.', icon: '🌊' },
  { name: 'Lunar Recession', bodies: 'Moon – Earth', description: 'Earth\'s tidal bulge slightly leads the Moon due to Earth\'s rotation. This transfers angular momentum from Earth to Moon — Moon spirals outward at 3.8 cm/year.', magnitude: '3.8 cm/year recession', consequence: 'Moon was 30% closer 4 Gya. Total solar eclipses won\'t be possible in ~600 million years.', icon: '🌙' },
  { name: 'Earth\'s Slowing Rotation', bodies: 'Earth – Moon', description: 'As angular momentum transfers to Moon, Earth\'s rotation slows. Day was 18 hours 1.4 billion years ago. Tidal friction dissipates ~3.75 TW of energy.', magnitude: '1.4 ms longer per century', consequence: 'Stromatolites (fossil tidal rhythmites) record ancient day lengths.', icon: '⏱️' },
  { name: 'Tidal Heating', bodies: 'Io – Jupiter', description: 'Io\'s orbit is kept slightly elliptical by Laplace resonance with Europa/Ganymede. This causes periodic tidal squeezing that generates ~100× more heat than Earth\'s internal heat.', magnitude: '100 TW heat output', consequence: 'Io is the most volcanically active body in solar system — 400+ active volcanoes.', icon: '🌋' },
  { name: 'Enceladus Plumes', bodies: 'Enceladus – Saturn', description: 'Tidal heating maintains a subsurface liquid water ocean beneath Enceladus\'s ice shell. Plumes of water ice and organics erupt through "tiger stripe" fractures.', magnitude: '4 GW tidal power', consequence: 'Liquid water + organics = potential habitability. Cassini flew through plumes.', icon: '⛲' },
  { name: 'Tidal Disruption (TDE)', bodies: 'Star – Supermassive BH', description: 'When a star passes within the Roche limit of a supermassive black hole, tidal forces exceed stellar self-gravity. Star is "spaghettified" and forms an accretion disk.', magnitude: 'Tidal force > stellar gravity', consequence: 'Flare of optical/X-ray radiation lasting months as debris accretes. Detectable at cosmological distances.', icon: '🕳️' },
]

const gravityFacts: GravityFact[] = [
  { title: 'G (Gravitational constant)', value: '6.674×10⁻¹¹ N·m²/kg²', detail: 'Weakest fundamental force. Known to only 4 significant figures — hardest constant to measure.', color: '#60a5fa' },
  { title: 'Earth surface gravity', value: '9.80665 m/s²', detail: 'Varies from 9.76 (equator) to 9.83 m/s² (poles). GRACE satellite maps gravity anomalies to ±0.001 mGal.', color: '#34d399' },
  { title: 'Sun surface gravity', value: '274 m/s²', detail: '28× Earth\'s. A 70 kg person would weigh 19,180 N on the Sun\'s surface.', color: '#f97316' },
  { title: 'Gravitational time dilation', value: 'GPS correction: 45 µs/day', detail: 'GPS satellites run 38 µs fast per day (SR: −7, GR: +45). Without correction, position error = 10 km/day.', color: '#a78bfa' },
  { title: 'Escape velocity Earth', value: '11.2 km/s', detail: 'Must exceed this to escape Earth without thrust. Moon escape: 2.38 km/s. Black hole event horizon: c (light speed).', color: '#f87171' },
  { title: 'Perihelion precession', value: '43 arcsec/century', detail: 'Mercury\'s extra precession beyond Newtonian predictions — explained by general relativity. First major GR confirmation.', color: '#fde68a' },
]

const rocheBodies: RocheBody[] = [
  { body: 'Moon', primary: 'Earth', rocheLimit: 9492, unit: 'km', context: 'Moon orbits at 384,400 km — well outside. If Moon were at Roche limit it would shatter into rings.' },
  { body: 'Saturn Rings', primary: 'Saturn', rocheLimit: 140000, unit: 'km', context: 'Ring system extends to ~137,000 km — inside Roche limit. That\'s why rings exist, not a moon.' },
  { body: 'Comet Shoemaker-Levy 9', primary: 'Jupiter', rocheLimit: 170000, unit: 'km', context: 'Passed within 40,000 km in 1992 — well inside. Tidally disrupted into 21 fragments, impacted 1994.' },
  { body: 'Artificial satellite', primary: 'Earth', rocheLimit: 9500, unit: 'km', context: 'ISS at 408 km is inside Roche limit but held together by structural integrity, not just self-gravity.' },
  { body: 'Exomoon candidate', primary: 'Kepler-1625b', rocheLimit: 800000, unit: 'km', context: 'Proposed Neptune-sized exomoon orbits outside Roche limit — if confirmed, first known exomoon.' },
]

function TideCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2

    let t = 0
    let frame: number

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      // Moon position
      const moonAngle = t * 0.5
      const moonDist = 140
      const mx = cx + Math.cos(moonAngle) * moonDist
      const my = cy + Math.sin(moonAngle) * moonDist

      // Earth with tidal distortion
      ctx.save()
      ctx.translate(cx, cy)

      // Tidal elongation toward Moon
      const squishAngle = moonAngle
      ctx.rotate(squishAngle)
      const earthGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 45)
      earthGrad.addColorStop(0, '#1d4ed8')
      earthGrad.addColorStop(0.7, '#1e40af')
      earthGrad.addColorStop(1, '#1e3a8a')
      ctx.beginPath()
      ctx.ellipse(0, 0, 48, 40, 0, 0, Math.PI * 2)
      ctx.fillStyle = earthGrad
      ctx.fill()

      // Ocean tidal bulge (exaggerated)
      ctx.beginPath()
      ctx.ellipse(0, 0, 52, 38, 0, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(96,165,250,0.4)'
      ctx.lineWidth = 5
      ctx.stroke()

      ctx.restore()

      // Moon
      ctx.beginPath()
      ctx.arc(mx, my, 14, 0, Math.PI * 2)
      const moonGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 14)
      moonGrad.addColorStop(0, '#e2e8f0')
      moonGrad.addColorStop(1, '#94a3b8')
      ctx.fillStyle = moonGrad
      ctx.fill()

      // Moon orbit
      ctx.beginPath()
      ctx.arc(cx, cy, moonDist, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(148,163,184,0.15)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Labels
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.fillText('Earth (tidal bulge exaggerated)', cx - 75, cy + 65)
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('Moon', mx - 15, my + 25)

      t += 0.02
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} width={420} height={260} className="w-full rounded-lg" />
}

type Tab = 'tidal' | 'gravity' | 'roche'

export default function TidesAndGravity() {
  const [tab, setTab] = useState<Tab>('tidal')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tidal', label: 'Tidal Effects' },
    { id: 'gravity', label: 'Gravity Facts' },
    { id: 'roche', label: 'Roche Limits' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Tides & Gravity</h2>
      <p className="text-gray-400 text-sm mb-5">The weakest force that shapes worlds, moons, and entire galaxies</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'tidal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TideCanvas />
          <div className="space-y-3">
            {tidalEffects.map(e => (
              <div key={e.name} className="bg-gray-800/60 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{e.icon}</span>
                  <div>
                    <h4 className="text-white font-semibold text-sm">{e.name}</h4>
                    <div className="text-gray-500 text-xs">{e.bodies}</div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-2">{e.description}</p>
                <div className="text-cyan-400 text-xs font-mono">{e.magnitude}</div>
                <div className="text-gray-300 text-xs mt-1">↳ {e.consequence}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'gravity' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gravityFacts.map(f => (
            <div key={f.title} className="bg-gray-800/60 rounded-lg p-4 border-l-4" style={{ borderColor: f.color }}>
              <h4 className="text-gray-400 text-sm font-semibold mb-2">{f.title}</h4>
              <div className="text-2xl font-bold font-mono mb-2" style={{ color: f.color }}>{f.value}</div>
              <p className="text-gray-400 text-sm">{f.detail}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'roche' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-cyan-900/20 rounded-lg p-4 border border-cyan-800/40">
            The Roche limit is the distance from a primary body within which tidal forces overcome a satellite's self-gravity, causing it to disintegrate. For a fluid body: d = 2.44 × R_primary × (ρ_primary / ρ_satellite)^(1/3). Saturn's rings exist because their material is within Saturn's Roche limit.
          </p>
          {rocheBodies.map(r => (
            <div key={`${r.body}-${r.primary}`} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-white font-bold">{r.body} in {r.primary} system</h4>
                  <div className="text-cyan-400 font-mono text-lg">Roche limit: {r.rocheLimit.toLocaleString()} {r.unit}</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm">{r.context}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
