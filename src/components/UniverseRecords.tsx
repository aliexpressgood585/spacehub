import { useState } from 'react'

interface SpaceRecord {
  id: string
  category: string
  categoryIcon: string
  title: string
  holder: string
  holderIcon: string
  color: string
  value: string
  comparison: string
  details: string
  funFact: string
  type: 'biggest' | 'smallest' | 'fastest' | 'hottest' | 'coldest' | 'oldest' | 'densest' | 'brightest' | 'distant' | 'weird'
}

const RECORDS: SpaceRecord[] = [
  {
    id: 'biggest_star',
    category: 'Biggest',
    categoryIcon: '📏',
    title: 'Largest Known Star',
    holder: 'Stephenson 2-18',
    holderIcon: '🔴',
    color: '#ef4444',
    value: '2,150 solar radii',
    comparison: 'If placed at our Sun, it would extend 10× past Saturn\'s orbit',
    details: 'A red hypergiant in the Milky Way, ~20,000 light-years from Earth. Volume 10 billion× our Sun.',
    funFact: 'Light traveling across its surface would take 8 hours vs 14.5 seconds for our Sun.',
    type: 'biggest'
  },
  {
    id: 'biggest_bh',
    category: 'Biggest',
    categoryIcon: '📏',
    title: 'Largest Black Hole',
    holder: 'TON 618',
    holderIcon: '⚫',
    color: '#6366f1',
    value: '66 billion solar masses',
    comparison: 'Its event horizon is larger than our entire solar system',
    details: 'An ultramassive black hole 10.4 billion light-years away. Its Schwarzschild radius: 1,300 AU.',
    funFact: 'TON 618 powers a quasar 140 trillion times brighter than our Sun. Its mass is 66 billion suns.',
    type: 'biggest'
  },
  {
    id: 'smallest_star',
    category: 'Smallest',
    categoryIcon: '🔬',
    title: 'Smallest Known Star',
    holder: 'EBLM J0555-57Ab',
    holderIcon: '🔴',
    color: '#f97316',
    value: '59,000 km radius',
    comparison: 'Barely larger than Saturn — the smallest star that can sustain hydrogen fusion',
    details: 'An M-dwarf 600 light-years away. Just barely above the hydrogen-burning limit (~80 Jupiter masses).',
    funFact: 'This star is smaller than some gas giant planets! It\'s at the very edge of what counts as a star.',
    type: 'smallest'
  },
  {
    id: 'hottest',
    category: 'Hottest',
    categoryIcon: '🌡️',
    title: 'Hottest Known Star',
    holder: 'WR 102',
    holderIcon: '🔵',
    color: '#3b82f6',
    value: '210,000°C surface',
    comparison: 'Our Sun\'s surface is 5,778°C — WR 102 is 36× hotter',
    details: 'A Wolf-Rayet star 8,000 light-years away losing mass at enormous rate. About to explode.',
    funFact: 'WR 102\'s stellar wind blows at 5,000 km/s — 1.7% the speed of light. It\'s actively destroying itself.',
    type: 'hottest'
  },
  {
    id: 'coldest_place',
    category: 'Coldest',
    categoryIcon: '🧊',
    title: 'Coldest Place in Universe',
    holder: 'Boomerang Nebula',
    holderIcon: '💙',
    color: '#06b6d4',
    value: '-272.15°C (1 Kelvin)',
    comparison: 'Colder than the cosmic microwave background (2.73 K) — the only natural place in the universe colder than background radiation',
    details: '5,000 light-years away. A dying star blasting gas outward at 164 km/s — cooling faster than space itself.',
    funFact: 'The Boomerang Nebula is so cold it\'s colder than the afterglow of the Big Bang. That shouldn\'t be possible — it is because the gas expands so rapidly it cools below background temperature.',
    type: 'coldest'
  },
  {
    id: 'fastest_spin',
    category: 'Fastest',
    categoryIcon: '⚡',
    title: 'Fastest Spinning Object',
    holder: 'PSR J1748-2446ad (Pulsar)',
    holderIcon: '💫',
    color: '#fbbf24',
    value: '716 rotations per second',
    comparison: 'Its equator moves at ~24% the speed of light',
    details: 'A millisecond pulsar in globular cluster Terzan 5. Completing a full rotation in 1.4 milliseconds.',
    funFact: 'Neutron stars shouldn\'t be able to spin this fast without flying apart. Their extreme density and strong gravity keeps them together at spin rates that would shred any other object.',
    type: 'fastest'
  },
  {
    id: 'oldest',
    category: 'Oldest',
    categoryIcon: '⌛',
    title: 'Oldest Known Star',
    holder: 'Methuselah Star (HD 140283)',
    holderIcon: '⭐',
    color: '#fbbf24',
    value: '~13.8 billion years old',
    comparison: 'Almost as old as the universe itself (13.8 billion years)',
    details: '190 light-years from Earth. Originally estimated older than the universe — refined measurements align with universe\'s age within error bars.',
    funFact: 'Methuselah contains almost no metals — it formed from the Big Bang\'s primordial hydrogen and helium before heavy elements existed.',
    type: 'oldest'
  },
  {
    id: 'brightest',
    category: 'Brightest',
    categoryIcon: '💡',
    title: 'Brightest Known Object',
    holder: 'J0529-4351 (Quasar)',
    holderIcon: '🌟',
    color: '#f97316',
    value: '500 trillion× our Sun\'s luminosity',
    comparison: 'Powered by black hole 17 billion× Sun\'s mass, eating 370 solar masses per year',
    details: 'A quasar 12 billion light-years away, discovered to be the brightest ever in 2024.',
    funFact: 'Discovered in 2024 by analyzing 30-year-old photographic plates. Despite being the brightest object in the universe, it was hiding in plain sight in archival data.',
    type: 'brightest'
  },
  {
    id: 'densest',
    category: 'Densest',
    categoryIcon: '🪨',
    title: 'Densest Normal Matter',
    holder: 'Neutron Star Core',
    holderIcon: '💫',
    color: '#a855f7',
    value: '~4 × 10¹⁷ kg/m³',
    comparison: 'One teaspoon weighs 10 million tons — equal to all of humanity\'s mass in a sugar cube',
    details: 'Matter crushed beyond atomic structure — electrons and protons merge into neutrons, packed at nuclear density.',
    funFact: 'At the very center of neutron stars, pressures may be so extreme that neutrons dissolve into a quark-gluon plasma — a state that hasn\'t existed since microseconds after the Big Bang.',
    type: 'densest'
  },
  {
    id: 'most_distant',
    category: 'Most Distant',
    categoryIcon: '🔭',
    title: 'Most Distant Galaxy Observed',
    holder: 'JADES-GS-z14-0',
    holderIcon: '🌌',
    color: '#22c55e',
    value: '33 billion light-years away',
    comparison: 'We see it as it was 290 million years after the Big Bang — light that left before Earth existed',
    details: 'Confirmed by JWST in 2024. Surprisingly bright and large for a galaxy so early in the universe.',
    funFact: 'Even though we see it "only" 13.5 billion light-years away (in light-travel time), the universe expanded while light was traveling — the galaxy is now ~33 billion light-years away.',
    type: 'distant'
  },
  {
    id: 'weirdest',
    category: 'Weirdest',
    categoryIcon: '🤯',
    title: 'Weirdest Object: Haumea',
    holder: 'Haumea (Dwarf Planet)',
    holderIcon: '🥚',
    color: '#06b6d4',
    value: 'Rotates in 3.9 hours',
    comparison: 'Spins so fast it\'s shaped like a rugby ball — 2,100 km long, 1,000 km wide',
    details: 'A dwarf planet beyond Neptune, egg-shaped from its rapid spin. Has rings and two moons.',
    funFact: 'Haumea is one of the fastest rotating large objects in the solar system. It was probably hit by a large object billions of years ago, which sped up its spin and created its moons from the debris.',
    type: 'weird'
  },
  {
    id: 'fastest_wind',
    category: 'Fastest',
    categoryIcon: '⚡',
    title: 'Fastest Winds Ever Recorded',
    holder: 'Exoplanet HD 189733b',
    holderIcon: '🌀',
    color: '#3b82f6',
    value: '8,700 km/h winds',
    comparison: 'Earth\'s fastest tornadoes: ~480 km/h. This is 18× faster.',
    details: 'A "hot Jupiter" tidally locked to its star. The day side is ~1,200°C, night side ~1,000°C — the temperature difference drives insane winds.',
    funFact: 'HD 189733b rains glass sideways. Its atmosphere contains silicate particles whipped into sharp glass crystals by the winds. It\'s a beautiful cobalt blue — and absolutely lethal.',
    type: 'fastest'
  },
]

const TYPE_COLORS: Record<SpaceRecord['type'], string> = {
  biggest: '#ef4444',
  smallest: '#22c55e',
  fastest: '#fbbf24',
  hottest: '#f97316',
  coldest: '#06b6d4',
  oldest: '#94a3b8',
  densest: '#a855f7',
  brightest: '#fde68a',
  distant: '#3b82f6',
  weird: '#ec4899',
}

const ALL_TYPES = ['biggest', 'smallest', 'fastest', 'hottest', 'coldest', 'oldest', 'densest', 'brightest', 'distant', 'weird'] as const

export default function UniverseRecords() {
  const [selected, setSelected] = useState<SpaceRecord>(RECORDS[0])
  const [typeFilter, setTypeFilter] = useState<SpaceRecord['type'] | 'all'>('all')

  const filtered = typeFilter === 'all' ? RECORDS : RECORDS.filter(r => r.type === typeFilter)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Universe Record Book</h2>
      <p className="text-gray-400 text-sm mb-5">The most extreme objects ever discovered — biggest, fastest, coldest, weirdest.</p>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setTypeFilter('all')}
          className="text-xs px-2.5 py-1 rounded-full font-semibold transition-all"
          style={{
            background: typeFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: typeFilter === 'all' ? 'white' : '#6b7280',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >All</button>
        {ALL_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className="text-xs px-2.5 py-1 rounded-full font-semibold transition-all capitalize"
            style={{
              background: typeFilter === t ? TYPE_COLORS[t] + '25' : 'rgba(255,255,255,0.04)',
              color: typeFilter === t ? TYPE_COLORS[t] : '#6b7280',
              border: `1px solid ${typeFilter === t ? TYPE_COLORS[t] + '50' : 'rgba(255,255,255,0.06)'}`,
            }}
          >{t}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Records list */}
        <div className="space-y-1.5">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: selected.id === r.id ? r.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === r.id ? r.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{r.holderIcon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: selected.id === r.id ? r.color : '#e2e8f0' }}>{r.title}</div>
                  <div className="text-[10px] text-gray-600 truncate">{r.holder}</div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: TYPE_COLORS[r.type] + '25', color: TYPE_COLORS[r.type] }}>
                  {r.categoryIcon}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-4 mb-4">
              <span className="text-5xl">{selected.holderIcon}</span>
              <div>
                <div className="text-xs font-bold mb-1 uppercase" style={{ color: TYPE_COLORS[selected.type] }}>
                  {selected.categoryIcon} {selected.category} Record
                </div>
                <h3 className="text-xl font-bold text-white">{selected.title}</h3>
                <div className="text-sm text-gray-400">{selected.holder}</div>
              </div>
            </div>
            <div className="rounded-lg p-3 mb-3" style={{ background: selected.color + '20' }}>
              <div className="text-xs text-gray-400 mb-1">Record Value</div>
              <div className="text-2xl font-black" style={{ color: selected.color }}>{selected.value}</div>
            </div>
            <div className="text-gray-300 text-sm leading-relaxed">
              <span className="text-gray-500">In context: </span>{selected.comparison}
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Details</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.details}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Bending Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
