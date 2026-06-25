import { useState } from 'react'

interface Engine {
  name: string
  vehicle: string
  agency: string
  thrust_kN: number
  isp_vac: number
  fuel: string
  type: string
  reusable: boolean
  mass_kg: number
  twr: number
  status: string
  year: number
  description: string
  emoji: string
}

const ENGINES: Engine[] = [
  { name: 'Raptor 3', vehicle: 'Starship', agency: 'SpaceX', thrust_kN: 2800, isp_vac: 380, fuel: 'CH₄/LOX', type: 'Full-flow staged combustion', reusable: true, mass_kg: 1500, twr: 190, status: 'Active', year: 2024, description: 'Most powerful production rocket engine ever built. Full-flow staged combustion cycle burns all propellants before thrust chamber.', emoji: '🔥' },
  { name: 'RS-25 (SSME)', vehicle: 'Space Shuttle / SLS', agency: 'NASA/Aerojet', thrust_kN: 2090, isp_vac: 453, fuel: 'LH₂/LOX', type: 'Staged combustion', reusable: true, mass_kg: 3527, twr: 60, status: 'Active (SLS)', year: 1972, description: 'Highest ISP of any staged combustion engine. Originally designed for Space Shuttle and now used on SLS Block 1.', emoji: '🚀' },
  { name: 'Merlin 1D Vacuum', vehicle: 'Falcon 9/Heavy', agency: 'SpaceX', thrust_kN: 934, isp_vac: 348, fuel: 'RP-1/LOX', type: 'Gas-generator', reusable: false, mass_kg: 490, twr: 194, status: 'Active', year: 2013, description: 'Powers the second stage of Falcon 9. Nozzle extension optimized for vacuum operation gives it excellent specific impulse.', emoji: '🔬' },
  { name: 'F-1 (Saturn V)', vehicle: 'Saturn V', agency: 'NASA/Rocketdyne', thrust_kN: 7770, isp_vac: 304, fuel: 'RP-1/LOX', type: 'Gas-generator', reusable: false, mass_kg: 8390, twr: 94, status: 'Retired', year: 1958, description: 'Single most powerful rocket engine ever flown. Saturn V used 5 of these to send humans to the Moon.', emoji: '🌙' },
  { name: 'RD-180', vehicle: 'Atlas V', agency: 'NPO Energomash', thrust_kN: 4150, isp_vac: 338, fuel: 'RP-1/LOX', type: 'Staged combustion', reusable: false, mass_kg: 5393, twr: 78, status: 'Active', year: 1998, description: 'Russian engine used on Atlas V until 2022. Two thrust chambers fed by single turbopump, notoriously efficient.', emoji: '🇷🇺' },
  { name: 'BE-4', vehicle: 'New Glenn / Vulcan', agency: 'Blue Origin', thrust_kN: 2400, isp_vac: 340, fuel: 'CH₄/LOX', type: 'Oxidizer-rich staged combustion', reusable: true, mass_kg: 2500, twr: 98, status: 'Active', year: 2023, description: 'Methane engine chosen by ULA for Vulcan Centaur. Designed from the start for reusability with 25+ flight life.', emoji: '🔵' },
  { name: 'Vulcain 2.1', vehicle: 'Ariane 6', agency: 'ArianeGroup', thrust_kN: 1370, isp_vac: 434, fuel: 'LH₂/LOX', type: 'Gas-generator', reusable: false, mass_kg: 1800, twr: 77, status: 'Active', year: 2024, description: 'Powers Ariane 6 core stage. Liquid hydrogen fuel gives it excellent ISP, trading thrust density for efficiency.', emoji: '🇪🇺' },
  { name: 'CE-20', vehicle: 'GSLV Mk III', agency: 'ISRO', thrust_kN: 186, isp_vac: 443, fuel: 'LH₂/LOX', type: 'Expander cycle', reusable: false, mass_kg: 578, twr: 32, status: 'Active', year: 2017, description: 'India\'s most advanced cryogenic engine. Expander cycle uses fuel to cool the nozzle and drive the turbopump.', emoji: '🇮🇳' },
  { name: 'YF-100K', vehicle: 'Long March 5B', agency: 'CASC', thrust_kN: 1340, isp_vac: 341, fuel: 'RP-1/LOX', type: 'Staged combustion', reusable: false, mass_kg: 2500, twr: 54, status: 'Active', year: 2019, description: 'China\'s most powerful production engine. Powers the Long March 5 which launched Tianwen-1 Mars mission.', emoji: '🇨🇳' },
  { name: 'RL-10C', vehicle: 'Atlas V / Centaur', agency: 'Aerojet', thrust_kN: 101, isp_vac: 465, fuel: 'LH₂/LOX', type: 'Expander cycle', reusable: false, mass_kg: 167, twr: 61, status: 'Active', year: 2013, description: 'Highest ISP of any production rocket engine. Liquid hydrogen expander cycle. Used on upper stages since 1963.', emoji: '⬆️' },
]

const METRICS = [
  { key: 'thrust_kN', label: 'Thrust (kN)', color: '#ef4444', max: 8000 },
  { key: 'isp_vac', label: 'Vacuum ISP (s)', color: '#3b82f6', max: 480 },
  { key: 'twr', label: 'Thrust/Weight Ratio', color: '#10b981', max: 200 },
  { key: 'mass_kg', label: 'Engine Mass (kg)', color: '#f59e0b', max: 9000 },
]

const FUEL_COLORS: Record<string, string> = {
  'CH₄/LOX': '#a78bfa',
  'LH₂/LOX': '#60a5fa',
  'RP-1/LOX': '#fb923c',
}

const FUEL_NAMES: Record<string, string> = {
  'CH₄/LOX': 'Methane / Liquid Oxygen',
  'LH₂/LOX': 'Liquid Hydrogen / Liquid Oxygen',
  'RP-1/LOX': 'Kerosene / Liquid Oxygen',
}

export default function RocketEngineComparison() {
  const [selectedMetric, setSelectedMetric] = useState(0)
  const [selectedEngines, setSelectedEngines] = useState<string[]>(['Raptor 3', 'RS-25 (SSME)', 'F-1 (Saturn V)', 'Merlin 1D Vacuum'])
  const [filterFuel, setFilterFuel] = useState<string>('all')
  const [detailEngine, setDetailEngine] = useState<Engine | null>(null)

  const metric = METRICS[selectedMetric]
  const filtered = ENGINES.filter(e => filterFuel === 'all' || e.fuel === filterFuel)
  const sorted = [...filtered].sort((a, b) => (b[metric.key as keyof Engine] as number) - (a[metric.key as keyof Engine] as number))
  const maxVal = Math.max(...sorted.map(e => e[metric.key as keyof Engine] as number))

  const toggleEngine = (name: string) => {
    setSelectedEngines(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const compareEngines = ENGINES.filter(e => selectedEngines.includes(e.name))

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🚀</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Rocket Engine Comparison</h2>
          <p className="text-orange-300 text-sm">Every major engine, side by side — from F-1 to Raptor</p>
        </div>
      </div>

      {/* Metric selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {METRICS.map((m, i) => (
          <button
            key={m.key}
            onClick={() => setSelectedMetric(i)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${i === selectedMetric ? 'text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
            style={i === selectedMetric ? { backgroundColor: m.color + '80', border: `1px solid ${m.color}` } : {}}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Fuel filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilterFuel('all')}
          className={`px-3 py-1 text-xs rounded-full border transition-all ${filterFuel === 'all' ? 'border-white/50 bg-white/20 text-white' : 'border-white/20 text-gray-400 hover:border-white/40'}`}
        >
          All Fuels
        </button>
        {Object.entries(FUEL_NAMES).map(([key, fullName]) => (
          <button
            key={key}
            onClick={() => setFilterFuel(key)}
            title={fullName}
            className={`px-3 py-1 text-xs rounded-full border transition-all ${filterFuel === key ? 'text-white' : 'text-gray-400 hover:border-white/40'}`}
            style={filterFuel === key ? { backgroundColor: FUEL_COLORS[key] + '40', borderColor: FUEL_COLORS[key] } : { borderColor: 'rgba(255,255,255,0.2)' }}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div className="space-y-2 mb-6">
        {sorted.map(engine => {
          const val = engine[metric.key as keyof Engine] as number
          const pct = (val / maxVal) * 100
          return (
            <div
              key={engine.name}
              onClick={() => setDetailEngine(detailEngine?.name === engine.name ? null : engine)}
              className="cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{engine.emoji}</span>
                  <span className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">
                    {engine.name}
                  </span>
                  <span className="text-xs text-gray-500">{engine.vehicle}</span>
                  {!engine.reusable && <span className="text-xs bg-gray-700 text-gray-400 px-1 rounded">Expendable</span>}
                  {engine.reusable && <span className="text-xs bg-green-900/50 text-green-400 px-1 rounded">Reusable</span>}
                  {engine.status === 'Retired' && <span className="text-xs bg-red-900/50 text-red-400 px-1 rounded">Retired</span>}
                </div>
                <span className="text-sm font-mono text-right" style={{ color: metric.color }}>
                  {metric.key === 'thrust_kN' ? `${val.toLocaleString()} kN` :
                   metric.key === 'isp_vac' ? `${val} s` :
                   metric.key === 'twr' ? `${val}:1` :
                   `${val.toLocaleString()} kg`}
                </span>
              </div>
              <div className="bg-white/10 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: metric.color }}
                />
              </div>

              {/* Detail expand */}
              {detailEngine?.name === engine.name && (
                <div className="mt-2 bg-white/5 rounded-lg p-3 border border-white/10 text-sm text-gray-300">
                  <div className="grid grid-cols-2 gap-2 mb-2 sm:grid-cols-4">
                    <div><div className="text-xs text-gray-500">Thrust</div><div className="font-mono text-white">{engine.thrust_kN.toLocaleString()} kN</div></div>
                    <div><div className="text-xs text-gray-500">Vac ISP</div><div className="font-mono text-white">{engine.isp_vac} s</div></div>
                    <div><div className="text-xs text-gray-500">TWR</div><div className="font-mono text-white">{engine.twr}:1</div></div>
                    <div><div className="text-xs text-gray-500">Mass</div><div className="font-mono text-white">{engine.mass_kg.toLocaleString()} kg</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: FUEL_COLORS[engine.fuel] + '30', color: FUEL_COLORS[engine.fuel] }}>{engine.fuel}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">{engine.type}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">{engine.agency}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">First: {engine.year}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{engine.description}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Compare selected */}
      <div className="border-t border-white/10 pt-6">
        <div className="text-sm font-semibold text-white mb-3">Compare Engines (select up to 4):</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {ENGINES.map(e => (
            <button
              key={e.name}
              onClick={() => toggleEngine(e.name)}
              className={`px-2 py-1 text-xs rounded border transition-all ${selectedEngines.includes(e.name) ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-white/20 text-gray-400 hover:border-blue-500/50'}`}
            >
              {e.emoji} {e.name}
            </button>
          ))}
        </div>

        {compareEngines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 text-gray-400 font-normal pr-4">Engine</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-3">Thrust</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-3">ISP</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-3">TWR</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-3">Fuel</th>
                  <th className="text-right py-2 text-gray-400 font-normal px-3">Reuse</th>
                </tr>
              </thead>
              <tbody>
                {compareEngines.map(e => (
                  <tr key={e.name} className="border-b border-white/5">
                    <td className="py-2 pr-4 text-white">{e.emoji} {e.name}</td>
                    <td className="text-right px-3 font-mono text-red-300">{e.thrust_kN.toLocaleString()}</td>
                    <td className="text-right px-3 font-mono text-blue-300">{e.isp_vac}</td>
                    <td className="text-right px-3 font-mono text-green-300">{e.twr}</td>
                    <td className="text-right px-3" style={{ color: FUEL_COLORS[e.fuel] }}>{e.fuel}</td>
                    <td className="text-right px-3">
                      {e.reusable ? <span className="text-green-400">✓</span> : <span className="text-gray-600">✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ISP explainer */}
      <div className="mt-4 bg-blue-900/20 rounded-xl p-4 border border-blue-500/20">
        <div className="text-xs font-semibold text-blue-300 mb-1">What is ISP (Specific Impulse)?</div>
        <div className="text-xs text-gray-300">
          ISP measures fuel efficiency — how much thrust per unit of propellant consumed. Higher ISP = more delta-v for the same mass. LH₂/LOX engines have the highest ISP but poor density; RP-1/LOX has lower ISP but packs more energy per volume. CH₄/LOX sits between them, making it ideal for reusable engines.
        </div>
      </div>
    </div>
  )
}
