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

function sunDeclination(d: number): number {
  const w = rev(282.9404 + 4.70935e-5 * d) * DEG
  const M = rev(356.0470 + 0.9856002585 * d) * DEG
  const e = 0.016709 - 1.151e-9 * d
  const E = M + e * Math.sin(M) * (1 + e * Math.cos(M))
  const xv = Math.cos(E) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E)
  const lonsun = Math.atan2(yv, xv) * 180 / Math.PI + w * 180 / Math.PI
  return Math.asin(Math.sin(lonsun * DEG) * Math.sin(23.4393 * DEG)) * 180 / Math.PI
}

function sunriseSunset(date: Date, lat: number, lng: number, altitude = -0.833): { rise: Date | null; set: Date | null } {
  const jd = julianDate(date)
  const d = jd - 2451543.5
  const decl = sunDeclination(d) * DEG
  const latR = lat * DEG
  const cosH = (Math.sin(altitude * DEG) - Math.sin(latR) * Math.sin(decl)) / (Math.cos(latR) * Math.cos(decl))
  if (cosH > 1) return { rise: null, set: null } // polar night
  if (cosH < -1) return { rise: null, set: null } // midnight sun
  const H = Math.acos(cosH) * 180 / Math.PI / 15
  const noon = 12 - lng / 15
  const riseUTC = noon - H, setUTC = noon + H
  const baseDay = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  return {
    rise: new Date(baseDay.getTime() + riseUTC * 3600000),
    set: new Date(baseDay.getTime() + setUTC * 3600000),
  }
}

function moonPhase(d: number): number {
  const M = rev(115.3654 + 13.0649929509 * d) * DEG
  const E = M + 0.0549 * Math.sin(M)
  const xv = Math.cos(E) - 0.0549, yv = Math.sqrt(1 - 0.0549 * 0.0549) * Math.sin(E)
  const moonLon = Math.atan2(yv, xv) * 180 / Math.PI + rev(318.0634 + 0.1643573223 * d)
  const sunLon = rev(282.9404 + 4.70935e-5 * d) + rev(356.0470 + 0.9856002585 * d)
  return ((moonLon - sunLon) % 360 + 360) % 360 / 360
}

function moonAlt(date: Date, lat: number, lng: number): number {
  const jd = julianDate(date), d = jd - 2451543.5
  const lst = localSiderealTime(date, lng)
  const N = rev(125.1228 - 0.0529538083 * d) * DEG
  const i = 5.1454 * DEG
  const w = rev(318.0634 + 0.1643573223 * d) * DEG
  const M = rev(115.3654 + 13.0649929509 * d) * DEG
  const E = M + 0.0549 * Math.sin(M)
  const xv = Math.cos(E) - 0.0549, yv = Math.sqrt(1 - 0.0549 * 0.0549) * Math.sin(E)
  const xh = xv * (Math.cos(N) * Math.cos(w) - Math.sin(N) * Math.sin(w) * Math.cos(i)) - yv * (Math.cos(N) * Math.sin(w) + Math.sin(N) * Math.cos(w) * Math.cos(i))
  const yh = xv * (Math.sin(N) * Math.cos(w) + Math.cos(N) * Math.sin(w) * Math.cos(i)) + yv * (-Math.sin(N) * Math.sin(w) + Math.cos(N) * Math.cos(w) * Math.cos(i))
  const zh = yv * Math.sin(w) * Math.sin(i)
  const ra = Math.atan2(yh, xh) * 180 / Math.PI / 15
  const dec = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * 180 / Math.PI
  const ha = (lst - ra) * 15 * DEG
  const decR = dec * DEG, latR = lat * DEG
  return Math.asin(Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)) * 180 / Math.PI
}

interface CheckItem {
  id: string
  label: string
  detail: string
  status: 'good' | 'warn' | 'bad' | 'info'
  icon: string
}

export default function NightSessionPlanner() {
  const [loc, setLoc] = useState({ lat: 32.0, lng: 34.78 })
  const [locName, setLocName] = useState('Your location')
  const [weather, setWeather] = useState<{ cloud: number; humidity: number; wind: number } | null>(null)
  const [checklist, setChecklist] = useState<string[]>([])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(pos => {
      setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      setLocName(`${Math.abs(pos.coords.latitude).toFixed(1)}°${pos.coords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(pos.coords.longitude).toFixed(1)}°${pos.coords.longitude >= 0 ? 'E' : 'W'}`)
    })
  }, [])

  useEffect(() => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&hourly=cloudcover,relativehumidity_2m,windspeed_10m&forecast_days=1&timezone=auto`)
      .then(r => r.json())
      .then(data => {
        const tonight = (data.hourly?.time ?? []).findIndex((t: string) => new Date(t).getHours() === 21)
        const i = tonight >= 0 ? tonight : 0
        setWeather({
          cloud: data.hourly?.cloudcover?.[i] ?? 0,
          humidity: data.hourly?.relativehumidity_2m?.[i] ?? 50,
          wind: data.hourly?.windspeed_10m?.[i] ?? 0,
        })
      })
      .catch(() => {})
  }, [loc.lat, loc.lng])

  const conditions = useMemo((): CheckItem[] => {
    const now = new Date()
    const jd = julianDate(now), d = jd - 2451543.5

    const { set: sunset } = sunriseSunset(now, loc.lat, loc.lng)
    const { set: astroSet } = sunriseSunset(now, loc.lat, loc.lng, -18)
    const phase = moonPhase(d)
    const mAlt = moonAlt(now, loc.lat, loc.lng)
    const illum = Math.round(Math.abs(Math.cos(phase * 2 * Math.PI)) * 50 + 50)

    const items: CheckItem[] = []

    // Sunset
    if (sunset) {
      const setStr = sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      items.push({ id: 'sunset', icon: '🌅', label: 'Sunset', detail: `Tonight at ${setStr}`, status: 'info' })
    }

    // Astronomical twilight
    if (astroSet) {
      const astStr = astroSet.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const hoursUntil = (astroSet.getTime() - now.getTime()) / 3600000
      items.push({
        id: 'twilight', icon: '🌆', label: 'Dark Sky Begins',
        detail: `Astronomical twilight ends at ${astStr}${hoursUntil > 0 ? ` (in ${Math.floor(hoursUntil)}h ${Math.round((hoursUntil % 1) * 60)}m)` : ' (already dark)'}`,
        status: hoursUntil > 3 ? 'warn' : hoursUntil <= 0 ? 'good' : 'info',
      })
    }

    // Moon
    const moonGood = phase < 0.25 || phase > 0.75
    items.push({
      id: 'moon', icon: '🌙', label: 'Moon Interference',
      detail: `${illum}% illuminated, currently ${mAlt > 0 ? `${Math.round(mAlt)}° above horizon` : 'below horizon'}`,
      status: moonGood ? 'good' : illum > 70 ? 'bad' : 'warn',
    })

    // Cloud cover
    if (weather) {
      items.push({
        id: 'cloud', icon: '☁️', label: 'Cloud Cover',
        detail: `${weather.cloud}% tonight${weather.cloud < 20 ? ' — clear skies!' : weather.cloud < 50 ? ' — partly cloudy' : ' — mostly cloudy'}`,
        status: weather.cloud < 20 ? 'good' : weather.cloud < 50 ? 'warn' : 'bad',
      })
      items.push({
        id: 'humidity', icon: '💧', label: 'Humidity',
        detail: `${weather.humidity}%${weather.humidity > 85 ? ' — risk of dew on optics' : weather.humidity > 70 ? ' — moderately humid' : ' — dry, good for optics'}`,
        status: weather.humidity < 70 ? 'good' : weather.humidity < 85 ? 'warn' : 'bad',
      })
      items.push({
        id: 'wind', icon: '💨', label: 'Wind Speed',
        detail: `${Math.round(weather.wind)} km/h${weather.wind < 10 ? ' — stable, great for high magnification' : weather.wind < 25 ? ' — moderate, limit to ×150' : ' — windy, use low magnification'}`,
        status: weather.wind < 10 ? 'good' : weather.wind < 25 ? 'warn' : 'bad',
      })
    }

    return items
  }, [loc, weather])

  const overallScore = useMemo(() => {
    const scores = { good: 3, info: 2, warn: 1, bad: 0 }
    const total = conditions.filter(c => c.id !== 'sunset' && c.id !== 'twilight').reduce((s, c) => s + scores[c.status], 0)
    const max = conditions.filter(c => c.id !== 'sunset' && c.id !== 'twilight').length * 3
    return max > 0 ? Math.round((total / max) * 10) : 0
  }, [conditions])

  const scoreColor = overallScore >= 8 ? '#22c55e' : overallScore >= 5 ? '#eab308' : '#ef4444'
  const scoreLabel = overallScore >= 8 ? 'Excellent Night' : overallScore >= 6 ? 'Good Night' : overallScore >= 4 ? 'Fair Night' : 'Poor Conditions'

  const GEAR_CHECKLIST = [
    'Telescope / binoculars clean and collimated',
    'Red flashlight charged',
    'Eyepieces ready (low, medium, high power)',
    'Star charts / apps downloaded for offline use',
    'Warm clothing (temperature drops at night)',
    'Dew heater / anti-dew strips ready',
    'Observation log / notebook',
    'Camera/DSLR with remote shutter (if imaging)',
    'Power bank / batteries charged',
    'Chair or observing table set up',
  ]

  const toggleCheck = (item: string) => {
    setChecklist(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
  }

  const statusIcon = (s: CheckItem['status']) =>
    s === 'good' ? '✅' : s === 'warn' ? '⚠️' : s === 'bad' ? '❌' : 'ℹ️'

  return (
    <div className="card-dark p-5 rounded-2xl">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📋</span>
          <div>
            <h2 className="text-xl font-bold text-white">Night Session Planner</h2>
            <p className="text-slate-400 text-sm">{locName}</p>
          </div>
        </div>
        {/* Score */}
        <div className="text-center bg-slate-800/60 rounded-2xl px-6 py-3">
          <div className="text-3xl font-black" style={{ color: scoreColor }}>{overallScore}/10</div>
          <div className="text-sm font-semibold" style={{ color: scoreColor }}>{scoreLabel}</div>
        </div>
      </div>

      {/* Conditions grid */}
      <div className="space-y-2 mb-6">
        {conditions.map(item => (
          <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
            item.status === 'good' ? 'border-green-800/40 bg-green-950/20' :
            item.status === 'bad' ? 'border-red-800/40 bg-red-950/20' :
            item.status === 'warn' ? 'border-yellow-800/40 bg-yellow-950/20' :
            'border-slate-700/40 bg-slate-800/20'
          }`}>
            <span className="text-lg mt-0.5">{statusIcon(item.status)}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span className="text-white font-semibold text-sm">{item.label}</span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">{item.detail}</p>
            </div>
          </div>
        ))}
        {!weather && (
          <div className="text-slate-500 text-sm text-center py-2">Loading weather conditions…</div>
        )}
      </div>

      {/* Equipment checklist */}
      <div className="border-t border-slate-800 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-sm">Equipment Checklist</h3>
          <span className="text-xs text-slate-400">{checklist.length}/{GEAR_CHECKLIST.length} ready</span>
        </div>
        <div className="space-y-1.5">
          {GEAR_CHECKLIST.map(item => (
            <button
              key={item}
              onClick={() => toggleCheck(item)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                checklist.includes(item) ? 'bg-green-950/30 border border-green-800/30' : 'bg-slate-800/40 border border-transparent hover:border-slate-700'
              }`}
            >
              <span className={`text-base ${checklist.includes(item) ? 'text-green-400' : 'text-slate-600'}`}>
                {checklist.includes(item) ? '☑' : '☐'}
              </span>
              <span className={checklist.includes(item) ? 'text-green-200 line-through' : 'text-slate-300'}>{item}</span>
            </button>
          ))}
        </div>
        {checklist.length === GEAR_CHECKLIST.length && (
          <div className="mt-3 text-center text-green-400 font-bold text-sm">🚀 You're ready to observe!</div>
        )}
      </div>

      {/* Tips based on conditions */}
      <div className="mt-5 border-t border-slate-800 pt-5">
        <h3 className="text-white font-bold text-sm mb-3">Tonight's Tips</h3>
        <div className="space-y-2 text-xs text-slate-400">
          {overallScore >= 8 && <p className="text-green-300">✨ Excellent conditions — perfect for high-magnification planetary viewing and faint deep-sky objects.</p>}
          {conditions.find(c => c.id === 'moon')?.status === 'bad' && <p className="text-yellow-300">🌕 Bright moon tonight — focus on planets, double stars, and open clusters. Avoid faint nebulae.</p>}
          {weather && weather.humidity > 80 && <p className="text-yellow-300">💧 High humidity — point your dew heater at the objective/corrector plate to prevent fogging.</p>}
          {weather && weather.wind > 20 && <p className="text-yellow-300">💨 Significant wind — use low magnification (×50–×100) and consider a wind shield for your telescope.</p>}
          {weather && weather.cloud < 10 && <p className="text-green-300">☁️ Nearly cloudless — great for astrophotography, use long exposures.</p>}
          <p>🔴 Allow 30 minutes for dark adaptation before looking at faint objects.</p>
          <p>🌡️ Check the forecast temperature — equipment needs time to cool to ambient temp for best seeing.</p>
        </div>
      </div>
    </div>
  )
}
