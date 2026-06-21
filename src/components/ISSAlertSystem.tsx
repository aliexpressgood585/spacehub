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

const ISRAEL_CITIES = [
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
  const [userLoc, setUserLoc] = useState<UserLocation | null>(null)
  const [iss, setIss] = useState<ISSData | null>(null)
  const [pass, setPass] = useState<PassInfo | null>(null)
  const [notifGranted, setNotifGranted] = useState(false)
  const [locError, setLocError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCity, setSelectedCity] = useState('')
  const [notified, setNotified] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const requestNotifications = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    const granted = perm === 'granted'
    setNotifGranted(granted)
    if (granted) registerPeriodicSync()
  }

  const sendLocationToSW = (loc: UserLocation) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SET_LOCATION', location: loc })
    }
  }

  const registerPeriodicSync = async () => {
    if (!('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.ready
      // @ts-ignore — periodicSync is not yet in TS types
      if ('periodicSync' in reg) {
        // @ts-ignore
        await reg.periodicSync.register('iss-check', { minInterval: 15 * 60 * 1000 })
      }
    } catch (_) {}
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

  const useGeolocation = () => {
    setLoading(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, city: 'Your Location' }
        setUserLoc(loc)
        startTracking(loc)
        sendLocationToSW(loc)
        setLoading(false)
      },
      () => {
        setLocError('Could not get your location — please choose a city below')
        setLoading(false)
      }
    )
  }

  const useCity = (city: (typeof ISRAEL_CITIES)[0]) => {
    const loc = { lat: city.lat, lng: city.lng, city: city.name }
    setSelectedCity(city.name)
    setUserLoc(loc)
    startTracking(loc)
    sendLocationToSW(loc)
  }

  const elevColor = !pass ? '' : pass.visible ? 'text-green-400' : pass.elevAngle > -10 ? 'text-yellow-400' : 'text-gray-400'

  return (
    <div className="neon-border glass rounded-lg overflow-hidden">
      <div className="p-6 border-b border-space-700 flex flex-wrap items-center gap-3">
        <span className="text-2xl">🛸</span>
        <h3 className="text-xl font-bold text-white">ISS Overhead Alert — Real-Time</h3>
        {!notifGranted && (
          <button
            onClick={requestNotifications}
            className="ml-auto animate-glow-pulse text-xs px-4 py-2 rounded-lg text-white font-semibold transition flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 0 16px rgba(99,102,241,0.5)' }}
          >
            🔔 Get ISS Alerts
          </button>
        )}
        {notifGranted && <span className="ml-auto text-xs text-green-400 flex items-center gap-1">✅ Alerts Active — even when browser is closed</span>}
      </div>

      <div className="p-6">
        {!userLoc ? (
          <div className="space-y-4">
            <p className="text-gray-300 text-center mb-6">Choose your location to track when the ISS passes over you</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={useGeolocation}
                disabled={loading}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <span className="animate-spin">⚙️</span> : '📍'}
                {loading ? 'Locating...' : 'Use My Location'}
              </button>
            </div>
            {locError && <p className="text-red-400 text-sm text-center">{locError}</p>}
            <div className="mt-4">
              <p className="text-gray-500 text-sm text-center mb-3">Or choose a city:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {ISRAEL_CITIES.map(city => (
                  <button
                    key={city.name}
                    onClick={() => useCity(city)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition border ${selectedCity === city.name ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-space-700 text-gray-400 hover:border-indigo-500 hover:text-white glass'}`}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">📍 Location: <span className="text-white">{userLoc.city}</span></span>
              <button onClick={() => { setUserLoc(null); setPass(null); setIss(null); if (intervalRef.current) clearInterval(intervalRef.current) }} className="text-xs text-gray-600 hover:text-gray-400 transition">Change Location</button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className={`glass rounded-xl p-4 text-center border ${pass?.visible ? 'border-green-500/50 bg-green-900/10' : 'border-space-700'}`}>
                <p className="text-xs text-gray-500 mb-1">ISS Status</p>
                <p className={`text-lg font-bold ${pass?.visible ? 'text-green-400' : 'text-gray-400'}`}>
                  {pass?.visible ? '👁️ Visible!' : '🌍 Below Horizon'}
                </p>
              </div>
              <div className="glass rounded-xl p-4 text-center border border-space-700">
                <p className="text-xs text-gray-500 mb-1">Elevation</p>
                <p className={`text-2xl font-bold font-mono ${elevColor}`}>
                  {pass ? `${pass.elevAngle.toFixed(1)}°` : '---'}
                </p>
              </div>
              <div className="glass rounded-xl p-4 text-center border border-space-700">
                <p className="text-xs text-gray-500 mb-1">Distance</p>
                <p className="text-xl font-bold font-mono text-indigo-300">
                  {pass ? `${pass.distance.toLocaleString()} km` : '---'}
                </p>
              </div>
              <div className={`glass rounded-xl p-4 text-center border ${pass?.visible ? 'border-green-500/50' : 'border-yellow-500/30'}`}>
                <p className="text-xs text-gray-500 mb-1">{pass?.visible ? 'Now!' : 'Next Pass (est.)'}</p>
                <p className={`text-lg font-bold ${pass?.visible ? 'text-green-400 animate-pulse' : 'text-yellow-400'}`}>
                  {pass?.countdown ?? '...'}
                </p>
              </div>
            </div>

            {iss && (
              <div className="glass rounded-lg p-4 border border-space-700 mt-2">
                <p className="text-xs text-gray-500 mb-2">ISS Current Position</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-gray-300">Lat: <span className="text-white font-mono">{iss.latitude.toFixed(3)}°</span></span>
                  <span className="text-gray-300">Lon: <span className="text-white font-mono">{iss.longitude.toFixed(3)}°</span></span>
                  <span className="text-gray-300">Alt: <span className="text-white font-mono">{iss.altitude.toFixed(1)} km</span></span>
                  <span className="text-gray-300">Speed: <span className="text-white font-mono">{(iss.velocity / 3.6).toFixed(1)} km/s</span></span>
                </div>
              </div>
            )}

            <div className="bg-space-900/60 rounded-lg p-4 border border-space-700/50 text-xs text-gray-500">
              💡 <strong className="text-gray-400">Tip:</strong> The ISS is visible to the naked eye at night when elevation is above 10°. It travels at 28,000 km/h and orbits Earth every 92 minutes.
              <br />Updates every 10 seconds.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
