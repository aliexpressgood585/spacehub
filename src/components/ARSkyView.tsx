import { useState, useEffect, useRef, useCallback } from 'react'

interface SatInfo { name: string; az: number; el: number; id: string; color: string }

const SAT_LIST = [
  { id: '25544', name: 'ISS',       color: '#4ade80' },
  { id: '20580', name: 'Hubble',    color: '#60a5fa' },
  { id: '48274', name: 'CSS (Tiangong)', color: '#f87171' },
  { id: '43226', name: 'NOAA-20',   color: '#fbbf24' },
  { id: '37820', name: 'Suomi NPP', color: '#a78bfa' },
]

async function loadSatelliteJs(): Promise<any> {
  if ((window as any).satellite) return (window as any).satellite
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js'
    s.onload = () => res((window as any).satellite)
    s.onerror = rej
    document.head.appendChild(s)
  })
}

async function fetchTLE(id: string): Promise<string[]> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=TLE`
  const text = await fetch(url).then(r => r.text())
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      return [lines[i], lines[i + 1]]
    }
  }
  throw new Error('TLE parse failed')
}

function getSatAzEl(sat: any, tle1: string, tle2: string, lat: number, lng: number) {
  const satrec = sat.twoline2satrec(tle1, tle2)
  const now = new Date()
  const pv = sat.propagate(satrec, now)
  if (!pv?.position || typeof pv.position === 'boolean') return null
  const gmst = sat.gstime(now)
  const ecf = sat.eciToEcf(pv.position, gmst)
  const obs = { longitude: sat.degreesToRadians(lng), latitude: sat.degreesToRadians(lat), height: 0 }
  const look = sat.ecfToLookAngles(obs, ecf)
  return {
    az: ((look.azimuth * 180 / Math.PI) + 360) % 360,
    el: look.elevation * 180 / Math.PI,
  }
}

export default function ARSkyView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)

  const [phase, setPhase] = useState<'idle'|'starting'|'active'|'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [sats, setSats] = useState<SatInfo[]>([])
  const [heading, setHeading] = useState(0)
  const [tilt, setTilt] = useState(45)
  const [permDenied, setPermDenied] = useState(false)
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [satLoading, setSatLoading] = useState(false)

  const headingRef = useRef(0)
  const tiltRef = useRef(45)
  const satsRef = useRef<SatInfo[]>([])

  useEffect(() => { headingRef.current = heading }, [heading])
  useEffect(() => { tiltRef.current = tilt }, [tilt])
  useEffect(() => { satsRef.current = sats }, [sats])

  const loadSats = useCallback(async (lat: number, lng: number) => {
    setSatLoading(true)
    try {
      const satLib = await loadSatelliteJs()
      const results: SatInfo[] = []
      for (const s of SAT_LIST) {
        try {
          const [tle1, tle2] = await fetchTLE(s.id)
          const pos = getSatAzEl(satLib, tle1, tle2, lat, lng)
          if (pos && pos.el > -10) {
            results.push({ name: s.name, az: pos.az, el: pos.el, id: s.id, color: s.color })
          }
        } catch { /* skip */ }
      }
      setSats(results)
    } catch {}
    setSatLoading(false)
  }, [])

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    const h = (e as any).webkitCompassHeading ?? ((e.alpha ?? 0) > 0 ? 360 - (e.alpha ?? 0) : 0)
    setHeading(Math.round(h))
    const b = e.beta ?? 45
    setTilt(Math.max(0, Math.min(90, Math.round(b))))
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = video.videoWidth || canvas.offsetWidth
    canvas.height = video.videoHeight || canvas.offsetHeight

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const W = canvas.width
    const H = canvas.height

    // FOV: ~60° horizontal, ~45° vertical
    const fovH = 60
    const fovV = 45
    const curH = headingRef.current
    const curT = tiltRef.current

    // Draw compass overlay
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(0, 0, W, 32)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`↑ ${curH}° ${['N','NE','E','SE','S','SW','W','NW'][Math.round(curH/45)%8]}   Tilt: ${curT}°`, W / 2, 20)

    // Draw crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(W/2 - 20, H/2); ctx.lineTo(W/2 + 20, H/2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W/2, H/2 - 20); ctx.lineTo(W/2, H/2 + 20); ctx.stroke()
    ctx.setLineDash([])

    // Draw satellites
    for (const sat of satsRef.current) {
      // Convert sat az/el to screen position
      let dAz = sat.az - curH
      if (dAz > 180) dAz -= 360
      if (dAz < -180) dAz += 360
      const dEl = sat.el - curT

      // Only show satellites within FOV
      if (Math.abs(dAz) > fovH / 2 + 10 || Math.abs(dEl) > fovV / 2 + 10) continue

      const x = W / 2 + (dAz / (fovH / 2)) * (W / 2)
      const y = H / 2 - (dEl / (fovV / 2)) * (H / 2)

      // Dot
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fillStyle = sat.color + '33'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = sat.color
      ctx.fill()

      // Label
      ctx.fillStyle = 'white'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`${sat.name}`, x + 12, y - 4)
      ctx.fillStyle = sat.color
      ctx.font = '9px sans-serif'
      ctx.fillText(`El: ${sat.el.toFixed(0)}° Az: ${sat.az.toFixed(0)}°`, x + 12, y + 8)
    }

    // Above horizon indicator
    const aboveCount = satsRef.current.filter(s => s.el > 0).length
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(0, H - 28, W, 28)
    ctx.fillStyle = '#4ade80'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${aboveCount} satellites above horizon · Point phone at sky`, W / 2, H - 10)

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  const start = async () => {
    setPhase('starting')
    setErrorMsg('')

    // Get location
    let userLat = 32.08, userLng = 34.78
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      )
      userLat = pos.coords.latitude
      userLng = pos.coords.longitude
    } catch {}
    setLoc({ lat: userLat, lng: userLng })

    // Request camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        setPermDenied(true)
        setErrorMsg('Camera permission denied. Please allow camera access and try again.')
      } else {
        setErrorMsg('Camera not available on this device.')
      }
      setPhase('error')
      return
    }

    // Request device orientation (iOS 13+ needs explicit permission)
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission()
        if (perm !== 'granted') {
          setErrorMsg('Compass permission denied.')
          setPhase('error')
          return
        }
      } catch {}
    }
    window.addEventListener('deviceorientation', handleOrientation, true)

    // Load satellite data
    await loadSats(userLat, userLng)

    setPhase('active')
    rafRef.current = requestAnimationFrame(draw)
  }

  const stop = () => {
    cancelAnimationFrame(rafRef.current)
    window.removeEventListener('deviceorientation', handleOrientation, true)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setPhase('idle')
    setSats([])
  }

  useEffect(() => () => { stop() }, [])

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
        {phase === 'idle' && (
          <div className="text-center space-y-5 py-6">
            <div className="text-6xl">📡</div>
            <div>
              <h4 className="text-white font-bold text-lg mb-2">Find Satellites in Real Time</h4>
              <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">
                Uses your camera + compass to show the ISS, Hubble, and other satellites exactly where they are in the sky above you.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center text-xs text-gray-500">
              <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Camera access</div>
              <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Compass/gyroscope</div>
              <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Your location</div>
            </div>
            <button
              onClick={start}
              className="btn-shimmer px-8 py-3 text-sm font-bold"
            >
              📡 Launch AR Sky View
            </button>
            <p className="text-gray-700 text-xs">Works best on a smartphone pointed at the sky</p>
          </div>
        )}

        {phase === 'starting' && (
          <div className="text-center py-12 space-y-4">
            <div className="text-5xl animate-bounce">🛰️</div>
            <p className="text-white font-semibold">Loading satellite positions...</p>
            {satLoading && <p className="text-gray-500 text-sm">Fetching TLE data from Celestrak</p>}
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center py-8 space-y-4">
            <div className="text-5xl">⚠️</div>
            <p className="text-red-400 font-semibold">{errorMsg}</p>
            {permDenied && (
              <p className="text-gray-500 text-sm max-w-xs mx-auto">
                Go to your browser settings → Site Settings → Camera → Allow for this site.
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

        {phase === 'active' && (
          <div className="space-y-3">
            {/* Camera + overlay */}
            <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
              />
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-white font-bold text-base">{heading}°</p>
                <p className="text-gray-600 text-[9px] uppercase">Heading</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-white font-bold text-base">{tilt}°</p>
                <p className="text-gray-600 text-[9px] uppercase">Tilt</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-green-300 font-bold text-base">{sats.filter(s => s.el > 0).length}</p>
                <p className="text-gray-600 text-[9px] uppercase">Above Horizon</p>
              </div>
            </div>

            {/* Satellites legend */}
            {sats.length > 0 && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Satellites tracked</p>
                <div className="flex flex-wrap gap-2">
                  {sats.map(s => (
                    <div key={s.id} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-gray-400">{s.name}</span>
                      <span className="text-gray-600">{s.el.toFixed(0)}° el</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loc && (
              <p className="text-[10px] text-gray-700 text-center">
                📍 {loc.lat.toFixed(2)}, {loc.lng.toFixed(2)} · TLE from Celestrak
              </p>
            )}

            <button
              onClick={stop}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
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
