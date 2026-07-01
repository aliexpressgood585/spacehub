import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'

const SERIES = '#6d7bf5' // validated ≥3:1 on this surface, L inside dark band

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', IL: 'Israel', GB: 'United Kingdom', DE: 'Germany', FR: 'France',
  CA: 'Canada', AU: 'Australia', IN: 'India', BR: 'Brazil', JP: 'Japan', NL: 'Netherlands',
  ES: 'Spain', IT: 'Italy', RU: 'Russia', MX: 'Mexico', PL: 'Poland', SE: 'Sweden',
  TR: 'Turkey', KR: 'South Korea', CN: 'China', AR: 'Argentina', ZA: 'South Africa',
  '??': 'Unknown',
}

const flag = (cc: string) =>
  /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1f1a5 + c.charCodeAt(0))) : '🌐'

interface Stats {
  total: number
  today: number
  days: { d: string; c: number }[]
  countries: { country: string; c: number }[]
  pages: { path: string; c: number }[]
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <p className="text-2xl font-black gradient-text">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  )
}

function DailyChart({ days }: { days: { d: string; c: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720, H = 200, PAD_L = 34, PAD_B = 22, PAD_T = 14
  const max = Math.max(1, ...days.map(x => x.c))
  const maxIdx = days.findIndex(x => x.c === max)
  const innerW = W - PAD_L - 8
  const innerH = H - PAD_T - PAD_B
  const step = innerW / days.length
  const barW = Math.max(2, Math.min(26, step - 2))
  const gridLines = [0.5, 1]
  const labelEvery = Math.ceil(days.length / 6)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily visits">
        {gridLines.map(g => (
          <g key={g}>
            <line x1={PAD_L} x2={W - 8} y1={PAD_T + innerH * (1 - g)} y2={PAD_T + innerH * (1 - g)} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
            <text x={PAD_L - 6} y={PAD_T + innerH * (1 - g) + 4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(max * g)}</text>
          </g>
        ))}
        <line x1={PAD_L} x2={W - 8} y1={PAD_T + innerH} y2={PAD_T + innerH} stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
        {days.map((day, i) => {
          const h = Math.max(day.c > 0 ? 3 : 0, (day.c / max) * innerH)
          const x = PAD_L + i * step + (step - barW) / 2
          const y = PAD_T + innerH - h
          return (
            <g key={day.d}>
              {/* generous hit target */}
              <rect x={PAD_L + i * step} y={PAD_T} width={step} height={innerH} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              {day.c > 0 && (
                <rect x={x} y={y} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={SERIES}
                  opacity={hover === null || hover === i ? 1 : 0.45} pointerEvents="none" />
              )}
              {i === maxIdx && max > 0 && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#cbd5e1" pointerEvents="none">{max.toLocaleString()}</text>
              )}
              {i % labelEvery === 0 && (
                <text x={PAD_L + i * step + step / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b" pointerEvents="none">
                  {day.d.slice(5).replace('-', '/')}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && days[hover] && (
        <div className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg text-xs"
          style={{
            left: `${((PAD_L + hover * step + step / 2) / W) * 100}%`, top: 0, transform: 'translateX(-50%)',
            background: 'rgba(15,20,45,0.95)', border: '1px solid rgba(109,123,245,0.4)', color: '#e2e8f0', whiteSpace: 'nowrap',
          }}>
          <b>{days[hover].c.toLocaleString()}</b> visits · {days[hover].d}
        </div>
      )}
    </div>
  )
}

export default function AnalyticsPage() {
  const [key, setKey] = useState(() => localStorage.getItem('spacehub_dash_key') || '')
  const [input, setInput] = useState('')
  const [days, setDays] = useState(30)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = 'Analytics — SpaceHub'
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex,nofollow'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  const load = useCallback(async (k: string, d: number) => {
    if (!k) return
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/stats?key=${encodeURIComponent(k)}&days=${d}`)
      if (r.status === 401) { setError('מפתח שגוי'); localStorage.removeItem('spacehub_dash_key'); setKey(''); return }
      if (r.status === 503) { setError('המערכת עוד לא חוברה לבסיס הנתונים'); return }
      if (!r.ok) { setError('שגיאה בטעינת נתונים'); return }
      setStats(await r.json())
      localStorage.setItem('spacehub_dash_key', k)
    } catch { setError('שגיאת רשת') } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (key) load(key, days) }, [key, days, load])

  const week = useMemo(() => stats?.days.slice(-7).reduce((s, x) => s + x.c, 0) ?? 0, [stats])
  const maxCountry = Math.max(1, ...(stats?.countries.map(c => c.c) ?? [1]))

  return (
    <div className="min-h-screen" style={{ background: '#020510' }}>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link to="/" className="text-indigo-400 text-sm hover:text-indigo-300">← SpaceHub</Link>
        <div className="flex items-center justify-between mt-4 mb-8">
          <h1 className="text-3xl font-black text-white">📊 <span className="gradient-text">Analytics</span></h1>
          {stats && (
            <div className="flex gap-1.5">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`tab-pill ${days === d ? 'active' : ''}`}>{d}d</button>
              ))}
            </div>
          )}
        </div>

        {!key && (
          <div className="space-card p-8 max-w-sm mx-auto text-center">
            <p className="text-3xl mb-3">🔐</p>
            <h2 className="text-white font-bold mb-4">הזן מפתח גישה</h2>
            <input type="password" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setKey(input.trim())}
              className="w-full px-4 py-2.5 rounded-xl text-sm text-white mb-3"
              style={{ background: 'rgba(15,20,45,0.8)', border: '1px solid rgba(99,102,241,0.3)' }}
              placeholder="Dashboard key" />
            <button onClick={() => setKey(input.trim())} className="btn-shimmer px-6 py-2.5 text-sm w-full">כניסה</button>
            {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
          </div>
        )}

        {key && error && <div className="space-card p-6 text-center text-amber-400 text-sm">{error}</div>}
        {key && loading && !stats && <div className="space-card p-10 text-center text-gray-500 text-sm">טוען…</div>}

        {stats && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="סה״כ כניסות" value={stats.total} />
              <StatTile label="היום" value={stats.today} />
              <StatTile label="7 ימים אחרונים" value={week} />
              <StatTile label="מדינות" value={stats.countries.length} />
            </div>

            <div className="space-card p-6">
              <h2 className="text-white font-bold text-sm mb-4">כניסות לפי יום — {days} ימים אחרונים</h2>
              <DailyChart days={stats.days} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-card p-6">
                <h2 className="text-white font-bold text-sm mb-4">לפי מדינה</h2>
                {stats.countries.length === 0 && <p className="text-gray-600 text-xs">אין נתונים עדיין</p>}
                <div className="space-y-2.5">
                  {stats.countries.map(c => (
                    <div key={c.country} className="flex items-center gap-2 text-xs">
                      <span className="w-6 text-base leading-none">{flag(c.country)}</span>
                      <span className="text-gray-400 w-28 truncate">{COUNTRY_NAMES[c.country] || c.country}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(c.c / maxCountry) * 100}%`, background: SERIES }} />
                      </div>
                      <span className="text-gray-300 font-semibold w-12 text-right">{c.c.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-card p-6">
                <h2 className="text-white font-bold text-sm mb-4">עמודים מובילים</h2>
                {stats.pages.length === 0 && <p className="text-gray-600 text-xs">אין נתונים עדיין</p>}
                <div className="space-y-2">
                  {stats.pages.map(p => (
                    <div key={p.path} className="flex items-center justify-between text-xs gap-3">
                      <span className="text-gray-400 truncate" dir="ltr">{p.path}</span>
                      <span className="text-gray-300 font-semibold flex-shrink-0">{p.c.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
