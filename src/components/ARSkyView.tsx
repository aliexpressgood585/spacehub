import { useState, useEffect, useRef, useCallback } from 'react'

interface SatRecord { name: string; id: string; color: string; satrec: unknown }

const SAT_LIST = [
  { id: '25544', name: 'ISS',            color: '#4ade80' },
  { id: '20580', name: 'Hubble',         color: '#60a5fa' },
  { id: '48274', name: 'CSS (Tiangong)', color: '#f87171' },
  { id: '43226', name: 'NOAA-20',        color: '#fbbf24' },
  { id: '37820', name: 'Suomi NPP',      color: '#a78bfa' },
]

type WinWithSat = Window & typeof globalThis & { satellite?: unknown }

async function loadSatelliteJs(): Promise<unknown> {
  if ((window as WinWithSat).satellite) return (window as WinWithSat).satellite
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js'
    s.onload = () => res((window as WinWithSat).satellite)
    s.onerror = rej
    document.head.appendChild(s)
  })
}

async function fetchTLE(id: string): Promise<[string, string]> {
  const url = `/api/tle?id=${id}`
  const text = await fetch(url).then(r => r.text())
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      return [lines[i], lines[i + 1]]
    }
  }
  throw new Error('TLE parse failed')
}

// Smoothly interpolate heading angles (handles 359→1 wraparound)
function smoothAngle(current: number, target: number, factor: number) {
  let diff = target - current
  if (diff > 180)  diff -= 360
  if (diff < -180) diff += 360
  return (current + diff * factor + 360) % 360
}

export default function ARSkyView() {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const rafRef     = useRef<number>(0)

  // Satellite data persists across frames
  const satLibRef  = useRef<unknown>(null)
  const satRecsRef = useRef<SatRecord[]>([])
  const locRef     = useRef<{ lat: number; lng: number }>({ lat: 32.08, lng: 34.78 })

  // Smoothed sensor values (updated each orientation event)
  const smoothHeadingRef = useRef(0)
  const smoothTiltRef    = useRef(45)
  const rawHeadingRef    = useRef(0)
  const isAbsoluteRef    = useRef(false)  // true = compass is calibrated

  const [phase, setPhase]         = useState<'idle'|'starting'|'active'|'error'>('idle')
  const [errorMsg, setErrorMsg]   = useState('')
  const [permDenied, setPermDenied] = useState(false)
  const [satLoading, setSatLoading] = useState(false)
  const [satCount, setSatCount]   = useState(0)
  const [loc, setLoc]             = useState<{ lat: number; lng: number } | null>(null)

  // UI state (reflected in draw via refs)
  const [heading, setHeading]     = useState(0)
  const [tilt, setTilt]           = useState(45)
  const [fovH, setFovH]           = useState(70)
  const fovHRef = useRef(70)
  useEffect(() => { fovHRef.current = fovH }, [fovH])

  // ── Orientation handler ─────────────────────────────────────
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    let h: number

    if ((e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading != null) {
      // iOS — true north, corrected for magnetic declination by the OS
      h = (e as DeviceOrientationEvent & { webkitCompassHeading: number }).webkitCompassHeading
      isAbsoluteRef.current = true
    } else if (e.alpha !== null) {
      // Android: alpha goes counterclockwise from north, flip it
      h = (360 - e.alpha) % 360
      if ((e as DeviceOrientationEvent & { absolute?: boolean }).absolute) {
        isAbsoluteRef.current = true
      }
    } else {
      return
    }

    rawHeadingRef.current = h
    smoothHeadingRef.current = smoothAngle(smoothHeadingRef.current, h, 0.12)

    // Tilt: beta 0 = flat, 90 = vertical/pointing at sky
    if (e.beta !== null) {
      const b = Math.max(0, Math.min(90, e.beta))
      smoothTiltRef.current = smoothTiltRef.current + (b - smoothTiltRef.current) * 0.12
    }

    setHeading(Math.round(smoothHeadingRef.current))
    setTilt(Math.round(smoothTiltRef.current))
  }, [])

  // ── Draw loop — computes satellite positions every frame ────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = video.videoWidth  || canvas.offsetWidth
    canvas.height = video.videoHeight || canvas.offsetHeight

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const W   = canvas.width
    const H   = canvas.height
    const fovV = fovHRef.current * (H / W)
    const curH = smoothHeadingRef.current
    const curT = smoothTiltRef.current
    const now  = new Date()

    // ── Compass bar ──
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, W, 34)
    const compassDir = ['N','NE','E','SE','S','SW','W','NW'][Math.round(curH / 45) % 8]
    const compassColor = isAbsoluteRef.current ? 'rgba(74,222,128,0.95)' : 'rgba(251,191,36,0.95)'
    ctx.fillStyle = compassColor
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(
      `↑ ${Math.round(curH)}° ${compassDir}   Tilt: ${Math.round(curT)}°   ${isAbsoluteRef.current ? '✓ Calibrated' : '⚠ Calibrating…'}`,
      W / 2, 21
    )

    // ── Crosshair ──
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(W/2 - 22, H/2); ctx.lineTo(W/2 + 22, H/2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W/2, H/2 - 22); ctx.lineTo(W/2, H/2 + 22); ctx.stroke()
    ctx.setLineDash([])

    // ── Horizon line ──
    const horizonY = H / 2 + (curT / (fovV / 2)) * (H / 2)
    if (horizonY > 0 && horizonY < H) {
      ctx.strokeStyle = 'rgba(100,200,100,0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 6])
      ctx.beginPath(); ctx.moveTo(0, horizonY); ctx.lineTo(W, horizonY); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(100,200,100,0.5)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('— horizon', 4, horizonY - 3)
    }

    // ── Real-time satellite positions ──
    const satLib = satLibRef.current as Record<string, (...args: unknown[]) => unknown> | null
    if (satLib && satRecsRef.current.length > 0) {
      const { lat, lng } = locRef.current
      let aboveCount = 0

      for (const sd of satRecsRef.current) {
        const pv = satLib.propagate(sd.satrec, now) as { position?: { x:number; y:number; z:number } | boolean }
        if (!pv?.position || typeof pv.position === 'boolean') continue

        const gmst = satLib.gstime(now) as number
        const ecf  = satLib.eciToEcf(pv.position, gmst) as { x:number; y:number; z:number }
        const obs  = {
          longitude: (satLib.degreesToRadians as (n:number)=>number)(lng),
          latitude:  (satLib.degreesToRadians as (n:number)=>number)(lat),
          height: 0,
        }
        const look = satLib.ecfToLookAngles(obs, ecf) as { azimuth:number; elevation:number }
        const az = ((look.azimuth * 180 / Math.PI) + 360) % 360
        const el = look.elevation * 180 / Math.PI

        if (el > 0) aboveCount++

        let dAz = az - curH
        if (dAz > 180)  dAz -= 360
        if (dAz < -180) dAz += 360
        const dEl = el - curT

        if (Math.abs(dAz) > fovHRef.current / 2 + 12 || Math.abs(dEl) > fovV / 2 + 12) continue

        const x = W / 2 + (dAz / (fovHRef.current / 2)) * (W / 2)
        const y = H / 2 - (dEl / (fovV / 2)) * (H / 2)

        // Pulsing ring
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 600)
        ctx.beginPath()
        ctx.arc(x, y, 14 + pulse * 4, 0, Math.PI * 2)
        ctx.strokeStyle = sd.color + '55'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Dot
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, Math.PI * 2)
        ctx.fillStyle = sd.color + '33'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fillStyle = sd.color
        ctx.fill()

        // Label
        ctx.fillStyle = 'white'
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(sd.name, x + 14, y - 3)
        ctx.fillStyle = sd.color
        ctx.font = '9px sans-serif'
        ctx.fillText(`El: ${el.toFixed(0)}°  Az: ${az.toFixed(0)}°`, x + 14, y + 9)
      }

      // Bottom bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, H - 28, W, 28)
      ctx.fillStyle = '#4ade80'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${aboveCount} satellites above horizon · Point phone at sky`, W / 2, H - 9)
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  // ── Load TLE + parse satrec (done once) ────────────────────
  const loadSats = useCallback(async (lat: number, lng: number) => {
    setSatLoading(true)
    try {
      const lib = await loadSatelliteJs()
      satLibRef.current = lib
      locRef.current = { lat, lng }

      const satLib = lib as Record<string, (...args: unknown[]) => unknown>
      const records: SatRecord[] = []

      for (const s of SAT_LIST) {
        try {
          const [tle1, tle2] = await fetchTLE(s.id)
          const satrec = satLib.twoline2satrec(tle1, tle2)
          records.push({ name: s.name, id: s.id, color: s.color, satrec })
        } catch { /* skip unreachable satellite */ }
      }

      satRecsRef.current = records
      setSatCount(records.length)
    } catch {}
    setSatLoading(false)
  }, [])

  // ── Start ───────────────────────────────────────────────────
  const start = async () => {
    setPhase('starting')
    setErrorMsg('')

    // GPS
    let userLat = 32.08, userLng = 34.78
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      )
      userLat = pos.coords.latitude
      userLng = pos.coords.longitude
    } catch {}
    setLoc({ lat: userLat, lng: userLng })
    locRef.current = { lat: userLat, lng: userLng }

    // Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream

      // Try to detect camera FOV from capabilities
      const track = stream.getVideoTracks()[0]
      const caps = track.getCapabilities?.() as Record<string, unknown> | undefined
      if (caps && typeof caps.zoom === 'object' && caps.zoom !== null) {
        // Zoom capable — default FOV closer to wide
        setFovH(72)
        fovHRef.current = 72
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (e: unknown) {
      const err = e as { name?: string }
      if (err.name === 'NotAllowedError') {
        setPermDenied(true)
        setErrorMsg('Camera permission denied. Please allow camera access and try again.')
      } else {
        setErrorMsg('Camera not available on this device.')
      }
      setPhase('error')
      return
    }

    // Compass — iOS requires explicit permission
    if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission()
        if (perm !== 'granted') {
          setErrorMsg('Compass permission denied. Tap Allow when prompted.')
          setPhase('error')
          return
        }
      } catch {}
    }

    // Register orientation: prefer absolute (Android Chrome), fall back to relative
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true)
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true)

    // Load TLE data
    await loadSats(userLat, userLng)

    setPhase('active')
    rafRef.current = requestAnimationFrame(draw)
  }

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true)
    window.removeEventListener('deviceorientation', handleOrientation as EventListener, true)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    satRecsRef.current = []
    satLibRef.current = null
    isAbsoluteRef.current = false
    setPhase('idle')
    setSatCount(0)
  }, [handleOrientation])

  useEffect(() => () => { stop() }, [stop])

  return (
    <div className="space-card overflow-hidden">
      <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="icon-box">📡</div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-base">AR Sky View</h3>
            <p className="text-gray-500 text-xs">Point your camera at the sky to find satellites</p>
          </div>
          {phase === 'active' && (
            <div className="live-badge"><span className="live-dot" /> LIVE</div>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <div className="text-center space-y-5 py-6">
            <div className="text-6xl">📡</div>
            <div>
              <h4 className="text-white font-bold text-lg mb-2">Find Satellites in Real Time</h4>
              <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">
                Uses your camera + compass to show the ISS, Hubble, and other satellites exactly where they are in the sky above you.
              </p>
            </div>

            {typeof window !== 'undefined' && !('ontouchstart' in window) && (
              <div className="inline-flex flex-col items-center gap-3 px-5 py-4 rounded-2xl mx-auto"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                <p className="text-yellow-400 text-sm font-semibold">📱 Best on smartphone</p>
                <p className="text-gray-500 text-xs max-w-[200px] leading-relaxed">
                  Scan to open on your phone — AR needs a camera + compass
                </p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent('https://spacehub-nu.vercel.app/#tracker')}&bgcolor=020510&color=818cf8&qzone=2`}
                  alt="QR code to open on mobile"
                  width={100} height={100}
                  className="rounded-xl"
                  loading="lazy"
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 justify-center text-xs text-gray-500">
              <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Camera access</div>
              <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Compass/gyroscope</div>
              <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Your location</div>
            </div>
            <button onClick={start} className="btn-shimmer px-8 py-3 text-sm font-bold">
              📡 Launch AR Sky View
            </button>
            <p className="text-gray-700 text-xs">Works best on a smartphone pointed at the sky</p>
          </div>
        )}

        {/* ── STARTING ── */}
        {phase === 'starting' && (
          <div className="text-center py-12 space-y-4">
            <div className="text-5xl animate-bounce">🛰️</div>
            <p className="text-white font-semibold">Loading satellite positions…</p>
            {satLoading && <p className="text-gray-500 text-sm">Fetching live TLE data from Celestrak</p>}
          </div>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <div className="text-center py-8 space-y-4">
            <div className="text-5xl">⚠️</div>
            <p className="text-red-400 font-semibold">{errorMsg}</p>
            {permDenied && (
              <p className="text-gray-500 text-sm max-w-xs mx-auto">
                Go to browser Settings → Site Settings → Camera → Allow for this site.
              </p>
            )}
            <button
              onClick={() => { setPhase('idle'); setPermDenied(false) }}
              className="text-sm px-4 py-2 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── ACTIVE ── */}
        {phase === 'active' && (
          <div className="space-y-3">
            {/* Camera + overlay */}
            <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-white font-bold text-base">{heading}°</p>
                <p className="text-gray-600 text-[9px] uppercase">Heading</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-white font-bold text-base">{tilt}°</p>
                <p className="text-gray-600 text-[9px] uppercase">Tilt</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                <p className="text-green-300 font-bold text-base">{satCount}</p>
                <p className="text-gray-600 text-[9px] uppercase">Tracked</p>
              </div>
            </div>

            {/* FOV calibration */}
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                  Camera FOV: {fovH}°
                </p>
                <p className="text-[9px] text-gray-700">Adjust if satellites appear offset</p>
              </div>
              <input
                type="range" min={45} max={100} step={1} value={fovH}
                onChange={e => { const v = Number(e.target.value); setFovH(v); fovHRef.current = v }}
                className="w-full"
                style={{ accentColor: '#6366f1' }}
              />
              <div className="flex justify-between text-[9px] text-gray-700 mt-0.5">
                <span>Narrow (45°)</span><span>Typical (70°)</span><span>Wide (100°)</span>
              </div>
            </div>

            {/* Satellite list */}
            {satRecsRef.current.length > 0 && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Satellites tracked (live)</p>
                <div className="flex flex-wrap gap-2">
                  {satRecsRef.current.map(s => (
                    <div key={s.id} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-gray-400">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loc && (
              <p className="text-[10px] text-gray-700 text-center">
                📍 {loc.lat.toFixed(2)}, {loc.lng.toFixed(2)} · Real-time TLE · Positions update every frame
              </p>
            )}

            <button
              onClick={stop}
              className="w-full py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              Stop AR View
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
