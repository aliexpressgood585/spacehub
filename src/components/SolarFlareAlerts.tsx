import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface XRayEntry  { time_tag: string; flux: number; energy: string }
interface FlareEntry { beginTime: string; peekTime: string; classType: string; sourceLocation: string; activeRegionNum: number }

type FlareClass = 'A' | 'B' | 'C' | 'M' | 'X' | '?'

// ── Helpers ───────────────────────────────────────────────────────────────────
function classifyFlux(flux: number): FlareClass {
  if (flux >= 1e-4) return 'X'
  if (flux >= 1e-5) return 'M'
  if (flux >= 1e-6) return 'C'
  if (flux >= 1e-7) return 'B'
  if (flux >= 0)    return 'A'
  return '?'
}

function flareColor(cls: FlareClass): string {
  const map: Record<FlareClass, string> = {
    X: '#ef4444', M: '#f97316', C: '#eab308',
    B: '#22c55e', A: '#60a5fa', '?': '#6b7280',
  }
  return map[cls]
}

function kpStorm(kp: number): { level: string; color: string } {
  if (kp >= 9) return { level: 'G5 Extreme',   color: '#ef4444' }
  if (kp >= 8) return { level: 'G4 Severe',    color: '#f97316' }
  if (kp >= 7) return { level: 'G3 Strong',    color: '#fb923c' }
  if (kp >= 6) return { level: 'G2 Moderate',  color: '#eab308' }
  if (kp >= 5) return { level: 'G1 Minor',     color: '#84cc16' }
  return { level: 'G0 Quiet', color: '#22c55e' }
}

function windStatus(speed: number): { label: string; color: string } {
  if (speed > 600) return { label: 'High',     color: '#ef4444' }
  if (speed > 400) return { label: 'Elevated', color: '#eab308' }
  return { label: 'Normal', color: '#22c55e' }
}

function fmtFlux(flux: number): string {
  if (!flux || flux <= 0) return '—'
  const exp = Math.floor(Math.log10(flux))
  const man = flux / Math.pow(10, exp)
  return `${man.toFixed(1)}×10⁻${Math.abs(exp)}`
}

function fmtTime(s: string): string {
  try {
    const d = new Date(s)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch { return s.slice(11, 16) }
}

// ── Mini line chart ────────────────────────────────────────────────────────────
function XRayMiniChart({ data }: { data: XRayEntry[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || data.length < 2) return
    const W = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1)
    const H = canvas.height = 60 * (window.devicePixelRatio || 1)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const fluxes = data.map(d => d.flux).filter(f => f > 0)
    const minLog = Math.log10(Math.min(...fluxes, 1e-8))
    const maxLog = Math.log10(Math.max(...fluxes, 1e-6))
    const range  = maxLog - minLog || 1

    const toY = (f: number) => H - ((Math.log10(Math.max(f, 1e-10)) - minLog) / range) * H * 0.85 - H * 0.05
    const toX = (i: number) => (i / (data.length - 1)) * W

    // Threshold lines
    ctx.strokeStyle = 'rgba(239,68,68,0.3)'; ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    const xThresh = toY(1e-4)
    if (xThresh > 0 && xThresh < H) { ctx.beginPath(); ctx.moveTo(0, xThresh); ctx.lineTo(W, xThresh); ctx.stroke() }
    const mThresh = toY(1e-5)
    if (mThresh > 0 && mThresh < H) { ctx.strokeStyle = 'rgba(249,115,22,0.3)'; ctx.beginPath(); ctx.moveTo(0, mThresh); ctx.lineTo(W, mThresh); ctx.stroke() }
    ctx.setLineDash([])

    // Flux line
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#ef4444')
    grad.addColorStop(0.4, '#f97316')
    grad.addColorStop(0.7, '#eab308')
    grad.addColorStop(1, '#22c55e')

    ctx.beginPath()
    ctx.strokeStyle = grad
    ctx.lineWidth = 1.5
    data.forEach((d, i) => {
      const x = toX(i), y = toY(d.flux || 1e-10)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Fill under
    ctx.lineTo(toX(data.length - 1), H); ctx.lineTo(0, H); ctx.closePath()
    ctx.fillStyle = 'rgba(99,102,241,0.06)'; ctx.fill()
  }, [data])

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: 60, display: 'block' }}
      aria-label="X-ray flux 6-hour chart"
    />
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SolarFlareAlerts() {
  const [xrays,    setXrays]    = useState<XRayEntry[]>([])
  const [wind,     setWind]     = useState<{ speed: number; density: number } | null>(null)
  const [kp,       setKp]       = useState<number>(0)
  const [flares,   setFlares]   = useState<FlareEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [lastFetch,setLastFetch]= useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    const controllers: AbortController[] = []
    function ac() { const c = new AbortController(); controllers.push(c); return c.signal }

    await Promise.allSettled([
      // X-ray flux
      fetch('https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json', { signal: ac() })
        .then(r => r.json())
        .then((raw: XRayEntry[]) => {
          const lo = raw.filter(e => e.energy === '0.1-0.8nm' && e.flux > 0)
          setXrays(lo.slice(-72))
        })
        .catch(() => {}),

      // Solar wind plasma
      fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json', { signal: ac() })
        .then(r => r.json())
        .then((raw: (string | number)[][]) => {
          const last = raw[raw.length - 1]
          if (last) setWind({ density: Number(last[1]) || 0, speed: Number(last[2]) || 0 })
        })
        .catch(() => {}),

      // Kp index
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { signal: ac() })
        .then(r => r.json())
        .then((raw: (string | number)[][]) => {
          const last = raw[raw.length - 1]
          if (last) setKp(parseFloat(String(last[1])) || 0)
        })
        .catch(() => {}),

      // DONKI flares (last 7 days)
      (() => {
        const end   = new Date()
        const start = new Date(end.getTime() - 7 * 86400000)
        const fmt   = (d: Date) => d.toISOString().slice(0, 10)
        return fetch(
          `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=${fmt(start)}&endDate=${fmt(end)}`,
          { signal: ac() }
        )
          .then(r => r.json())
          .then((raw: FlareEntry[]) => {
            const sorted = [...raw].sort((a, b) => b.beginTime.localeCompare(a.beginTime))
            setFlares(sorted.slice(0, 8))
          })
          .catch(() => {})
      })(),
    ])

    setLoading(false)
    setLastFetch(new Date())
    return () => controllers.forEach(c => c.abort())
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 300_000) // 5 min
    return () => clearInterval(iv)
  }, [fetchAll])

  const currentFlux = xrays[xrays.length - 1]?.flux ?? 0
  const currentClass = classifyFlux(currentFlux)
  const storm = kpStorm(kp)
  const ws    = wind ? windStatus(wind.speed) : null

  // Scale indicators
  const scales = [
    { label: 'Radio Blackout',  id: 'R', value: currentClass === 'X' ? 5 : currentClass === 'M' ? 3 : currentClass === 'C' ? 1 : 0, color: flareColor(currentClass) },
    { label: 'Solar Rad Storm', id: 'S', value: 0, color: '#22c55e' },
    { label: 'Geo Storm',       id: 'G', value: Math.max(0, Math.floor(kp) - 4), color: storm.color },
  ]

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="icon-box text-xl">☀️</div>
          <div>
            <h3 className="text-white font-bold text-base">Solar Flare & Space Weather Alerts</h3>
            <p className="text-gray-500 text-xs">
              Real-time NOAA SWPC data
              {lastFetch && ` · updated ${lastFetch.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>
        <div className="live-badge">
          <span className="live-dot" />
          LIVE
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1,2,3].map(n => <div key={n} className="h-16 rounded-xl bg-white/5" />)}
        </div>
      ) : (
        <>
          {/* NOAA Scale Indicators */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {scales.map(s => (
              <div key={s.id} className="rounded-xl p-3 text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.color}30` }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">{s.label}</p>
                <p className="text-lg font-black" style={{ color: s.color }}>
                  {s.id}{s.value}
                </p>
                <p className="text-[9px] text-gray-700">{s.value === 0 ? 'None' : s.value >= 4 ? 'Extreme' : s.value >= 3 ? 'Strong' : s.value >= 2 ? 'Moderate' : 'Minor'}</p>
              </div>
            ))}
          </div>

          {/* X-ray Flux */}
          <div className="rounded-2xl p-4 mb-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">X-ray Flux (6h)</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{fmtFlux(currentFlux)} W/m²</span>
                <span className="text-sm font-black px-2 py-0.5 rounded-lg"
                  style={{ background: `${flareColor(currentClass)}20`, color: flareColor(currentClass), border: `1px solid ${flareColor(currentClass)}40` }}>
                  {currentClass}-class
                </span>
              </div>
            </div>
            {xrays.length > 1
              ? <XRayMiniChart data={xrays} />
              : <p className="text-gray-600 text-xs text-center py-3">Data temporarily unavailable</p>
            }
            <div className="flex justify-between mt-1">
              <p className="text-[9px] text-gray-700">6 hours ago</p>
              <p className="text-[9px] text-gray-700">Now</p>
            </div>
          </div>

          {/* Solar Wind + Kp row */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Solar Wind</p>
              {wind ? (
                <>
                  <p className="text-2xl font-black text-white">{Math.round(wind.speed)}<span className="text-xs text-gray-500 font-normal ml-1">km/s</span></p>
                  <p className="text-xs text-gray-600 mt-0.5">{wind.density.toFixed(1)} p/cm³ density</p>
                  <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: `${ws?.color}20`, color: ws?.color, border: `1px solid ${ws?.color}40` }}>
                    {ws?.label}
                  </span>
                </>
              ) : <p className="text-gray-600 text-xs">Unavailable</p>}
            </div>

            <div className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Kp Index</p>
              <p className="text-2xl font-black" style={{ color: storm.color }}>{kp.toFixed(1)}</p>
              <p className="text-xs text-gray-600 mt-0.5">{storm.level}</p>
              <div className="flex gap-0.5 mt-2">
                {[0,1,2,3,4,5,6,7,8,9].map(v => (
                  <div key={v} className="flex-1 rounded-sm h-2"
                    style={{ background: v <= Math.floor(kp) ? storm.color : 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Recent Flares */}
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Recent Solar Flares (7 days)</p>
            {flares.length > 0 ? (
              <div className="space-y-2">
                {flares.map((f, i) => {
                  const cls = f.classType?.[0] as FlareClass ?? '?'
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="text-sm font-black w-10 flex-shrink-0"
                        style={{ color: flareColor(cls) }}>{f.classType ?? '?'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 truncate">
                          {f.beginTime ? new Date(f.beginTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                          {' '}at {f.beginTime ? fmtTime(f.beginTime) : '—'} UTC
                        </p>
                        <p className="text-[10px] text-gray-700">AR {f.activeRegionNum || 'N/A'} · {f.sourceLocation || '—'}</p>
                      </div>
                      {cls === 'X' && <span className="text-[10px] text-red-400 font-bold">⚠️ Major</span>}
                      {cls === 'M' && <span className="text-[10px] text-orange-400 font-bold">⚡ Mod</span>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl px-4 py-5 text-center"
                style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <p className="text-green-400 text-sm font-semibold">✅ No major flares this week</p>
                <p className="text-gray-600 text-xs mt-1">Solar activity is currently low</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-gray-700 text-xs mt-5 border-t border-white/[0.04] pt-4">
            Source: NOAA SWPC · NASA DONKI · Refreshes every 5 minutes
          </p>
        </>
      )}
    </div>
  )
}
