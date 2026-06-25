import { useState, useEffect, useRef } from 'react'

interface KpData {
  time_tag: string
  kp_index: number
  estimated_kp?: number
}

interface SolarWindData {
  time_tag: string
  speed: number
  density: number
  temperature: number
  bt: number
  bz: number
}

interface Alert {
  issue_datetime: string
  message: string
  type: string
}

function KpGauge({ kp }: { kp: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H - 20
    const r = Math.min(W, H) * 0.75

    ctx.clearRect(0, 0, W, H)

    // Background arc
    const zones = [
      { min: 0, max: 4, color: '#22c55e' },
      { min: 4, max: 5, color: '#eab308' },
      { min: 5, max: 7, color: '#f97316' },
      { min: 7, max: 9, color: '#ef4444' },
    ]
    zones.forEach(z => {
      const startA = Math.PI + (z.min / 9) * Math.PI
      const endA = Math.PI + (z.max / 9) * Math.PI
      ctx.beginPath()
      ctx.arc(cx, cy, r, startA, endA)
      ctx.strokeStyle = z.color
      ctx.lineWidth = 14
      ctx.stroke()
    })

    // Needle
    const angle = Math.PI + (Math.min(kp, 9) / 9) * Math.PI
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(angle) * r * 0.85, cy + Math.sin(angle) * r * 0.85)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()

    // Value
    ctx.font = 'bold 28px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText(kp.toFixed(1), cx, cy - r * 0.35)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Kp Index', cx, cy - r * 0.15)

    // Tick labels
    for (let i = 0; i <= 9; i += 3) {
      const a = Math.PI + (i / 9) * Math.PI
      const tx = cx + Math.cos(a) * (r + 16)
      const ty = cy + Math.sin(a) * (r + 16)
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.textAlign = 'center'
      ctx.fillText(String(i), tx, ty + 4)
    }
  }, [kp])
  return <canvas ref={ref} width={200} height={120} className="w-full" />
}

function getKpLevel(kp: number) {
  if (kp < 4) return { label: 'Quiet', color: '#22c55e', bg: 'bg-green-900/20 border-green-800/40' }
  if (kp < 5) return { label: 'Unsettled', color: '#eab308', bg: 'bg-yellow-900/20 border-yellow-800/40' }
  if (kp < 6) return { label: 'G1 Minor Storm', color: '#f97316', bg: 'bg-orange-900/20 border-orange-800/40' }
  if (kp < 7) return { label: 'G2 Moderate Storm', color: '#f97316', bg: 'bg-orange-900/20 border-orange-800/40' }
  if (kp < 8) return { label: 'G3 Strong Storm', color: '#ef4444', bg: 'bg-red-900/20 border-red-800/40' }
  if (kp < 9) return { label: 'G4 Severe Storm', color: '#ef4444', bg: 'bg-red-900/20 border-red-800/40' }
  return { label: 'G5 Extreme Storm', color: '#dc2626', bg: 'bg-red-900/40 border-red-600/60' }
}

function getBzColor(bz: number) {
  if (bz > 5) return '#22c55e'
  if (bz > 0) return '#84cc16'
  if (bz > -5) return '#eab308'
  if (bz > -10) return '#f97316'
  return '#ef4444'
}

export default function LiveSpaceWeather() {
  const [kpHistory, setKpHistory] = useState<KpData[]>([])
  const [wind, setWind] = useState<SolarWindData | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState(false)

  const fetchData = async () => {
    try {
      const [kpRes, windRes, alertRes] = await Promise.allSettled([
        fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'),
        fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'),
        fetch('https://services.swpc.noaa.gov/products/alerts.json'),
      ])

      if (kpRes.status === 'fulfilled' && kpRes.value.ok) {
        const data: KpData[] = await kpRes.value.json()
        setKpHistory(data.slice(-60))
      }

      if (windRes.status === 'fulfilled' && windRes.value.ok) {
        const data: SolarWindData[] = await windRes.value.json()
        const latest = data.filter(d => d.speed && d.speed > 0).at(-1)
        if (latest) setWind(latest)
      }

      if (alertRes.status === 'fulfilled' && alertRes.value.ok) {
        const data: Alert[] = await alertRes.value.json()
        setAlerts(data.slice(0, 5))
      }

      setLastUpdate(new Date())
      setLoading(false)
      setError(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000) // refresh every 60s
    return () => clearInterval(interval)
  }, [])

  const currentKp = kpHistory.at(-1)?.kp_index ?? kpHistory.at(-1)?.estimated_kp ?? 0
  const kpLevel = getKpLevel(currentKp)

  return (
    <div className="space-card p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-2xl font-bold text-white">Live Space Weather</h2>
          <p className="text-gray-400 text-sm">Real-time NOAA SWPC data — updated every minute</p>
        </div>
        <div className="text-right">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${loading ? 'bg-gray-800 text-gray-400' : error ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-gray-500' : error ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
            {loading ? 'Connecting…' : error ? 'Offline' : 'LIVE'}
          </div>
          {lastUpdate && <div className="text-gray-600 text-xs mt-1">{lastUpdate.toLocaleTimeString()}</div>}
        </div>
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center">
          <div className="text-gray-500 text-sm animate-pulse">Fetching NOAA SWPC data…</div>
        </div>
      )}

      {!loading && (
        <div className="mt-5 space-y-5">
          {/* Top row: Kp gauge + storm level + solar wind */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Kp Gauge */}
            <div className="bg-gray-800/60 rounded-xl p-4 flex flex-col items-center">
              <KpGauge kp={currentKp} />
              <div className={`mt-2 px-3 py-1 rounded-full text-xs font-bold border ${kpLevel.bg}`} style={{ color: kpLevel.color }}>
                {kpLevel.label}
              </div>
              <div className="text-gray-500 text-xs mt-2 text-center">Geomagnetic Activity (Kp scale 0–9)</div>
            </div>

            {/* Solar Wind */}
            {wind ? (
              <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
                <h3 className="text-white font-bold text-sm mb-3">Solar Wind</h3>
                <div>
                  <div className="text-gray-500 text-xs uppercase mb-1">Speed</div>
                  <div className="text-2xl font-bold font-mono" style={{ color: wind.speed > 600 ? '#ef4444' : wind.speed > 500 ? '#f97316' : '#22c55e' }}>
                    {wind.speed.toFixed(0)} <span className="text-sm font-normal text-gray-400">km/s</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-green-500 to-red-500" style={{ width: `${Math.min((wind.speed / 900) * 100, 100)}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-gray-500 text-xs uppercase">Density</div>
                    <div className="text-white font-mono text-lg">{wind.density.toFixed(1)} <span className="text-xs text-gray-400">p/cm³</span></div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs uppercase">Bt Field</div>
                    <div className="text-white font-mono text-lg">{wind.bt?.toFixed(1) ?? '—'} <span className="text-xs text-gray-400">nT</span></div>
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase mb-1">Bz Component</div>
                  <div className="text-2xl font-bold font-mono" style={{ color: getBzColor(wind.bz ?? 0) }}>
                    {wind.bz !== undefined ? (wind.bz > 0 ? '+' : '') + wind.bz.toFixed(1) : '—'} <span className="text-sm font-normal text-gray-400">nT</span>
                  </div>
                  <div className="text-gray-600 text-xs">{(wind.bz ?? 0) < -10 ? '⚠ Southward — storm-enhanced' : (wind.bz ?? 0) < 0 ? 'Southward — geoeffective' : 'Northward — low activity'}</div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800/60 rounded-xl p-4 flex items-center justify-center text-gray-600 text-sm">Solar wind data unavailable</div>
            )}

            {/* Kp History Chart */}
            <div className="bg-gray-800/60 rounded-xl p-4">
              <h3 className="text-white font-bold text-sm mb-3">Kp — Last Hour</h3>
              <div className="flex items-end gap-px h-28">
                {kpHistory.slice(-60).map((d, i) => {
                  const val = d.kp_index ?? d.estimated_kp ?? 0
                  const color = getKpLevel(val).color
                  return (
                    <div key={i} className="flex-1 rounded-t-sm transition-all" style={{ height: `${(val / 9) * 100}%`, backgroundColor: color, opacity: 0.85 }} title={`${val} @ ${new Date(d.time_tag).toLocaleTimeString()}`} />
                  )
                })}
                {kpHistory.length === 0 && <div className="w-full flex items-center justify-center text-gray-600 text-xs">No data</div>}
              </div>
              <div className="flex justify-between text-gray-600 text-xs mt-1">
                <span>60 min ago</span><span>Now</span>
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {[{ k: 0, l: 'Quiet' }, { k: 5, l: 'G1' }, { k: 7, l: 'G3' }, { k: 9, l: 'G5' }].map(({ k, l }) => (
                  <span key={l} className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getKpLevel(k).color }} />{l}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Aurora Visibility */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <h3 className="text-white font-bold text-sm mb-3">Aurora Visibility Estimate</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { lat: '≥ 65°N', desc: 'Alaska, Norway, Siberia', minKp: 0 },
                { lat: '≥ 60°N', desc: 'Northern Canada, Iceland', minKp: 2 },
                { lat: '≥ 55°N', desc: 'Scotland, Southern Canada', minKp: 4 },
                { lat: '≥ 50°N', desc: 'Germany, Northern US', minKp: 5 },
                { lat: '≥ 45°N', desc: 'Southern US, Southern Europe', minKp: 7 },
              ].map(zone => {
                const visible = currentKp >= zone.minKp
                return (
                  <div key={zone.lat} className={`rounded-lg p-3 text-center border ${visible ? 'bg-green-900/20 border-green-800/40' : 'bg-gray-900/40 border-gray-700/40'}`}>
                    <div className={`text-lg mb-1 ${visible ? '' : 'grayscale opacity-40'}`}>🌌</div>
                    <div className={`text-xs font-bold ${visible ? 'text-green-400' : 'text-gray-600'}`}>{zone.lat}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{zone.desc}</div>
                    <div className={`text-xs mt-1 ${visible ? 'text-green-400' : 'text-gray-600'}`}>{visible ? '✓ Possible' : `Kp≥${zone.minKp}`}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* NOAA Alerts */}
          {alerts.length > 0 && (
            <div>
              <h3 className="text-white font-bold text-sm mb-3">NOAA Space Weather Alerts</h3>
              <div className="space-y-2">
                {alerts.slice(0, 4).map((a, i) => (
                  <div key={i} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/40">
                    <div className="text-gray-500 text-xs mb-1">{new Date(a.issue_datetime).toLocaleString()}</div>
                    <p className="text-gray-300 text-xs leading-relaxed line-clamp-3">{a.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scale Reference */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-800/60 rounded-xl p-4">
              <h3 className="text-white font-bold text-sm mb-3">NOAA Geomagnetic Storm Scale</h3>
              <div className="space-y-1.5">
                {[
                  { level: 'G1', kp: 'Kp=5', effect: 'Weak power grid fluctuations', aurora: '65°N', color: '#f59e0b' },
                  { level: 'G2', kp: 'Kp=6', effect: 'Transformer damage at high lat', aurora: '60°N', color: '#f97316' },
                  { level: 'G3', kp: 'Kp=7', effect: 'Voltage corrections needed', aurora: '55°N', color: '#ef4444' },
                  { level: 'G4', kp: 'Kp=8', effect: 'Widespread voltage control', aurora: '50°N', color: '#dc2626' },
                  { level: 'G5', kp: 'Kp=9', effect: 'Grid collapse (Carrington-class)', aurora: '40°N', color: '#9f1239' },
                ].map(row => (
                  <div key={row.level} className="flex items-center gap-3 text-xs">
                    <span className="font-bold w-7" style={{ color: row.color }}>{row.level}</span>
                    <span className="text-gray-500 w-12">{row.kp}</span>
                    <span className="text-gray-400 flex-1">{row.effect}</span>
                    <span className="text-gray-600">Aurora to {row.aurora}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4">
              <h3 className="text-white font-bold text-sm mb-3">Space Weather Impacts</h3>
              <div className="space-y-2 text-xs">
                {[
                  { icon: '📡', cat: 'Communications', desc: 'HF radio blackouts during solar flares (R-scale)' },
                  { icon: '🛰', cat: 'Satellites', desc: 'Increased drag causes orbital decay; single-event upsets' },
                  { icon: '⚡', cat: 'Power Grids', desc: 'Geomagnetically induced currents damage transformers' },
                  { icon: '🧭', cat: 'Navigation', desc: 'GPS errors increase to tens of meters during storms' },
                  { icon: '🧑‍🚀', cat: 'Astronauts', desc: 'ISS crew shelter from radiation during X-class flares' },
                ].map(item => (
                  <div key={item.cat} className="flex gap-2">
                    <span>{item.icon}</span>
                    <div>
                      <span className="text-white font-semibold">{item.cat}: </span>
                      <span className="text-gray-400">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center text-gray-600 text-xs">
            Data source: NOAA Space Weather Prediction Center (SWPC) • Kp index refreshes every 1 min
          </div>
        </div>
      )}
    </div>
  )
}
