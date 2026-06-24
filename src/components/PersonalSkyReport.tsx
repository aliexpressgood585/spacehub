import { useState, useEffect, useMemo } from 'react'

const DEG = Math.PI / 180
const rev = (x: number) => ((x % 360) + 360) % 360

function julianDate(d: Date) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate()
  const h = d.getUTCHours() + d.getUTCMinutes() / 60
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

function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M))
  for (let n = 0; n < 10; n++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    if (Math.abs(dE) < 1e-8) break
    E -= dE
  }
  return E
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

type OrbElem = { N: number; i: number; w: number; a: number; e: number; M: number }
function getOrbElems(d: number, name: string): OrbElem | null {
  switch (name) {
    case 'Mercury': return { N: rev(48.3313+3.24587e-5*d), i: 7.0047, w: rev(29.1241+1.01444e-5*d), a: 0.387098, e: 0.205635, M: rev(168.6562+4.0923344368*d) }
    case 'Venus':   return { N: rev(76.6799+2.4659e-5*d),  i: 3.3946, w: rev(54.891+1.38374e-5*d), a: 0.72333, e: 0.006773, M: rev(48.0052+1.6021302244*d) }
    case 'Mars':    return { N: rev(49.5574+2.11081e-5*d), i: 1.8497, w: rev(286.5016+2.92961e-5*d), a: 1.523688, e: 0.093405, M: rev(18.6021+0.5240207766*d) }
    case 'Jupiter': return { N: rev(100.4542+2.76854e-5*d), i: 1.303, w: rev(273.8777+1.64505e-5*d), a: 5.20256, e: 0.048498, M: rev(19.895+0.0830853001*d) }
    case 'Saturn':  return { N: rev(113.6634+2.3898e-5*d), i: 2.4886, w: rev(339.3939+2.97661e-5*d), a: 9.55475, e: 0.055546, M: rev(316.967+0.0334442282*d) }
    default: return null
  }
}

function computePlanetRADec(name: string, d: number) {
  const el = getOrbElems(d, name)
  if (!el) return null
  const { N, i, w, a, e, M } = el
  const E = solveKepler(M * DEG, e)
  const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const v = Math.atan2(yv, xv)
  const rr = Math.sqrt(xv * xv + yv * yv)
  const Nr = N * DEG, ir = i * DEG, lon = v + (w - N) * DEG
  const px = rr * (Math.cos(Nr) * Math.cos(lon) - Math.sin(Nr) * Math.sin(lon) * Math.cos(ir))
  const py = rr * (Math.sin(Nr) * Math.cos(lon) + Math.cos(Nr) * Math.sin(lon) * Math.cos(ir))
  const pz = rr * Math.sin(lon) * Math.sin(ir)
  const earth = earthXYZ(d)
  const dx = px - earth.x, dy = py - earth.y, dz = pz - earth.z
  const ecl = (23.4393 - 3.563e-7 * d) * DEG
  const yeq = dy * Math.cos(ecl) - dz * Math.sin(ecl)
  const zeq = dy * Math.sin(ecl) + dz * Math.cos(ecl)
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return {
    ra: rev(Math.atan2(yeq, dx) * 180 / Math.PI) / 15,
    dec: Math.asin(Math.max(-1, Math.min(1, zeq / dist))) * 180 / Math.PI,
  }
}

function computeSunRADec(d: number) {
  const wr = rev(282.9404 + 4.70935e-5 * d) * DEG
  const e = 0.016709 - 1.151e-9 * d
  const M = rev(356.0470 + 0.9856002585 * d) * DEG
  const E = solveKepler(M, e)
  const xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E)
  const ls = Math.atan2(yv, xv) + wr
  const ecl = (23.4393 - 3.563e-7 * d) * DEG
  return {
    ra: rev(Math.atan2(Math.sin(ls) * Math.cos(ecl), Math.cos(ls)) * 180 / Math.PI) / 15,
    dec: Math.asin(Math.sin(ls) * Math.sin(ecl)) * 180 / Math.PI,
  }
}

function computeMoonRADec(d: number) {
  const N = rev(125.1228 - 0.0529538083 * d)
  const w = rev(318.0634 + 0.1643573223 * d)
  const e = 0.054900
  const M = rev(115.3654 + 13.0649929509 * d)
  const E = solveKepler(M * DEG, e)
  const xv = 60.2666 * (Math.cos(E) - e)
  const yv = 60.2666 * Math.sqrt(1 - e * e) * Math.sin(E)
  const v = Math.atan2(yv, xv)
  const rr = Math.sqrt(xv * xv + yv * yv)
  const lonR = v + (w - N) * DEG
  const Nr = N * DEG, iR = 5.1454 * DEG
  const xe = rr * (Math.cos(Nr) * Math.cos(lonR) - Math.sin(Nr) * Math.sin(lonR) * Math.cos(iR))
  const ye = rr * (Math.sin(Nr) * Math.cos(lonR) + Math.cos(Nr) * Math.sin(lonR) * Math.cos(iR))
  const ze = rr * Math.sin(lonR) * Math.sin(iR)
  const ecl = (23.4393 - 3.563e-7 * d) * DEG
  const yeq = ye * Math.cos(ecl) - ze * Math.sin(ecl)
  const zeq = ye * Math.sin(ecl) + ze * Math.cos(ecl)
  const sunR = computeSunRADec(d)
  const mLon = Math.atan2(yeq, xe) * 180 / Math.PI
  const sLon = sunR.ra * 15
  const phase = (1 - Math.cos(rev(mLon - sLon) * DEG)) / 2
  return {
    ra: rev(Math.atan2(yeq, xe) * 180 / Math.PI) / 15,
    dec: Math.asin(Math.max(-1, Math.min(1, zeq / rr))) * 180 / Math.PI,
    phase,
  }
}

interface SkyObject {
  id: string
  name: string
  type: 'planet' | 'star' | 'galaxy' | 'nebula' | 'cluster' | 'globular' | 'double-star' | 'moon'
  ra: number
  dec: number
  mag: number
  icon: string
  color: string
  description: string
  equipment: 'naked' | 'binoculars' | 'small-scope' | 'large-scope'
  wow: string
  dynamic?: boolean
}

const STATIC_OBJECTS: SkyObject[] = [
  { id: 'm42', name: 'Orion Nebula (M42)', type: 'nebula', ra: 5.588, dec: -5.39, mag: 4.0, icon: '🌫️', color: '#55ccff', description: 'The nearest star-forming region — thousands of new stars being born right now', equipment: 'naked', wow: 'You can see it with naked eye as a fuzzy patch in Orion\'s sword' },
  { id: 'm45', name: 'Pleiades (Seven Sisters)', type: 'cluster', ra: 3.783, dec: 24.12, mag: 1.2, icon: '✨', color: '#88ddff', description: 'The most famous star cluster — 500 stars only 444 light-years away', equipment: 'naked', wow: 'Binoculars reveal dozens of stunning blue-white stars' },
  { id: 'm31', name: 'Andromeda Galaxy (M31)', type: 'galaxy', ra: 0.712, dec: 41.27, mag: 3.44, icon: '🌌', color: '#ff99cc', description: '2.5 million light-years away — the farthest thing visible to naked eye', equipment: 'naked', wow: 'You\'re seeing light that left before Homo sapiens existed' },
  { id: 'm13', name: 'Hercules Cluster (M13)', type: 'globular', ra: 16.694, dec: 36.46, mag: 5.8, icon: '⚾', color: '#ffcc44', description: '300,000 stars packed into a ball 145 light-years across', equipment: 'binoculars', wow: 'In a telescope: a shimmering globe that looks alive' },
  { id: 'm44', name: 'Beehive Cluster (M44)', type: 'cluster', ra: 8.667, dec: 19.67, mag: 3.7, icon: '🐝', color: '#88ff66', description: 'One of the nearest clusters — 1,000 stars just 610 light-years away', equipment: 'naked', wow: 'Binoculars show why it\'s called the Beehive — buzzing with stars' },
  { id: 'm35', name: 'Gemini Cluster (M35)', type: 'cluster', ra: 6.150, dec: 24.33, mag: 5.1, icon: '💎', color: '#88ff66', description: '500 stars spread over the same area as the full Moon', equipment: 'binoculars', wow: 'Background cluster NGC 2158 visible in telescopes — 16,000 ly further away' },
  { id: 'm57', name: 'Ring Nebula (M57)', type: 'nebula', ra: 18.893, dec: 33.03, mag: 8.8, icon: '💍', color: '#a78bfa', description: 'A dying sun-like star\'s expelled gas shell — our own Sun\'s future', equipment: 'small-scope', wow: 'Looks exactly like a tiny smoke ring floating in space' },
  { id: 'm27', name: 'Dumbbell Nebula (M27)', type: 'nebula', ra: 19.993, dec: 22.72, mag: 7.4, icon: '🏋️', color: '#55ccff', description: 'The first planetary nebula ever discovered — visually stunning', equipment: 'binoculars', wow: 'Even in binoculars it shows a fuzzy apple-core shape' },
  { id: 'm51', name: 'Whirlpool Galaxy (M51)', type: 'galaxy', ra: 13.498, dec: 47.20, mag: 8.4, icon: '🌀', color: '#ff99cc', description: 'Two galaxies in the act of colliding — 23 million light-years away', equipment: 'small-scope', wow: 'A telescope shows two fuzzy blobs interacting — an actual galactic merger' },
  { id: 'm81', name: "Bode's Galaxy (M81)", type: 'galaxy', ra: 9.926, dec: 69.07, mag: 6.9, icon: '🌌', color: '#ff99cc', description: 'Brilliant spiral 11.8 million light-years away in Ursa Major', equipment: 'binoculars', wow: 'Pair with nearby M82 for a stunning double-galaxy view' },
  { id: 'm82', name: 'Cigar Galaxy (M82)', type: 'galaxy', ra: 9.926, dec: 69.68, mag: 8.4, icon: '🚀', color: '#ff8888', description: 'Starburst galaxy erupting with a superwind 10,000 ly above/below it', equipment: 'small-scope', wow: 'Long-exposure photo shows dramatic red hydrogen filaments' },
  { id: 'm104', name: 'Sombrero Galaxy (M104)', type: 'galaxy', ra: 12.666, dec: -11.62, mag: 8.0, icon: '🎩', color: '#ff99cc', description: 'Edge-on galaxy with a prominent dust lane — one of the most photogenic', equipment: 'small-scope', wow: 'The dark dust lane is visible even in a modest telescope' },
  { id: 'albireo', name: 'Albireo (β Cygni)', type: 'double-star', ra: 19.512, dec: 27.96, mag: 3.1, icon: '💛💙', color: '#ffcc44', description: 'The most beautiful double star: gold + blue companion pair', equipment: 'binoculars', wow: 'Stunningly contrasting colors — one orange-gold, one sapphire blue' },
  { id: 'm8', name: 'Lagoon Nebula (M8)', type: 'nebula', ra: 18.060, dec: -24.38, mag: 5.0, icon: '🌊', color: '#55ccff', description: 'An enormous star-forming region — visible to naked eye from dark skies', equipment: 'naked', wow: 'The hourglass region inside is actively forming new stars right now' },
  { id: 'm7', name: 'Ptolemy Cluster (M7)', type: 'cluster', ra: 17.900, dec: -34.82, mag: 3.3, icon: '⭐', color: '#88ff66', description: 'Known since ancient Greece — Ptolemy mentioned it in 130 AD', equipment: 'naked', wow: 'Over 80 bright stars visible in binoculars against the Milky Way background' },
]

const EQUIP_LABELS: Record<string, string> = {
  'naked': '👁️ Naked eye',
  'binoculars': '🔭 Binoculars',
  'small-scope': '🔬 Small telescope',
  'large-scope': '🏛️ Large telescope',
}

const EQUIP_COLORS: Record<string, string> = {
  'naked': '#4ade80',
  'binoculars': '#fbbf24',
  'small-scope': '#60a5fa',
  'large-scope': '#a78bfa',
}

const TYPE_LABELS: Record<string, string> = {
  'planet': 'Planet', 'star': 'Star', 'galaxy': 'Galaxy', 'nebula': 'Nebula',
  'cluster': 'Star Cluster', 'globular': 'Globular Cluster', 'double-star': 'Double Star', 'moon': 'Moon'
}

function azToDirection(az: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(az / 45) % 8]
}

function altQuality(alt: number): { label: string; color: string; score: number } {
  if (alt >= 60) return { label: 'Excellent', color: '#4ade80', score: 100 }
  if (alt >= 40) return { label: 'Very Good', color: '#a3e635', score: 85 }
  if (alt >= 25) return { label: 'Good', color: '#fbbf24', score: 65 }
  if (alt >= 10) return { label: 'Fair', color: '#f97316', score: 40 }
  return { label: 'Poor', color: '#ef4444', score: 10 }
}

function moonPhaseIcon(phase: number): string {
  if (phase < 0.03) return '🌑'
  if (phase < 0.22) return '🌒'
  if (phase < 0.28) return '🌓'
  if (phase < 0.47) return '🌔'
  if (phase < 0.53) return '🌕'
  if (phase < 0.72) return '🌖'
  if (phase < 0.78) return '🌗'
  if (phase < 0.97) return '🌘'
  return '🌑'
}

function moonPhaseName(phase: number): string {
  if (phase < 0.03) return 'New Moon'
  if (phase < 0.22) return 'Waxing Crescent'
  if (phase < 0.28) return 'First Quarter'
  if (phase < 0.47) return 'Waxing Gibbous'
  if (phase < 0.53) return 'Full Moon'
  if (phase < 0.72) return 'Waning Gibbous'
  if (phase < 0.78) return 'Last Quarter'
  if (phase < 0.97) return 'Waning Crescent'
  return 'New Moon'
}

export default function PersonalSkyReport() {
  const [loc, setLoc] = useState({ lat: 32.0, lng: 34.78 })
  const [locName, setLocName] = useState('Your location')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(pos => {
      setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      setLocName(`${Math.abs(pos.coords.latitude).toFixed(1)}°${pos.coords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(pos.coords.longitude).toFixed(1)}°${pos.coords.longitude >= 0 ? 'E' : 'W'}`)
    })
  }, [])

  const now = new Date()
  const jd = julianDate(now)
  const d = jd - 2451543.5
  const lst = localSiderealTime(now, loc.lng)

  const moon = computeMoonRADec(d)
  const moonHz = toHorizon(moon.ra, moon.dec, lst, loc.lat)
  const sun = computeSunRADec(d)
  const sunHz = toHorizon(sun.ra, sun.dec, lst, loc.lat)

  const moonPenalty = moon.phase > 0.7 ? 2.5 : moon.phase > 0.4 ? 1.0 : 0

  const PLANET_DEFS = [
    { id: 'venus', name: 'Venus', icon: '♀', color: '#fff4c2', mag: -4.5, description: 'The brightest planet — often called the Evening or Morning Star', equipment: 'naked' as const, wow: 'So bright it casts shadows on a dark night' },
    { id: 'jupiter', name: 'Jupiter', icon: '♃', color: '#f5c88a', mag: -2.5, description: 'The largest planet — cloud bands and 4 Galilean moons visible in binoculars', equipment: 'binoculars' as const, wow: 'Io, Europa, Ganymede and Callisto dance around it night to night' },
    { id: 'mars', name: 'Mars', icon: '♂', color: '#ff5533', mag: 0.5, description: 'The Red Planet — its rusty color is unmistakable', equipment: 'naked' as const, wow: 'A telescope shows polar ice caps and dust storms' },
    { id: 'saturn', name: 'Saturn', icon: '♄', color: '#f0d880', mag: 0.8, description: 'The Ringed Planet — rings visible in any small telescope', equipment: 'small-scope' as const, wow: 'The first time you see the rings in a telescope is unforgettable' },
    { id: 'mercury', name: 'Mercury', icon: '☿', color: '#c0c0c0', mag: 0.5, description: 'Hardest planet to spot — never far from the Sun', equipment: 'naked' as const, wow: 'Only visible in twilight windows — a real challenge to observe' },
  ]

  const allObjects = useMemo(() => {
    const dynamicPlanets: SkyObject[] = PLANET_DEFS.map(p => {
      const radec = computePlanetRADec(p.name, d)
      if (!radec) return null
      return {
        id: p.id, name: p.name, type: 'planet' as const,
        ra: radec.ra, dec: radec.dec, mag: p.mag,
        icon: p.icon, color: p.color,
        description: p.description, equipment: p.equipment, wow: p.wow,
        dynamic: true,
      }
    }).filter(Boolean) as SkyObject[]

    const moonObj: SkyObject = {
      id: 'moon', name: `Moon (${moonPhaseName(moon.phase)})`,
      type: 'moon', ra: moon.ra, dec: moon.dec, mag: -12,
      icon: moonPhaseIcon(moon.phase), color: '#e5e7eb',
      description: `Currently ${Math.round(moon.phase * 100)}% illuminated — ${moonPhaseName(moon.phase)}`,
      equipment: 'naked',
      wow: moon.phase < 0.15 ? 'New Moon — perfect dark sky tonight!' : moon.phase > 0.85 ? 'Full Moon — bright sky but craters are spectacular' : 'Terminator line shows dramatic crater shadows at the edge',
    }

    return [...dynamicPlanets, moonObj, ...STATIC_OBJECTS]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, moon.phase, moon.ra, moon.dec])

  const scored = useMemo(() => {
    if (sunHz.alt > -6) return [] // daytime or civil twilight

    return allObjects
      .map(obj => {
        const hz = toHorizon(obj.ra, obj.dec, lst, loc.lat)
        if (hz.alt < 5) return null
        const quality = altQuality(hz.alt)
        const brightnessScore = Math.max(0, (10 - obj.mag) * 8)
        const altScore = quality.score
        const moonPen = obj.type !== 'moon' && obj.type !== 'planet' ? moonPenalty * 10 : 0
        const score = brightnessScore + altScore - moonPen
        return { ...obj, hz, quality, score }
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 8) as (SkyObject & { hz: { alt: number; az: number }; quality: ReturnType<typeof altQuality>; score: number })[]
  }, [allObjects, lst, loc.lat, sunHz.alt, moonPenalty])

  const isDay = sunHz.alt > -6
  const isTwilight = sunHz.alt <= -6 && sunHz.alt > -12

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">🌟</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Tonight's Sky Report</h3>
          <p className="text-gray-500 text-xs">Best objects to observe right now · Personalized for your location</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg">{moonPhaseIcon(moon.phase)}</div>
          <div className="text-[9px] text-gray-600">{Math.round(moon.phase * 100)}%</div>
        </div>
      </div>

      {/* Conditions bar */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-lg mb-0.5">{sunHz.alt < -18 ? '🌑' : sunHz.alt < -12 ? '🌌' : sunHz.alt < -6 ? '🌆' : '☀️'}</div>
          <div className="text-[10px] font-bold text-white">{sunHz.alt < -18 ? 'Dark Night' : sunHz.alt < -12 ? 'Astro Twilight' : sunHz.alt < -6 ? 'Nautical Twil.' : 'Daytime'}</div>
          <div className="text-[9px] text-gray-600">Sun {sunHz.alt.toFixed(1)}°</div>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-lg mb-0.5">{moonPhaseIcon(moon.phase)}</div>
          <div className="text-[10px] font-bold text-white">{moonPhaseName(moon.phase)}</div>
          <div className="text-[9px] text-gray-600">{moonHz.alt > 0 ? `Alt ${moonHz.alt.toFixed(0)}°` : 'Below horizon'}</div>
        </div>
        <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-lg mb-0.5">{moonPenalty > 2 ? '😟' : moonPenalty > 1 ? '😐' : '😊'}</div>
          <div className="text-[10px] font-bold text-white">Sky Quality</div>
          <div className="text-[9px]" style={{ color: moonPenalty > 2 ? '#f87171' : moonPenalty > 1 ? '#fbbf24' : '#4ade80' }}>
            {moonPenalty > 2 ? 'Bright Moon' : moonPenalty > 1 ? 'Moderate' : 'Excellent!'}
          </div>
        </div>
      </div>

      {isDay && (
        <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
          <div className="text-4xl mb-2">☀️</div>
          <p className="text-white font-bold">It's daytime at your location</p>
          <p className="text-gray-500 text-sm mt-1">Come back after sunset for tonight's sky report</p>
          <p className="text-indigo-400 text-xs mt-2">Sun altitude: {sunHz.alt.toFixed(1)}° · {azToDirection(sunHz.az)}</p>
        </div>
      )}

      {!isDay && scored.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">No bright objects above the horizon right now</div>
      )}

      {!isDay && scored.length > 0 && (
        <>
          {isTwilight && (
            <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <p className="text-[10px] text-indigo-400">🌆 Astronomical twilight — the sky isn't fully dark yet. Bright objects are already visible.</p>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Top {scored.length} Objects Now — {locName}</p>
          </div>

          <div className="space-y-2">
            {scored.map((obj, rank) => {
              const isOpen = expanded === obj.id
              return (
                <button key={obj.id} onClick={() => setExpanded(isOpen ? null : obj.id)}
                  className="w-full text-left rounded-2xl p-3.5 transition-all"
                  style={{
                    background: isOpen ? 'rgba(99,102,241,0.1)' : rank === 0 ? 'rgba(251,191,36,0.06)' : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${isOpen ? 'rgba(99,102,241,0.4)' : rank === 0 ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.07)'}`
                  }}>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black"
                        style={{ background: rank === 0 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)', color: rank === 0 ? '#fbbf24' : '#6b7280' }}>
                        {rank + 1}
                      </div>
                      <div className="text-lg leading-none">{obj.icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-bold text-white">{obj.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: EQUIP_COLORS[obj.equipment] + '22', color: EQUIP_COLORS[obj.equipment] }}>
                          {EQUIP_LABELS[obj.equipment]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <span className="font-semibold" style={{ color: obj.quality.color }}>{obj.quality.label}</span>
                        <span>·</span>
                        <span>Alt {obj.hz.alt.toFixed(0)}° {azToDirection(obj.hz.az)}</span>
                        <span>·</span>
                        <span>mag {obj.mag > 0 ? '+' : ''}{obj.mag.toFixed(1)}</span>
                      </div>
                      {!isOpen && (
                        <p className="text-[10px] text-gray-600 mt-1 line-clamp-1">{obj.description}</p>
                      )}
                      {isOpen && (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs text-gray-400 leading-relaxed">{obj.description}</p>
                          <div className="rounded-xl p-2.5" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                            <p className="text-[10px] text-indigo-300 font-semibold mb-0.5">⭐ Did you know?</p>
                            <p className="text-xs text-gray-300">{obj.wow}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div><span className="text-gray-600">Altitude: </span><span className="font-bold" style={{ color: obj.quality.color }}>{obj.hz.alt.toFixed(1)}°</span></div>
                            <div><span className="text-gray-600">Direction: </span><span className="text-gray-300">{azToDirection(obj.hz.az)}</span></div>
                            <div><span className="text-gray-600">Type: </span><span className="text-gray-300">{TYPE_LABELS[obj.type]}</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <p className="text-[10px] text-gray-500">
              <span className="text-indigo-400 font-semibold">Ranked by:</span> altitude + brightness − moon interference. Updates every minute.
            </p>
          </div>
        </>
      )}

      <p className="text-[10px] text-gray-700 mt-3 text-center">Live ephemeris · Positions calculated for {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  )
}
