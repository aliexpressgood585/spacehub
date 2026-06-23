import { useEffect, useRef, useState, useCallback } from 'react'

// ── MATH HELPERS ──────────────────────────────────────────────
const DEG = Math.PI / 180
const rev = (x: number) => ((x % 360) + 360) % 360

function julianDate(d: Date) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate()
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
  const ha = (lst - ra) * 15 * DEG
  const decR = dec * DEG, latR = lat * DEG
  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR))
  return { alt, az: rev((az * 180 / Math.PI) + 180) }
}

function project(alt: number, az: number, cx: number, cy: number, r: number, rot: number) {
  const rho = (90 - alt) / 90 * r
  const theta = (az + rot - 90) * DEG
  return { x: cx + rho * Math.cos(theta), y: cy + rho * Math.sin(theta) }
}

// ── KEPLER EQUATIONS + PLANET EPHEMERIS (Paul Schlyter's formulae) ──
function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M))
  for (let n = 0; n < 10; n++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    if (Math.abs(dE) < 1e-8) break
    E -= dE
  }
  return E
}

interface OrbElem { N: number; i: number; w: number; a: number; e: number; M: number }

function helioXYZ({ N, i, w, a, e, M }: OrbElem) {
  const E = solveKepler(M * DEG, e)
  const xv = a * (Math.cos(E) - e)
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const v = Math.atan2(yv, xv)
  const r = Math.sqrt(xv * xv + yv * yv)
  const Nr = N * DEG, ir = i * DEG, lon = v + (w - N) * DEG
  return {
    x: r * (Math.cos(Nr) * Math.cos(lon) - Math.sin(Nr) * Math.sin(lon) * Math.cos(ir)),
    y: r * (Math.sin(Nr) * Math.cos(lon) + Math.cos(Nr) * Math.sin(lon) * Math.cos(ir)),
    z: r * Math.sin(lon) * Math.sin(ir),
  }
}

function earthXYZ(d: number) {
  const wr = rev(282.9404 + 4.70935e-5 * d) * DEG
  const e = 0.016709 - 1.151e-9 * d
  const M = rev(356.0470 + 0.9856002585 * d) * DEG
  const E = solveKepler(M, e)
  const xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E)
  const r = Math.sqrt(xv * xv + yv * yv)
  const ls = Math.atan2(yv, xv) + wr
  return { x: r * Math.cos(ls + Math.PI), y: r * Math.sin(ls + Math.PI), z: 0 }
}

function getOrbElems(d: number, name: string): OrbElem | null {
  switch (name) {
    case 'Mercury': return { N: rev(48.3313+3.24587e-5*d), i: rev(7.0047+5e-8*d), w: rev(29.1241+1.01444e-5*d), a: 0.387098, e: 0.205635+5.59e-10*d, M: rev(168.6562+4.0923344368*d) }
    case 'Venus':   return { N: rev(76.6799+2.4659e-5*d),  i: rev(3.3946+2.75e-8*d), w: rev(54.891+1.38374e-5*d), a: 0.72333, e: 0.006773-1.302e-9*d, M: rev(48.0052+1.6021302244*d) }
    case 'Mars':    return { N: rev(49.5574+2.11081e-5*d), i: rev(1.8497-1.78e-8*d), w: rev(286.5016+2.92961e-5*d), a: 1.523688, e: 0.093405+2.516e-9*d, M: rev(18.6021+0.5240207766*d) }
    case 'Jupiter': return { N: rev(100.4542+2.76854e-5*d),i: rev(1.303-1.557e-7*d), w: rev(273.8777+1.64505e-5*d), a: 5.20256, e: 0.048498+4.469e-9*d, M: rev(19.895+0.0830853001*d) }
    case 'Saturn':  return { N: rev(113.6634+2.3898e-5*d), i: rev(2.4886-1.081e-7*d),w: rev(339.3939+2.97661e-5*d), a: 9.55475, e: 0.055546-9.499e-9*d, M: rev(316.967+0.0334442282*d) }
    default: return null
  }
}

function computeRADec(name: string, d: number): { ra: number; dec: number } | null {
  if (name === 'Sun') {
    const wr = rev(282.9404 + 4.70935e-5 * d) * DEG
    const e = 0.016709 - 1.151e-9 * d
    const M = rev(356.0470 + 0.9856002585 * d) * DEG
    const E = solveKepler(M, e)
    const xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E)
    const ls = Math.atan2(yv, xv) + wr
    const ecl = (23.4393 - 3.563e-7 * d) * DEG
    return {
      ra:  rev(Math.atan2(Math.sin(ls) * Math.cos(ecl), Math.cos(ls)) * 180 / Math.PI) / 15,
      dec: Math.asin(Math.sin(ls) * Math.sin(ecl)) * 180 / Math.PI,
    }
  }
  const el = getOrbElems(d, name)
  if (!el) return null
  const p = helioXYZ(el), e = earthXYZ(d)
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z
  const ecl = (23.4393 - 3.563e-7 * d) * DEG
  const yeq = dy * Math.cos(ecl) - dz * Math.sin(ecl)
  const zeq = dy * Math.sin(ecl) + dz * Math.cos(ecl)
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return {
    ra:  rev(Math.atan2(yeq, dx) * 180 / Math.PI) / 15,
    dec: Math.asin(Math.max(-1, Math.min(1, zeq / dist))) * 180 / Math.PI,
  }
}

// ── STAR CATALOG: [name, RA_h, Dec_deg, magnitude, color] ─────
// index numbers used in CONSTELLATION_LINES below
const STARS: [string, number, number, number, string][] = [
  ['Sirius',     6.752,  -16.72, -1.46, '#a8d8ff'],  // 0
  ['Canopus',    6.399,  -52.70, -0.74, '#fffbe0'],  // 1
  ['Arcturus',  14.261,   19.18, -0.05, '#ffcc88'],  // 2
  ['Vega',      18.615,   38.78,  0.03, '#cce0ff'],  // 3
  ['Capella',    5.278,   45.99,  0.08, '#ffe8a0'],  // 4
  ['Rigel',      5.243,   -8.20,  0.18, '#cce8ff'],  // 5
  ['Procyon',    7.655,    5.22,  0.40, '#fff8e0'],  // 6
  ['Betelgeuse', 5.919,    7.41,  0.45, '#ffaa66'],  // 7
  ['Achernar',   1.629,  -57.24,  0.45, '#cce0ff'],  // 8
  ['Hadar',     14.066,  -60.37,  0.61, '#aaccff'],  // 9
  ['Altair',    19.846,    8.87,  0.77, '#fffbe0'],  // 10
  ['Deneb',     20.690,   45.28,  1.25, '#cce0ff'],  // 11
  ['Antares',   16.490,  -26.43,  1.06, '#ff6644'],  // 12
  ['Spica',     13.420,  -11.16,  0.98, '#cce0ff'],  // 13
  ['Fomalhaut', 22.961,  -29.62,  1.16, '#fffbe0'],  // 14
  ['Pollux',     7.755,   28.03,  1.16, '#ffcc88'],  // 15
  ['Castor',     7.577,   31.89,  1.58, '#cce0ff'],  // 16
  ['Aldebaran',  4.599,   16.51,  0.87, '#ff9944'],  // 17
  ['Regulus',   10.140,   11.97,  1.36, '#cce0ff'],  // 18
  ['Adhara',     6.977,  -28.97,  1.50, '#cce0ff'],  // 19
  ['Acrux',     12.443,  -63.10,  0.77, '#cce0ff'],  // 20
  ['Gacrux',    12.519,  -57.11,  1.59, '#ff8866'],  // 21
  ['Shaula',    17.560,  -37.10,  1.63, '#cce0ff'],  // 22
  ['Mirfak',     3.405,   49.86,  1.80, '#fffbe0'],  // 23
  ['Diphda',     0.655,  -17.99,  2.04, '#cce0ff'],  // 24
  // Orion constellation stars
  ['Bellatrix',  5.419,    6.35,  1.64, '#aaccff'],  // 25
  ['Mintaka',    5.533,   -0.30,  2.23, '#aaccff'],  // 26
  ['Alnilam',    5.604,   -1.20,  1.69, '#aaccff'],  // 27
  ['Alnitak',    5.679,   -1.94,  1.72, '#aaccff'],  // 28
  ['Saiph',      5.796,   -9.67,  2.07, '#aaccff'],  // 29
  // Big Dipper / Ursa Major
  ['Dubhe',     11.062,   61.75,  1.81, '#ffcc88'],  // 30
  ['Merak',     11.031,   56.38,  2.37, '#fffbe0'],  // 31
  ['Phecda',    11.897,   53.69,  2.44, '#fffbe0'],  // 32
  ['Megrez',    12.257,   57.03,  3.32, '#d0d8ff'],  // 33
  ['Alioth',    12.900,   55.96,  1.76, '#fffbe0'],  // 34
  ['Mizar',     13.399,   54.93,  2.23, '#fffbe0'],  // 35
  ['Alkaid',    13.792,   49.31,  1.85, '#aaccff'],  // 36
  // Cassiopeia
  ['Schedar',    0.675,   56.54,  2.24, '#ffcc88'],  // 37
  ['Caph',       0.153,   59.15,  2.28, '#fffbe0'],  // 38
  ['Cih',        0.945,   60.72,  2.47, '#aaccff'],  // 39
  ['Ruchbah',    1.430,   60.24,  2.68, '#fffbe0'],  // 40
  ['Segin',      1.907,   63.67,  3.38, '#c0c8ff'],  // 41
  // Leo
  ['Algieba',   10.332,   19.84,  2.61, '#ffcc88'],  // 42
  ['Zosma',     11.235,   20.52,  2.56, '#fffbe0'],  // 43
  ['Denebola',  11.817,   14.57,  2.14, '#aaccff'],  // 44
  // Gemini / Taurus
  ['Elnath',     5.438,   28.61,  1.68, '#aaccff'],  // 45
  ['Alhena',     6.629,   16.40,  1.93, '#aaccff'],  // 46
  // Scorpius tail
  ['Lesath',    17.513,  -37.30,  2.70, '#aaccff'],  // 47
  ['Sargas',    17.622,  -43.00,  1.87, '#fffbe0'],  // 48
]

// ── CONSTELLATION LINES: [idxA, idxB] ─────────────────────────
type ConLine = { a: number; b: number; name: string }
const CONSTELLATION_LINES: ConLine[] = [
  // Orion
  { a: 7,  b: 25, name: 'Orion' }, // Betelgeuse - Bellatrix
  { a: 7,  b: 28, name: 'Orion' }, // Betelgeuse - Alnitak
  { a: 25, b: 26, name: 'Orion' }, // Bellatrix - Mintaka
  { a: 26, b: 27, name: 'Orion' }, // Mintaka - Alnilam (belt)
  { a: 27, b: 28, name: 'Orion' }, // Alnilam - Alnitak (belt)
  { a: 26, b: 5,  name: 'Orion' }, // Mintaka - Rigel
  { a: 28, b: 29, name: 'Orion' }, // Alnitak - Saiph
  // Big Dipper
  { a: 30, b: 31, name: 'Ursa Major' }, // Dubhe - Merak
  { a: 31, b: 32, name: 'Ursa Major' }, // Merak - Phecda
  { a: 32, b: 33, name: 'Ursa Major' }, // Phecda - Megrez
  { a: 33, b: 30, name: 'Ursa Major' }, // Megrez - Dubhe (bowl)
  { a: 33, b: 34, name: 'Ursa Major' }, // Megrez - Alioth
  { a: 34, b: 35, name: 'Ursa Major' }, // Alioth - Mizar
  { a: 35, b: 36, name: 'Ursa Major' }, // Mizar - Alkaid
  // Cassiopeia
  { a: 38, b: 37, name: 'Cassiopeia' }, // Caph - Schedar
  { a: 37, b: 39, name: 'Cassiopeia' }, // Schedar - Cih
  { a: 39, b: 40, name: 'Cassiopeia' }, // Cih - Ruchbah
  { a: 40, b: 41, name: 'Cassiopeia' }, // Ruchbah - Segin
  // Summer Triangle
  { a: 3,  b: 10, name: 'Summer △' },
  { a: 3,  b: 11, name: 'Summer △' },
  { a: 10, b: 11, name: 'Summer △' },
  // Leo
  { a: 18, b: 42, name: 'Leo' }, // Regulus - Algieba (sickle)
  { a: 42, b: 43, name: 'Leo' }, // Algieba - Zosma
  { a: 43, b: 44, name: 'Leo' }, // Zosma - Denebola (spine)
  // Gemini
  { a: 15, b: 16, name: 'Gemini' }, // Pollux - Castor
  { a: 15, b: 45, name: 'Gemini' }, // Pollux - Elnath (foot area)
  { a: 16, b: 46, name: 'Gemini' }, // Castor - Alhena
  // Taurus
  { a: 17, b: 45, name: 'Taurus' }, // Aldebaran - Elnath (horns)
  // Scorpius tail
  { a: 22, b: 47, name: 'Scorpius' }, // Shaula - Lesath
  { a: 22, b: 48, name: 'Scorpius' }, // Shaula - Sargas
]

// ── PLANETS ────────────────────────────────────────────────────
const PLANETS = [
  { name: 'Sun',     symbol: '☀',  color: '#ffee44', glow: '#ffcc00', size: 7 },
  { name: 'Mercury', symbol: '☿',  color: '#b0b0b0', glow: '#888888', size: 4 },
  { name: 'Venus',   symbol: '♀',  color: '#fff4c2', glow: '#ffee88', size: 5 },
  { name: 'Mars',    symbol: '♂',  color: '#ff5533', glow: '#ff2200', size: 5 },
  { name: 'Jupiter', symbol: '♃',  color: '#f5c88a', glow: '#e8a060', size: 6 },
  { name: 'Saturn',  symbol: '♄',  color: '#f0d880', glow: '#d4b840', size: 5 },
]

const DIRECTION_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const CITIES = [
  { name: 'Jerusalem', lat: 31.77, lng: 35.21 },
  { name: 'Tel Aviv',  lat: 32.08, lng: 34.78 },
  { name: 'New York',  lat: 40.71, lng: -74.00 },
  { name: 'London',    lat: 51.51, lng: -0.13 },
  { name: 'Tokyo',     lat: 35.68, lng: 139.69 },
  { name: 'Sydney',    lat: -33.87, lng: 151.21 },
]

function azDir(az: number) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(az / 45) % 8]
}

export default function StarMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loc, setLoc]         = useState({ lat: 31.77, lng: 35.21 })
  const [city, setCity]       = useState('Jerusalem')
  const [time, setTime]       = useState(new Date())
  const [rotation, setRotation] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [prevX, setPrevX]     = useState(0)

  const [showPlanets, setShowPlanets]         = useState(true)
  const [showConstellations, setShowConstellations] = useState(true)
  const [showLabels, setShowLabels]           = useState(true)
  const [showGrid, setShowGrid]               = useState(false)

  const jd = julianDate(time)
  const d  = jd - 2451543.5  // Schlyter epoch

  const planetPositions = PLANETS.map(p => {
    const radec = computeRADec(p.name, d)
    if (!radec) return null
    const lst = localSiderealTime(time, loc.lng)
    const hz  = toHorizon(radec.ra, radec.dec, lst, loc.lat)
    return { ...p, ...hz }
  }).filter(Boolean) as (typeof PLANETS[0] & { alt: number; az: number })[]

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    const r  = Math.min(W, H) / 2 - 22

    ctx.clearRect(0, 0, W, H)

    // ── Sky background ──
    const skyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    skyGrad.addColorStop(0,   '#0d1235')
    skyGrad.addColorStop(0.6, '#07091a')
    skyGrad.addColorStop(1,   '#020408')
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = skyGrad; ctx.fill()

    // ── Clip to circle for all subsequent drawing ──
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()

    // ── Altitude grid ──
    if (showGrid) {
      for (const alt of [15, 30, 45, 60, 75]) {
        ctx.beginPath()
        ctx.arc(cx, cy, r * (90 - alt) / 90, 0, Math.PI * 2)
        ctx.strokeStyle = alt % 30 === 0 ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)'
        ctx.lineWidth = 1
        ctx.stroke()
        if (alt % 30 === 0) {
          ctx.font = '9px system-ui'
          ctx.fillStyle = 'rgba(99,102,241,0.45)'
          ctx.textAlign = 'left'
          ctx.fillText(`${alt}°`, cx + r * (90 - alt) / 90 + 3, cy - 2)
        }
      }
      // Azimuth lines every 45°
      for (let az = 0; az < 360; az += 45) {
        const { x, y } = project(0, (az + rotation + 360) % 360, cx, cy, r, 0)
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y)
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.stroke()
      }
    } else {
      // Always draw the horizon ring
      for (const alt of [30, 60]) {
        ctx.beginPath()
        ctx.arc(cx, cy, r * (90 - alt) / 90, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.stroke()
      }
    }

    // ── Horizon edge ──
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(99,102,241,0.35)'; ctx.lineWidth = 1.5; ctx.stroke()

    // ── Background micro-stars ──
    for (let i = 0; i < 160; i++) {
      const angle  = i * 137.508 * DEG
      const radius = r * Math.sqrt((i * 0.618) % 1) * 0.98
      const sx = cx + radius * Math.cos(angle), sy = cy + radius * Math.sin(angle)
      const op = 0.08 + (i % 7) * 0.03
      ctx.beginPath(); ctx.arc(sx, sy, 0.35 + (i % 3) * 0.25, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(180,190,255,${op})`; ctx.fill()
    }

    const lst = localSiderealTime(time, loc.lng)

    // ── Constellation lines ──
    if (showConstellations) {
      CONSTELLATION_LINES.forEach(({ a, b }) => {
        const sa = STARS[a], sb = STARS[b]
        const ha = toHorizon(sa[1], sa[2], lst, loc.lat)
        const hb = toHorizon(sb[1], sb[2], lst, loc.lat)
        if (ha.alt < -3 || hb.alt < -3) return
        const pa = project(ha.alt, (ha.az + rotation) % 360, cx, cy, r, 0)
        const pb = project(hb.alt, (hb.az + rotation) % 360, cx, cy, r, 0)
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y)
        ctx.strokeStyle = 'rgba(130,140,255,0.38)'; ctx.lineWidth = 1; ctx.stroke()
      })
    }

    // ── Stars ──
    STARS.forEach(([name, ra, dec, mag, color]) => {
      const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
      if (alt < -4) return
      const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) return

      const starR  = Math.max(1.5, (5.8 - mag) * 1.15)
      const glowR  = starR * (mag < 0 ? 10 : mag < 1 ? 7 : 5)
      const alpha  = alt < 0 ? 0.22 : 1

      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
      glow.addColorStop(0, color + 'cc')
      glow.addColorStop(0.4, color + '44')
      glow.addColorStop(1, 'transparent')
      ctx.globalAlpha = alpha * 0.7
      ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2)
      ctx.fillStyle = glow; ctx.fill()

      ctx.globalAlpha = alpha
      ctx.beginPath(); ctx.arc(x, y, starR, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.globalAlpha = 1

      // Labels for bright stars
      if (showLabels && mag < 1.7 && alt > 2) {
        ctx.font = `${mag < 0.5 ? 10 : 9}px 'Space Grotesk', system-ui`
        ctx.textAlign = 'left'
        const lx = x + starR + 4, ly = y + 3
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillText(name, lx + 1, ly + 1)
        ctx.fillStyle = 'rgba(200,212,255,0.85)'
        ctx.fillText(name, lx, ly)
      }
    })

    // ── Planets ──
    if (showPlanets) {
      PLANETS.forEach(planet => {
        const radec = computeRADec(planet.name, d)
        if (!radec) return
        const { alt, az } = toHorizon(radec.ra, radec.dec, lst, loc.lat)
        if (alt < -4) return
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) return

        const alpha = alt < 0 ? 0.25 : 1
        ctx.globalAlpha = alpha

        // Glow
        const glowR = planet.name === 'Sun' ? planet.size * 6 : planet.size * 4.5
        const glow  = ctx.createRadialGradient(x, y, 0, x, y, glowR)
        glow.addColorStop(0, planet.glow + 'cc')
        glow.addColorStop(0.5, planet.glow + '55')
        glow.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2)
        ctx.fillStyle = glow; ctx.fill()

        // Planet disc
        ctx.beginPath(); ctx.arc(x, y, planet.size, 0, Math.PI * 2)
        ctx.fillStyle = planet.color; ctx.fill()

        // Saturn ring hint
        if (planet.name === 'Saturn') {
          ctx.beginPath()
          ctx.ellipse(x, y, planet.size * 1.8, planet.size * 0.55, 0.35, 0, Math.PI * 2)
          ctx.strokeStyle = planet.color + 'aa'; ctx.lineWidth = 1.5; ctx.stroke()
        }

        // Label
        ctx.font = 'bold 9px \'Space Grotesk\', system-ui'
        ctx.textAlign = 'left'
        const lx = x + planet.size + 4, ly = y + 3
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillText(`${planet.symbol} ${planet.name}`, lx + 1, ly + 1)
        ctx.fillStyle = planet.color
        ctx.fillText(`${planet.symbol} ${planet.name}`, lx, ly)

        ctx.globalAlpha = 1
      })
    }

    // ── Cardinal direction labels ──
    DIRECTION_LABELS.forEach((label, idx) => {
      const az = idx * 45
      const { x, y } = project(-1, (az + rotation + 360) % 360, cx, cy, r + 14, 0)
      ctx.font = `bold ${idx % 2 === 0 ? 12 : 9}px system-ui`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(130,140,255,0.85)' : 'rgba(99,102,241,0.45)'
      ctx.fillText(label, x, y)
    })

    // ── Zenith dot ──
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill()
    ctx.restore()
  }, [loc, time, rotation, showPlanets, showConstellations, showLabels, showGrid, d])

  useEffect(() => { draw() }, [draw])
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      pos => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setCity('My Location') },
      () => {},
      { timeout: 5000 }
    )
  }, [])

  const visibleStars = (() => {
    const lst = localSiderealTime(time, loc.lng)
    return STARS.filter(s => toHorizon(s[1], s[2], lst, loc.lat).alt > 0).length
  })()

  const visiblePlanets = planetPositions.filter(p => p.alt > 0)

  return (
    <div className="space-card p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-box text-2xl">🌌</div>
        <div>
          <h3 className="text-white font-bold text-lg">Tonight's Sky</h3>
          <p className="text-gray-500 text-xs">{visibleStars} stars visible · {city} · {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="ml-auto live-badge"><span className="live-dot" />LIVE</div>
      </div>

      {/* City selector */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CITIES.map(c => (
          <button
            key={c.name}
            onClick={() => { setLoc({ lat: c.lat, lng: c.lng }); setCity(c.name) }}
            style={city === c.name
              ? { background: 'rgba(99,102,241,0.22)', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
            className="text-xs px-2.5 py-1 rounded-lg transition"
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Toggle controls */}
      <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Map display options">
        {([
          { key: 'planets',       label: '🪐 Planets',       val: showPlanets,       set: setShowPlanets },
          { key: 'constellations',label: '✦ Constellations', val: showConstellations, set: setShowConstellations },
          { key: 'labels',        label: '🏷 Labels',        val: showLabels,        set: setShowLabels },
          { key: 'grid',          label: '⊕ Grid',           val: showGrid,          set: setShowGrid },
        ] as const).map(({ key, label, val, set }) => (
          <button
            key={key}
            onClick={() => (set as (v: boolean) => void)(!val)}
            aria-pressed={val}
            style={val
              ? { background: 'rgba(99,102,241,0.22)', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex justify-center mb-4">
        <canvas
          ref={canvasRef}
          width={480}
          height={480}
          aria-label="Interactive star map showing the current night sky"
          className="rounded-full cursor-grab active:cursor-grabbing touch-none"
          style={{ maxWidth: '100%', maxHeight: '66vw' }}
          onMouseDown={e => { setDragging(true); setPrevX(e.clientX) }}
          onMouseMove={e => { if (!dragging) return; setRotation(r => r + (e.clientX - prevX) * 0.5); setPrevX(e.clientX) }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onTouchStart={e => { setDragging(true); setPrevX(e.touches[0].clientX) }}
          onTouchMove={e => { if (!dragging) return; e.preventDefault(); setRotation(r => r + (e.touches[0].clientX - prevX) * 0.5); setPrevX(e.touches[0].clientX) }}
          onTouchEnd={() => setDragging(false)}
        />
      </div>

      {/* Planet visibility panel */}
      {showPlanets && (
        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 14, padding: '12px 16px' }}>
          <p className="text-xs font-bold text-indigo-300 mb-2 tracking-wide uppercase">Planet Positions Now</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {planetPositions.map(p => (
              <div key={p.name} className="flex items-center gap-2">
                <span style={{ color: p.color, fontSize: 14, lineHeight: 1 }}>{p.symbol}</span>
                <div>
                  <span className="text-xs font-semibold" style={{ color: p.alt > 0 ? '#e2e8f0' : '#4b5563' }}>
                    {p.name}
                  </span>
                  <span className="text-xs ml-1" style={{ color: p.alt > 0 ? p.color : '#374151' }}>
                    {p.alt > 0 ? `${Math.round(p.alt)}° ${azDir(p.az)}` : 'below horizon'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {visiblePlanets.length > 0 && (
            <p className="text-xs text-indigo-400 mt-2">
              {visiblePlanets.length === 1
                ? `${visiblePlanets[0].symbol} ${visiblePlanets[0].name} is visible tonight`
                : `${visiblePlanets.map(p => p.symbol + ' ' + p.name).join(', ')} are visible tonight`}
            </p>
          )}
        </div>
      )}

      <p className="text-gray-700 text-xs text-center mt-3">Drag to rotate view · Zenith at center · N/E/S/W on horizon</p>
    </div>
  )
}
