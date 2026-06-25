import { useState, useCallback } from 'react'

const C = 299792458 // m/s
const G = 6.674e-11
const M_SUN = 1.989e30
const R_SUN = 6.957e8

interface Body {
  name: string
  mass: number
  radius: number
  emoji: string
}

const BODIES: Body[] = [
  { name: 'Earth surface', mass: 5.972e24, radius: 6.371e6, emoji: '🌍' },
  { name: 'Earth orbit (ISS)', mass: 5.972e24, radius: 6.371e6 + 408000, emoji: '🛸' },
  { name: 'Moon surface', mass: 7.342e22, radius: 1.737e6, emoji: '🌕' },
  { name: 'Sun surface', mass: M_SUN, radius: R_SUN, emoji: '☀️' },
  { name: 'White dwarf', mass: M_SUN * 0.6, radius: 7e6, emoji: '⚪' },
  { name: 'Neutron star', mass: M_SUN * 1.4, radius: 10000, emoji: '💫' },
  { name: 'Stellar BH (10 M☉)', mass: M_SUN * 10, radius: 3e4, emoji: '⚫' },
  { name: 'Deep space', mass: 0, radius: Infinity, emoji: '🌌' },
]

function schwarzschildRadius(mass: number) {
  return (2 * G * mass) / (C * C)
}

function gravitationalDilation(mass: number, radius: number): number {
  if (mass === 0) return 1
  const rs = schwarzschildRadius(mass)
  const ratio = rs / radius
  if (ratio >= 1) return Infinity
  return 1 / Math.sqrt(1 - ratio)
}

function specialDilation(v: number): number {
  const beta = v / C
  if (beta >= 1) return Infinity
  return 1 / Math.sqrt(1 - beta * beta)
}

const MISSIONS = [
  { name: 'ISS Crew (6 months)', velocity: 7700, altitude: 408000, duration: 180, unit: 'days' },
  { name: 'Voyager 1', velocity: 17000, altitude: 2.3e13, duration: 47, unit: 'years' },
  { name: 'Parker Solar Probe (perihelion)', velocity: 192000, altitude: 6.16e9, duration: 1, unit: 'years' },
  { name: 'Muon (cosmic ray)', velocity: C * 0.9994, altitude: 1e10, duration: 2.2e-6, unit: 'seconds' },
]

export default function TimeDilationCalculator() {
  const [mode, setMode] = useState<'special' | 'general' | 'combined' | 'missions'>('special')
  const [velocity, setVelocity] = useState(0.5)
  const [bodyIndex, setBodyIndex] = useState(0)
  const [earthYears, setEarthYears] = useState(10)

  const beta = velocity
  const v = beta * C
  const gamma = specialDilation(v)

  const body = BODIES[bodyIndex]
  const gFactor = gravitationalDilation(body.mass, body.radius)

  const deepSpaceFactor = gravitationalDilation(0, Infinity)
  const relFactor = gFactor / deepSpaceFactor

  const properTime = (earthYears / gamma) * relFactor

  const formatFactor = (f: number) => {
    if (!isFinite(f)) return '∞'
    if (f < 1.00001) return f.toFixed(8)
    if (f < 1.001) return f.toFixed(6)
    return f.toFixed(4)
  }

  const velocityLabels = [
    { v: 0, label: 'Stationary' },
    { v: 0.1, label: '10% c' },
    { v: 0.5, label: '50% c' },
    { v: 0.9, label: '90% c' },
    { v: 0.99, label: '99% c' },
    { v: 0.999, label: '99.9% c' },
    { v: 0.9999, label: '99.99% c' },
  ]

  const getBarColor = useCallback((val: number) => {
    if (val < 1.001) return '#10b981'
    if (val < 2) return '#f59e0b'
    if (val < 10) return '#f97316'
    return '#ef4444'
  }, [])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">⏳</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Time Dilation Calculator</h2>
          <p className="text-blue-300 text-sm">Special & General Relativistic effects — Einstein was right</p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(['special', 'general', 'combined', 'missions'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${mode === m ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {m === 'special' ? '🚀 Special Relativity' :
             m === 'general' ? '🌍 Gravitational' :
             m === 'combined' ? '🔗 Combined' : '🛸 Real Missions'}
          </button>
        ))}
      </div>

      {mode === 'special' && (
        <div>
          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-2 block">
              Velocity: <span className="font-mono text-blue-300 font-bold">{(beta * 100).toFixed(3)}% of c</span>
              {' '}= <span className="font-mono text-blue-200">{(v / 1e6).toFixed(2)} km/s</span>
            </label>
            <input
              type="range" min={0} max={0.9999} step={0.0001}
              value={beta}
              onChange={e => setVelocity(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0</span><span>10% c</span><span>50% c</span><span>99.99% c</span>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mb-6">
            {velocityLabels.map(({ v: pv, label }) => (
              <button
                key={label}
                onClick={() => setVelocity(pv)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs text-gray-300 rounded-lg transition"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Results */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
            <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-500/30 text-center">
              <div className="text-xs text-blue-300 mb-1">Lorentz Factor γ</div>
              <div className="text-3xl font-bold text-white font-mono">{formatFactor(gamma)}</div>
              <div className="text-xs text-gray-400 mt-1">Time slows by this factor</div>
            </div>
            <div className="bg-purple-900/30 rounded-xl p-4 border border-purple-500/30 text-center">
              <div className="text-xs text-purple-300 mb-1">Traveler's 10 Earth-years =</div>
              <div className="text-3xl font-bold text-white font-mono">
                {isFinite(gamma) ? (10 / gamma).toFixed(3) : '0'}
              </div>
              <div className="text-xs text-gray-400 mt-1">years for traveler</div>
            </div>
            <div className="bg-green-900/30 rounded-xl p-4 border border-green-500/30 text-center">
              <div className="text-xs text-green-300 mb-1">Length contraction</div>
              <div className="text-3xl font-bold text-white font-mono">
                {isFinite(gamma) ? `1/${formatFactor(gamma)}` : '→0'}
              </div>
              <div className="text-xs text-gray-400 mt-1">of rest length in travel direction</div>
            </div>
          </div>

          {/* Gamma curve visual */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 mb-3 font-semibold">Lorentz Factor vs. Velocity</div>
            <div className="flex items-end gap-1 h-24">
              {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 0.999].map(bv => {
                const g = specialDilation(bv * C)
                const maxG = 22
                const h = Math.min(100, (g / maxG) * 100)
                const isActive = Math.abs(bv - beta) < 0.06
                return (
                  <div key={bv} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t transition-all"
                      style={{
                        height: h + '%',
                        backgroundColor: isActive ? '#3b82f6' : getBarColor(g),
                        opacity: isActive ? 1 : 0.5,
                      }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0</span><span>0.5c</span><span>0.99c</span>
            </div>
            {gamma > 2 && (
              <div className="mt-3 text-sm text-blue-300 bg-blue-900/20 rounded p-2 border border-blue-500/20">
                At {(beta * 100).toFixed(2)}% c: for every {gamma.toFixed(1)} years on Earth, only 1 year passes for the traveler. After 10 Earth-years, traveler aged only {(10 / gamma).toFixed(2)} years.
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'general' && (
        <div>
          <div className="mb-6">
            <label className="text-sm text-gray-300 mb-3 block">Location in gravitational field:</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BODIES.map((b, i) => (
                <button
                  key={b.name}
                  onClick={() => setBodyIndex(i)}
                  className={`p-3 rounded-lg text-left border transition-all ${i === bodyIndex ? 'border-blue-500 bg-blue-900/30' : 'border-white/10 bg-white/5 hover:border-blue-500/50'}`}
                >
                  <div className="text-xl mb-1">{b.emoji}</div>
                  <div className="text-xs text-white font-medium leading-tight">{b.name}</div>
                  {b.mass > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">{(b.mass / M_SUN).toExponential(1)} M☉</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="bg-orange-900/30 rounded-xl p-4 border border-orange-500/30 text-center">
              <div className="text-xs text-orange-300 mb-1">Gravitational Dilation</div>
              <div className="text-3xl font-bold text-white font-mono">
                {body.mass === 0 ? '1.000000' : formatFactor(gFactor)}
              </div>
              <div className="text-xs text-gray-400 mt-1">vs. deep space</div>
            </div>
            <div className="bg-red-900/30 rounded-xl p-4 border border-red-500/30 text-center">
              <div className="text-xs text-red-300 mb-1">Schwarzschild radius</div>
              <div className="text-2xl font-bold text-white font-mono">
                {body.mass === 0 ? 'N/A' :
                  schwarzschildRadius(body.mass) < 1000
                    ? `${schwarzschildRadius(body.mass).toFixed(1)} m`
                    : `${(schwarzschildRadius(body.mass) / 1000).toFixed(0)} km`}
              </div>
              <div className="text-xs text-gray-400 mt-1">event horizon if compressed</div>
            </div>
            <div className="bg-yellow-900/30 rounded-xl p-4 border border-yellow-500/30 text-center">
              <div className="text-xs text-yellow-300 mb-1">Surface gravity</div>
              <div className="text-2xl font-bold text-white font-mono">
                {body.mass === 0 ? '0' :
                  (G * body.mass / (body.radius * body.radius)).toExponential(2)} m/s²
              </div>
              <div className="text-xs text-gray-400 mt-1">
                = {body.mass === 0 ? '0' : (G * body.mass / (body.radius * body.radius) / 9.81).toFixed(1)}g
              </div>
            </div>
          </div>

          {body.name !== 'Deep space' && (
            <div className="mt-4 text-sm text-blue-300 bg-blue-900/20 rounded p-3 border border-blue-500/20">
              At {body.emoji} {body.name}: clocks run {
                gFactor === Infinity ? 'infinitely slowly (event horizon!)' :
                `${((1 - 1/gFactor) * 1e6).toFixed(2)} μs/s slower`
              } than in deep space.
              {body.name === 'Earth surface' && ' GPS satellites must correct for this 45.9 μs/day difference!'}
              {body.name === 'Neutron star' && ' Time passes at only ' + (100/gFactor).toFixed(1) + '% the rate of deep space!'}
            </div>
          )}
        </div>
      )}

      {mode === 'combined' && (
        <div>
          <p className="text-sm text-gray-300 mb-4">
            Real spacecraft experience BOTH special (velocity) and general (gravity) time dilation simultaneously. They can partially cancel each other.
          </p>

          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-1 block">
              Velocity: <span className="font-mono text-blue-300">{(beta * 100).toFixed(3)}% c</span>
            </label>
            <input type="range" min={0} max={0.9999} step={0.0001} value={beta}
              onChange={e => setVelocity(parseFloat(e.target.value))} className="w-full accent-blue-500 mb-4" />
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-1 block">Gravitational environment:</label>
            <select
              value={bodyIndex}
              onChange={e => setBodyIndex(parseInt(e.target.value))}
              className="bg-white/10 text-white px-3 py-2 rounded-lg border border-white/20 text-sm w-full"
            >
              {BODIES.map((b, i) => <option key={b.name} value={i}>{b.emoji} {b.name}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-1 block">
              Earth-frame duration: <span className="font-mono text-blue-300">{earthYears} years</span>
            </label>
            <input type="range" min={1} max={100} step={1} value={earthYears}
              onChange={e => setEarthYears(parseInt(e.target.value))} className="w-full accent-blue-500" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mt-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
              <div className="text-xs text-gray-400 mb-1">Special dilation (γ)</div>
              <div className="text-2xl font-bold text-blue-300 font-mono">{formatFactor(gamma)}</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
              <div className="text-xs text-gray-400 mb-1">Gravitational factor</div>
              <div className="text-2xl font-bold text-orange-300 font-mono">
                {body.mass === 0 ? '1.000' : formatFactor(gFactor)}
              </div>
            </div>
            <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-500/30 text-center">
              <div className="text-xs text-blue-300 mb-1">Traveler's proper time</div>
              <div className="text-2xl font-bold text-white font-mono">
                {isFinite(properTime) ? properTime.toFixed(4) : '0'} yr
              </div>
              <div className="text-xs text-gray-400">out of {earthYears} Earth years</div>
            </div>
          </div>

          <div className="mt-4 bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 mb-2">GPS Satellite Example</div>
            <div className="text-sm text-gray-300">
              GPS satellites travel at 3.87 km/s (special: clocks slow by 7.2 μs/day) but are high in Earth's gravity well (general: clocks speed up by 45.9 μs/day).
              Net effect: +38.4 μs/day — without correction, GPS would drift <span className="text-yellow-300 font-semibold">~10 km/day</span> in position error!
            </div>
          </div>
        </div>
      )}

      {mode === 'missions' && (
        <div>
          <p className="text-sm text-gray-300 mb-4">Real time dilation experienced by missions, spacecraft, and particles:</p>
          <div className="space-y-3">
            {MISSIONS.map(m => {
              const gamma_m = specialDilation(m.velocity)
              const slowed = m.duration / gamma_m
              const diff = m.duration - slowed
              return (
                <div key={m.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-semibold text-white">{m.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        v = {(m.velocity / 1000).toFixed(1)} km/s = {((m.velocity / C) * 100).toFixed(4)}% c
                      </div>
                      <div className="text-xs text-gray-400">
                        Duration: {m.duration} {m.unit}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-blue-300">γ = {formatFactor(gamma_m)}</div>
                      <div className="text-sm font-bold text-white">
                        Δt = {diff < 0.001 ? (diff * 1000).toFixed(4) + ' m' + m.unit :
                              diff < 1 ? diff.toFixed(6) + ' ' + m.unit :
                              diff.toFixed(4) + ' ' + m.unit} younger
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 bg-white/5 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, ((1 - 1/gamma_m) * 100000))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 bg-yellow-900/20 rounded-xl p-4 border border-yellow-500/20">
            <div className="text-sm font-semibold text-yellow-300 mb-1">Twin Paradox</div>
            <div className="text-sm text-gray-300">
              If you travel to Proxima Centauri (4.24 ly) at 99.9% c, only <span className="text-white font-semibold">0.19 years</span> pass for you, while <span className="text-white font-semibold">4.24 years</span> pass on Earth. Your twin is older when you return!
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
