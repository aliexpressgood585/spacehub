import { useState, useRef, useEffect, useCallback } from 'react'

const G = 6.674e-11
const M_EARTH = 5.972e24
const R_EARTH = 6371

interface Orbit {
  name: string
  altitude_km: number
  period_min: number
  velocity_kms: number
  inclination: number
  color: string
  use: string
  examples: string[]
}

const ORBITS: Orbit[] = [
  { name: 'LEO', altitude_km: 400, period_min: 92.6, velocity_kms: 7.67, inclination: 51.6, color: '#3b82f6', use: 'Space stations, Earth observation, ISS', examples: ['ISS', 'Hubble', 'Starlink', 'Planet Labs'] },
  { name: 'SSO', altitude_km: 700, period_min: 99, velocity_kms: 7.52, inclination: 98.2, color: '#10b981', use: 'Earth observation, weather, always same lighting', examples: ['Landsat', 'Sentinel', 'MODIS', 'WorldView'] },
  { name: 'MEO', altitude_km: 20200, period_min: 718, velocity_kms: 3.87, inclination: 55, color: '#f59e0b', use: 'Navigation constellations (GPS)', examples: ['GPS (USA)', 'Glonass (RU)', 'Galileo (EU)', 'BeiDou (CN)'] },
  { name: 'GEO', altitude_km: 35786, period_min: 1436, velocity_kms: 3.07, inclination: 0, color: '#ef4444', use: 'Communications, weather — appears stationary', examples: ['GOES weather', 'SiriusXM', 'DirecTV', 'Intelsat'] },
  { name: 'HEO', altitude_km: 40000, period_min: 1640, velocity_kms: 2.93, inclination: 63.4, color: '#8b5cf6', use: 'High-latitude coverage, Russia Molniya', examples: ['Molniya comms', 'Tundra orbit sats', 'Syncom 3'] },
  { name: 'L2 Point', altitude_km: 1_500_000, period_min: 525960, velocity_kms: 0.21, inclination: 0, color: '#f0abfc', use: 'Deep space observatories', examples: ['JWST', 'Gaia', 'Euclid', 'Planck'] },
]

function orbitalPeriod(alt_km: number): number {
  const r = (R_EARTH + alt_km) * 1000
  return (2 * Math.PI * Math.sqrt(r * r * r / (G * M_EARTH))) / 60
}

function orbitalVelocity(alt_km: number): number {
  const r = (R_EARTH + alt_km) * 1000
  return Math.sqrt(G * M_EARTH / r) / 1000
}

function deltaVToOrbit(alt_km: number): number {
  const v1 = orbitalVelocity(alt_km)
  const v_surface = 0
  return v1 - v_surface + 9.3
}

function hofmannDeltaV(alt1_km: number, alt2_km: number): number {
  const r1 = (R_EARTH + alt1_km) * 1000
  const r2 = (R_EARTH + alt2_km) * 1000
  const mu = G * M_EARTH
  const v1 = Math.sqrt(mu / r1)
  const v_transfer1 = Math.sqrt(mu * (2 / r1 - 2 / (r1 + r2)))
  const v_transfer2 = Math.sqrt(mu * (2 / r2 - 2 / (r1 + r2)))
  const v2 = Math.sqrt(mu / r2)
  return Math.abs(v_transfer1 - v1) / 1000 + Math.abs(v2 - v_transfer2) / 1000
}

export default function OrbitalMechanicsLab() {
  const [customAlt, setCustomAlt] = useState(400)
  const [fromOrbit, setFromOrbit] = useState(400)
  const [toOrbit, setToOrbit] = useState(35786)
  const [selectedOrbit, setSelectedOrbit] = useState<Orbit>(ORBITS[0])
  const [mode, setMode] = useState<'visualize' | 'calculator' | 'transfer'>('visualize')
  const canvasRef = useRef<HTMLCanvasElement>(null)
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

    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, W, H)

    const cx = W / 2
    const cy = H / 2
    const earthR = 28

    // Stars
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137 + 11) % 100) / 100 * W
      const sy = ((i * 97 + 23) % 100) / 100 * H
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.1})`
      ctx.beginPath()
      ctx.arc(sx, sy, 0.7, 0, Math.PI * 2)
      ctx.fill()
    }

    // Earth
    const earthGrad = ctx.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, earthR)
    earthGrad.addColorStop(0, '#4dabf7')
    earthGrad.addColorStop(0.4, '#228be6')
    earthGrad.addColorStop(0.7, '#1c7ed6')
    earthGrad.addColorStop(1, '#1864ab')
    ctx.fillStyle = earthGrad
    ctx.beginPath()
    ctx.arc(cx, cy, earthR, 0, Math.PI * 2)
    ctx.fill()

    // Earth glow
    const glowGrad = ctx.createRadialGradient(cx, cy, earthR, cx, cy, earthR * 1.5)
    glowGrad.addColorStop(0, 'rgba(67,160,255,0.2)')
    glowGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(cx, cy, earthR * 1.5, 0, Math.PI * 2)
    ctx.fill()

    // Orbits
    const maxAlt = 42000
    const scale = (Math.min(W, H) * 0.44 - earthR) / maxAlt

    ORBITS.forEach((orbit, i) => {
      if (orbit.altitude_km > maxAlt) return
      const orbitR = earthR + orbit.altitude_km * scale

      ctx.strokeStyle = orbit.color + (selectedOrbit.name === orbit.name ? 'cc' : '44')
      ctx.lineWidth = selectedOrbit.name === orbit.name ? 2 : 1
      ctx.setLineDash(selectedOrbit.name === orbit.name ? [] : [4, 4])
      ctx.beginPath()
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // Label
      ctx.fillStyle = orbit.color + (selectedOrbit.name === orbit.name ? 'ff' : '88')
      ctx.font = `${selectedOrbit.name === orbit.name ? 11 : 9}px monospace`
      const labelAngle = -Math.PI * 0.5 + (i * Math.PI * 0.22)
      ctx.fillText(orbit.name, cx + (orbitR + 4) * Math.cos(labelAngle), cy + (orbitR + 4) * Math.sin(labelAngle))

      // Satellite dot on this orbit
      const period = orbit.period_min * 60
      const speed = (2 * Math.PI) / period
      const phase = speed * tRef.current + i * (Math.PI * 2 / ORBITS.length)
      const sx = cx + orbitR * Math.cos(phase)
      const sy = cy + orbitR * Math.sin(phase)

      const isSelected = selectedOrbit.name === orbit.name
      ctx.fillStyle = orbit.color
      ctx.beginPath()
      ctx.arc(sx, sy, isSelected ? 5 : 3, 0, Math.PI * 2)
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = orbit.color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(sx, sy, 9, 0, Math.PI * 2)
        ctx.stroke()
      }
    })

    // Custom orbit ring
    const customR = earthR + customAlt * scale
    if (customAlt <= maxAlt) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([2, 6])
      ctx.beginPath()
      ctx.arc(cx, cy, customR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '9px monospace'
      ctx.fillText(`${customAlt}km`, cx + customR + 3, cy - 3)

      const customSpeed = (2 * Math.PI) / (orbitalPeriod(customAlt) * 60)
      const csx = cx + customR * Math.cos(customSpeed * tRef.current + Math.PI * 0.7)
      const csy = cy + customR * Math.sin(customSpeed * tRef.current + Math.PI * 0.7)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(csx, csy, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    tRef.current += 1

    animRef.current = requestAnimationFrame(draw)
  }, [selectedOrbit, customAlt])

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  const period = orbitalPeriod(customAlt)
  const velocity = orbitalVelocity(customAlt)
  const dvHofmann = hofmannDeltaV(fromOrbit, toOrbit)
  const dvFromSurface = deltaVToOrbit(customAlt)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🛸</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Orbital Mechanics Lab</h2>
          <p className="text-blue-300 text-sm">Visualize orbits, compute maneuvers, plan missions</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['visualize', 'calculator', 'transfer'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {m === 'visualize' ? '🌍 Visualize' : m === 'calculator' ? '📐 Calculator' : '🔄 Hohmann Transfer'}
          </button>
        ))}
      </div>

      {mode === 'visualize' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <canvas
              ref={canvasRef}
              width={360}
              height={300}
              className="w-full rounded-xl border border-white/10"
              style={{ height: 280 }}
            />
            <div className="mt-2">
              <label className="text-xs text-gray-400">
                Custom orbit altitude: <span className="text-white font-mono">{customAlt.toLocaleString()} km</span>
              </label>
              <input type="range" min={200} max={42000} step={100} value={customAlt}
                onChange={e => setCustomAlt(parseInt(e.target.value))} className="w-full accent-blue-500 mt-1" />
            </div>
          </div>

          <div className="space-y-2">
            {ORBITS.map(o => (
              <button
                key={o.name}
                onClick={() => setSelectedOrbit(o)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${selectedOrbit.name === o.name ? 'border-blue-500 bg-blue-900/20' : 'border-white/10 bg-white/5 hover:border-blue-500/40'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: o.color }} />
                  <span className="font-bold text-white text-sm">{o.name}</span>
                  <span className="text-xs text-gray-400">{o.altitude_km.toLocaleString()} km</span>
                </div>
                <div className="text-xs text-gray-400">{o.use}</div>
                {selectedOrbit.name === o.name && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {o.examples.map(e => (
                      <span key={e} className="text-xs px-1.5 py-0.5 bg-white/10 text-gray-300 rounded">{e}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'calculator' && (
        <div>
          <div className="mb-6">
            <label className="text-sm text-gray-300 mb-1 block">
              Altitude: <span className="font-mono text-blue-300">{customAlt.toLocaleString()} km</span>
              {' '}(radius: <span className="font-mono text-blue-200">{(R_EARTH + customAlt).toLocaleString()} km</span>)
            </label>
            <input type="range" min={160} max={1_500_000} step={100} value={customAlt}
              onChange={e => setCustomAlt(parseInt(e.target.value))} className="w-full accent-blue-500" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>160 km (min LEO)</span><span>MEO (20k)</span><span>GEO (36k)</span><span>L2 (1.5M)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: 'Orbital period', value: period < 60 ? `${period.toFixed(1)} min` : period < 1440 ? `${(period / 60).toFixed(2)} h` : `${(period / 1440).toFixed(2)} days`, color: '#3b82f6' },
              { label: 'Orbital velocity', value: `${velocity.toFixed(2)} km/s`, color: '#10b981' },
              { label: 'Angular velocity', value: `${(360 / period).toFixed(4)} °/min`, color: '#8b5cf6' },
              { label: 'Centripetal accel.', value: `${((G * M_EARTH) / Math.pow((R_EARTH + customAlt) * 1000, 2)).toFixed(2)} m/s²`, color: '#f59e0b' },
              { label: 'vs. Earth gravity', value: `${((G * M_EARTH / Math.pow((R_EARTH + customAlt) * 1000, 2)) / 9.81 * 100).toFixed(1)}% of g`, color: '#ef4444' },
              { label: 'ΔV from surface', value: `~${dvFromSurface.toFixed(2)} km/s`, color: '#f0abfc' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/5 rounded-xl p-3 border border-white/10">
                <div className="text-xs text-gray-400">{label}</div>
                <div className="text-lg font-bold font-mono mt-1" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Escape velocity */}
          <div className="mt-4 bg-orange-900/20 rounded-xl p-4 border border-orange-500/20">
            <div className="text-xs text-orange-300 font-semibold mb-1">Escape velocity from this altitude</div>
            <div className="text-2xl font-bold text-white font-mono">
              {(orbitalVelocity(customAlt) * Math.sqrt(2)).toFixed(2)} km/s
            </div>
            <div className="text-xs text-gray-400 mt-1">= √2 × orbital velocity. Extra {((orbitalVelocity(customAlt) * (Math.sqrt(2) - 1))).toFixed(2)} km/s gets you to interplanetary space.</div>
          </div>
        </div>
      )}

      {mode === 'transfer' && (
        <div>
          <p className="text-sm text-gray-400 mb-4">A Hohmann transfer is the most fuel-efficient way to move between two circular orbits (2 engine burns).</p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm text-gray-300 mb-1 block">From orbit: <span className="text-blue-300 font-mono">{fromOrbit.toLocaleString()} km</span></label>
              <input type="range" min={200} max={40000} step={100} value={fromOrbit}
                onChange={e => setFromOrbit(parseInt(e.target.value))} className="w-full accent-blue-500" />
              <div className="text-xs text-gray-500 mt-0.5">Period: {orbitalPeriod(fromOrbit).toFixed(0)} min</div>
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">To orbit: <span className="text-red-300 font-mono">{toOrbit.toLocaleString()} km</span></label>
              <input type="range" min={200} max={40000} step={100} value={toOrbit}
                onChange={e => setToOrbit(parseInt(e.target.value))} className="w-full accent-red-500" />
              <div className="text-xs text-gray-500 mt-0.5">Period: {orbitalPeriod(toOrbit).toFixed(0)} min</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total ΔV', value: `${dvHofmann.toFixed(3)} km/s`, color: '#f59e0b' },
              { label: 'Transfer time', value: (() => {
                const a = ((R_EARTH + fromOrbit + R_EARTH + toOrbit) * 1000) / 2
                const t = Math.PI * Math.sqrt(a * a * a / (G * M_EARTH)) / 60
                return t < 60 ? `${t.toFixed(0)} min` : `${(t / 60).toFixed(1)} h`
              })(), color: '#3b82f6' },
              { label: 'Burn 1 (perigee)', value: `${Math.abs(orbitalVelocity(fromOrbit) - Math.sqrt(G * M_EARTH * 2 / ((R_EARTH + fromOrbit) * 1000) - G * M_EARTH / ((R_EARTH + (fromOrbit + toOrbit) / 2) * 1000)) / 1000).toFixed(3)} km/s`, color: '#10b981' },
              { label: 'Altitude change', value: `${Math.abs(toOrbit - fromOrbit).toLocaleString()} km`, color: '#8b5cf6' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
                <div className="text-xs text-gray-400">{label}</div>
                <div className="text-lg font-bold font-mono mt-1" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-white/5 rounded-xl p-4 border border-white/10 text-xs text-gray-300">
            <div className="font-semibold text-white mb-2">How Hohmann transfer works:</div>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Start at circular orbit at {fromOrbit.toLocaleString()} km altitude</li>
              <li>First burn: accelerate to enter elliptical transfer orbit (periapsis = lower orbit, apoapsis = higher orbit)</li>
              <li>Coast along the ellipse for half an orbit</li>
              <li>Second burn at the target altitude: circularize the orbit</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
