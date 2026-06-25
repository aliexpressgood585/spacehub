import { useState, useRef, useEffect } from 'react'

interface Planet {
  name: string
  type: 'rocky' | 'gas giant' | 'ice giant' | 'dwarf'
  mass: number
  massUnit: string
  radius: number
  radiusUnit: string
  density: number
  gravity: number
  escapeVel: number
  dayLength: string
  yearLength: string
  moons: number
  rings: boolean
  magneticField: string
  internalHeat: boolean
  color: string
  description: string
  uniqueFact: string
}

interface GeologicProcess {
  name: string
  planets: string[]
  description: string
  icon: string
}

const planets: Planet[] = [
  { name: 'Mercury', type: 'rocky', mass: 0.055, massUnit: 'M⊕', radius: 0.38, radiusUnit: 'R⊕', density: 5.43, gravity: 3.7, escapeVel: 4.25, dayLength: '58.65 days', yearLength: '88 days', moons: 0, rings: false, magneticField: 'Weak (1% of Earth)', internalHeat: false, color: '#94a3b8', description: 'Innermost planet with extreme temperature swings (+430°C day, −180°C night). Surprisingly large iron core — may be remnant of giant impact.', uniqueFact: 'Has water ice in permanently shadowed polar craters despite proximity to Sun' },
  { name: 'Venus', type: 'rocky', mass: 0.815, massUnit: 'M⊕', radius: 0.95, radiusUnit: 'R⊕', density: 5.24, gravity: 8.87, escapeVel: 10.36, dayLength: '243 days (retrograde)', yearLength: '225 days', moons: 0, rings: false, magneticField: 'None', internalHeat: true, color: '#f59e0b', description: 'Runaway greenhouse effect creates 465°C surface temperature hotter than Mercury. Atmospheric pressure 92× Earth\'s. Possible active volcanoes.', uniqueFact: 'Rotates backwards and so slowly that a Venus day is longer than a Venus year' },
  { name: 'Earth', type: 'rocky', mass: 1, massUnit: 'M⊕', radius: 1, radiusUnit: 'R⊕', density: 5.51, gravity: 9.81, escapeVel: 11.19, dayLength: '23h 56m', yearLength: '365.25 days', moons: 1, rings: false, magneticField: 'Strong (25–65 µT)', internalHeat: true, color: '#3b82f6', description: 'The only known inhabited world. Plate tectonics recycles crust, magnetic field shields from solar wind, large Moon stabilizes axial tilt.', uniqueFact: 'Only body with confirmed plate tectonics — drives carbon cycle and long-term habitability' },
  { name: 'Mars', type: 'rocky', mass: 0.107, massUnit: 'M⊕', radius: 0.53, radiusUnit: 'R⊕', density: 3.93, gravity: 3.72, escapeVel: 5.03, dayLength: '24h 37m', yearLength: '687 days', moons: 2, rings: false, magneticField: 'None (crustal remnants)', internalHeat: false, color: '#ef4444', description: 'Once had liquid water, thick atmosphere, magnetic field. Lost them as interior cooled. Olympus Mons = tallest mountain in solar system.', uniqueFact: 'Mars\'s day (sol) is only 39 minutes longer than Earth\'s — making Mars the most human-friendly planet' },
  { name: 'Jupiter', type: 'gas giant', mass: 317.8, massUnit: 'M⊕', radius: 11.2, radiusUnit: 'R⊕', density: 1.33, gravity: 24.79, escapeVel: 59.5, dayLength: '9h 55m', yearLength: '11.86 years', moons: 95, rings: true, magneticField: '430 µT (14× Earth)', internalHeat: true, color: '#fb923c', description: 'Largest planet — 2.5× all other planets combined. Great Red Spot persisting for 350+ years. Emits more heat than it receives from Sun.', uniqueFact: 'Jupiter\'s magnetic field is so large it would appear 5× bigger than the Moon if visible to naked eye' },
  { name: 'Saturn', type: 'gas giant', mass: 95.2, massUnit: 'M⊕', radius: 9.45, radiusUnit: 'R⊕', density: 0.69, gravity: 10.44, escapeVel: 35.5, dayLength: '10h 42m', yearLength: '29.46 years', moons: 146, rings: true, magneticField: '21 µT (0.7× Earth)', internalHeat: true, color: '#fde68a', description: 'Lowest density of any planet — would float in water. Spectacular ring system mostly water ice. Titan has lakes of liquid methane.', uniqueFact: 'Saturn would float in water (density 0.69 g/cm³, water = 1.0)' },
  { name: 'Uranus', type: 'ice giant', mass: 14.5, massUnit: 'M⊕', radius: 4.01, radiusUnit: 'R⊕', density: 1.27, gravity: 8.87, escapeVel: 21.3, dayLength: '17h 14m (retrograde)', yearLength: '84 years', moons: 28, rings: true, magneticField: '23 µT (offset 59°)', internalHeat: false, color: '#67e8f9', description: 'Rotates on its side — 98° axial tilt, possibly from ancient giant impact. Internal heat mysteriously low compared to Neptune.', uniqueFact: 'Uranus is the coldest planetary atmosphere (−224°C) despite not being farthest from Sun' },
  { name: 'Neptune', type: 'ice giant', mass: 17.1, massUnit: 'M⊕', radius: 3.88, radiusUnit: 'R⊕', density: 1.64, gravity: 11.15, escapeVel: 23.5, dayLength: '16h 6m', yearLength: '164.8 years', moons: 16, rings: true, magneticField: '27 µT (offset 47°)', internalHeat: true, color: '#818cf8', description: 'Fastest winds in solar system — 2,100 km/h. Triton orbits retrograde, likely captured Kuiper Belt object. Diamond rain in interior.', uniqueFact: 'Neptune was discovered mathematically — predicted before being observed, based on orbital anomalies of Uranus' },
]

const geologicProcesses: GeologicProcess[] = [
  { name: 'Plate Tectonics', planets: ['Earth'], description: 'Subduction and seafloor spreading driven by mantle convection. Unique to Earth — enables carbon cycle, mountain building, and long-term habitability.', icon: '🏔️' },
  { name: 'Volcanism', planets: ['Earth', 'Venus', 'Io', 'Mars (ancient)', 'Enceladus (cryovolcanism)'], description: 'Interior heat released through volcanic activity. From basaltic flows to sulfur eruptions (Io) to water geysers (Enceladus).', icon: '🌋' },
  { name: 'Impact Cratering', planets: ['Mercury', 'Moon', 'Mars', 'All rocky bodies'], description: 'Oldest surface modification process. Preserved on bodies with no or slow geological activity. Great Bombardment 4.1–3.8 Gya.', icon: '☄️' },
  { name: 'Cryovolcanism', planets: ['Enceladus', 'Europa (possible)', 'Triton', 'Pluto (possible)'], description: 'Eruption of water, ammonia, or methane instead of molten rock. Indicates subsurface liquid water on icy moons.', icon: '🧊' },
  { name: 'Aeolian Processes', planets: ['Mars', 'Venus', 'Titan', 'Earth'], description: 'Wind erosion and deposition. Mars has planet-wide dust storms. Titan has sand dunes of organic material. Venus has extreme wind-driven erosion.', icon: '💨' },
]

function PlanetCanvas({ planet }: { planet: Planet }) {
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

    const baseR = Math.min(60, 20 + planet.radius * 6)

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      // Rings for gas giants
      if (planet.rings) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, baseR * 2.2, baseR * 0.3, 0, 0, Math.PI * 2)
        ctx.strokeStyle = planet.color + '44'
        ctx.lineWidth = planet.name === 'Saturn' ? 12 : 4
        ctx.stroke()
      }

      // Planet with rotation
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.5)

      const grad = ctx.createRadialGradient(-baseR * 0.3, -baseR * 0.3, 0, 0, 0, baseR)
      grad.addColorStop(0, planet.color + 'ff')
      grad.addColorStop(0.6, planet.color + 'cc')
      grad.addColorStop(1, planet.color + '44')
      ctx.beginPath()
      ctx.arc(0, 0, baseR, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // Surface features
      if (planet.type === 'gas giant') {
        // Bands
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath()
          const y = i * (baseR / 3.5)
          const w = Math.sqrt(Math.max(0, baseR * baseR - y * y))
          ctx.ellipse(0, y, w, baseR / 10, 0, 0, Math.PI * 2)
          ctx.fillStyle = planet.color + '33'
          ctx.fill()
        }
      }

      ctx.restore()

      // Moons (small dots)
      if (planet.moons > 0) {
        const moonCount = Math.min(planet.moons, 4)
        for (let i = 0; i < moonCount; i++) {
          const moonAngle = t * (0.3 + i * 0.2) + (i / moonCount) * Math.PI * 2
          const moonDist = baseR + 18 + i * 12
          const mx = cx + Math.cos(moonAngle) * moonDist
          const my = cy + Math.sin(moonAngle) * moonDist * 0.4
          ctx.beginPath()
          ctx.arc(mx, my, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#94a3b8'
          ctx.fill()
        }
      }

      t += 0.02
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [planet])
  return <canvas ref={ref} width={280} height={200} className="rounded-lg" />
}

type Tab = 'planets' | 'geology' | 'compare'

export default function PlanetaryScience() {
  const [tab, setTab] = useState<Tab>('planets')
  const [selected, setSelected] = useState<Planet>(planets[2])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'planets', label: 'Planet Profiles' },
    { id: 'geology', label: 'Geologic Processes' },
    { id: 'compare', label: 'Comparison' },
  ]

  const typeColor = { rocky: 'text-orange-400', 'gas giant': 'text-yellow-400', 'ice giant': 'text-blue-400', dwarf: 'text-gray-400' }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Planetary Science</h2>
      <p className="text-gray-400 text-sm mb-5">The physics and geology of worlds across our solar system</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'planets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            {planets.map(p => (
              <button key={p.name} onClick={() => setSelected(p)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === p.name ? 'bg-orange-900/40 border border-orange-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-white font-semibold text-sm">{p.name}</span>
                  <span className={`text-xs capitalize ml-auto ${typeColor[p.type]}`}>{p.type}</span>
                </div>
                <div className="text-gray-500 text-xs mt-0.5 ml-5">{p.moons} moons · {p.radius}R⊕</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-center">
              <PlanetCanvas planet={selected} />
            </div>
            <div className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selected.color }} />
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <span className={`text-sm capitalize ${typeColor[selected.type]}`}>{selected.type}</span>
              </div>
              <p className="text-gray-300 text-sm mb-3">{selected.description}</p>
              <div className="bg-orange-900/20 rounded p-2 border border-orange-800/30 mb-3">
                <span className="text-orange-400 text-xs">Unique: </span>
                <span className="text-gray-300 text-sm">{selected.uniqueFact}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Mass', value: `${selected.mass} ${selected.massUnit}` },
                  { label: 'Radius', value: `${selected.radius} ${selected.radiusUnit}` },
                  { label: 'Density', value: `${selected.density} g/cm³` },
                  { label: 'Gravity', value: `${selected.gravity} m/s²` },
                  { label: 'Day Length', value: selected.dayLength },
                  { label: 'Moons', value: `${selected.moons}` },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900/50 rounded p-2">
                    <div className="text-gray-500 text-xs">{item.label}</div>
                    <div className="text-white text-sm font-medium mt-0.5">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'geology' && (
        <div className="space-y-4">
          {geologicProcesses.map(g => (
            <div key={g.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{g.icon}</span>
                <h4 className="text-white font-bold">{g.name}</h4>
              </div>
              <p className="text-gray-400 text-sm mb-3">{g.description}</p>
              <div className="flex flex-wrap gap-2">
                {g.planets.map(planet => (
                  <span key={planet} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">{planet}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'compare' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-700">
                <th className="text-left py-3 pr-4">Planet</th>
                <th className="text-right pr-4">Mass (M⊕)</th>
                <th className="text-right pr-4">Radius (R⊕)</th>
                <th className="text-right pr-4">Gravity (m/s²)</th>
                <th className="text-right pr-4">Moons</th>
                <th className="text-right">Escape (km/s)</th>
              </tr>
            </thead>
            <tbody>
              {planets.map(p => (
                <tr key={p.name} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => { setSelected(p); setTab('planets') }}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-white font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="text-right text-gray-300 pr-4">{p.mass}</td>
                  <td className="text-right text-gray-300 pr-4">{p.radius}</td>
                  <td className="text-right text-gray-300 pr-4">{p.gravity}</td>
                  <td className="text-right text-gray-300 pr-4">{p.moons}</td>
                  <td className="text-right text-gray-300">{p.escapeVel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
