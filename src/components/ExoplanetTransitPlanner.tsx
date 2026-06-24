import { useState, useMemo } from 'react'

// ── Transit dataset (T0 in JD, period in days, duration in hours) ──────────
const EXOPLANETS = [
  { name:'HD 209458 b', nick:'Osiris',      host:'HD 209458',  hostMag:7.65,  ra:22.085, dec:18.88,  T0:2452826.6298, P:3.52474859,  dur:2.47, depth:14.7, Rp:1.38, Mp:0.69, dist:'159 ly',  type:'Hot Jupiter', desc:'First exoplanet with detected atmosphere; sodium & oxygen found in its extended cloud tail' },
  { name:'HD 189733 b', nick:'',            host:'HD 189733',  hostMag:7.68,  ra:20.006, dec:22.71,  T0:2453955.5256, P:2.21857567,  dur:1.83, depth:25.5, Rp:1.14, Mp:1.14, dist:'63 ly',   type:'Hot Jupiter', desc:'Best-studied exoplanet; blue due to silicate rain; HD 189733 A is a K dwarf' },
  { name:'WASP-17 b',  nick:'',            host:'WASP-17',    hostMag:11.6,  ra:15.974, dec:-28.07, T0:2454592.8015, P:3.73543690,  dur:4.10, depth:17.5, Rp:1.89, Mp:0.49, dist:'1000 ly', type:'Inflated HJ', desc:'One of the largest known exoplanets; retrograde orbit suggests a violent past' },
  { name:'WASP-39 b',  nick:'Bocaprins',   host:'WASP-39',    hostMag:12.1,  ra:14.291, dec:-3.44,  T0:2454294.5387, P:4.05528950,  dur:2.88, depth:8.5,  Rp:1.27, Mp:0.28, dist:'700 ly',  type:'Hot Saturn',  desc:'JWST detected CO₂, SO₂, water & clouds; most atmospherically characterised exoplanet' },
  { name:'TrES-2 b',   nick:'',            host:'TrES-2',     hostMag:11.4,  ra:19.228, dec:49.32,  T0:2454279.4367, P:2.47062160,  dur:1.72, depth:15.7, Rp:1.27, Mp:1.20, dist:'750 ly',  type:'Hot Jupiter', desc:'Darkest known exoplanet; absorbs 99% of incident light; inside Kepler FOV' },
  { name:'HAT-P-7 b',  nick:'Bhaskara',    host:'HAT-P-7',    hostMag:10.5,  ra:19.528, dec:47.97,  T0:2454954.3575, P:2.20473570,  dur:4.04, depth:6.1,  Rp:1.43, Mp:1.78, dist:'1040 ly', type:'Hot Jupiter', desc:'JWST detected silicate clouds that rain iron and corundum (ruby) on the night side' },
  { name:'GJ 1214 b',  nick:'',            host:'GJ 1214',    hostMag:14.67, ra:17.201, dec:4.97,   T0:2454966.5252, P:1.58040464,  dur:0.83, depth:14.7, Rp:2.68, Mp:6.55, dist:'47 ly',   type:'Super-Earth',  desc:'A water-world candidate; dense steam atmosphere detected by Hubble & JWST' },
  { name:'KELT-9 b',   nick:'',            host:'KELT-9',     hostMag:7.56,  ra:20.535, dec:39.87,  T0:2457095.6858, P:1.48111870,  dur:3.55, depth:5.8,  Rp:1.89, Mp:2.88, dist:'670 ly',  type:'Ultra-hot HJ', desc:'Hottest known exoplanet (4300K day-side); metal atoms vaporise in its atmosphere' },
  { name:'WASP-12 b',  nick:'',            host:'WASP-12',    hostMag:11.7,  ra:6.508,  dec:29.67,  T0:2454508.9769, P:1.09142030,  dur:3.05, depth:13.2, Rp:1.90, Mp:1.47, dist:'870 ly',  type:'Hot Jupiter', desc:'Being tidally disrupted; losing 189,000 tonnes per second to its host star' },
  { name:'55 Cnc e',   nick:'Janssen',     host:'55 Cancri A', hostMag:5.95, ra:8.973,  dec:28.33,  T0:2456305.9313, P:0.73654910,  dur:1.56, depth:0.4,  Rp:1.88, Mp:8.08, dist:'41 ly',   type:'Super-Earth',  desc:'Lava world — surface may be molten magma; completes a year in 17.7 hours' },
  { name:'Kepler-7 b', nick:'',            host:'Kepler-7',   hostMag:12.9,  ra:19.139, dec:41.09,  T0:2454530.6512, P:4.88549200,  dur:5.02, depth:8.5,  Rp:1.61, Mp:0.44, dist:'3000 ly', type:'Hot Jupiter', desc:'Lowest density exoplanet; reflected light map revealed permanent cloud bank on west side' },
  { name:'TOI-700 d',  nick:'',            host:'TOI-700',    hostMag:13.1,  ra:5.033,  dec:-65.58, T0:2458342.4283, P:37.42390000, dur:2.74, depth:2.0,  Rp:1.14, Mp:1.72, dist:'101 ly',  type:'Earth-size',   desc:'First potentially habitable TESS planet; in the habitable zone of an M-dwarf' },
]

function jdNow() {
  return Date.now() / 86400000 + 2440587.5
}

function nextTransits(T0: number, period: number, lookAheadDays = 7): number[] {
  const jd = jdNow()
  const n0 = Math.ceil((jd - T0) / period)
  const result: number[] = []
  for (let n = n0; n < n0 + Math.ceil(lookAheadDays / period) + 2; n++) {
    const t = T0 + n * period
    if (t >= jd && t <= jd + lookAheadDays) result.push(t)
  }
  return result
}

function jdToLocal(jd: number) {
  const ms = (jd - 2440587.5) * 86400000
  return new Date(ms)
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtHrs(h: number) {
  const hr = Math.floor(h); const min = Math.round((h - hr) * 60)
  return hr > 0 ? `${hr}h ${min}m` : `${min}m`
}
function fmtCountdown(jd: number) {
  const ms = (jd - jdNow()) * 86400000
  if (ms < 0) return 'Ended'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}

const TYPE_COLOR: Record<string, string> = {
  'Hot Jupiter':'#f97316','Inflated HJ':'#fb923c','Ultra-hot HJ':'#ef4444',
  'Hot Saturn':'#facc15','Super-Earth':'#34d399','Earth-size':'#60a5fa',
}

type FilterType = 'all' | 'tonight' | '7days'

export default function ExoplanetTransitPlanner() {
  const [filter, setFilter]     = useState<FilterType>('tonight')
  const [selected, setSelected] = useState<typeof EXOPLANETS[0] | null>(null)
  const [showAll, setShowAll]   = useState(false)

  const transits = useMemo(() => {
    const jd = jdNow()
    const lookAhead = filter === 'tonight' ? 1 : 7
    return EXOPLANETS.flatMap(p => {
      return nextTransits(p.T0, p.P, lookAhead).map(midJD => ({
        planet: p,
        midJD,
        startJD: midJD - p.dur / 48,
        endJD:   midJD + p.dur / 48,
        hoursAway: (midJD - jd) * 24,
        inProgress: midJD - p.dur / 48 < jd && midJD + p.dur / 48 > jd,
      }))
    }).sort((a, b) => a.midJD - b.midJD)
  }, [filter])

  const tonightCount = useMemo(() => {
    return EXOPLANETS.flatMap(p => nextTransits(p.T0, p.P, 1)).length
  }, [])

  return (
    <div className="space-card p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-box text-2xl">🔭</div>
        <div>
          <h3 className="text-white font-bold text-lg">Exoplanet Transit Planner</h3>
          <p className="text-gray-500 text-xs">When exoplanets cross their host star — live predictions for {EXOPLANETS.length} worlds</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs font-bold text-emerald-400">{tonightCount} transit{tonightCount !== 1 ? 's' : ''}</div>
          <div className="text-xs text-gray-500">in next 24h</div>
        </div>
      </div>

      {/* Explainer */}
      <div className="mb-4 px-3 py-2 rounded-xl text-xs text-gray-400 leading-relaxed" style={{ background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.15)' }}>
        A <strong style={{color:'#a5b4fc'}}>transit</strong> happens when an exoplanet passes in front of its star, causing a tiny dip in brightness. Astronomers measure this dip to determine the planet's size, atmosphere, and composition.
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['tonight','7days','all'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition"
            style={{ background: filter===f ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', color: filter===f ? '#a5b4fc' : '#6b7280', border:`1px solid ${filter===f ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
            {f==='tonight' ? '🌙 Tonight' : f==='7days' ? '📅 7 Days' : '🌌 All Planets'}
          </button>
        ))}
      </div>

      {filter === 'all' ? (
        /* Full catalog */
        <div className="grid grid-cols-1 gap-2">
          {EXOPLANETS.map(p => {
            const next = nextTransits(p.T0, p.P, 30)[0]
            const nextDate = next ? jdToLocal(next) : null
            const col = TYPE_COLOR[p.type] ?? '#94a3b8'
            return (
              <div key={p.name} onClick={() => setSelected(selected?.name === p.name ? null : p)}
                className="rounded-xl px-3 py-2.5 flex items-start gap-3 cursor-pointer transition"
                style={{ background: selected?.name===p.name ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)', border:`1px solid ${selected?.name===p.name ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)'}` }}>
                <div style={{ minWidth:52 }}>
                  <div className="text-xs font-bold" style={{color:col}}>{p.type}</div>
                  <div className="text-xs text-gray-600">P = {p.P.toFixed(2)}d</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white">{p.name}{p.nick && <span className="text-xs text-gray-500 ml-1">"{p.nick}"</span>}</div>
                  <div className="text-xs text-gray-500">{p.host} · mag {p.hostMag} · {p.dist}</div>
                  {selected?.name===p.name && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{p.desc}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-bold text-violet-300">{nextDate ? fmtDate(nextDate) : '—'}</div>
                  <div className="text-xs text-gray-600">{next ? fmtCountdown(next) : ''}</div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Transit list */
        transits.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No transits in this window.</p>
            <p className="text-gray-600 text-xs mt-1">Try "7 Days" to see upcoming events.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(showAll ? transits : transits.slice(0, 8)).map((t, i) => {
              const col   = TYPE_COLOR[t.planet.type] ?? '#94a3b8'
              const start = jdToLocal(t.startJD), mid = jdToLocal(t.midJD), end = jdToLocal(t.endJD)
              return (
                <div key={i} onClick={() => setSelected(selected?.name===t.planet.name ? null : t.planet)}
                  className="rounded-xl p-3 cursor-pointer transition"
                  style={{ background: t.inProgress ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.03)', border:`1px solid ${t.inProgress ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  <div className="flex items-start gap-3">
                    {/* Time column */}
                    <div style={{ minWidth:50, textAlign:'center', flexShrink:0 }}>
                      {t.inProgress && <div className="text-xs font-bold text-emerald-400 mb-0.5">● LIVE</div>}
                      <div className="text-xs font-bold" style={{color:'#c4b5fd'}}>{fmtTime(mid)}</div>
                      <div className="text-xs text-gray-600">{fmtDate(mid)}</div>
                    </div>
                    {/* Planet info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white">{t.planet.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold" style={{background:`${col}18`,color:col,fontSize:9}}>{t.planet.type}</span>
                        {t.planet.nick && <span className="text-xs text-gray-600">"{t.planet.nick}"</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t.planet.host} · mag {t.planet.hostMag} · {t.planet.dist}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                        <span>🕐 Start: {fmtTime(start)}</span>
                        <span>🕑 End: {fmtTime(end)}</span>
                        <span>⏱ {fmtHrs(t.planet.dur)}</span>
                      </div>
                      {selected?.name===t.planet.name && (
                        <p className="text-xs text-gray-400 mt-2 leading-relaxed">{t.planet.desc}</p>
                      )}
                    </div>
                    {/* Stats */}
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-bold text-yellow-400">{t.planet.depth.toFixed(1)} mmag</div>
                      <div className="text-xs text-gray-600">depth</div>
                      <div className="text-xs font-semibold mt-1" style={{color:'#a5b4fc'}}>{t.planet.Rp}R⊕</div>
                      <div className="text-xs text-gray-600">radius</div>
                    </div>
                  </div>
                </div>
              )
            })}
            {transits.length > 8 && !showAll && (
              <button onClick={() => setShowAll(true)} className="text-xs text-violet-400 mt-1 text-center hover:text-violet-300">
                Show {transits.length - 8} more transits →
              </button>
            )}
          </div>
        )
      )}

      <p className="text-gray-700 text-xs text-center mt-4">
        Times are in your local timezone · mmag = millimagnitude brightness dip · Click any row for details
      </p>
    </div>
  )
}
