import EarthGlobe3D from './EarthGlobe3D'

const SATELLITES = [
  { name: 'ISS (ZARYA)',  id: '25544', latitude: 34.5,  longitude: 35.2,  altitude: 408.5, velocity: 7.66, icon: '🛸', color: '#818cf8' },
  { name: 'Hubble',       id: '20580', latitude: 12.3,  longitude: 45.6,  altitude: 593.2, velocity: 7.55, icon: '🔭', color: '#60a5fa' },
  { name: 'NOAA 18',      id: '28654', latitude: -22.1, longitude: 98.7,  altitude: 822.0, velocity: 7.41, icon: '🛰️', color: '#4ade80' },
]

export default function SatelliteTracker() {
  return (
    <div className="space-y-5">

      {/* 3D Globe */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-box">🌍</div>
          <div>
            <h3 className="text-white font-bold text-base">3D Earth — Real-Time Satellites</h3>
            <p className="text-gray-500 text-xs">Interactive globe with live orbital tracks</p>
          </div>
        </div>
        <EarthGlobe3D />
      </div>

      {/* Satellite list */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-box">🛰️</div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-base">Satellite Tracker — Live</h3>
            <p className="text-gray-500 text-xs">Real-time orbital data</p>
          </div>
          <div className="live-badge">
            <span className="live-dot" /> LIVE
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {SATELLITES.map(sat => (
            <div
              key={sat.id}
              className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: `${sat.color}15`, border: `1px solid ${sat.color}30` }}
                >
                  {sat.icon}
                </div>
                <div>
                  <h4 className="font-bold text-sm" style={{ color: sat.color }}>{sat.name}</h4>
                  <p className="text-gray-600 text-xs">NORAD #{sat.id}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Latitude',  val: `${sat.latitude.toFixed(2)}°` },
                  { label: 'Longitude', val: `${sat.longitude.toFixed(2)}°` },
                  { label: 'Altitude',  val: `${sat.altitude.toFixed(1)} km` },
                  { label: 'Speed',     val: `${sat.velocity.toFixed(2)} km/s` },
                ].map(item => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="text-white font-mono font-semibold">{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
