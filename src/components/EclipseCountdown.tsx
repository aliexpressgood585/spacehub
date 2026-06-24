import { useState, useEffect } from 'react'

interface Eclipse {
  id: string
  date: Date
  type: 'total' | 'annular' | 'partial' | 'hybrid'
  kind: 'solar' | 'lunar'
  totality: string
  visibility: string
  gamma: number
  mag: number
}

const ECLIPSES: Eclipse[] = [
  { id: 's1', date: new Date('2026-08-12T17:47:00Z'), type: 'total', kind: 'solar', totality: '2m 18s', visibility: 'Greenland · Iceland · Spain · Morocco · Algeria', gamma: 0.897, mag: 1.045 },
  { id: 'l1', date: new Date('2026-08-28T04:13:00Z'), type: 'partial', kind: 'lunar', totality: '3h 57m', visibility: 'Americas · Europe · Africa · W. Asia', gamma: -0.346, mag: 0.931 },
  { id: 'l2', date: new Date('2027-02-20T23:13:00Z'), type: 'total', kind: 'lunar', totality: '1h 02m', visibility: 'Europe · Africa · Asia · Americas', gamma: 0.284, mag: 1.174 },
  { id: 's2', date: new Date('2027-08-02T10:07:00Z'), type: 'total', kind: 'solar', totality: '6m 23s', visibility: 'Morocco · Algeria · Libya · Egypt · Yemen · Somalia', gamma: 0.142, mag: 1.079 },
  { id: 'l3', date: new Date('2028-01-12T04:13:00Z'), type: 'total', kind: 'lunar', totality: '56m', visibility: 'Africa · Asia · Australia · Pacific', gamma: -0.152, mag: 1.254 },
  { id: 's3', date: new Date('2028-07-22T02:56:00Z'), type: 'total', kind: 'solar', totality: '5m 10s', visibility: 'Australia · New Zealand', gamma: 0.601, mag: 1.056 },
  { id: 'l4', date: new Date('2029-06-26T03:22:00Z'), type: 'total', kind: 'lunar', totality: '1h 41m', visibility: 'Americas · Europe · Africa', gamma: -0.228, mag: 1.844 },
  { id: 's4', date: new Date('2030-06-01T06:29:00Z'), type: 'annular', kind: 'solar', totality: '5m 21s', visibility: 'Algeria · Tunisia · Turkey · China', gamma: -0.129, mag: 0.944 },
]

function typeColor(e: Eclipse) {
  if (e.kind === 'solar') return e.type === 'total' ? '#f59e0b' : e.type === 'annular' ? '#f97316' : '#fbbf24'
  return e.type === 'total' ? '#818cf8' : '#60a5fa'
}

function typeLabel(e: Eclipse) {
  const k = e.kind === 'solar' ? '☀️ Solar' : '🌑 Lunar'
  const t = e.type.charAt(0).toUpperCase() + e.type.slice(1)
  return `${k} · ${t}`
}

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(target.getTime() - Date.now())
  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  if (diff <= 0) return { past: true, d: 0, h: 0, m: 0, s: 0 }
  const s = Math.floor(diff / 1000)
  return { past: false, d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

function EclipseCard({ e, expanded, onToggle }: { e: Eclipse; expanded: boolean; onToggle: () => void }) {
  const cd = useCountdown(e.date)
  const color = typeColor(e)
  const past = cd.past
  return (
    <button onClick={onToggle} className="w-full text-left rounded-2xl p-4 transition-all" style={{ background: expanded ? `rgba(${e.kind==='solar'?'245,158,11':'99,102,241'},0.08)` : 'rgba(255,255,255,0.025)', border: `1px solid ${expanded ? color+'55' : 'rgba(255,255,255,0.07)'}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: color+'22', color, border: `1px solid ${color}44` }}>
              {typeLabel(e)}
            </span>
            <span className="text-[10px] text-gray-600">{e.date.toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' })}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{e.visibility}</p>
        </div>
        {!past && (
          <div className="text-right shrink-0">
            <div className="flex gap-1 items-end">
              {cd.d > 0 && <><span className="text-sm font-black" style={{ color }}>{cd.d}</span><span className="text-[9px] text-gray-600">d</span></>}
              <span className="text-sm font-black" style={{ color }}>{String(cd.h).padStart(2,'0')}</span><span className="text-[9px] text-gray-600">h</span>
              <span className="text-sm font-black" style={{ color }}>{String(cd.m).padStart(2,'0')}</span><span className="text-[9px] text-gray-600">m</span>
              <span className="text-sm font-black text-gray-500">{String(cd.s).padStart(2,'0')}</span><span className="text-[9px] text-gray-600">s</span>
            </div>
          </div>
        )}
        {past && <span className="text-[10px] text-gray-700 shrink-0">Passed</span>}
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide">Totality</p>
            <p className="text-xs font-bold text-white">{e.totality}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide">Magnitude</p>
            <p className="text-xs font-bold text-white">{e.mag.toFixed(3)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide">Gamma</p>
            <p className="text-xs font-bold text-white">{e.gamma.toFixed(3)}</p>
          </div>
          <div className="col-span-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Visibility Path</p>
            <p className="text-xs text-gray-400">{e.visibility}</p>
          </div>
        </div>
      )}
    </button>
  )
}

export default function EclipseCountdown() {
  const [expanded, setExpanded] = useState<string | null>('s1')
  const [filter, setFilter] = useState<'all' | 'solar' | 'lunar'>('all')
  const now = Date.now()
  const upcoming = ECLIPSES.filter(e => e.date.getTime() > now - 86400000)
  const next = upcoming[0]
  const cdNext = useCountdown(next?.date ?? new Date())

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">🌑</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Eclipse Countdown</h3>
          <p className="text-gray-500 text-xs">Solar &amp; lunar eclipses — live countdown to first contact</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
          {upcoming.length} upcoming
        </span>
      </div>

      {next && (
        <div className="rounded-2xl p-4 mb-5" style={{ background: `linear-gradient(135deg, rgba(${next.kind==='solar'?'245,158,11':'99,102,241'},0.12), rgba(0,0,0,0))`, border: `1px solid ${typeColor(next)}44` }}>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Next Eclipse</p>
          <p className="text-white font-bold text-sm mb-0.5">{typeLabel(next)}</p>
          <p className="text-gray-500 text-xs mb-3">{next.date.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
          <div className="flex gap-3 justify-center">
            {[{ v: cdNext.d, l: 'Days' }, { v: cdNext.h, l: 'Hours' }, { v: cdNext.m, l: 'Min' }, { v: cdNext.s, l: 'Sec' }].map(({ v, l }) => (
              <div key={l} className="text-center">
                <div className="text-2xl font-black" style={{ color: typeColor(next) }}>{String(v).padStart(2,'0')}</div>
                <div className="text-[9px] text-gray-600 uppercase">{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['all','solar','lunar'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className="text-xs px-3 py-1.5 rounded-xl font-semibold capitalize transition-all"
            style={filter===f ? { background:'rgba(99,102,241,0.2)', border:'1px solid rgba(99,102,241,0.5)', color:'#c4b5fd' } : { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#6b7280' }}>
            {f === 'solar' ? '☀️ Solar' : f === 'lunar' ? '🌑 Lunar' : '🌌 All'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {upcoming.filter(e => filter === 'all' || e.kind === filter).map(e => (
          <EclipseCard key={e.id} e={e} expanded={expanded === e.id} onToggle={() => setExpanded(expanded === e.id ? null : e.id)} />
        ))}
      </div>

      <p className="text-[10px] text-gray-700 mt-4 text-center">Eclipse data: NASA/USNO Five Millennium Canon. Times UTC.</p>
    </div>
  )
}
