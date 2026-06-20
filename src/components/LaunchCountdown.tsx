import { useState, useEffect } from 'react'

interface Launch {
  name: string
  net: string
  provider: string
  location: string
  status: string
}

const FALLBACK_LAUNCHES: Launch[] = [
  { name: 'Starship IFT-9', net: '2026-07-15T14:00:00Z', provider: 'SpaceX', location: 'Boca Chica, TX', status: 'Go' },
  { name: 'Falcon 9 | Starlink Group 15-8', net: '2026-06-28T08:30:00Z', provider: 'SpaceX', location: 'Cape Canaveral, FL', status: 'Go' },
  { name: 'Ariane 6 | Multi-Payload', net: '2026-07-03T22:15:00Z', provider: 'Arianespace', location: 'Kourou, French Guiana', status: 'TBD' },
]

function useCountdown(targetISO: string) {
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 })
  useEffect(() => {
    const tick = () => {
      const diff = new Date(targetISO).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft({ d: 0, h: 0, m: 0, s: 0 }); return }
      setTimeLeft({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetISO])
  return timeLeft
}

function CountdownBig({ targetISO }: { targetISO: string }) {
  const t = useCountdown(targetISO)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    <div className="flex gap-2 justify-center my-3">
      {[{ v: t.d, l: 'Days' }, { v: t.h, l: 'Hours' }, { v: t.m, l: 'Mins' }, { v: t.s, l: 'Secs' }].map(({ v, l }) => (
        <div key={l} className="countdown-digit">
          <div className="text-2xl font-bold font-mono text-white tabular-nums">{pad(v)}</div>
          <div className="text-xs text-gray-600 mt-0.5">{l}</div>
        </div>
      ))}
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  Go: 'text-green-400 bg-green-900/20 border-green-700/30',
  TBD: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/30',
  Hold: 'text-red-400 bg-red-900/20 border-red-700/30',
}

export default function LaunchCountdown() {
  const [launches] = useState<Launch[]>(FALLBACK_LAUNCHES)
  const [selected, setSelected] = useState(0)
  const next = launches[selected]

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🚀</span>
        <div>
          <h3 className="text-white font-bold text-lg">Next Launch</h3>
          <p className="text-gray-500 text-xs">Countdown to upcoming rocket launches</p>
        </div>
      </div>

      {/* Launch selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {launches.map((l, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition border flex-shrink-0 ${i === selected ? 'bg-indigo-600/30 border-indigo-500/50 text-white' : 'glass border-white/5 text-gray-500 hover:text-gray-300'}`}
          >
            {l.provider}
          </button>
        ))}
      </div>

      {next && (
        <div>
          <div className="text-center mb-1">
            <p className="text-base font-bold text-white">{next.name}</p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[next.status] ?? STATUS_COLOR.TBD}`}>
                {next.status === 'Go' ? '✓ Go for Launch' : next.status === 'TBD' ? '⏳ TBD' : '⏸ Hold'}
              </span>
              <span className="text-xs text-gray-600">{next.location}</span>
            </div>
          </div>

          <CountdownBig targetISO={next.net} />

          <p className="text-xs text-gray-700 text-center">
            {new Date(next.net).toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC
          </p>
        </div>
      )}
    </div>
  )
}
