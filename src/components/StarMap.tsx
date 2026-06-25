import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'

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

// ── PLANET PHASE (illuminated fraction 0-1) ───────────────────
function computePlanetPhase(name: string, d: number): number {
  const el = getOrbElems(d, name)
  if (!el) return 1
  const pv = helioXYZ(el)
  const ev = earthXYZ(d)
  const ex = pv.x - ev.x, ey = pv.y - ev.y, ez = pv.z - ev.z
  const dEP = Math.sqrt(ex*ex + ey*ey + ez*ez)
  const dSP = Math.sqrt(pv.x*pv.x + pv.y*pv.y + pv.z*pv.z)
  const dES = Math.sqrt(ev.x*ev.x + ev.y*ev.y + ev.z*ev.z)
  const cosA = (dEP*dEP + dSP*dSP - dES*dES) / (2 * dEP * dSP)
  return (1 + Math.cos(Math.acos(Math.max(-1, Math.min(1, cosA))))) / 2
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

// ── EXTENDED CONSTELLATION LINES (RA/Dec coords — all 88 IAU) ─
type ConLineCoord = { ra1: number; dec1: number; ra2: number; dec2: number; name: string }
const EXTRA_CON_LINES: ConLineCoord[] = [
  // Ursa Minor
  { ra1: 2.530, dec1: 89.26, ra2: 17.536, dec2: 86.59, name:'Ursa Minor' },
  { ra1: 17.536, dec1: 86.59, ra2: 16.766, dec2: 82.04, name:'Ursa Minor' },
  { ra1: 16.766, dec1: 82.04, ra2: 15.734, dec2: 77.79, name:'Ursa Minor' },
  { ra1: 15.734, dec1: 77.79, ra2: 14.845, dec2: 74.16, name:'Ursa Minor' },
  { ra1: 15.734, dec1: 77.79, ra2: 16.292, dec2: 75.75, name:'Ursa Minor' },
  { ra1: 16.292, dec1: 75.75, ra2: 15.345, dec2: 71.83, name:'Ursa Minor' },
  // Cepheus
  { ra1: 21.310, dec1: 62.59, ra2: 21.478, dec2: 70.56, name:'Cepheus' },
  { ra1: 21.478, dec1: 70.56, ra2: 23.655, dec2: 77.63, name:'Cepheus' },
  { ra1: 21.310, dec1: 62.59, ra2: 22.493, dec2: 58.41, name:'Cepheus' },
  { ra1: 22.493, dec1: 58.41, ra2: 22.828, dec2: 66.20, name:'Cepheus' },
  { ra1: 22.828, dec1: 66.20, ra2: 23.655, dec2: 77.63, name:'Cepheus' },
  { ra1: 22.828, dec1: 66.20, ra2: 21.478, dec2: 70.56, name:'Cepheus' },
  // Draco
  { ra1: 17.507, dec1: 52.30, ra2: 17.944, dec2: 51.49, name:'Draco' },
  { ra1: 17.944, dec1: 51.49, ra2: 17.892, dec2: 56.87, name:'Draco' },
  { ra1: 17.892, dec1: 56.87, ra2: 17.507, dec2: 52.30, name:'Draco' },
  { ra1: 17.507, dec1: 52.30, ra2: 17.144, dec2: 65.71, name:'Draco' },
  { ra1: 17.144, dec1: 65.71, ra2: 16.400, dec2: 61.51, name:'Draco' },
  { ra1: 16.400, dec1: 61.51, ra2: 14.073, dec2: 64.38, name:'Draco' },
  { ra1: 14.073, dec1: 64.38, ra2: 12.558, dec2: 69.79, name:'Draco' },
  { ra1: 12.558, dec1: 69.79, ra2: 11.523, dec2: 69.33, name:'Draco' },
  // Lyra
  { ra1: 18.615, dec1: 38.78, ra2: 18.834, dec2: 33.36, name:'Lyra' },
  { ra1: 18.615, dec1: 38.78, ra2: 18.982, dec2: 32.69, name:'Lyra' },
  { ra1: 18.834, dec1: 33.36, ra2: 18.982, dec2: 32.69, name:'Lyra' },
  // Cygnus (Northern Cross)
  { ra1: 20.370, dec1: 40.26, ra2: 20.690, dec2: 45.28, name:'Cygnus' },
  { ra1: 20.690, dec1: 45.28, ra2: 21.217, dec2: 36.74, name:'Cygnus' },
  { ra1: 21.217, dec1: 36.74, ra2: 21.736, dec2: 28.95, name:'Cygnus' },
  { ra1: 19.495, dec1: 27.96, ra2: 21.217, dec2: 36.74, name:'Cygnus' },
  { ra1: 21.217, dec1: 36.74, ra2: 22.467, dec2: 49.17, name:'Cygnus' },
  // Aquila
  { ra1: 19.846, dec1: 8.87, ra2: 19.771, dec2: 10.61, name:'Aquila' },
  { ra1: 19.846, dec1: 8.87, ra2: 19.922, dec2: 6.41, name:'Aquila' },
  { ra1: 19.771, dec1: 10.61, ra2: 19.104, dec2: 13.86, name:'Aquila' },
  { ra1: 19.922, dec1: 6.41, ra2: 20.188, dec2: -0.82, name:'Aquila' },
  // Delphinus
  { ra1: 20.660, dec1: 15.91, ra2: 20.626, dec2: 14.60, name:'Delphinus' },
  { ra1: 20.626, dec1: 14.60, ra2: 20.724, dec2: 15.07, name:'Delphinus' },
  { ra1: 20.724, dec1: 15.07, ra2: 20.778, dec2: 16.12, name:'Delphinus' },
  { ra1: 20.778, dec1: 16.12, ra2: 20.660, dec2: 15.91, name:'Delphinus' },
  { ra1: 20.626, dec1: 14.60, ra2: 20.553, dec2: 11.30, name:'Delphinus' },
  // Sagitta
  { ra1: 19.979, dec1: 18.01, ra2: 19.684, dec2: 18.01, name:'Sagitta' },
  { ra1: 19.684, dec1: 18.01, ra2: 19.539, dec2: 17.48, name:'Sagitta' },
  { ra1: 19.684, dec1: 18.01, ra2: 19.548, dec2: 16.08, name:'Sagitta' },
  // Hercules
  { ra1: 17.244, dec1: 14.39, ra2: 16.503, dec2: 21.49, name:'Hercules' },
  { ra1: 16.503, dec1: 21.49, ra2: 16.688, dec2: 31.60, name:'Hercules' },
  { ra1: 16.688, dec1: 31.60, ra2: 17.005, dec2: 30.93, name:'Hercules' },
  { ra1: 17.005, dec1: 30.93, ra2: 17.250, dec2: 36.81, name:'Hercules' },
  { ra1: 17.250, dec1: 36.81, ra2: 16.715, dec2: 38.92, name:'Hercules' },
  { ra1: 16.715, dec1: 38.92, ra2: 16.568, dec2: 42.44, name:'Hercules' },
  { ra1: 16.688, dec1: 31.60, ra2: 16.715, dec2: 38.92, name:'Hercules' },
  // Serpens
  { ra1: 15.578, dec1: 26.71, ra2: 15.737, dec2: 15.42, name:'Serpens' },
  { ra1: 15.737, dec1: 15.42, ra2: 15.812, dec2: 6.43, name:'Serpens' },
  { ra1: 15.812, dec1: 6.43, ra2: 15.940, dec2: 4.48, name:'Serpens' },
  { ra1: 17.626, dec1: -12.88, ra2: 18.355, dec2: -2.90, name:'Serpens' },
  // Ophiuchus
  { ra1: 17.172, dec1: 4.57, ra2: 17.583, dec2: 12.56, name:'Ophiuchus' },
  { ra1: 17.583, dec1: 12.56, ra2: 17.724, dec2: 4.57, name:'Ophiuchus' },
  { ra1: 17.724, dec1: 4.57, ra2: 17.172, dec2: -15.72, name:'Ophiuchus' },
  { ra1: 17.172, dec1: -15.72, ra2: 16.617, dec2: -10.57, name:'Ophiuchus' },
  { ra1: 16.617, dec1: -10.57, ra2: 17.172, dec2: 4.57, name:'Ophiuchus' },
  { ra1: 17.172, dec1: 4.57, ra2: 16.235, dec2: -4.69, name:'Ophiuchus' },
  // Perseus
  { ra1: 3.405, dec1: 49.86, ra2: 3.136, dec2: 40.96, name:'Perseus' },
  { ra1: 3.405, dec1: 49.86, ra2: 3.716, dec2: 47.79, name:'Perseus' },
  { ra1: 3.716, dec1: 47.79, ra2: 3.964, dec2: 40.01, name:'Perseus' },
  { ra1: 3.964, dec1: 40.01, ra2: 3.859, dec2: 31.88, name:'Perseus' },
  { ra1: 3.405, dec1: 49.86, ra2: 3.080, dec2: 53.51, name:'Perseus' },
  // Auriga
  { ra1: 5.278, dec1: 45.99, ra2: 5.438, dec2: 28.61, name:'Auriga' },
  { ra1: 5.438, dec1: 28.61, ra2: 5.994, dec2: 37.21, name:'Auriga' },
  { ra1: 5.994, dec1: 37.21, ra2: 5.992, dec2: 44.95, name:'Auriga' },
  { ra1: 5.992, dec1: 44.95, ra2: 5.278, dec2: 45.99, name:'Auriga' },
  { ra1: 5.278, dec1: 45.99, ra2: 4.950, dec2: 33.17, name:'Auriga' },
  // Aries
  { ra1: 2.119, dec1: 23.46, ra2: 1.911, dec2: 20.81, name:'Aries' },
  { ra1: 1.911, dec1: 20.81, ra2: 1.894, dec2: 19.29, name:'Aries' },
  // Triangulum
  { ra1: 1.886, dec1: 29.58, ra2: 2.159, dec2: 34.99, name:'Triangulum' },
  { ra1: 2.159, dec1: 34.99, ra2: 2.289, dec2: 33.85, name:'Triangulum' },
  { ra1: 2.289, dec1: 33.85, ra2: 1.886, dec2: 29.58, name:'Triangulum' },
  // Pisces
  { ra1: 2.034, dec1: 2.76, ra2: 1.691, dec2: 5.49, name:'Pisces' },
  { ra1: 1.691, dec1: 5.49, ra2: 1.477, dec2: 6.14, name:'Pisces' },
  { ra1: 1.477, dec1: 6.14, ra2: 1.525, dec2: 15.35, name:'Pisces' },
  { ra1: 23.064, dec1: 3.82, ra2: 23.285, dec2: 1.78, name:'Pisces' },
  { ra1: 23.285, dec1: 1.78, ra2: 23.450, dec2: 1.26, name:'Pisces' },
  { ra1: 23.450, dec1: 1.26, ra2: 23.465, dec2: 6.38, name:'Pisces' },
  { ra1: 23.465, dec1: 6.38, ra2: 23.988, dec2: 6.86, name:'Pisces' },
  { ra1: 23.064, dec1: 3.82, ra2: 2.034, dec2: 2.76, name:'Pisces' },
  // Aquarius
  { ra1: 22.096, dec1: -0.32, ra2: 21.526, dec2: -5.57, name:'Aquarius' },
  { ra1: 22.096, dec1: -0.32, ra2: 22.362, dec2: -1.39, name:'Aquarius' },
  { ra1: 22.362, dec1: -1.39, ra2: 22.491, dec2: -0.02, name:'Aquarius' },
  { ra1: 22.362, dec1: -1.39, ra2: 22.589, dec2: -0.12, name:'Aquarius' },
  { ra1: 22.589, dec1: -0.12, ra2: 22.877, dec2: -7.58, name:'Aquarius' },
  { ra1: 22.877, dec1: -7.58, ra2: 22.910, dec2: -15.82, name:'Aquarius' },
  { ra1: 21.526, dec1: -5.57, ra2: 20.794, dec2: -9.50, name:'Aquarius' },
  // Capricornus
  { ra1: 20.302, dec1: -12.51, ra2: 20.350, dec2: -14.78, name:'Capricornus' },
  { ra1: 20.350, dec1: -14.78, ra2: 21.099, dec2: -17.23, name:'Capricornus' },
  { ra1: 21.099, dec1: -17.23, ra2: 21.444, dec2: -22.41, name:'Capricornus' },
  { ra1: 21.444, dec1: -22.41, ra2: 21.667, dec2: -16.66, name:'Capricornus' },
  { ra1: 21.667, dec1: -16.66, ra2: 21.784, dec2: -16.13, name:'Capricornus' },
  { ra1: 21.099, dec1: -17.23, ra2: 20.864, dec2: -26.92, name:'Capricornus' },
  { ra1: 20.864, dec1: -26.92, ra2: 21.444, dec2: -22.41, name:'Capricornus' },
  // Piscis Austrinus
  { ra1: 22.961, dec1: -29.62, ra2: 22.677, dec2: -27.04, name:'Piscis Austrinus' },
  { ra1: 22.677, dec1: -27.04, ra2: 22.140, dec2: -32.99, name:'Piscis Austrinus' },
  { ra1: 22.140, dec1: -32.99, ra2: 22.961, dec2: -29.62, name:'Piscis Austrinus' },
  // Cetus
  { ra1: 0.655, dec1: -17.99, ra2: 1.858, dec2: -10.34, name:'Cetus' },
  { ra1: 1.858, dec1: -10.34, ra2: 2.322, dec2: -2.97, name:'Cetus' },
  { ra1: 2.322, dec1: -2.97, ra2: 2.721, dec2: 3.24, name:'Cetus' },
  { ra1: 2.721, dec1: 3.24, ra2: 3.038, dec2: 4.09, name:'Cetus' },
  { ra1: 3.038, dec1: 4.09, ra2: 2.658, dec2: 0.33, name:'Cetus' },
  { ra1: 2.658, dec1: 0.33, ra2: 2.721, dec2: 3.24, name:'Cetus' },
  // Eridanus
  { ra1: 5.130, dec1: -5.09, ra2: 4.297, dec2: -8.90, name:'Eridanus' },
  { ra1: 4.297, dec1: -8.90, ra2: 3.967, dec2: -13.51, name:'Eridanus' },
  { ra1: 3.967, dec1: -13.51, ra2: 3.720, dec2: -9.76, name:'Eridanus' },
  { ra1: 3.720, dec1: -9.76, ra2: 2.971, dec2: -40.31, name:'Eridanus' },
  { ra1: 2.971, dec1: -40.31, ra2: 1.629, dec2: -57.24, name:'Eridanus' },
  // Lepus
  { ra1: 5.543, dec1: -17.82, ra2: 5.471, dec2: -20.76, name:'Lepus' },
  { ra1: 5.471, dec1: -20.76, ra2: 5.741, dec2: -22.45, name:'Lepus' },
  { ra1: 5.741, dec1: -22.45, ra2: 5.852, dec2: -20.88, name:'Lepus' },
  { ra1: 5.852, dec1: -20.88, ra2: 5.543, dec2: -17.82, name:'Lepus' },
  { ra1: 5.090, dec1: -22.37, ra2: 5.471, dec2: -20.76, name:'Lepus' },
  // Monoceros
  { ra1: 6.480, dec1: -7.03, ra2: 7.197, dec2: -0.49, name:'Monoceros' },
  { ra1: 7.197, dec1: -0.49, ra2: 7.688, dec2: -9.55, name:'Monoceros' },
  { ra1: 6.247, dec1: -6.27, ra2: 6.480, dec2: -7.03, name:'Monoceros' },
  // Cancer
  { ra1: 8.974, dec1: 11.86, ra2: 8.745, dec2: 18.15, name:'Cancer' },
  { ra1: 8.745, dec1: 18.15, ra2: 8.721, dec2: 21.47, name:'Cancer' },
  { ra1: 8.745, dec1: 18.15, ra2: 8.275, dec2: 9.19, name:'Cancer' },
  { ra1: 8.974, dec1: 11.86, ra2: 8.275, dec2: 9.19, name:'Cancer' },
  // Hydra
  { ra1: 8.924, dec1: 5.95, ra2: 9.460, dec2: -8.66, name:'Hydra' },
  { ra1: 9.460, dec1: -8.66, ra2: 10.435, dec2: -16.84, name:'Hydra' },
  { ra1: 10.435, dec1: -16.84, ra2: 10.828, dec2: -16.20, name:'Hydra' },
  { ra1: 10.828, dec1: -16.20, ra2: 13.315, dec2: -23.17, name:'Hydra' },
  // Leo (extended)
  { ra1: 10.140, dec1: 11.97, ra2: 10.123, dec2: 16.76, name:'Leo' },
  { ra1: 10.123, dec1: 16.76, ra2: 9.879, dec2: 26.01, name:'Leo' },
  { ra1: 9.879, dec1: 26.01, ra2: 10.278, dec2: 23.42, name:'Leo' },
  { ra1: 10.278, dec1: 23.42, ra2: 10.332, dec2: 19.84, name:'Leo' },
  { ra1: 11.817, dec1: 14.57, ra2: 11.237, dec2: 15.43, name:'Leo' },
  { ra1: 11.237, dec1: 15.43, ra2: 10.140, dec2: 11.97, name:'Leo' },
  // Corvus
  { ra1: 12.140, dec1: -24.73, ra2: 12.168, dec2: -22.62, name:'Corvus' },
  { ra1: 12.168, dec1: -22.62, ra2: 12.267, dec2: -17.54, name:'Corvus' },
  { ra1: 12.267, dec1: -17.54, ra2: 12.498, dec2: -16.52, name:'Corvus' },
  { ra1: 12.498, dec1: -16.52, ra2: 12.573, dec2: -23.40, name:'Corvus' },
  { ra1: 12.573, dec1: -23.40, ra2: 12.140, dec2: -24.73, name:'Corvus' },
  // Crater
  { ra1: 10.996, dec1: -18.30, ra2: 11.411, dec2: -22.83, name:'Crater' },
  { ra1: 11.411, dec1: -22.83, ra2: 11.322, dec2: -17.68, name:'Crater' },
  { ra1: 11.322, dec1: -17.68, ra2: 10.996, dec2: -18.30, name:'Crater' },
  // Virgo (complete)
  { ra1: 13.420, dec1: -11.16, ra2: 12.694, dec2: -1.45, name:'Virgo' },
  { ra1: 12.694, dec1: -1.45, ra2: 12.332, dec2: -0.67, name:'Virgo' },
  { ra1: 12.694, dec1: -1.45, ra2: 13.036, dec2: 10.96, name:'Virgo' },
  { ra1: 13.420, dec1: -11.16, ra2: 14.175, dec2: -6.00, name:'Virgo' },
  { ra1: 14.175, dec1: -6.00, ra2: 14.849, dec2: -16.04, name:'Virgo' },
  // Scorpius (complete)
  { ra1: 15.993, dec1: -22.62, ra2: 16.490, dec2: -26.43, name:'Scorpius' },
  { ra1: 16.490, dec1: -26.43, ra2: 17.560, dec2: -37.10, name:'Scorpius' },
  { ra1: 17.560, dec1: -37.10, ra2: 17.513, dec2: -37.30, name:'Scorpius' },
  { ra1: 17.513, dec1: -37.30, ra2: 17.622, dec2: -43.00, name:'Scorpius' },
  { ra1: 15.993, dec1: -22.62, ra2: 15.934, dec2: -19.80, name:'Scorpius' },
  // Sagittarius (Teapot — complete)
  { ra1: 18.403, dec1: -34.38, ra2: 18.350, dec2: -29.83, name:'Sagittarius' },
  { ra1: 18.350, dec1: -29.83, ra2: 18.466, dec2: -21.06, name:'Sagittarius' },
  { ra1: 18.466, dec1: -21.06, ra2: 18.922, dec2: -26.30, name:'Sagittarius' },
  { ra1: 18.922, dec1: -26.30, ra2: 18.403, dec2: -34.38, name:'Sagittarius' },
  { ra1: 18.350, dec1: -29.83, ra2: 18.097, dec2: -21.06, name:'Sagittarius' },
  { ra1: 18.097, dec1: -21.06, ra2: 18.466, dec2: -21.06, name:'Sagittarius' },
  // Centaurus
  { ra1: 14.066, dec1: -60.37, ra2: 14.660, dec2: -60.83, name:'Centaurus' },
  { ra1: 14.066, dec1: -60.37, ra2: 13.664, dec2: -53.47, name:'Centaurus' },
  { ra1: 13.664, dec1: -53.47, ra2: 13.826, dec2: -42.47, name:'Centaurus' },
  { ra1: 13.826, dec1: -42.47, ra2: 14.592, dec2: -42.16, name:'Centaurus' },
  { ra1: 14.592, dec1: -42.16, ra2: 14.066, dec2: -60.37, name:'Centaurus' },
  { ra1: 12.692, dec1: -48.96, ra2: 13.664, dec2: -53.47, name:'Centaurus' },
  // Crux (Southern Cross)
  { ra1: 12.443, dec1: -63.10, ra2: 12.519, dec2: -57.11, name:'Crux' },
  { ra1: 12.519, dec1: -57.11, ra2: 12.795, dec2: -59.69, name:'Crux' },
  { ra1: 12.795, dec1: -59.69, ra2: 12.253, dec2: -58.75, name:'Crux' },
  { ra1: 12.253, dec1: -58.75, ra2: 12.443, dec2: -63.10, name:'Crux' },
  // Lupus
  { ra1: 15.005, dec1: -41.17, ra2: 15.378, dec2: -44.69, name:'Lupus' },
  { ra1: 15.378, dec1: -44.69, ra2: 15.585, dec2: -41.17, name:'Lupus' },
  { ra1: 15.585, dec1: -41.17, ra2: 15.005, dec2: -41.17, name:'Lupus' },
  // Corona Australis
  { ra1: 18.806, dec1: -43.68, ra2: 18.978, dec2: -37.10, name:'Corona Australis' },
  { ra1: 18.978, dec1: -37.10, ra2: 19.058, dec2: -37.91, name:'Corona Australis' },
  { ra1: 19.058, dec1: -37.91, ra2: 19.167, dec2: -39.34, name:'Corona Australis' },
  // Canis Major (extended)
  { ra1: 6.752, dec1: -16.72, ra2: 6.378, dec2: -17.96, name:'Canis Major' },
  { ra1: 6.378, dec1: -17.96, ra2: 6.977, dec2: -28.97, name:'Canis Major' },
  { ra1: 6.977, dec1: -28.97, ra2: 7.140, dec2: -26.39, name:'Canis Major' },
  { ra1: 7.140, dec1: -26.39, ra2: 7.401, dec2: -29.30, name:'Canis Major' },
  { ra1: 7.401, dec1: -29.30, ra2: 6.977, dec2: -28.97, name:'Canis Major' },
  { ra1: 6.752, dec1: -16.72, ra2: 7.140, dec2: -26.39, name:'Canis Major' },
  // Columba
  { ra1: 5.661, dec1: -34.07, ra2: 5.849, dec2: -35.77, name:'Columba' },
  { ra1: 5.849, dec1: -35.77, ra2: 6.368, dec2: -33.44, name:'Columba' },
  { ra1: 5.661, dec1: -34.07, ra2: 5.520, dec2: -35.47, name:'Columba' },
  // Puppis
  { ra1: 7.286, dec1: -37.10, ra2: 7.822, dec2: -24.86, name:'Puppis' },
  { ra1: 7.822, dec1: -24.86, ra2: 8.060, dec2: -40.00, name:'Puppis' },
  { ra1: 8.060, dec1: -40.00, ra2: 8.125, dec2: -24.30, name:'Puppis' },
  // Vela
  { ra1: 8.158, dec1: -47.34, ra2: 8.745, dec2: -54.71, name:'Vela' },
  { ra1: 8.745, dec1: -54.71, ra2: 9.133, dec2: -43.43, name:'Vela' },
  { ra1: 9.133, dec1: -43.43, ra2: 9.369, dec2: -55.01, name:'Vela' },
  { ra1: 9.369, dec1: -55.01, ra2: 8.158, dec2: -47.34, name:'Vela' },
  // Carina
  { ra1: 6.399, dec1: -52.70, ra2: 7.946, dec2: -52.98, name:'Carina' },
  { ra1: 7.946, dec1: -52.98, ra2: 8.375, dec2: -59.51, name:'Carina' },
  { ra1: 8.375, dec1: -59.51, ra2: 9.220, dec2: -69.72, name:'Carina' },
  { ra1: 9.220, dec1: -69.72, ra2: 9.784, dec2: -65.07, name:'Carina' },
  { ra1: 9.784, dec1: -65.07, ra2: 10.229, dec2: -70.04, name:'Carina' },
  // Canes Venatici
  { ra1: 12.934, dec1: 38.32, ra2: 12.562, dec2: 41.35, name:'Canes Venatici' },
  // Boötes (extended kite)
  { ra1: 14.261, dec1: 19.18, ra2: 14.750, dec2: 27.07, name:'Boötes' },
  { ra1: 14.750, dec1: 27.07, ra2: 15.032, dec2: 40.39, name:'Boötes' },
  { ra1: 15.032, dec1: 40.39, ra2: 14.534, dec2: 30.37, name:'Boötes' },
  { ra1: 14.534, dec1: 30.37, ra2: 14.261, dec2: 19.18, name:'Boötes' },
  { ra1: 14.534, dec1: 30.37, ra2: 13.912, dec2: 18.40, name:'Boötes' },
  { ra1: 14.261, dec1: 19.18, ra2: 13.912, dec2: 18.40, name:'Boötes' },
  // Pegasus (Great Square complete)
  { ra1: 23.079, dec1: 15.21, ra2: 22.691, dec2: 10.83, name:'Pegasus' },
  { ra1: 22.691, dec1: 10.83, ra2: 21.736, dec2: 9.88, name:'Pegasus' },
  { ra1: 23.079, dec1: 15.21, ra2: 23.063, dec2: 28.08, name:'Pegasus' },
  { ra1: 23.063, dec1: 28.08, ra2: 0.140, dec2: 29.09, name:'Pegasus' },
  { ra1: 0.140, dec1: 29.09, ra2: 0.221, dec2: 15.18, name:'Pegasus' },
  { ra1: 0.221, dec1: 15.18, ra2: 23.079, dec2: 15.21, name:'Pegasus' },
  // Phoenix
  { ra1: 0.438, dec1: -42.31, ra2: 1.101, dec2: -46.72, name:'Phoenix' },
  { ra1: 1.101, dec1: -46.72, ra2: 1.472, dec2: -43.32, name:'Phoenix' },
  { ra1: 1.472, dec1: -43.32, ra2: 0.438, dec2: -42.31, name:'Phoenix' },
  // Grus
  { ra1: 22.137, dec1: -46.96, ra2: 22.711, dec2: -46.88, name:'Grus' },
  { ra1: 22.711, dec1: -46.88, ra2: 23.175, dec2: -45.25, name:'Grus' },
  { ra1: 22.711, dec1: -46.88, ra2: 22.488, dec2: -50.91, name:'Grus' },
  // Lacerta
  { ra1: 22.492, dec1: 47.70, ra2: 22.350, dec2: 50.28, name:'Lacerta' },
  { ra1: 22.350, dec1: 50.28, ra2: 22.521, dec2: 50.21, name:'Lacerta' },
  { ra1: 22.521, dec1: 50.21, ra2: 22.408, dec2: 52.23, name:'Lacerta' },
  // Andromeda (extended)
  { ra1: 0.140, dec1: 29.09, ra2: 0.655, dec2: 30.86, name:'Andromeda' },
  { ra1: 0.655, dec1: 30.86, ra2: 1.162, dec2: 35.62, name:'Andromeda' },
  { ra1: 1.162, dec1: 35.62, ra2: 2.065, dec2: 42.33, name:'Andromeda' },
  // Taurus (extended horns)
  { ra1: 4.599, dec1: 16.51, ra2: 5.438, dec2: 28.61, name:'Taurus' },
  { ra1: 4.599, dec1: 16.51, ra2: 5.627, dec2: 21.14, name:'Taurus' },
  { ra1: 3.783, dec1: 24.12, ra2: 4.599, dec2: 16.51, name:'Taurus' },
  // Gemini (extended)
  { ra1: 7.577, dec1: 31.89, ra2: 7.755, dec2: 28.03, name:'Gemini' },
  { ra1: 7.755, dec1: 28.03, ra2: 7.068, dec2: 20.57, name:'Gemini' },
  { ra1: 7.068, dec1: 20.57, ra2: 6.629, dec2: 16.40, name:'Gemini' },
  { ra1: 7.577, dec1: 31.89, ra2: 6.628, dec2: 25.13, name:'Gemini' },
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

// ── MESSIER CATALOG ────────────────────────────────────────────
interface MessierObj { id: string; name: string; type: string; ra: number; dec: number; mag: number; dist: string; size: string; desc: string; color: string }
const MESSIER: MessierObj[] = [
  { id:'M1',  name:'Crab Nebula',        type:'Supernova Remnant', ra:5.575,  dec:22.01,  mag:8.4,  dist:'6,500 ly',   size:"7'×5'",    color:'#55ccff', desc:'Remnant of a 1054 supernova; powered by a pulsar spinning 30× per second' },
  { id:'M3',  name:'Great Globular',     type:'Globular Cluster',  ra:13.703, dec:28.38,  mag:6.2,  dist:'33,900 ly',  size:"18'",      color:'#ffcc44', desc:'One of the largest and finest globulars in the sky; 500,000 stars' },
  { id:'M5',  name:'Rose Cluster',       type:'Globular Cluster',  ra:15.310, dec:2.08,   mag:5.6,  dist:'24,500 ly',  size:"23'",      color:'#ffcc44', desc:'One of the oldest globulars at 13 billion years' },
  { id:'M7',  name:'Ptolemy Cluster',    type:'Open Cluster',      ra:17.900, dec:-34.82, mag:3.3,  dist:'980 ly',     size:"80'",      color:'#88ff66', desc:'Known since antiquity; over 80 bright stars in Scorpius' },
  { id:'M8',  name:'Lagoon Nebula',      type:'Nebula',            ra:18.060, dec:-24.38, mag:5.8,  dist:'4,100 ly',   size:"90'×40'",  color:'#55ccff', desc:'Active star-forming region; newborn stars ionize surrounding gas' },
  { id:'M11', name:'Wild Duck Cluster',  type:'Open Cluster',      ra:18.851, dec:-6.27,  mag:5.8,  dist:'6,200 ly',   size:"14'",      color:'#88ff66', desc:'2,900 stars shaped like a wedge of flying ducks' },
  { id:'M13', name:'Hercules Cluster',   type:'Globular Cluster',  ra:16.694, dec:36.46,  mag:5.8,  dist:'25,100 ly',  size:"20'",      color:'#ffcc44', desc:'Great Hercules Cluster; 1974 Arecibo message was aimed here' },
  { id:'M15', name:'Pegasus Cluster',    type:'Globular Cluster',  ra:21.500, dec:12.17,  mag:6.2,  dist:'33,600 ly',  size:"18'",      color:'#ffcc44', desc:'One of the densest globulars; harbors a planetary nebula' },
  { id:'M20', name:'Trifid Nebula',      type:'Nebula',            ra:18.030, dec:-23.02, mag:6.3,  dist:'5,200 ly',   size:"28'",      color:'#55ccff', desc:'Three-lobed nebula separated by dark dust lanes; gorgeous in colour' },
  { id:'M22', name:'Sagittarius Cluster',type:'Globular Cluster',  ra:18.606, dec:-23.90, mag:5.1,  dist:'10,600 ly',  size:"32'",      color:'#ffcc44', desc:'One of the brightest globulars; visible to naked eye in dark skies' },
  { id:'M27', name:'Dumbbell Nebula',    type:'Planetary Nebula',  ra:19.993, dec:22.72,  mag:7.4,  dist:'1,360 ly',   size:"8'×5.7'",  color:'#55ccff', desc:'First planetary nebula discovered by Messier in 1764' },
  { id:'M31', name:'Andromeda Galaxy',   type:'Galaxy',            ra:0.712,  dec:41.27,  mag:3.44, dist:'2.5 M ly',   size:"3°×1°",    color:'#ff99cc', desc:'Nearest major galaxy; contains ~1 trillion stars; will merge with Milky Way in 4.5 Gyr' },
  { id:'M32', name:'Le Gentil',          type:'Galaxy',            ra:0.712,  dec:40.87,  mag:8.7,  dist:'2.5 M ly',   size:"9'×7'",    color:'#ff99cc', desc:'Compact elliptical companion to the Andromeda Galaxy' },
  { id:'M33', name:'Triangulum Galaxy',  type:'Galaxy',            ra:1.565,  dec:30.66,  mag:5.7,  dist:'2.7 M ly',   size:"71'×42'",  color:'#ff99cc', desc:'Third largest galaxy in the Local Group; 40 billion stars' },
  { id:'M35', name:'Shoe-Buckle Cluster',type:'Open Cluster',      ra:6.150,  dec:24.33,  mag:5.1,  dist:'2,800 ly',   size:"28'",      color:'#88ff66', desc:'Rich cluster of ~500 stars; background cluster NGC 2158 also visible' },
  { id:'M42', name:'Orion Nebula',       type:'Nebula',            ra:5.588,  dec:-5.39,  mag:4.0,  dist:'1,344 ly',   size:"65'×60'",  color:'#55ccff', desc:"Nearest and brightest star-forming region; winter's showpiece object" },
  { id:'M44', name:'Beehive Cluster',    type:'Open Cluster',      ra:8.667,  dec:19.67,  mag:3.7,  dist:'610 ly',     size:"95'",      color:'#88ff66', desc:'One of the nearest open clusters; first observed by Galileo in 1609' },
  { id:'M45', name:'Pleiades',           type:'Open Cluster',      ra:3.783,  dec:24.12,  mag:1.2,  dist:'444 ly',     size:"110'",     color:'#88ff66', desc:'The Seven Sisters; 100 My old hot blue stars, surrounded by nebulosity' },
  { id:'M51', name:'Whirlpool Galaxy',   type:'Galaxy',            ra:13.498, dec:47.20,  mag:8.4,  dist:'23 M ly',    size:"11'×7'",   color:'#ff99cc', desc:'First galaxy recognized as a spiral; interacting with NGC 5195' },
  { id:'M57', name:'Ring Nebula',        type:'Planetary Nebula',  ra:18.893, dec:33.03,  mag:8.8,  dist:'2,300 ly',   size:"1.4'×1'",  color:'#55ccff', desc:"Classic smoke-ring; a sun-like star's expelled outer layers" },
  { id:'M63', name:'Sunflower Galaxy',   type:'Galaxy',            ra:13.265, dec:42.03,  mag:8.6,  dist:'29 M ly',    size:"12'×7'",   color:'#ff99cc', desc:'Patchy spiral arms resemble a sunflower petal pattern' },
  { id:'M64', name:'Black Eye Galaxy',   type:'Galaxy',            ra:12.946, dec:21.68,  mag:8.5,  dist:'24 M ly',    size:"10'×5'",   color:'#ff99cc', desc:'Dark dust band in front of bright nucleus gives the black-eye look' },
  { id:'M78', name:'Casper Nebula',      type:'Nebula',            ra:5.780,  dec:0.05,   mag:8.3,  dist:'1,350 ly',   size:"8'×6'",    color:'#55ccff', desc:'Brightest reflection nebula in Orion; near the hunter\'s belt' },
  { id:'M81', name:"Bode's Galaxy",      type:'Galaxy',            ra:9.926,  dec:69.07,  mag:6.9,  dist:'11.8 M ly',  size:"26'×14'",  color:'#ff99cc', desc:'Grand spiral galaxy; interacting gravitationally with cigar galaxy M82' },
  { id:'M82', name:'Cigar Galaxy',       type:'Galaxy',            ra:9.926,  dec:69.68,  mag:8.4,  dist:'12.7 M ly',  size:"11'×5'",   color:'#ff99cc', desc:'Starburst galaxy erupting with superwind from its core, visible in IR' },
  { id:'M92', name:'Hercules Cluster 2', type:'Globular Cluster',  ra:17.285, dec:43.13,  mag:6.4,  dist:'26,700 ly',  size:"14'",      color:'#ffcc44', desc:'One of the oldest globulars at ~14 Gyr; often overlooked next to M13' },
  { id:'M97', name:'Owl Nebula',         type:'Planetary Nebula',  ra:11.247, dec:55.02,  mag:9.9,  dist:'2,030 ly',   size:"3.4'",     color:'#55ccff', desc:'Two dark eyes give an owl-face appearance; central star visible' },
  { id:'M101',name:'Pinwheel Galaxy',    type:'Galaxy',            ra:14.053, dec:54.35,  mag:7.9,  dist:'21 M ly',    size:"29'×27'",  color:'#ff99cc', desc:'Face-on spiral; hosted supernova SN 2023ixf, brightest in 40 years' },
  { id:'M104',name:'Sombrero Galaxy',    type:'Galaxy',            ra:12.666, dec:-11.62, mag:8.0,  dist:'28 M ly',    size:"9'×4'",    color:'#ff99cc', desc:'Prominent dark dust lane and bright nucleus give the sombrero silhouette' },
]

// ── SHARED CATALOG TYPE ────────────────────────────────────────
type HipStar = [number, number, number, number, string?]

// ── 3D CELESTIAL GLOBE ────────────────────────────────────────
interface StarGlobeProps { hipStars: HipStar[]; showConstellations: boolean; time: Date }
function StarGlobe({ hipStars, showConstellations, time }: StarGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })
  const timeRef = useRef(time)
  useEffect(() => { timeRef.current = time }, [time])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const W = Math.max(container.clientWidth, 300)
    const H = 480
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x020408, 1)
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.01, 100)
    camera.position.z = 2.6
    const group = new THREE.Group()
    scene.add(group)

    // Faint sphere fill
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x040c20, transparent: true, opacity: 0.85 })
    ))

    // Grid lines helper
    const mkLine = (pts: THREE.Vector3[], col: number, op: number) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts)
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }))
    }

    // Equatorial ring
    const eqPts: THREE.Vector3[] = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      eqPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
    }
    group.add(mkLine(eqPts, 0x3355aa, 0.4))

    // Dec rings ±30° ±60°
    for (const dec of [30, 60, -30, -60]) {
      const pts: THREE.Vector3[] = [], y = Math.sin(dec * DEG), rr = Math.cos(dec * DEG)
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2
        pts.push(new THREE.Vector3(rr * Math.cos(a), y, rr * Math.sin(a)))
      }
      group.add(mkLine(pts, 0x223366, 0.22))
    }

    // RA meridians every 3 hours
    for (let ra = 0; ra < 24; ra += 3) {
      const pts: THREE.Vector3[] = [], theta = ra * Math.PI / 12
      for (let i = 0; i <= 64; i++) {
        const phi = (-90 + (i / 64) * 180) * DEG
        pts.push(new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.sin(phi), -Math.cos(phi) * Math.sin(theta)))
      }
      group.add(mkLine(pts, 0x1a2855, 0.18))
    }

    // Stars — tiered by magnitude for varied sizes
    const allStars: { ra: number; dec: number; color: string; mag: number }[] = []
    STARS.forEach(([, ra, dec, mag, color]) => allStars.push({ ra, dec, color, mag }))
    hipStars.forEach(([ra, dec, mag, temp]) => {
      if (mag >= 2.5) allStars.push({ ra, dec, color: tempColor(temp), mag })
    })

    const tiers = [
      { min: -5,  max: 0,   size: 6,   op: 1.0  },
      { min: 0,   max: 1.5, size: 4.5, op: 0.95 },
      { min: 1.5, max: 3,   size: 3,   op: 0.9  },
      { min: 3,   max: 4.5, size: 2,   op: 0.8  },
      { min: 4.5, max: 7,   size: 1.2, op: 0.55 },
    ]

    for (const { min, max, size, op } of tiers) {
      const pos: number[] = [], cols: number[] = []
      allStars.forEach(({ ra, dec, color, mag }) => {
        if (mag < min || mag >= max) return
        const theta = ra * Math.PI / 12, phi = dec * DEG
        pos.push(Math.cos(phi) * Math.cos(theta), Math.sin(phi), -Math.cos(phi) * Math.sin(theta))
        const c = new THREE.Color(color); cols.push(c.r, c.g, c.b)
      })
      if (!pos.length) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
      group.add(new THREE.Points(geo, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: op })))
    }

    // Constellation lines
    if (showConstellations) {
      const linePos: number[] = []
      CONSTELLATION_LINES.forEach(({ a, b }) => {
        const sa = STARS[a], sb = STARS[b]; if (!sa || !sb) return
        const tA = sa[1] * Math.PI / 12, pA = sa[2] * DEG
        const tB = sb[1] * Math.PI / 12, pB = sb[2] * DEG
        linePos.push(Math.cos(pA) * Math.cos(tA), Math.sin(pA), -Math.cos(pA) * Math.sin(tA))
        linePos.push(Math.cos(pB) * Math.cos(tB), Math.sin(pB), -Math.cos(pB) * Math.sin(tB))
      })
      if (linePos.length) {
        const lgeo = new THREE.BufferGeometry()
        lgeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3))
        group.add(new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: 0x5566cc, transparent: true, opacity: 0.55 })))
      }
    }

    // Planets on the celestial sphere
    const PLANET_DEF = [
      { name: 'Sun',     hex: 0xffee44, r: 0.052, glow: 0xffcc00 },
      { name: 'Mercury', hex: 0xd0d0d0, r: 0.016, glow: 0x909090 },
      { name: 'Venus',   hex: 0xfff4c2, r: 0.025, glow: 0xffee88 },
      { name: 'Mars',    hex: 0xff5533, r: 0.022, glow: 0xff3311 },
      { name: 'Jupiter', hex: 0xf5c88a, r: 0.042, glow: 0xe8a060 },
      { name: 'Saturn',  hex: 0xf0d880, r: 0.034, glow: 0xd4b840 },
      { name: 'Uranus',  hex: 0x7de8e8, r: 0.018, glow: 0x40c0c0 },
      { name: 'Neptune', hex: 0x6680ff, r: 0.016, glow: 0x4455ff },
    ]
    const planetMeshes: { inner: THREE.Mesh; name: string }[] = []
    for (const pd of PLANET_DEF) {
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(pd.r, 12, 12),
        new THREE.MeshBasicMaterial({ color: pd.hex })
      )
      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(pd.r * 2.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: pd.glow, transparent: true, opacity: 0.22 })
      )
      inner.add(outer)
      group.add(inner)
      planetMeshes.push({ inner, name: pd.name })
    }
    const updatePlanets = () => {
      const dd = julianDate(timeRef.current) - 2451543.5
      for (const pm of planetMeshes) {
        const radec = computeRADec(pm.name, dd)
        if (!radec) { pm.inner.visible = false; continue }
        pm.inner.visible = true
        const theta = radec.ra * Math.PI / 12
        const phi = radec.dec * DEG
        const rr = 1.015
        pm.inner.position.set(
          rr * Math.cos(phi) * Math.cos(theta),
          rr * Math.sin(phi),
          -rr * Math.cos(phi) * Math.sin(theta)
        )
      }
    }

    // Animation + auto-rotate
    let autoRotate = true
    let arTimer: ReturnType<typeof setTimeout> | null = null
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      if (autoRotate && !dragRef.current.active) group.rotation.y += 0.0008
      updatePlanets()
      renderer.render(scene, camera)
    }
    animate()

    const el = renderer.domElement
    const onMD = (e: MouseEvent) => {
      dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }
      autoRotate = false
      if (arTimer) { clearTimeout(arTimer); arTimer = null }
    }
    const onMM = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      group.rotation.y += (e.clientX - dragRef.current.lastX) * 0.004
      group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, group.rotation.x + (e.clientY - dragRef.current.lastY) * 0.004))
      dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY
    }
    const onMU = () => { dragRef.current.active = false; arTimer = setTimeout(() => { autoRotate = true }, 2500) }
    const onTS = (e: TouchEvent) => {
      e.preventDefault()
      dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY }
      autoRotate = false
      if (arTimer) { clearTimeout(arTimer); arTimer = null }
    }
    const onTM = (e: TouchEvent) => {
      e.preventDefault(); if (!dragRef.current.active) return
      group.rotation.y += (e.touches[0].clientX - dragRef.current.lastX) * 0.004
      group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, group.rotation.x + (e.touches[0].clientY - dragRef.current.lastY) * 0.004))
      dragRef.current.lastX = e.touches[0].clientX; dragRef.current.lastY = e.touches[0].clientY
    }
    const onTE = () => { dragRef.current.active = false; arTimer = setTimeout(() => { autoRotate = true }, 2500) }
    const onResize = () => {
      const w = Math.max(container.clientWidth, 300)
      renderer.setSize(w, 480); camera.aspect = w / 480; camera.updateProjectionMatrix()
    }

    el.addEventListener('mousedown', onMD)
    window.addEventListener('mousemove', onMM)
    window.addEventListener('mouseup', onMU)
    el.addEventListener('touchstart', onTS, { passive: false })
    el.addEventListener('touchmove', onTM, { passive: false })
    el.addEventListener('touchend', onTE)
    window.addEventListener('resize', onResize)

    return () => {
      if (arTimer) clearTimeout(arTimer)
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('mousedown', onMD)
      window.removeEventListener('mousemove', onMM)
      window.removeEventListener('mouseup', onMU)
      el.removeEventListener('touchstart', onTS)
      el.removeEventListener('touchmove', onTM)
      el.removeEventListener('touchend', onTE)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (container.contains(el)) container.removeChild(el)
    }
  }, [hipStars, showConstellations])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2xl overflow-hidden"
      style={{ height: 480, background: '#020408', cursor: 'grab', border: '1px solid rgba(99,102,241,0.2)' }}
    />
  )
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
  ra?: number
  dec?: number
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

// ── EPHEMERIS: rise / transit / set ───────────────────────────
function fmtHHMM(d: Date) {
  try { return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) } catch { return '--:--' }
}

function calcRiseSetTransit(ra: number, dec: number, date: Date, lat: number, lng: number) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  let prevAlt = -999, maxAlt = -90
  let riseTime = '', setTime = '', transitTime = ''
  for (let m = 0; m <= 1442; m += 2) {
    const t = new Date(midnight.getTime() + m * 60000)
    const lst = localSiderealTime(t, lng)
    const { alt } = toHorizon(ra, dec, lst, lat)
    if (prevAlt !== -999) {
      if (prevAlt < 0 && alt >= 0 && !riseTime) riseTime = fmtHHMM(t)
      if (prevAlt >= 0 && alt < 0 && !setTime)  setTime  = fmtHHMM(t)
    }
    if (alt > maxAlt) { maxAlt = alt; transitTime = fmtHHMM(t) }
    prevAlt = alt
  }
  return { rise: riseTime || '—', transit: maxAlt > 0 ? transitTime : '—', set: setTime || '—', maxAlt: Math.round(maxAlt) }
}

// Angular separation between two equatorial positions (degrees)
function angSep(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const r1 = ra1 * 15 * DEG, d1 = dec1 * DEG
  const r2 = ra2 * 15 * DEG, d2 = dec2 * DEG
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(r1 - r2)
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
}

// ── OBSERVING LIST ────────────────────────────────────────────
interface ObsItem {
  name: string
  type: string
  color: string
  mag?: number
  ra?: number
  dec?: number
  savedAt: number
}
const OBS_KEY = 'sh_obs_v1'
function loadObs(): ObsItem[] {
  try { return JSON.parse(localStorage.getItem(OBS_KEY) ?? '[]') } catch { return [] }
}

// DSS thumbnail from STScI — 48×48 px real survey image of each Messier object
function DssThumbnail({ ra, dec, name, color }: { ra: number; dec: number; name: string; color: string }) {
  const [err, setErr] = useState(false)
  const url = `https://archive.stsci.edu/cgi-bin/dss_search?v=poss2ukstu_red&r=${ra.toFixed(4)}&d=${dec.toFixed(4)}&e=J2000&h=4&w=4&f=gif`
  if (err) return <div style={{ width: 48, height: 48, borderRadius: 6, background: `${color}22`, border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌌</div>
  return (
    <img src={url} alt={name} width={48} height={48} referrerPolicy="no-referrer" onError={() => setErr(true)}
      style={{ borderRadius: 6, objectFit: 'cover', border: `1px solid ${color}44` }} />
  )
}

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
  const [globeMode, setGlobeMode]                   = useState(true)
  const [magLimit, setMagLimit]                     = useState(6.5)
  const [showEphemeris, setShowEphemeris]           = useState(false)
  const [notifPerm, setNotifPerm]                   = useState<NotificationPermission>('default')
  const [obsList, setObsList]                       = useState<ObsItem[]>([])
  const [showObsList, setShowObsList]               = useState(false)
  const [showEvents, setShowEvents]                 = useState(false)
  const [showPlanner, setShowPlanner]               = useState(false)
  const [showMessier, setShowMessier]               = useState(false)
  const [messierFilter, setMessierFilter]           = useState<string>('All')
  const [nvMode, setNvMode]                         = useState(false)
  const [showConArt, setShowConArt]                 = useState(true)
  const [showFOV, setShowFOV]                       = useState(false)
  const [fovScope, setFovScope]                     = useState(1000)
  const [fovEP, setFovEP]                           = useState(25)
  const [fovAFOV, setFovAFOV]                       = useState(52)
  const [zoomLevel, setZoomLevel]                   = useState(1)

  // Time Machine — travel to any date
  const todayStr = () => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
  }
  const [tmDate, setTmDate] = useState<string>(todayStr())
  const [tmHour, setTmHour] = useState<number>(new Date().getHours())
  const [showTimeMachine, setShowTimeMachine] = useState(false)
  const [tmLocked, setTmLocked] = useState(false) // false = track realtime, true = frozen to tmDate

  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIdx, setSuggestionIdx] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [issPos, setIssPos] = useState<{ lat: number; lng: number; alt: number } | null>(null)

  const [hipStars, setHipStars] = useState<HipStar[]>([])
  // NGC/IC catalog [ra, dec, mag, type, name]
  type NgcObj = [number, number, number, DSO['type'], string]
  const [ngcObjs, setNgcObjs] = useState<NgcObj[]>([])

  // Effective time: locked = custom date, else now + offset
  const effectiveTime = useMemo(() => {
    if (tmLocked) {
      const [y, m, day] = tmDate.split('-').map(Number)
      return new Date(y, m - 1, day, tmHour, 0, 0)
    }
    return new Date(time.getTime() + timeOffsetMin * 60_000)
  }, [tmLocked, tmDate, tmHour, time, timeOffsetMin])
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
    const rz = r * zoomLevel  // zoomed radius for projection

    hitRef.current = []
    ctx.clearRect(0, 0, W, H)

    // ── Atmosphere sky gradient (depends on Sun altitude) ──
    const sunRaDec = computeRADec('Sun', d)
    const lstNow = localSiderealTime(effectiveTime, loc.lng)
    const sunAlt = sunRaDec ? toHorizon(sunRaDec.ra, sunRaDec.dec, lstNow, loc.lat).alt : -90

    let skyInner: string, skyMid: string, skyOuter: string, skyMidStop: number
    if (sunAlt > 10) {
      // Full daylight
      skyInner = '#1a4a8a'; skyMid = '#0d2d5e'; skyOuter = '#081a38'; skyMidStop = 0.5
    } else if (sunAlt > 0) {
      // Sunset/sunrise — orange horizon glow
      const t = sunAlt / 10
      skyInner = `rgb(${Math.round(80+120*t)},${Math.round(40+80*t)},${Math.round(120+50*(1-t))})`
      skyMid = '#1a1048'; skyOuter = '#060510'; skyMidStop = 0.55
    } else if (sunAlt > -6) {
      // Civil twilight
      const t = (sunAlt + 6) / 6
      skyInner = `rgb(${Math.round(50+80*t)},${Math.round(20+40*t)},${Math.round(90+50*t)})`
      skyMid = '#0e0a22'; skyOuter = '#040310'; skyMidStop = 0.6
    } else if (sunAlt > -12) {
      // Nautical twilight — deep indigo
      const t = (sunAlt + 12) / 6
      skyInner = `rgb(${Math.round(20+30*t)},${Math.round(10+20*t)},${Math.round(55+35*t)})`
      skyMid = '#080618'; skyOuter = '#020408'; skyMidStop = 0.6
    } else if (sunAlt > -18) {
      // Astronomical twilight — almost dark
      skyInner = '#0d1235'; skyMid = '#07091a'; skyOuter = '#020408'; skyMidStop = 0.6
    } else {
      // Full night
      skyInner = '#0d1235'; skyMid = '#07091a'; skyOuter = '#020408'; skyMidStop = 0.6
    }
    const skyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    skyGrad.addColorStop(0, skyInner)
    skyGrad.addColorStop(skyMidStop, skyMid)
    skyGrad.addColorStop(1, skyOuter)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = skyGrad; ctx.fill()

    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()

    // Grid / altitude rings
    if (showGrid) {
      for (const alt of [15, 30, 45, 60, 75]) {
        const ringR = rz * (90 - alt) / 90
        if (ringR > r) continue
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = alt % 30 === 0 ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 1; ctx.stroke()
        if (alt % 30 === 0) {
          ctx.font = '9px system-ui'; ctx.fillStyle = 'rgba(99,102,241,0.5)'; ctx.textAlign = 'left'
          ctx.fillText(`${alt}°`, cx + ringR + 3, cy - 2)
        }
      }
      for (let az = 0; az < 360; az += 45) {
        const { x, y } = project(0, (az + rotation + 360) % 360, cx, cy, rz, 0)
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y)
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.stroke()
      }
    } else {
      for (const alt of [30, 60]) {
        const ringR = rz * (90 - alt) / 90
        if (ringR > r) continue
        ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
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

    const lst = lstNow

    // ── Milky Way band ──
    if (showMilkyWay) {
      for (const [b, lw, baseAlpha] of MW_LAYERS) {
        ctx.beginPath()
        let started = false
        for (let li = 0; li <= 108; li++) {
          const l = (li / 108) * 360
          const { ra, dec } = galToEquatorial(l, b)
          const hz = toHorizon(ra, dec, lst, loc.lat)
          const pt = project(hz.alt, (hz.az + rotation) % 360, cx, cy, rz, 0)
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
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, rz, 0)
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

    // ── Constellation artwork (mythological figure halos) ──
    if (showConstellations && showConArt) {
      // For each major constellation, draw a glowing halo blob over its area
      const CON_ART: { name: string; pts: [number, number][]; color: string }[] = [
        { name: 'Orion', color: '#6688ff', pts: [[5.24,-8.2],[5.40,-0.3],[5.60,-1.2],[5.90,7.4],[5.42,6.3],[5.80,-1.9],[5.79,-9.7]] },
        { name: 'Ursa Major', color: '#4488cc', pts: [[11.06,61.8],[11.03,56.4],[11.90,53.7],[12.26,57.0],[13.40,55.0],[13.79,49.3],[14.0,48],[13.5,50],[12.1,50],[10.9,57]] },
        { name: 'Leo', color: '#ffaa44', pts: [[9.88,26.0],[10.28,23.4],[10.33,19.8],[10.14,12.0],[11.24,20.5],[11.82,14.6],[11.24,15.4]] },
        { name: 'Scorpius', color: '#ff4422', pts: [[15.93,-19.8],[15.99,-22.6],[16.49,-26.4],[16.86,-34.3],[17.17,-37.1],[17.56,-37.1],[17.51,-37.3],[17.62,-43.0],[17.7,-40],[17.3,-35],[17.0,-30],[16.5,-24],[15.8,-19]] },
        { name: 'Cassiopeia', color: '#cc88ff', pts: [[0.15,59.1],[0.68,56.5],[0.95,60.7],[1.43,60.2],[1.91,63.7],[1.6,65],[1.0,62],[0.5,61],[0.0,60]] },
        { name: 'Cygnus', color: '#44ccff', pts: [[19.49,27.96],[20.37,40.26],[20.69,45.28],[21.22,36.7],[22.47,49.2],[21.5,52],[20.5,47],[20.0,42],[19.8,30]] },
        { name: 'Gemini', color: '#44ee88', pts: [[6.62,16.4],[7.06,20.6],[7.58,31.9],[7.75,28.0],[7.07,22.5],[6.90,18]] },
        { name: 'Taurus', color: '#ffcc44', pts: [[3.78,24.1],[4.60,16.5],[5.44,28.6],[5.63,21.1],[4.5,22],[4.0,24]] },
        { name: 'Sagittarius', color: '#ff8844', pts: [[18.10,-21.1],[18.35,-29.8],[18.40,-34.4],[18.92,-26.3],[19.0,-25],[18.7,-22],[18.2,-20]] },
        { name: 'Aquila', color: '#88ffcc', pts: [[19.10,13.9],[19.77,10.6],[19.85,8.9],[19.92,6.4],[20.19,-0.8],[19.7,4],[19.3,10]] },
        { name: 'Perseus', color: '#cc99ff', pts: [[3.08,53.5],[3.40,49.9],[3.14,41.0],[3.72,47.8],[3.96,40.0],[3.86,31.9],[3.7,38],[3.1,45]] },
        { name: 'Boötes', color: '#ffee88', pts: [[13.91,18.4],[14.26,19.2],[14.75,27.1],[15.03,40.4],[14.53,30.4],[14.3,24],[14.0,19]] },
      ]

      CON_ART.forEach(({ pts, color }) => {
        const projected = pts.map(([ra, dec]) => {
          const hz = toHorizon(ra, dec, lst, loc.lat)
          if (hz.alt < -10) return null
          return project(hz.alt, (hz.az + rotation) % 360, cx, cy, rz, 0)
        }).filter(Boolean) as { x: number; y: number }[]
        if (projected.length < 3) return
        ctx.beginPath()
        ctx.moveTo(projected[0].x, projected[0].y)
        projected.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
        ctx.closePath()
        ctx.fillStyle = color + '0c'
        ctx.fill()
        ctx.strokeStyle = color + '25'
        ctx.lineWidth = 12
        ctx.lineJoin = 'round'
        ctx.filter = 'blur(8px)'
        ctx.stroke()
        ctx.filter = 'none'
        ctx.lineWidth = 1
      })
    }

    // ── Constellation lines + labels ──
    if (showConstellations) {
      const drawConLine = (ra1: number, dec1: number, ra2: number, dec2: number) => {
        const ha = toHorizon(ra1, dec1, lst, loc.lat)
        const hb = toHorizon(ra2, dec2, lst, loc.lat)
        if (ha.alt < -3 || hb.alt < -3) return
        const pa = project(ha.alt, (ha.az + rotation) % 360, cx, cy, rz, 0)
        const pb = project(hb.alt, (hb.az + rotation) % 360, cx, cy, rz, 0)
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y)
        ctx.strokeStyle = 'rgba(120,135,255,0.45)'; ctx.lineWidth = 1.2; ctx.stroke()
      }

      CONSTELLATION_LINES.forEach(({ a, b }) => {
        const sa = STARS[a], sb = STARS[b]; if (!sa || !sb) return
        drawConLine(sa[1], sa[2], sb[1], sb[2])
      })
      EXTRA_CON_LINES.forEach(({ ra1, dec1, ra2, dec2 }) => drawConLine(ra1, dec1, ra2, dec2))

      if (showLabels) {
        const conMap = new Map<string, { sx: number; sy: number; n: number }>()
        const accumulatePt = (ra: number, dec: number, name: string) => {
          const hz = toHorizon(ra, dec, lst, loc.lat)
          if (hz.alt < 3) return
          const pt = project(hz.alt, (hz.az + rotation) % 360, cx, cy, rz, 0)
          const cur = conMap.get(name) ?? { sx: 0, sy: 0, n: 0 }
          conMap.set(name, { sx: cur.sx + pt.x, sy: cur.sy + pt.y, n: cur.n + 1 })
        }
        CONSTELLATION_LINES.forEach(({ a, b, name }) => {
          const sa = STARS[a], sb = STARS[b]
          if (sa) accumulatePt(sa[1], sa[2], name)
          if (sb) accumulatePt(sb[1], sb[2], name)
        })
        EXTRA_CON_LINES.forEach(({ ra1, dec1, ra2, dec2, name }) => {
          accumulatePt(ra1, dec1, name)
          accumulatePt(ra2, dec2, name)
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
      if (mag > magLimit) return
      const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
      if (alt < -5) return
      const { x, y } = project(alt, (az + rotation) % 360, cx, cy, rz, 0)
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
        const label = wantLabel && wantTemp ? `${name} · ${spectralClass(temp)} ${fmtTempShort(temp)}`
          : wantLabel ? name
          : `${spectralClass(temp)} ${fmtTempShort(temp)}`

        const tc = wantTemp ? tempColor(temp) : 'rgba(200,212,255,0.9)'
        ctx.font = `${mag < 0.5 ? 11 : 9}px 'Space Grotesk', system-ui`
        ctx.textAlign = 'left'
        const lx = x + starR + 4, ly = y + 3
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(label, lx + 1, ly + 1)
        ctx.fillStyle = tc;               ctx.fillText(label, lx, ly)
      }

      if (alt > -5) hitRef.current.push({ name, x, y, temp, mag, alt, color, ra, dec })
    })

    // ── Hipparcos catalog (faint stars up to mag 6) ──
    if (hipStars.length > 0) {
      hipStars.forEach(([ra, dec, mag, temp, name]) => {
        if (mag < 2.5 || mag > magLimit) return
        const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
        if (alt < -3) return
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, rz, 0)
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
        if (mag < 5) hitRef.current.push({ name: name ?? `HIP star (mag ${mag})`, x, y, temp, mag, alt, color: col, ra, dec })
      })
    }

    // ── Planets ──
    if (showPlanets) {
      PLANETS.forEach(planet => {
        const radec = computeRADec(planet.name, d)
        if (!radec) return
        const { alt, az } = toHorizon(radec.ra, radec.dec, lst, loc.lat)
        if (alt < -5) return
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, rz, 0)
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

        // Phase shadow for Venus and Mercury (inner planets with visible phases)
        if (planet.name === 'Venus' || planet.name === 'Mercury') {
          const k = computePlanetPhase(planet.name, d)
          const illum = k
          ctx.save()
          ctx.beginPath(); ctx.arc(x, y, planet.size, 0, Math.PI * 2); ctx.clip()
          ctx.fillStyle = 'rgba(5,8,30,0.88)'
          ctx.beginPath()
          if (illum < 0.5) {
            ctx.arc(x, y, planet.size, Math.PI / 2, -Math.PI / 2)
            ctx.ellipse(x, y, planet.size * (1 - illum * 2), planet.size, 0, -Math.PI / 2, Math.PI / 2)
          } else {
            ctx.arc(x, y, planet.size, -Math.PI / 2, Math.PI / 2)
            ctx.ellipse(x, y, planet.size * (illum * 2 - 1), planet.size, 0, Math.PI / 2, -Math.PI / 2)
          }
          ctx.fill()
          ctx.restore()
        }

        // Jupiter equatorial bands
        if (planet.name === 'Jupiter') {
          ctx.save()
          ctx.beginPath(); ctx.arc(x, y, planet.size, 0, Math.PI * 2); ctx.clip()
          const bands = [
            { y: -0.6, h: 0.25, color: 'rgba(180,130,90,0.35)' },
            { y:  0.1, h: 0.2,  color: 'rgba(160,110,70,0.30)' },
            { y:  0.45, h: 0.18, color: 'rgba(170,120,80,0.28)' },
          ]
          bands.forEach(b => {
            ctx.fillStyle = b.color
            ctx.fillRect(x - planet.size, y + b.y * planet.size, planet.size * 2, b.h * planet.size)
          })
          ctx.restore()
        }

        // Mars slight phase
        if (planet.name === 'Mars') {
          const k = computePlanetPhase('Mars', d)
          if (k < 0.88) {
            ctx.save()
            ctx.beginPath(); ctx.arc(x, y, planet.size, 0, Math.PI * 2); ctx.clip()
            ctx.fillStyle = 'rgba(5,8,30,0.55)'
            ctx.beginPath()
            ctx.arc(x, y, planet.size, Math.PI / 2, -Math.PI / 2)
            ctx.ellipse(x, y, planet.size * (1 - k * 1.5), planet.size, 0, -Math.PI / 2, Math.PI / 2)
            ctx.fill()
            ctx.restore()
          }
        }

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
        hitRef.current.push({ name: planet.name, x, y, alt, color: planet.color, isPlanet: true, symbol: planet.symbol, ra: radec.ra, dec: radec.dec })
      })
    }

    // ── Moon ──
    {
      const moon = computeMoon(d)
      const { alt, az } = toHorizon(moon.ra, moon.dec, lst, loc.lat)
      if (alt > -5) {
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, rz, 0)
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
        hitRef.current.push({ name: `Moon (${Math.round(moon.phase <= 0.5 ? moon.phase * 200 : (1 - moon.phase) * 200)}% lit)`, x, y, alt, color: '#c8d2ff', isPlanet: true, symbol: '🌙', ra: moon.ra, dec: moon.dec })
      }
    }

    // ── ISS ──
    if (issPos) {
      const { alt, az } = issToAltAz(issPos.lat, issPos.lng, issPos.alt, loc.lat, loc.lng)
      if (alt > 0) {
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, rz, 0)
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

    // ── Eyepiece FOV circle ──
    if (showFOV && fovScope > 0 && fovEP > 0 && fovAFOV > 0) {
      const mag = fovScope / fovEP
      const trueFOV = fovAFOV / mag
      const fovR = (trueFOV / 2) / 90 * r
      ctx.beginPath(); ctx.arc(cx, cy, fovR, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,210,0,0.75)'; ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
      ctx.font = 'bold 9px \'Space Grotesk\', system-ui'; ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(`FOV ${trueFOV.toFixed(2)}° · ${Math.round(mag)}×`, cx, cy - fovR - 7)
      ctx.fillStyle = 'rgba(255,210,0,0.9)'; ctx.fillText(`FOV ${trueFOV.toFixed(2)}° · ${Math.round(mag)}×`, cx, cy - fovR - 8)
      ctx.textAlign = 'left'
    }

    // Zoom level indicator
    if (zoomLevel > 1) {
      const edgeAlt = Math.round(90 - 90 / zoomLevel)
      ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(`≥${edgeAlt}° · ${zoomLevel}×`, cx + 1, cy - r + 13)
      ctx.fillStyle = 'rgba(99,200,255,0.85)'; ctx.fillText(`≥${edgeAlt}° · ${zoomLevel}×`, cx, cy - r + 12)
      ctx.textAlign = 'left'
    }

    ctx.restore()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- draw deps listed explicitly; helper fns are module-scope stable
  }, [loc, time, timeOffsetMin, rotation, showPlanets, showConstellations, showMilkyWay, showDSOs, showLabels, showTemp, showGrid, d, effectiveTime, searchQuery, issPos, hipStars, ngcObjs, magLimit, showConArt, showFOV, fovScope, fovEP, fovAFOV, zoomLevel])

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

  // Load observing list from localStorage
  useEffect(() => { setObsList(loadObs()) }, [])

  // Conjunctions & occultations — next 10 days, pairs within 4°
  const conjunctions = useMemo(() => {
    try {
      type ConjResult = { date: string; obj1: string; sym1: string; color1: string; obj2: string; sym2: string; color2: string; sep: number }
      const results: ConjResult[] = []
      for (let day = 0; day <= 10; day++) {
        const t = new Date(time.getTime() + day * 86400000)
        const dd = julianDate(t) - 2451543.5
        const bodies: { name: string; sym: string; ra: number; dec: number; color: string }[] = []
        const moonPos = computeMoon(dd)
        bodies.push({ name: 'Moon', sym: '🌙', ra: moonPos.ra, dec: moonPos.dec, color: '#c8d2ff' })
        for (const p of PLANETS) {
          const radec = computeRADec(p.name, dd)
          if (radec) bodies.push({ name: p.name, sym: p.symbol, ra: radec.ra, dec: radec.dec, color: p.color })
        }
        for (let i = 0; i < bodies.length; i++) {
          for (let j = i + 1; j < bodies.length; j++) {
            const sep = angSep(bodies[i].ra, bodies[i].dec, bodies[j].ra, bodies[j].dec)
            if (sep < 4) {
              const dateStr = t.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
              const pairKey = [bodies[i].name, bodies[j].name].sort().join('|')
              if (!results.find(r => r.date === dateStr && [r.obj1, r.obj2].sort().join('|') === pairKey)) {
                results.push({
                  date: dateStr,
                  obj1: bodies[i].name, sym1: bodies[i].sym, color1: bodies[i].color,
                  obj2: bodies[j].name, sym2: bodies[j].sym, color2: bodies[j].color,
                  sep: Math.round(sep * 10) / 10,
                })
              }
            }
          }
        }
      }
      return results
    } catch {
      return []
    }
  }, [time])

  // Tonight's Sky Planner
  const plannerData = useMemo(() => { try {
    // Scan tonight in 15-min steps to find dark window (Sun < -18°)
    const tonight = new Date(time)
    tonight.setHours(20, 0, 0, 0)
    const darkWindow: { start: Date; end: Date; peak: Date } | null = (() => {
      let s: Date | null = null, e: Date | null = null, peakT = tonight, peakDark = 0
      for (let m = 0; m < 720; m += 15) {
        const t = new Date(tonight.getTime() + m * 60000)
        const dd = julianDate(t) - 2451543.5
        const sunPos = computeRADec('Sun', dd)
        if (!sunPos) continue
        const lst = localSiderealTime(t, loc.lng)
        const { alt } = toHorizon(sunPos.ra, sunPos.dec, lst, loc.lat)
        if (alt < -18) {
          if (!s) s = t
          e = t
          const darkness = -alt
          if (darkness > peakDark) { peakDark = darkness; peakT = t }
        }
      }
      return s && e ? { start: s, end: e, peak: peakT } : null
    })()

    // Moon at peak dark time
    const peakT = darkWindow?.peak ?? tonight
    const peakDD = julianDate(peakT) - 2451543.5
    const moon = computeMoon(peakDD)
    const moonEph = calcRiseSetTransit(moon.ra, moon.dec, peakT, loc.lat, loc.lng)
    const moonPct = Math.round(moon.phase * 100)

    // Sky quality score (0-10)
    const moonUp = moonEph.maxAlt > 0
    const moonScore = moonUp ? Math.max(0, 10 - moonPct / 10 - moonEph.maxAlt / 18) : 10
    const hasDark = !!darkWindow
    const skyScore = hasDark ? Math.min(10, Math.round(moonScore)) : 0

    // Collect target objects for the peak dark time
    type PlanTarget = { name: string; type: string; mag: number; alt: number; az: number; color: string; desc: string }
    const targets: PlanTarget[] = []
    const lst = localSiderealTime(peakT, loc.lng)

    // Named stars (only bright ones, mag < 2)
    for (const [name, ra, dec, mag, color] of STARS) {
      if (mag > 2) continue
      const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
      if (alt > 15) targets.push({ name, type: 'Star', mag, alt, az, color, desc: `Mag ${mag.toFixed(1)} bright star` })
    }

    // Planets
    for (const p of PLANETS) {
      const radec = computeRADec(p.name, peakDD)
      if (!radec) continue
      const { alt, az } = toHorizon(radec.ra, radec.dec, lst, loc.lat)
      if (alt > 10) targets.push({ name: p.name, type: 'Planet', mag: 0, alt, az, color: p.color, desc: `${p.symbol} Planet` })
    }

    // Moon itself
    { const { alt, az } = toHorizon(moon.ra, moon.dec, lst, loc.lat)
      if (alt > 10) targets.push({ name: 'Moon', type: 'Moon', mag: -12.7, alt, az, color: '#c8d2ff', desc: `${moonPct}% illuminated` }) }

    // Built-in DSOs
    for (const dso of DSOS) {
      const { alt, az } = toHorizon(dso.ra, dso.dec, lst, loc.lat)
      if (alt > 15) targets.push({ name: dso.name, type: DSO_LABEL[dso.type], mag: dso.mag, alt, az, color: DSO_COLOR[dso.type], desc: `${DSO_LABEL[dso.type]} · mag ${dso.mag.toFixed(1)}` })
    }

    // Messier catalog objects (bright enough for binoculars)
    for (const m of MESSIER) {
      if (m.mag > 9.5) continue
      const { alt, az } = toHorizon(m.ra, m.dec, lst, loc.lat)
      if (alt > 15 && !targets.find(t => t.name === m.name)) {
        targets.push({ name: `${m.id} ${m.name}`, type: m.type, mag: m.mag, alt, az, color: m.color, desc: `${m.type} · mag ${m.mag.toFixed(1)} · ${m.dist}` })
      }
    }

    // NGC catalog (brightest objects only, mag < 9)
    for (const [ra, dec, mag, type, name] of ngcObjs) {
      if (mag > 8.5) continue
      const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
      if (alt > 20 && !targets.find(t => t.name === name)) {
        const color = DSO_COLOR[type as keyof typeof DSO_COLOR] ?? '#aaaaff'
        targets.push({ name, type: DSO_LABEL[type as keyof typeof DSO_LABEL] ?? type, mag, alt, az, color, desc: `${type} · mag ${mag.toFixed(1)}` })
      }
    }

    // Sort by altitude
    targets.sort((a, b) => b.alt - a.alt)
    const top8 = targets.slice(0, 8)

    // Variable star events — next minimum / maximum
    const VAR_STARS = [
      { name: 'Algol β Per',   T0_jd: 2445641.5,  period: 2.8673043, ra: 3.136,  dec: 40.96, type: 'Eclipsing binary', color: '#f87171', event: 'minimum' },
      { name: 'Delta Cephei',  T0_jd: 2443143.5,  period: 5.36634,   ra: 22.497, dec: 58.41, type: 'Cepheid',          color: '#fbbf24', event: 'maximum' },
      { name: 'Mira ο Cet',    T0_jd: 2443484.5,  period: 331.96,    ra: 2.322,  dec: -2.97, type: 'Mira variable',    color: '#c084fc', event: 'maximum' },
      { name: 'RR Lyrae',      T0_jd: 2446998.5,  period: 0.566867,  ra: 19.384, dec: 42.78, type: 'RR Lyrae',         color: '#38bdf8', event: 'maximum' },
    ]
    const jdPeak = julianDate(peakT)
    const varEvents = VAR_STARS.map(v => {
      const phase = ((jdPeak - v.T0_jd) % v.period + v.period) % v.period
      const daysToNext = v.period - phase
      const hoursToNext = daysToNext * 24
      const { alt } = toHorizon(v.ra, v.dec, lst, loc.lat)
      const hh = Math.floor(hoursToNext)
      const mm = Math.round((hoursToNext - hh) * 60)
      return { ...v, daysToNext, hoursToNext, label: `${hh}h ${mm}m`, alt: Math.round(alt) }
    }).sort((a, b) => a.hoursToNext - b.hoursToNext)

    const moonPhaseIcon = moonPct < 10 ? '🌑' : moonPct < 35 ? '🌒' : moonPct < 65 ? '🌓' : moonPct < 90 ? '🌔' : '🌕'

    return { darkWindow, hasDark, moon, moonPct, moonPhaseIcon, moonEph, moonUp, skyScore, top8, varEvents, peakTime: fmtHHMM(peakT), darkStart: darkWindow ? fmtHHMM(darkWindow.start) : '—', darkEnd: darkWindow ? fmtHHMM(darkWindow.end) : '—' }
  } catch { return { darkWindow: null, hasDark: false, moon: { ra: 0, dec: 0, phase: 0 }, moonPct: 0, moonPhaseIcon: '🌙', moonEph: { rise: '—', transit: '—', set: '—', maxAlt: 0 }, moonUp: false, skyScore: 0, top8: [], varEvents: [], peakTime: '—', darkStart: '—', darkEnd: '—' } }
  }, [time, loc, ngcObjs])

  const saveToObs = useCallback((item: HitItem) => {
    const obs: ObsItem = {
      name: item.name,
      type: item.isPlanet ? 'planet' : item.isDSO ? 'dso' : 'star',
      color: item.color,
      mag: item.mag,
      ra: item.ra,
      dec: item.dec,
      savedAt: Date.now(),
    }
    const list = loadObs()
    if (!list.find(o => o.name === obs.name)) {
      const next = [...list, obs]
      try { localStorage.setItem(OBS_KEY, JSON.stringify(next)) } catch {}
      setObsList(next)
    }
  }, [])

  const lastISSAltRef = useRef<number | null>(null)
  const locRef = useRef(loc)
  locRef.current = loc

  useEffect(() => {
    if ('Notification' in window) setNotifPerm(Notification.permission)
  }, [])

  useEffect(() => {
    const fetchISS = () => {
      fetch('/api/iss').then(r => r.json()).then(d => {
        if (d?.latitude != null) {
          const pos = { lat: +d.latitude, lng: +d.longitude, alt: +(d.altitude ?? 420) }
          setIssPos(pos)
          const { alt } = issToAltAz(pos.lat, pos.lng, pos.alt, locRef.current.lat, locRef.current.lng)
          if (lastISSAltRef.current !== null && lastISSAltRef.current <= 0 && alt > 0 && Notification.permission === 'granted') {
            new Notification('🛸 ISS is now visible!', {
              body: `The ISS just rose above your horizon — look up! Altitude: ${Math.round(alt)}°`,
              icon: '/favicon.svg',
              tag: 'iss-rise',
            })
          }
          lastISSAltRef.current = alt
        }
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

  // ── Search autocomplete suggestions ──
  const searchSuggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return []
    const q = searchQuery.toLowerCase()
    const starNames  = STARS.map(s => s[0])
    const planetNames = PLANETS.map(p => p.name)
    const all = [...starNames, ...planetNames]
    return all.filter(name => name.toLowerCase().includes(q)).slice(0, 6)
  }, [searchQuery])

  // ── Goto: rotate map so named object is at top ──
  const gotoObject = useCallback((name: string) => {
    setSearchQuery(name)
    setShowSuggestions(false)
    setSuggestionIdx(-1)
    // Look up by star first
    const star = STARS.find(s => s[0].toLowerCase() === name.toLowerCase())
    if (star) {
      const hz = toHorizon(star[1], star[2], lst0, loc.lat)
      setRotation(-hz.az)
      return
    }
    // Try planet positions (already have az computed)
    const pPos = planetPositions.find(p => p.name.toLowerCase() === name.toLowerCase())
    if (pPos) {
      setRotation(-pPos.az)
    }
  }, [lst0, loc.lat, planetPositions])

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
          <h3 className="text-white font-bold text-lg">
            {tmLocked ? '⏳ Time Machine' : "Tonight's Sky"}
          </h3>
          <p className="text-gray-500 text-xs">
            {hipStars.length > 0 ? `${(visibleStars + hipStars.length).toLocaleString()} stars` : `${visibleStars} stars`}
            {ngcObjs.length > 0 && ` · ${ngcObjs.length.toLocaleString()} DSOs`}
            {' · '}{city} · {effectiveTime.toLocaleDateString('en-US',{month:'short',day:'numeric',year:tmLocked?'numeric':undefined})} {effectiveTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="ml-auto">
          {tmLocked
            ? <span style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 700, background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 8, padding: '2px 8px' }}>
                🔒 {effectiveTime.getFullYear()}
              </span>
            : timeOffsetMin === 0
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

      {/* Time Machine */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setShowTimeMachine(v => !v)}
            className="text-xs px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1"
            style={showTimeMachine
              ? { background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.5)', color: '#c4b5fd' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
            ⏳ Time Machine
          </button>
          {!showTimeMachine && (
            <>
              <button onClick={() => { setTmLocked(false); setTimeOffsetMin(0) }}
                className="text-xs px-2.5 py-1 rounded-lg font-semibold transition shrink-0"
                style={!tmLocked && timeOffsetMin === 0
                  ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
                ⏱ Now
              </button>
              <input type="range" min={-720} max={720} step={30}
                value={tmLocked ? 0 : timeOffsetMin}
                onChange={e => { setTmLocked(false); setTimeOffsetMin(Number(e.target.value)) }}
                data-noswipe
                className="flex-1 min-w-0" style={{ accentColor: '#6366f1', touchAction: 'none' }}
                aria-label="Time offset" />
              <span className="text-xs font-semibold shrink-0 w-16 text-right"
                style={{ color: !tmLocked && timeOffsetMin === 0 ? '#34d399' : '#c4b5fd' }}>
                {fmtHHMM(effectiveTime)}
              </span>
            </>
          )}
        </div>

        {showTimeMachine && (
          <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)' }}>
            <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest mb-2">Travel to any date · 1900 – 2100</p>
            <div className="flex gap-2 mb-2">
              <input type="date" value={tmDate} min="1900-01-01" max="2100-12-31"
                onChange={e => { setTmDate(e.target.value); setTmLocked(true) }}
                className="flex-1 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(167,139,250,0.4)', colorScheme: 'dark' }} />
              <select value={tmHour} onChange={e => { setTmHour(Number(e.target.value)); setTmLocked(true) }}
                className="w-24 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(167,139,250,0.4)' }}>
                {Array.from({length:24},(_,i)=>(
                  <option key={i} value={i} style={{background:'#0d1235'}}>{String(i).padStart(2,'0')}:00</option>
                ))}
              </select>
            </div>
            {/* Year jump buttons */}
            <div className="flex flex-wrap gap-1 mb-2">
              {[-100,-50,-10,-1,1,10,50,100].map(dy => (
                <button key={dy} onClick={() => {
                  const [y,m,d2] = tmDate.split('-')
                  const ny = Number(y) + dy
                  if (ny < 1900 || ny > 2100) return
                  setTmDate(`${ny}-${m}-${d2}`)
                  setTmLocked(true)
                }} className="text-[10px] px-2 py-1 rounded-lg font-bold transition"
                  style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', color: dy < 0 ? '#f87171' : '#4ade80' }}>
                  {dy > 0 ? `+${dy}yr` : `${dy}yr`}
                </button>
              ))}
            </div>
            {/* Event presets */}
            <div className="flex flex-wrap gap-1 mb-2">
              {[
                { label: '☀️ Eclipse 2026', date: '2026-08-12', h: 17 },
                { label: '☀️ Eclipse 2027', date: '2027-08-02', h: 10 },
                { label: '🌠 Leonids 2026', date: '2026-11-17', h: 3 },
                { label: '🌠 Perseids 2026', date: '2026-08-12', h: 23 },
                { label: '♀ Venus Conj', date: '2026-11-02', h: 5 },
                { label: '🌕 Full Moon', date: tmDate, h: 0 },
              ].map(preset => (
                <button key={preset.label} onClick={() => { setTmDate(preset.date); setTmHour(preset.h); setTmLocked(true) }}
                  className="text-[9px] px-2 py-1 rounded-lg transition"
                  style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc' }}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[10px]" style={{ color: '#a78bfa' }}>
                {tmLocked ? `🔒 ${effectiveTime.toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'})} ${String(tmHour).padStart(2,'0')}:00` : '🔴 Live'}
              </div>
              <button onClick={() => { setTmLocked(false); setTimeOffsetMin(0); setTmDate(todayStr()); setTmHour(new Date().getHours()) }}
                className="text-[10px] px-2.5 py-1 rounded-lg font-semibold transition"
                style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399' }}>
                ⏱ Return to Now
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Magnitude limit slider */}
      <div className="flex items-center gap-2 mb-3" data-noswipe>
        <span className="text-xs text-gray-500 font-semibold shrink-0">✦ Mag limit</span>
        <input
          type="range" min={1} max={9.5} step={0.5}
          value={magLimit}
          onChange={e => setMagLimit(Number(e.target.value))}
          data-noswipe
          className="flex-1 min-w-0"
          style={{ accentColor: '#c4b5fd', touchAction: 'none' }}
          aria-label="Magnitude limit"
        />
        <span className="text-xs font-bold shrink-0 w-8 text-right" style={{ color: '#c4b5fd' }}>{magLimit.toFixed(1)}</span>
        <span className="text-xs text-gray-600 shrink-0">
          ({magLimit <= 2 ? 'Bright stars' : magLimit <= 4 ? 'Naked eye' : magLimit <= 6 ? 'Dark sky' : magLimit <= 7 ? 'Binoculars' : magLimit <= 8.5 ? 'Telescope' : 'Deep telescope'})
        </span>
      </div>

      {/* Toggle controls */}
      <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Map display options">
        {([
          { key: 'planets',        label: '🪐 Planets',       val: showPlanets,        set: setShowPlanets },
          { key: 'constellations', label: '✦ Constellations', val: showConstellations,  set: setShowConstellations },
          { key: 'conart',         label: '🎨 Con. Art',       val: showConArt,          set: setShowConArt },
          { key: 'milkyway',       label: '🌠 Milky Way',     val: showMilkyWay,        set: setShowMilkyWay },
          { key: 'dsos',           label: '🔭 Deep Sky',      val: showDSOs,            set: setShowDSOs },
          { key: 'labels',         label: '🏷 Labels',         val: showLabels,         set: setShowLabels },
          { key: 'temp',           label: '🌡 Temperature',    val: showTemp,           set: setShowTemp },
          { key: 'grid',           label: '⊕ Grid',            val: showGrid,           set: setShowGrid },
          { key: 'fov',            label: '⊙ FOV Circle',       val: showFOV,            set: setShowFOV },
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
        <button
          onClick={() => setGlobeMode(g => !g)}
          aria-pressed={globeMode}
          style={globeMode
            ? { background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.6)', color: '#c4b5fd' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
        >
          🌐 Globe
        </button>
        <button
          onClick={() => setShowEphemeris(e => !e)}
          aria-pressed={showEphemeris}
          style={showEphemeris
            ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
        >
          📅 Ephemeris
        </button>
        {'Notification' in window && (
          <button
            onClick={() => {
              if (notifPerm === 'granted') return
              Notification.requestPermission().then(p => setNotifPerm(p))
            }}
            style={notifPerm === 'granted'
              ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
            title={notifPerm === 'granted' ? 'ISS alerts enabled' : 'Enable ISS rise alerts'}
          >
            {notifPerm === 'granted' ? '🔔 Alerts ON' : '🔕 ISS Alerts'}
          </button>
        )}
        <button
          onClick={() => setShowObsList(o => !o)}
          aria-pressed={showObsList}
          style={showObsList
            ? { background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
        >
          🔭 List{obsList.length > 0 ? ` (${obsList.length})` : ''}
        </button>
        <button
          onClick={() => setShowEvents(ev => !ev)}
          aria-pressed={showEvents}
          style={showEvents
            ? { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)', color: '#a78bfa' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
        >
          🌠 Events{conjunctions.length > 0 ? ` (${conjunctions.length})` : ''}
        </button>
        <button
          onClick={() => setShowPlanner(p => !p)}
          aria-pressed={showPlanner}
          style={showPlanner
            ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
        >
          🌙 Tonight
        </button>
        <button
          onClick={() => setShowMessier(m => !m)}
          aria-pressed={showMessier}
          style={showMessier
            ? { background: 'rgba(255,153,204,0.15)', border: '1px solid rgba(255,153,204,0.4)', color: '#ff99cc' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
        >
          🌌 Messier ({MESSIER.length})
        </button>
        <button
          onClick={() => setNvMode(n => !n)}
          aria-pressed={nvMode}
          style={nvMode
            ? { background: 'rgba(220,38,38,0.25)', border: '1px solid rgba(220,38,38,0.6)', color: '#fca5a5' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
          title="Red night-vision mode — preserves dark adaptation"
        >
          🔴 Night Vision
        </button>
      </div>

      {/* FOV circle controls */}
      {showFOV && (
        <div className="flex flex-wrap items-center gap-3 mb-3 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgba(255,210,0,0.06)', border: '1px solid rgba(255,210,0,0.2)' }}>
          <span className="text-yellow-400 font-bold shrink-0">⊙ Eyepiece FOV</span>
          <label className="flex items-center gap-1 text-gray-400">
            Scope
            <input type="number" min={200} max={4000} value={fovScope}
              onChange={e => setFovScope(Math.max(1, +e.target.value))}
              className="w-16 px-1.5 py-0.5 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none"
            />mm
          </label>
          <label className="flex items-center gap-1 text-gray-400">
            Eyepiece
            <input type="number" min={2} max={55} value={fovEP}
              onChange={e => setFovEP(Math.max(1, +e.target.value))}
              className="w-12 px-1.5 py-0.5 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none"
            />mm
          </label>
          <label className="flex items-center gap-1 text-gray-400">
            AFOV
            <input type="number" min={20} max={120} value={fovAFOV}
              onChange={e => setFovAFOV(Math.max(1, +e.target.value))}
              className="w-12 px-1.5 py-0.5 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none"
            />°
          </label>
          <span className="font-bold text-yellow-300 ml-auto shrink-0">
            = {(fovAFOV / (fovScope / fovEP)).toFixed(2)}° · {Math.round(fovScope / fovEP)}×
          </span>
        </div>
      )}

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
      <div className="relative mb-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#6b7280', pointerEvents: 'none', zIndex: 1 }}>🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search star, planet or DSO…"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              setShowSuggestions(true)
              setSuggestionIdx(-1)
            }}
            onFocus={() => { if (searchQuery) setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setSearchQuery('')
                setShowSuggestions(false)
                setSuggestionIdx(-1)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSuggestionIdx(i => Math.min(i + 1, searchSuggestions.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSuggestionIdx(i => Math.max(i - 1, -1))
              } else if (e.key === 'Enter') {
                const target = suggestionIdx >= 0 ? searchSuggestions[suggestionIdx] : searchSuggestions[0]
                if (target) gotoObject(target)
              }
            }}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${searchQuery ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 10,
              padding: '7px 34px 7px 30px',
              color: '#e2e8f0',
              fontSize: 13,
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            aria-label="Search star map"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && searchSuggestions.length > 0}
          />
          {searchQuery && (
            <button
              onMouseDown={e => { e.preventDefault(); setSearchQuery(''); setShowSuggestions(false); setSuggestionIdx(-1) }}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                color: '#9ca3af', fontSize: 16, lineHeight: 1, background: 'none', border: 'none',
                cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
              }}
              aria-label="Clear search"
            >✕</button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showSuggestions && searchSuggestions.length > 0 && (
          <div
            role="listbox"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 50,
              marginTop: 4,
              background: 'rgba(2,5,16,0.95)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            {searchSuggestions.map((name, idx) => {
              const isPlanet = PLANETS.some(p => p.name === name)
              const planet   = isPlanet ? PLANETS.find(p => p.name === name) : null
              const star     = !isPlanet ? STARS.find(s => s[0] === name) : null
              return (
                <button
                  key={name}
                  role="option"
                  aria-selected={idx === suggestionIdx}
                  onMouseDown={e => { e.preventDefault(); gotoObject(name) }}
                  onMouseEnter={() => setSuggestionIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    background: idx === suggestionIdx ? 'rgba(99,102,241,0.18)' : 'transparent',
                    border: 'none',
                    borderBottom: idx < searchSuggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>
                    {isPlanet ? (planet?.symbol ?? '🪐') : '✦'}
                  </span>
                  <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{name}</span>
                  {star && (
                    <span style={{ color: '#4b5563', fontSize: 11, marginLeft: 'auto' }}>
                      mag {(star[3] as number).toFixed(1)}
                    </span>
                  )}
                  {isPlanet && (
                    <span style={{ color: '#4b5563', fontSize: 11, marginLeft: 'auto' }}>planet</span>
                  )}
                  <span style={{ color: '#6366f1', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>→ goto</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Zoom controls */}
      {!globeMode && (
        <div className="flex items-center gap-2 mb-3 justify-center">
          <span className="text-xs text-slate-500">🔍 Zoom</span>
          {[1, 1.5, 2, 3, 4, 6].map(z => (
            <button key={z} onClick={() => setZoomLevel(z)}
              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all border"
              style={zoomLevel === z
                ? { background: 'rgba(99,200,255,0.18)', borderColor: 'rgba(99,200,255,0.5)', color: '#93c5fd' }
                : { background: 'transparent', borderColor: '#374151', color: '#6b7280' }}>
              {z === 1 ? 'All sky' : z === 1.5 ? '60°' : z === 2 ? '45°' : z === 3 ? '30°' : z === 4 ? '22°' : '15°'}
            </button>
          ))}
        </div>
      )}

      {/* Canvas / Globe */}
      <div className="flex justify-center mb-4 relative">
        {globeMode ? (
          <StarGlobe hipStars={hipStars} showConstellations={showConstellations} time={effectiveTime} />
        ) : (
          <>
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
              onMouseLeave={() => setDragging(false)}
              onTouchStart={e => {
                setDragging(true)
                setPrevX(e.touches[0].clientX)
                touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
              }}
              onTouchMove={e => {
                if (!dragging) return
                e.preventDefault()
                // Pinch-to-zoom: two fingers
                if (e.touches.length === 2) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX
                  const dy = e.touches[0].clientY - e.touches[1].clientY
                  const dist = Math.sqrt(dx*dx + dy*dy)
                  if ((touchStartRef.current as {pinchDist?: number}).pinchDist) {
                    const ratio = dist / ((touchStartRef.current as {pinchDist?: number}).pinchDist!)
                    setZoomLevel(z => Math.max(1, Math.min(6, z * ratio)))
                  }
                  ;(touchStartRef.current as {pinchDist?: number}).pinchDist = dist
                  return
                }
                setRotation(r => r + (e.touches[0].clientX - prevX) * 0.5)
                setPrevX(e.touches[0].clientX)
              }}
              onTouchEnd={handleTouchEnd}
            />

            {tooltip && (
              <div
                onMouseLeave={() => setTooltip(null)}
                style={{
                  position: 'absolute',
                  left: tooltip.flipLeft ? tooltip.sx - 172 : tooltip.sx + 12,
                  top:  Math.max(4, tooltip.sy - 10),
                  background: 'rgba(7,9,22,0.97)',
                  border: `1px solid ${tooltip.color}55`,
                  borderRadius: 10,
                  padding: '9px 13px',
                  pointerEvents: 'auto',
                  zIndex: 20,
                  minWidth: 158,
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
                {tooltip.isPlanet && tooltip.ra !== undefined && (() => {
                  const sunRD = computeRADec('Sun', d)
                  if (!sunRD) return null
                  const angDeg = angSep(tooltip.ra!, tooltip.dec ?? 0, sunRD.ra, sunRD.dec)
                  const illum = Math.round((1 + Math.cos(angDeg * DEG)) / 2 * 100)
                  const phaseIcon = illum < 10 ? '🌑' : illum < 35 ? '🌒' : illum < 65 ? '🌓' : illum < 90 ? '🌔' : '🌕'
                  return (
                    <div style={{ color: '#c8d2ff', fontSize: 10, marginTop: 2 }}>
                      {phaseIcon} Illuminated {illum}% · {angDeg.toFixed(1)}° from Sun
                    </div>
                  )
                })()}
                {(() => {
                  const inList = obsList.some(o => o.name === tooltip.name)
                  return (
                    <button
                      onClick={() => { if (!inList) saveToObs(tooltip); }}
                      style={{
                        marginTop: 7,
                        width: '100%',
                        background: inList ? 'rgba(52,211,153,0.12)' : 'rgba(99,102,241,0.15)',
                        border: `1px solid ${inList ? 'rgba(52,211,153,0.35)' : 'rgba(99,102,241,0.3)'}`,
                        borderRadius: 6,
                        color: inList ? '#34d399' : '#a5b4fc',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '4px 8px',
                        cursor: inList ? 'default' : 'pointer',
                      }}
                    >
                      {inList ? '✓ Saved to list' : '+ Add to observing list'}
                    </button>
                  )
                })()}
              </div>
            )}
          </>
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

      {/* Ephemeris table */}
      {showEphemeris && (
        <div className="mt-3" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.18)', borderRadius: 14, padding: '12px 16px' }}>
          <p className="text-xs font-bold mb-3 tracking-wide uppercase" style={{ color: '#34d399' }}>📅 Today's Ephemeris — Rise · Transit · Set</p>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#4b5563', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Object</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>Rise</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>Transit</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>Set</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>Max°</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Sun',     symbol: '☀',  color: '#ffee44', radec: computeRADec('Sun',     d) },
                  { name: 'Moon',    symbol: '🌙', color: '#c8d2ff', radec: computeMoon(d) },
                  ...PLANETS.filter(p => p.name !== 'Sun').map(p => ({ name: p.name, symbol: p.symbol, color: p.color, radec: computeRADec(p.name, d) })),
                ].map(({ name, symbol, color, radec }) => {
                  if (!radec) return null
                  const eph = calcRiseSetTransit(radec.ra, radec.dec, effectiveTime, loc.lat, loc.lng)
                  return (
                    <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '5px 8px', color: '#e2e8f0', fontWeight: 600 }}>
                        <span style={{ marginRight: 5 }}>{symbol}</span>{name}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: eph.rise !== '—' ? '#34d399' : '#374151' }}>{eph.rise}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: color }}>{eph.transit}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: eph.set !== '—' ? '#f87171' : '#374151' }}>{eph.set}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: eph.maxAlt > 0 ? '#9ca3af' : '#374151', fontWeight: 600 }}>
                        {eph.maxAlt > 0 ? `${eph.maxAlt}°` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600 mt-2">Times are local · Based on your selected location · Computed for today</p>
        </div>
      )}

      {/* Observing list panel */}
      {showObsList && (
        <div className="mt-3" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 14, padding: '12px 16px' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold tracking-wide uppercase" style={{ color: '#fbbf24' }}>🔭 My Observing List</p>
            {obsList.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const txt = `My SpaceHub Observing List\n${'─'.repeat(30)}\n` +
                      obsList.map(o => `• ${o.name} (${o.type}${o.mag !== undefined ? `, mag ${o.mag.toFixed(1)}` : ''})`).join('\n')
                    navigator.clipboard.writeText(txt).catch(() => {})
                  }}
                  style={{ fontSize: 10, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}
                >📋 Copy</button>
                <button
                  onClick={() => { try { localStorage.removeItem(OBS_KEY) } catch {}; setObsList([]) }}
                  style={{ fontSize: 10, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
                >Clear all</button>
              </div>
            )}
          </div>
          {obsList.length === 0 ? (
            <p className="text-xs text-gray-600">Hover over any star, planet, or DSO and click "Add to observing list" to save it here.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {obsList.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, boxShadow: `0 0 6px ${item.color}`, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>{item.name}</span>
                    <span className="text-xs ml-2" style={{ color: '#4b5563' }}>
                      {item.type}{item.mag !== undefined ? ` · mag ${item.mag.toFixed(1)}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const next = obsList.filter((_, i) => i !== idx)
                      try { localStorage.setItem(OBS_KEY, JSON.stringify(next)) } catch {}
                      setObsList(next)
                    }}
                    style={{ fontSize: 14, color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                    aria-label={`Remove ${item.name}`}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sky events / conjunctions panel */}
      {showEvents && (
        <div className="mt-3" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 14, padding: '12px 16px' }}>
          <p className="text-xs font-bold mb-3 tracking-wide uppercase" style={{ color: '#a78bfa' }}>🌠 Upcoming Conjunctions — Next 10 Days</p>
          {conjunctions.length === 0 ? (
            <p className="text-xs text-gray-600">No close planetary conjunctions (within 4°) in the next 10 days.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {conjunctions.map((c, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'rgba(139,92,246,0.07)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.12)' }}>
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 52 }}>
                    <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.date.split(',')[0]}</div>
                    <div style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 700 }}>{c.date.split(',').slice(1).join(',').trim()}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: c.color1, fontWeight: 700, fontSize: 13 }}>{c.sym1}</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 12 }}> {c.obj1}</span>
                    <span style={{ color: '#4b5563', fontSize: 11 }}> + </span>
                    <span style={{ color: c.color2, fontWeight: 700, fontSize: 13 }}>{c.sym2}</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 12 }}> {c.obj2}</span>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: c.sep < 1 ? '#f87171' : c.sep < 2 ? '#fbbf24' : '#a78bfa', fontWeight: 700 }}>{c.sep}°</div>
                    <div style={{ fontSize: 9, color: '#4b5563' }}>apart</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-2">Angular separation at midnight · Red = very close (&lt;1°) · Yellow = close (&lt;2°)</p>
        </div>
      )}

      {/* Tonight's Sky Planner */}
      {showPlanner && (
        <div className="mt-3" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.18)', borderRadius: 14, padding: '14px 16px' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold tracking-wide uppercase" style={{ color: '#34d399' }}>🌙 Tonight's Sky Planner</span>
            <span className="ml-auto text-xs text-gray-500">{plannerData.hasDark ? `Dark: ${plannerData.darkStart} – ${plannerData.darkEnd}` : 'No astronomical darkness tonight'}</span>
          </div>

          {/* Sky summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Sky Quality', val: `${plannerData.skyScore}/10`, color: plannerData.skyScore >= 7 ? '#34d399' : plannerData.skyScore >= 4 ? '#fbbf24' : '#f87171' },
              { label: 'Moon', val: `${plannerData.moonPhaseIcon} ${plannerData.moonPct}%`, color: '#c8d2ff' },
              { label: 'Moon Sets', val: plannerData.moonEph.set, color: '#94a3b8' },
              { label: 'Peak Darkness', val: plannerData.peakTime, color: '#34d399' },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-xs text-gray-600">{label}</div>
                <div className="text-sm font-bold mt-0.5" style={{ color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Sky quality bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Sky quality</span>
              <span style={{ color: plannerData.skyScore >= 7 ? '#34d399' : plannerData.skyScore >= 4 ? '#fbbf24' : '#f87171' }}>
                {plannerData.skyScore >= 8 ? 'Excellent — dark sky' : plannerData.skyScore >= 6 ? 'Good — some moonlight' : plannerData.skyScore >= 4 ? 'Fair — bright moon' : 'Poor — full moon / no dark'}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${plannerData.skyScore * 10}%`, background: plannerData.skyScore >= 7 ? '#34d399' : plannerData.skyScore >= 4 ? '#fbbf24' : '#f87171' }} />
            </div>
          </div>

          {/* Top targets */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Best Objects at Peak Darkness</p>
          {plannerData.top8.length === 0 ? (
            <p className="text-xs text-gray-600">No bright objects above 10° during dark hours from your location.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {plannerData.top8.map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, boxShadow: `0 0 6px ${t.color}`, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">{t.name}</div>
                    <div className="text-xs text-gray-600">{t.type} · {t.desc}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold" style={{ color: '#34d399' }}>{Math.round(t.alt)}° alt</div>
                    <div className="text-xs text-gray-600">{Math.round(t.az)}° az</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-700 mt-2">Alt = altitude above horizon · Az = compass bearing (0°=N, 90°=E, 180°=S, 270°=W)</p>

          {/* Variable Stars */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Variable Star Events</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plannerData.varEvents.map((v, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.color, boxShadow: `0 0 6px ${v.color}`, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{v.name}</div>
                  <div className="text-xs text-gray-600">{v.type} · next {v.event}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold" style={{ color: v.color }}>{v.label}</div>
                  <div className="text-xs text-gray-600">{v.alt > 0 ? `${v.alt}° alt` : 'below hz'}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-700 mt-2">Variable stars · countdown to next predicted event</p>
        </div>
      )}

      {/* Messier Catalog Panel */}
      {showMessier && (() => {
        const lst = localSiderealTime(effectiveTime, loc.lng)
        const types = ['All', 'Galaxy', 'Nebula', 'Open Cluster', 'Globular Cluster', 'Planetary Nebula']
        const filtered = MESSIER
          .filter(m => messierFilter === 'All' || m.type === messierFilter)
          .map(m => ({ ...m, alt: toHorizon(m.ra, m.dec, lst, loc.lat).alt }))
          .sort((a, b) => b.alt - a.alt)
        return (
          <div className="mt-3" style={{ background: 'rgba(255,153,204,0.04)', border: '1px solid rgba(255,153,204,0.18)', borderRadius: 14, padding: '14px 16px' }}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-bold tracking-wide uppercase" style={{ color: '#ff99cc' }}>🌌 Messier Catalog</span>
              <span className="text-gray-600 text-xs">{MESSIER.length} objects · sorted by tonight's altitude</span>
              <div className="flex gap-1 flex-wrap ml-auto">
                {types.map(t => (
                  <button key={t} onClick={() => setMessierFilter(t)}
                    className="text-xs px-2 py-0.5 rounded-md transition"
                    style={{ background: messierFilter === t ? 'rgba(255,153,204,0.2)' : 'rgba(255,255,255,0.04)', color: messierFilter === t ? '#ff99cc' : '#6b7280', border: `1px solid ${messierFilter === t ? 'rgba(255,153,204,0.4)' : 'rgba(255,255,255,0.07)'}` }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map(m => (
                <div key={m.id} className="rounded-xl px-3 py-2.5 flex items-start gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="shrink-0 text-center" style={{ width: 48 }}>
                    <DssThumbnail ra={m.ra * 15} dec={m.dec} name={m.id} color={m.color} />
                    <div className="text-xs font-bold mt-0.5" style={{ color: m.color, fontSize: 9 }}>{m.id}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-white">{m.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold" style={{ background: `${m.color}18`, color: m.color, fontSize: 9 }}>{m.type}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{m.desc}</p>
                    <div className="flex gap-2 mt-1 text-xs text-gray-600">
                      <span>📏 {m.size}</span><span>📡 {m.dist}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold" style={{ color: m.alt > 30 ? '#34d399' : m.alt > 10 ? '#fbbf24' : '#374151' }}>
                      {m.alt > 0 ? `${Math.round(m.alt)}°` : 'below'}
                    </div>
                    <div className="text-xs text-gray-600">alt</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-700 mt-2">Alt = tonight's altitude at your location · Green = excellent (&gt;30°) · Yellow = visible (&gt;10°) · Dark = below horizon</p>
          </div>
        )
      })()}

      <p className="text-gray-700 text-xs text-center mt-3">
        {globeMode
          ? 'Drag to rotate the celestial sphere · Auto-rotates · 122,000+ stars on all-sky view'
          : 'Drag to rotate · Hover/tap for details · Slider to travel in time · Zenith at center'}
      </p>

      {/* Night Vision red overlay — pointer-events: none so it doesn't block interaction */}
      {nvMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(180,0,0,0.32)', pointerEvents: 'none', zIndex: 9998, mixBlendMode: 'multiply' }} aria-hidden="true" />
      )}
    </div>
  )
}
