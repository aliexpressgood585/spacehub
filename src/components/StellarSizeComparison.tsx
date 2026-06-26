import { useState } from 'react'

interface CelestialBody {
  id: string
  name: string
  icon: string
  color: string
  radiusKm: number
  radiusSolar: number
  mass: string
  type: 'planet' | 'dwarf' | 'star' | 'giant' | 'hypergiant' | 'neutron' | 'blackhole'
  category: 'solar-system' | 'stars' | 'extremes'
  funFact: string
  context: string
}

const BODIES: CelestialBody[] = [
  // Solar system
  {
    id: 'mercury', name: 'Mercury', icon: '⚫', color: '#9ca3af',
    radiusKm: 2439, radiusSolar: 0.0035, mass: '3.3 × 10²³ kg',
    type: 'planet', category: 'solar-system',
    funFact: 'Mercury is smaller than some moons — including Ganymede and Titan.',
    context: 'The smallest planet, yet denser than Mars despite being much smaller.'
  },
  {
    id: 'mars', name: 'Mars', icon: '🔴', color: '#ef4444',
    radiusKm: 3389, radiusSolar: 0.0049, mass: '6.4 × 10²³ kg',
    type: 'planet', category: 'solar-system',
    funFact: 'Mars has the largest volcano in the solar system — Olympus Mons, 3× taller than Everest.',
    context: 'About half Earth\'s diameter. Once had a denser atmosphere and flowing rivers.'
  },
  {
    id: 'venus', name: 'Venus', icon: '☁️', color: '#fbbf24',
    radiusKm: 6051, radiusSolar: 0.0087, mass: '4.9 × 10²⁴ kg',
    type: 'planet', category: 'solar-system',
    funFact: 'Venus and Earth are nearly twins in size — only 650 km difference in radius.',
    context: 'Earth\'s "evil twin" — same size but completely different fate due to runaway greenhouse effect.'
  },
  {
    id: 'earth', name: 'Earth', icon: '🌍', color: '#22c55e',
    radiusKm: 6371, radiusSolar: 0.0092, mass: '5.97 × 10²⁴ kg',
    type: 'planet', category: 'solar-system',
    funFact: 'Earth is the only known body where carbon-based life exists — so far.',
    context: 'The reference point. All size comparisons start here.'
  },
  {
    id: 'neptune', name: 'Neptune', icon: '🔵', color: '#3b82f6',
    radiusKm: 24622, radiusSolar: 0.0354, mass: '1.02 × 10²⁶ kg',
    type: 'planet', category: 'solar-system',
    funFact: 'Neptune was predicted mathematically before it was observed — discovered in 1846 from its gravitational pull on Uranus.',
    context: '3.9× Earth\'s radius. Winds reaching 2,100 km/h — the fastest in the solar system.'
  },
  {
    id: 'saturn', name: 'Saturn', icon: '🪐', color: '#fbbf24',
    radiusKm: 58232, radiusSolar: 0.0836, mass: '5.68 × 10²⁶ kg',
    type: 'planet', category: 'solar-system',
    funFact: 'Saturn is less dense than water — it would float in a large enough bathtub.',
    context: '9.1× Earth\'s radius. Its rings span 282,000 km but are only ~10m thick.'
  },
  {
    id: 'jupiter', name: 'Jupiter', icon: '🟠', color: '#f97316',
    radiusKm: 71492, radiusSolar: 0.1028, mass: '1.90 × 10²⁷ kg',
    type: 'planet', category: 'solar-system',
    funFact: 'Jupiter\'s magnetic field is 14× stronger than Earth\'s and 20,000× larger in volume.',
    context: '11.2× Earth\'s radius. Contains more mass than all other planets combined.'
  },
  {
    id: 'sun', name: 'The Sun', icon: '☀️', color: '#fde68a',
    radiusKm: 695700, radiusSolar: 1.0, mass: '1.99 × 10³⁰ kg',
    type: 'star', category: 'solar-system',
    funFact: '1.3 million Earths could fit inside the Sun. Yet it\'s an average-sized star.',
    context: 'The reference star. 109× Earth\'s radius, containing 99.86% of the solar system\'s mass.'
  },
  // Stars
  {
    id: 'sirius', name: 'Sirius A', icon: '✨', color: '#bfdbfe',
    radiusKm: 1191996, radiusSolar: 1.71, mass: '2.06 M☉',
    type: 'star', category: 'stars',
    funFact: 'Sirius is so bright in the night sky it can cast faint shadows on Earth.',
    context: 'Brightest star in the night sky. 1.71× the Sun\'s radius at just 8.6 light-years away.'
  },
  {
    id: 'vega', name: 'Vega', icon: '⭐', color: '#e0f2fe',
    radiusKm: 1364172, radiusSolar: 1.96, mass: '2.1 M☉',
    type: 'star', category: 'stars',
    funFact: 'Vega was Earth\'s pole star 14,000 years ago and will be again in 13,727 years.',
    context: 'Spins so fast (317 km/s) it\'s visibly flattened — its equator is 23% wider than its poles.'
  },
  {
    id: 'arcturus', name: 'Arcturus', icon: '🟡', color: '#fbbf24',
    radiusKm: 18,
    radiusSolar: 25.4, mass: '1.1 M☉',
    type: 'giant', category: 'stars',
    funFact: 'Arcturus was used to open the 1933 World\'s Fair — its light captured and converted to electricity.',
    context: 'Red giant. 25× the Sun\'s radius — if placed at Sun\'s position, would reach Venus\'s orbit.'
  },
  {
    id: 'rigel', name: 'Rigel', icon: '💙', color: '#3b82f6',
    radiusKm: 4867900, radiusSolar: 78.9, mass: '21 M☉',
    type: 'giant', category: 'stars',
    funFact: 'Rigel is ~120,000× more luminous than our Sun. If placed where Sirius is, it would cast sharp shadows at night.',
    context: 'Blue supergiant in Orion\'s foot. One of the most luminous stars in our galaxy.'
  },
  {
    id: 'betelgeuse', name: 'Betelgeuse', icon: '🔴', color: '#ef4444',
    radiusKm: 864000000, radiusSolar: 764, mass: '20 M☉',
    type: 'hypergiant', category: 'stars',
    funFact: 'Betelgeuse dimmed dramatically in 2019-2020, triggering fears it was about to explode. It wasn\'t — it was just dust.',
    context: 'Red supergiant that will explode as a supernova. 764× Sun\'s radius — would swallow everything inside Mars\'s orbit.'
  },
  // Extremes
  {
    id: 'vy_canis', name: 'VY Canis Majoris', icon: '🔴', color: '#b45309',
    radiusKm: 1970000000, radiusSolar: 2000, mass: '17 M☉',
    type: 'hypergiant', category: 'extremes',
    funFact: 'If you replaced our Sun with VY Canis Majoris, it would extend beyond Saturn\'s orbit.',
    context: 'One of the largest stars known. 2,000× Sun\'s radius. A light beam would take 8 hours to circle its equator.'
  },
  {
    id: 'uy_scuti', name: 'UY Scuti', icon: '🟤', color: '#92400e',
    radiusKm: 1708000000, radiusSolar: 1708, mass: '7-10 M☉',
    type: 'hypergiant', category: 'extremes',
    funFact: 'Long thought to be the largest star, UY Scuti\'s actual size is uncertain due to measurement difficulties.',
    context: '1,708× Sun\'s radius with large uncertainty. Volume 5 billion× the Sun\'s.'
  },
  {
    id: 'neutron', name: 'Neutron Star', icon: '💫', color: '#a855f7',
    radiusKm: 10, radiusSolar: 0.0000144, mass: '1.4-2.0 M☉',
    type: 'neutron', category: 'extremes',
    funFact: 'A neutron star 20km wide has the mass of 1.4 Suns. Gravity at the surface is 200 billion× Earth\'s.',
    context: 'The smallest and densest visible stars. One teaspoon weighs 10 million tons.'
  },
  {
    id: 'blackhole_stellar', name: 'Stellar Black Hole', icon: '⚫', color: '#1e1b4b',
    radiusKm: 30, radiusSolar: 0.00004, mass: '~10 M☉',
    type: 'blackhole', category: 'extremes',
    funFact: 'A 10 solar-mass black hole has an event horizon (Schwarzschild radius) of only ~30km.',
    context: 'Formed from collapsing stars. The event horizon is tiny — Earth would become a black hole at 9mm.'
  },
]

const TYPE_COLORS: Record<CelestialBody['type'], string> = {
  planet: '#22c55e',
  dwarf: '#6b7280',
  star: '#fbbf24',
  giant: '#f97316',
  hypergiant: '#ef4444',
  neutron: '#a855f7',
  blackhole: '#6366f1',
}

const CATEGORIES = [
  { id: 'solar-system' as const, label: '☀️ Solar System', icon: '☀️' },
  { id: 'stars' as const, label: '⭐ Stars', icon: '⭐' },
  { id: 'extremes' as const, label: '🔥 Extremes', icon: '🔥' },
]

export default function StellarSizeComparison() {
  const [selected, setSelected] = useState<CelestialBody>(BODIES[3])
  const [catFilter, setCatFilter] = useState<CelestialBody['category'] | 'all'>('all')

  const filtered = catFilter === 'all' ? BODIES : BODIES.filter(b => b.category === catFilter)

  const maxRadius = Math.max(...BODIES.map(b => b.radiusSolar))
  const sunRadius = BODIES.find(b => b.id === 'sun')!.radiusSolar

  const toEarths = (r: number) => {
    const earthR = 6371
    const km = r * 695700
    return (km / earthR).toFixed(r < 0.01 ? 4 : 1)
  }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Stellar Size Comparison</h2>
      <p className="text-gray-400 text-sm mb-5">From planets to hypergiants — the true scale of objects in the universe.</p>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setCatFilter('all')}
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{
            background: catFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: catFilter === 'all' ? 'white' : '#6b7280',
            border: `1px solid ${catFilter === 'all' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >All</button>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCatFilter(c.id)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: catFilter === c.id ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
              color: catFilter === c.id ? '#a5b4fc' : '#6b7280',
              border: `1px solid ${catFilter === c.id ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >{c.label}</button>
        ))}
      </div>

      {/* Size bar chart */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Relative Size (solar radii, log scale)</div>
        <div className="space-y-1.5">
          {[...filtered].sort((a, b) => b.radiusSolar - a.radiusSolar).map(body => {
            const pct = Math.max(0.5, (Math.log10(body.radiusSolar + 0.001) - Math.log10(0.00001)) /
              (Math.log10(maxRadius + 1) - Math.log10(0.00001)) * 100)
            return (
              <button
                key={body.id}
                onClick={() => setSelected(body)}
                className="w-full flex items-center gap-2 text-left hover:bg-white/5 rounded px-1 transition-all"
              >
                <span className="text-sm w-5">{body.icon}</span>
                <span className="text-xs w-28 flex-shrink-0 truncate" style={{ color: selected.id === body.id ? body.color : '#9ca3af' }}>{body.name}</span>
                <div className="flex-1 h-2.5 bg-gray-900 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: selected.id === body.id ? body.color : TYPE_COLORS[body.type] + '80' }}
                  />
                </div>
                <span className="text-[10px] w-16 text-right font-mono" style={{ color: selected.id === body.id ? body.color : '#6b7280' }}>
                  {body.radiusSolar >= 1 ? `${body.radiusSolar.toLocaleString()}R☉` : `${toEarths(body.radiusSolar)}R⊕`}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{selected.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{selected.name}</h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: TYPE_COLORS[selected.type] + '25', color: TYPE_COLORS[selected.type] }}>
                {selected.type.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            {[
              { label: 'Radius', value: `${selected.radiusSolar >= 1 ? `${selected.radiusSolar.toLocaleString()} solar radii` : `${toEarths(selected.radiusSolar)}× Earth`}` },
              { label: 'Radius (km)', value: selected.radiusSolar >= 1 ? `${(selected.radiusSolar * 695700).toLocaleString()} km` : `${selected.radiusKm.toLocaleString()} km` },
              { label: 'vs Earth', value: `${toEarths(selected.radiusSolar)}× Earth\'s radius` },
              { label: 'vs Sun', value: selected.radiusSolar >= 1 ? `${selected.radiusSolar}× Sun` : `${(selected.radiusSolar / sunRadius * 100).toFixed(3)}% of Sun` },
              { label: 'Mass', value: selected.mass },
            ].map(s => (
              <div key={s.label} className="flex gap-2">
                <span className="text-gray-500 w-24 flex-shrink-0">{s.label}</span>
                <span className="text-gray-300">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Context</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.context}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Fun Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
