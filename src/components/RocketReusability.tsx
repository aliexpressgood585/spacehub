import { useState, useEffect } from 'react'

interface Core {
  serial: string
  reuse_count: number
  status: string
  last_update: string | null
  launches: string[]
}

const FALLBACK: Core[] = [
  { serial: 'B1058', reuse_count: 19, status: 'active', last_update: 'Most flown operational booster', launches: [] },
  { serial: 'B1060', reuse_count: 17, status: 'active', last_update: 'Workhorse booster for Starlink', launches: [] },
  { serial: 'B1062', reuse_count: 16, status: 'active', last_update: 'Multiple Starlink & commercial missions', launches: [] },
  { serial: 'B1067', reuse_count: 15, status: 'active', last_update: 'Dragon crew & cargo missions', launches: [] },
  { serial: 'B1073', reuse_count: 13, status: 'active', last_update: 'Starlink constellation deployment', launches: [] },
]

const STATUS_COLOR: Record<string, string> = {
  active:   '#4ade80',
  inactive: '#6b7280',
  retired:  '#f87171',
  lost:     '#ef4444',
  unknown:  '#9ca3af',
}

export default function RocketReusability() {
  const [cores, setCores] = useState<Core[]>([])
  const [loading, setLoading] = useState(true)
  const [totalLaunches, setTotalLaunches] = useState(0)

  useEffect(() => {
    fetch('https://api.spacexdata.com/v4/cores?limit=200')
      .then(r => r.json())
      .then((data: Core[]) => {
        const sorted = data
          .filter(c => c.reuse_count > 0)
          .sort((a, b) => b.reuse_count - a.reuse_count)
          .slice(0, 8)
        const total = data.reduce((acc, c) => acc + (c.reuse_count || 0), 0)
        setCores(sorted.length > 0 ? sorted : FALLBACK)
        setTotalLaunches(total || 285)
        setLoading(false)
      })
      .catch(() => {
        setCores(FALLBACK)
        setTotalLaunches(285)
        setLoading(false)
      })
  }, [])

  const savedCost = totalLaunches * 6e7
  const maxReuse = cores[0]?.reuse_count ?? 19

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">♻️</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Rocket Reusability</h3>
          <p className="text-gray-500 text-xs">SpaceX Falcon 9 booster fleet</p>
        </div>
        <div className="live-badge"><span className="live-dot" /> SpaceX API</div>
      </div>

      {/* Savings banner */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { icon: '🚀', val: `${totalLaunches}+`, label: 'Reused landings' },
          { icon: '💰', val: `$${(savedCost / 1e9).toFixed(0)}B`, label: 'Est. cost saved' },
          { icon: '📦', val: `${(totalLaunches * 16).toLocaleString()}t`, label: 'Payload to orbit' },
        ].map(s => (
          <div key={s.label} className="text-center p-2.5 rounded-xl" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <div className="text-lg mb-0.5">{s.icon}</div>
            <p className="text-green-300 font-black text-sm">{s.val}</p>
            <p className="text-gray-700 text-[9px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Most Reused Boosters</p>
          {cores.map((c, i) => (
            <div key={c.serial} className="flex items-center gap-3">
              <span className="text-[10px] text-gray-700 w-4 flex-shrink-0 font-mono">{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white font-semibold font-mono">{c.serial}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[c.status] ?? '#9ca3af' }} />
                    <span className="text-[10px]" style={{ color: STATUS_COLOR[c.status] ?? '#9ca3af' }}>{c.reuse_count}×</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(c.reuse_count / maxReuse) * 100}%`,
                      background: `linear-gradient(90deg, #059669, #34d399)`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-700 mt-4 text-center">
        Each reuse saves ~$60M vs. building a new rocket · Data: SpaceX API
      </p>
    </div>
  )
}
