import { useState, useEffect } from 'react'

interface Exoplanet {
  pl_name: string
  hostname: string
  pl_rade: number | null   // Earth radii
  pl_masse: number | null  // Earth masses
  pl_eqt: number | null    // Equilibrium temperature (K)
  pl_orbsmax: number | null // Semi-major axis (AU)
  sy_dist: number | null   // Distance (parsecs)
}

const FALLBACK: Exoplanet[] = [
  { pl_name:'Kepler-442b',  hostname:'Kepler-442',  pl_rade:1.34, pl_masse:2.3,  pl_eqt:233, pl_orbsmax:0.409, sy_dist:342  },
  { pl_name:'TOI-700 d',    hostname:'TOI-700',     pl_rade:1.14, pl_masse:1.72, pl_eqt:246, pl_orbsmax:0.163, sy_dist:31.1 },
  { pl_name:'Kepler-1649c', hostname:'Kepler-1649', pl_rade:1.06, pl_masse:1.2,  pl_eqt:234, pl_orbsmax:0.0649,sy_dist:301  },
  { pl_name:'GJ 667C c',    hostname:'GJ 667C',     pl_rade:1.54, pl_masse:3.8,  pl_eqt:277, pl_orbsmax:0.125, sy_dist:6.8  },
  { pl_name:'Trappist-1e',  hostname:'TRAPPIST-1',  pl_rade:0.92, pl_masse:0.77, pl_eqt:251, pl_orbsmax:0.0293,sy_dist:12.4 },
  { pl_name:'Trappist-1f',  hostname:'TRAPPIST-1',  pl_rade:1.04, pl_masse:1.04, pl_eqt:219, pl_orbsmax:0.0385,sy_dist:12.4 },
  { pl_name:'Kepler-62f',   hostname:'Kepler-62',   pl_rade:1.41, pl_masse:2.8,  pl_eqt:208, pl_orbsmax:0.718, sy_dist:368  },
  { pl_name:'K2-72 e',      hostname:'K2-72',       pl_rade:1.29, pl_masse:2.2,  pl_eqt:249, pl_orbsmax:0.106, sy_dist:67   },
]

function habitScore(p: Exoplanet): number {
  let score = 0
  if (p.pl_eqt && p.pl_eqt >= 200 && p.pl_eqt <= 320) score += 40
  if (p.pl_rade && p.pl_rade >= 0.5 && p.pl_rade <= 1.6) score += 40
  if (p.pl_masse && p.pl_masse <= 5) score += 20
  return score
}

function tempC(k: number | null) {
  if (k === null) return '?'
  return `${Math.round(k - 273.15)}°C`
}

function lyFromParsec(pc: number | null) {
  if (!pc) return '?'
  return `${Math.round(pc * 3.26).toLocaleString()} ly`
}

export default function ExoplanetExplorer() {
  const [planets, setPlanets] = useState<Exoplanet[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Exoplanet | null>(null)

  useEffect(() => {
    const q = encodeURIComponent(
      "SELECT TOP 30 pl_name,hostname,pl_rade,pl_masse,pl_eqt,pl_orbsmax,sy_dist " +
      "FROM pscomppars WHERE pl_eqt BETWEEN 200 AND 320 AND pl_rade BETWEEN 0.5 AND 2.0 " +
      "AND pl_masse < 8 ORDER BY pl_rade"
    )
    fetch(`https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${q}&format=json&lang=ADQL`)
      .then(r => { if (!r.ok) throw new Error(''); return r.json() })
      .then((data: Exoplanet[]) => {
        setPlanets(data.length > 0 ? data.slice(0, 12) : FALLBACK)
        setLoading(false)
      })
      .catch(() => { setPlanets(FALLBACK); setLoading(false) })
  }, [])

  const sel = selected ?? planets[0]

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🌌</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Exoplanet Explorer</h3>
          <p className="text-gray-500 text-xs">Earth-like worlds beyond our solar system</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
          NASA Archive
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_,i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4">
          {/* List */}
          <div className="flex-shrink-0 w-full md:w-56 space-y-1.5 max-h-80 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {planets.map(p => {
              const hs = habitScore(p)
              const isSel = sel?.pl_name === p.pl_name
              return (
                <button
                  key={p.pl_name}
                  onClick={() => setSelected(p)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl text-left transition-all"
                  style={isSel
                    ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }
                    : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                    background: hs >= 80 ? '#4ade80' : hs >= 60 ? '#fbbf24' : '#f87171'
                  }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{p.pl_name}</p>
                    <p className="text-[9px] text-gray-600 truncate">{p.hostname}</p>
                  </div>
                  <span className="text-[9px] font-bold" style={{ color: hs >= 80 ? '#4ade80' : hs >= 60 ? '#fbbf24' : '#f87171' }}>{hs}%</span>
                </button>
              )
            })}
          </div>

          {/* Detail */}
          {sel && (
            <div className="flex-1 space-y-3">
              <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-white font-black text-lg">{sel.pl_name}</p>
                    <p className="text-indigo-300 text-xs">Star: {sel.hostname}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black" style={{ color: habitScore(sel) >= 80 ? '#4ade80' : habitScore(sel) >= 60 ? '#fbbf24' : '#f87171' }}>
                      {habitScore(sel)}%
                    </p>
                    <p className="text-[9px] text-gray-500">habitability</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Size', val: sel.pl_rade ? `${sel.pl_rade.toFixed(2)}× Earth` : '?' },
                    { label: 'Mass', val: sel.pl_masse ? `${sel.pl_masse.toFixed(2)}× Earth` : '?' },
                    { label: 'Temp', val: tempC(sel.pl_eqt) },
                    { label: 'Orbit', val: sel.pl_orbsmax ? `${sel.pl_orbsmax.toFixed(3)} AU` : '?' },
                    { label: 'Distance', val: lyFromParsec(sel.sy_dist) },
                    { label: 'In Hab. Zone', val: sel.pl_eqt && sel.pl_eqt >= 200 && sel.pl_eqt <= 320 ? '✅ Yes' : '❌ No' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <p className="text-white text-xs font-semibold">{s.val}</p>
                      <p className="text-gray-600 text-[9px]">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Habitability Factors</p>
                {[
                  { label: 'Temperature in liquid water range', ok: !!sel.pl_eqt && sel.pl_eqt >= 200 && sel.pl_eqt <= 320 },
                  { label: 'Earth-like size (0.5–1.6× Earth)', ok: !!sel.pl_rade && sel.pl_rade >= 0.5 && sel.pl_rade <= 1.6 },
                  { label: 'Rocky planet mass (< 5× Earth)', ok: !!sel.pl_masse && sel.pl_masse < 5 },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2 py-1">
                    <span className="text-sm">{f.ok ? '✅' : '❌'}</span>
                    <span className="text-xs text-gray-400">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-700 mt-4 text-center">
        Data: NASA Exoplanet Archive · {planets.length} potentially habitable worlds found
      </p>
    </div>
  )
}
