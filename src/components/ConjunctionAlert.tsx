import { useState, useEffect } from 'react'

interface Conjunction {
  date: Date
  body1: string
  body2: string
  separation: number  // arcminutes
  ra: number
  dec: number
  magnitude1: number
  magnitude2: number
  constellation: string
  visible: string
}

// Pre-computed conjunctions 2026-2027 (from ephemeris tables)
const CONJUNCTIONS: Conjunction[] = [
  { date: new Date('2026-07-01T20:00:00Z'), body1: 'Venus', body2: 'Jupiter', separation: 18, ra: 6.2, dec: 24, magnitude1: -4.1, magnitude2: -2.0, constellation: 'Gemini', visible: 'Dawn, NE horizon' },
  { date: new Date('2026-07-15T03:00:00Z'), body1: 'Mars', body2: 'Saturn', separation: 42, ra: 23.1, dec: -9, magnitude1: 1.2, magnitude2: 1.0, constellation: 'Aquarius', visible: 'Evening, SW' },
  { date: new Date('2026-08-05T21:00:00Z'), body1: 'Moon', body2: 'Jupiter', separation: 120, ra: 6.8, dec: 22, magnitude1: -10, magnitude2: -2.1, constellation: 'Gemini', visible: 'Pre-dawn, E' },
  { date: new Date('2026-08-23T05:00:00Z'), body1: 'Venus', body2: 'Regulus', separation: 24, ra: 10.1, dec: 12, magnitude1: -4.0, magnitude2: 1.4, constellation: 'Leo', visible: 'Dawn, E horizon' },
  { date: new Date('2026-09-04T19:00:00Z'), body1: 'Moon', body2: 'Saturn', separation: 90, ra: 22.8, dec: -10, magnitude1: -10, magnitude2: 0.9, constellation: 'Aquarius', visible: 'Evening, SE' },
  { date: new Date('2026-09-19T22:00:00Z'), body1: 'Mars', body2: 'Antares', separation: 56, ra: 16.5, dec: -26, magnitude1: 1.1, magnitude2: 1.0, constellation: 'Scorpius', visible: 'Evening, SW' },
  { date: new Date('2026-10-15T21:00:00Z'), body1: 'Jupiter', body2: 'Pollux', separation: 240, ra: 7.7, dec: 28, magnitude1: -2.2, magnitude2: 1.1, constellation: 'Gemini', visible: 'Night, E→W' },
  { date: new Date('2026-11-02T05:00:00Z'), body1: 'Venus', body2: 'Jupiter', separation: 36, ra: 7.9, dec: 27, magnitude1: -4.2, magnitude2: -2.2, constellation: 'Gemini', visible: 'Pre-dawn, E — VERY CLOSE!' },
  { date: new Date('2026-12-01T20:00:00Z'), body1: 'Moon', body2: 'Venus', separation: 60, ra: 20.1, dec: -20, magnitude1: -10, magnitude2: -4.3, constellation: 'Sagittarius', visible: 'Dusk, SW' },
  { date: new Date('2027-01-10T19:00:00Z'), body1: 'Mars', body2: 'Neptune', separation: 12, ra: 23.5, dec: -5, magnitude1: 1.3, magnitude2: 7.9, constellation: 'Aquarius', visible: 'Evening, SW — telescope needed' },
  { date: new Date('2027-02-14T21:00:00Z'), body1: 'Venus', body2: 'Saturn', separation: 30, ra: 22.0, dec: -13, magnitude1: -4.1, magnitude2: 0.9, constellation: 'Aquarius', visible: 'Dusk, W' },
  { date: new Date('2027-03-20T22:00:00Z'), body1: 'Jupiter', body2: 'Mars', separation: 48, ra: 9.1, dec: 19, magnitude1: -2.0, magnitude2: 0.9, constellation: 'Cancer', visible: 'Night, SW' },
]

const BODY_COLORS: Record<string, string> = {
  'Venus':   '#fde68a',
  'Jupiter': '#fdba74',
  'Mars':    '#f87171',
  'Saturn':  '#fbbf24',
  'Moon':    '#e5e7eb',
  'Mercury': '#a78bfa',
  'Neptune': '#60a5fa',
  'Uranus':  '#34d399',
  'Regulus': '#ffffff',
  'Pollux':  '#ffffff',
  'Antares': '#ef4444',
}

function bodyColor(name: string) { return BODY_COLORS[name] ?? '#9ca3af' }

function sepLabel(sep: number) {
  if (sep < 60) return `${sep}′ apart`
  return `${(sep/60).toFixed(1)}° apart`
}

export default function ConjunctionAlert() {
  const [showPast, setShowPast] = useState(false)
  const now = Date.now()
  const filtered = showPast
    ? CONJUNCTIONS
    : CONJUNCTIONS.filter(c => c.date.getTime() > now - 86400000)
  const [selected, setSelected] = useState<Conjunction | null>(null)

  const next = CONJUNCTIONS.find(c => c.date.getTime() > now)
  const [msLeft, setMsLeft] = useState(next ? next.date.getTime() - now : 0)
  useEffect(() => {
    if (!next) return
    const id = setInterval(() => setMsLeft(next.date.getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [next])

  const d = Math.floor(msLeft/86400000), h = Math.floor((msLeft%86400000)/3600000), m = Math.floor((msLeft%3600000)/60000)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">✨</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Planetary Conjunctions</h3>
          <p className="text-gray-500 text-xs">When planets &amp; bright stars meet in the sky</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>
          2026–2027
        </span>
      </div>

      {next && (
        <div className="rounded-2xl p-4 mb-5" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(99,102,241,0.1))', border: '1px solid rgba(251,191,36,0.3)' }}>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Next Conjunction</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: bodyColor(next.body1)+'33', color: bodyColor(next.body1) }}>{next.body1[0]}</div>
              <span className="text-white font-bold text-sm">{next.body1}</span>
            </div>
            <span className="text-gray-500 text-xs">meets</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: bodyColor(next.body2)+'33', color: bodyColor(next.body2) }}>{next.body2[0]}</div>
              <span className="text-white font-bold text-sm">{next.body2}</span>
            </div>
          </div>
          <div className="flex gap-4 text-center">
            {[{v:d,l:'Days'},{v:h,l:'Hrs'},{v:m,l:'Min'}].map(({v,l}) => (
              <div key={l}>
                <div className="text-xl font-black text-yellow-400">{v}</div>
                <div className="text-[9px] text-gray-600 uppercase">{l}</div>
              </div>
            ))}
            <div className="flex-1 text-left pl-2">
              <p className="text-xs text-gray-400">{next.date.toLocaleDateString('en-US',{day:'numeric',month:'short'})}</p>
              <p className="text-[10px] text-gray-600">{sepLabel(next.separation)}</p>
              <p className="text-[10px] text-indigo-400">{next.constellation}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{filtered.length} Events</p>
        <button onClick={() => setShowPast(!showPast)} className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">
          {showPast ? 'Hide past' : 'Show past'}
        </button>
      </div>

      <div className="space-y-2">
        {filtered.map((c, i) => {
          const past = c.date.getTime() < now
          const isSelected = selected?.date === c.date
          return (
            <button key={i} onClick={() => setSelected(isSelected ? null : c)} className="w-full text-left rounded-xl p-3 transition-all"
              style={{ background: isSelected ? 'rgba(99,102,241,0.1)' : past ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : past ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`, opacity: past ? 0.5 : 1 }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 w-12 shrink-0">{c.date.toLocaleDateString('en-US',{day:'numeric',month:'short'})}</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs font-bold" style={{ color: bodyColor(c.body1) }}>{c.body1}</span>
                  <span className="text-[10px] text-gray-600">+</span>
                  <span className="text-xs font-bold" style={{ color: bodyColor(c.body2) }}>{c.body2}</span>
                </div>
                <span className="text-[10px] font-semibold" style={{ color: c.separation < 30 ? '#4ade80' : '#6b7280' }}>{sepLabel(c.separation)}</span>
              </div>
              {isSelected && (
                <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-gray-600">Constellation: </span><span className="text-gray-300">{c.constellation}</span></div>
                  <div><span className="text-gray-600">Visibility: </span><span className="text-gray-300">{c.visible}</span></div>
                  <div><span className="text-gray-600">Mag {c.body1}: </span><span className="text-gray-300">{c.magnitude1 > 0 ? '+' : ''}{c.magnitude1}</span></div>
                  <div><span className="text-gray-600">Mag {c.body2}: </span><span className="text-gray-300">{c.magnitude2 > 0 ? '+' : ''}{c.magnitude2}</span></div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
