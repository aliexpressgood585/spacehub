import { useState, useRef, useEffect } from 'react'

interface ExoplanetWeatherData {
  name: string
  star: string
  type: string
  temperature: number
  temperatureUnit: string
  phenomena: string[]
  windSpeed: string
  atmosphere: string
  pressure: string
  precipitation: string
  weather: string
  color: string
  icon: string
  description: string
  survival: string
}

const planets: ExoplanetWeatherData[] = [
  {
    name: 'WASP-76b',
    star: 'WASP-76 (F-type)',
    type: 'Hot Jupiter (Tidally Locked)',
    temperature: 2400,
    temperatureUnit: 'K (day side)',
    phenomena: ['Iron rain', 'Supersonic winds', 'Permanent day/night asymmetry', 'Calcium vapor clouds'],
    windSpeed: '~18,000 km/h',
    atmosphere: 'Fe, Ca, Na, K vapor; ionized metals',
    pressure: '>100 bar (estimated)',
    precipitation: 'Liquid iron droplets (night side, ~1800 K)',
    weather: 'Day side: vaporized iron atmosphere. Winds carry Fe vapor to night side where it condenses and falls as iron rain.',
    color: '#f97316',
    icon: '🔥',
    description: 'One of the most extreme weather systems known. Iron literally rains on the night side. ESPRESSO spectrograph detected Fe I absorption asymmetry proving this. The terminator region is 1,000 K cooler than the day side.',
    survival: 'Instant vaporization. Iron boils at 3134 K — the day side is hot enough to vaporize iron, which rains back on the night side.'
  },
  {
    name: 'HD 189733b',
    star: 'HD 189733 (K-type orange dwarf)',
    type: 'Hot Jupiter (Tidally Locked)',
    temperature: 1200,
    temperatureUnit: 'K (average)',
    phenomena: ['Glass rain (silicate particles)', 'Supersonic winds 8,700 km/h', 'Deep blue color (Rayleigh scattering by silicates)', 'Temperature asymmetry 500 K'],
    windSpeed: '8,700 km/h',
    atmosphere: 'Silicate particles, Na, CO, H₂O vapor',
    pressure: 'Unknown (estimated >>Earth)',
    precipitation: 'Tiny silicate (glass) particles blowing sideways at 8,700 km/h',
    weather: 'Eternal hurricane with glass shards scything through at Mach 7. The vivid blue color comes from silicate haze, not oceans.',
    color: '#3b82f6',
    icon: '💎',
    description: 'Superficially Earth-like in color — a deep cobalt blue — but utterly lethal. The blue comes from silicate (glass) particles in the atmosphere, not water. Winds exceed Mach 7 and carry the glass sideways rather than downward.',
    survival: 'Sandblasted to atoms by glass shards at Mach 7 before temperature causes issues.'
  },
  {
    name: 'KELT-9b',
    star: 'KELT-9 (A-type, T=10,170 K)',
    type: 'Ultra-Hot Jupiter',
    temperature: 4600,
    temperatureUnit: 'K (day side)',
    phenomena: ['Molecular dissociation (H₂ splits into atoms)', 'Metal ionization', 'Hottest known exoplanet atmosphere', 'Hydrogen recombination on night side'],
    windSpeed: '>10,000 km/h (modeled)',
    atmosphere: 'Atomic hydrogen, ionized metals (Fe⁺, Ti⁺, Mg⁺)',
    pressure: 'N/A — atmosphere partially escaping',
    precipitation: 'No stable molecules — everything dissociated into atoms and ions',
    weather: 'Hotter than most stars. H₂ cannot exist as a molecule — it dissociates on the day side and recombines on the night side, releasing latent heat and driving winds.',
    color: '#ef4444',
    icon: '⚡',
    description: 'Hotter than 80% of all stars in the galaxy. At 4600 K, even water, CO, and TiO molecules dissociate. The atmosphere is an atomic plasma with ionized iron, titanium, and magnesium. Detected with HARPS-N spectrograph.',
    survival: 'Not applicable — no stable matter. Even DNA dissociates at these temperatures.'
  },
  {
    name: '55 Cancri e',
    star: '55 Cancri A (G-type)',
    type: 'Super-Earth / Lava World',
    temperature: 2573,
    temperatureUnit: 'K (surface)',
    phenomena: ['Global lava ocean (day side)', 'Rock vapor atmosphere', 'Silicate cloud formation', 'Atmospheric escape'],
    windSpeed: 'Unknown (rock vapor winds)',
    atmosphere: 'Rock vapor, CO₂, CO, SiO',
    pressure: 'Low-moderate (atmosphere partially lost)',
    precipitation: 'Possibly silicate rock vapor condensing as droplets',
    weather: 'The day side is a churning ocean of molten rock. Rock evaporates to form a thin atmosphere. JWST detected thermal emission variation consistent with lava flows.',
    color: '#dc2626',
    icon: '🌋',
    description: 'A "lava world" orbiting every 18 hours at 1/25 of Mercury\'s distance. JWST\'s first exoplanet emission spectroscopy showed possible atmosphere. The surface temperature exceeds the melting point of all known rocks.',
    survival: 'Instantly incinerated and vaporized into the rock-vapor atmosphere.'
  },
  {
    name: 'GJ 504b',
    star: 'GJ 504 (G-type, young)',
    type: 'Super-Jupiter (directly imaged)',
    temperature: 510,
    temperatureUnit: 'K',
    phenomena: ['Methane clouds', 'Pink/magenta coloration', 'Cooling over billions of years', 'Young (160 Myr) massive planet'],
    windSpeed: 'Unknown',
    atmosphere: 'H₂, He, CH₄, water clouds',
    pressure: '>1,000 bar in deep atmosphere',
    precipitation: 'Water and methane cloud layers at different altitudes',
    weather: 'Relatively "cool" for an exoplanet. Methane-dominated atmosphere produces magenta/pink coloration. Still contracting and radiating heat from formation.',
    color: '#e879f9',
    icon: '🟣',
    description: 'Directly imaged planet with a striking magenta color from methane absorption. At 510 K, it sits in an interesting regime where methane is stable but still shows complex cloud chemistry. One of the first directly imaged planets around a Sun-like star.',
    survival: 'Crushed to atoms by 1,000+ bar atmospheric pressure, then frozen by −200 K temperatures in upper clouds.'
  },
  {
    name: 'Kepler-7b',
    star: 'Kepler-7 (F-type)',
    type: 'Hot Jupiter (inflated)',
    temperature: 1630,
    temperatureUnit: 'K (average)',
    phenomena: ['Permanent cloud bank on western hemisphere', 'High geometric albedo (0.35)', 'Cloud-free eastern hemisphere', 'Thermal/albedo asymmetry mapped by Spitzer'],
    windSpeed: 'Moderate (clouds maintained in west)',
    atmosphere: 'Likely MgSiO₃ and Fe₂SiO₄ silicate clouds',
    pressure: 'Unknown',
    precipitation: 'Silicate clouds condense on western terminator',
    weather: 'First exoplanet with a weather map — Spitzer detected a reflective cloud system permanently parked on the western hemisphere. Eastern side is clear and hot.',
    color: '#94a3b8',
    icon: '🌤️',
    description: 'First exoplanet with a "weather map" — Spitzer observations over multiple orbits detected a persistent cloud system on the western hemisphere. This is the first observational evidence of large-scale atmospheric dynamics on another world.',
    survival: 'Crushed by gravity (0.06 g/cm³ — less dense than water, but enormous).'
  },
]

function WeatherCanvas({ planet }: { planet: ExoplanetWeatherData }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#03061a'
    ctx.fillRect(0, 0, W, H)

    // Background star field
    for (let i = 0; i < 50; i++) {
      const sx = (i * 137.5 * 17) % W, sy = (i * 97.3 * 13) % H
      ctx.beginPath()
      ctx.arc(sx, sy, 0.7, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${0.1 + (i % 4) * 0.08})`
      ctx.fill()
    }

    // Host star (top-right)
    const starGrad = ctx.createRadialGradient(W - 30, 30, 0, W - 30, 30, 50)
    starGrad.addColorStop(0, '#fff7aa')
    starGrad.addColorStop(0.3, '#ffdd55aa')
    starGrad.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.arc(W - 30, 30, 50, 0, Math.PI * 2)
    ctx.fillStyle = starGrad
    ctx.fill()

    // Planet
    const cx = W * 0.4, cy = H * 0.5
    const pr = 60

    // Day/night gradient
    const dayGrad = ctx.createRadialGradient(cx - pr * 0.3, cy - pr * 0.3, 5, cx, cy, pr)
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return `${r},${g},${b}`
    }
    const rgb = hexToRgb(planet.color || '#f97316')
    dayGrad.addColorStop(0, `rgba(${rgb},1)`)
    dayGrad.addColorStop(0.6, `rgba(${rgb},0.7)`)
    dayGrad.addColorStop(1, 'rgba(15,15,40,0.95)')
    ctx.beginPath()
    ctx.arc(cx, cy, pr, 0, Math.PI * 2)
    ctx.fillStyle = dayGrad
    ctx.fill()

    // Atmosphere glow
    const atmGrad = ctx.createRadialGradient(cx, cy, pr - 4, cx, cy, pr + 16)
    atmGrad.addColorStop(0, `rgba(${rgb},0.25)`)
    atmGrad.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.arc(cx, cy, pr + 16, 0, Math.PI * 2)
    ctx.fillStyle = atmGrad
    ctx.fill()

    // Labels
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.textAlign = 'center'
    ctx.fillText(planet.name, cx, cy + pr + 24)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`${planet.temperature} ${planet.temperatureUnit}`, cx, cy + pr + 38)

  }, [planet])
  return <canvas ref={ref} width={280} height={180} className="w-full rounded-lg" />
}

export default function ExoplanetWeather() {
  const [selected, setSelected] = useState(planets[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Exoplanet Weather</h2>
      <p className="text-gray-400 text-sm mb-5">The most extreme weather in the known universe — iron rain, glass storms, and lava oceans</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Planet list */}
        <div className="space-y-2">
          {planets.map(p => (
            <button key={p.name} onClick={() => setSelected(p)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === p.name ? 'border' : 'bg-gray-800/50 hover:bg-gray-700/50'}`} style={selected.name === p.name ? { borderColor: p.color, backgroundColor: p.color + '15' } : {}}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{p.icon}</span>
                <div>
                  <div className="text-white text-sm font-semibold">{p.name}</div>
                  <div className="text-gray-500 text-xs">{p.type}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono font-bold" style={{ color: p.color }}>{p.temperature} {p.temperatureUnit}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <WeatherCanvas planet={selected} />
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{selected.name}</h3>
                <div className="text-sm mb-2" style={{ color: selected.color }}>{selected.type}</div>
                <div className="text-gray-400 text-xs mb-3">Host star: {selected.star}</div>
                <div className="space-y-2 text-xs">
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20">Temp:</span>
                    <span className="text-white font-mono font-bold">{selected.temperature} {selected.temperatureUnit}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20">Winds:</span>
                    <span className="text-white">{selected.windSpeed}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20">Atm:</span>
                    <span className="text-gray-300">{selected.atmosphere}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20">Rain:</span>
                    <span className="text-gray-300">{selected.precipitation}</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-gray-300 text-sm mb-4">{selected.description}</p>

            <div className="space-y-3">
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-gray-500 text-xs uppercase font-semibold mb-2">Active Weather Phenomena</div>
                <div className="flex flex-wrap gap-2">
                  {selected.phenomena.map(ph => (
                    <span key={ph} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: selected.color + '22', color: selected.color, border: `1px solid ${selected.color}44` }}>{ph}</span>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Weather Description</div>
                <p className="text-gray-300 text-sm">{selected.weather}</p>
              </div>

              <div className="bg-red-900/20 rounded-lg p-3 border border-red-800/30">
                <div className="text-red-400 text-xs uppercase font-semibold mb-1">If You Were There</div>
                <p className="text-gray-300 text-sm">{selected.survival}</p>
              </div>
            </div>
          </div>

          {/* Comparison bar */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Temperature Comparison</div>
            <div className="space-y-2">
              {[
                { name: 'Earth surface (avg)', temp: 288, color: '#22c55e' },
                { name: 'Venus surface', temp: 735, color: '#f59e0b' },
                { name: 'Sun surface (photosphere)', temp: 5778, color: '#f97316' },
                ...planets.map(p => ({ name: p.name, temp: p.temperature, color: p.color })),
              ].sort((a, b) => a.temp - b.temp).map(item => (
                <div key={item.name} className="flex items-center gap-3 text-xs">
                  <div className="text-gray-400 w-36 truncate">{item.name}</div>
                  <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div className="h-3 rounded-full" style={{ width: `${Math.min((item.temp / 6000) * 100, 100)}%`, backgroundColor: item.color }} />
                  </div>
                  <div className="font-mono w-16 text-right" style={{ color: item.color }}>{item.temp.toLocaleString()}K</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
