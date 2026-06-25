import { useState, useMemo } from 'react'

interface Stage {
  id: number
  name: string
  wetMass: number
  dryMass: number
  isp: number
}

interface ManeuverPreset {
  name: string
  deltaV: number
  description: string
  vehicle: string
}

const maneuverPresets: ManeuverPreset[] = [
  { name: 'Earth → LEO', deltaV: 9400, description: 'Launch from Earth surface to low Earth orbit (~400 km)', vehicle: 'Falcon 9, Atlas V' },
  { name: 'LEO → GTO', deltaV: 2500, description: 'Transfer from LEO to geostationary transfer orbit', vehicle: 'Upper stage burn' },
  { name: 'GTO → GEO', deltaV: 1500, description: 'Circularize to geostationary orbit (35,786 km)', vehicle: 'Apogee kick motor' },
  { name: 'LEO → Moon', deltaV: 3900, description: 'Translunar injection + lunar orbit insertion', vehicle: 'Apollo CSM/LM' },
  { name: 'Moon Landing', deltaV: 2100, description: 'Lunar orbit to surface (powered descent)', vehicle: 'Apollo LM' },
  { name: 'LEO → Mars', deltaV: 5600, description: 'Trans-Mars injection + Mars orbit insertion', vehicle: 'Perseverance, Starship' },
  { name: 'LEO → Venus', deltaV: 4700, description: 'Trans-Venus injection + orbit insertion', vehicle: 'Magellan' },
  { name: 'Earth Escape', deltaV: 11200, description: 'Escape Earth gravity entirely (C3=0)', vehicle: 'New Horizons, Voyager' },
  { name: 'ISS Reboost', deltaV: 2, description: 'Periodic reboost to compensate atmospheric drag', vehicle: 'Progress spacecraft' },
  { name: 'GEO Stationkeeping', deltaV: 50, description: 'Annual stationkeeping for geostationary satellite', vehicle: 'GEO satellites (per year)' },
]

const enginePresets = [
  { name: 'Merlin 1D (Falcon 9)', isp: 311, thrust: 845 },
  { name: 'RS-25 (Space Shuttle)', isp: 453, thrust: 1860 },
  { name: 'RL-10 (Centaur)', isp: 451, thrust: 110 },
  { name: 'Raptor 3 (Starship)', isp: 363, thrust: 2350 },
  { name: 'Ion thruster (Dawn)', isp: 3100, thrust: 0.091 },
  { name: 'VASIMR (proposed)', isp: 5000, thrust: 5.7 },
  { name: 'J-2 (Saturn V S-II)', isp: 421, thrust: 1033 },
  { name: 'Rutherford (Electron)', isp: 311, thrust: 25 },
]

const G0 = 9.80665

function calcDV(wetMass: number, dryMass: number, isp: number): number {
  if (dryMass <= 0 || wetMass <= dryMass || isp <= 0) return 0
  return isp * G0 * Math.log(wetMass / dryMass)
}

function formatDV(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(2) + ' km/s'
  return v.toFixed(0) + ' m/s'
}

type CalcTab = 'tsiolkovsky' | 'multistage' | 'maneuvers' | 'hohmann'

export default function RocketScienceCalculator() {
  const [tab, setTab] = useState<CalcTab>('tsiolkovsky')

  // Tsiolkovsky single stage
  const [wet, setWet] = useState(549054)
  const [dry, setDry] = useState(25600)
  const [isp, setIsp] = useState(311)

  // Multistage
  const [stages, setStages] = useState<Stage[]>([
    { id: 1, name: 'Stage 1', wetMass: 400000, dryMass: 25000, isp: 311 },
    { id: 2, name: 'Stage 2', wetMass: 92670, dryMass: 4000, isp: 348 },
  ])

  // Hohmann
  const [r1, setR1] = useState(6771)   // km (LEO = 6371+400)
  const [r2, setR2] = useState(42164)  // km (GEO)

  const singleDV = useMemo(() => calcDV(wet, dry, isp), [wet, dry, isp])
  const massRatio = wet > 0 ? wet / Math.max(dry, 1) : 0

  const totalDV = useMemo(() =>
    stages.reduce((sum, s) => sum + calcDV(s.wetMass, s.dryMass, s.isp), 0), [stages])

  const updateStage = (id: number, field: keyof Stage, value: number) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const addStage = () => {
    const nextId = Math.max(...stages.map(s => s.id)) + 1
    setStages(prev => [...prev, { id: nextId, name: `Stage ${nextId}`, wetMass: 50000, dryMass: 3000, isp: 320 }])
  }

  const removeStage = (id: number) => {
    if (stages.length > 1) setStages(prev => prev.filter(s => s.id !== id))
  }

  // Hohmann transfer
  const mu = 398600.4418 // km³/s² (Earth)
  const v1 = Math.sqrt(mu / r1)
  const v2 = Math.sqrt(mu / r2)
  const vTransfer1 = Math.sqrt(mu * (2 / r1 - 2 / (r1 + r2)))
  const vTransfer2 = Math.sqrt(mu * (2 / r2 - 2 / (r1 + r2)))
  const dv1Hoh = Math.abs(vTransfer1 - v1)
  const dv2Hoh = Math.abs(v2 - vTransfer2)
  const totalHoh = dv1Hoh + dv2Hoh
  const tTransfer = Math.PI * Math.sqrt(Math.pow((r1 + r2) / 2, 3) / mu)

  const tabs: { id: CalcTab; label: string }[] = [
    { id: 'tsiolkovsky', label: 'Tsiolkovsky Equation' },
    { id: 'multistage', label: 'Multi-Stage ΔV' },
    { id: 'maneuvers', label: 'Mission ΔV Budget' },
    { id: 'hohmann', label: 'Hohmann Transfer' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Rocket Science Calculator</h2>
      <p className="text-gray-400 text-sm mb-5">Interactive orbital mechanics — Tsiolkovsky, Hohmann transfers, ΔV budgets</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'tsiolkovsky' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="font-mono text-center text-lg text-orange-300 mb-3">Δv = Isp · g₀ · ln(m₀/m_f)</div>
              <div className="text-gray-400 text-xs text-center">Tsiolkovsky Rocket Equation (1903)</div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Wet Mass (m₀) — kg</label>
                <input type="number" value={wet} onChange={e => setWet(+e.target.value)} min={1}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-orange-500" />
                <div className="text-gray-600 text-xs mt-0.5">Falcon 9 full: 549,054 kg</div>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Dry Mass (m_f) — kg</label>
                <input type="number" value={dry} onChange={e => setDry(+e.target.value)} min={1}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-orange-500" />
                <div className="text-gray-600 text-xs mt-0.5">Falcon 9 first stage dry: 25,600 kg</div>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Specific Impulse (Isp) — seconds</label>
                <input type="number" value={isp} onChange={e => setIsp(+e.target.value)} min={1}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-orange-500" />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {enginePresets.slice(0, 5).map(e => (
                    <button key={e.name} onClick={() => setIsp(e.isp)} className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">{e.name.split(' (')[0]}: {e.isp}s</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-orange-900/20 rounded-xl p-5 border border-orange-800/40">
              <div className="text-orange-400 text-xs font-semibold uppercase mb-3">Result</div>
              <div className="text-5xl font-bold font-mono text-white mb-2">{formatDV(singleDV)}</div>
              <div className="text-orange-300 text-lg font-semibold">Delta-V</div>
              <div className="mt-4 pt-4 border-t border-orange-800/30 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">Mass Ratio</div>
                  <div className="text-white font-mono text-xl">{massRatio.toFixed(2)}×</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Propellant</div>
                  <div className="text-white font-mono text-xl">{((wet - dry) / 1000).toFixed(1)} t</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Payload fraction</div>
                  <div className="text-white font-mono">{((dry / wet) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Propellant fraction</div>
                  <div className="text-white font-mono">{(((wet - dry) / wet) * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs font-semibold uppercase mb-3">ΔV Comparison</div>
              {[
                { label: 'Earth → LEO', dv: 9400 },
                { label: 'LEO → Moon', dv: 3900 },
                { label: 'LEO → Mars', dv: 5600 },
                { label: 'Earth escape', dv: 11200 },
              ].map(item => (
                <div key={item.label} className="mb-2">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-400">{item.label}</span>
                    <span className={singleDV >= item.dv ? 'text-green-400' : 'text-gray-500'}>{singleDV >= item.dv ? '✓ Achievable' : `Need +${formatDV(item.dv - singleDV)}`}</span>
                  </div>
                  <div className="relative w-full bg-gray-700 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${Math.min((item.dv / 12000) * 100, 100)}%` }} />
                    <div className="absolute top-0 h-1.5 rounded-full bg-green-400 opacity-60" style={{ width: `${Math.min((singleDV / 12000) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'multistage' && (
        <div className="space-y-4">
          <div className="bg-gray-800/60 rounded-xl p-4 text-sm text-gray-300">
            Each stage is jettisoned after burnout, reducing dead mass. Total ΔV is the sum of each stage's contribution. This is why multi-stage rockets reach orbit.
          </div>

          <div className="space-y-3">
            {stages.map((s, idx) => (
              <div key={s.id} className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-white text-xs font-bold">{idx + 1}</div>
                    <input value={s.name} onChange={_e => updateStage(s.id, 'name', 0)}
                      className="bg-transparent text-white font-semibold focus:outline-none text-sm" readOnly />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-orange-300 font-mono font-bold">{formatDV(calcDV(s.wetMass, s.dryMass, s.isp))}</div>
                    {stages.length > 1 && <button onClick={() => removeStage(s.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Wet Mass (kg)</label>
                    <input type="number" value={s.wetMass} onChange={e => updateStage(s.id, 'wetMass', +e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Dry Mass (kg)</label>
                    <input type="number" value={s.dryMass} onChange={e => updateStage(s.id, 'dryMass', +e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Isp (s)</label>
                    <input type="number" value={s.isp} onChange={e => updateStage(s.id, 'isp', +e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div className="mt-2 text-gray-600 text-xs">Mass ratio: {s.dryMass > 0 ? (s.wetMass / s.dryMass).toFixed(2) : '—'}×</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={addStage} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">+ Add Stage</button>
            <div className="bg-orange-900/20 rounded-xl px-5 py-3 border border-orange-800/40 text-right">
              <div className="text-orange-400 text-xs uppercase font-semibold">Total ΔV</div>
              <div className="text-3xl font-bold font-mono text-white">{formatDV(totalDV)}</div>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs font-semibold uppercase mb-2">Stage ΔV Breakdown</div>
            {stages.map((s, idx) => {
              const dv = calcDV(s.wetMass, s.dryMass, s.isp)
              return (
                <div key={s.id} className="flex items-center gap-3 mb-2">
                  <div className="text-gray-400 text-xs w-16">Stage {idx + 1}</div>
                  <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                    <div className="h-4 rounded-full bg-orange-600 flex items-center justify-end pr-2 transition-all"
                      style={{ width: totalDV > 0 ? `${(dv / totalDV) * 100}%` : '0%' }}>
                      <span className="text-white text-xs font-mono">{formatDV(dv)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'maneuvers' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-gray-800/60 rounded-xl p-4">
            The total ΔV budget for a mission is the sum of all maneuvers. Gravity losses, steering losses, and atmospheric drag add ~1,500–2,000 m/s to the theoretical minimum. Click a preset to explore.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {maneuverPresets.map(m => (
              <div key={m.name} className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/40 hover:border-orange-700/40 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-white font-bold text-sm">{m.name}</div>
                  <div className="text-orange-300 font-mono font-bold">{formatDV(m.deltaV)}</div>
                </div>
                <p className="text-gray-400 text-xs mb-2">{m.description}</p>
                <div className="text-gray-600 text-xs">Vehicle: {m.vehicle}</div>
                <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${Math.min((m.deltaV / 12000) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-orange-900/20 rounded-xl p-4 border border-orange-800/40">
            <h3 className="text-white font-bold mb-3 text-sm">Complete Mission Example: Earth → Mars Surface</h3>
            <div className="space-y-1.5">
              {[
                { phase: 'Launch to LEO', dv: 9400 },
                { phase: 'Trans-Mars Injection (TMI)', dv: 900 },
                { phase: 'Mars Orbit Insertion', dv: 900 },
                { phase: 'Mars EDL (Entry/Descent/Landing)', dv: 0, note: 'Aerocapture + parachute + retros' },
                { phase: 'Mars ascent to orbit', dv: 3800, note: 'For crewed return' },
                { phase: 'Trans-Earth Injection', dv: 900, note: 'For crewed return' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-orange-800/20">
                  <span className="text-gray-300">{item.phase}</span>
                  <div className="text-right">
                    <span className="text-orange-300 font-mono">{item.dv > 0 ? formatDV(item.dv) : '—'}</span>
                    {item.note && <div className="text-gray-600">{item.note}</div>}
                  </div>
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm pt-1">
                <span className="text-white">Round-trip total</span>
                <span className="text-orange-300 font-mono">{formatDV(9400 + 900 + 900 + 3800 + 900)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'hohmann' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-4">
              <p className="text-gray-300 text-sm">A Hohmann transfer is the minimum-energy elliptical orbit connecting two circular orbits around the same body. Two impulsive burns at periapsis and apoapsis.</p>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-1">Initial Orbit Radius r₁ (km from Earth center)</label>
              <input type="number" value={r1} onChange={e => setR1(+e.target.value)} min={6371}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-orange-500" />
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {[{ l: 'LEO 400km', v: 6771 }, { l: 'ISS 408km', v: 6779 }, { l: 'GPS orbit', v: 26560 }, { l: 'GEO', v: 42164 }].map(p => (
                  <button key={p.l} onClick={() => setR1(p.v)} className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">{p.l}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-1">Target Orbit Radius r₂ (km from Earth center)</label>
              <input type="number" value={r2} onChange={e => setR2(+e.target.value)} min={6371}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-orange-500" />
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {[{ l: 'GEO', v: 42164 }, { l: 'Moon', v: 384400 }, { l: 'L2 point', v: 1500000 }, { l: 'HEO 36k', v: 36000 }].map(p => (
                  <button key={p.l} onClick={() => setR2(p.v)} className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">{p.l}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-orange-900/20 rounded-xl p-5 border border-orange-800/40">
              <div className="text-orange-400 text-xs font-semibold uppercase mb-4">Hohmann Transfer Results</div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Burn 1 (periapsis)</span>
                  <span className="text-orange-300 font-mono font-bold">{formatDV(dv1Hoh * 1000)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Burn 2 (apoapsis)</span>
                  <span className="text-orange-300 font-mono font-bold">{formatDV(dv2Hoh * 1000)}</span>
                </div>
                <div className="border-t border-orange-800/40 pt-3 flex justify-between items-center">
                  <span className="text-white font-bold">Total ΔV</span>
                  <span className="text-white font-mono font-bold text-2xl">{formatDV(totalHoh * 1000)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Transfer time</span>
                  <span className="text-gray-300 font-mono">{tTransfer < 3600 ? (tTransfer / 60).toFixed(0) + ' min' : tTransfer < 86400 ? (tTransfer / 3600).toFixed(1) + ' hr' : (tTransfer / 86400).toFixed(1) + ' days'}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/60 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">r₁ circular velocity</span>
                <span className="text-gray-300 font-mono">{v1.toFixed(3)} km/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">r₂ circular velocity</span>
                <span className="text-gray-300 font-mono">{v2.toFixed(3)} km/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Transfer orbit semi-major axis</span>
                <span className="text-gray-300 font-mono">{((r1 + r2) / 2).toLocaleString()} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Transfer orbit eccentricity</span>
                <span className="text-gray-300 font-mono">{((r2 - r1) / (r1 + r2)).toFixed(4)}</span>
              </div>
            </div>

            <div className="bg-gray-800/60 rounded-xl p-3 text-xs text-gray-400">
              <strong className="text-white">Note:</strong> Hohmann is minimum-energy but not always fastest. For large r₂/r₁ ratios, bi-elliptic transfers can save fuel. For time-critical missions, direct high-energy trajectories are used.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
