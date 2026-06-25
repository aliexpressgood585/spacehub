import { useState, useEffect, useRef } from 'react'

interface KpEntry { time: string; kp: number }

const LAT_BANDS = [
  { lat: 90, minKp: 0,   label: 'North Pole', flag: '🏔️' },
  { lat: 70, minKp: 1,   label: 'Alaska / Norway', flag: '🇳🇴' },
  { lat: 65, minKp: 2,   label: 'Iceland / Fairbanks', flag: '🇮🇸' },
  { lat: 60, minKp: 3,   label: 'Helsinki / Anchorage', flag: '🇫🇮' },
  { lat: 55, minKp: 4,   label: 'Edinburgh / Moscow', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { lat: 50, minKp: 5,   label: 'London / Warsaw / Vancouver', flag: '🇬🇧' },
  { lat: 45, minKp: 6,   label: 'Paris / Seattle / Toronto', flag: '🇫🇷' },
  { lat: 40, minKp: 7,   label: 'New York / Rome / Madrid', flag: '🇺🇸' },
  { lat: 35, minKp: 8,   label: 'Tel Aviv / Los Angeles / Tokyo', flag: '🇮🇱' },
  { lat: 30, minKp: 9,   label: 'Cairo / Houston / Shanghai', flag: '🌏' },
]

function kpColor(kp: number): string {
  if (kp >= 8) return '#ef4444'
  if (kp >= 6) return '#f97316'
  if (kp >= 5) return '#f59e0b'
  if (kp >= 4) return '#eab308'
  if (kp >= 3) return '#22c55e'
  if (kp >= 2) return '#10b981'
  return '#6366f1'
}

function kpLabel(kp: number): string {
  if (kp >= 8) return 'Extreme Storm (G4-G5)'
  if (kp >= 6) return 'Severe Storm (G3)'
  if (kp >= 5) return 'Strong Storm (G2)'
  if (kp >= 4) return 'Moderate Storm (G1)'
  if (kp >= 3) return 'Active'
  if (kp >= 2) return 'Unsettled'
  return 'Quiet'
}

const KP_BAR_COLOR = (kp: number) => {
  if (kp > 7) return '#ef4444'
  if (kp >= 5) return '#f97316'
  if (kp >= 4) return '#eab308'
  return '#22c55e'
}

function AuroraBars({ data }: { data: KpEntry[] }) {
  const max = 9
  // Show up to 24 bars; label every ~4 entries
  const step = Math.max(1, Math.floor(data.length / 24))
  const displayData = data.slice(-24)
  const labelEvery = Math.max(1, Math.floor(displayData.length / 6))
  return (
    <div>
      <div className="flex items-end gap-px h-20">
        {displayData.map((d, i) => {
          const h = Math.max(3, (d.kp / max) * 80)
          return (
            <div key={i} title={`${new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — Kp ${d.kp}`}
              className="flex-1 rounded-sm transition-all cursor-default"
              style={{ height: h, alignSelf: 'flex-end', background: `linear-gradient(to top, ${KP_BAR_COLOR(d.kp)}, ${KP_BAR_COLOR(d.kp)}88)` }} />
          )
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex mt-1" style={{ position: 'relative' }}>
        {displayData.map((d, i) => (
          i % labelEvery === 0 ? (
            <span key={i} className="text-[7px] text-gray-700 flex-1 text-center">
              {new Date(d.time).getHours()}h
            </span>
          ) : <span key={i} className="flex-1" />
        ))}
      </div>
      {/* Y-axis scale hint */}
      <div className="flex justify-between mt-1">
        <div className="flex gap-2 flex-wrap">
          {[['<4','#22c55e'],['4-5','#eab308'],['5-7','#f97316'],['>7','#ef4444']].map(([label, color]) => (
            <span key={label} className="flex items-center gap-1 text-[8px] text-gray-600">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />
              Kp{label}
            </span>
          ))}
        </div>
        <span className="text-[8px] text-gray-700">0–9 scale</span>
      </div>
      {/* suppress lint for unused step */}
      {step > 0 && null}
    </div>
  )
}

function AuroraCanvas({ kp }: { kp: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const W = c.width, H = c.height
    ctx.clearRect(0, 0, W, H)
    if (kp < 2) {
      ctx.fillStyle = 'rgba(99,102,241,0.05)'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#4b5563'
      ctx.font = '11px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Aurora unlikely right now', W/2, H/2)
      return
    }
    // Night sky gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#020510')
    bg.addColorStop(1, '#0a1628')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    // Stars
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * W, y = Math.random() * H * 0.6
      ctx.beginPath()
      ctx.arc(x, y, Math.random() * 1.2, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`
      ctx.fill()
    }
    // Aurora ribbons
    const intensity = Math.min(1, kp / 9)
    const colors = kp >= 6 ? ['#ff2200', '#ff6600', '#ff44aa'] : kp >= 4 ? ['#00ff88', '#00ffcc', '#44ffff'] : ['#00cc66', '#00ffaa', '#88ffee']
    for (let r = 0; r < 3; r++) {
      const offset = r * 15
      ctx.beginPath()
      ctx.moveTo(0, H * 0.4 + offset)
      for (let x = 0; x <= W; x += 10) {
        const y = H * (0.3 + r * 0.07) + Math.sin(x / 40 + r) * 20 * intensity + offset
        ctx.lineTo(x, y)
      }
      ctx.lineTo(W, H)
      ctx.lineTo(0, H)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.7)
      grad.addColorStop(0, colors[r] + '00')
      grad.addColorStop(0.3, colors[r] + Math.round(intensity * 180).toString(16).padStart(2,'0'))
      grad.addColorStop(1, colors[r] + '00')
      ctx.fillStyle = grad
      ctx.fill()
    }
  }, [kp])
  return <canvas ref={canvasRef} width={320} height={120} className="w-full rounded-xl" style={{ display: 'block' }} />
}

const BEST_LOCATIONS = [
  { city: 'Tromsø',     country: 'Norway',  lat: 69.6, flag: '🇳🇴' },
  { city: 'Reykjavik', country: 'Iceland', lat: 64.1, flag: '🇮🇸' },
  { city: 'Fairbanks', country: 'Alaska',  lat: 64.8, flag: '🇺🇸' },
  { city: 'Yellowknife',country: 'Canada', lat: 62.5, flag: '🇨🇦' },
  { city: 'Rovaniemi', country: 'Finland', lat: 66.5, flag: '🇫🇮' },
]

export default function AuroraForecast() {
  const [kpData, setKpData] = useState<KpEntry[]>([])
  const [currentKp, setCurrentKp] = useState(0)
  const [loading, setLoading] = useState(true)
  const [userLat, setUserLat] = useState(35)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Prefer 1-minute data for a richer 24-hour trend; fall back to 3-hourly
    fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')
      .then(r => r.json())
      .then((raw: { time_tag: string; Kp: number }[]) => {
        const entries: KpEntry[] = raw
          .map(row => ({ time: row.time_tag, kp: row.Kp }))
          .filter(e => !isNaN(e.kp))
        // Keep last 24 data points (24 hours = 1440 minutes, but show up to 24 bars)
        // Sample evenly: take 1 per hour by filtering to the top of each hour
        const hourly: KpEntry[] = []
        let lastHour = -1
        for (const e of entries) {
          const h = new Date(e.time).getHours()
          if (h !== lastHour) { hourly.push(e); lastHour = h }
        }
        const display = hourly.slice(-24)
        setKpData(display)
        setCurrentKp(entries[entries.length - 1]?.kp ?? 0)
        setLoading(false)
      })
      .catch(() => {
        // Fallback to 3-hourly endpoint
        fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
          .then(r => r.json())
          .then((raw: (string | number)[][]) => {
            const entries: KpEntry[] = raw.slice(1).map(row => ({
              time: row[0] as string,
              kp: parseFloat(row[1] as string),
            })).filter(e => !isNaN(e.kp))
            setKpData(entries.slice(-24))
            setCurrentKp(entries[entries.length - 1]?.kp ?? 0)
            setLoading(false)
          })
          .catch(() => { setError(true); setLoading(false) })
      })
  }, [])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(p => setUserLat(Math.abs(p.coords.latitude)), () => {})
  }, [])

  const visible = currentKp >= (LAT_BANDS.find(b => Math.abs(userLat) >= b.lat - 5 && Math.abs(userLat) < (b.lat + 5))?.minKp ?? 9)
  const band = LAT_BANDS.slice().reverse().find(b => currentKp >= b.minKp)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">🌌</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Aurora Forecast</h3>
          <p className="text-gray-500 text-xs">Real-time NOAA Kp-index · Global visibility map</p>
        </div>
        {!loading && !error && (
          <div className="text-center">
            <div className="text-2xl font-black" style={{ color: kpColor(currentKp) }}>Kp{currentKp.toFixed(1)}</div>
            <div className="text-[10px] text-gray-600">Now</div>
          </div>
        )}
      </div>

      {loading && <div className="animate-pulse rounded-xl h-32" style={{ background: 'rgba(99,102,241,0.08)' }} />}

      {error && (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">Could not reach NOAA servers</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <AuroraCanvas kp={currentKp} />

          <div className="mt-4 p-3 rounded-xl" style={{ background: `rgba(${visible?'34,197,94':'239,68,68'},0.08)`, border: `1px solid rgba(${visible?'34,197,94':'239,68,68'},0.25)` }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{visible ? '✅' : '❌'}</span>
              <div>
                <p className="text-sm font-bold" style={{ color: visible ? '#4ade80' : '#f87171' }}>
                  {visible ? 'Aurora likely visible!' : 'Aurora not expected at your latitude'}
                </p>
                <p className="text-xs text-gray-500">Your latitude: ~{Math.round(userLat)}° · Status: {kpLabel(currentKp)}</p>
              </div>
            </div>
          </div>

          {kpData.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">24-Hour Kp Trend</p>
              <AuroraBars data={kpData} />
            </div>
          )}

          {/* Best viewing locations */}
          <div className="mt-5">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Best Viewing Locations</p>
            <div className="space-y-1.5">
              {BEST_LOCATIONS.map(loc => {
                // Visible if Kp > (90 - lat) / 10
                const threshold = (90 - loc.lat) / 10
                const visible = currentKp > threshold
                return (
                  <div key={loc.city} className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: visible ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${visible ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
                    <span className="text-base">{loc.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white">{loc.city}, {loc.country}</p>
                      <p className="text-[9px] text-gray-600">{loc.lat}°N · Kp≥{threshold.toFixed(1)} needed</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: visible ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: visible ? '#4ade80' : '#f87171',
                        border: `1px solid ${visible ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}>
                      {visible ? '🟢 Visible' : '🔴 No'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Visibility by Latitude</p>
            <div className="space-y-1.5">
              {LAT_BANDS.map(b => {
                const active = currentKp >= b.minKp
                return (
                  <div key={b.lat} className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all" style={{ background: active ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
                    <span className="text-xs">{b.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{b.label}</p>
                      <p className="text-[9px] text-gray-600">{b.lat}°+ · Kp≥{b.minKp}</p>
                    </div>
                    <span className="text-[10px] font-bold shrink-0" style={{ color: active ? '#4ade80' : '#374151' }}>
                      {active ? '🟢 Visible' : '⚫ No'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {band && (
            <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <p className="text-xs text-gray-400">Currently aurora can be seen as far south as <span className="text-white font-bold">{band.label}</span></p>
            </div>
          )}

          <p className="text-[10px] text-gray-700 mt-4 text-center">Data: NOAA Space Weather Prediction Center · Updates every 3 hours</p>
        </>
      )}
    </div>
  )
}
