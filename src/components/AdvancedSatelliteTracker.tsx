import { useState, useEffect } from 'react'
import Globe3D from './Globe3D'

interface SatelliteData {
  norad_id: string
  name: string
  latitude: number
  longitude: number
  altitude: number
  velocity: number
  footprint: number
  next_rise: string
  next_set: string
  visibility: 'visible' | 'daylight' | 'eclipsed'
}

export default function AdvancedSatelliteTracker() {
  const [satellites, setSatellites] = useState<SatelliteData[]>([])
  const [selectedSat, setSelectedSat] = useState<SatelliteData | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    const mockSatellites: SatelliteData[] = [
      {
        norad_id: '25544',
        name: 'ISS (ZARYA)',
        latitude: 34.52,
        longitude: 35.23,
        altitude: 408.5,
        velocity: 7.66,
        footprint: 2500,
        next_rise: '22:15 UTC',
        next_set: '22:27 UTC',
        visibility: 'visible',
      },
      {
        norad_id: '20580',
        name: 'HUBBLE SPACE TELESCOPE',
        latitude: 12.31,
        longitude: 45.67,
        altitude: 593.2,
        velocity: 7.55,
        footprint: 3200,
        next_rise: '23:45 UTC',
        next_set: '23:58 UTC',
        visibility: 'daylight',
      },
      {
        norad_id: '28654',
        name: 'NOAA 18',
        latitude: -22.15,
        longitude: 98.72,
        altitude: 822.0,
        velocity: 7.41,
        footprint: 3500,
        next_rise: '01:30 UTC',
        next_set: '01:45 UTC',
        visibility: 'eclipsed',
      },
    ]
    setSatellites(mockSatellites)
    setSelectedSat(mockSatellites[0])
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      setSatellites((prev) =>
        prev.map((sat) => ({
          ...sat,
          latitude: sat.latitude + (Math.random() - 0.5) * 2,
          longitude: sat.longitude + (Math.random() - 0.5) * 2,
          altitude: sat.altitude + (Math.random() - 0.5) * 10,
        }))
      )
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const getVisibilityColor = (visibility: string) => {
    switch (visibility) {
      case 'visible':
        return 'text-green-400'
      case 'daylight':
        return 'text-yellow-400'
      case 'eclipsed':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case 'visible':
        return '🟢 נראה'
      case 'daylight':
        return '🟡 אור יום'
      case 'eclipsed':
        return '🔴 בצל'
      default:
        return '⚪ לא ידוע'
    }
  }

  return (
    <div className="space-y-6">
      {/* 3D Globe */}
      <div className="neon-border glass rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4">🌍 מפה 3D אינטראקטיבית</h3>
        <Globe3D />
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            autoRefresh
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-space-700 text-gray-300 hover:bg-space-600'
          }`}
        >
          {autoRefresh ? '⏸ עצור עדכון' : '▶️ התחל עדכון'}
        </button>
      </div>

      {/* Satellites List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {satellites.map((sat) => (
          <div
            key={sat.norad_id}
            onClick={() => setSelectedSat(sat)}
            className={`neon-border glass rounded-lg p-4 cursor-pointer transition ${
              selectedSat?.norad_id === sat.norad_id
                ? 'border-indigo-400 bg-indigo-500 bg-opacity-10'
                : 'hover:border-indigo-300'
            }`}
          >
            <h4 className="font-bold text-indigo-400 mb-3">{sat.name}</h4>
            <div className="space-y-2 text-sm text-gray-300">
              <p className="flex justify-between">
                <span>סטטוס:</span>
                <span className={getVisibilityColor(sat.visibility)}>
                  {getVisibilityLabel(sat.visibility)}
                </span>
              </p>
              <p className="flex justify-between">
                <span>קו רוחב:</span>
                <span>{sat.latitude.toFixed(2)}°</span>
              </p>
              <p className="flex justify-between">
                <span>קו אורך:</span>
                <span>{sat.longitude.toFixed(2)}°</span>
              </p>
              <p className="flex justify-between">
                <span>גובה:</span>
                <span>{sat.altitude.toFixed(0)} ק״מ</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Info */}
      {selectedSat && (
        <div className="neon-border glass rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">📡 {selectedSat.name}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-indigo-300">מיקום נוכחי</h4>
              <div className="space-y-2 text-gray-300">
                <p>
                  <span className="text-gray-400">קו רוחב:</span>{' '}
                  <span className="text-white">{selectedSat.latitude.toFixed(4)}°</span>
                </p>
                <p>
                  <span className="text-gray-400">קו אורך:</span>{' '}
                  <span className="text-white">{selectedSat.longitude.toFixed(4)}°</span>
                </p>
                <p>
                  <span className="text-gray-400">גובה:</span>{' '}
                  <span className="text-white">{selectedSat.altitude.toFixed(1)} ק״מ</span>
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-indigo-300">נתונים מסלולים</h4>
              <div className="space-y-2 text-gray-300">
                <p>
                  <span className="text-gray-400">מהירות:</span>{' '}
                  <span className="text-white">{selectedSat.velocity.toFixed(2)} ק״מ/שנ</span>
                </p>
                <p>
                  <span className="text-gray-400">טביעת רגל:</span>{' '}
                  <span className="text-white">{selectedSat.footprint} ק״מ</span>
                </p>
                <p>
                  <span className="text-gray-400">עלייה הבאה:</span>{' '}
                  <span className="text-white">{selectedSat.next_rise}</span>
                </p>
                <p>
                  <span className="text-gray-400">שקיעה הבאה:</span>{' '}
                  <span className="text-white">{selectedSat.next_set}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
