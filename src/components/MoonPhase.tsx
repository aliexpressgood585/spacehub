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

  const daysToFull = pct < 0.5
    ? Math.round((0.5 - pct) * synodic)
    : Math.round((1.5 - pct) * synodic)

  return { name, emoji, illumination, age: Math.round(phase), daysToFull, pct }
}

export default function MoonPhase() {
  const moon = useMemo(() => getMoonPhase(new Date()), [])
  const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const C = 2 * Math.PI * 44

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🌙</div>
        <div>
          <h3 className="text-white font-bold text-base">Moon Phase</h3>
          <p className="text-gray-500 text-xs">{today}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex items-center gap-5 mb-5">
        {/* Moon emoji + glow */}
        <div className="relative flex-shrink-0">
          <div className="text-6xl moon-glow select-none" style={{ lineHeight: 1 }}>{moon.emoji}</div>
          <div
            className="absolute -bottom-1 -right-1 text-[10px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}
          >
            {moon.illumination}%
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-lg mb-0.5">{moon.name}</p>
          <p className="text-gray-500 text-xs mb-3">Age: {moon.age} days · Full moon in {moon.daysToFull}d</p>

          {/* Illumination bar */}
          <div>
            <div className="flex justify-between text-[10px] mb-1.5">
              <span className="text-gray-600">Illumination</span>
              <span style={{ color: '#fbbf24' }} className="font-bold">{moon.illumination}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${moon.illumination}%`,
                  background: 'linear-gradient(90deg, #92400e, #d97706, #fbbf24)',
                  boxShadow: '0 0 12px rgba(251,191,36,0.4)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Cycle ring */}
        <div className="hidden sm:flex flex-col items-center flex-shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="7" />
            <circle
              cx="48" cy="48" r="44" fill="none"
              stroke="url(#moonRingGrad)" strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - moon.pct)}
              transform="rotate(-90 48 48)"
            />
            <defs>
              <linearGradient id="moonRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#92400e" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
            <text x="48" y="44" textAnchor="middle" fill="#fbbf24" fontSize="13" fontWeight="900">
              {Math.round(moon.pct * 100)}%
            </text>
            <text x="48" y="58" textAnchor="middle" fill="#6b7280" fontSize="9">Cycle</text>
          </svg>
        </div>
      </div>

      {/* Phase timeline */}
      <div
        className="grid grid-cols-4 gap-1 p-3 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
      >
        {[
          { e: '🌑', n: 'New', active: moon.pct < 0.1 || moon.pct > 0.9 },
          { e: '🌓', n: 'First Qtr', active: moon.pct >= 0.1 && moon.pct < 0.4 },
          { e: '🌕', n: 'Full', active: moon.pct >= 0.4 && moon.pct < 0.6 },
          { e: '🌗', n: 'Last Qtr', active: moon.pct >= 0.6 && moon.pct < 0.9 },
        ].map(p => (
          <div
            key={p.n}
            className="text-center py-1.5 rounded-xl transition-all"
            style={p.active ? {
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.25)',
            } : {}}
          >
            <div className="text-base mb-0.5">{p.e}</div>
            <div className="text-[9px] font-semibold" style={{ color: p.active ? '#fbbf24' : '#4b5563' }}>{p.n}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
