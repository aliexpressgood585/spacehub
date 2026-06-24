import { useState, useEffect } from 'react'

interface HourData {
  hour: number
  cloud: number
  humidity: number
  windSpeed: number
  seeing: number // 1-5 scale
  label: string
}

function seeingScore(cloud: number, humidity: number, wind: number): number {
  let score = 5
  if (cloud > 80) score -= 3
  else if (cloud > 50) score -= 2
  else if (cloud > 20) score -= 1
  if (humidity > 90) score -= 1.5
  else if (humidity > 75) score -= 0.5
  if (wind > 30) score -= 1.5
  else if (wind > 15) score -= 0.5
  return Math.max(1, Math.min(5, Math.round(score)))
}

const SEEING_LABELS = ['', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent']
const SEEING_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6']

export default function SeeingForecast() {
  const [hours, setHours] = useState<HourData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loc, setLoc] = useState({ lat: 32.0, lng: 34.78 })
  const [locName, setLocName] = useState('')
  const [tonight, setTonight] = useState<{ avg: number; label: string; color: string } | null>(null)

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&hourly=cloudcover,relativehumidity_2m,windspeed_10m&forecast_days=2&timezone=auto`
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const times: string[] = data.hourly?.time ?? []
        const clouds: number[] = data.hourly?.cloudcover ?? []
        const humidities: number[] = data.hourly?.relativehumidity_2m ?? []
        const winds: number[] = data.hourly?.windspeed_10m ?? []
        const now = new Date()
        const processed: HourData[] = []
        times.forEach((t, i) => {
          const dt = new Date(t)
          if (dt < now) return
          if (processed.length >= 24) return
          const hr = dt.getHours()
          const cloud = clouds[i] ?? 0
          const humidity = humidities[i] ?? 50
          const wind = winds[i] ?? 0
          const seeing = seeingScore(cloud, humidity, wind)
          processed.push({
            hour: hr,
            cloud,
            humidity,
            windSpeed: Math.round(wind),
            seeing,
            label: SEEING_LABELS[seeing],
          })
        })
        // Tonight: hours between 20-05
        const nightHours = processed.filter(h => h.hour >= 20 || h.hour <= 5)
        if (nightHours.length > 0) {
          const avgSeeing = nightHours.reduce((s, h) => s + h.seeing, 0) / nightHours.length
          const rounded = Math.round(avgSeeing)
          setTonight({ avg: rounded, label: SEEING_LABELS[rounded] ?? 'Unknown', color: SEEING_COLORS[rounded] ?? '#fff' })
        }
        setHours(processed)
        // reverse-geocode name from lat/lng
        setLocName(`${Math.abs(loc.lat).toFixed(1)}°${loc.lat >= 0 ? 'N' : 'S'}, ${Math.abs(loc.lng).toFixed(1)}°${loc.lng >= 0 ? 'E' : 'W'}`)
        setLoading(false)
      })
      .catch(() => {
        setError('Unable to load forecast data.')
        setLoading(false)
      })
  }, [loc.lat, loc.lng])

  const fmt = (h: number) => `${h === 0 ? '12' : h > 12 ? h - 12 : h}${h < 12 ? 'am' : 'pm'}`

  return (
    <div className="card-dark p-5 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🔭</span> Astronomical Seeing Forecast
          </h2>
          {locName && <p className="text-sm text-slate-400 mt-0.5">{locName}</p>}
        </div>
        {tonight && (
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">Tonight</div>
            <div className="text-lg font-bold" style={{ color: tonight.color }}>{tonight.label}</div>
            <div className="flex gap-1 justify-center mt-1">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="w-2 h-2 rounded-full" style={{ background: i <= tonight.avg ? tonight.color : '#374151' }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="animate-spin mr-2 text-xl">⟳</div> Loading weather data…
        </div>
      )}
      {error && <p className="text-red-400 text-center py-8">{error}</p>}

      {!loading && !error && hours.length > 0 && (
        <>
          {/* Bar chart for next 24h */}
          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-1 min-w-max" style={{ height: 80 }}>
              {hours.map((h, i) => {
                const isNight = h.hour >= 20 || h.hour <= 5
                return (
                  <div key={i} className="flex flex-col items-center" style={{ width: 28 }}>
                    <div
                      className="w-5 rounded-t transition-all"
                      style={{
                        height: `${(h.seeing / 5) * 60}px`,
                        background: isNight ? SEEING_COLORS[h.seeing] : '#334155',
                        opacity: isNight ? 1 : 0.45,
                      }}
                      title={`${fmt(h.hour)}: ${h.label} (Cloud ${h.cloud}%, Humidity ${h.humidity}%, Wind ${h.windSpeed}km/h)`}
                    />
                    <span className="text-[9px] text-slate-500 mt-1 rotate-45 origin-left" style={{ display: 'block', width: 20 }}>
                      {h.hour === 0 ? '12a' : h.hour === 12 ? '12p' : h.hour > 12 ? `${h.hour-12}p` : `${h.hour}a`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 text-xs text-slate-400">
            {[5,4,3,2,1].map(s => (
              <div key={s} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ background: SEEING_COLORS[s] }} />
                <span style={{ color: SEEING_COLORS[s] }}>{SEEING_LABELS[s]}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 ml-2">
              <div className="w-3 h-3 rounded-full bg-slate-600" />
              <span>Daytime</span>
            </div>
          </div>

          {/* Hourly table for night hours */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Night Hours Detail</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {hours.filter(h => h.hour >= 20 || h.hour <= 5).slice(0, 9).map((h, i) => (
                <div key={i} className="bg-slate-800/60 rounded-lg p-2.5 flex items-center gap-2">
                  <div className="w-1.5 h-8 rounded-full" style={{ background: SEEING_COLORS[h.seeing] }} />
                  <div>
                    <div className="text-white text-sm font-semibold">{fmt(h.hour)}</div>
                    <div className="text-xs" style={{ color: SEEING_COLORS[h.seeing] }}>{h.label}</div>
                    <div className="text-[10px] text-slate-500">{h.cloud}% cloud · {h.windSpeed}km/h</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Factors */}
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { icon: '☁️', label: 'Cloud Cover', value: `${hours[0]?.cloud ?? 0}%` },
              { icon: '💧', label: 'Humidity', value: `${hours[0]?.humidity ?? 0}%` },
              { icon: '💨', label: 'Wind', value: `${hours[0]?.windSpeed ?? 0} km/h` },
            ].map(({ icon, label, value }) => (
              <div key={label} className="bg-slate-800/60 rounded-xl p-3">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="text-white font-bold text-sm">{value}</div>
                <div className="text-slate-400 text-[11px]">{label}</div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-600 mt-3 text-center">
            Data: Open-Meteo • Seeing = combined cloud/humidity/wind score • Night hours highlighted
          </p>
        </>
      )}
    </div>
  )
}
