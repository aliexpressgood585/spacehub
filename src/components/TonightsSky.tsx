import { useState, useEffect, useMemo } from 'react'

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

function julianDate(d: Date) {
  return d.getTime() / 86400000 + 2440587.5
}

function lst(date: Date, lng: number) {
  const jd = julianDate(date)
  const T = (jd - 2451545.0) / 36525
  let gst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T
  gst = ((gst % 360) + 360) % 360
  return ((gst + lng) % 360 + 360) % 360
}

function raDecToAltAz(ra: number, dec: number, lat: number, lng: number, date: Date) {
  const lstDeg = lst(date, lng)
  const ha = (lstDeg - ra * 15 + 360) % 360
  const haR = ha * DEG, decR = dec * DEG, latR = lat * DEG
  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(haR)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD
  const cosAz = (Math.sin(decR) - Math.sin(alt * DEG) * Math.sin(latR)) / (Math.cos(alt * DEG) * Math.cos(latR))
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD
  if (Math.sin(haR) > 0) az = 360 - az
  return { alt, az }
}

function sunPosition(date: Date): { ra: number; dec: number } {
  const jd = julianDate(date)
  const n = jd - 2451545.0
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG
  const epsilon = 23.439 * DEG
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * RAD / 15
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) * RAD
  return { ra: (ra + 24) % 24, dec }
}

// Paul Schlyter planet positions (simplified)
function planetRA(name: string, jd: number): { ra: number; dec: number; mag: number } {
  const d = jd - 2451543.5
  const w = (282.9404 + 4.70935e-5 * d) * DEG
  const e = 0.016709 - 1.151e-9 * d
  const M = ((356.0470 + 0.9856002585 * d) % 360 + 360) % 360 * DEG
  const E = M + e * Math.sin(M) * (1 + e * Math.cos(M))
  const xv = Math.cos(E) - e
  const yv = Math.sqrt(1 - e * e) * Math.sin(E)
  const v = Math.atan2(yv, xv)
  const r = Math.sqrt(xv * xv + yv * yv)
  const lonsun = v + w

  switch (name) {
    case 'Venus': {
      const N = (76.6799 + 2.4659e-5 * d) * DEG
      const wV = (54.8910 + 1.38374e-4 * d) * DEG
      const a = 0.723330
      const eV = 0.006773 - 1.302e-9 * d
      const MV = ((48.0052 + 1.6021302244 * d) % 360 + 360) % 360 * DEG
      const EV = MV + eV * Math.sin(MV) * (1 + eV * Math.cos(MV))
      const xvV = a * (Math.cos(EV) - eV)
      const yvV = a * Math.sqrt(1 - eV * eV) * Math.sin(EV)
      const vV = Math.atan2(yvV, xvV)
      const rV = Math.sqrt(xvV * xvV + yvV * yvV)
      const lonV = vV + wV
      const xh = rV * (Math.cos(N) * Math.cos(lonV) - Math.sin(N) * Math.sin(lonV) * Math.cos(3.3946 * DEG))
      const yh = rV * (Math.sin(N) * Math.cos(lonV) + Math.cos(N) * Math.sin(lonV) * Math.cos(3.3946 * DEG))
      const xg = xh + r * Math.cos(lonsun)
      const yg = yh + r * Math.sin(lonsun)
      const ra = Math.atan2(yg, xg) * RAD / 15
      const dec = Math.atan2(rV * Math.sin(lonV) * Math.sin(3.3946 * DEG), Math.sqrt(xg * xg + yg * yg)) * RAD
      return { ra: (ra + 24) % 24, dec, mag: -4.0 }
    }
    case 'Mars': {
      const N = (49.5574 + 2.11081e-5 * d) * DEG
      const wM = (286.5016 + 2.92961e-5 * d) * DEG
      const a = 1.523688
      const eM = 0.093405 + 2.516e-9 * d
      const MM = ((18.6021 + 0.5240207766 * d) % 360 + 360) % 360 * DEG
      const EM = MM + eM * Math.sin(MM) * (1 + eM * Math.cos(MM))
      const xvM = a * (Math.cos(EM) - eM)
      const yvM = a * Math.sqrt(1 - eM * eM) * Math.sin(EM)
      const vM = Math.atan2(yvM, xvM)
      const rM = Math.sqrt(xvM * xvM + yvM * yvM)
      const lonM = vM + wM
      const xh = rM * (Math.cos(N) * Math.cos(lonM) - Math.sin(N) * Math.sin(lonM) * Math.cos(1.8497 * DEG))
      const yh = rM * (Math.sin(N) * Math.cos(lonM) + Math.cos(N) * Math.sin(lonM) * Math.cos(1.8497 * DEG))
      const xg = xh + r * Math.cos(lonsun)
      const yg = yh + r * Math.sin(lonsun)
      const ra = Math.atan2(yg, xg) * RAD / 15
      const dec = Math.atan2(rM * Math.sin(lonM) * Math.sin(1.8497 * DEG), Math.sqrt(xg * xg + yg * yg)) * RAD
      return { ra: (ra + 24) % 24, dec, mag: 0.5 }
    }
    case 'Jupiter': {
      const N = (100.4542 + 2.76854e-5 * d) * DEG
      const wJ = (273.8777 + 1.64505e-5 * d) * DEG
      const a = 5.20256
      const eJ = 0.048498 + 4.469e-9 * d
      const MJ = ((19.8950 + 0.0830853001 * d) % 360 + 360) % 360 * DEG
      const EJ = MJ + eJ * Math.sin(MJ) * (1 + eJ * Math.cos(MJ))
      const xvJ = a * (Math.cos(EJ) - eJ)
      const yvJ = a * Math.sqrt(1 - eJ * eJ) * Math.sin(EJ)
      const vJ = Math.atan2(yvJ, xvJ)
      const rJ = Math.sqrt(xvJ * xvJ + yvJ * yvJ)
      const lonJ = vJ + wJ
      const xh = rJ * (Math.cos(N) * Math.cos(lonJ) - Math.sin(N) * Math.sin(lonJ) * Math.cos(1.3030 * DEG))
      const yh = rJ * (Math.sin(N) * Math.cos(lonJ) + Math.cos(N) * Math.sin(lonJ) * Math.cos(1.3030 * DEG))
      const xg = xh + r * Math.cos(lonsun)
      const yg = yh + r * Math.sin(lonsun)
      const ra = Math.atan2(yg, xg) * RAD / 15
      const dec = Math.atan2(rJ * Math.sin(lonJ) * Math.sin(1.3030 * DEG), Math.sqrt(xg * xg + yg * yg)) * RAD
      return { ra: (ra + 24) % 24, dec, mag: -2.0 }
    }
    case 'Saturn': {
      const N = (113.6634 + 2.38980e-5 * d) * DEG
      const wS = (339.3939 + 2.97661e-5 * d) * DEG
      const a = 9.55475
      const eS = 0.055546 - 9.499e-9 * d
      const MS = ((316.9670 + 0.0334442282 * d) % 360 + 360) % 360 * DEG
      const ES = MS + eS * Math.sin(MS) * (1 + eS * Math.cos(MS))
      const xvS = a * (Math.cos(ES) - eS)
      const yvS = a * Math.sqrt(1 - eS * eS) * Math.sin(ES)
      const vS = Math.atan2(yvS, xvS)
      const rS = Math.sqrt(xvS * xvS + yvS * yvS)
      const lonS = vS + wS
      const xh = rS * (Math.cos(N) * Math.cos(lonS) - Math.sin(N) * Math.sin(lonS) * Math.cos(2.4886 * DEG))
      const yh = rS * (Math.sin(N) * Math.cos(lonS) + Math.cos(N) * Math.sin(lonS) * Math.cos(2.4886 * DEG))
      const xg = xh + r * Math.cos(lonsun)
      const yg = yh + r * Math.sin(lonsun)
      const ra = Math.atan2(yg, xg) * RAD / 15
      const dec = Math.atan2(rS * Math.sin(lonS) * Math.sin(2.4886 * DEG), Math.sqrt(xg * xg + yg * yg)) * RAD
      return { ra: (ra + 24) % 24, dec, mag: 0.7 }
    }
    default:
      return { ra: 0, dec: 0, mag: 99 }
  }
}

function moonPhaseInfo(date: Date): { phase: number; name: string; emoji: string; illumination: number } {
  const jd = julianDate(date)
  const synodicMonth = 29.53058867
  const knownNew = 2451549.5
  const cyclePos = ((jd - knownNew) % synodicMonth + synodicMonth) % synodicMonth
  const phase = cyclePos / synodicMonth
  const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100)
  let name = '', emoji = ''
  if (phase < 0.03 || phase >= 0.97) { name = 'New Moon'; emoji = '🌑' }
  else if (phase < 0.22) { name = 'Waxing Crescent'; emoji = '🌒' }
  else if (phase < 0.28) { name = 'First Quarter'; emoji = '🌓' }
  else if (phase < 0.47) { name = 'Waxing Gibbous'; emoji = '🌔' }
  else if (phase < 0.53) { name = 'Full Moon'; emoji = '🌕' }
  else if (phase < 0.72) { name = 'Waning Gibbous'; emoji = '🌖' }
  else if (phase < 0.78) { name = 'Last Quarter'; emoji = '🌗' }
  else { name = 'Waning Crescent'; emoji = '🌘' }
  return { phase, name, emoji, illumination }
}

function sunsetSunrise(date: Date, lat: number, lng: number): { sunset: Date; sunrise: Date; astroTwilight: Date } {
  const jd = julianDate(date)
  const n = jd - 2451545.0
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG
  const epsilon = 23.439 * DEG
  const sinDec = Math.sin(epsilon) * Math.sin(lambda)
  const dec = Math.asin(sinDec)
  const latR = lat * DEG
  const cosH = (Math.sin(-0.8333 * DEG) - Math.sin(latR) * sinDec) / (Math.cos(latR) * Math.cos(dec))
  const cosHa = (Math.sin(-18 * DEG) - Math.sin(latR) * sinDec) / (Math.cos(latR) * Math.cos(dec))
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) * RAD / 15
  const Ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) * RAD / 15
  const noon = 12 - lng / 15
  const sunsetH = noon + H
  const sunriseH = noon - H
  const astroH = noon + Ha
  const toDate = (h: number) => { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setTime(d.getTime() + h * 3600000); return d }
  return { sunset: toDate(sunsetH), sunrise: toDate(sunriseH), astroTwilight: toDate(astroH) }
}

function fmtTime(d: Date) {
  try { return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return '--:--' }
}

function azDir(az: number) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(az / 45) % 8]
}

const PLANETS = ['Venus', 'Mars', 'Jupiter', 'Saturn'] as const

export default function TonightsSky() {
  const [loc, setLoc] = useState({ lat: 32.08, lng: 34.78 })
  const [locName, setLocName] = useState('Tel Aviv')
  const [now] = useState(new Date())
  const jd = useMemo(() => julianDate(now), [now])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(pos => {
      setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      setLocName('Your location')
    })
  }, [])

  const moon = useMemo(() => moonPhaseInfo(now), [now])
  const { sunset, sunrise, astroTwilight } = useMemo(() => sunsetSunrise(now, loc.lat, loc.lng), [now, loc])
  const sun = useMemo(() => sunPosition(now), [now])
  const sunPos = useMemo(() => raDecToAltAz(sun.ra, sun.dec, loc.lat, loc.lng, now), [sun, loc, now])
  const isNight = sunPos.alt < -6

  const tonightMidnight = useMemo(() => {
    const d = new Date(now)
    d.setHours(23, 0, 0, 0)
    if (d < now) d.setDate(d.getDate() + 1)
    return d
  }, [now])

  const planetData = useMemo(() => {
    return PLANETS.map(name => {
      const { ra, dec, mag } = planetRA(name, jd)
      const pos = raDecToAltAz(ra, dec, loc.lat, loc.lng, tonightMidnight)
      const posNow = raDecToAltAz(ra, dec, loc.lat, loc.lng, now)
      return { name, ra, dec, mag, altNow: posNow.alt, azNow: posNow.az, altMidnight: pos.alt, azMidnight: pos.az }
    })
  }, [jd, loc, tonightMidnight, now])

  const visiblePlanets = planetData.filter(p => p.altMidnight > 5)
  const icons: Record<string, string> = { Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄' }
  const colors: Record<string, string> = { Venus: '#fde68a', Mars: '#f87171', Jupiter: '#fb923c', Saturn: '#fbbf24' }

  const bestObjects = useMemo(() => {
    const month = now.getMonth()
    const seasonalObjects: { name: string; type: string; mag: number; tip: string; emoji: string }[] = []
    // Year-round
    seasonalObjects.push({ name: 'Moon', type: 'Natural satellite', mag: -12.7, tip: `${moon.illumination}% illuminated`, emoji: moon.emoji })
    if (month >= 8 && month <= 11) {
      seasonalObjects.push({ name: 'Andromeda Galaxy (M31)', type: 'Galaxy', mag: 3.4, tip: 'High in the sky — best autumn object', emoji: '🌌' })
      seasonalObjects.push({ name: 'Perseus Double Cluster', type: 'Open Cluster', mag: 4.3, tip: 'Stunning pair in binoculars', emoji: '✨' })
    }
    if (month >= 11 || month <= 2) {
      seasonalObjects.push({ name: 'Orion Nebula (M42)', type: 'Nebula', mag: 4.0, tip: 'Stellar nursery, visible to naked eye', emoji: '🌫️' })
      seasonalObjects.push({ name: 'Pleiades (M45)', type: 'Open Cluster', mag: 1.6, tip: 'Seven Sisters — naked eye cluster', emoji: '✨' })
      seasonalObjects.push({ name: 'Betelgeuse', type: 'Star (variable)', mag: 0.5, tip: 'Red supergiant in Orion', emoji: '⭐' })
    }
    if (month >= 3 && month <= 6) {
      seasonalObjects.push({ name: 'Leo Triplet (M65/M66)', type: 'Galaxy pair', mag: 9.3, tip: 'Spring galaxy season — needs telescope', emoji: '🌌' })
      seasonalObjects.push({ name: 'Virgo Cluster', type: 'Galaxy cluster', mag: 8.4, tip: '1,300+ galaxies, 65 million ly away', emoji: '🌌' })
    }
    if (month >= 5 && month <= 9) {
      seasonalObjects.push({ name: 'Milky Way Core', type: 'Galaxy band', mag: -1, tip: 'Sagittarius center, best from dark sites', emoji: '🌌' })
      seasonalObjects.push({ name: 'M13 Hercules Cluster', type: 'Globular', mag: 5.8, tip: '300,000 stars, 25,000 ly away', emoji: '✨' })
    }
    return seasonalObjects.slice(0, 5)
  }, [now, moon])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="icon-box text-xl">🌃</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-xl">Tonight's Sky</h3>
          <p className="text-gray-500 text-xs">{locName} · {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <span
          className="text-xs px-2.5 py-1 rounded-full font-bold"
          style={isNight
            ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }
            : { background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }
          }
        >
          {isNight ? '🌙 Night' : '☀️ Day'}
        </span>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Sunset', val: fmtTime(sunset), icon: '🌅', color: '#f97316' },
          { label: 'Dark sky', val: fmtTime(astroTwilight), icon: '🌑', color: '#818cf8' },
          { label: 'Sunrise', val: fmtTime(sunrise), icon: '🌄', color: '#fbbf24' },
          { label: 'Moon', val: `${moon.illumination}%`, icon: moon.emoji, color: '#94a3b8' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-3 text-center" style={{ background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="font-black text-base" style={{ color: s.color }}>{s.val}</div>
            <div className="text-xs text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Moon phase */}
      <div className="rounded-2xl p-4 mb-4 flex items-center gap-4" style={{ background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.12)' }}>
        <div className="text-5xl">{moon.emoji}</div>
        <div>
          <p className="text-white font-bold text-base">{moon.name}</p>
          <p className="text-gray-500 text-sm">{moon.illumination}% illuminated</p>
          {moon.illumination > 70 && <p className="text-yellow-400 text-xs mt-1">⚠️ Bright moon — may wash out faint objects</p>}
          {moon.illumination < 20 && <p className="text-green-400 text-xs mt-1">✅ Dark sky night — excellent for deep sky!</p>}
        </div>
      </div>

      {/* Visible planets */}
      <div className="mb-4">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Planets Tonight at Midnight</p>
        {visiblePlanets.length === 0 ? (
          <p className="text-gray-600 text-sm">No naked-eye planets above horizon at midnight</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {visiblePlanets.map(p => (
              <div key={p.name} className="rounded-xl p-3" style={{ background: `${colors[p.name]}10`, border: `1px solid ${colors[p.name]}30` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: colors[p.name], fontSize: 18 }}>{icons[p.name]}</span>
                  <span className="font-bold text-sm" style={{ color: colors[p.name] }}>{p.name}</span>
                </div>
                <p className="text-white font-mono text-xs">{p.altMidnight.toFixed(0)}° alt</p>
                <p className="text-gray-600 text-xs">{azDir(p.azMidnight)} · mag {p.mag.toFixed(1)}</p>
              </div>
            ))}
          </div>
        )}
        {planetData.filter(p => p.altMidnight <= 5).length > 0 && (
          <p className="text-gray-700 text-xs mt-2">
            Not visible tonight: {planetData.filter(p => p.altMidnight <= 5).map(p => p.name).join(', ')}
          </p>
        )}
      </div>

      {/* Best objects tonight */}
      <div>
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Best Objects This Season</p>
        <div className="space-y-2">
          {bestObjects.map(obj => (
            <div key={obj.name} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xl">{obj.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{obj.name}</p>
                <p className="text-gray-600 text-xs">{obj.type} · mag {obj.mag > 0 ? obj.mag.toFixed(1) : obj.mag}</p>
              </div>
              <p className="text-gray-500 text-xs text-right max-w-[120px] leading-tight">{obj.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
