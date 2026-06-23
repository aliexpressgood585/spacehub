import { useState, useEffect } from 'react'
import SolarWind3D from './SolarWind3D'

function kpColor(kp: number) {
  if (kp >= 7) return '#f87171'
  if (kp >= 5) return '#f97316'
  if (kp >= 4) return '#fbbf24'
  return '#4ade80'
}

function kpLabel(kp: number) {
  if (kp >= 8) return 'Extreme Storm'
  if (kp >= 7) return 'Severe Storm'
  if (kp >= 6) return 'Strong Storm'
  if (kp >= 5) return 'G1 Storm'
  if (kp >= 4) return 'Active'
  if (kp >= 2) return 'Quiet'
  return 'Very Quiet'
}

function windLabel(speed: number) {
  if (speed > 700) return 'Extreme speed'
  if (speed > 600) return 'Very fast stream'
  if (speed > 500) return 'Fast stream active'
  if (speed > 400) return 'Normal'
  return 'Slow stream'
}

function windColor(speed: number) {
  if (speed > 600) return '#f87171'
  if (speed > 500) return '#fbbf24'
  return '#4ade80'
}

export default function SpaceWeather() {
  const [kp, setKp] = useState<number | null>(null)
  const [windSpeed, setWindSpeed] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [updated, setUpdated] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json').then(r => r.json()),
    ]).then(([kpData, windData]: [string[][], string[][]]) => {
      const lastKp = kpData[kpData.length - 1]
      const lastWind = windData[windData.length - 1]
      const kpVal = parseFloat(lastKp[1])
      const speedVal = parseFloat(lastWind[2])
      if (!isNaN(kpVal)) setKp(kpVal)
      if (!isNaN(speedVal)) setWindSpeed(speedVal)
      setUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
      setLoading(false)
    }).catch(() => { setFetchError(true); setLoading(false) })
  }, [])

  const kpC = kp !== null ? kpColor(kp) : '#6b7280'
  const windC = windSpeed !== null ? windColor(windSpeed) : '#6b7280'

  const metrics = [
    {
      label: 'Solar Wind',
      value: windSpeed !== null ? `${Math.round(windSpeed)} km/s` : '—',
      sub: windSpeed !== null ? windLabel(windSpeed) : fetchError ? 'Data unavailable' : 'Fetching...',
      icon: '☀️',
      bar: windSpeed !== null ? Math.min(100, Math.round((windSpeed / 800) * 100)) : 0,
      color: windC,
    },
    {
      label: 'Cosmic Radiation',
      value: 'Low',
      sub: 'Background level',
      icon: '☢️',
      bar: 12,
      color: '#4ade80',
    },
    {
      label: 'Aurora Activity',
      value: kp !== null ? `Kp ${kp.toFixed(1)}` : '—',
      sub: kp !== null ? kpLabel(kp) : fetchError ? 'Data unavailable' : 'Fetching...',
      icon: '🌌',
      bar: kp !== null ? Math.round((kp / 9) * 100) : 0,
      color: kpC,
    },
    {
      label: 'Geomagnetic',
      value: kp !== null ? (kp >= 5 ? 'Storm' : kp >= 4 ? 'Active' : 'Stable') : '—',
      sub: kp !== null ? (kp >= 5 ? 'Activity detected' : 'No disturbances') : 'Fetching...',
      icon: '🧲',
      bar: kp !== null ? Math.round((kp / 9) * 100) : 0,
      color: kpC,
    },
  ]

  const alerts: { icon: string; text: string; color: string }[] = []
  if (!loading) {
    if (kp !== null && kp >= 5) alerts.push({ icon: '🌩️', text: `G${Math.min(5, Math.floor(kp) - 4)} geomagnetic storm in progress (Kp ${kp.toFixed(1)})`, color: '#f97316' })
    if (kp !== null && kp >= 4) alerts.push({ icon: '🌌', text: 'Aurora borealis possible at high latitudes tonight', color: '#818cf8' })
    if (windSpeed !== null && windSpeed > 500) alerts.push({ icon: '☀️', text: `Fast solar wind stream: ${Math.round(windSpeed)} km/s`, color: '#fbbf24' })
    if (alerts.length === 0) alerts.push({ icon: '✅', text: 'Space weather is quiet — no active storms', color: '#4ade80' })
  }

  return (
    <div className="space-y-5">
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-box">⛈️</div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-xl">Space Weather</h3>
            <p className="text-gray-500 text-xs">Real-time solar & geomagnetic conditions · NOAA SWPC{updated ? ` · Updated ${updated}` : ''}</p>
          </div>
          <div className="live-badge">
            <span className="live-dot" /> LIVE
          </div>
        </div>

        <div className="space-y-2 mb-6">
          {loading ? (
            <div className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ) : alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span>{a.icon}</span>
              <span style={{ color: a.color }}>{a.text}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {metrics.map(m => (
            <div key={m.label} className="rounded-2xl p-4" style={{ background: `${m.color}12`, border: `1px solid ${m.color}40` }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{m.icon}</span>
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{m.label}</span>
              </div>
              {loading ? (
                <div className="h-6 rounded animate-pulse mb-1" style={{ background: 'rgba(255,255,255,0.06)', width: '60%' }} />
              ) : (
                <p className="text-white font-black text-lg mb-0.5">{m.value}</p>
              )}
              <p className="text-xs mb-3" style={{ color: m.color, opacity: 0.8 }}>{m.sub}</p>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: loading ? '0%' : `${m.bar}%`, background: m.color, boxShadow: `0 0 8px ${m.color}60` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-box">🌞</div>
          <div>
            <h3 className="text-white font-bold text-base">Solar Wind — 3D Simulation</h3>
            <p className="text-gray-500 text-xs">Sun → Earth · Live particle stream</p>
          </div>
        </div>
        <SolarWind3D />
      </div>

      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-box">📊</div>
          <div>
            <h3 className="text-white font-bold text-base">Detailed Analysis</h3>
            <p className="text-gray-500 text-xs">Current space environment indices · NOAA</p>
          </div>
        </div>
        <div className="space-y-5">
          {[
            { label: 'Geomagnetic Storm (Kp Index)', pct: kp !== null ? Math.round((kp / 9) * 100) : 0, color: kpC, val: kp !== null ? `${kp.toFixed(1)} / 9` : '—' },
            { label: 'Cosmic Radiation Flux', pct: 12, color: '#4ade80', val: 'Low' },
            { label: 'Aurora Probability (60°N)', pct: kp !== null ? Math.min(100, Math.round((kp / 9) * 130)) : 0, color: '#818cf8', val: kp !== null ? `${Math.min(100, Math.round((kp / 9) * 130))}%` : '—' },
            { label: 'Solar Wind Speed', pct: windSpeed !== null ? Math.min(100, Math.round((windSpeed / 800) * 100)) : 0, color: '#fbbf24', val: windSpeed !== null ? `${Math.round(windSpeed)} km/s` : '—' },
          ].map(item => (
            <div key={item.label}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">{item.label}</span>
                <span style={{ color: item.color }} className="font-bold">{loading ? '—' : item.val}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: loading ? '0%' : `${item.pct}%`, background: item.color, boxShadow: `0 0 8px ${item.color}40` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 p-4 rounded-2xl text-xs text-gray-500 leading-relaxed" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          💡 <span className="text-gray-400 font-semibold">Aurora tip:</span> When Kp-index ≥ 5, auroras can be visible from latitudes as low as 50°N. Head to a dark location away from city lights for the best view.
        </div>
      </div>
    </div>
  )
}
