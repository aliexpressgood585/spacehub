import { useState, useEffect, useCallback, useRef } from 'react'
import { useLang } from '../i18n/LangContext'

interface Pass {
  start: Date
  maxEl: number
  maxElTime: Date
  end: Date
  duration: number
  startAz: number
  maxAz: number
  endAz: number
  isVisible: boolean
}

interface Location { lat: number; lng: number; city: string }

const CITIES = [
  { name: 'New York',     lat: 40.7128, lng: -74.0060 },
  { name: 'London',       lat: 51.5074, lng: -0.1278 },
  { name: 'Los Angeles',  lat: 34.0522, lng: -118.2437 },
  { name: 'Paris',        lat: 48.8566, lng: 2.3522 },
  { name: 'Tokyo',        lat: 35.6762, lng: 139.6503 },
  { name: 'Sydney',       lat: -33.8688, lng: 151.2093 },
  { name: 'Toronto',      lat: 43.6532, lng: -79.3832 },
  { name: 'Berlin',       lat: 52.5200, lng: 13.4050 },
  { name: 'Dubai',        lat: 25.2048, lng: 55.2708 },
  { name: 'Tel Aviv',     lat: 32.0853, lng: 34.7818 },
  { name: 'São Paulo',    lat: -23.5505, lng: -46.6333 },
  { name: 'Singapore',    lat: 1.3521, lng: 103.8198 },
  { name: 'Mumbai',       lat: 19.0760, lng: 72.8777 },
  { name: 'Mexico City',  lat: 19.4326, lng: -99.1332 },
]

function azToCompass(az: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(az / 22.5) % 16]
}

function sunElevationDeg(date: Date, lat: number, lng: number): number {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180
  const epsilon = 23.439 * Math.PI / 180
  const sinDec = Math.sin(epsilon) * Math.sin(lambda)
  const dec = Math.asin(sinDec)
  const gmst = ((18.697374558 + 24.06570982441908 * n) * 15 * Math.PI / 180) % (2 * Math.PI)
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda))
  const ha = gmst + lng * Math.PI / 180 - ra
  const latR = lat * Math.PI / 180
  return Math.asin(Math.sin(latR) * sinDec + Math.cos(latR) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI
}

type WinSat = Window & typeof globalThis & { satellite?: unknown }

async function loadSatellite(): Promise<unknown> {
  if ((window as WinSat).satellite) return (window as WinSat).satellite
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js'
    s.onload = () => resolve((window as WinSat).satellite)
    s.onerror = () => reject(new Error('Failed to load satellite.js'))
    document.head.appendChild(s)
  })
}

async function calculatePasses(lat: number, lng: number, days = 7): Promise<Pass[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satellite: any = await loadSatellite()
  if (!satellite) throw new Error('satellite.js not loaded')

  // Use /api/tle proxy to avoid CORS/rate-limit on celestrak.org directly
  const res = await fetch('/api/tle?id=25544')
  const text = await res.text()
  const lines = text.trim().split('\n').map((l: string) => l.trim()).filter(Boolean)

  let tle1 = '', tle2 = ''
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ')) { tle1 = lines[i]; tle2 = lines[i + 1]; break }
  }
  if (!tle1 || !tle2) throw new Error('TLE parse failed')

  const satrec = satellite.twoline2satrec(tle1, tle2)
  const observerGd = {
    longitude: satellite.degreesToRadians(lng),
    latitude: satellite.degreesToRadians(lat),
    height: 0.0,
  }

  const passes: Pass[] = []
  const now = Date.now()
  const endMs = now + days * 86400000

  let inPass = false
  let passStart = 0
  let passStartAz = 0
  let passMaxEl = 0
  let passMaxElTime = 0
  let passMaxAz = 0
  let passEndAz = 0

  const STEP_MS = 15000 // 15-second steps for accuracy

  for (let t = now; t < endMs; t += STEP_MS) {
    const date = new Date(t)
    const pv = satellite.propagate(satrec, date)
    if (!pv || !pv.position || typeof pv.position === 'boolean') continue

    const gmst = satellite.gstime(date)
    const ecf = satellite.eciToEcf(pv.position, gmst)
    const look = satellite.ecfToLookAngles(observerGd, ecf)
    const el = look.elevation * 180 / Math.PI
    const az = ((look.azimuth * 180 / Math.PI) + 360) % 360

    if (el > 0) {
      if (!inPass) {
        inPass = true
        passStart = t
        passStartAz = az
        passMaxEl = el
        passMaxElTime = t
        passMaxAz = az
      } else {
        passEndAz = az
        if (el > passMaxEl) {
          passMaxEl = el
          passMaxElTime = t
          passMaxAz = az
        }
      }
    } else if (inPass) {
      inPass = false
      if (passMaxEl >= 10) {
        const sunEl = sunElevationDeg(new Date(passMaxElTime), lat, lng)
        passes.push({
          start: new Date(passStart),
          maxEl: passMaxEl,
          maxElTime: new Date(passMaxElTime),
          end: new Date(t),
          duration: Math.round((t - passStart) / 60000),
          startAz: passStartAz,
          maxAz: passMaxAz,
          endAz: passEndAz || az,
          isVisible: sunEl < -6,
        })
      }
      passMaxEl = 0
    }
  }

  return passes
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function elColor(el: number) {
  if (el >= 60) return 'text-green-300'
  if (el >= 30) return 'text-yellow-300'
  return 'text-orange-300'
}

function msUntil(d: Date) {
  return d.getTime() - Date.now()
}

function formatCountdown(ms: number) {
  if (ms <= 0) return 'Now!'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function ISSPassPredictor() {
  const { t } = useLang()

  const elLabel = (el: number) => {
    if (el >= 60) return t('predictor.excellent')
    if (el >= 30) return t('predictor.good')
    return t('predictor.fair')
  }

  const [loc, setLoc] = useState<Location | null>({ lat: 32.0853, lng: 34.7818, city: 'Tel Aviv' })
  const [passes, setPasses] = useState<Pass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [geoError, setGeoError] = useState('')
  const [countdown, setCountdown] = useState('')
  const [selectedCity, setSelectedCity] = useState('Tel Aviv')
  const [copied, setCopied] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const notifSentRef = useRef<number>(0)

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    if (perm === 'granted') setNotifEnabled(true)
  }

  const toggleNotif = () => {
    if (notifEnabled) {
      setNotifEnabled(false)
      notifSentRef.current = 0
    } else {
      requestNotifPermission()
    }
  }

  const load = useCallback(async (l: Location) => {
    setLoading(true)
    setError('')
    try {
      const p = await calculatePasses(l.lat, l.lng, 7)
      setPasses(p)
    } catch {
      setError('Could not calculate passes. Try again.')
    }
    setLoading(false)
  }, [])

  // Auto-detect location on mount; fall back to Tel Aviv silently
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const l = { lat: pos.coords.latitude, lng: pos.coords.longitude, city: 'Your Location' }
          setLoc(l)
          load(l)
        },
        () => load({ lat: 32.0853, lng: 34.7818, city: 'Tel Aviv' }),
        { timeout: 5000 }
      )
    } else {
      load({ lat: 32.0853, lng: 34.7818, city: 'Tel Aviv' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const useGeo = () => {
    setGeoError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const l = { lat: pos.coords.latitude, lng: pos.coords.longitude, city: 'Your Location' }
        setLoc(l)
        load(l)
      },
      () => setGeoError('Location denied — choose a city below')
    )
  }

  const selectCity = (c: typeof CITIES[0]) => {
    const l = { lat: c.lat, lng: c.lng, city: c.name }
    setSelectedCity(c.name)
    setLoc(l)
    load(l)
  }

  // Live countdown to next pass + push notification at 15 min
  useEffect(() => {
    if (!passes.length) return
    const next = passes.find(p => p.start > new Date())
    if (!next) return
    const iv = setInterval(() => {
      const ms = msUntil(next.start)
      setCountdown(formatCountdown(ms))
      if (
        notifEnabled &&
        Notification.permission === 'granted' &&
        ms > 0 && ms <= 900000 &&
        notifSentRef.current !== next.start.getTime()
      ) {
        notifSentRef.current = next.start.getTime()
        const city = loc?.city ?? 'your location'
        new Notification('🚀 ISS Pass in ~15 minutes!', {
          body: `The ISS will fly over ${city} at ${formatTime(next.start)} — ${Math.round(next.maxEl)}° max elevation`,
          icon: '/favicon.svg',
          tag: 'iss-pass',
        })
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [passes, notifEnabled, loc])

  const nextPass = passes.find(p => p.start > new Date())

  const shareNextPass = () => {
    if (!nextPass || !loc) return
    const text = `🚀 The ISS will fly over ${loc.city} on ${formatDate(nextPass.start)} at ${formatTime(nextPass.start)} — ${Math.round(nextPass.maxEl)}° max elevation! Track it live: https://spacehub-nu.vercel.app`
    if (navigator.share) {
      navigator.share({ title: 'ISS Pass Alert', text, url: 'https://spacehub-nu.vercel.app' })
    } else {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
    }
  }

  const grouped: Record<string, Pass[]> = {}
  passes.forEach(p => {
    const key = formatDate(p.start)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(p)
  })

  return (
    <div className="space-card overflow-hidden">
      {/* Header */}
      <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="icon-box">🔭</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base">{t('predictor.title')}</h3>
            <p className="text-xs text-gray-500">{t('predictor.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {'Notification' in window && (
              <button
                onClick={toggleNotif}
                title={notifEnabled ? 'Disable ISS pass alerts' : 'Enable ISS pass alerts'}
                className="text-xs px-3 py-1.5 rounded-lg transition font-medium"
                style={notifEnabled
                  ? { background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }}
              >
                {notifEnabled ? '🔔 ON' : '🔕'}
              </button>
            )}
            {nextPass && (
              <button
                onClick={shareNextPass}
                className="text-xs px-3 py-1.5 rounded-lg transition font-medium"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}
              >
                {copied ? '✓' : t('common.share')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        {!loc ? (
          <div className="space-y-5">
            <p className="text-gray-400 text-sm text-center">{t('predictor.chooseLocation')}</p>
            <div className="flex justify-center">
              <button
                onClick={useGeo}
                className="px-6 py-3 rounded-xl font-semibold text-white flex items-center gap-2 transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                {t('predictor.useMyLocation')}
              </button>
            </div>
            {geoError && <p className="text-red-400 text-sm text-center">{geoError}</p>}
            <div className="flex flex-wrap gap-2 justify-center">
              {CITIES.map(c => (
                <button
                  key={c.name}
                  onClick={() => selectCity(c)}
                  className="px-3 py-1.5 rounded-xl text-sm transition"
                  style={selectedCity === c.name ? {
                    background: 'rgba(99,102,241,0.2)',
                    border: '1px solid rgba(99,102,241,0.45)',
                    color: '#c4b5fd',
                  } : {
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#6b7280',
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-bounce">🛸</div>
            <p className="text-gray-400">{t('predictor.calculating')} {loc.city}...</p>
            <p className="text-gray-600 text-xs mt-1">{t('predictor.usingTLE')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-400">{error}</p>
            <button onClick={() => load(loc)} className="mt-3 text-sm text-indigo-400 hover:underline">Try again</button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Next pass hero */}
            {nextPass && (
              <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,rgba(79,70,229,0.2),rgba(124,58,237,0.2))', border: '1px solid rgba(99,102,241,0.4)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wider mb-1">{t('predictor.nextPass')} {loc.city}</p>
                    <p className="text-3xl font-bold text-white">{formatTime(nextPass.start)}</p>
                    <p className="text-indigo-300 text-sm">{formatDate(nextPass.start)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-1">{t('predictor.in')}</p>
                    <p className="text-2xl font-bold font-mono text-yellow-300">{countdown}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-xs text-gray-500 mb-1">{t('predictor.maxElevation')}</p>
                    <p className={`text-xl font-bold ${elColor(nextPass.maxEl)}`}>{Math.round(nextPass.maxEl)}°</p>
                    <p className={`text-xs ${elColor(nextPass.maxEl)}`}>{elLabel(nextPass.maxEl)}</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-xs text-gray-500 mb-1">{t('predictor.duration')}</p>
                    <p className="text-xl font-bold text-white">{nextPass.duration}m</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-xs text-gray-500 mb-1">{t('predictor.direction')}</p>
                    <p className="text-lg font-bold text-indigo-300">{azToCompass(nextPass.startAz)}→{azToCompass(nextPass.endAz)}</p>
                  </div>
                </div>
                {nextPass.isVisible && (
                  <div className="mt-3 flex items-center gap-2 text-green-400 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                    {t('predictor.visibleEye')}
                  </div>
                )}
                <button onClick={shareNextPass} className="mt-4 w-full py-2.5 rounded-xl font-semibold text-white text-sm transition hover:opacity-90" style={{ background: 'linear-gradient(90deg,#4f46e5,#7c3aed)' }}>
                  {copied ? t('predictor.linkCopied') : t('predictor.sharePass')}
                </button>
              </div>
            )}

            {/* 7-day list */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                📍 {loc.city} — <span className="text-white font-medium">{passes.length} {t('predictor.passes')}</span> {t('predictor.next7days')}
              </p>
              <button onClick={() => { setLoc(null); setPasses([]); setSelectedCity('') }} className="text-xs text-gray-600 hover:text-gray-400 transition">
                {t('predictor.changeCity')}
              </button>
            </div>

            {Object.entries(grouped).map(([day, dayPasses]) => (
              <div key={day}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{day}</p>
                <div className="space-y-2">
                  {dayPasses.map((p, i) => (
                    <div
                      key={i}
                      className="rounded-xl px-3 py-3 flex items-start gap-3 transition"
                      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="min-w-[50px] text-center flex-shrink-0">
                        <p className="text-white font-bold font-mono text-sm">{formatTime(p.start)}</p>
                        <p className="text-[10px] text-gray-600">{t('predictor.start')}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className={`text-sm font-semibold ${elColor(p.maxEl)}`}>
                            ▲ {Math.round(p.maxEl)}° {elLabel(p.maxEl)}
                          </span>
                          <span className="text-xs text-gray-500">{p.duration} min</span>
                          <span className="text-xs text-gray-600">{azToCompass(p.startAz)}→{azToCompass(p.endAz)}</span>
                        </div>
                        <div className="mt-0.5">
                          {p.isVisible
                            ? <span className="text-[10px] text-green-400">{t('predictor.visibleNight')}</span>
                            : <span className="text-[10px] text-gray-600">{t('predictor.daylight')}</span>
                          }
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-gray-500 text-[10px] font-mono">{formatTime(p.end)}</p>
                        <p className="text-[10px] text-gray-700">end</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {passes.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p className="text-2xl mb-2">🌍</p>
                <p>{t('predictor.noPasses')}</p>
                <p className="text-sm mt-1">{t('predictor.tryDifferent')}</p>
              </div>
            )}

            <div className="text-xs text-gray-700 border-t border-white/[0.04] pt-4">
              {t('predictor.dataSource')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
