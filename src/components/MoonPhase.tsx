import { useMemo } from 'react'

function getMoonPhase(date: Date) {
  const known = new Date('2000-01-06T18:14:00Z')
  const synodic = 29.530588853
  const diff = (date.getTime() - known.getTime()) / (1000 * 60 * 60 * 24)
  const phase = ((diff % synodic) + synodic) % synodic
  const pct = phase / synodic

  let name: string, emoji: string, illumination: number
  if (pct < 0.033)       { name = 'New Moon';        emoji = '🌑'; illumination = 0 }
  else if (pct < 0.133)  { name = 'Waxing Crescent'; emoji = '🌒'; illumination = Math.round(pct / 0.133 * 25) }
  else if (pct < 0.233)  { name = 'First Quarter';   emoji = '🌓'; illumination = 50 }
  else if (pct < 0.383)  { name = 'Waxing Gibbous';  emoji = '🌔'; illumination = Math.round(50 + (pct - 0.233) / 0.15 * 49) }
  else if (pct < 0.533)  { name = 'Full Moon';       emoji = '🌕'; illumination = 100 }
  else if (pct < 0.633)  { name = 'Waning Gibbous';  emoji = '🌖'; illumination = Math.round(100 - (pct - 0.533) / 0.1 * 25) }
  else if (pct < 0.733)  { name = 'Last Quarter';    emoji = '🌗'; illumination = 50 }
  else if (pct < 0.883)  { name = 'Waning Crescent'; emoji = '🌘'; illumination = Math.round(25 - (pct - 0.733) / 0.15 * 24) }
  else                   { name = 'New Moon';         emoji = '🌑'; illumination = 0 }

  const daysToFull = pct < 0.5 ? Math.round((0.5 - pct) * synodic) : Math.round((1.5 - pct) * synodic)
  const age = Math.round(phase)
  return { name, emoji, illumination, age, daysToFull, pct }
}

export default function MoonPhase() {
  const moon = useMemo(() => getMoonPhase(new Date()), [])
  const circumference = 2 * Math.PI * 40

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🌙</span>
        <div>
          <h3 className="text-white font-bold text-lg">Moon Phase</h3>
          <p className="text-gray-500 text-xs">Today — {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex-shrink-0 relative">
          <div className="text-7xl moon-glow select-none">{moon.emoji}</div>
          <div className="absolute -bottom-1 -right-1 bg-space-900 text-xs text-yellow-400 font-bold px-1.5 py-0.5 rounded-full border border-yellow-600/30">
            {moon.illumination}%
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xl font-bold text-white">{moon.name}</p>
            <p className="text-gray-500 text-xs">Moon age: {moon.age} days</p>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Illumination</span>
              <span className="text-yellow-400 font-mono">{moon.illumination}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-yellow-300 transition-all" style={{ width: `${moon.illumination}%` }} />
            </div>
          </div>
          <p className="text-xs text-gray-500">Full moon in {moon.daysToFull} days</p>
        </div>

        <div className="flex-shrink-0 hidden sm:block">
          <svg width="90" height="90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <circle cx="45" cy="45" r="40" fill="none" stroke="url(#moonGrad)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={circumference * (1 - moon.pct)} transform="rotate(-90 45 45)" />
            <defs>
              <linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d97706" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
            <text x="45" y="49" textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="bold">{Math.round(moon.pct * 100)}%</text>
          </svg>
          <p className="text-xs text-gray-600 text-center mt-1">Cycle</p>
        </div>
      </div>
    </div>
  )
}
