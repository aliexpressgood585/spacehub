import { useState, useRef, useEffect } from 'react'

interface OrbitalLaw {
  name: string
  law: string
  formula: string
  description: string
  example: string
  author: string
  year: number
}

interface LagrangePoint {
  id: string
  location: string
  stability: 'stable' | 'unstable'
  description: string
  missions: string[]
  color: string
}

interface OrbitalResonance {
  bodies: string
  ratio: string
  type: 'mean motion' | 'spin-orbit' | 'secular'
  description: string
  effect: string
}

const orbitalLaws: OrbitalLaw[] = [
  { name: 'First Law', law: 'Law of Ellipses', formula: 'r = a(1-e²)/(1+e·cosθ)', description: 'Planets orbit the Sun in ellipses with the Sun at one focus. True for any two-body gravitational system.', example: 'Earth\'s orbit is nearly circular (e=0.017). Pluto\'s is very elliptical (e=0.25).', author: 'Johannes Kepler', year: 1609 },
  { name: 'Second Law', law: 'Law of Equal Areas', formula: 'dA/dt = L/(2m) = const', description: 'A line segment joining a planet to the Sun sweeps equal areas in equal times. Conservation of angular momentum.', example: 'Earth moves fastest in January (perihelion, 30.3 km/s) and slowest in July (aphelion, 29.3 km/s).', author: 'Johannes Kepler', year: 1609 },
  { name: 'Third Law', law: 'Law of Harmonies', formula: 'T² = (4π²/GM)·a³', description: 'The square of a planet\'s orbital period is proportional to the cube of its semi-major axis. Unified solar system dynamics.', example: 'Mars at 1.52 AU has a period of 1.88 years: √(1.52³) ≈ 1.87 ✓', author: 'Johannes Kepler', year: 1619 },
  { name: 'Law of Gravitation', law: 'Universal Gravitation', formula: 'F = G·m₁m₂/r²', description: 'Every mass attracts every other mass with a force proportional to their masses and inversely proportional to the square of the distance.', example: 'Explains why Moon orbits Earth, Earth orbits Sun, and tides rise twice daily.', author: 'Isaac Newton', year: 1687 },
  { name: 'Vis-Viva Equation', law: 'Orbital Energy', formula: 'v² = GM(2/r - 1/a)', description: 'Gives instantaneous orbital velocity at any point. Bridges position and speed without requiring time. Foundation of orbital maneuver planning.', example: 'LEO circular orbit: v = √(GM/r) ≈ 7.8 km/s. GEO: 3.07 km/s.', author: 'Johann Lambert', year: 1761 },
]

const lagrangePoints: LagrangePoint[] = [
  { id: 'L1', location: 'Between Earth and Sun (1.5 M km from Earth)', stability: 'unstable', description: 'Gravity of both bodies balance with centrifugal force. Objects here see the Sun and Earth in constant view. Halo orbits require station-keeping.', missions: ['SOHO', 'ACE', 'DSCOVR', 'Lagrange satellite (ESA)'], color: '#f87171' },
  { id: 'L2', location: 'Beyond Earth from Sun (1.5 M km from Earth)', stability: 'unstable', description: 'Sun always behind Earth, allowing objects to stay cold. Ideal for infrared and microwave space telescopes. Station-keeping required.', missions: ['JWST', 'Gaia', 'Planck', 'Herschel', 'WMAP'], color: '#60a5fa' },
  { id: 'L3', location: 'Opposite side of Sun from Earth', stability: 'unstable', description: 'Always hidden behind the Sun. Not physically useful for missions. Planet of science fiction counter-Earth. Very weakly unstable.', missions: ['No current missions'], color: '#6b7280' },
  { id: 'L4', location: '60° ahead of Earth in orbit', stability: 'stable', description: 'True gravitational stability — perturbations cause tadpole orbits, not escape. Trojan asteroids accumulate here naturally.', missions: ['Earth Trojans (2010 TK7)', 'Greek asteroids at Jupiter L4'], color: '#34d399' },
  { id: 'L5', location: '60° behind Earth in orbit', stability: 'stable', description: 'Mirror of L4. Also accumulates Trojan bodies. L5 Society founded in 1975 to advocate space colonies here. Jupiter\'s Trojan asteroids.', missions: ['Trojan asteroids', 'Proposed space colony concepts'], color: '#4ade80' },
]

const resonances: OrbitalResonance[] = [
  { bodies: 'Moon – Earth', ratio: '1:1', type: 'spin-orbit', description: 'Moon\'s rotation period equals its orbital period — permanent tidal lock. We always see the same lunar face.', effect: 'Only one side of Moon visible from Earth' },
  { bodies: 'Pluto – Neptune', ratio: '2:3', type: 'mean motion', description: 'For every 2 Pluto orbits, Neptune completes exactly 3. Prevents close approaches despite crossing orbits.', effect: 'Protects Pluto from Neptune\'s gravity' },
  { bodies: 'Europa – Ganymede – Io', ratio: '1:2:4', type: 'mean motion', description: 'Laplace resonance — for every Ganymede orbit, Europa orbits twice and Io four times. Maintained for billions of years.', effect: 'Tidal heating melts Io\'s interior (volcanism), warms Europa\'s subsurface ocean' },
  { bodies: 'Mercury – Sun', ratio: '3:2', type: 'spin-orbit', description: 'Mercury rotates 3 times for every 2 orbits. Not tidally locked but in resonance due to eccentric orbit.', effect: 'Mercury experiences very slow days (~176 Earth days)' },
  { bodies: 'Saturn ring gaps', ratio: 'Various', type: 'mean motion', description: 'Kirkwood gaps in Saturn\'s rings occur where ring particles would be in resonance with moons. Moons clear these gaps.', effect: 'Cassini Division cleared by 2:1 resonance with Mimas' },
  { bodies: 'TRAPPIST-1 planets', ratio: '8:5:3:2', type: 'mean motion', description: 'Multiple planets in near-resonance Laplace chain. Allows system stability over billions of years despite close spacing.', effect: 'All 7 planets could fit within Mercury\'s orbit — yet stable' },
]

function OrbitCanvas({ selected }: { selected: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W * 0.45, cy = H / 2

    let t = 0
    const a = 120, e = selected === 1 ? 0.7 : 0.3
    const b = a * Math.sqrt(1 - e * e)
    const focusX = a * e

    let frame: number
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      // Draw ellipse
      ctx.beginPath()
      ctx.ellipse(cx - focusX, cy, a, b, 0, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(148,163,184,0.3)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Draw swept area (Law 2 visualization)
      const theta1 = t % (Math.PI * 2)
      const theta2 = theta1 - 0.5

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      for (let th = theta2; th <= theta1; th += 0.05) {
        const r = a * (1 - e * e) / (1 + e * Math.cos(th))
        ctx.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(96,165,250,0.15)'
      ctx.fill()

      // Sun at focus
      ctx.beginPath()
      ctx.arc(cx, cy, 8, 0, Math.PI * 2)
      const sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8)
      sunGrad.addColorStop(0, '#fef08a')
      sunGrad.addColorStop(1, '#f97316')
      ctx.fillStyle = sunGrad
      ctx.fill()

      // Planet position
      const r = a * (1 - e * e) / (1 + e * Math.cos(theta1))
      const px = cx + Math.cos(theta1) * r
      const py = cy + Math.sin(theta1) * r

      ctx.beginPath()
      ctx.arc(px, py, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#3b82f6'
      ctx.fill()

      // Velocity vector
      const speed = selected === 3 ? (1 / r) * 25 : 1
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px - Math.sin(theta1) * speed * 15, py + Math.cos(theta1) * speed * 15)
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = 2
      ctx.stroke()

      // Labels
      ctx.fillStyle = '#94a3b8'
      ctx.font = '11px sans-serif'
      ctx.fillText('☀', cx - 5, cy + 4)
      ctx.fillText('perihelion', cx + a * (1-e) - 10, cy + 20)
      ctx.fillText('aphelion', cx - a * (1+e) + 5, cy + 20)

      t += selected === 0 ? 0.01 : selected === 4 ? 0.03 : 0.018
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [selected])
  return <canvas ref={ref} width={420} height={220} className="w-full rounded-lg" />
}

type Tab = 'laws' | 'lagrange' | 'resonances'

export default function CelestialMechanics() {
  const [tab, setTab] = useState<Tab>('laws')
  const [selectedLaw, setSelectedLaw] = useState(0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'laws', label: 'Orbital Laws' },
    { id: 'lagrange', label: 'Lagrange Points' },
    { id: 'resonances', label: 'Orbital Resonances' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Celestial Mechanics</h2>
      <p className="text-gray-400 text-sm mb-5">The mathematics governing how everything in space moves</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'laws' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {orbitalLaws.map((law, i) => (
              <button key={law.name} onClick={() => setSelectedLaw(i)} className={`w-full text-left p-3 rounded-lg transition-colors ${selectedLaw === i ? 'bg-amber-900/40 border border-amber-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="text-white font-semibold text-sm">{law.name}: {law.law}</div>
                <div className="text-amber-400 font-mono text-xs mt-1">{law.formula}</div>
                <div className="text-gray-500 text-xs mt-0.5">{law.author}, {law.year}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <OrbitCanvas selected={selectedLaw} />
            <div className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-bold text-white">{orbitalLaws[selectedLaw].name}: {orbitalLaws[selectedLaw].law}</h3>
              </div>
              <div className="bg-gray-900/60 rounded p-3 mb-3 font-mono text-amber-300 text-sm text-center">{orbitalLaws[selectedLaw].formula}</div>
              <p className="text-gray-300 text-sm mb-3">{orbitalLaws[selectedLaw].description}</p>
              <div className="bg-blue-900/20 rounded p-3 border border-blue-800/30">
                <div className="text-blue-400 text-xs font-semibold uppercase mb-1">Example</div>
                <p className="text-gray-300 text-sm">{orbitalLaws[selectedLaw].example}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'lagrange' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-amber-900/20 rounded-lg p-4 border border-amber-800/40">
            Lagrange points are positions in a two-body gravitational system where a third small body experiences zero net force in the rotating reference frame. Discovered by Euler (L1–L3) and Lagrange (L4–L5). Each Earth-Sun Lagrange point is ~1.5 million km from Earth.
          </p>
          <div className="space-y-3">
            {lagrangePoints.map(lp => (
              <div key={lp.id} className="bg-gray-800/60 rounded-lg p-4 border-l-4" style={{ borderColor: lp.color }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold" style={{ color: lp.color }}>{lp.id}</span>
                    <div>
                      <div className="text-white font-medium">{lp.location}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${lp.stability === 'stable' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>{lp.stability}</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">{lp.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lp.missions.map(m => (
                    <span key={m} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{m}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'resonances' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-amber-900/20 rounded-lg p-4 border border-amber-800/40">
            Orbital resonance occurs when bodies exert regular gravitational influence on each other due to ratio of orbital periods being close to a simple integer ratio. Resonances can be stabilizing (Trojan asteroids) or destabilizing (Kirkwood gaps), shaping the architecture of planetary systems.
          </p>
          {resonances.map(r => (
            <div key={`${r.bodies}-${r.ratio}`} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-2 flex-wrap">
                <span className="text-white font-bold">{r.bodies}</span>
                <span className="text-amber-400 font-mono bg-amber-900/30 px-2 py-0.5 rounded text-sm">{r.ratio} resonance</span>
                <span className="text-gray-400 text-xs capitalize">{r.type}</span>
              </div>
              <p className="text-gray-300 text-sm mb-2">{r.description}</p>
              <div className="bg-gray-900/50 rounded p-2">
                <span className="text-gray-500 text-xs">Effect: </span>
                <span className="text-gray-300 text-sm">{r.effect}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
