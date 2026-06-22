import { useEffect, useRef, useState, useCallback } from 'react'

// Bright stars: [name_he, RA_hours, Dec_deg, magnitude, color]
const STARS: [string, number, number, number, string][] = [
  ['Sirius',     6.752, -16.72, -1.46, '#a8d8ff'],
  ['Canopus',     6.399, -52.70, -0.74, '#fffbe0'],
  ['Arcturus',  14.261,  19.18, -0.05, '#ffcc88'],
  ['Vega',       18.615,  38.78,  0.03, '#cce0ff'],
  ['Capella',       5.278,  45.98,  0.08, '#ffe8a0'],
  ['Rigel',       5.243,  -8.20,  0.18, '#cce8ff'],
  ['Procyon',    7.655,   5.22,  0.40, '#fff8e0'],
  ['Betelgeuse',    5.919,   7.41,  0.45, '#ffaa66'],
  ['Achernar',      1.629, -57.24,  0.45, '#cce0ff'],
  ['Hadar',    14.066, -60.37,  0.61, '#aaccff'],
  ['Altair',    19.846,   8.87,  0.77, '#fffbe0'],
  ['Deneb',       20.690,  45.28,  1.25, '#cce0ff'],
  ['Antares',    16.490, -26.43,  1.06, '#ff6644'],
  ['Spica',     13.420, -11.16,  0.98, '#cce0ff'],
  ['Fomalhaut',  22.961, -29.62,  1.16, '#fffbe0'],
  ['Pollux',     7.755,  28.03,  1.16, '#ffcc88'],
  ['Fomalhaut B',  22.961, -29.62,  1.17, '#fff8e0'],
  ['Diphda',    0.655, -17.99,  2.04, '#cce0ff'],
  ['Mirfak',      1.220,  49.86,  1.80, '#fffbe0'],
  ['Aldebaran',     4.599,  16.51,  0.87, '#ff9944'],
  ['Castor',      7.577,  31.89,  1.58, '#cce0ff'],
  ['Mimosa',      12.444, -63.10,  1.33, '#aaccff'],
  ['Mim B',    12.796, -59.69,  1.25, '#cce0ff'],
  ['Acrux',    12.443, -63.10,  0.77, '#cce0ff'],
  ['Regulus',    10.140,  11.97,  1.36, '#cce0ff'],
  ['Adhara',      6.977, -28.97,  1.50, '#cce0ff'],
  ['Shaula',     17.621, -37.10,  1.63, '#cce0ff'],
  ['Gacrux',   12.519, -57.11,  1.59, '#ff8866'],
  ['Naos',       8.060, -40.00,  2.21, '#88aaff'],
]

// Constellation lines: pairs of star indices
const CONSTELLATIONS: [number, number][] = [
  [7, 5],  // Orion - Betelgeuse to Rigel
  [7, 0],  // Betelgeuse to Sirius (informal)
  [12, 13], // Antares to Spica (informal)
  [3, 10],  // Vega to Altair
  [3, 11],  // Vega to Deneb
]

function julianDate(d: Date) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + h / 24 + B - 1524.5
}

function localSiderealTime(date: Date, lng: number) {
  const jd = julianDate(date)
  const t = (jd - 2451545.0) / 36525
  let gst = 6.697374558 + 2400.0513369 * t + 0.0000258622 * t * t
  gst = ((gst % 24) + 24) % 24
  return ((gst + lng / 15) % 24 + 24) % 24
}

function toHorizon(ra: number, dec: number, lst: number, lat: number) {
  const ha = (lst - ra) * 15 * Math.PI / 180
  const decR = dec * Math.PI / 180
  const latR = lat * Math.PI / 180
  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR))
  return { alt, az: ((az * 180 / Math.PI) + 180 + 360) % 360 }
}

function altAzToXY(alt: number, az: number, cx: number, cy: number, r: number) {
  const rho = (90 - alt) / 90 * r
  const theta = (az - 90) * Math.PI / 180
  return { x: cx + rho * Math.cos(theta), y: cy + rho * Math.sin(theta) }
}

export default function StarMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [userLoc, setUserLoc] = useState({ lat: 31.77, lng: 35.21 })
  const [city, setCity] = useState('Jerusalem')
  const [time, setTime] = useState(new Date())
  const [rotation, setRotation] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [prevX, setPrevX] = useState(0)

  const CITIES = [
    { name: 'Jerusalem',   lat: 31.77, lng: 35.21 },
    { name: 'Tel Aviv',    lat: 32.08, lng: 34.78 },
    { name: 'New York',    lat: 40.71, lng: -74.00 },
    { name: 'London',      lat: 51.51, lng: -0.13 },
    { name: 'Tokyo',       lat: 35.68, lng: 139.69 },
    { name: 'Sydney',      lat: -33.87, lng: 151.21 },
  ]

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    const r = Math.min(W, H) / 2 - 20

    ctx.clearRect(0, 0, W, H)

    // Sky background
    const skyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    skyGrad.addColorStop(0, '#0a0e2a')
    skyGrad.addColorStop(0.7, '#060918')
    skyGrad.addColorStop(1, '#020408')
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = skyGrad
    ctx.fill()
    ctx.strokeStyle = 'rgba(99,102,241,0.3)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Horizon rings
    for (const alt of [30, 60]) {
      ctx.beginPath()
      ctx.arc(cx, cy, r * (1 - alt / 90), 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Cardinal directions
    const cardinals = [
      { label: 'N', az: 0 }, { label: 'E', az: 90 },
      { label: 'S', az: 180 }, { label: 'W', az: 270 },
    ]
    ctx.font = 'bold 11px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    cardinals.forEach(({ label, az }) => {
      const { x, y } = altAzToXY(0, (az + rotation + 360) % 360, cx, cy, r + 14)
      ctx.fillStyle = 'rgba(99,102,241,0.7)'
      ctx.fillText(label, x, y)
    })

    // Background micro-stars
    for (let i = 0; i < 120; i++) {
      const angle = (i * 137.508) * Math.PI / 180
      const radius = r * Math.sqrt((i * 0.618) % 1)
      const sx = cx + radius * Math.cos(angle)
      const sy = cy + radius * Math.sin(angle)
      ctx.beginPath()
      ctx.arc(sx, sy, 0.4 + (i % 3) * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(180,190,255,${0.12 + (i % 5) * 0.04})`
      ctx.fill()
    }

    const lst = localSiderealTime(time, userLoc.lng)

    // Constellation lines
    CONSTELLATIONS.forEach(([i, j]) => {
      const a = toHorizon(STARS[i][1], STARS[i][2], lst, userLoc.lat)
      const b = toHorizon(STARS[j][1], STARS[j][2], lst, userLoc.lat)
      if (a.alt < 0 || b.alt < 0) return
      const pa = altAzToXY(a.alt, (a.az + rotation + 360) % 360, cx, cy, r)
      const pb = altAzToXY(b.alt, (b.az + rotation + 360) % 360, cx, cy, r)
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.strokeStyle = 'rgba(99,102,241,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
    })

    // Stars
    STARS.forEach(([name, ra, dec, mag, color]) => {
      const { alt, az } = toHorizon(ra, dec, lst, userLoc.lat)
      if (alt < -5) return
      const { x, y } = altAzToXY(alt, (az + rotation + 360) % 360, cx, cy, r)
      if (x < 0 || x > W || y < 0 || y > H) return

      const starR = Math.max(1.8, (5.5 - mag) * 1.2)
      const alpha = alt < 0 ? 0.25 : 1

      // Outer glow for all stars
      const glowR = starR * (mag < 0 ? 9 : mag < 1 ? 7 : 5)
      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
      glow.addColorStop(0, color + 'cc')
      glow.addColorStop(0.4, color + '55')
      glow.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(x, y, glowR, 0, Math.PI * 2)
      ctx.fillStyle = glow
      ctx.globalAlpha = alpha * 0.75
      ctx.fill()
      ctx.globalAlpha = 1

      // Star core
      ctx.beginPath()
      ctx.arc(x, y, starR, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.globalAlpha = alpha
      ctx.fill()
      ctx.globalAlpha = 1

      // Labels for visible bright stars
      if (mag < 2.0 && alt > 0) {
        ctx.font = `bold ${mag < 0.5 ? 10 : 9}px system-ui`
        ctx.fillStyle = 'rgba(200,210,255,0.75)'
        ctx.textAlign = 'left'
        ctx.fillText(name, x + starR + 4, y + 3)
      }
    })

    // Zenith marker
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fill()

    // Clip to circle
    ctx.save()
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }, [userLoc, time, rotation])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  // Auto-detect location on mount; fall back to Jerusalem silently
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setCity('Your Location')
      },
      () => {},
      { timeout: 5000 }
    )
  }, [])

  const visibleCount = (() => {
    const lst = localSiderealTime(time, userLoc.lng)
    return STARS.filter(s => toHorizon(s[1], s[2], lst, userLoc.lat).alt > 0).length
  })()

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🌌</span>
        <div>
          <h3 className="text-white font-bold text-lg">Star Map — Tonight</h3>
          <p className="text-gray-500 text-xs">{visibleCount} stars visible above horizon • drag to rotate</p>
        </div>
        <div className="ml-auto live-badge"><span className="live-dot" />LIVE</div>
      </div>

      {/* City selector */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CITIES.map(c => (
          <button
            key={c.name}
            onClick={() => { setUserLoc({ lat: c.lat, lng: c.lng }); setCity(c.name) }}
            style={city === c.name ? {
              background: 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.45)',
              color: '#c4b5fd',
            } : {
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: '#6b7280',
            }}
            className="text-xs px-2.5 py-1 rounded-lg transition"
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4">
        <canvas
          ref={canvasRef}
          width={380}
          height={380}
          className="rounded-full cursor-grab active:cursor-grabbing touch-none"
          style={{ maxWidth: '100%' }}
          onMouseDown={e => { setDragging(true); setPrevX(e.clientX) }}
          onMouseMove={e => { if (dragging) { setRotation(r => r + (e.clientX - prevX) * 0.5); setPrevX(e.clientX) } }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onTouchStart={e => { setDragging(true); setPrevX(e.touches[0].clientX) }}
          onTouchMove={e => { if (dragging) { setRotation(r => r + (e.touches[0].clientX - prevX) * 0.5); setPrevX(e.touches[0].clientX) } }}
          onTouchEnd={() => setDragging(false)}
        />
        <div className="flex flex-wrap gap-3 text-xs text-gray-600 justify-center">
          <span>📍 {city} — {userLoc.lat.toFixed(1)}°N</span>
          <span>🕐 {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  )
}
