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
  // ── Brightest / most prominent ─────────────────────────────
  ['Sirius',       6.752, -16.72, -1.46, '#a8d8ff',  9940],  // 0  A1V
  ['Canopus',      6.399, -52.70, -0.74, '#fffbe0',  7350],  // 1  A9II
  ['Arcturus',    14.261,  19.18, -0.05, '#ffcc88',  4290],  // 2  K1.5III
  ['Vega',        18.615,  38.78,  0.03, '#cce0ff',  9602],  // 3  A0V
  ['Capella',      5.278,  45.99,  0.08, '#ffe8a0',  5000],  // 4  G5III
  ['Rigel',        5.243,  -8.20,  0.18, '#cce8ff', 12100],  // 5  B8Ia
  ['Procyon',      7.655,   5.22,  0.40, '#fff8e0',  6530],  // 6  F5IV
  ['Betelgeuse',   5.919,   7.41,  0.45, '#ffaa66',  3500],  // 7  M1-M2Ia
  ['Achernar',     1.629, -57.24,  0.45, '#cce0ff', 15000],  // 8  B6V
  ['Hadar',       14.066, -60.37,  0.61, '#aaccff', 25000],  // 9  B1III
  ['Altair',      19.846,   8.87,  0.77, '#fffbe0',  7550],  // 10 A7V
  ['Deneb',       20.690,  45.28,  1.25, '#cce0ff',  8525],  // 11 A2Ia
  ['Antares',     16.490, -26.43,  1.06, '#ff6644',  3400],  // 12 M1.5Iab
  ['Spica',       13.420, -11.16,  0.98, '#cce0ff', 25300],  // 13 B1V
  ['Fomalhaut',   22.961, -29.62,  1.16, '#fffbe0',  8590],  // 14 A3V
  ['Pollux',       7.755,  28.03,  1.16, '#ffcc88',  4586],  // 15 K0III
  ['Castor',       7.577,  31.89,  1.58, '#cce0ff',  8842],  // 16 A1V
  ['Aldebaran',    4.599,  16.51,  0.87, '#ff9944',  3910],  // 17 K5III
  ['Regulus',     10.140,  11.97,  1.36, '#cce0ff', 12460],  // 18 B7V
  ['Adhara',       6.977, -28.97,  1.50, '#cce0ff', 22900],  // 19 B2Ia
  ['Acrux',       12.443, -63.10,  0.77, '#cce0ff', 28000],  // 20 B0.5IV
  ['Gacrux',      12.519, -57.11,  1.59, '#ff8866',  3600],  // 21 M3.5III
  ['Shaula',      17.560, -37.10,  1.63, '#cce0ff', 22000],  // 22 B1.5IV
  ['Mirfak',       3.405,  49.86,  1.80, '#fffbe0',  6350],  // 23 F5Ib
  ['Diphda',       0.655, -17.99,  2.04, '#ffcc88',  4797],  // 24 K0III
  // ── Orion ─────────────────────────────────────────────────
  ['Bellatrix',    5.419,   6.35,  1.64, '#aaccff', 22000],  // 25 B2III
  ['Mintaka',      5.533,  -0.30,  2.23, '#aaccff', 29500],  // 26 O9.5II
  ['Alnilam',      5.604,  -1.20,  1.69, '#aaccff', 27000],  // 27 B0Ia
  ['Alnitak',      5.679,  -1.94,  1.72, '#aaccff', 29900],  // 28 O9.7Ib
  ['Saiph',        5.796,  -9.67,  2.07, '#aaccff', 26500],  // 29 B0.5Ia
  // ── Big Dipper / Ursa Major ────────────────────────────────
  ['Dubhe',       11.062,  61.75,  1.81, '#ffcc88',  4660],  // 30 K0III
  ['Merak',       11.031,  56.38,  2.37, '#fffbe0',  9377],  // 31 A1V
  ['Phecda',      11.897,  53.69,  2.44, '#fffbe0',  9355],  // 32 A0Ve
  ['Megrez',      12.257,  57.03,  3.32, '#d0d8ff',  9480],  // 33 A3V
  ['Alioth',      12.900,  55.96,  1.76, '#fffbe0',  9020],  // 34 A0p
  ['Mizar',       13.399,  54.93,  2.23, '#fffbe0',  9000],  // 35 A1V
  ['Alkaid',      13.792,  49.31,  1.85, '#aaccff', 18700],  // 36 B3V
  // ── Cassiopeia ────────────────────────────────────────────
  ['Schedar',      0.675,  56.54,  2.24, '#ffcc88',  4552],  // 37 K0IIIa
  ['Caph',         0.153,  59.15,  2.28, '#fffbe0',  7079],  // 38 F2IV
  ['Cih',          0.945,  60.72,  2.47, '#aaccff', 25000],  // 39 B0.5IVe
  ['Ruchbah',      1.430,  60.24,  2.68, '#fffbe0',  8000],  // 40 A5III
  ['Segin',        1.907,  63.67,  3.38, '#c0c8ff', 16000],  // 41 B3III
  // ── Leo ───────────────────────────────────────────────────
  ['Algieba',     10.332,  19.84,  2.61, '#ffcc88',  4470],  // 42 K1III
  ['Zosma',       11.235,  20.52,  2.56, '#fffbe0',  8296],  // 43 A4V
  ['Denebola',    11.817,  14.57,  2.14, '#aaccff',  8500],  // 44 A3V
  // ── Gemini / Taurus ───────────────────────────────────────
  ['Elnath',       5.438,  28.61,  1.68, '#aaccff', 13824],  // 45 B7III
  ['Alhena',       6.629,  16.40,  1.93, '#aaccff',  9260],  // 46 A0IV
  // ── Scorpius tail ─────────────────────────────────────────
  ['Lesath',      17.513, -37.30,  2.70, '#aaccff', 22000],  // 47 B2IV
  ['Sargas',      17.622, -43.00,  1.87, '#fffbe0',  7268],  // 48 F0II
  // ── Hydra ─────────────────────────────────────────────────
  ['Alphard',      9.460,  -8.66,  1.99, '#ff9944',  4050],  // 49 K3II
  // ── Aries ─────────────────────────────────────────────────
  ['Hamal',        2.119,  23.46,  2.01, '#ff9944',  4480],  // 50 K2III
  // ── Ophiuchus ─────────────────────────────────────────────
  ['Rasalhague',  17.583,  12.56,  2.08, '#fff8e0',  8500],  // 51 A5III
  // ── Perseus (eclipsing binary) ─────────────────────────────
  ['Algol',        3.136,  40.96,  2.12, '#c8e0ff', 13000],  // 52 B8V
  // ── Cygnus ────────────────────────────────────────────────
  ['Sadr',        20.370,  40.26,  2.23, '#fff8e0',  6900],  // 53 F8Ib
  // ── Libra ─────────────────────────────────────────────────
  ['Zubenelgenubi',14.849,-16.04,  2.75, '#c8e0ff',  8500],  // 54 A3
  // ── Boötes ────────────────────────────────────────────────
  ['Izar',        14.750,  27.07,  2.40, '#ffa050',  4550],  // 55 K0II
  // ── Pegasus ───────────────────────────────────────────────
  ['Enif',        21.736,   9.88,  2.38, '#ffa050',  4460],  // 56 K2Ib
  // ── Andromeda ─────────────────────────────────────────────
  ['Alpheratz',    0.140,  29.09,  2.07, '#c0d0ff', 13800],  // 57 B8IV
  ['Mirach',       1.162,  35.62,  2.07, '#ff8844',  3840],  // 58 M0III
  ['Almach',       2.065,  42.33,  2.10, '#ff8060',  4250],  // 59 K3IIb
  // ── Pegasus (Great Square) ────────────────────────────────
  ['Markab',      23.079,  15.21,  2.49, '#c8d8ff', 10100],  // 60 B9III
  ['Scheat',      23.063,  28.08,  2.44, '#ff8844',  3700],  // 61 M2II-III
  // ── Sagittarius (Teapot) ──────────────────────────────────
  ['Kaus Australis',18.403,-34.38,1.79, '#c0d0ff',  9960],  // 62 B9.5III
  ['Nunki',       18.922, -26.30,  2.02, '#aaccff', 20700],  // 63 B2.5V
  ['Kaus Media',  18.350, -29.83,  2.70, '#c8d8ff',  8000],  // 64 B8III
  ['Kaus Borealis',18.466,-21.06,  2.81, '#fff8e0',  6590],  // 65 K0III
  // ── Aquila ────────────────────────────────────────────────
  ['Tarazed',     19.771,  10.61,  2.72, '#ff8844',  4210],  // 66 K3II
  // ── Cygnus (double star) ──────────────────────────────────
  ['Albireo',     19.512,  27.96,  3.08, '#ffaa44',  4270],  // 67 K2II
  // ── Virgo ─────────────────────────────────────────────────
  ['Porrima',     12.694,  -1.45,  2.74, '#f0f4ff',  7100],  // 68 F0V
]

// ── CONSTELLATION LINES ────────────────────────────────────────
type ConLine = { a: number; b: number; name: string }
const CONSTELLATION_LINES: ConLine[] = [
  // Orion
  { a: 7,  b: 25, name: 'Orion' },
  { a: 7,  b: 28, name: 'Orion' },
  { a: 25, b: 26, name: 'Orion' },
  { a: 26, b: 27, name: 'Orion' },
  { a: 27, b: 28, name: 'Orion' },
  { a: 26, b: 5,  name: 'Orion' },
  { a: 28, b: 29, name: 'Orion' },
  // Big Dipper
  { a: 30, b: 31, name: 'Ursa Major' },
  { a: 31, b: 32, name: 'Ursa Major' },
  { a: 32, b: 33, name: 'Ursa Major' },
  { a: 33, b: 30, name: 'Ursa Major' },
  { a: 33, b: 34, name: 'Ursa Major' },
  { a: 34, b: 35, name: 'Ursa Major' },
  { a: 35, b: 36, name: 'Ursa Major' },
  // Cassiopeia
  { a: 38, b: 37, name: 'Cassiopeia' },
  { a: 37, b: 39, name: 'Cassiopeia' },
  { a: 39, b: 40, name: 'Cassiopeia' },
  { a: 40, b: 41, name: 'Cassiopeia' },
  // Summer Triangle
  { a: 3,  b: 10, name: 'Summer △' },
  { a: 3,  b: 11, name: 'Summer △' },
  { a: 10, b: 11, name: 'Summer △' },
  // Leo
  { a: 18, b: 42, name: 'Leo' },
  { a: 42, b: 43, name: 'Leo' },
  { a: 43, b: 44, name: 'Leo' },
  // Gemini
  { a: 15, b: 16, name: 'Gemini' },
  { a: 15, b: 45, name: 'Gemini' },
  { a: 16, b: 46, name: 'Gemini' },
  // Taurus
  { a: 17, b: 45, name: 'Taurus' },
  // Scorpius tail
  { a: 22, b: 47, name: 'Scorpius' },
  { a: 22, b: 48, name: 'Scorpius' },
  // Andromeda chain
  { a: 57, b: 58, name: 'Andromeda' },
  { a: 58, b: 59, name: 'Andromeda' },
  // Cygnus cross
  { a: 11, b: 53, name: 'Cygnus' },
  { a: 53, b: 67, name: 'Cygnus' },
  // Sagittarius teapot
  { a: 62, b: 64, name: 'Sagittarius' },
  { a: 64, b: 63, name: 'Sagittarius' },
  { a: 64, b: 65, name: 'Sagittarius' },
  { a: 62, b: 63, name: 'Sagittarius' },
  // Pegasus (partial Great Square)
  { a: 57, b: 60, name: 'Pegasus' },
  { a: 60, b: 61, name: 'Pegasus' },
]

// ── PLANETS ────────────────────────────────────────────────────
const PLANETS = [
  { name: 'Sun',     symbol: '☀',  color: '#ffee44', glow: '#ffcc00', size: 9 },
  { name: 'Mercury', symbol: '☿',  color: '#c0c0c0', glow: '#909090', size: 5 },
  { name: 'Venus',   symbol: '♀',  color: '#fff4c2', glow: '#ffee88', size: 7 },
  { name: 'Mars',    symbol: '♂',  color: '#ff5533', glow: '#ff2200', size: 6 },
  { name: 'Jupiter', symbol: '♃',  color: '#f5c88a', glow: '#e8a060', size: 9 },
  { name: 'Saturn',  symbol: '♄',  color: '#f0d880', glow: '#d4b840', size: 7 },
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
}

interface Tooltip extends HitItem {
  sx: number; sy: number
  flipLeft: boolean
}

// Milky Way spectral template layers: [galactic_b, lineWidth, opacity]
const MW_LAYERS: [number, number, number][] = [
  [0,    11, 0.17],
  [6,    7,  0.10],
  [-6,   7,  0.10],
  [14,   4,  0.05],
  [-14,  4,  0.05],
  [24,   2,  0.025],
  [-24,  2,  0.025],
]

// Spectral class legend
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
  const [rotation, setRotation] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [prevX, setPrevX]     = useState(0)

  const [showPlanets, setShowPlanets]               = useState(true)
  const [showConstellations, setShowConstellations] = useState(true)
  const [showMilkyWay, setShowMilkyWay]             = useState(true)
  const [showLabels, setShowLabels]                 = useState(true)
  const [showTemp, setShowTemp]                     = useState(false)
  const [showGrid, setShowGrid]                     = useState(false)

  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  const jd = julianDate(time)
  const d  = jd - 2451543.5

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

    const lst = localSiderealTime(time, loc.lng)

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
          // Density peaks at galactic center (l≈0) and in Cygnus arm (l≈80)
          const density = 0.55 + 0.35 * Math.cos(l * DEG) + 0.10 * Math.cos(2 * l * DEG)
          const alpha = baseAlpha * Math.max(0.3, density)
          if (!started) {
            ctx.moveTo(pt.x, pt.y); started = true
          } else {
            ctx.lineTo(pt.x, pt.y)
          }
          // Segment-level color change: re-stroke every 10 points for density gradient
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

    // ── Constellation lines ──
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
    }

    // ── Stars ──
    STARS.forEach(([name, ra, dec, mag, color, temp]) => {
      const { alt, az } = toHorizon(ra, dec, lst, loc.lat)
      if (alt < -5) return
      const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
      if (x < -12 || x > W + 12 || y < -12 || y > H + 12) return

      const starR = Math.max(1.8, (6.2 - mag) * 1.2)
      const glowR = starR * (mag < 0 ? 11 : mag < 1 ? 8 : 5.5)
      const alpha = alt < 0 ? 0.22 : 1

      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR)
      glow.addColorStop(0, color + 'cc'); glow.addColorStop(0.4, color + '44'); glow.addColorStop(1, 'transparent')
      ctx.globalAlpha = alpha * 0.75
      ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2)
      ctx.fillStyle = glow; ctx.fill()

      ctx.globalAlpha = alpha
      ctx.beginPath(); ctx.arc(x, y, starR, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.globalAlpha = 1

      // Label / temperature
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

    // ── Planets ──
    if (showPlanets) {
      PLANETS.forEach(planet => {
        const radec = computeRADec(planet.name, d)
        if (!radec) return
        const { alt, az } = toHorizon(radec.ra, radec.dec, lst, loc.lat)
        if (alt < -5) return
        const { x, y } = project(alt, (az + rotation) % 360, cx, cy, r, 0)
        if (x < -12 || x > W + 12 || y < -12 || y > H + 12) return

        ctx.globalAlpha = alt < 0 ? 0.28 : 1

        // Outer ID ring
        ctx.beginPath(); ctx.arc(x, y, planet.size + 3.5, 0, Math.PI * 2)
        ctx.strokeStyle = planet.color + '55'; ctx.lineWidth = 1.5; ctx.stroke()

        // Glow
        const glowR = planet.name === 'Sun' ? planet.size * 5.5 : planet.size * 4
        const glow  = ctx.createRadialGradient(x, y, 0, x, y, glowR)
        glow.addColorStop(0, planet.glow + 'dd'); glow.addColorStop(0.5, planet.glow + '55'); glow.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill()

        // Disc
        ctx.beginPath(); ctx.arc(x, y, planet.size, 0, Math.PI * 2)
        ctx.fillStyle = planet.color; ctx.fill()

        // Saturn ring
        if (planet.name === 'Saturn') {
          ctx.beginPath()
          ctx.ellipse(x, y, planet.size * 2.0, planet.size * 0.6, 0.35, 0, Math.PI * 2)
          ctx.strokeStyle = planet.color + 'bb'; ctx.lineWidth = 2; ctx.stroke()
        }

        // Label
        ctx.font = 'bold 10px \'Space Grotesk\', system-ui'; ctx.textAlign = 'left'
        const lx = x + planet.size + 6, ly = y + 4
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(`${planet.symbol} ${planet.name}`, lx + 1, ly + 1)
        ctx.fillStyle = planet.color;       ctx.fillText(`${planet.symbol} ${planet.name}`, lx, ly)

        ctx.globalAlpha = 1
        hitRef.current.push({ name: planet.name, x, y, alt, color: planet.color, isPlanet: true, symbol: planet.symbol })
      })
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

    // Zenith dot
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill()
    ctx.restore()
  }, [loc, time, rotation, showPlanets, showConstellations, showMilkyWay, showLabels, showTemp, showGrid, d])

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

  // Mouse hover → tooltip
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
    const cx = (e.clientX - rect.left) * 480 / rect.width
    const cy = (e.clientY - rect.top)  * 480 / rect.height

    let best: HitItem | null = null, bestDist = 22
    for (const item of hitRef.current) {
      const dx = item.x - cx, dy = item.y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < bestDist) { bestDist = d; best = item }
    }
    if (best) {
      const sx = best.x * rect.width / 480
      const sy = best.y * rect.height / 480
      setTooltip({ ...best, sx, sy, flipLeft: sx > rect.width - 165 })
    } else {
      setTooltip(null)
    }
  }, [dragging, prevX])

  // Touch tap → tooltip (short tap without significant movement)
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
      const sx = best.x * rect.width / 480
      const sy = best.y * rect.height / 480
      setTooltip({ ...best, sx, sy, flipLeft: sx > rect.width - 165 })
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = setTimeout(() => setTooltip(null), 3000)
    } else {
      setTooltip(null)
    }
    touchStartRef.current = null
  }, [])

  const visibleStars   = (() => {
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
          <p className="text-gray-500 text-xs">
            {visibleStars} stars visible · {city} · {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
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
          { key: 'planets',        label: '🪐 Planets',       val: showPlanets,        set: setShowPlanets },
          { key: 'constellations', label: '✦ Constellations', val: showConstellations,  set: setShowConstellations },
          { key: 'milkyway',       label: '🌠 Milky Way',     val: showMilkyWay,        set: setShowMilkyWay },
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

      {/* Canvas + tooltip overlay */}
      <div className="flex justify-center mb-4 relative">
        <canvas
          ref={canvasRef}
          width={480}
          height={480}
          aria-label="Interactive star map — hover or tap stars/planets for details"
          className="rounded-full cursor-crosshair touch-none"
          style={{ maxWidth: '100%', maxHeight: '66vw' }}
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
              left: tooltip.flipLeft ? tooltip.sx - 162 : tooltip.sx + 12,
              top:  Math.max(4, tooltip.sy - 10),
              background: 'rgba(7,9,22,0.97)',
              border: `1px solid ${tooltip.color}55`,
              borderRadius: 10,
              padding: '9px 13px',
              pointerEvents: 'none',
              zIndex: 20,
              minWidth: 148,
              boxShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 10px ${tooltip.color}22`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {tooltip.symbol && <span style={{ color: tooltip.color, fontSize: 16, lineHeight: 1 }}>{tooltip.symbol}</span>}
              <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>{tooltip.name}</span>
            </div>
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
          <p className="text-xs font-bold text-indigo-300 mb-2 tracking-wide uppercase">Planet Positions Now</p>
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
                ? `${visiblePlanets[0].symbol} ${visiblePlanets[0].name} is visible tonight`
                : `${visiblePlanets.map(p => `${p.symbol} ${p.name}`).join(', ')} are visible tonight`}
            </p>
          )}
        </div>
      )}

      <p className="text-gray-700 text-xs text-center mt-3">
        Drag to rotate · Hover or tap stars for details · Zenith at center
      </p>
    </div>
  )
}
