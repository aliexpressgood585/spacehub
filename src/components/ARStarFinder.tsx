import { useEffect, useRef, useState, useCallback } from 'react'

const DEG = Math.PI / 180
const rev = (x: number) => ((x % 360) + 360) % 360

function julianDate(d: Date) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate()
  const hr = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + hr / 24 + B - 1524.5
}

function localSiderealTime(date: Date, lng: number) {
  const jd = julianDate(date)
  const t = (jd - 2451545) / 36525
  const gst = ((6.697374558 + 2400.0513369 * t + 0.0000258622 * t * t) % 24 + 24) % 24
  return ((gst + lng / 15) % 24 + 24) % 24
}

function raDecToAltAz(raDeg: number, decDeg: number, lat: number, lst: number) {
  const haDeg = rev(lst * 15 - raDeg)
  const ha = haDeg * DEG, decR = decDeg * DEG, latR = lat * DEG
  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI
  const cosAlt = Math.cos(alt * DEG)
  if (Math.abs(cosAlt) < 1e-10) return { alt, az: 0 }
  const cosAz = (Math.sin(decR) - Math.sin(alt * DEG) * Math.sin(latR)) / (cosAlt * Math.cos(latR))
  return { alt, az: Math.sin(ha) < 0 ? Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI : 360 - Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI }
}

// Planet orbital mechanics
function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M))
  for (let n = 0; n < 8; n++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    if (Math.abs(dE) < 1e-7) break; E -= dE
  }
  return E
}

interface OE { N: number; i: number; w: number; a: number; e: number; M: number }
function helio({ N, i, w, a, e, M }: OE) {
  const E = solveKepler(M * DEG, e), xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const v = Math.atan2(yv, xv), rr = Math.sqrt(xv * xv + yv * yv), Nr = N * DEG, ir = i * DEG, lon = v + (w - N) * DEG
  return { x: rr * (Math.cos(Nr) * Math.cos(lon) - Math.sin(Nr) * Math.sin(lon) * Math.cos(ir)), y: rr * (Math.sin(Nr) * Math.cos(lon) + Math.cos(Nr) * Math.sin(lon) * Math.cos(ir)), z: rr * Math.sin(lon) * Math.sin(ir) }
}
function earthXYZ(d: number) {
  const wr = rev(282.9404 + 4.70935e-5 * d) * DEG, e = 0.016709 - 1.151e-9 * d, M = rev(356.0470 + 0.9856002585 * d) * DEG
  const E = solveKepler(M, e), xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E)
  const rr = Math.sqrt(xv * xv + yv * yv), ls = Math.atan2(yv, xv) + wr
  return { x: rr * Math.cos(ls + Math.PI), y: rr * Math.sin(ls + Math.PI), z: 0 }
}
function getOE(d: number, n: string): OE | null {
  switch (n) {
    case 'Mercury': return { N: rev(48.3313+3.24587e-5*d), i: 7.0047, w: rev(29.1241+1.01444e-5*d), a: 0.387098, e: 0.205635, M: rev(168.6562+4.0923344368*d) }
    case 'Venus':   return { N: rev(76.6799+2.4659e-5*d),  i: 3.3946, w: rev(54.891+1.38374e-5*d),  a: 0.72333,  e: 0.006773, M: rev(48.0052+1.6021302244*d) }
    case 'Mars':    return { N: rev(49.5574+2.11081e-5*d), i: 1.8497, w: rev(286.5016+2.92961e-5*d), a: 1.523688, e: 0.093405, M: rev(18.6021+0.5240207766*d) }
    case 'Jupiter': return { N: rev(100.4542+2.76854e-5*d),i: 1.303,  w: rev(273.8777+1.64505e-5*d), a: 5.20256,  e: 0.048498, M: rev(19.895+0.0830853001*d) }
    case 'Saturn':  return { N: rev(113.6634+2.3898e-5*d), i: 2.4886, w: rev(339.3939+2.97661e-5*d), a: 9.55475,  e: 0.055546, M: rev(316.967+0.0334442282*d) }
    default: return null
  }
}
function planetRaDec(name: string, jd: number) {
  const d = jd - 2451543.5, el = getOE(d, name)
  if (!el) return null
  const pv = helio(el), ev = earthXYZ(d)
  const dx = pv.x - ev.x, dy = pv.y - ev.y, dz = pv.z - ev.z
  const ecl = (23.4393 - 3.563e-7 * d) * DEG
  const yeq = dy * Math.cos(ecl) - dz * Math.sin(ecl), zeq = dy * Math.sin(ecl) + dz * Math.cos(ecl)
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
  return { ra: rev(Math.atan2(yeq, dx) * 180 / Math.PI), dec: Math.asin(Math.max(-1, Math.min(1, zeq / dist))) * 180 / Math.PI }
}

// Bright star catalog: [RA_deg, Dec_deg, VMag, Name]
const STARS: [number, number, number, string][] = [
  [101.29, -16.72, -1.46, 'Sirius'], [95.99, -52.70, -0.74, 'Canopus'],
  [213.92, 19.18, -0.05, 'Arcturus'], [279.23, 38.78, 0.03, 'Vega'],
  [79.17, 46.00, 0.08, 'Capella'], [78.63, -8.20, 0.13, 'Rigel'],
  [114.83, 5.23, 0.38, 'Procyon'], [24.43, -57.24, 0.46, 'Achernar'],
  [88.79, 7.41, 0.50, 'Betelgeuse'], [210.96, -60.37, 0.61, 'Hadar'],
  [297.69, 8.87, 0.77, 'Altair'], [186.65, -63.10, 0.77, 'Acrux'],
  [68.98, 16.51, 0.87, 'Aldebaran'], [247.35, -26.43, 1.06, 'Antares'],
  [201.30, -11.16, 1.04, 'Spica'], [116.33, 28.03, 1.16, 'Pollux'],
  [344.41, -29.62, 1.17, 'Fomalhaut'], [310.36, 45.28, 1.25, 'Deneb'],
  [191.93, -59.69, 1.25, 'Mimosa'], [152.09, 11.97, 1.36, 'Regulus'],
  [104.66, -28.97, 1.50, 'Adhara'], [113.65, 31.89, 1.58, 'Castor'],
  [263.40, -37.10, 1.62, 'Shaula'], [187.79, -57.11, 1.63, 'Gacrux'],
  [56.87, 28.61, 1.65, 'Elnath'], [81.28, 6.35, 1.64, 'Bellatrix'],
  [83.86, -1.20, 1.70, 'Alnilam'], [332.06, -46.96, 1.74, 'Alnair'],
  [51.08, 49.86, 1.79, 'Mirfak'], [193.51, 55.96, 1.77, 'Alioth'],
  [276.04, -34.39, 1.79, 'Kaus Aust.'], [165.93, 61.75, 1.81, 'Dubhe'],
  [206.89, 49.31, 1.86, 'Alkaid'], [125.63, -59.51, 1.86, 'Avior'],
  [85.19, -1.94, 1.88, 'Alnitak'], [306.41, -56.74, 1.94, 'Peacock'],
  [37.95, 89.26, 1.97, 'Polaris'], [252.17, -69.03, 1.91, 'Atria'],
  [31.79, 23.46, 2.00, 'Hamal'], [177.26, 14.57, 2.14, 'Denebola'],
  [340.67, -46.88, 2.15, 'Gruid'], [190.41, -48.96, 2.17, 'Muhlifain'],
  [6.57, -42.31, 2.40, 'Ankaa'], [30.97, 42.33, 2.10, 'Almach'],
  [10.13, 56.54, 2.24, 'Schedar'], [2.30, 59.15, 2.27, 'Caph'],
  [86.94, -9.67, 2.07, 'Saiph'], [2.10, 29.09, 2.07, 'Alpheratz'],
  [233.67, 26.71, 2.22, 'Alphecca'], [120.90, -40.00, 2.25, 'Naos'],
  [136.99, -43.43, 2.23, 'Suhail'], [83.00, -0.30, 2.23, 'Mintaka'],
  [326.05, 9.88, 2.40, 'Enif'], [345.95, 28.08, 2.44, 'Scheat'],
  [346.19, 15.21, 2.49, 'Markab'], [45.57, 4.09, 2.53, 'Menkar'],
  [17.43, 35.62, 2.06, 'Mirach'], [283.82, -26.30, 2.05, 'Nunki'],
  [193.60, 54.93, 2.04, 'Mizar'], [219.90, -60.84, -0.29, 'α Cen'],
  [107.10, -26.39, 1.83, 'Wezen'], [138.30, -69.72, 1.68, 'Miaplacidus'],
]

const PLANETS = [
  { name: 'Mercury', sym: '☿', col: '#aabbcc' }, { name: 'Venus', sym: '♀', col: '#ffe5a0' },
  { name: 'Mars', sym: '♂', col: '#ff7744' }, { name: 'Jupiter', sym: '♃', col: '#ffcc99' },
  { name: 'Saturn', sym: '♄', col: '#eecc88' },
]

const H_FOV = 68

export default function ARStarFinder() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const orientRef = useRef({ az: 0, alt: 45 })
  const locRef = useRef({ lat: 32.0, lng: 34.78 })
  const smoothRef = useRef({ az: 0, alt: 45 })
  const [phase, setPhase] = useState<'idle' | 'active' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [identified, setIdentified] = useState<string | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = Math.round(canvas.offsetWidth * devicePixelRatio)
    const H = Math.round(canvas.offsetHeight * devicePixelRatio)
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
    ctx.clearRect(0, 0, W, H)

    const { az: caz, alt: calt } = smoothRef.current
    const vFOV = H_FOV * (H / W)
    const now = new Date()
    const jd = julianDate(now)
    const lst = localSiderealTime(now, locRef.current.lng)
    const { lat } = locRef.current

    const project = (objAz: number, objAlt: number): [number, number] | null => {
      let dAz = objAz - caz
      if (dAz > 180) dAz -= 360
      if (dAz < -180) dAz += 360
      const dAlt = objAlt - calt
      const cosAlt = Math.cos(calt * DEG)
      const sx = W / 2 + dAz * cosAlt * (W / H_FOV)
      const sy = H / 2 - dAlt * (H / vFOV)
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return null
      return [sx, sy]
    }

    // Heading bar
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, W, 32)
    const dirs = ['N','NE','E','SE','S','SW','W','NW']
    const dirLabel = dirs[Math.round(caz / 45) % 8]
    ctx.fillStyle = 'rgba(130,200,255,0.95)'
    ctx.font = `bold ${11 * devicePixelRatio}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round(caz)}° ${dirLabel}   Alt: ${Math.round(calt)}°`, W / 2, 21)

    // Horizon line
    const hy = H / 2 + (calt / (vFOV / 2)) * (H / 2)
    if (hy > 0 && hy < H) {
      ctx.strokeStyle = 'rgba(80,200,80,0.4)'
      ctx.lineWidth = 1; ctx.setLineDash([5, 5])
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(80,200,80,0.5)'; ctx.font = `${9 * devicePixelRatio}px monospace`
      ctx.textAlign = 'left'; ctx.fillText('— horizon', 4, hy - 3)
    }

    // Crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(W/2-18, H/2); ctx.lineTo(W/2+18, H/2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W/2, H/2-18); ctx.lineTo(W/2, H/2+18); ctx.stroke()
    ctx.setLineDash([])

    // Stars
    for (const [raDeg, decDeg, vmag, name] of STARS) {
      const { alt, az } = raDecToAltAz(raDeg, decDeg, lat, lst)
      if (alt < -8) continue
      const pos = project(az, alt)
      if (!pos) continue
      const [sx, sy] = pos
      const r = Math.max(1.5, 5 - vmag * 1.1)
      const alpha = Math.min(1, 0.45 + (2.5 - vmag) * 0.22)
      // Glow
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.5)
      grd.addColorStop(0, `rgba(220,235,255,${alpha})`); grd.addColorStop(1, 'transparent')
      ctx.beginPath(); ctx.arc(sx, sy, r * 2.5, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill()
      // Core
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(240,245,255,${alpha})`; ctx.fill()
      if (vmag < 2.0) {
        ctx.fillStyle = 'rgba(160,200,255,0.92)'; ctx.font = `${10 * devicePixelRatio}px sans-serif`
        ctx.textAlign = 'left'; ctx.fillText(name, sx + r + 3, sy + 4)
      }
    }

    // Planets
    for (const { name, sym, col } of PLANETS) {
      const rd = planetRaDec(name, jd)
      if (!rd) continue
      const { alt, az } = raDecToAltAz(rd.ra, rd.dec, lat, lst)
      if (alt < -8) continue
      const pos = project(az, alt)
      if (!pos) continue
      const [sx, sy] = pos
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14)
      g.addColorStop(0, col + 'cc'); g.addColorStop(1, 'transparent')
      ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,200,0.95)'; ctx.font = `bold ${11 * devicePixelRatio}px sans-serif`
      ctx.textAlign = 'left'; ctx.fillText(`${sym} ${name}`, sx + 10, sy + 4)
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    if (phase !== 'active') return
    rafRef.current = requestAnimationFrame(draw)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase, draw])

  const start = async () => {
    try {
      // iOS 13+ requires DeviceOrientationEvent.requestPermission() to be called
      // synchronously within the user gesture — before any await, or it throws.
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      if (typeof DOE.requestPermission === 'function') {
        const p = await DOE.requestPermission()
        if (p !== 'granted') { setErr('Orientation permission denied — needed for AR'); setPhase('error'); return }
      }

      navigator.geolocation?.getCurrentPosition(p => { locRef.current = { lat: p.coords.latitude, lng: p.coords.longitude } })

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }

      const onOrient = (e: DeviceOrientationEvent) => {
        let az: number
        const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number }
        if (ev.webkitCompassHeading != null) { az = ev.webkitCompassHeading }
        else { az = (360 - (e.alpha ?? 0)) % 360 }
        const alt = Math.max(-90, Math.min(90, (e.beta ?? 90) - 90))
        // Smooth
        let dAz = az - smoothRef.current.az
        if (dAz > 180) dAz -= 360; if (dAz < -180) dAz += 360
        smoothRef.current = { az: (smoothRef.current.az + dAz * 0.15 + 360) % 360, alt: smoothRef.current.alt + (alt - smoothRef.current.alt) * 0.15 }
        orientRef.current = smoothRef.current
      }

      window.addEventListener('deviceorientationabsolute', onOrient as EventListener, true)
      window.addEventListener('deviceorientation', onOrient as EventListener, true)
      setPhase('active')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Camera not available'
      setErr(msg); setPhase('error')
    }
  }

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop())
    setPhase('idle')
  }

  const tap = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = 'touches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX
    const cy = 'touches' in e ? e.changedTouches[0].clientY : (e as React.MouseEvent).clientY
    const px = (cx - rect.left) / rect.width * canvas.width
    const py = (cy - rect.top) / rect.height * canvas.height

    const now = new Date(), jd = julianDate(now), lst = localSiderealTime(now, locRef.current.lng)
    const { lat } = locRef.current
    const { az: caz, alt: calt } = smoothRef.current
    const W = canvas.width, H = canvas.height, vFOV = H_FOV * (H / W)

    const proj = (oaz: number, oalt: number) => {
      let dAz = oaz - caz; if (dAz > 180) dAz -= 360; if (dAz < -180) dAz += 360
      return [W/2 + dAz * Math.cos(calt*DEG) * (W/H_FOV), H/2 - (oalt-calt) * (H/vFOV)] as [number, number]
    }

    let best = '', bestD = 60 * 60
    for (const [ra, dec, vmag, name] of STARS) {
      const { alt, az } = raDecToAltAz(ra, dec, lat, lst)
      const [sx, sy] = proj(az, alt)
      const d = (sx-px)**2 + (sy-py)**2
      if (d < bestD) { bestD = d; best = `${name}  mag ${vmag.toFixed(1)}` }
    }
    for (const { name, sym } of PLANETS) {
      const rd = planetRaDec(name, jd); if (!rd) continue
      const { alt, az } = raDecToAltAz(rd.ra, rd.dec, lat, lst)
      const [sx, sy] = proj(az, alt)
      const d = (sx-px)**2 + (sy-py)**2
      if (d < bestD) { bestD = d; best = `${sym} ${name}` }
    }
    if (best) { setIdentified(best); setTimeout(() => setIdentified(null), 3000) }
  }

  if (phase === 'idle') return (
    <div className="card-dark p-5 rounded-2xl text-center">
      <div className="text-5xl mb-3">🔭</div>
      <h2 className="text-xl font-bold text-white mb-2">AR Star Finder</h2>
      <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">Point your camera at the sky — stars, planets and their names appear live on screen</p>
      <button onClick={start} className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 transition">
        📷 Start AR
      </button>
      <p className="text-slate-600 text-[11px] mt-3">Requires camera + motion sensor · Best outdoors at night</p>
    </div>
  )

  if (phase === 'error') return (
    <div className="card-dark p-5 rounded-2xl text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-red-400 text-sm mb-4">{err}</p>
      <button onClick={() => { setErr(''); setPhase('idle') }} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Try Again</button>
    </div>
  )

  return (
    <div className="card-dark rounded-2xl overflow-hidden">
      <div className="relative" style={{ maxHeight: '85vh' }}>
        <video ref={videoRef} autoPlay playsInline muted className="w-full block" style={{ background: '#000' }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ cursor: 'crosshair' }}
          onClick={tap} onTouchEnd={tap} />
        {identified && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full font-bold text-sm text-white"
            style={{ background: 'rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>
            ✦ {identified}
          </div>
        )}
        <button onClick={stop} className="absolute top-10 right-3 px-3 py-1.5 rounded-lg text-white text-xs"
          style={{ background: 'rgba(0,0,0,0.65)' }}>
          ✕ Exit
        </button>
      </div>
      <p className="text-[10px] text-slate-600 text-center py-2">Tap any star or planet to identify it</p>
    </div>
  )
}
