import { useState } from 'react'

const LANDING_SITES = [
  { id: 'shackleton', name: 'Shackleton Crater Rim', cx: 200, cy: 270, color: '#fbbf24', note: 'Artemis III primary site (2026). Permanently shadowed crater with water ice deposits. ~4.2km diameter.' },
  { id: 'gerlache',   name: 'De Gerlache Rim',       cx: 165, cy: 245, color: '#60a5fa', note: 'Artemis III alternate site. High elevation, near-permanent sunlight for solar power.' },
  { id: 'nobile',     name: 'Nobile Crater',          cx: 230, cy: 300, color: '#818cf8', note: 'Artemis IV site. Highest concentration of water ice in the polar region.' },
  { id: 'malapert',   name: 'Malapert Massif',        cx: 200, cy: 225, color: '#34d399', note: 'Artemis base camp candidate. High peak with Earth line-of-sight for comms.' },
  { id: 'gateway',    name: 'Lunar Gateway (Orbit)',   cx: 310, cy: 155, color: '#f87171', note: 'NRHO orbit station at ~70,000km × 3,000km. Hub for all Artemis missions.' },
]

export default function ArtemisMoonMap() {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedSite = LANDING_SITES.find(s => s.id === selected)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🌕</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Artemis Moon Map</h3>
          <p className="text-gray-500 text-xs">South Pole landing sites & Lunar Gateway</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}>
          NASA Artemis
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* SVG Map */}
        <div className="flex-shrink-0 flex justify-center">
          <svg width="380" height="380" viewBox="0 0 380 380" style={{ maxWidth: '100%' }}>
            <defs>
              <radialGradient id="moonGrad" cx="40%" cy="35%" r="60%">
                <stop offset="0%" stopColor="#d4d4d4" />
                <stop offset="60%" stopColor="#737373" />
                <stop offset="100%" stopColor="#2a2a2a" />
              </radialGradient>
              <radialGradient id="southPoleGrad" cx="50%" cy="100%" r="60%">
                <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#0a0a1a" stopOpacity="0.6" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Moon body */}
            <circle cx="190" cy="190" r="175" fill="url(#moonGrad)" />

            {/* South Pole shadow (permanently shadowed region) */}
            <ellipse cx="190" cy="340" rx="120" ry="40" fill="url(#southPoleGrad)" opacity="0.85" />

            {/* Craters (decorative) */}
            {[
              [100, 140, 30], [260, 120, 20], [150, 200, 15], [280, 220, 25],
              [130, 280, 18], [250, 310, 22], [190, 150, 12], [310, 170, 14],
            ].map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />
            ))}

            {/* South Pole label */}
            <text x="190" y="365" textAnchor="middle" fill="#60a5fa" fontSize="9" fontWeight="bold" opacity="0.8">
              SOUTH POLE
            </text>

            {/* Gateway orbit (dashed ellipse) */}
            <ellipse
              cx="190" cy="190" rx="155" ry="60"
              fill="none" stroke="#f87171" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6"
              transform="rotate(-20 190 190)"
            />
            <text x="330" y="130" fill="#f87171" fontSize="8" opacity="0.8">Gateway</text>
            <text x="330" y="140" fill="#f87171" fontSize="8" opacity="0.8">Orbit</text>

            {/* Landing sites */}
            {LANDING_SITES.filter(s => s.id !== 'gateway').map(site => (
              <g key={site.id} onClick={() => setSelected(selected === site.id ? null : site.id)} style={{ cursor: 'pointer' }}>
                <circle cx={site.cx} cy={site.cy} r={16} fill={site.color} opacity="0.12" />
                <circle
                  cx={site.cx} cy={site.cy} r={6}
                  fill={selected === site.id ? site.color : `${site.color}99`}
                  stroke={site.color}
                  strokeWidth="2"
                  filter="url(#glow)"
                />
                <text x={site.cx + 10} y={site.cy - 8} fill={site.color} fontSize="8" fontWeight="bold" opacity="0.9">
                  {site.name.split(' ')[0]}
                </text>
              </g>
            ))}

            {/* Gateway point */}
            <g onClick={() => setSelected(selected === 'gateway' ? null : 'gateway')} style={{ cursor: 'pointer' }}>
              <circle cx={310} cy={155} r={7} fill="#f87171" opacity="0.8" filter="url(#glow)" />
              <circle cx={310} cy={155} r={14} fill="#f87171" opacity="0.1" />
            </g>

            {/* Legend */}
            <g transform="translate(10, 340)">
              <rect x="0" y="0" width="110" height="28" rx="6" fill="rgba(0,0,0,0.5)" />
              <circle cx="12" cy="10" r="3" fill="#3b82f6" opacity="0.6" />
              <text x="20" y="14" fill="#9ca3af" fontSize="7">Shadowed (water ice)</text>
              <circle cx="12" cy="22" r="3" fill="#fbbf24" />
              <text x="20" y="26" fill="#9ca3af" fontSize="7">Landing sites</text>
            </g>
          </svg>
        </div>

        {/* Site info */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Tap a site for details</p>
            <div className="space-y-2">
              {LANDING_SITES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelected(selected === s.id ? null : s.id)}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all"
                  style={selected === s.id
                    ? { background: `${s.color}15`, border: `1px solid ${s.color}40` }
                    : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <p className="text-xs font-semibold" style={{ color: selected === s.id ? s.color : '#9ca3af' }}>{s.name}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedSite && (
            <div className="mt-3 p-3 rounded-xl" style={{ background: `${selectedSite.color}10`, border: `1px solid ${selectedSite.color}30` }}>
              <p className="font-bold text-sm mb-1" style={{ color: selectedSite.color }}>{selectedSite.name}</p>
              <p className="text-gray-400 text-xs leading-relaxed">{selectedSite.note}</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Artemis Timeline</p>
        <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[
            { year: '2022', label: 'Artemis I', note: 'Uncrewed Orion', done: true },
            { year: '2025', label: 'Artemis II', note: '4 crew orbit Moon', done: true },
            { year: '2026', label: 'Artemis III', note: 'First Moon landing since 1972', done: false },
            { year: '2028', label: 'Artemis IV', note: 'Gateway assembly begins', done: false },
            { year: '2030+', label: 'Artemis V+', note: 'Lunar base station', done: false },
          ].map((t, i, arr) => (
            <div key={t.year} className="flex flex-col items-center flex-1 min-w-0">
              <div className="flex items-center w-full">
                <div className="flex-1 h-0.5" style={{ background: i === 0 ? 'transparent' : t.done ? '#fbbf24' : 'rgba(255,255,255,0.08)' }} />
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.done ? '#fbbf24' : 'rgba(255,255,255,0.1)', border: '2px solid', borderColor: t.done ? '#fbbf24' : 'rgba(255,255,255,0.15)' }} />
                <div className="flex-1 h-0.5" style={{ background: i === arr.length - 1 ? 'transparent' : 'rgba(255,255,255,0.08)' }} />
              </div>
              <div className="text-center mt-1.5 px-1">
                <p className="text-[9px] font-bold" style={{ color: t.done ? '#fbbf24' : '#6b7280' }}>{t.year}</p>
                <p className="text-[8px] text-gray-400 font-semibold">{t.label}</p>
                <p className="text-[8px] text-gray-700 leading-tight hidden sm:block">{t.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
