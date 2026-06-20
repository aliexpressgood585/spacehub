import { useState, useEffect } from 'react'

interface Satellite {
  name: string
  id: string
  latitude: number
  longitude: number
  altitude: number
  velocity: number
}

export default function SatelliteTracker() {
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const mockSatellites: Satellite[] = [
      {
        name: 'ISS (ZARYA)',
        id: '25544',
        latitude: 34.5,
        longitude: 35.2,
        altitude: 408.5,
        velocity: 7.66,
      },
      {
        name: 'HUBBLE',
        id: '20580',
        latitude: 12.3,
        longitude: 45.6,
        altitude: 593.2,
        velocity: 7.55,
      },
      {
        name: 'NOAA 18',
        id: '28654',
        latitude: -22.1,
        longitude: 98.7,
        altitude: 822.0,
        velocity: 7.41,
      },
    ]
    setSatellites(mockSatellites)
    setLoading(false)
  }, [])

  return (
    <div className="space-y-6">
      <div className="neon-border glass rounded-lg p-8">
        <h3 className="text-2xl font-bold text-white mb-6">🛰️ מעקב לוויינים בזמן אמת</h3>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin">⚙️</div>
            <p className="text-gray-400">טוען נתונים...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {satellites.map((sat) => (
              <div key={sat.id} className="glass rounded-lg p-4 border border-space-700">
                <h4 className="font-bold text-indigo-400 mb-3">{sat.name}</h4>
                <div className="space-y-2 text-sm text-gray-300">
                  <p>📍 רוחב: {sat.latitude.toFixed(2)}°</p>
                  <p>📍 אורך: {sat.longitude.toFixed(2)}°</p>
                  <p>📏 גובה: {sat.altitude.toFixed(1)} ק"מ</p>
                  <p>⚡ מהירות: {sat.velocity.toFixed(2)} ק"מ/שנ</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
