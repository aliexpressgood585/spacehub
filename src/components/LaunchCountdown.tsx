import { useState, useEffect } from 'react'

interface Launch {
  name: string
  net: string
  provider: string
  rocket: string
  location: string
  statusName: string
  flag: string
}

const FLAG: Record<string, string> = {
  USA: '🇺🇸', RUS: '🇷🇺', CHN: '🇨🇳', EU: '🇪🇺', IND: '🇮🇳', JPN: '🇯🇵', KOR: '🇰🇷', NZL: '🇳🇿',
}

const FALLBACK: Launch[] = [
  { name: 'Falcon 9 | Starlink', net: new Date(Date.now() + 3 * 86400000).toISOString(), provider: 'SpaceX', rocket: 'Falcon 9', location: 'Cape Canaveral, FL', statusName: 'Go', flag: '🇺🇸' },
  { name: 'New Glenn | Commercial', net: new Date(Date.now() + 10 * 86400000).toISOString(), provider: 'Blue Origin', rocket: 'New Glenn', location: 'Cape Canaveral, FL', statusName: 'TBD', flag: '🇺🇸' },
]

function statusStyle(name: string) {
  const n = name.toLowerCase()
  if (n.includes('go') || n.includes('success')) return { bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)', color: '#4ade80', label: '✓ Go for Launch' }
  if (n.includes('hold')) return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#f87171', label: '⏸ Hold' }
  return { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', color: '#fbbf24', label: '⏳ TBD' }
}

function useCountdown(iso: string) {
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0 })
  useEffect(() => {
    const tick = () => {
      const diff = new Date(iso).getTime() - Date.now()
      if (diff <= 0) { setT({ d: 0, h: 0, m: 0, s: 0 }); return }
      setT({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [iso])
  return t
}

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="countdown-digit flex-1">
      <div className="text-2xl font-black font-mono text-white tabular-nums mb-0.5" style={{ textShadow: '0 0 20px rgba(99,102,241,0.4)' }}>
        {value.toString().padStart(2, '0')}
      </div>
      <div className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">{label}</div>
    </div>
  )
}

function CountdownDisplay({ net }: { net: string }) {
  const t = useCountdown(net)
  return (
    <div className="flex gap-2 justify-center mb-4">
      <Digit value={t.d} label="Days" />
      <div className="flex items-center text-indigo-500 font-black text-xl pb-4">:</div>
      <Digit value={t.h} label="Hours" />
      <div className="flex items-center text-indigo-500 font-black text-xl pb-4">:</div>
      <Digit value={t.m} label="Mins" />
      <div className="flex items-center text-indigo-500 font-black text-xl pb-4">:</div>
      <Digit value={t.s} label="Secs" />
    </div>
  )
}

export default function LaunchCountdown() {
  const [launches, setLaunches] = useState<Launch[]>(FALLBACK)
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/launches')
      .then(r => { if (!r.ok) throw new Error(''); return r.json() })
      .then((data: { results: { name: string; net: string; rocket: { configuration: { name: string } }; launch_service_provider: { name: string }; pad: { location: { name: string; country_code: string } }; status: { name: string } }[] }) => {
        const mapped: Launch[] = data.results.map(r => ({
          name: r.name,
          net: r.net,
          provider: r.launch_service_provider?.name ?? 'Unknown',
          rocket: r.rocket?.configuration?.name ?? '—',
          location: r.pad?.location?.name ?? '—',
          statusName: r.status?.name ?? 'TBD',
          flag: FLAG[r.pad?.location?.country_code] ?? '🚀',
        }))
        if (mapped.length > 0) setLaunches(mapped)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const next = launches[selected] ?? launches[0]
  const st = statusStyle(next.statusName)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🚀</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Next Launch</h3>
          <p className="text-gray-500 text-xs">Live upcoming rocket launches</p>
        </div>
        {!loading && <div className="live-badge"><span className="live-dot" /> LIVE</div>}
        {loading && <div className="text-xs text-gray-600 animate-pulse">Loading...</div>}
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {launches.map((l, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className="text-xs px-3 py-1.5 rounded-xl whitespace-nowrap flex-shrink-0 transition-all font-semibold"
            style={i === selected ? {
              background: 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.45)',
              color: '#c4b5fd',
            } : {
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#6b7280',
            }}
          >
            {l.flag} {l.provider}
          </button>
        ))}
      </div>

      <div className="text-center mb-4">
        <p className="text-white font-black text-base mb-2">{next.name}</p>
        <div className="flex items-center justify-center flex-wrap gap-2">
          <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
            {st.label}
          </span>
          <span className="text-gray-600 text-xs">{next.rocket}</span>
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-gray-600 text-xs">{next.location}</span>
        </div>
      </div>

      <CountdownDisplay net={next.net} />

      <p className="text-xs text-gray-700 text-center">
        {new Date(next.net).toLocaleString('en-US', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        })} UTC
      </p>
    </div>
  )
}
