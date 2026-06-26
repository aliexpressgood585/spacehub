import { useState, useMemo } from 'react'

interface Destination {
  id: string
  name: string
  icon: string
  distanceKm: number
  context: string
}

const DESTINATIONS: Destination[] = [
  { id: 'moon', name: 'The Moon', icon: '🌕', distanceKm: 384400, context: 'Average distance' },
  { id: 'mars', name: 'Mars', icon: '🔴', distanceKm: 225000000, context: 'Average distance' },
  { id: 'jupiter', name: 'Jupiter', icon: '🪐', distanceKm: 778500000, context: 'Average distance' },
  { id: 'pluto', name: 'Pluto', icon: '🥏', distanceKm: 5900000000, context: 'Average distance' },
  { id: 'proxima', name: 'Proxima Centauri', icon: '⭐', distanceKm: 40208000000000, context: 'Nearest star system' },
  { id: 'sirius', name: 'Sirius', icon: '✨', distanceKm: 81370000000000, context: 'Brightest star' },
  { id: 'center', name: 'Galactic Center', icon: '🌀', distanceKm: 2.47e17, context: '26,000 light-years' },
  { id: 'andromeda', name: 'Andromeda Galaxy', icon: '🌌', distanceKm: 2.365e19, context: 'Nearest major galaxy' },
]

interface Speed {
  id: string
  label: string
  description: string
  icon: string
  color: string
  fractionC: number
  timeDilationFactor: number
  note: string
}

const SPEEDS: Speed[] = [
  {
    id: 'apollo', label: 'Apollo Speed', description: 'Fastest humans have traveled', icon: '🚀', color: '#94a3b8',
    fractionC: 0.0000123, timeDilationFactor: 1.0,
    note: 'Apollo 10 reached 39,897 km/h — the fastest humans have ever traveled. At this speed, reaching Proxima Centauri would take 115,000 years.'
  },
  {
    id: 'voyager', label: 'Voyager Speed', description: 'Fastest spacecraft', icon: '🛸', color: '#22c55e',
    fractionC: 0.0000539, timeDilationFactor: 1.0,
    note: 'Voyager 1 travels at ~61,000 km/h. It\'s been flying for 47 years and is only 0.002 light-years from Earth.'
  },
  {
    id: 'parker', label: 'Parker Solar Probe', description: 'Fastest spacecraft ever built', icon: '☀️', color: '#fbbf24',
    fractionC: 0.00064, timeDilationFactor: 1.000002,
    note: 'The Parker Solar Probe reached 692,000 km/h in 2023 — the fastest human-made object ever. Still 1/1570th the speed of light.'
  },
  {
    id: 'percent1', label: '1% Light Speed', description: 'Near-future ion drives', icon: '⚡', color: '#f97316',
    fractionC: 0.01, timeDilationFactor: 1.00005,
    note: 'With a breakthrough fusion drive, 1% c might be achievable. Proxima Centauri in 424 years — perhaps a generation ship could do it.'
  },
  {
    id: 'percent10', label: '10% Light Speed', description: 'Breakthrough Starshot goal', icon: '💡', color: '#a855f7',
    fractionC: 0.10, timeDilationFactor: 1.005,
    note: 'Breakthrough Starshot aims to send a laser-propelled nanocraft to Alpha Centauri at 20% c. At 10%, Proxima Centauri in 42 years.'
  },
  {
    id: 'percent50', label: '50% Light Speed', description: 'Science fiction near-term', icon: '🌟', color: '#3b82f6',
    fractionC: 0.50, timeDilationFactor: 1.155,
    note: 'At 50% c, relativistic effects kick in — time passes 13% slower for the traveler. Proxima Centauri in 8.5 years for you, 9.8 years for Earth.'
  },
  {
    id: 'percent90', label: '90% Light Speed', description: 'Time dilation becomes significant', icon: '⚡', color: '#ef4444',
    fractionC: 0.90, timeDilationFactor: 2.294,
    note: 'At 90% c, time passes 2.3× slower for the traveler. A trip to Andromeda (2.5M ly) would take ~1.1M years on Earth but only 480,000 years for you.'
  },
  {
    id: 'percent99', label: '99% Light Speed', description: 'Extreme time dilation', icon: '🔥', color: '#ec4899',
    fractionC: 0.99, timeDilationFactor: 7.089,
    note: 'At 99% c, time passes 7× slower for you. You could reach Andromeda in 353,000 years of your time — though 2.5M years would pass on Earth.'
  },
  {
    id: 'warp', label: 'Warp Drive (theoretical)', description: 'Alcubierre warp — faster than light', icon: '🌌', color: '#06b6d4',
    fractionC: 1000, timeDilationFactor: 1.0,
    note: 'The Alcubierre warp drive is a valid solution to Einstein\'s equations. It contracts space ahead and expands it behind. Energy required: equivalent to mass of Jupiter in exotic matter. Currently impossible.'
  },
]

function formatTravelTime(distanceKm: number, fractionC: number, dilationFactor: number) {
  const c = 299792.458
  const speedKmPerSec = c * fractionC
  const secondsShip = (distanceKm / speedKmPerSec) / dilationFactor
  const secondsEarth = distanceKm / speedKmPerSec

  const fmt = (s: number) => {
    if (s < 60) return `${s.toFixed(1)} seconds`
    if (s < 3600) return `${(s / 60).toFixed(1)} minutes`
    if (s < 86400) return `${(s / 3600).toFixed(1)} hours`
    if (s < 31557600) return `${(s / 86400).toFixed(1)} days`
    if (s < 31557600 * 1000) return `${(s / 31557600).toFixed(1)} years`
    if (s < 31557600 * 1e6) return `${(s / 31557600 / 1000).toFixed(1)}K years`
    return `${(s / 31557600 / 1e9).toFixed(2)}B years`
  }

  return { ship: fmt(secondsShip), earth: fmt(secondsEarth), dilated: dilationFactor > 1.01 }
}

export default function WarpDriveCalculator() {
  const [destId, setDestId] = useState('proxima')
  const [speedId, setSpeedId] = useState('percent10')

  const dest = DESTINATIONS.find(d => d.id === destId)!
  const speed = SPEEDS.find(s => s.id === speedId)!

  const travelTime = useMemo(() =>
    formatTravelTime(dest.distanceKm, speed.fractionC, speed.timeDilationFactor),
    [dest, speed]
  )

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Warp Drive Calculator</h2>
      <p className="text-gray-400 text-sm mb-5">How long to reach the stars at different speeds? From rockets to warp drive.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Destination picker */}
        <div>
          <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Pick Destination</div>
          <div className="space-y-1.5">
            {DESTINATIONS.map(d => (
              <button
                key={d.id}
                onClick={() => setDestId(d.id)}
                className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-3 transition-all"
                style={{
                  background: destId === d.id ? 'rgba(99,102,241,0.2)' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${destId === d.id ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                <span className="text-xl">{d.icon}</span>
                <div>
                  <div className="text-sm font-semibold" style={{ color: destId === d.id ? '#a5b4fc' : '#e2e8f0' }}>{d.name}</div>
                  <div className="text-[10px] text-gray-600">{d.context}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Speed picker */}
        <div>
          <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Pick Speed</div>
          <div className="space-y-1.5">
            {SPEEDS.map(s => (
              <button
                key={s.id}
                onClick={() => setSpeedId(s.id)}
                className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-3 transition-all"
                style={{
                  background: speedId === s.id ? s.color + '20' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${speedId === s.id ? s.color + '50' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                <span className="text-base w-6">{s.icon}</span>
                <div className="flex-1">
                  <div className="text-xs font-bold" style={{ color: speedId === s.id ? s.color : '#e2e8f0' }}>{s.label}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-900 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, (Math.log10(s.fractionC * 1000 + 1) / Math.log10(1001)) * 100)}%`,
                        background: s.color
                      }} />
                    </div>
                    <span className="text-[9px] text-gray-600 w-20 text-right">{s.fractionC >= 1 ? `${s.fractionC}× c` : `${(s.fractionC * 100).toFixed(s.fractionC < 0.001 ? 4 : 1)}% c`}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-xl p-6" style={{ background: speed.color + '10', border: `1px solid ${speed.color}35` }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{dest.icon}</span>
          <div className="text-gray-400 text-lg">→</div>
          <span className="text-3xl">{speed.icon}</span>
          <div className="flex-1 text-right">
            <div className="text-white font-bold">{dest.name}</div>
            <div className="text-gray-400 text-sm">at {speed.label}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase font-semibold mb-1">
              {travelTime.dilated ? '⌛ Traveler\'s Time' : '⏱ Travel Time'}
            </div>
            <div className="text-3xl font-black" style={{ color: speed.color }}>{travelTime.ship}</div>
          </div>
          {travelTime.dilated && (
            <div className="text-center">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">🌍 Earth Time Passes</div>
              <div className="text-3xl font-black text-gray-300">{travelTime.earth}</div>
            </div>
          )}
        </div>

        <div className="rounded-lg p-3 bg-gray-900/50">
          <p className="text-gray-400 text-sm leading-relaxed">{speed.note}</p>
        </div>

        {travelTime.dilated && (
          <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <div className="text-indigo-400 text-xs font-bold uppercase mb-1">⚡ Relativistic Effect</div>
            <p className="text-gray-300 text-sm">
              At {(speed.fractionC * 100).toFixed(0)}% light speed, time dilation factor = {speed.timeDilationFactor.toFixed(3)}×.
              For every {speed.timeDilationFactor.toFixed(1)} years that pass on Earth, only 1 year passes for you aboard the ship.
              When you arrive, everyone you knew on Earth aged {speed.timeDilationFactor.toFixed(1)}× faster than you.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
