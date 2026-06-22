const ROCKETS = [
  { name: 'Saturn V',       year: 1967, cost: 54500, color: '#6b7280', reusable: false, org: 'NASA' },
  { name: 'Space Shuttle',  year: 1981, cost: 54000, color: '#818cf8', reusable: false, org: 'NASA' },
  { name: 'Falcon 1',       year: 2008, cost: 26700, color: '#60a5fa', reusable: false, org: 'SpaceX' },
  { name: 'Falcon 9',       year: 2010, cost:  2720, color: '#34d399', reusable: true,  org: 'SpaceX' },
  { name: 'Falcon Heavy',   year: 2018, cost:  1400, color: '#10b981', reusable: true,  org: 'SpaceX' },
  { name: 'Starship (est)', year: 2025, cost:   100, color: '#f87171', reusable: true,  org: 'SpaceX' },
]

const MAX_COST = 54500

export default function SpaceCostChart() {
  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="icon-box">💸</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Cost to Reach Orbit</h3>
          <p className="text-gray-500 text-xs">Cost per kg to LEO — the SpaceX revolution</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#374151' }} />
          <span className="text-[10px] text-gray-600">Expendable</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#34d399' }} />
          <span className="text-[10px] text-gray-600">Reusable</span>
        </div>
      </div>

      <div className="space-y-3">
        {ROCKETS.map(r => {
          const pct = Math.max(0.5, (r.cost / MAX_COST) * 100)
          return (
            <div key={r.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-300">{r.name}</span>
                  <span className="text-[9px] text-gray-700">{r.year}</span>
                  {r.reusable && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                      REUSABLE
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold font-mono" style={{ color: r.color }}>
                  ${r.cost.toLocaleString()}/kg
                </span>
              </div>
              <div className="relative h-6 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${r.color}30, ${r.color}80)`, border: `1px solid ${r.color}40` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-lg"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${r.color}50, ${r.color})`, maxWidth: '100%' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 p-3 rounded-xl" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
        <p className="text-red-300 text-xs font-semibold mb-0.5">The Starship Revolution</p>
        <p className="text-gray-500 text-[11px] leading-relaxed">
          From $54,500/kg (Saturn V) to an estimated $100/kg (Starship) — a <span className="text-white font-bold">545× reduction</span> in 60 years. Full reusability is the key.
        </p>
      </div>
    </div>
  )
}
