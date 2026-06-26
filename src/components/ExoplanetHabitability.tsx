import { useState, useMemo } from 'react'

interface Exoplanet {
  id: string
  name: string
  star: string
  icon: string
  color: string
  distanceLy: number
  discovered: number
  by: string
  mass: number       // Earth masses
  radius: number     // Earth radii
  orbitalPeriodDays: number
  tempK: number      // equilibrium temperature
  esi: number        // Earth Similarity Index 0-1
  inHabitableZone: boolean
  hasAtmosphere: boolean | null
  waterPossible: boolean
  starType: string
  starAge: number    // billion years
  category: 'rocky' | 'super-earth' | 'mini-neptune' | 'gas-giant'
  lifeScore: number  // 0-100
  lifeReason: string
  dealBreaker: string | null
  funFact: string
  missionStatus?: 'confirmed' | 'candidate' | 'targeted'
}

const PLANETS: Exoplanet[] = [
  {
    id: 'proxima_b',
    name: 'Proxima Centauri b',
    star: 'Proxima Centauri',
    icon: '🟠',
    color: '#f97316',
    distanceLy: 4.24,
    discovered: 2016,
    by: 'ESO / HARPS',
    mass: 1.17,
    radius: 1.1,
    orbitalPeriodDays: 11.2,
    tempK: 234,
    esi: 0.87,
    inHabitableZone: true,
    hasAtmosphere: null,
    waterPossible: true,
    starType: 'Red Dwarf (M5.5)',
    starAge: 4.8,
    category: 'rocky',
    lifeScore: 63,
    lifeReason: 'Best Earth-size planet in habitable zone of nearest star. Mass and orbit ideal.',
    dealBreaker: 'Tidally locked? Stellar flares? Atmosphere may have been stripped by radiation.',
    funFact: 'If it has life, beings there could theoretically detect Earth\'s TV signals from ~4 years ago.'
  },
  {
    id: 'trappist_1e',
    name: 'TRAPPIST-1e',
    star: 'TRAPPIST-1',
    icon: '🔵',
    color: '#3b82f6',
    distanceLy: 39,
    discovered: 2017,
    by: 'Spitzer / Hubble',
    mass: 0.69,
    radius: 0.92,
    orbitalPeriodDays: 6.1,
    tempK: 251,
    esi: 0.91,
    inHabitableZone: true,
    hasAtmosphere: null,
    waterPossible: true,
    starType: 'Red Dwarf (M8)',
    starAge: 7.6,
    category: 'rocky',
    lifeScore: 78,
    lifeReason: 'Highest ESI of any known exoplanet. Size, mass, and temperature nearly identical to Earth.',
    dealBreaker: 'Tidally locked — one side permanent day, one permanent night. Extreme flaring from host star.',
    funFact: 'TRAPPIST-1 system has 7 Earth-sized planets. Three (d, e, f) are in the habitable zone — more potentially habitable planets than our solar system has total.'
  },
  {
    id: 'trappist_1d',
    name: 'TRAPPIST-1d',
    star: 'TRAPPIST-1',
    icon: '🟢',
    color: '#22c55e',
    distanceLy: 39,
    discovered: 2016,
    by: 'TRAPPIST telescope',
    mass: 0.30,
    radius: 0.77,
    orbitalPeriodDays: 4.05,
    tempK: 288,
    esi: 0.86,
    inHabitableZone: true,
    hasAtmosphere: null,
    waterPossible: true,
    starType: 'Red Dwarf (M8)',
    starAge: 7.6,
    category: 'rocky',
    lifeScore: 71,
    lifeReason: 'Warmest TRAPPIST habitable zone planet. Temperature closest to Earth\'s average of 288K.',
    dealBreaker: 'Very low mass — may struggle to retain atmosphere. Orbital resonance causes periodic heating.',
    funFact: 'TRAPPIST-1d completes an orbit in just 4 days. A "year" passes every 4 Earth days.'
  },
  {
    id: 'kepler_442b',
    name: 'Kepler-442b',
    star: 'Kepler-442',
    icon: '🟡',
    color: '#fbbf24',
    distanceLy: 1206,
    discovered: 2015,
    by: 'Kepler Space Telescope',
    mass: 2.3,
    radius: 1.34,
    orbitalPeriodDays: 112.3,
    tempK: 233,
    esi: 0.84,
    inHabitableZone: true,
    hasAtmosphere: null,
    waterPossible: true,
    starType: 'Orange Dwarf (K5)',
    starAge: 2.9,
    category: 'super-earth',
    lifeScore: 69,
    lifeReason: 'One of the highest-scored habitable zone planets. Orbits a stable, Sun-like star.',
    dealBreaker: 'Only 60% of Earth\'s sunlight — needs greenhouse effect. Star is young and less stable.',
    funFact: 'Receives about 70% as much energy from its star as Earth gets from the Sun — potentially chilly but livable.'
  },
  {
    id: 'kepler_452b',
    name: 'Kepler-452b',
    star: 'Kepler-452',
    icon: '🌍',
    color: '#06b6d4',
    distanceLy: 1402,
    discovered: 2015,
    by: 'Kepler Space Telescope',
    mass: 5.0,
    radius: 1.63,
    orbitalPeriodDays: 384.8,
    tempK: 265,
    esi: 0.83,
    inHabitableZone: true,
    hasAtmosphere: null,
    waterPossible: true,
    starType: 'Sun-like (G2)',
    starAge: 6.0,
    category: 'super-earth',
    lifeScore: 74,
    lifeReason: 'Orbits a Sun-twin in the exact habitable zone. Nearly identical orbital period to Earth.',
    dealBreaker: 'Mass 5× Earth = much stronger gravity and likely thick atmosphere. May be more ocean world.',
    funFact: '"Earth\'s Cousin" — its star is nearly identical to our Sun, 1.5 billion years older. If life started there when life started on Earth, it\'s 1.5B years ahead of us.'
  },
  {
    id: 'gliese_667c',
    name: 'Gliese 667Cc',
    star: 'Gliese 667C',
    icon: '🔴',
    color: '#ef4444',
    distanceLy: 23.6,
    discovered: 2011,
    by: 'ESO / HARPS',
    mass: 3.8,
    radius: 1.5,
    orbitalPeriodDays: 28.1,
    tempK: 277,
    esi: 0.82,
    inHabitableZone: true,
    hasAtmosphere: null,
    waterPossible: true,
    starType: 'Red Dwarf (M1.5)',
    starAge: 5.0,
    category: 'super-earth',
    lifeScore: 61,
    lifeReason: 'Close to Earth, habitable zone, receives similar energy as Earth from the Sun.',
    dealBreaker: 'Part of a triple star system — variable radiation. Likely tidally locked.',
    funFact: 'Three stars in the sky! Gliese 667Cc would have a complex sky with three distinct stars at different brightness levels.'
  },
  {
    id: 'toi_700d',
    name: 'TOI-700d',
    star: 'TOI-700',
    icon: '🟣',
    color: '#a855f7',
    distanceLy: 101.4,
    discovered: 2020,
    by: 'TESS Space Telescope',
    mass: 1.72,
    radius: 1.19,
    orbitalPeriodDays: 37.4,
    tempK: 268,
    esi: 0.86,
    inHabitableZone: true,
    hasAtmosphere: null,
    waterPossible: true,
    starType: 'Red Dwarf (M2)',
    starAge: 1.5,
    category: 'rocky',
    lifeScore: 66,
    lifeReason: 'TESS-confirmed rocky planet in exact habitable zone. Climate models show possible liquid water.',
    dealBreaker: 'Young star (1.5B years) — active, intense radiation. Life may not have had time to evolve.',
    funFact: 'NASA ran climate simulations showing TOI-700d could have breathable air and liquid oceans under certain atmospheric conditions.'
  },
  {
    id: 'lhs_1140b',
    name: 'LHS 1140b',
    star: 'LHS 1140',
    icon: '💎',
    color: '#6366f1',
    distanceLy: 48.7,
    discovered: 2017,
    by: 'MEarth Project',
    mass: 6.98,
    radius: 1.73,
    orbitalPeriodDays: 24.7,
    tempK: 230,
    esi: 0.76,
    inHabitableZone: true,
    hasAtmosphere: true,
    waterPossible: true,
    starType: 'Red Dwarf (M4.5)',
    starAge: 5.0,
    category: 'super-earth',
    lifeScore: 70,
    lifeReason: 'JWST detected possible atmosphere — CO₂ or N₂. Top target for biosignature search.',
    dealBreaker: 'High gravity (2.3× Earth). May be water world with no land.',
    funFact: 'LHS 1140b is one of the top 3 JWST biosignature targets. In 2024, JWST found hints of a possible atmosphere — potentially the most exciting result in exoplanet science.'
  },
]

const ESI_LABEL = (esi: number) => {
  if (esi >= 0.9) return { label: 'Earth Twin', color: '#22c55e' }
  if (esi >= 0.8) return { label: 'Earth-like', color: '#86efac' }
  if (esi >= 0.6) return { label: 'Habitable?', color: '#fbbf24' }
  return { label: 'Unlikely', color: '#ef4444' }
}

const SCORE_COLOR = (s: number) =>
  s >= 70 ? '#22c55e' : s >= 50 ? '#fbbf24' : '#ef4444'

function ScoreMeter({ score, color }: { score: number; color: string }) {
  return (
    <div className="relative h-4 bg-gray-900 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{ width: `${score}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-black text-white drop-shadow">{score}/100</span>
      </div>
    </div>
  )
}

export default function ExoplanetHabitability() {
  const [selected, setSelected] = useState<Exoplanet>(PLANETS[1])
  const [sort, setSort] = useState<'esi' | 'life' | 'distance'>('life')

  const sorted = useMemo(() => {
    return [...PLANETS].sort((a, b) =>
      sort === 'esi' ? b.esi - a.esi :
      sort === 'life' ? b.lifeScore - a.lifeScore :
      a.distanceLy - b.distanceLy
    )
  }, [sort])

  const esiLabel = ESI_LABEL(selected.esi)
  const scoreColor = SCORE_COLOR(selected.lifeScore)
  const tempC = selected.tempK - 273

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Exoplanet Habitability Scorer</h2>
      <p className="text-gray-400 text-sm mb-5">Real planets, real data — could any of them host life?</p>

      {/* Sort controls */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(['life', 'esi', 'distance'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: sort === s ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.04)',
              color: sort === s ? '#a5b4fc' : '#6b7280',
              border: `1px solid ${sort === s ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {s === 'life' ? '🧬 Life Score' : s === 'esi' ? '🌍 Earth Similarity' : '📏 Distance'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Planet list */}
        <div className="space-y-2">
          {sorted.map(p => {
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: selected.id === p.id ? p.color + '18' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${selected.id === p.id ? p.color + '50' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: selected.id === p.id ? p.color : '#e2e8f0' }}>{p.name}</div>
                    <div className="text-[10px] text-gray-500">{p.distanceLy} ly • {p.starType.split(' ')[0]} star</div>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: SCORE_COLOR(p.lifeScore) + '25', color: SCORE_COLOR(p.lifeScore) }}>{p.lifeScore}</span>
                </div>
                <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${p.lifeScore}%`, background: SCORE_COLOR(p.lifeScore) }} />
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header card */}
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-4">
              <span className="text-5xl">{selected.icon}</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="text-sm text-gray-400 mb-3">{selected.star} • {selected.distanceLy} light-years away</div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: esiLabel.color + '25', color: esiLabel.color }}>
                    ESI {selected.esi} — {esiLabel.label}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${selected.inHabitableZone ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                    {selected.inHabitableZone ? '✓ Habitable Zone' : '✗ Outside HZ'}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                    selected.missionStatus === 'confirmed' ? 'bg-blue-900/40 text-blue-400' :
                    selected.missionStatus === 'targeted' ? 'bg-purple-900/40 text-purple-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {selected.missionStatus === 'targeted' ? '🔭 JWST Target' : selected.missionStatus === 'confirmed' ? '✓ Confirmed' : '◎ Candidate'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Life Score */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Life Potential Score</div>
            <ScoreMeter score={selected.lifeScore} color={scoreColor} />
            <p className="text-gray-300 text-sm mt-2 leading-relaxed">✅ {selected.lifeReason}</p>
            {selected.dealBreaker && (
              <p className="text-amber-300/80 text-sm mt-1 leading-relaxed">⚠️ {selected.dealBreaker}</p>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Mass', value: `${selected.mass}× Earth`, icon: '⚖️' },
              { label: 'Radius', value: `${selected.radius}× Earth`, icon: '🌐' },
              { label: 'Year Length', value: `${selected.orbitalPeriodDays} days`, icon: '📅' },
              { label: 'Temperature', value: `${tempC > 0 ? '+' : ''}${tempC}°C`, icon: '🌡️' },
              { label: 'Discovered', value: `${selected.discovered} by ${selected.by}`, icon: '🔭' },
              { label: 'Star Type', value: selected.starType, icon: '⭐' },
            ].map(s => (
              <div key={s.label} className="bg-gray-800/60 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">{s.icon} {s.label}</div>
                <div className="text-sm font-semibold text-gray-200">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Fun fact */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-1">🔬 Did You Know?</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-5 pt-4 border-t border-white/5 text-gray-600 text-xs text-center">
        ESI = Earth Similarity Index (0 = nothing alike, 1 = identical to Earth). Life Score includes habitability zone, stellar stability, atmospheric likelihood & temperature.
      </div>
    </div>
  )
}
