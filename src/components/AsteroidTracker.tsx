import { useState, useEffect } from 'react'

interface Asteroid {
  id: string
  name: string
  diameter_max: number
  approach_date: string
  miss_distance_km: number
  velocity_kph: number
  hazardous: boolean
}

export default function AsteroidTracker() {
  const [asteroids, setAsteroids] = useState<Asteroid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const end = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    fetch(`/api/neo?start_date=${today}&end_date=${end}`)
      .then(r => { if (!r.ok) throw new Error(''); return r.json() })
      .then(data => {
        const all: Asteroid[] = []
        Object.values(data.near_earth_objects as Record<string, {
          id: string; name: string;
          estimated_diameter: { meters: { estimated_diameter_max: number } };
          is_potentially_hazardous_asteroid: boolean;
          close_approach_data: { close_approach_date: string; miss_distance: { kilometers: string }; relative_velocity: { kilometers_per_hour: string } }[]
        }[]>).forEach(day => {
          day.forEach(a => {
            const ca = a.close_approach_data[0]
            if (!ca) return
            all.push({
              id: a.id,
              name: a.name.replace(/[()]/g, '').trim(),
              diameter_max: a.estimated_diameter.meters.estimated_diameter_max,
              approach_date: ca.close_approach_date,
              miss_distance_km: parseFloat(ca.miss_distance.kilometers),
              velocity_kph: parseFloat(ca.relative_velocity.kilometers_per_hour),
              hazardous: a.is_potentially_hazardous_asteroid,
            })
          })
        })
        all.sort((a, b) => a.miss_distance_km - b.miss_distance_km)
        setAsteroids(all.slice(0, 10))
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">☄️</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Near-Earth Asteroids</h3>
          <p className="text-gray-500 text-xs">Next 7 days · NASA NeoWs</p>
        </div>
        <div className="live-badge"><span className="live-dot" /> NASA</div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">☄️</div>
          <p className="text-gray-500 text-sm">Could not load asteroid data</p>
          <p className="text-gray-700 text-xs mt-1">NASA NEO API temporarily unavailable</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="space-y-2">
            {asteroids.map(a => {
              const lunarDist = a.miss_distance_km / 384400
              const hazard = a.hazardous
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{
                    background: hazard ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                    border: hazard ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-xl flex-shrink-0">{hazard ? '⚠️' : '☄️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-semibold truncate">{a.name}</p>
                    <p className="text-[10px] text-gray-600">
                      {a.approach_date} · {lunarDist.toFixed(1)} lunar dist. · {Math.round(a.velocity_kph / 3.6)} km/s
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold font-mono" style={{ color: hazard ? '#f87171' : '#818cf8' }}>
                      {(a.miss_distance_km / 1e6).toFixed(2)}M km
                    </p>
                    <p className="text-[10px] text-gray-700">{Math.round(a.diameter_max)}m wide</p>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-700 text-center mt-3">
            ⚠️ Potentially Hazardous Asteroid (PHA) · sorted by closest approach
          </p>
        </>
      )}
    </div>
  )
}
