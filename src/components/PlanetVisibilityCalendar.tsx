import { useMemo, useState } from 'react'

const DEG = Math.PI / 180
const rev = (x: number) => ((x % 360) + 360) % 360

function julianDate(d: Date) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate()
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5
}

function localSiderealTime(date: Date, lng: number) {
  const jd = julianDate(date)
  const t = (jd - 2451545) / 36525
  const gst = ((6.697374558 + 2400.0513369 * t + 0.0000258622 * t * t) % 24 + 24) % 24
  return ((gst + lng / 15) % 24 + 24) % 24
}

function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M))
  for (let n = 0; n < 8; n++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    if (Math.abs(dE) < 1e-7) break; E -= dE
  }
  return E
}

interface OrbElem { N: number; i: number; w: number; a: number; e: number; M: number }

function helioXYZ({ N, i, w, a, e, M }: OrbElem) {
  const E = solveKepler(M * DEG, e)
  const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const v = Math.atan2(yv, xv), rr = Math.sqrt(xv * xv + yv * yv)
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
  const E = solveKepler(M, e), xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E)
  const rr = Math.sqrt(xv * xv + yv * yv), ls = Math.atan2(yv, xv) + wr
  return { x: rr * Math.cos(ls + Math.PI), y: rr * Math.sin(ls + Math.PI), z: 0 }
}

function getOrbElems(d: number, name: string): OrbElem | null {
  switch (name) {
    case 'Venus':   return { N: rev(76.6799+2.4659e-5*d),  i: 3.3946, w: rev(54.891+1.38374e-5*d),  a: 0.72333, e: 0.006773, M: rev(48.0052+1.6021302244*d) }
    case 'Mars':    return { N: rev(49.5574+2.11081e-5*d), i: 1.8497, w: rev(286.5016+2.92961e-5*d), a: 1.523688, e: 0.093405, M: rev(18.6021+0.5240207766*d) }
    case 'Jupiter': return { N: rev(100.4542+2.76854e-5*d),i: 1.303,  w: rev(273.8777+1.64505e-5*d), a: 5.20256, e: 0.048498, M: rev(19.895+0.0830853001*d) }
    case 'Saturn':  return { N: rev(113.6634+2.3898e-5*d), i: 2.4886, w: rev(339.3939+2.97661e-5*d), a: 9.55475, e: 0.055546, M: rev(316.967+0.0334442282*d) }
    case 'Mercury': return { N: rev(48.3313+3.24587e-5*d), i: 7.0047, w: rev(29.1241+1.01444e-5*d), a: 0.387098, e: 0.205635, M: rev(168.6562+4.0923344368*d) }
    default: return null
  }
}

function maxAltAtNight(date: Date, planetName: string, lat: number, lng: number): number {
  let maxAlt = -90
  for (let h = 20; h <= 28; h++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h % 24)
    const jd = julianDate(d), day = jd - 2451543.5
    const el = getOrbElems(day, planetName)
    if (!el) return -90
    const pv = helioXYZ(el), ev = earthXYZ(day)
    const dx = pv.x - ev.x, dy = pv.y - ev.y, dz = pv.z - ev.z
    const ecl = (23.4393 - 3.563e-7 * day) * DEG
    const yeq = dy * Math.cos(ecl) - dz * Math.sin(ecl)
    const zeq = dy * Math.sin(ecl) + dz * Math.cos(ecl)
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const ra = rev(Math.atan2(yeq, dx) * 180 / Math.PI) / 15
    const dec = Math.asin(Math.max(-1, Math.min(1, zeq / dist))) * 180 / Math.PI
    const lst = localSiderealTime(d, lng)
    const ha = (lst - ra) * 15 * DEG
    const decR = dec * DEG, latR = lat * DEG
    const alt = Math.asin(Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)) * 180 / Math.PI
    if (alt > maxAlt) maxAlt = alt
  }
  return maxAlt
}

const PLANETS = [
  { name: 'Venus',   symbol: '♀', color: '#ffe5a0' },
  { name: 'Mars',    symbol: '♂', color: '#ff7744' },
  { name: 'Jupiter', symbol: '♃', color: '#ffcc99' },
  { name: 'Saturn',  symbol: '♄', color: '#eecc88' },
  { name: 'Mercury', symbol: '☿', color: '#aabbcc' },
]

const VISIBILITY_COLORS = [
  { min: 60, color: '#22c55e', label: 'Excellent (>60°)' },
  { min: 40, color: '#86efac', label: 'Good (40-60°)' },
  { min: 20, color: '#eab308', label: 'Fair (20-40°)' },
  { min: 5,  color: '#f97316', label: 'Poor (5-20°)' },
  { min: -90, color: '#1e293b', label: 'Not visible' },
]

function altToColor(alt: number): string {
  for (const { min, color } of VISIBILITY_COLORS) {
    if (alt >= min) return color
  }
  return '#1e293b'
}

export default function PlanetVisibilityCalendar() {
  const [loc] = useState({ lat: 32.0, lng: 34.78 })
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const matrix = useMemo(() => {
    return PLANETS.map(planet => ({
      ...planet,
      days: Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(viewYear, viewMonth, i + 1)
        return maxAltAtNight(d, planet.name, loc.lat, loc.lng)
      }),
    }))
  }, [viewMonth, viewYear, daysInMonth, loc.lat, loc.lng])

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('en-US', { month: 'long' })

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div className="card-dark p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-2xl">📅</span>
        <div>
          <h2 className="text-xl font-bold text-white">Planet Visibility Calendar</h2>
          <p className="text-slate-400 text-sm">Best night altitude for each planet this month</p>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition">◀</button>
        <h3 className="text-white font-bold text-lg">{monthName} {viewYear}</h3>
        <button onClick={nextMonth} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition">▶</button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 500 }}>
          {/* Day numbers header */}
          <div className="flex gap-px mb-1">
            <div className="w-20 shrink-0" />
            {Array.from({ length: daysInMonth }, (_, i) => (
              <div key={i} className="flex-1 text-center text-[9px] text-slate-500 font-bold">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Planet rows */}
          {matrix.map(planet => (
            <div key={planet.name} className="flex gap-px mb-1.5 items-center">
              <div className="w-20 shrink-0 text-xs font-bold" style={{ color: planet.color }}>
                {planet.symbol} {planet.name}
              </div>
              {planet.days.map((alt, i) => {
                const isToday = viewYear === now.getFullYear() && viewMonth === now.getMonth() && i + 1 === now.getDate()
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-all"
                    style={{
                      height: 18,
                      background: altToColor(alt),
                      outline: isToday ? '2px solid white' : 'none',
                      opacity: alt < 5 ? 0.3 : 1,
                    }}
                    title={`${planet.name} ${monthName} ${i + 1}: ${alt < 5 ? 'Not visible' : `${Math.round(alt)}° max alt`}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-800">
        {VISIBILITY_COLORS.slice(0, 4).map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="w-4 h-4 rounded-sm" style={{ background: color }} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-4 h-4 rounded-sm bg-slate-800 border border-slate-600" />
          Not visible
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-auto">
          <div className="w-4 h-4 rounded-sm border-2 border-white bg-slate-700" />
          Today
        </div>
      </div>

      <p className="text-[10px] text-slate-600 mt-2">
        Based on maximum altitude during 20:00–04:00 local night hours · Location: {loc.lat.toFixed(1)}°N
      </p>
    </div>
  )
}
