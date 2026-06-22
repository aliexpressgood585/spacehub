import { useState } from 'react'

const BODIES: Record<string, {
  name: string; emoji: string; type: string; color: string
  radius: number; mass: number; gravity: number
  distFromEarth: number; distFromSun: number
  tempMin: number; tempMax: number; tempAvg: number
  age: number; moons: number; rings: boolean
  dayLength: number; yearLength: number
  atmosphere: { gas: string; pct: number }[]
  habitability: number
  mountain: { name: string; height: number } | null
  canyon: { name: string; depth: number } | null
  fact: string
}> = {
  sun:     { name:'Sun',     emoji:'☀️',  type:'Star',         color:'#ffaa00',
             radius:696340, mass:1.989e30, gravity:274,
             distFromEarth:150, distFromSun:0,
             tempMin:5500, tempMax:15000000, tempAvg:5778,
             age:4.6, moons:8, rings:false, dayLength:609, yearLength:0,
             atmosphere:[{gas:'Hydrogen',pct:73.5},{gas:'Helium',pct:24.9},{gas:'Other',pct:1.6}],
             habitability:0, mountain:null, canyon:null,
             fact:'The Sun contains 99.86% of all mass in the solar system.' },
  mercury: { name:'Mercury', emoji:'🪨',  type:'Rocky Planet',  color:'#9ca3af',
             radius:2439.7, mass:3.301e23, gravity:3.7,
             distFromEarth:92, distFromSun:57.9,
             tempMin:-180, tempMax:430, tempAvg:167,
             age:4.5, moons:0, rings:false, dayLength:1407.6, yearLength:88,
             atmosphere:[{gas:'Oxygen',pct:42},{gas:'Sodium',pct:29},{gas:'Hydrogen',pct:22},{gas:'Other',pct:7}],
             habitability:0,
             mountain:{name:'Caloris Basin peak',height:3},
             canyon:{name:'Caloris Basin',depth:3},
             fact:'A year on Mercury is shorter than a day on Mercury.' },
  venus:   { name:'Venus',   emoji:'🟡',  type:'Rocky Planet',  color:'#f59e0b',
             radius:6051.8, mass:4.867e24, gravity:8.87,
             distFromEarth:40, distFromSun:108.2,
             tempMin:437, tempMax:497, tempAvg:465,
             age:4.5, moons:0, rings:false, dayLength:5832.5, yearLength:225,
             atmosphere:[{gas:'CO₂',pct:96.5},{gas:'Nitrogen',pct:3.5}],
             habitability:0,
             mountain:{name:'Maxwell Montes',height:11},
             canyon:{name:'Diana Chasma',depth:4},
             fact:"Venus spins backwards — on Venus, the Sun rises in the west." },
  earth:   { name:'Earth',   emoji:'🌍',  type:'Rocky Planet',  color:'#3b82f6',
             radius:6371, mass:5.972e24, gravity:9.81,
             distFromEarth:0, distFromSun:149.6,
             tempMin:-89, tempMax:57, tempAvg:15,
             age:4.54, moons:1, rings:false, dayLength:24, yearLength:365,
             atmosphere:[{gas:'Nitrogen',pct:78.1},{gas:'Oxygen',pct:20.9},{gas:'Argon',pct:0.9},{gas:'CO₂',pct:0.04}],
             habitability:100,
             mountain:{name:'Mount Everest',height:8.85},
             canyon:{name:'Mariana Trench',depth:11},
             fact:'Earth is the only known planet with active plate tectonics and liquid oceans.' },
  mars:    { name:'Mars',    emoji:'🔴',  type:'Rocky Planet',  color:'#ef4444',
             radius:3389.5, mass:6.39e23, gravity:3.72,
             distFromEarth:225, distFromSun:227.9,
             tempMin:-87, tempMax:-5, tempAvg:-65,
             age:4.6, moons:2, rings:false, dayLength:24.6, yearLength:687,
             atmosphere:[{gas:'CO₂',pct:95.3},{gas:'Nitrogen',pct:2.7},{gas:'Argon',pct:1.6},{gas:'Other',pct:0.4}],
             habitability:1,
             mountain:{name:'Olympus Mons',height:21.9},
             canyon:{name:'Valles Marineris',depth:7},
             fact:'Olympus Mons is 3× taller than Everest — the tallest volcano in the solar system.' },
  jupiter: { name:'Jupiter', emoji:'🟠',  type:'Gas Giant',     color:'#f97316',
             radius:69911, mass:1.898e27, gravity:24.79,
             distFromEarth:628, distFromSun:778.5,
             tempMin:-145, tempMax:-108, tempAvg:-110,
             age:4.6, moons:95, rings:true, dayLength:9.93, yearLength:4333,
             atmosphere:[{gas:'Hydrogen',pct:89.8},{gas:'Helium',pct:10.2}],
             habitability:0, mountain:null, canyon:null,
             fact:'The Great Red Spot is a storm 1.3× Earth\'s size — raging for 350+ years.' },
  saturn:  { name:'Saturn',  emoji:'🪐',  type:'Gas Giant',     color:'#eab308',
             radius:58232, mass:5.683e26, gravity:10.44,
             distFromEarth:1275, distFromSun:1432,
             tempMin:-191, tempMax:-130, tempAvg:-178,
             age:4.5, moons:146, rings:true, dayLength:10.7, yearLength:10759,
             atmosphere:[{gas:'Hydrogen',pct:96.3},{gas:'Helium',pct:3.25},{gas:'Methane',pct:0.45}],
             habitability:0, mountain:null, canyon:null,
             fact:"Saturn's rings are 282,000 km wide but only ~10 meters thick. It would float on water!" },
  uranus:  { name:'Uranus',  emoji:'🔵',  type:'Ice Giant',     color:'#22d3ee',
             radius:25362, mass:8.681e25, gravity:8.87,
             distFromEarth:2724, distFromSun:2867,
             tempMin:-224, tempMax:-197, tempAvg:-224,
             age:4.5, moons:28, rings:true, dayLength:17.2, yearLength:30687,
             atmosphere:[{gas:'Hydrogen',pct:82.5},{gas:'Helium',pct:15.2},{gas:'Methane',pct:2.3}],
             habitability:0, mountain:null, canyon:null,
             fact:'Uranus rotates on its side (98° tilt) — it rolls around the Sun like a bowling ball.' },
  neptune: { name:'Neptune', emoji:'💙',  type:'Ice Giant',     color:'#6366f1',
             radius:24622, mass:1.024e26, gravity:11.15,
             distFromEarth:4351, distFromSun:4515,
             tempMin:-218, tempMax:-200, tempAvg:-214,
             age:4.5, moons:16, rings:true, dayLength:16.1, yearLength:60190,
             atmosphere:[{gas:'Hydrogen',pct:80},{gas:'Helium',pct:19},{gas:'Methane',pct:1}],
             habitability:0, mountain:null, canyon:null,
             fact:'Neptune has the fastest winds in the solar system — up to 2,100 km/h.' },
}

const SPACECRAFT = [
  { name: 'Artemis / SLS', speed: 40000,  emoji: '🚀', desc: 'NASA Moon rocket' },
  { name: 'Saturn V',       speed: 39000,  emoji: '🛸', desc: 'Apollo-era rocket' },
  { name: 'New Horizons',   speed: 58000,  emoji: '⚡', desc: 'Fastest probe to Pluto' },
  { name: 'Voyager 1',      speed: 61000,  emoji: '🌌', desc: 'Interstellar probe' },
  { name: 'Parker Solar Probe', speed: 692000, emoji: '☀️', desc: 'Fastest human-made object' },
]

function fmt(n: number, d = 2) {
  if (n >= 1e30) return `${(n/1e30).toFixed(2)} × 10³⁰`
  if (n >= 1e27) return `${(n/1e27).toFixed(2)} × 10²⁷`
  if (n >= 1e24) return `${(n/1e24).toFixed(2)} × 10²⁴`
  if (n >= 1e23) return `${(n/1e23).toFixed(2)} × 10²³`
  return n.toFixed(d)
}

function formatTravel(hours: number) {
  if (hours < 24) return `${Math.round(hours)}h`
  if (hours < 24 * 30) return `${Math.round(hours / 24)}d`
  if (hours < 24 * 365) return `${(hours / (24*30)).toFixed(1)} months`
  return `${(hours / (24*365)).toFixed(1)} years`
}

const PLANET_KEYS = ['sun','mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']

export default function PlanetExplorer() {
  const [sel, setSel] = useState('earth')
  const [tab, setTab] = useState<'overview'|'climate'|'geology'|'life'|'journey'>('overview')
  const [ship, setShip] = useState(0)

  const p = BODIES[sel]
  const travelH = p.distFromEarth > 0 ? (p.distFromEarth * 1e6) / SPACECRAFT[ship].speed : 0

  const habColor = p.habitability >= 80 ? '#4ade80' : p.habitability >= 20 ? '#fbbf24' : '#f87171'

  return (
    <div className="space-card overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="icon-box">🔭</div>
          <div>
            <h3 className="text-white font-bold text-base">Planet Explorer</h3>
            <p className="text-gray-500 text-xs">Temperature, geology, atmosphere & travel time</p>
          </div>
        </div>
      </div>

      {/* Planet selector */}
      <div className="px-5 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {PLANET_KEYS.map(key => {
            const b = BODIES[key]
            return (
              <button
                key={key}
                onClick={() => { setSel(key); setTab('overview') }}
                className="flex flex-col items-center gap-1 p-2.5 rounded-xl flex-shrink-0 transition-all"
                style={sel === key
                  ? { background: `${b.color}20`, border: `1px solid ${b.color}60` }
                  : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-xl">{b.emoji}</span>
                <span className="text-[9px] font-semibold" style={{ color: sel === key ? b.color : '#6b7280' }}>{b.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Planet hero */}
      <div className="px-5 pt-4">
        <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: `${p.color}10`, border: `1px solid ${p.color}30` }}>
          <div className="text-5xl">{p.emoji}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-white font-black text-xl">{p.name}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${p.color}25`, color: p.color }}>{p.type}</span>
              {p.rings && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>Has Rings</span>}
            </div>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">{p.fact}</p>
          </div>
        </div>
      </div>

      {/* Info tabs */}
      <div className="px-5 pt-4">
        <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {(['overview','climate','geology','life','journey'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-[11px] px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 transition-all capitalize"
              style={tab === t
                ? { background: `${p.color}20`, border: `1px solid ${p.color}50`, color: p.color }
                : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
            >
              { t === 'overview' ? '📊 Overview'
              : t === 'climate'  ? '🌡️ Climate'
              : t === 'geology'  ? '⛰️ Geology'
              : t === 'life'     ? '🧬 Habitability'
              :                    '🚀 Travel Time' }
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5 pt-4">

        {tab === 'overview' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Radius', val: `${p.radius.toLocaleString()} km`, icon: '📏' },
              { label: 'Mass', val: `${fmt(p.mass)} kg`, icon: '⚖️' },
              { label: 'Gravity', val: `${p.gravity} m/s²`, icon: '🌍' },
              { label: 'Moons', val: p.moons.toString(), icon: '🌙' },
              { label: 'Day Length', val: `${p.dayLength.toLocaleString()} hrs`, icon: '☀️' },
              { label: 'Year Length', val: p.yearLength > 0 ? `${p.yearLength.toLocaleString()} Earth days` : 'N/A', icon: '📅' },
              { label: 'Dist. from Sun', val: p.distFromSun > 0 ? `${p.distFromSun.toLocaleString()} M km` : 'Center', icon: '🌞' },
              { label: 'Dist. from Earth', val: p.distFromEarth > 0 ? `~${p.distFromEarth.toLocaleString()} M km` : 'Here!', icon: '🌍' },
              { label: 'Age', val: `${p.age} billion yrs`, icon: '⏳' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-xl mb-1">{s.icon}</div>
                <p className="text-white font-bold text-sm">{s.val}</p>
                <p className="text-gray-600 text-[9px] uppercase tracking-wider mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'climate' && (
          <div className="space-y-4">
            {/* Temperature */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">🌡️ Temperature Range</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: 'Min', val: `${p.tempMin}°C`, color: '#60a5fa' },
                  { label: 'Avg', val: `${p.tempAvg}°C`, color: p.color },
                  { label: 'Max', val: `${p.tempMax}°C`, color: '#f87171' },
                ].map(t => (
                  <div key={t.label} className="text-center">
                    <p className="text-lg font-black" style={{ color: t.color }}>{t.val}</p>
                    <p className="text-gray-600 text-[9px] uppercase tracking-wider">{t.label}</p>
                  </div>
                ))}
              </div>
              {/* Temp bar */}
              <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, #60a5fa, ${p.color}, #f87171)` }} />
              </div>
            </div>
            {/* Atmosphere */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">🌬️ Atmosphere Composition</p>
              <div className="space-y-2">
                {p.atmosphere.map((a, i) => {
                  const colors = [p.color, '#a78bfa', '#34d399', '#f87171', '#fbbf24']
                  return (
                    <div key={a.gas}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">{a.gas}</span>
                        <span className="font-bold" style={{ color: colors[i % colors.length] }}>{a.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(a.pct, 100)}%`, background: colors[i % colors.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'geology' && (
          <div className="space-y-3">
            {p.mountain ? (
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">⛰️ Highest Mountain</p>
                <div className="flex items-end gap-4">
                  <div>
                    <p className="text-white font-bold text-lg">{p.mountain.name}</p>
                    <p className="text-3xl font-black mt-1" style={{ color: p.color }}>{p.mountain.height} km</p>
                    <p className="text-gray-500 text-xs mt-1">
                      {p.mountain.height > 8.85
                        ? `${(p.mountain.height / 8.85).toFixed(1)}× taller than Everest`
                        : p.mountain.height === 8.85
                        ? 'This IS Everest 🏔️'
                        : `${(8.85 / p.mountain.height).toFixed(1)}× shorter than Everest`}
                    </p>
                  </div>
                  {/* Visual bar */}
                  <div className="flex items-end gap-2 h-24 flex-1">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-6 rounded-t-sm" style={{ height: `${Math.min(p.mountain.height / 25 * 80, 80)}px`, background: p.color }} />
                      <span className="text-[8px] text-gray-600">{p.name}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-6 rounded-t-sm" style={{ height: `${8.85 / 25 * 80}px`, background: '#6b7280' }} />
                      <span className="text-[8px] text-gray-600">Everest</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl p-4 text-center text-gray-600" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-2xl mb-2">🌊</p>
                <p className="text-sm">No solid surface — gas/ice giant</p>
              </div>
            )}
            {p.canyon && (
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">🕳️ Deepest Canyon</p>
                <p className="text-white font-bold">{p.canyon.name}</p>
                <p className="text-3xl font-black mt-1" style={{ color: '#60a5fa' }}>{p.canyon.depth} km deep</p>
                <p className="text-gray-500 text-xs mt-1">
                  {p.canyon.depth > 11
                    ? `${(p.canyon.depth / 11).toFixed(1)}× deeper than Mariana Trench`
                    : p.canyon.depth === 11
                    ? 'Same as Mariana Trench depth'
                    : `${(11 / p.canyon.depth).toFixed(1)}× shallower than Mariana Trench`}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'life' && (
          <div className="space-y-4">
            <div className="rounded-xl p-5 text-center" style={{ background: `${habColor}10`, border: `1px solid ${habColor}30` }}>
              <p className="text-5xl font-black" style={{ color: habColor }}>{p.habitability}%</p>
              <p className="text-white font-semibold mt-1">Habitability Score</p>
              <div className="mt-3 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${p.habitability}%`, background: habColor }} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                { label: 'Liquid Water', ok: p.name === 'Earth', note: p.name === 'Earth' ? 'Abundant oceans' : p.name === 'Mars' ? 'Subsurface ice detected' : 'None detected' },
                { label: 'Breathable Atmosphere', ok: p.name === 'Earth', note: p.name === 'Earth' ? '21% O₂' : `${p.atmosphere[0]?.gas ?? 'Unknown'} dominant` },
                { label: 'Moderate Temperature', ok: p.name === 'Earth', note: `Avg ${p.tempAvg}°C` },
                { label: 'Magnetic Field', ok: ['Earth','Mercury','Jupiter','Saturn','Uranus','Neptune'].includes(p.name), note: ['Earth','Mercury','Jupiter','Saturn','Uranus','Neptune'].includes(p.name) ? 'Detected' : 'Absent/weak' },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-lg">{c.ok ? '✅' : '❌'}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{c.label}</p>
                    <p className="text-xs text-gray-500">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'journey' && (
          <div className="space-y-4">
            {p.distFromEarth > 0 ? (
              <>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Select spacecraft</p>
                <div className="space-y-2">
                  {SPACECRAFT.map((s, i) => (
                    <button
                      key={s.name}
                      onClick={() => setShip(i)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={ship === i
                        ? { background: `${p.color}15`, border: `1px solid ${p.color}40` }
                        : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="text-xl">{s.emoji}</span>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-bold text-white">{s.name}</p>
                        <p className="text-xs text-gray-600">{s.speed.toLocaleString()} km/h · {s.desc}</p>
                      </div>
                      {ship === i && (
                        <div className="text-right">
                          <p className="font-black text-lg" style={{ color: p.color }}>{formatTravel(travelH)}</p>
                          <p className="text-[9px] text-gray-600">travel time</p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="rounded-xl p-4 text-center" style={{ background: `${p.color}10`, border: `1px solid ${p.color}30` }}>
                  <p className="text-gray-400 text-xs mb-1">Distance: ~{p.distFromEarth.toLocaleString()} million km</p>
                  <p className="text-3xl font-black" style={{ color: p.color }}>{formatTravel(travelH)}</p>
                  <p className="text-gray-400 text-sm mt-0.5">aboard {SPACECRAFT[ship].name}</p>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-4xl mb-3">🌍</p>
                <p>You're already here! Earth is home.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
