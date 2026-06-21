import { useState, useEffect, useRef, useCallback } from 'react'

interface UserLocation { lat: number; lng: number; city: string }
interface ISSData { latitude: number; longitude: number; altitude: number; velocity: number }
interface PassInfo { elevAngle: number; distance: number; visible: boolean; countdown: string }

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calcElevation(groundDist: number, issAlt: number): number {
  const R = 6371
  const rho = groundDist / R
  const elev = Math.atan2(Math.cos(rho) - R / (R + issAlt), Math.sin(rho)) * 180 / Math.PI
  return elev
}

const CITIES = [
  { name: 'New York',    lat: 40.7128, lng: -74.0060 },
  { name: 'London',      lat: 51.5074, lng: -0.1278 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Paris',       lat: 48.8566, lng: 2.3522 },
  { name: 'Tokyo',       lat: 35.6762, lng: 139.6503 },
  { name: 'Sydney',      lat: -33.8688, lng: 151.2093 },
  { name: 'Toronto',     lat: 43.6532, lng: -79.3832 },
  { name: 'Berlin',      lat: 52.5200, lng: 13.4050 },
  { name: 'Dubai',       lat: 25.2048, lng: 55.2708 },
  { name: 'São Paulo',   lat: -23.5505, lng: -46.6333 },
  { name: 'Tel Aviv',    lat: 32.0853, lng: 34.7818 },
  { name: 'Jerusalem',   lat: 31.7683, lng: 35.2137 },
]

export default function ISSAlertSystem() {
  const DEFAULT = { lat: 32.0853, lng: 34.7818, city: 'Tel Aviv' }
  const [userLoc, setUserLoc] = useState<UserLocation | null>(DEFAULT)
  const [iss, setIss] = useState<ISSData | null>(null)
  const [pass, setPass] = useState<PassInfo | null>(null)
  const [notifGranted, setNotifGranted] = useState(false)
  const [locError, setLocError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCity, setSelectedCity] = useState('Tel Aviv')
  const [notified, setNotified] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const requestNotifications = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifGranted(perm === 'granted')
  }

  const sendNotification = useCallback((elevAngle: number) => {
    if (!notifGranted || notified) return
    setNotified(true)
    new Notification('🚀 ISS is passing over you!', {
      body: `The International Space Station is ${Math.round(elevAngle)}° above the horizon. Go outside and look up!`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚀</text></svg>',
    })
    setTimeout(() => setNotified(false), 6 * 60 * 1000)
  }, [notifGranted, notified])

  const startTracking = useCallback((loc: UserLocation) => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    const fetchAndCalc = () => {
      fetch('https://api.wheretheiss.at/v1/satellites/25544')
        .then(r => r.json())
        .then((data: ISSData) => {
          setIss(data)
          const groundDist = haversineKm(loc.lat, loc.lng, data.latitude, data.longitude)
          const elev = calcElevation(groundDist, data.altitude)
          const visible = elev > 10

          if (visible) sendNotification(elev)

          const nextPassMinutes = visible ? 0 : Math.max(1, Math.round((groundDist - 2000) / (data.velocity / 60)))
          const mins = Math.floor(nextPassMinutes)
          const secs = Math.floor((nextPassMinutes - mins) * 60)
          const countdown = visible ? 'Passing now!' : nextPassMinutes < 90 ? `~${mins}:${secs.toString().padStart(2, '0')} min` : `~${Math.round(nextPassMinutes / 60 * 10) / 10} hrs`

          setPass({ elevAngle: elev, distance: Math.round(groundDist), visible, countdown })
        })
        .catch(() => {})
    }

    fetchAndCalc()
    intervalRef.current = setInterval(fetchAndCalc, 10000)
  }, [sendNotification])

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  // Auto-start tracking for default city on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { startTracking(DEFAULT) }, [])

  const useGeolocation = () => {
    setLoading(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, city: 'Your Location' }
        setUserLoc(loc)
        startTracking(loc)
        setLoading(false)
      },
      () => {
        setLocError('Could not get your location — please choose a city below')
        setLoading(false)
      }
    )
  }

  const useCity = (city: typeof CITIES[0]) => {
    const loc = { lat: city.lat, lng: city.lng, city: city.name }
    setSelectedCity(city.name)
    setUserLoc(loc)
    startTracking(loc)
  }

  return (
    <div className="space-card overflow-hidden">
      {/* Header */}
      <div className="p-5 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="icon-box">🛸</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-base">ISS Overhead Alert</h3>
          <p className="text-gray-500 text-xs">Real-time pass tracking from your location</p>
        </div>
        {!notifGranted ? (
          <button
            onClick={requestNotifications}
            className="text-xs px-3 py-1.5 rounded-xl font-semibold transition"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}
          >
            🔔 Enable Alerts
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
            Alerts Active
          </span>
        )}
      </div>

      <div className="p-5">
        {!userLoc ? (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm text-center">Choose your location to track when the ISS passes over you</p>

            <div className="flex justify-center">
              <button
                onClick={useGeolocation}
                disabled={loading}
                className="btn-shimmer px-6 py-3 flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <span className="animate-spin">⚙️</span> : '📍'}
                {loading ? 'Locating...' : 'Use My Location'}
              </button>
            </div>

            {locError && <p className="text-red-400 text-sm text-center">{locError}</p>}

            <div>
              <p className="text-gray-600 text-xs text-center mb-3">Or choose a city:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {CITIES.map(city => (
                  <button
                    key={city.name}
                    onClick={() => useCity(city)}
                    className="px-3 py-1.5 rounded-xl text-sm transition"
                    style={selectedCity === city.name ? {
                      background: 'rgba(99,102,241,0.2)',
                      border: '1px solid rgba(99,102,241,0.45)',
                      color: '#c4b5fd',
                    } : {
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#6b7280',
                    }}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Location row */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                📍 <span className="text-white font-semibold">{userLoc.city}</span>
              </span>
              <button
                onClick={() => { setUserLoc(null); setPass(null); setIss(null); if (intervalRef.current) clearInterval(intervalRef.current) }}
                className="text-xs text-gray-600 hover:text-gray-400 transition"
              >
                Change ↺
              </button>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div
                className="rounded-2xl p-4 text-center"
                style={pass?.visible
                  ? { background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
                }
              >
                <p className="text-xs text-gray-500 mb-1.5">ISS Status</p>
                <p className={`text-base font-bold ${pass?.visible ? 'text-green-400' : 'text-gray-400'}`}>
                  {pass?.visible ? '👁️ Visible!' : '🌍 Below Horizon'}
                </p>
              </div>

              <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs text-gray-500 mb-1.5">Elevation</p>
                <p className={`text-2xl font-black font-mono ${!pass ? 'text-gray-600' : pass.visible ? 'text-green-400' : pass.elevAngle > -10 ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {pass ? `${pass.elevAngle.toFixed(1)}°` : '—'}
                </p>
              </div>

              <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs text-gray-500 mb-1.5">Distance</p>
                <p className="text-xl font-black font-mono text-indigo-300">
                  {pass ? `${pass.distance.toLocaleString()} km` : '—'}
                </p>
              </div>

              <div
                className="rounded-2xl p-4 text-center"
                style={pass?.visible
                  ? { background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }
                  : { background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }
                }
              >
                <p className="text-xs text-gray-500 mb-1.5">{pass?.visible ? 'Overhead Now!' : 'Next Pass (est.)'}</p>
                <p className={`text-base font-bold ${pass?.visible ? 'text-green-400 animate-pulse' : 'text-yellow-400'}`}>
                  {pass?.countdown ?? '...'}
                </p>
              </div>
            </div>

            {/* ISS position detail */}
            {iss && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs text-gray-600 mb-2 uppercase tracking-wider font-semibold">ISS Current Position</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-gray-500">Lat: <span className="text-white font-mono">{iss.latitude.toFixed(3)}°</span></span>
                  <span className="text-gray-500">Lon: <span className="text-white font-mono">{iss.longitude.toFixed(3)}°</span></span>
                  <span className="text-gray-500">Alt: <span className="text-white font-mono">{iss.altitude.toFixed(1)} km</span></span>
                  <span className="text-gray-500">Speed: <span className="text-white font-mono">{(iss.velocity / 3.6).toFixed(1)} km/s</span></span>
                </div>
              </div>
            )}

            <div
              className="rounded-2xl p-4 text-xs text-gray-600 leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              💡 The ISS is visible to the naked eye when elevation is above 10°. It orbits Earth every 92 minutes at 28,000 km/h.
              Updates every 10 seconds.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
