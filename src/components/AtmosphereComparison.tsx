import { useState } from 'react'

interface Planet {
  name: string
  emoji: string
  pressure_atm: number
  temp_surface_C: number
  composition: { gas: string; pct: number; color: string }[]
  greenhouse: boolean
  moons: number
  has_magnetic_field: boolean
  notable: string
}

const PLANETS: Planet[] = [
  {
    name: 'Mercury', emoji: '⚫', pressure_atm: 0.000000000001, temp_surface_C: 167, greenhouse: false, moons: 0, has_magnetic_field: true,
    notable: 'Almost no atmosphere. Surface ranges from -180°C (night) to 430°C (day).',
    composition: [
      { gas: 'O₂', pct: 42, color: '#60a5fa' }, { gas: 'Na', pct: 29, color: '#f59e0b' },
      { gas: 'H₂', pct: 22, color: '#10b981' }, { gas: 'He', pct: 6, color: '#a78bfa' }, { gas: 'Other', pct: 1, color: '#6b7280' },
    ],
  },
  {
    name: 'Venus', emoji: '🟡', pressure_atm: 92, temp_surface_C: 465, greenhouse: true, moons: 0, has_magnetic_field: false,
    notable: 'Extreme runaway greenhouse effect. Lead melts on the surface. Crushingly dense CO₂ atmosphere.',
    composition: [
      { gas: 'CO₂', pct: 96.5, color: '#ef4444' }, { gas: 'N₂', pct: 3.5, color: '#60a5fa' }, { gas: 'SO₂', pct: 0.015, color: '#f59e0b' },
    ],
  },
  {
    name: 'Earth', emoji: '🌍', pressure_atm: 1, temp_surface_C: 15, greenhouse: true, moons: 1, has_magnetic_field: true,
    notable: 'The Goldilocks atmosphere. Nitrogen buffer, oxygen for life, ozone layer blocks UV.',
    composition: [
      { gas: 'N₂', pct: 78.1, color: '#60a5fa' }, { gas: 'O₂', pct: 20.9, color: '#10b981' }, { gas: 'Ar', pct: 0.93, color: '#a78bfa' },
      { gas: 'CO₂', pct: 0.04, color: '#ef4444' }, { gas: 'H₂O', pct: 1, color: '#38bdf8' },
    ],
  },
  {
    name: 'Mars', emoji: '🔴', pressure_atm: 0.006, temp_surface_C: -65, greenhouse: true, moons: 2, has_magnetic_field: false,
    notable: 'Thin atmosphere, mostly CO₂. Rovers operate here. Dust storms cover the entire planet.',
    composition: [
      { gas: 'CO₂', pct: 95.3, color: '#ef4444' }, { gas: 'N₂', pct: 2.6, color: '#60a5fa' }, { gas: 'Ar', pct: 1.9, color: '#a78bfa' },
      { gas: 'O₂', pct: 0.15, color: '#10b981' }, { gas: 'Other', pct: 0.05, color: '#6b7280' },
    ],
  },
  {
    name: 'Jupiter', emoji: '🪐', pressure_atm: 0, temp_surface_C: -110, greenhouse: false, moons: 95, has_magnetic_field: true,
    notable: 'Gas giant with no solid surface. Lightning storms 3× stronger than Earth\'s. Great Red Spot is 350+ year storm.',
    composition: [
      { gas: 'H₂', pct: 89.8, color: '#fde68a' }, { gas: 'He', pct: 10.2, color: '#fca5a5' }, { gas: 'CH₄', pct: 0.3, color: '#86efac' },
      { gas: 'NH₃', pct: 0.026, color: '#d8b4fe' },
    ],
  },
  {
    name: 'Saturn', emoji: '🪐', pressure_atm: 0, temp_surface_C: -139, greenhouse: false, moons: 146, has_magnetic_field: true,
    notable: 'Least dense planet — would float on water. Rings made of ice and rock. Hexagonal polar storm.',
    composition: [
      { gas: 'H₂', pct: 96.3, color: '#fde68a' }, { gas: 'He', pct: 3.25, color: '#fca5a5' }, { gas: 'CH₄', pct: 0.45, color: '#86efac' },
    ],
  },
  {
    name: 'Uranus', emoji: '🔵', pressure_atm: 0, temp_surface_C: -195, greenhouse: false, moons: 28, has_magnetic_field: true,
    notable: 'Ice giant. Tilted 98° — orbits on its side. Methane gives it the blue-green color.',
    composition: [
      { gas: 'H₂', pct: 82.5, color: '#fde68a' }, { gas: 'He', pct: 15.2, color: '#fca5a5' }, { gas: 'CH₄', pct: 2.3, color: '#86efac' },
    ],
  },
  {
    name: 'Neptune', emoji: '🔷', pressure_atm: 0, temp_surface_C: -200, greenhouse: false, moons: 16, has_magnetic_field: true,
    notable: 'Fastest winds in the Solar System (2100 km/h). Giant Dark Spot — storm larger than Earth.',
    composition: [
      { gas: 'H₂', pct: 80, color: '#fde68a' }, { gas: 'He', pct: 19, color: '#fca5a5' }, { gas: 'CH₄', pct: 1, color: '#86efac' },
      { gas: 'NH₃', pct: 0.01, color: '#d8b4fe' },
    ],
  },
  {
    name: 'Titan (Saturn moon)', emoji: '🟠', pressure_atm: 1.45, temp_surface_C: -179, greenhouse: true, moons: 0, has_magnetic_field: false,
    notable: 'Only moon with thick atmosphere. Lakes and rivers of liquid methane. Huygens probe landed 2005.',
    composition: [
      { gas: 'N₂', pct: 95, color: '#60a5fa' }, { gas: 'CH₄', pct: 4.9, color: '#86efac' }, { gas: 'H₂', pct: 0.1, color: '#fde68a' },
    ],
  },
]

export default function AtmosphereComparison() {
  const [selected, setSelected] = useState<Planet>(PLANETS[2])
  const [compare, setCompare] = useState<Planet>(PLANETS[3])
  const [mode, setMode] = useState<'single' | 'compare'>('single')

  const PressureBar = ({ planet, max }: { planet: Planet; max: number }) => {
    const logP = Math.log10(Math.max(planet.pressure_atm, 1e-12))
    const logMax = Math.log10(Math.max(max, 1))
    const logMin = Math.log10(1e-12)
    const pct = Math.max(0, Math.min(100, ((logP - logMin) / (logMax - logMin)) * 100))
    return (
      <div className="flex items-center gap-2">
        <div className="w-24 text-xs text-right text-gray-400">{planet.pressure_atm < 0.001 ? planet.pressure_atm.toExponential(1) : planet.pressure_atm.toFixed(3)} atm</div>
        <div className="flex-1 bg-white/10 rounded-full h-2">
          <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  const PieChart = ({ planet, size }: { planet: Planet; size: number }) => {
    let angle = -Math.PI / 2
    return (
      <svg width={size} height={size} className="mx-auto">
        {planet.composition.map((comp) => {
          const sliceAngle = (comp.pct / 100) * Math.PI * 2
          const x1 = size/2 + (size/2 - 4) * Math.cos(angle)
          const y1 = size/2 + (size/2 - 4) * Math.sin(angle)
          angle += sliceAngle
          const x2 = size/2 + (size/2 - 4) * Math.cos(angle)
          const y2 = size/2 + (size/2 - 4) * Math.sin(angle)
          const largeArc = sliceAngle > Math.PI ? 1 : 0
          return (
            <path
              key={comp.gas}
              d={`M ${size/2} ${size/2} L ${x1} ${y1} A ${size/2-4} ${size/2-4} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={comp.color}
              opacity={0.85}
            />
          )
        })}
        <circle cx={size/2} cy={size/2} r={size/4} fill="#030712" />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={12}>{planet.emoji}</text>
      </svg>
    )
  }

  const PlanetDetails = ({ planet }: { planet: Planet }) => (
    <div>
      <div className="text-center mb-4">
        <PieChart planet={planet} size={120} />
        <div className="font-bold text-white text-lg mt-1">{planet.name}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        {[
          { label: 'Surface pressure', value: planet.pressure_atm < 0.001 ? `${planet.pressure_atm.toExponential(1)} atm` : `${planet.pressure_atm} atm` },
          { label: 'Avg surface temp', value: `${planet.temp_surface_C}°C` },
          { label: 'Greenhouse effect', value: planet.greenhouse ? '✓ Yes' : '✗ No/Minimal' },
          { label: 'Magnetic field', value: planet.has_magnetic_field ? '✓ Yes' : '✗ No' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 rounded p-2">
            <div className="text-gray-500">{label}</div>
            <div className="text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1 mb-3">
        {planet.composition.map(c => (
          <div key={c.gas} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
            <span className="text-xs text-gray-300 w-8">{c.gas}</span>
            <div className="flex-1 bg-white/10 rounded-full h-1.5">
              <div className="h-1.5 rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
            </div>
            <span className="text-xs font-mono text-gray-400 w-12 text-right">{c.pct < 0.1 ? c.pct.toFixed(3) : c.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="bg-white/5 rounded p-2 text-xs text-gray-300">{planet.notable}</div>
    </div>
  )

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🌬️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Planetary Atmosphere Comparison</h2>
          <p className="text-cyan-300 text-sm">Compositions, pressures, and temperatures across the Solar System</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['single', 'compare'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-cyan-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {m === 'single' ? '🪐 Single Planet' : '⚖️ Side by Side'}
          </button>
        ))}
      </div>

      {/* Planet selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PLANETS.map(p => (
          <button
            key={p.name}
            onClick={() => mode === 'single' ? setSelected(p) : setCompare(p === selected ? compare : p === compare ? selected : p)}
            className={`px-2 py-1 text-xs rounded-lg border transition-all flex items-center gap-1 ${
              (mode === 'single' && selected.name === p.name) ||
              (mode === 'compare' && (selected.name === p.name || compare.name === p.name))
                ? 'border-cyan-500 bg-cyan-900/20 text-cyan-300' : 'border-white/20 text-gray-400 hover:border-cyan-500/40'
            }`}
          >
            <span>{p.emoji}</span><span>{p.name}</span>
          </button>
        ))}
      </div>

      {mode === 'single' && (
        <div className="max-w-md mx-auto">
          <PlanetDetails planet={selected} />
        </div>
      )}

      {mode === 'compare' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 mb-2 text-center">Planet 1</div>
            <div className="flex flex-wrap gap-1 mb-2 justify-center">
              {PLANETS.map(p => (
                <button
                  key={p.name}
                  onClick={() => setSelected(p)}
                  className={`px-1.5 py-0.5 text-xs rounded border ${selected.name === p.name ? 'border-blue-500 bg-blue-900/20 text-blue-300' : 'border-white/10 text-gray-500'}`}
                >
                  {p.emoji}
                </button>
              ))}
            </div>
            <PlanetDetails planet={selected} />
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 mb-2 text-center">Planet 2</div>
            <div className="flex flex-wrap gap-1 mb-2 justify-center">
              {PLANETS.map(p => (
                <button
                  key={p.name}
                  onClick={() => setCompare(p)}
                  className={`px-1.5 py-0.5 text-xs rounded border ${compare.name === p.name ? 'border-red-500 bg-red-900/20 text-red-300' : 'border-white/10 text-gray-500'}`}
                >
                  {p.emoji}
                </button>
              ))}
            </div>
            <PlanetDetails planet={compare} />
          </div>
        </div>
      )}

      {/* Pressure comparison */}
      <div className="mt-6 bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="text-xs font-semibold text-gray-400 mb-3 uppercase">Atmospheric Pressure (log scale)</div>
        <div className="space-y-2">
          {PLANETS.map(p => (
            <div key={p.name} className="flex items-center gap-2">
              <span className="text-sm w-5">{p.emoji}</span>
              <span className="text-xs text-gray-300 w-20">{p.name}</span>
              <PressureBar planet={p} max={92} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
