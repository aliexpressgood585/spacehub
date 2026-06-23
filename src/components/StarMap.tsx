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

// ── ATMOSPHERIC EXTINCTION ─────────────────────────────────────
function extinction(alt: number): number {
  if (alt >= 18) return 1
  if (alt < 0)   return 0.12
  return 0.12 + (alt / 18) * 0.88
}

// ── GALACTIC → EQUATORIAL (IAU rotation matrix) ──────────────
function galToEquatorial(l: number, b: number) {
  const lR = l * DEG, bR = b * DEG
  const xg = Math.cos(bR) * Math.cos(lR)
  const yg = Math.cos(bR) * Math.sin(lR)
  const zg = Math.sin(bR)
  const xeq = -0.0548755604 * xg - 0.8734370902 * yg - 0.4838350155 * zg
  const yeq =  0.4941094279 * xg - 0.4448296300 * yg + 0.7469822445 * zg
  const zeq = -0.8676661490 * xg - 0.1980763734 * yg + 0.4559837762 * zg
  return {
    ra:  rev(Math.atan2(yeq, xeq) * 180 / Math.PI) / 15,
    dec: Math.asin(Math.max(-1, Math.min(1, zeq))) * 180 / Math.PI,
  }
}

// ── KEPLER EQUATIONS + PLANET EPHEMERIS (Paul Schlyter) ───────
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
  const rr = Math.sqrt(xv * xv + yv * yv)
  const Nr = N * DEG, ir = i * DEG, lon = v + (w - N) * DEG
  return {
    x: rr * (Math.cos(Nr) * Math.cos(lon) - Math.sin(Nr) * Math.sin(lon) * Math.cos(ir)),
    y: rr * (Math.sin(Nr) * Math.cos(lon) + Math.cos(Nr) * Math.sin(lon) * Math.cos(ir)),
    z: rr * Math.sin(lon) * Math.sin(ir),
  }
}

function earthXYZ(d: number) {
  const wr = rev(282.9404 + 4.70935e-5 * d) * DEG
  const e = 0.016709 - 1.151e-9 * d
  const M = rev(356.0470 + 0.9856002585 * d) * DEG
  const E = solveKepler(M, e)
  const xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E)
  const rr = Math.sqrt(xv * xv + yv * yv)
  const ls = Math.atan2(yv, xv) + wr
  return { x: rr * Math.cos(ls + Math.PI), y: rr * Math.sin(ls + Math.PI), z: 0 }
}

function getOrbElems(d: number, name: string): OrbElem | null {
  switch (name) {
    case 'Mercury': return { N: rev(48.3313+3.24587e-5*d), i: rev(7.0047+5e-8*d), w: rev(29.1241+1.01444e-5*d), a: 0.387098, e: 0.205635+5.59e-10*d, M: rev(168.6562+4.0923344368*d) }
    case 'Venus':   return { N: rev(76.6799+2.4659e-5*d),  i: rev(3.3946+2.75e-8*d), w: rev(54.891+1.38374e-5*d), a: 0.72333, e: 0.006773-1.302e-9*d, M: rev(48.0052+1.6021302244*d) }
    case 'Mars':    return { N: rev(49.5574+2.11081e-5*d), i: rev(1.8497-1.78e-8*d), w: rev(286.5016+2.92961e-5*d), a: 1.523688, e: 0.093405+2.516e-9*d, M: rev(18.6021+0.5240207766*d) }
    case 'Jupiter': return { N: rev(100.4542+2.76854e-5*d),i: rev(1.303-1.557e-7*d), w: rev(273.8777+1.64505e-5*d), a: 5.20256, e: 0.048498+4.469e-9*d, M: rev(19.895+0.0830853001*d) }
    case 'Saturn':  return { N: rev(113.6634+2.3898e-5*d), i: rev(2.4886-1.081e-7*d),w: rev(339.3939+2.97661e-5*d), a: 9.55475, e: 0.055546-9.499e-9*d, M: rev(316.967+0.0334442282*d) }
    case 'Uranus':  return { N: rev(74.0005+1.3978e-5*d),  i: rev(0.7733+1.9e-8*d),   w: rev(96.6612+3.0565e-5*d), a: 19.18171, e: 0.047318+7.45e-9*d, M: rev(142.5905+0.011725806*d) }
    case 'Neptune': return { N: rev(131.7806+3.0173e-5*d), i: rev(1.7700-2.55e-7*d),  w: rev(272.8461-6.027e-6*d), a: 30.05826, e: 0.008606+2.15e-9*d, M: rev(260.2471+0.005995147*d) }
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

// ── MOON EPHEMERIS (Paul Schlyter simplified) ─────────────────
function computeMoon(d: number): { ra: number; dec: number; phase: number } {
  const N = rev(125.1228 - 0.0529538083 * d)
  const w = rev(318.0634 + 0.1643573223 * d)
  const e = 0.054900
  const M = rev(115.3654 + 13.0649929509 * d)
  const E = solveKepler(M * DEG, e)
  const xv = 60.2666 * (Math.cos(E) - e)
  const yv = 60.2666 * Math.sqrt(1 - e * e) * Math.sin(E)
  const v   = Math.atan2(yv, xv)
  const rr  = Math.sqrt(xv * xv + yv * yv)
  const lonR = v + (w - N) * DEG
  const Nr   = N * DEG, iR = 5.1454 * DEG
  const xe = rr * (Math.cos(Nr) * Math.cos(lonR) - Math.sin(Nr) * Math.sin(lonR) * Math.cos(iR))
  const ye = rr * (Math.sin(Nr) * Math.cos(lonR) + Math.cos(Nr) * Math.sin(lonR) * Math.cos(iR))
  const ze = rr * Math.sin(lonR) * Math.sin(iR)
  const ecl = (23.4393 - 3.563e-7 * d) * DEG
  const yeq = ye * Math.cos(ecl) - ze * Math.sin(ecl)
  const zeq = ye * Math.sin(ecl) + ze * Math.cos(ecl)
  const ra  = rev(Math.atan2(yeq, xe) * 180 / Math.PI) / 15
  const dec = Math.asin(Math.max(-1, Math.min(1, zeq / rr))) * 180 / Math.PI
  // Phase from elongation vs Sun
  const sunR = computeRADec('Sun', d)
  let phase = 0.5
  if (sunR) {
    const mLon = Math.atan2(yeq, xe) * 180 / Math.PI
    const sLon = sunR.ra * 15
    phase = (1 - Math.cos(rev(mLon - sLon) * DEG)) / 2
  }
  return { ra, dec, phase }
}

// ── ISS ALT/AZ FROM GEODETIC ──────────────────────────────────
function issToAltAz(issLat: number, issLng: number, issAlt: number, obsLat: number, obsLng: number): { alt: number; az: number } {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const oLat = toRad(obsLat), oLng = toRad(obsLng)
  const iLat = toRad(issLat), iLng = toRad(issLng)
  const iR = R + issAlt * 1000
  const ix = iR * Math.cos(iLat) * Math.cos(iLng)
  const iy = iR * Math.cos(iLat) * Math.sin(iLng)
  const iz = iR * Math.sin(iLat)
  const ox = R * Math.cos(oLat) * Math.cos(oLng)
  const oy = R * Math.cos(oLat) * Math.sin(oLng)
  const oz = R * Math.sin(oLat)
  const dx = ix - ox, dy = iy - oy, dz = iz - oz
  const sLat = Math.sin(oLat), cLat = Math.cos(oLat)
  const sLng = Math.sin(oLng), cLng = Math.cos(oLng)
  const e = -sLng * dx + cLng * dy
  const n = -sLat * cLng * dx - sLat * sLng * dy + cLat * dz
  const u =  cLat * cLng * dx + cLat * sLng * dy + sLat * dz
  const rng = Math.sqrt(e*e + n*n + u*u)
  const alt = Math.asin(u / rng) * 180 / Math.PI
  const az  = rev(Math.atan2(e, n) * 180 / Math.PI)
  return { alt, az }
}

// ── TEMPERATURE HELPERS ────────────────────────────────────────
function tempColor(t: number) {
  if (t >= 25000) return '#a0b8ff'
  if (t >= 10000) return '#c8d8ff'
  if (t >= 7500)  return '#f0f4ff'
  if (t >= 6000)  return '#fff4c0'
  if (t >= 5200)  return '#ffe080'
  if (t >= 3700)  return '#ffa040'
  return '#ff6020'
}
function spectralClass(t: number) {
  if (t >= 25000) return 'O'
  if (t >= 10000) return 'B'
  if (t >= 7500)  return 'A'
  if (t >= 6000)  return 'F'
  if (t >= 5200)  return 'G'
  if (t >= 3700)  return 'K'
  return 'M'
}
function fmtTempShort(t: number) {
  return t >= 10000 ? `${Math.round(t / 1000)}kK` : `${Math.round(t / 100) * 100}K`
}
function fmtTempFull(t: number) {
  return t >= 10000 ? `${(t / 1000).toFixed(1)}k K` : `${t.toLocaleString()} K`
}

// ── STAR CATALOG: [name, RA_h, Dec_°, mag, color, temp_K] ─────
const STARS: [string, number, number, number, string, number][] = [
  ['Sirius',       6.752, -16.72, -1.46, '#a8d8ff',  9940],
  ['Canopus',      6.399, -52.70, -0.74, '#fffbe0',  7350],
  ['Arcturus',    14.261,  19.18, -0.05, '#ffcc88',  4290],
  ['Vega',        18.615,  38.78,  0.03, '#cce0ff',  9602],
  ['Capella',      5.278,  45.99,  0.08, '#ffe8a0',  5000],
  ['Rigel',        5.243,  -8.20,  0.18, '#cce8ff', 12100],
  ['Procyon',      7.655,   5.22,  0.40, '#fff8e0',  6530],
  ['Betelgeuse',   5.919,   7.41,  0.45, '#ffaa66',  3500],
  ['Achernar',     1.629, -57.24,  0.45, '#cce0ff', 15000],
  ['Hadar',       14.066, -60.37,  0.61, '#aaccff', 25000],
  ['Altair',      19.846,   8.87,  0.77, '#fffbe0',  7550],
  ['Deneb',       20.690,  45.28,  1.25, '#cce0ff',  8525],
  ['Antares',     16.490, -26.43,  1.06, '#ff6644',  3400],
  ['Spica',       13.420, -11.16,  0.98, '#cce0ff', 25300],
  ['Fomalhaut',   22.961, -29.62,  1.16, '#fffbe0',  8590],
  ['Pollux',       7.755,  28.03,  1.16, '#ffcc88',  4586],
  ['Castor',       7.577,  31.89,  1.58, '#cce0ff',  8842],
  ['Aldebaran',    4.599,  16.51,  0.87, '#ff9944',  3910],
  ['Regulus',     10.140,  11.97,  1.36, '#cce0ff', 12460],
  ['Adhara',       6.977, -28.97,  1.50, '#cce0ff', 22900],
  ['Acrux',       12.443, -63.10,  0.77, '#cce0ff', 28000],
  ['Gacrux',      12.519, -57.11,  1.59, '#ff8866',  3600],
  ['Shaula',      17.560, -37.10,  1.63, '#cce0ff', 22000],
  ['Mirfak',       3.405,  49.86,  1.80, '#fffbe0',  6350],
  ['Diphda',       0.655, -17.99,  2.04, '#ffcc88',  4797],
  ['Bellatrix',    5.419,   6.35,  1.64, '#aaccff', 22000],
  ['Mintaka',      5.533,  -0.30,  2.23, '#aaccff', 29500],
  ['Alnilam',      5.604,  -1.20,  1.69, '#aaccff', 27000],
  ['Alnitak',      5.679,  -1.94,  1.72, '#aaccff', 29900],
  ['Saiph',        5.796,  -9.67,  2.07, '#aaccff', 26500],
  ['Dubhe',       11.062,  61.75,  1.81, '#ffcc88',  4660],
  ['Merak',       11.031,  56.38,  2.37, '#fffbe0',  9377],
  ['Phecda',      11.897,  53.69,  2.44, '#fffbe0',  9355],
  ['Megrez',      12.257,  57.03,  3.32, '#d0d8ff',  9480],
  ['Alioth',      12.900,  55.96,  1.76, '#fffbe0',  9020],
  ['Mizar',       13.399,  54.93,  2.23, '#fffbe0',  9000],
  ['Alkaid',      13.792,  49.31,  1.85, '#aaccff', 18700],
  ['Schedar',      0.675,  56.54,  2.24, '#ffcc88',  4552],
  ['Caph',         0.153,  59.15,  2.28, '#fffbe0',  7079],
  ['Cih',          0.945,  60.72,  2.47, '#aaccff', 25000],
  ['Ruchbah',      1.430,  60.24,  2.68, '#fffbe0',  8000],
  ['Segin',        1.907,  63.67,  3.38, '#c0c8ff', 16000],
  ['Algieba',     10.332,  19.84,  2.61, '#ffcc88',  4470],
  ['Zosma',       11.235,  20.52,  2.56, '#fffbe0',  8296],
  ['Denebola',    11.817,  14.57,  2.14, '#aaccff',  8500],
  ['Elnath',       5.438,  28.61,  1.68, '#aaccff', 13824],
  ['Alhena',       6.629,  16.40,  1.93, '#aaccff',  9260],
  ['Lesath',      17.513, -37.30,  2.70, '#aaccff', 22000],
  ['Sargas',      17.622, -43.00,  1.87, '#fffbe0',  7268],
  ['Alphard',      9.460,  -8.66,  1.99, '#ff9944',  4050],
  ['Hamal',        2.119,  23.46,  2.01, '#ff9944',  4480],
  ['Rasalhague',  17.583,  12.56,  2.08, '#fff8e0',  8500],
  ['Algol',        3.136,  40.96,  2.12, '#c8e0ff', 13000],
  ['Sadr',        20.370,  40.26,  2.23, '#fff8e0',  6900],
  ['Zubenelgenubi',14.849,-16.04,  2.75, '#c8e0ff',  8500],
  ['Izar',        14.750,  27.07,  2.40, '#ffa050',  4550],
  ['Enif',        21.736,   9.88,  2.38, '#ffa050',  4460],
  ['Alpheratz',    0.140,  29.09,  2.07, '#c0d0ff', 13800],
  ['Mirach',       1.162,  35.62,  2.07, '#ff8844',  3840],
  ['Almach',       2.065,  42.33,  2.10, '#ff8060',  4250],
  ['Markab',      23.079,  15.21,  2.49, '#c8d8ff', 10100],
  ['Scheat',      23.063,  28.08,  2.44, '#ff8844',  3700],
  ['Kaus Australis',18.403,-34.38,1.79, '#c0d0ff',  9960],
  ['Nunki',       18.922, -26.30,  2.02, '#aaccff', 20700],
  ['Kaus Media',  18.350, -29.83,  2.70, '#c8d8ff',  8000],
  ['Kaus Borealis',18.466,-21.06,  2.81, '#fff8e0',  6590],
  ['Tarazed',     19.771,  10.61,  2.72, '#ff8844',  4210],
  ['Albireo',     19.512,  27.96,  3.08, '#ffaa44',  4270],
  ['Porrima',     12.694,  -1.45,  2.74, '#f0f4ff',  7100],
  ['Dschubba',   15.993, -22.62,  2.29, '#c8d8ff', 28000],
  ['Graffias',   15.934, -19.80,  2.62, '#c0d0ff', 26000],
  ['Wezen',       7.140, -26.39,  1.84, '#ffee88',  5818],
  ['Mirzam',      6.378, -17.96,  1.98, '#aac0ff', 23000],
  ['Muphrid',    13.912,  18.40,  2.68, '#ffe080',  6100],
  ['Sabik',      17.173, -15.72,  2.43, '#f0f4ff',  8900],
  ['Yed Prior',  16.235,  -4.69,  2.73, '#ff8844',  4220],
  ['Gienah',     12.267, -17.54,  2.59, '#c8d8ff', 10400],
  ['Eltanin',    17.944,  51.49,  2.24, '#ff8844',  3930],
  ['Atik',        3.859,  31.88,  2.84, '#c0d0ff', 26000],
  ['Gomeisa',     7.452,   8.29,  2.89, '#c8d8ff', 11500],
  ['Alphecca',   15.578,  26.71,  2.23, '#f0f4ff',  9700],
  ['Zubeneschamali',15.070, -9.38,2.61, '#a8c0ff', 11500],
  ['Nusakan',    15.549,  29.11,  3.66, '#fff0c0',  7500],
]

// ── CONSTELLATION LINES ────────────────────────────────────────
type ConLine = { a: number; b: number; name: string }
const CONSTELLATION_LINES: ConLine[] = [
  { a: 7,  b: 25, name: 'Orion' },
  { a: 7,  b: 28, name: 'Orion' },
  { a: 25, b: 26, name: 'Orion' },
  { a: 26, b: 27, name: 'Orion' },
  { a: 27, b: 28, name: 'Orion' },
  { a: 26, b: 5,  name: 'Orion' },
  { a: 28, b: 29, name: 'Orion' },
  { a: 30, b: 31, name: 'Ursa Major' },
  { a: 31, b: 32, name: 'Ursa Major' },
  { a: 32, b: 33, name: 'Ursa Major' },
  { a: 33, b: 30, name: 'Ursa Major' },
  { a: 33, b: 34, name: 'Ursa Major' },
  { a: 34, b: 35, name: 'Ursa Major' },
  { a: 35, b: 36, name: 'Ursa Major' },
  { a: 38, b: 37, name: 'Cassiopeia' },
  { a: 37, b: 39, name: 'Cassiopeia' },
  { a: 39, b: 40, name: 'Cassiopeia' },
  { a: 40, b: 41, name: 'Cassiopeia' },
  { a: 3,  b: 10, name: 'Summer △' },
  { a: 3,  b: 11, name: 'Summer △' },
  { a: 10, b: 11, name: 'Summer △' },
  { a: 18, b: 42, name: 'Leo' },
  { a: 42, b: 43, name: 'Leo' },
  { a: 43, b: 44, name: 'Leo' },
  { a: 15, b: 16, name: 'Gemini' },
  { a: 15, b: 45, name: 'Gemini' },
  { a: 16, b: 46, name: 'Gemini' },
  { a: 17, b: 45, name: 'Taurus' },
  { a: 22, b: 47, name: 'Scorpius' },
  { a: 22, b: 48, name: 'Scorpius' },
  { a: 57, b: 58, name: 'Andromeda' },
  { a: 58, b: 59, name: 'Andromeda' },
  { a: 11, b: 53, name: 'Cygnus' },
  { a: 53, b: 67, name: 'Cygnus' },
  { a: 62, b: 64, name: 'Sagittarius' },
  { a: 64, b: 63, name: 'Sagittarius' },
  { a: 64, b: 65, name: 'Sagittarius' },
  { a: 62, b: 63, name: 'Sagittarius' },
  { a: 57, b: 60, name: 'Pegasus' },
  { a: 60, b: 61, name: 'Pegasus' },
  // Boötes
  { a: 1,  b: 75, name: 'Boötes' },
  { a: 75, b: 77, name: 'Boötes' },
  { a: 77, b: 74, name: 'Boötes' },
  { a: 74, b: 76, name: 'Boötes' },
  { a: 76, b: 1,  name: 'Boötes' },
  // Canis Major
  { a: 8,  b: 70, name: 'Canis Major' },
  { a: 70, b: 72, name: 'Canis Major' },
  { a: 72, b: 71, name: 'Canis Major' },
  // Canis Minor
  { a: 73, b: 14, name: 'Canis Minor' },
  // Scorpius (extended)
  { a: 69, b: 70, name: 'Scorpius' },
  { a: 47, b: 48, name: 'Scorpius' },
  { a: 48, b: 22, name: 'Scorpius' },
  // Ophiuchus
  { a: 76, b: 79, name: 'Ophiuchus' },
  { a: 79, b: 78, name: 'Ophiuchus' },
  // Corona Borealis
  { a: 80, b: 81, name: 'Corona Borealis' },
  { a: 81, b: 82, name: 'Corona Borealis' },
  // Auriga
  { a: 4,  b: 78, name: 'Auriga' },
  { a: 78, b: 17, name: 'Auriga' },
  // Virgo
  { a: 68, b: 75, name: 'Virgo' },
  { a: 75, b: 82, name: 'Virgo' },
  // Libra
  { a: 81, b: 80, name: 'Libra' },
  { a: 80, b: 82, name: 'Libra' },
]

// ── DEEP-SKY OBJECTS ──────────────────────────────────────────
interface DSO {
  name: string
  ra: number
  dec: number
  mag: number
  type: 'galaxy' | 'nebula' | 'cluster' | 'globular'
}

const DSOS: DSO[] = [
  { name: 'M31 Andromeda',    ra: 0.712,  dec:  41.27, mag: 3.4, type: 'galaxy'   },
  { name: 'M42 Orion Nebula', ra: 5.588,  dec:  -5.39, mag: 4.0, type: 'nebula'   },
  { name: 'M45 Pleiades',     ra: 3.783,  dec:  24.12, mag: 1.2, type: 'cluster'  },
  { name: 'M13 Hercules',     ra: 16.694, dec:  36.46, mag: 5.8, type: 'globular' },
  { name: 'M44 Beehive',      ra: 8.667,  dec:  19.67, mag: 3.7, type: 'cluster'  },
  { name: 'M22',              ra: 18.606, dec: -23.90, mag: 5.1, type: 'globular' },
  { name: 'M8 Lagoon',        ra: 18.060, dec: -24.38, mag: 5.8, type: 'nebula'   },
  { name: 'M7',               ra: 17.900, dec: -34.82, mag: 3.3, type: 'cluster'  },
  { name: 'M57 Ring',         ra: 18.893, dec:  33.03, mag: 8.8, type: 'nebula'   },
  { name: 'M27 Dumbbell',     ra: 19.993, dec:  22.72, mag: 7.4, type: 'nebula'   },
  { name: 'M35',              ra: 6.150,  dec:  24.33, mag: 5.1, type: 'cluster'  },
  { name: 'M41',              ra: 6.767,  dec: -20.75, mag: 4.5, type: 'cluster'  },
]

const DSO_COLOR: Record<DSO['type'], string> = {
  galaxy:   '#ff99cc',
  nebula:   '#55ccff',
  cluster:  '#88ff66',
  globular: '#ffcc44',
}

const DSO_LABEL: Record<DSO['type'], string> = {
  galaxy:   'Galaxy',
  nebula:   'Nebula',
  cluster:  'Open Cluster',
  globular: 'Globular Cluster',
}

function drawDSOSymbol(
  ctx: CanvasRenderingContext2D,
  type: DSO['type'],
  x: number, y: number,
  mag: number,
  alpha: number,
) {
  const baseR = Math.max(3, Math.min(9, (10 - mag) * 0.9))
  const col = DSO_COLOR[type]
  ctx.globalAlpha = alpha

  switch (type) {
    case 'galaxy': {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, baseR * 2.4)
      grad.addColorStop(0, col + 'bb')
      grad.addColorStop(0.4, col + '44')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(x, y, baseR * 2.4, baseR * 0.75, 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(x, y, baseR * 2.4, baseR * 0.75, 0.5, 0, Math.PI * 2)
      ctx.strokeStyle = col + '77'
      ctx.lineWidth = 0.8
      ctx.stroke()
      break
    }
    case 'nebula': {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, baseR * 2.2)
      grad.addColorStop(0, col + 'aa')
      grad.addColorStop(0.5, col + '33')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, baseR * 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = col + '99'
      ctx.lineWidth = 0.8
      const cr = baseR * 0.9
      ctx.beginPath()
      ctx.moveTo(x - cr, y); ctx.lineTo(x + cr, y)
      ctx.moveTo(x, y - cr); ctx.lineTo(x, y + cr)
      ctx.stroke()
      break
    }
    case 'cluster': {
      ctx.strokeStyle = col + 'aa'
      ctx.lineWidth = 0.8
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.arc(x, y, baseR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      for (let i = 0; i < 6; i++) {
        const angle = i * 60 * DEG
        ctx.beginPath()
        ctx.arc(x + baseR * 0.5 * Math.cos(angle), y + baseR * 0.5 * Math.sin(angle), 0.9, 0, Math.PI * 2)
        ctx.fillStyle = col + 'cc'
        ctx.fill()
      }
      break
    }
    case 'globular': {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, baseR * 1.7)
      grad.addColorStop(0, col + 'cc')
      grad.addColorStop(0.4, col + '55')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, baseR * 1.7, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = col + '99'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(x, y, baseR, 0, Math.PI * 2)
      ctx.stroke()
      const cr = baseR
      ctx.beginPath()
      ctx.moveTo(x - cr, y); ctx.lineTo(x + cr, y)
      ctx.moveTo(x, y - cr); ctx.lineTo(x, y + cr)
      ctx.stroke()
      break
    }
  }
  ctx.globalAlpha = 1
  ctx.setLineDash([])
}

// ── PLANETS ────────────────────────────────────────────────────
const PLANETS = [
  { name: 'Sun',     symbol: '☀',  color: '#ffee44', glow: '#ffcc00', size: 9 },
  { name: 'Mercury', symbol: '☿',  color: '#c0c0c0', glow: '#909090', size: 5 },
  { name: 'Venus',   symbol: '♀',  color: '#fff4c2', glow: '#ffee88', size: 7 },
  { name: 'Mars',    symbol: '♂',  color: '#ff5533', glow: '#ff2200', size: 6 },
  { name: 'Jupiter', symbol: '♃',  color: '#f5c88a', glow: '#e8a060', size: 9 },
  { name: 'Saturn',  symbol: '♄',  color: '#f0d880', glow: '#d4b840', size: 7 },
  { name: 'Uranus',  symbol: '⛢',  color: '#7de8e8', glow: '#40c0c0', size: 5 },
  { name: 'Neptune', symbol: '♆',  color: '#6680ff', glow: '#4455ff', size: 5 },
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
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(az / 45) % 8]
}

// ── HIT-TEST ──────────────────────────────────────────────────
interface HitItem {
  name: string
  x: number; y: number
  temp?: number
  mag?: number
  alt: number
  color: string
  isPlanet?: boolean
  symbol?: string
  isDSO?: boolean
  dsoType?: DSO['type']
}

interface Tooltip extends HitItem {
  sx: number; sy: number
  flipLeft: boolean
}

const MW_LAYERS: [number, number, number][] = [
  [0,    11, 0.17],
  [6,    7,  0.10],
  [-6,   7,  0.10],
  [14,   4,  0.05],
  [-14,  4,  0.05],
  [24,   2,  0.025],
  [-24,  2,  0.025],
]

const SPECTRAL_LEGEND = [
  { cls: 'O', range: '>25k K',    color: '#a0b8ff' },
  { cls: 'B', range: '10–25k K',  color: '#c8d8ff' },
  { cls: 'A', range: '7.5–10k K', color: '#f0f4ff' },
  { cls: 'F', range: '6–7.5k K',  color: '#fff4c0' },
  { cls: 'G', range: '5.2–6k K',  color: '#ffe080' },
  { cls: 'K', range: '3.7–5.2k K',color: '#ffa040' },
  { cls: 'M', range: '<3.7k K',   color: '#ff6020' },
]

export default function StarMap() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const hitRef      = useRef<HitItem[]>([])
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loc, setLoc]         = useState({ lat: 31.77, lng: 35.21 })
  const [city, setCity]       = useState('Jerusalem')
  const [time, setTime]       = useState(new Date())
  const [timeOffsetMin, setTimeOffsetMin] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [prevX, setPrevX]     = useState(0)

  const [showPlanets, setShowPlanets]               = useState(true)
  const [showConstellations, setShowConstellations] = useState(true)
  const [showMilkyWay, setShowMilkyWay]             = useState(true)
  const [showDSOs, setShowDSOs]                     = useState(true)
  const [showLabels, setShowLabels]                 = useState(true)
  const [showTemp, setShowTemp]                     = useState(false)
  const [showGrid, setShowGrid]                     = useState(false)

  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [issPos, setIssPos] = useState<{ lat: number; lng: number; alt: number } | null>(null)

  // Hipparcos catalog [ra, dec, mag, temp, name?]
  type HipStar = [number, number, number, number, string?]
  const [hipStars, setHipStars] = useState<HipStar[]>([])
  // NGC/IC catalog [ra, dec, mag, type, name]
  type NgcObj = [number, number, number, DSO['type'], string]
  const [ngcObjs, setNgcObjs] = useState<NgcObj[]>([])

  // Effective time = now + user offset
  const effectiveTime = new Date(time.getTime() + timeOffsetMin * 60_000)
  const jd = julianDate(effectiveTime)
  const d  = jd - 2451543.5

  const planetPositions = PLANETS.map(p => {
    const radec = computeRADec(p.name, d)
    if (!radec) return null
    const lst = localSiderealTime(effectiveTime, loc.lng)
    const hz  = toHorizon(radec.ra, radec.dec, lst, loc.lat)
    return { ...p, ...hz }
  }).filter(Boolean) as (typeof PLANETS[0] & { alt: number; az: number })[]

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    const r  = Math.min(W, H) / 2 - 24

    hitRef.current = []
    ctx.clearRect(0, 0, W, H)

    // Sky background
    const skyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    skyGrad.addColorStop(0,   '#0d1235')
    skyGrad.addColorStop(0.6, '#07091a')
    skyGrad.addColorStop(1,   '#020408')
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = skyGrad; ctx.fill()

    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()

    // Grid / altitude rings
    if (showGrid) {
      for (const alt of [15, 30, 45, 60, 75]) {
        ctx.beginPath()
        ctx.arc(cx, cy, r * (90 - alt) / 90, 0, Math.PI * 2)
        ctx.strokeStyle = alt % 30 === 0 ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 1; ctx.stroke()
        if (alt % 30 === 0) {
          ctx.font = '9px system-ui'; ctx.fillStyle = 'rgba(99,102,241,0.5)'; ctx.textAlign = 'left'
          ctx.fillText(`${alt}°`, cx + r * (90 - alt) / 90 + 3, cy - 2)
        }
      }
      for (let az = 0; az < 360; az += 45) {
        const { x, y } = project(0, (az + rotation + 360) % 360, cx, cy, r, 0)
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y)
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.stroke()
      }
    } else {
      for (const alt of [30, 60]) {
        ctx.beginPath(); ctx.arc(cx, cy, r * (90 - alt) / 90, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.stroke()
      }
    }

    // Horizon ring
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(99,102,241,0.4)'; ctx.lineWidth = 1.5; ctx.stroke()

    // Background micro-stars
    for (let i = 0; i < 200; i++) {
      const angle  = i * 137.508 * DEG
      const radius = r * Math.sqrt((i * 0.618) % 1) * 0.97
      const sx = cx + radius * Math.cos(angle), sy = cy + radius * Math.sin(angle)
      ctx.beginPath(); ctx.arc(sx, sy, 0.3 + (i % 3) * 0.2, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(180,190,255,${0.06 + (i % 7) * 0.025})`; ctx.fill()
    }

    const lst = localSiderealTime(effectiveTime, loc.lng)

    // ── Milky Way band ──
    if (showMilkyWay) {
      for (const [b, lw, baseAlpha] of MW_LAYERS) {
        ctx.beginPath()
        let started = false
        for (let li = 0; li <= 108; li++) {
          const l = (li / 108) * 360
          const { ra, dec } = galToEquatorial(l, b)
          const hz = toHorizon(ra, dec, lst, loc.lat)
          const pt = project(hz.alt, (hz.az + rotation) % 360, cx, cy, r, 0)
          const density = 0.55 + 0.35 * Math.cos(l * DEG) + 0.10 * Math.cos(2 * l * DEG)
          const alpha = baseAlpha * Math.max(0.3, density)
          if (!started) {
            ctx.moveTo(pt.x, pt.y); started = true
          } else {
            ctx.lineTo(pt.x, pt.y)
          }
          if (li % 10 === 0 && li > 0 && started) {
            ctx.strokeStyle = `rgba(170,190,235,${alpha})`
            ctx.lineWidth = lw
            ctx.lineJoin = 'round'
            ctx.stroke()
            ctx.beginPath(); ctx.moveTo(pt.x, pt.y)
          }
        }
        ctx.strokeStyle = `rgba(170,190,235,${baseAlpha * 0.7})`
        ctx.lineWidth = lw
        ctx.stroke()
      }
    }

    // ── Deep-Sky Objects (NGC/IC catalog + fallback built-in) ──
    if (showDSOs) {
      const dsoSource = ngcObjs.length > 0
        ? ngcObjs.map(([ra, dec, mag, type, name]) => ({ ra, dec, mag, type, name }))
        : DSOS
      dsoSource.forEach(dso => {
        const { alt, az } = toHorizon(dso.ra, dso.dec, lst, loc.lat)
        if (alt < -3) return
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return
        const a = extinction(alt) * 0.85
        drawDSOSymbol(ctx, dso.type, x, y, dso.mag, a)
        const labelMagLimit = ngcObjs.length > 0 ? 9.5 : 7.5
        if (showLabels && alt > 4 && dso.mag < labelMagLimit) {
          const col = DSO_COLOR[dso.type]
          ctx.font = '8px \'Space Grotesk\', system-ui'
          ctx.textAlign = 'left'
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fillText(dso.name, x + 11, y + 4)
          ctx.fillStyle = col + 'cc'
          ctx.fillText(dso.name, x + 10, y + 3)
        }
        if (dso.mag < 11) {
          hitRef.current.push({ name: dso.name, x, y, mag: dso.mag, alt, color: DSO_COLOR[dso.type], isDSO: true, dsoType: dso.type })
        }
      })
    }

    // ── Constellation lines + labels ──
    if (showConstellations) {
      CONSTELLATION_LINES.forEach(({ a, b }) => {
        const sa = STARS[a], sb = STARS[b]
        if (!sa || !sb) return
        const ha = toHorizon(sa[1], sa[2], lst, loc.lat)
        const hb = toHorizon(sb[1], sb[2], lst, loc.lat)
        if (ha.alt < -3 || hb.alt < -3) return
        const pa = project(ha.alt, (ha.az + rotation) % 360, cx, cy, r, 0)
        const pb = project(hb.alt, (hb.az + rotation) % 360, cx, cy, r, 0)
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y)
        ctx.strokeStyle = 'rgba(120,135,255,0.45)'; ctx.lineWidth = 1.2; ctx.stroke()
      })

      if (showLabels) {
        // Compute centroid per constellation name
        const conMap = new Map<string, { sx: number; sy: number; n: number; minAlt: number }>()
        CONSTELLATION_LINES.forEach(({ a, b, name }) => {
          for (const idx of [a, b]) {
            const s = STARS[idx]; if (!s) continue
            const hz = toHorizon(s[1], s[2], lst, loc.lat)
            if (hz.alt < 3) continue
            const pt = project(hz.alt, (hz.az + rotation) % 360, cx, cy, r, 0)
            const cur = conMap.get(name) ?? { sx: 0, sy: 0, n: 0, minAlt: 90 }
            conMap.set(name, { sx: cur.sx + pt.x, sy: cur.sy + pt.y, n: cur.n + 1, minAlt: Math.min(cur.minAlt, hz.alt) })
          }
        })
        ctx.font = 'italic 9px \'Space Grotesk\', system-ui'
        ctx.textAlign = 'center'
        conMap.forEach(({ sx, sy, n }, name) => {
          if (n < 2) return
          const lx = sx / n, ly = sy / n
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fillText(name, lx + 0.5, ly + 0.5)
          ctx.fillStyle = 'rgba(140,150,255,0.65)'
          ctx.fillText(name, lx, ly)
        })
        ctx.textAlign = 'left'
      }
    }

    // ── Stars ──
    STARS.forEach(([name, ra, dec, mag, color, temp]) => {
      const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
      if (alt < -5) return
      const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
      if (x < -12 || x > W + 12 || y < -12 || y > H + 12) return

      const ext    = extinction(alt)
      const starR  = Math.max(1.8, (6.2 - mag) * 1.2)
      const glowR  = starR * (mag < 0 ? 11 : mag < 1 ? 8 : 5.5)

      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
      glow.addColorStop(0, color + 'cc'); glow.addColorStop(0.4, color + '44'); glow.addColorStop(1, 'transparent')
      ctx.globalAlpha = ext * 0.75
      ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2)
      ctx.fillStyle = glow; ctx.fill()

      ctx.globalAlpha = ext
      ctx.beginPath(); ctx.arc(x, y, starR, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.globalAlpha = 1

      const wantLabel = showLabels && mag < 1.7 && alt > 2
      const wantTemp  = showTemp  && mag < 2.0 && alt > 2

      if (wantLabel || wantTemp) {
        let label = ''
        if (wantLabel && wantTemp) label = `${name} · ${spectralClass(temp)} ${fmtTempShort(temp)}`
        else if (wantLabel)        label = name
        else                       label = `${spectralClass(temp)} ${fmtTempShort(temp)}`

        const tc = wantTemp ? tempColor(temp) : 'rgba(200,212,255,0.9)'
        ctx.font = `${mag < 0.5 ? 11 : 9}px 'Space Grotesk', system-ui`
        ctx.textAlign = 'left'
        const lx = x + starR + 4, ly = y + 3
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(label, lx + 1, ly + 1)
        ctx.fillStyle = tc;               ctx.fillText(label, lx, ly)
      }

      if (alt > -5) hitRef.current.push({ name, x, y, temp, mag, alt, color })
    })

    // ── Hipparcos catalog (faint stars up to mag 6) ──
    if (hipStars.length > 0) {
      hipStars.forEach(([ra, dec, mag, temp, name]) => {
        // Skip stars already drawn by the bright STARS array (mag < 2.5)
        if (mag < 2.5) return
        const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
        if (alt < -3) return
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
        if (x < -8 || x > W + 8 || y < -8 || y > H + 8) return
        const ext = extinction(alt)
        const col = showTemp ? tempColor(temp) : tempColor(temp)
        const starR = Math.max(0.6, (5.5 - mag) * 0.9)
        if (mag < 4.5) {
          const glowR = starR * 4
          const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
          glow.addColorStop(0, col + '88'); glow.addColorStop(1, 'transparent')
          ctx.globalAlpha = ext * 0.5
          ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2)
          ctx.fillStyle = glow; ctx.fill()
        }
        ctx.globalAlpha = ext * Math.max(0.3, 1 - (mag - 2.5) / 4)
        ctx.beginPath(); ctx.arc(x, y, starR, 0, Math.PI * 2)
        ctx.fillStyle = col; ctx.fill()
        ctx.globalAlpha = 1
        if (name && showLabels && mag < 3.5 && alt > 3) {
          ctx.font = '8px \'Space Grotesk\', system-ui'
          ctx.textAlign = 'left'
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(name, x + starR + 4, y + 3)
          ctx.fillStyle = col + 'cc';         ctx.fillText(name, x + starR + 3, y + 2)
        }
        if (mag < 5) hitRef.current.push({ name: name ?? `HIP star (mag ${mag})`, x, y, temp, mag, alt, color: col })
      })
    }

    // ── Planets ──
    if (showPlanets) {
      PLANETS.forEach(planet => {
        const radec = computeRADec(planet.name, d)
        if (!radec) return
        const { alt, az } = toHorizon(radec.ra, radec.dec, lst, loc.lat)
        if (alt < -5) return
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
        if (x < -12 || x > W + 12 || y < -12 || y > H + 12) return

        const ext = extinction(alt)
        ctx.globalAlpha = ext < 0.3 ? 0.28 : ext

        ctx.beginPath(); ctx.arc(x, y, planet.size + 3.5, 0, Math.PI * 2)
        ctx.strokeStyle = planet.color + '55'; ctx.lineWidth = 1.5; ctx.stroke()

        const glowR = planet.name === 'Sun' ? planet.size * 5.5 : planet.size * 4
        const glow  = ctx.createRadialGradient(x, y, 0, x, y, glowR)
        glow.addColorStop(0, planet.glow + 'dd'); glow.addColorStop(0.5, planet.glow + '55'); glow.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill()

        ctx.beginPath(); ctx.arc(x, y, planet.size, 0, Math.PI * 2)
        ctx.fillStyle = planet.color; ctx.fill()

        if (planet.name === 'Saturn') {
          ctx.beginPath()
          ctx.ellipse(x, y, planet.size * 2.0, planet.size * 0.6, 0.35, 0, Math.PI * 2)
          ctx.strokeStyle = planet.color + 'bb'; ctx.lineWidth = 2; ctx.stroke()
        }

        ctx.font = 'bold 10px \'Space Grotesk\', system-ui'; ctx.textAlign = 'left'
        const lx = x + planet.size + 6, ly = y + 4
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(`${planet.symbol} ${planet.name}`, lx + 1, ly + 1)
        ctx.fillStyle = planet.color;       ctx.fillText(`${planet.symbol} ${planet.name}`, lx, ly)

        ctx.globalAlpha = 1
        hitRef.current.push({ name: planet.name, x, y, alt, color: planet.color, isPlanet: true, symbol: planet.symbol })
      })
    }

    // ── Moon ──
    {
      const moon = computeMoon(d)
      const { alt, az } = toHorizon(moon.ra, moon.dec, lst, loc.lat)
      if (alt > -5) {
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
        const ext  = extinction(alt)
        const mR   = 7
        const alpha = ext < 0.3 ? 0.28 : ext

        // Moon disc
        ctx.globalAlpha = alpha
        const moonGrad = ctx.createRadialGradient(x - mR * 0.3, y - mR * 0.3, 0, x, y, mR * 1.8)
        moonGrad.addColorStop(0, 'rgba(230,235,255,0.3)')
        moonGrad.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(x, y, mR * 1.8, 0, Math.PI * 2)
        ctx.fillStyle = moonGrad; ctx.fill()

        // Base disc
        ctx.beginPath(); ctx.arc(x, y, mR, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(210,218,255,0.92)'; ctx.fill()

        // Phase shadow overlay
        const phase = moon.phase // 0=new, 0.5=full, 1=new
        const waning = phase > 0.5
        const illum  = waning ? 2 * (1 - phase) : 2 * phase
        ctx.save()
        ctx.beginPath(); ctx.arc(x, y, mR, 0, Math.PI * 2); ctx.clip()
        // Dark half
        ctx.fillStyle = 'rgba(5,8,28,0.88)'
        ctx.beginPath()
        if (phase < 0.5) {
          // Waxing: right side lit
          ctx.arc(x, y, mR, Math.PI / 2, -Math.PI / 2)
          ctx.ellipse(x, y, mR * (1 - illum), mR, 0, -Math.PI / 2, Math.PI / 2)
        } else {
          // Waning: left side lit
          ctx.arc(x, y, mR, -Math.PI / 2, Math.PI / 2)
          ctx.ellipse(x, y, mR * (1 - illum), mR, 0, Math.PI / 2, -Math.PI / 2)
        }
        ctx.fill()
        ctx.restore()

        if (showLabels && alt > 2) {
          ctx.globalAlpha = alpha
          ctx.font = 'bold 9px \'Space Grotesk\', system-ui'
          ctx.textAlign = 'left'
          const pct = Math.round(moon.phase <= 0.5 ? moon.phase * 200 : (1 - moon.phase) * 200)
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(`🌙 Moon ${pct}%`, x + mR + 5, y + 4)
          ctx.fillStyle = 'rgba(200,210,255,0.9)'; ctx.fillText(`🌙 Moon ${pct}%`, x + mR + 4, y + 3)
        }
        ctx.globalAlpha = 1
        hitRef.current.push({ name: `Moon (${Math.round(moon.phase <= 0.5 ? moon.phase * 200 : (1 - moon.phase) * 200)}% lit)`, x, y, alt, color: '#c8d2ff', isPlanet: true, symbol: '🌙' })
      }
    }

    // ── ISS ──
    if (issPos) {
      const { alt, az } = issToAltAz(issPos.lat, issPos.lng, issPos.alt, loc.lat, loc.lng)
      if (alt > 0) {
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
        const issGrad = ctx.createRadialGradient(x, y, 0, x, y, 12)
        issGrad.addColorStop(0, 'rgba(0,255,180,0.6)')
        issGrad.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2)
        ctx.fillStyle = issGrad; ctx.fill()
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#00ffb4'; ctx.fill()
        if (showLabels) {
          ctx.font = 'bold 9px \'Space Grotesk\', system-ui'
          ctx.textAlign = 'left'
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText('🛸 ISS', x + 7, y + 4)
          ctx.fillStyle = '#00ffb4'; ctx.fillText('🛸 ISS', x + 6, y + 3)
        }
        ctx.globalAlpha = 1
        hitRef.current.push({ name: 'ISS', x, y, alt, color: '#00ffb4', isPlanet: true, symbol: '🛸' })
      }
    }

    // ── Search highlight ──
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const match = hitRef.current.find(h => h.name.toLowerCase().includes(q))
      if (match) {
        const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 400)
        ctx.globalAlpha = pulse
        ctx.beginPath(); ctx.arc(match.x, match.y, 18, 0, Math.PI * 2)
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.5; ctx.stroke()
        ctx.globalAlpha = pulse * 0.3
        ctx.beginPath(); ctx.arc(match.x, match.y, 24, 0, Math.PI * 2)
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1; ctx.stroke()
        ctx.globalAlpha = 1
      }
    }

    // Cardinal direction labels
    DIRECTION_LABELS.forEach((label, idx) => {
      const az = idx * 45
      const { x, y } = project(-1, (az + rotation + 360) % 360, cx, cy, r + 16, 0)
      ctx.font = `bold ${idx % 2 === 0 ? 13 : 10}px system-ui`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(130,140,255,0.9)' : 'rgba(99,102,241,0.5)'
      ctx.fillText(label, x, y)
    })

    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill()
    ctx.restore()
  }, [loc, time, timeOffsetMin, rotation, showPlanets, showConstellations, showMilkyWay, showDSOs, showLabels, showTemp, showGrid, d, effectiveTime, searchQuery, issPos, hipStars, ngcObjs])

  const rafRef = useRef<number>(0)
  useEffect(() => {
    if (searchQuery) {
      const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop) }
      rafRef.current = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(rafRef.current)
    } else {
      draw()
    }
  }, [draw, searchQuery])
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

  // Load Hipparcos star catalog
  useEffect(() => {
    fetch('/data/hip_stars.json')
      .then(r => r.json())
      .then(d => setHipStars(d.data))
      .catch(() => {})
  }, [])

  // Load NGC/IC catalog
  useEffect(() => {
    fetch('/data/ngc.json')
      .then(r => r.json())
      .then(d => setNgcObjs(d.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const fetchISS = () => {
      fetch('/api/iss').then(r => r.json()).then(d => {
        if (d?.latitude != null) setIssPos({ lat: +d.latitude, lng: +d.longitude, alt: +(d.altitude ?? 420) })
      }).catch(() => {})
    }
    fetchISS()
    const id = setInterval(fetchISS, 5000)
    return () => clearInterval(id)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging) {
      setRotation(r => r + (e.clientX - prevX) * 0.5)
      setPrevX(e.clientX)
      setTooltip(null)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * 700 / rect.width
    const cy = (e.clientY - rect.top)  * 700 / rect.height

    let best: HitItem | null = null, bestDist = 22
    for (const item of hitRef.current) {
      const dx = item.x - cx, dy = item.y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < bestDist) { bestDist = d; best = item }
    }
    if (best) {
      const sx = best.x * rect.width / 700
      const sy = best.y * rect.height / 700
      setTooltip({ ...best, sx, sy, flipLeft: sx > rect.width - 165 })
    } else {
      setTooltip(null)
    }
  }, [dragging, prevX])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    setDragging(false)
    const ts = touchStartRef.current
    if (!ts) return
    const t = e.changedTouches[0]
    const dx = t.clientX - ts.x, dy = t.clientY - ts.y
    if (Math.sqrt(dx * dx + dy * dy) > 12 || Date.now() - ts.t > 400) return

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = (t.clientX - rect.left) * 480 / rect.width
    const cy = (t.clientY - rect.top)  * 480 / rect.height

    let best: HitItem | null = null, bestDist = 28
    for (const item of hitRef.current) {
      const ddx = item.x - cx, ddy = item.y - cy
      const dd = Math.sqrt(ddx * ddx + ddy * ddy)
      if (dd < bestDist) { bestDist = dd; best = item }
    }
    if (best) {
      const sx = best.x * rect.width / 700
      const sy = best.y * rect.height / 700
      setTooltip({ ...best, sx, sy, flipLeft: sx > rect.width - 165 })
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = setTimeout(() => setTooltip(null), 3000)
    } else {
      setTooltip(null)
    }
    touchStartRef.current = null
  }, [])

  const lst0 = localSiderealTime(effectiveTime, loc.lng)
  const visibleStars   = STARS.filter(s => toHorizon(s[1], s[2], lst0, loc.lat).alt > 0).length
  const visiblePlanets = planetPositions.filter(p => p.alt > 0)

  const fmtOffset = () => {
    if (timeOffsetMin === 0) return null
    const sign = timeOffsetMin > 0 ? '+' : ''
    const hrs  = Math.abs(timeOffsetMin) >= 60 ? `${sign}${(timeOffsetMin / 60).toFixed(1)}h` : `${sign}${timeOffsetMin}m`
    return hrs
  }

  return (
    <div className="space-card p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-box text-2xl">🌌</div>
        <div>
          <h3 className="text-white font-bold text-lg">Tonight's Sky</h3>
          <p className="text-gray-500 text-xs">
            {hipStars.length > 0 ? `${(visibleStars + hipStars.length).toLocaleString()} stars` : `${visibleStars} stars`}
            {ngcObjs.length > 0 && ` · ${ngcObjs.length.toLocaleString()} DSOs`}
            {' · '}{city} · {effectiveTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="ml-auto">
          {timeOffsetMin === 0
            ? <div className="live-badge"><span className="live-dot" />LIVE</div>
            : <span style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 700, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, padding: '2px 8px' }}>
                {fmtOffset()}
              </span>
          }
        </div>
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

      {/* Time slider */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setTimeOffsetMin(0)}
          style={timeOffsetMin === 0
            ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-2.5 py-1 rounded-lg font-semibold transition shrink-0"
        >
          ⏱ Now
        </button>
        <input
          type="range"
          min={-720}
          max={720}
          step={30}
          value={timeOffsetMin}
          onChange={e => setTimeOffsetMin(Number(e.target.value))}
          className="flex-1 min-w-0"
          style={{ accentColor: '#6366f1' }}
          aria-label="Time offset from now"
        />
        <span className="text-xs font-semibold shrink-0 w-20 text-right" style={{ color: timeOffsetMin === 0 ? '#34d399' : '#c4b5fd' }}>
          {effectiveTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          {timeOffsetMin !== 0 && <span className="text-indigo-400 ml-1">({fmtOffset()})</span>}
        </span>
      </div>

      {/* Toggle controls */}
      <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Map display options">
        {([
          { key: 'planets',        label: '🪐 Planets',       val: showPlanets,        set: setShowPlanets },
          { key: 'constellations', label: '✦ Constellations', val: showConstellations,  set: setShowConstellations },
          { key: 'milkyway',       label: '🌠 Milky Way',     val: showMilkyWay,        set: setShowMilkyWay },
          { key: 'dsos',           label: '🔭 Deep Sky',      val: showDSOs,            set: setShowDSOs },
          { key: 'labels',         label: '🏷 Labels',         val: showLabels,         set: setShowLabels },
          { key: 'temp',           label: '🌡 Temperature',    val: showTemp,           set: setShowTemp },
          { key: 'grid',           label: '⊕ Grid',            val: showGrid,           set: setShowGrid },
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

      {/* Temperature legend */}
      {showTemp && (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 justify-center mb-3 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          aria-label="Stellar spectral class temperature legend"
        >
          {SPECTRAL_LEGEND.map(({ cls, range, color }) => (
            <div key={cls} className="flex items-center gap-1.5">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />
              <span style={{ color, fontSize: 11, fontWeight: 700 }}>{cls}</span>
              <span style={{ color: '#4b5563', fontSize: 10 }}>{range}</span>
            </div>
          ))}
        </div>
      )}

      {/* DSO legend */}
      {showDSOs && (
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 justify-center mb-3 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          aria-label="Deep-sky object type legend"
        >
          {(Object.entries(DSO_LABEL) as [DSO['type'], string][]).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div style={{
                width: type === 'galaxy' ? 14 : 9,
                height: type === 'galaxy' ? 6 : 9,
                borderRadius: type === 'galaxy' ? '50%' : '50%',
                background: DSO_COLOR[type] + '44',
                border: `1px solid ${DSO_COLOR[type]}99`,
                transform: type === 'galaxy' ? 'rotate(-20deg) scaleX(2)' : undefined,
                borderStyle: type === 'cluster' ? 'dashed' : 'solid',
              }} />
              <span style={{ color: '#4b5563', fontSize: 10 }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#6b7280', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder="Search star, planet or DSO…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '6px 10px 6px 30px',
              color: '#e2e8f0',
              fontSize: 12,
              outline: 'none',
            }}
            aria-label="Search star map"
          />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ color: '#6b7280', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {/* Canvas + tooltip overlay */}
      <div className="flex justify-center mb-4 relative">
        <canvas
          ref={canvasRef}
          width={700}
          height={700}
          aria-label="Interactive star map — hover or tap stars/planets/DSOs for details"
          className="rounded-full cursor-crosshair touch-none"
          style={{ width: '100%', maxWidth: 660, aspectRatio: '1/1' }}
          onMouseDown={e => { setDragging(true); setPrevX(e.clientX) }}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => { setDragging(false); setTooltip(null) }}
          onTouchStart={e => {
            setDragging(true)
            setPrevX(e.touches[0].clientX)
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
          }}
          onTouchMove={e => {
            if (!dragging) return
            e.preventDefault()
            setRotation(r => r + (e.touches[0].clientX - prevX) * 0.5)
            setPrevX(e.touches[0].clientX)
          }}
          onTouchEnd={handleTouchEnd}
        />

        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: tooltip.flipLeft ? tooltip.sx - 166 : tooltip.sx + 12,
              top:  Math.max(4, tooltip.sy - 10),
              background: 'rgba(7,9,22,0.97)',
              border: `1px solid ${tooltip.color}55`,
              borderRadius: 10,
              padding: '9px 13px',
              pointerEvents: 'none',
              zIndex: 20,
              minWidth: 152,
              boxShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 10px ${tooltip.color}22`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {tooltip.symbol && <span style={{ color: tooltip.color, fontSize: 16, lineHeight: 1 }}>{tooltip.symbol}</span>}
              <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>{tooltip.name}</span>
            </div>
            {tooltip.isDSO && tooltip.dsoType && (
              <div style={{ color: tooltip.color, fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                {DSO_LABEL[tooltip.dsoType]}
              </div>
            )}
            {tooltip.temp !== undefined && (
              <div style={{ color: tempColor(tooltip.temp), fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                {spectralClass(tooltip.temp)}-type · {fmtTempFull(tooltip.temp)}
              </div>
            )}
            {tooltip.mag !== undefined && (
              <div style={{ color: '#6b7280', fontSize: 10 }}>Magnitude {tooltip.mag.toFixed(2)}</div>
            )}
            <div style={{ color: tooltip.alt > 0 ? '#34d399' : '#6b7280', fontSize: 10, marginTop: 1 }}>
              {tooltip.alt > 0 ? `${Math.round(tooltip.alt)}° above horizon` : 'Below horizon'}
            </div>
          </div>
        )}
      </div>

      {/* Planet visibility panel */}
      {showPlanets && (
        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 14, padding: '12px 16px' }}>
          <p className="text-xs font-bold text-indigo-300 mb-2 tracking-wide uppercase">Planet Positions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {planetPositions.map(p => (
              <div key={p.name} className="flex items-center gap-2">
                <span style={{ color: p.color, fontSize: 15, lineHeight: 1 }}>{p.symbol}</span>
                <div>
                  <span className="text-xs font-semibold" style={{ color: p.alt > 0 ? '#e2e8f0' : '#4b5563' }}>{p.name}</span>
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
                ? `${visiblePlanets[0].symbol} ${visiblePlanets[0].name} is visible`
                : `${visiblePlanets.map(p => `${p.symbol} ${p.name}`).join(', ')} are visible`}
              {timeOffsetMin !== 0 ? ` at ${effectiveTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ' tonight'}
            </p>
          )}
        </div>
      )}

      <p className="text-gray-700 text-xs text-center mt-3">
        Drag to rotate · Hover/tap for details · Slider to travel in time · Zenith at center
      </p>
    </div>
  )
}
