import { useState, useEffect } from 'react'

const WINDOWS = [
  {
    label: '2026 Window — Uncrewed Starship',
    date: new Date('2026-09-15T00:00:00Z'),
    note: 'First Starship cargo mission to Mars',
    color: '#f87171',
  },
  {
    label: '2029 Window — First Crew',
    date: new Date('2029-01-10T00:00:00Z'),
    note: 'First crewed Starship Mars landing',
    color: '#fb923c',
  },
  {
    label: '2031 Window — Colony Phase',
    date: new Date('2031-04-05T00:00:00Z'),
    note: 'Permanent Mars base establishment',
    color: '#fbbf24',
  },
]

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(target.getTime() - Date.now())
  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  const s = Math.max(0, Math.floor(diff / 1000))
  return {
    days:    Math.floor(s / 86400),
    hours:   Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    passed:  diff < 0,
  }
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="font-black text-2xl sm:text-3xl font-mono w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
      >
        {String(value).padStart(2, '0')}
      </div>
      <p className="text-[9px] text-gray-600 uppercase tracking-widest mt-1 font-semibold">{label}</p>
    </div>
  )
}

export default function MarsCountdown() {
  const [active, setActive] = useState(0)
  const win = WINDOWS[active]
  const cd = useCountdown(win.date)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🔴</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Countdown to Mars</h3>
          <p className="text-gray-500 text-xs">Earth–Mars transfer windows · Hohmann trajectory</p>
        </div>
      </div>

      {/* Window selector */}
      <div className="flex flex-col gap-2 mb-5">
        {WINDOWS.map((w, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className="flex items-center gap-3 p-3 rounded-xl text-left transition-all"
            style={active === i
              ? { background: 'rgba(239,68,68,0.1)', border: `1px solid ${w.color}40` }
              : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active === i ? w.color : '#374151' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: active === i ? w.color : '#6b7280' }}>{w.label}</p>
              <p className="text-[10px] text-gray-700">{w.note}</p>
            </div>
            <p className="text-[10px] text-gray-700 flex-shrink-0 font-mono">
              {w.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          </button>
        ))}
      </div>

      {/* Countdown */}
      {cd.passed ? (
        <div className="text-center py-4">
          <p className="text-red-400 font-bold text-lg">🚀 Window Open!</p>
        </div>
      ) : (
        <div className="flex gap-2 justify-center mb-5">
          <TimeUnit value={cd.days}    label="days"    />
          <div className="text-red-400 font-black text-2xl self-center mb-4">:</div>
          <TimeUnit value={cd.hours}   label="hours"   />
          <div className="text-red-400 font-black text-2xl self-center mb-4">:</div>
          <TimeUnit value={cd.minutes} label="min"     />
          <div className="text-red-400 font-black text-2xl self-center mb-4">:</div>
          <TimeUnit value={cd.seconds} label="sec"     />
        </div>
      )}

      {/* Mars facts */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Journey time', val: '~7 months' },
          { label: 'Distance', val: '~225M km' },
          { label: 'Recurs every', val: '~26 months' },
        ].map(f => (
          <div key={f.label} className="text-center p-2.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <p className="text-red-300 font-bold text-sm">{f.val}</p>
            <p className="text-gray-700 text-[9px] mt-0.5">{f.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
