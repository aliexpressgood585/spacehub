import SolarWind3D from './SolarWind3D'

const METRICS = [
  {
    label: 'Solar Wind',
    value: '487 km/s',
    sub: 'Fast stream active',
    icon: '☀️',
    level: 'moderate',
    bar: 55,
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.25)',
  },
  {
    label: 'Cosmic Radiation',
    value: 'Low',
    sub: 'Background level',
    icon: '☢️',
    level: 'low',
    bar: 12,
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.08)',
    border: 'rgba(74,222,128,0.25)',
  },
  {
    label: 'Aurora Activity',
    value: 'High',
    sub: 'Kp-index: 6',
    icon: '🌌',
    level: 'high',
    bar: 78,
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.08)',
    border: 'rgba(129,140,248,0.25)',
  },
  {
    label: 'Geomagnetic',
    value: 'Stable',
    sub: 'No disturbances',
    icon: '🧲',
    level: 'low',
    bar: 18,
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.08)',
    border: 'rgba(74,222,128,0.25)',
  },
]

const ALERTS = [
  { icon: '🌩️', text: 'G2 geomagnetic storm watch in effect', color: '#fbbf24' },
  { icon: '☀️', text: 'M-class solar flare detected — Earth-directed', color: '#f97316' },
  { icon: '🌌', text: 'Aurora borealis visible to 50°N tonight', color: '#818cf8' },
]

export default function SpaceWeather() {
  return (
    <div className="space-y-5">

      {/* Header card */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-box">⛈️</div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-xl">Space Weather</h3>
            <p className="text-gray-500 text-xs">Real-time solar & geomagnetic conditions</p>
          </div>
          <div className="live-badge">
            <span className="live-dot" /> LIVE
          </div>
        </div>

        {/* Alert strip */}
        <div className="space-y-2 mb-6">
          {ALERTS.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span>{a.icon}</span>
              <span style={{ color: a.color }}>{a.text}</span>
            </div>
          ))}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {METRICS.map(m => (
            <div
              key={m.label}
              className="rounded-2xl p-4"
              style={{ background: m.bg, border: `1px solid ${m.border}` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{m.icon}</span>
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{m.label}</span>
              </div>
              <p className="text-white font-black text-lg mb-0.5">{m.value}</p>
              <p className="text-xs mb-3" style={{ color: m.color, opacity: 0.8 }}>{m.sub}</p>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${m.bar}%`, background: m.color, boxShadow: `0 0 8px ${m.color}60` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Solar Wind 3D */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-box">🌞</div>
          <div>
            <h3 className="text-white font-bold text-base">Solar Wind — 3D Simulation</h3>
            <p className="text-gray-500 text-xs">Sun → Earth · Live particle stream</p>
          </div>
        </div>
        <SolarWind3D />
      </div>

      {/* Detailed bars */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-box">📊</div>
          <div>
            <h3 className="text-white font-bold text-base">Detailed Analysis</h3>
            <p className="text-gray-500 text-xs">Current space environment indices</p>
          </div>
        </div>
        <div className="space-y-5">
          {[
            { label: 'Geomagnetic Storm (Kp Index)', pct: 35, color: '#fbbf24' },
            { label: 'Cosmic Radiation Flux', pct: 12, color: '#4ade80' },
            { label: 'Aurora Probability (60°N)', pct: 78, color: '#818cf8' },
            { label: 'Solar Proton Event Risk', pct: 22, color: '#f97316' },
          ].map(item => (
            <div key={item.label}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">{item.label}</span>
                <span style={{ color: item.color }} className="font-bold">{item.pct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${item.pct}%`, background: item.color, boxShadow: `0 0 8px ${item.color}40` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-5 p-4 rounded-2xl text-xs text-gray-500 leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          💡 <span className="text-gray-400 font-semibold">Aurora tip:</span> When Kp-index ≥ 5, auroras can be visible from latitudes as low as 50°N.
          Head to a dark location away from city lights for the best view.
        </div>
      </div>
    </div>
  )
}
