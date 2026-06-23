import { useState, useEffect } from 'react'

interface MarsSol {
  sol: string
  min_temp: number
  max_temp: number
  avg_temp: number
  pressure: number
  wind_speed: number | null
}

const CURIOSITY_FALLBACK: MarsSol[] = [
  { sol: '4108', min_temp: -73, max_temp: -7,  avg_temp: -40, pressure: 845, wind_speed: 4.2 },
  { sol: '4107', min_temp: -74, max_temp: -5,  avg_temp: -39, pressure: 839, wind_speed: null },
  { sol: '4106', min_temp: -72, max_temp: -8,  avg_temp: -40, pressure: 851, wind_speed: 3.8 },
  { sol: '4105', min_temp: -75, max_temp: -6,  avg_temp: -41, pressure: 843, wind_speed: 5.1 },
  { sol: '4104', min_temp: -71, max_temp: -4,  avg_temp: -38, pressure: 857, wind_speed: 3.3 },
]

export default function MarsWeather() {
  const [sols] = useState<MarsSol[]>(CURIOSITY_FALLBACK)
  const [live, setLive] = useState(false)
  const [current, setCurrent] = useState(0)

  // InSight mission ended Dec 2022 — use Curiosity REMS fallback data
  useEffect(() => { setLive(false) }, [])

  const sol = sols[current]

  const tempPct = (t: number) => Math.max(0, Math.min(100, ((t + 130) / 150) * 100))

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🔴</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Mars Weather</h3>
          <p className="text-gray-500 text-xs">
            {live ? 'NASA InSight · Elysium Planitia' : 'Curiosity REMS · Gale Crater (reference data)'}
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ background: live ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', border: live ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)', color: live ? '#f87171' : '#6b7280' }}>
          {live ? '🔴 LIVE' : 'REF'}
        </span>
      </div>

      {/* Sol selector */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {sols.map((s, i) => (
          <button
            key={s.sol}
            onClick={() => setCurrent(i)}
            className="flex-shrink-0 text-[10px] px-3 py-1 rounded-lg font-semibold transition-all"
            style={i === current
              ? { background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171' }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
          >
            Sol {s.sol}
          </button>
        ))}
      </div>

      {/* Main temp display */}
      <div className="flex items-center justify-around mb-5 py-4 rounded-2xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <div className="text-center">
          <p className="text-blue-400 text-xs font-semibold mb-1">Low</p>
          <p className="text-blue-300 font-black text-2xl">{sol.min_temp}°C</p>
          <p className="text-gray-700 text-[10px]">{Math.round(sol.min_temp * 9/5 + 32)}°F</p>
        </div>
        <div className="text-center">
          <div className="text-4xl mb-1">🌡️</div>
          <p className="text-white font-bold text-sm">{sol.avg_temp}°C avg</p>
        </div>
        <div className="text-center">
          <p className="text-red-400 text-xs font-semibold mb-1">High</p>
          <p className="text-red-300 font-black text-2xl">{sol.max_temp}°C</p>
          <p className="text-gray-700 text-[10px]">{Math.round(sol.max_temp * 9/5 + 32)}°F</p>
        </div>
      </div>

      {/* Temp bar */}
      <div className="mb-5">
        <div className="relative h-2 rounded-full mb-1" style={{ background: 'linear-gradient(90deg, #3b82f6, #ef4444)' }}>
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow" style={{ left: `${tempPct(sol.min_temp)}%`, border: '2px solid #3b82f6' }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow" style={{ left: `${tempPct(sol.max_temp)}%`, border: '2px solid #ef4444' }} />
        </div>
        <div className="flex justify-between text-[9px] text-gray-700">
          <span>-130°C</span><span>+20°C</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-gray-600 text-[10px] mb-1">Atmospheric Pressure</p>
          <p className="text-white font-bold text-sm">{sol.pressure} Pa</p>
          <p className="text-gray-700 text-[9px]">0.6% of Earth</p>
        </div>
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-gray-600 text-[10px] mb-1">Wind Speed</p>
          <p className="text-white font-bold text-sm">{sol.wind_speed != null ? `${sol.wind_speed.toFixed(1)} m/s` : 'N/A'}</p>
          <p className="text-gray-700 text-[9px]">Elysium Planitia</p>
        </div>
      </div>

      {!live && (
        <p className="text-[10px] text-gray-700 mt-3 text-center">Reference data from Curiosity rover (REMS instrument)</p>
      )}
    </div>
  )
}
