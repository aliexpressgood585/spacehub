import { useState } from 'react'

interface ScaleObject {
  id: string
  name: string
  icon: string
  size: number
  sizeLabel: string
  color: string
  category: 'quantum' | 'human' | 'earth' | 'solar' | 'stellar' | 'galactic' | 'cosmic'
  description: string
  comparison: string
  mindBlowing: string
}

const OBJECTS: ScaleObject[] = [
  {
    id: 'proton',
    name: 'Proton',
    icon: '⚛️',
    size: 1e-15,
    sizeLabel: '1 femtometer (10⁻¹⁵ m)',
    color: '#a855f7',
    category: 'quantum',
    description: 'The nucleus of a hydrogen atom. Nearly all of an atom\'s mass is here.',
    comparison: 'If a proton were 1 mm, a human hair would be 100 km wide.',
    mindBlowing: 'Atoms are 99.9999999999999% empty space. You are almost entirely nothing.'
  },
  {
    id: 'atom',
    name: 'Hydrogen Atom',
    icon: '🔵',
    size: 1e-10,
    sizeLabel: '0.1 nanometer (10⁻¹⁰ m)',
    color: '#6366f1',
    category: 'quantum',
    description: 'The smallest and most common element in the universe.',
    comparison: 'A human hair is 1 million hydrogen atoms wide.',
    mindBlowing: 'There are more atoms in a glass of water than there are glasses of water in all the oceans.'
  },
  {
    id: 'virus',
    name: 'Virus',
    icon: '🦠',
    size: 1e-7,
    sizeLabel: '100 nanometers (10⁻⁷ m)',
    color: '#22c55e',
    category: 'human',
    description: 'The boundary between living and non-living. Too small to see with light microscopes.',
    comparison: '1,000 viruses fit across a human hair.',
    mindBlowing: 'There are more viruses on Earth than stars in the observable universe — by a factor of 10 million.'
  },
  {
    id: 'human',
    name: 'Human',
    icon: '🧍',
    size: 1.7,
    sizeLabel: '1.7 meters',
    color: '#f97316',
    category: 'human',
    description: 'You. The reference point for everything on this scale.',
    comparison: 'You are about halfway between the size of an atom and the size of Earth — on a logarithmic scale.',
    mindBlowing: 'Humans exist at a peculiar sweet spot — large enough to think about the universe, small enough to fit 8 billion on one planet.'
  },
  {
    id: 'everest',
    name: 'Mount Everest',
    icon: '🏔️',
    size: 8849,
    sizeLabel: '8.8 kilometers',
    color: '#94a3b8',
    category: 'earth',
    description: 'The highest point on Earth\'s surface. Tiny compared to the planet itself.',
    comparison: 'If Earth were a billiard ball, Everest would be smaller than the allowed surface roughness.',
    mindBlowing: 'Earth is smoother than a billiard ball at planetary scale.'
  },
  {
    id: 'earth',
    name: 'Earth',
    icon: '🌍',
    size: 1.27e7,
    sizeLabel: '12,742 km diameter',
    color: '#3b82f6',
    category: 'earth',
    description: 'Our home. The only known planet with life.',
    comparison: '1 million Earths would fit inside the Sun.',
    mindBlowing: 'All of human history, every war, every civilization, every person who ever lived — on a pale blue dot invisible at solar system scale.'
  },
  {
    id: 'sun',
    name: 'The Sun',
    icon: '☀️',
    size: 1.39e9,
    sizeLabel: '1.39 million km diameter',
    color: '#fbbf24',
    category: 'solar',
    description: 'Our star. Contains 99.86% of all mass in the solar system.',
    comparison: '109 Earths fit across the Sun\'s diameter. 1.3 million Earths fit inside its volume.',
    mindBlowing: 'The Sun is so large that light takes 8 minutes to reach Earth, but it takes 2 seconds to travel across the Sun itself.'
  },
  {
    id: 'solar_system',
    name: 'Solar System',
    icon: '🪐',
    size: 9e12,
    sizeLabel: '~60 AU / 9 trillion km',
    color: '#f97316',
    category: 'solar',
    description: 'From the Sun to the edge of the Kuiper Belt (Pluto\'s orbit and beyond).',
    comparison: 'If the Sun were a basketball, the Solar System would be 3 km across.',
    mindBlowing: 'Voyager 1, launched in 1977, is only now leaving the solar system after 46 years of travel at 60,000 km/h.'
  },
  {
    id: 'lightyear',
    name: '1 Light-Year',
    icon: '✨',
    size: 9.46e15,
    sizeLabel: '9.46 trillion km',
    color: '#22c55e',
    category: 'stellar',
    description: 'The distance light travels in one year — the basic unit of interstellar distances.',
    comparison: 'The entire Solar System is 0.001 light-years across.',
    mindBlowing: 'If you drove at highway speed to the nearest star, it would take 50 million years.'
  },
  {
    id: 'proxima',
    name: 'Proxima Centauri (nearest star)',
    icon: '⭐',
    size: 3.99e16,
    sizeLabel: '4.24 light-years away',
    color: '#ef4444',
    category: 'stellar',
    description: 'The closest star to our Sun. Still impossibly far away.',
    comparison: 'New Horizons spacecraft (fastest ever launched) would take 78,000 years to get there.',
    mindBlowing: 'The light you see from Proxima Centauri left that star 4.24 years ago — you\'re seeing the past.'
  },
  {
    id: 'milkyway',
    name: 'Milky Way Galaxy',
    icon: '🌌',
    size: 9.46e20,
    sizeLabel: '100,000 light-years diameter',
    color: '#a855f7',
    category: 'galactic',
    description: 'Our galaxy. Contains 100-400 billion stars. We are in the outer spiral arm.',
    comparison: 'Light takes 100,000 years to cross our galaxy. Traveling at the speed of the ISS (28,000 km/h), crossing would take 2 billion years.',
    mindBlowing: 'Every star you can see with your naked eye is in the Milky Way. And those are only a tiny fraction of its stars.'
  },
  {
    id: 'andromeda',
    name: 'Andromeda Galaxy',
    icon: '🌀',
    size: 2.36e22,
    sizeLabel: '2.5 million light-years away',
    color: '#06b6d4',
    category: 'galactic',
    description: 'The nearest large galaxy. Visible to the naked eye as a faint smudge.',
    comparison: 'Andromeda is on a collision course with the Milky Way — expected impact in 4.5 billion years.',
    mindBlowing: 'When you look at Andromeda, you\'re seeing light that left 2.5 million years ago, when humans were still using stone tools.'
  },
  {
    id: 'observable',
    name: 'Observable Universe',
    icon: '🌐',
    size: 8.8e26,
    sizeLabel: '93 billion light-years diameter',
    color: '#fbbf24',
    category: 'cosmic',
    description: 'Everything we can possibly observe. Beyond this, light hasn\'t had time to reach us.',
    comparison: 'Contains an estimated 2 trillion galaxies, each with hundreds of billions of stars.',
    mindBlowing: 'The observable universe is NOT the full universe. The actual universe may be infinite. We are looking at a tiny bubble limited by the speed of light and the age of the universe.'
  },
]

const CATEGORIES: { id: ScaleObject['category']; label: string; icon: string; color: string }[] = [
  { id: 'quantum', label: 'Quantum', icon: '⚛️', color: '#a855f7' },
  { id: 'human', label: 'Human Scale', icon: '🧍', color: '#f97316' },
  { id: 'earth', label: 'Earth', icon: '🌍', color: '#3b82f6' },
  { id: 'solar', label: 'Solar System', icon: '☀️', color: '#fbbf24' },
  { id: 'stellar', label: 'Stellar', icon: '⭐', color: '#22c55e' },
  { id: 'galactic', label: 'Galactic', icon: '🌌', color: '#a855f7' },
  { id: 'cosmic', label: 'Cosmic', icon: '🌐', color: '#06b6d4' },
]

export default function UniverseScaleExplorer() {
  const [selected, setSelected] = useState<ScaleObject>(OBJECTS[3])
  const [filter, setFilter] = useState<ScaleObject['category'] | 'all'>('all')

  const filtered = filter === 'all' ? OBJECTS : OBJECTS.filter(o => o.category === filter)

  const humanSize = 1.7
  const selectedLog = Math.log10(selected.size)
  const humanLog = Math.log10(humanSize)
  const minLog = Math.log10(1e-15)
  const maxLog = Math.log10(8.8e26)
  const pct = ((selectedLog - minLog) / (maxLog - minLog)) * 100

  const timesLargerThanHuman = selected.size / humanSize
  const scaleLabel = timesLargerThanHuman > 1
    ? `${timesLargerThanHuman.toExponential(1)}× larger than a human`
    : `${(humanSize / selected.size).toExponential(1)}× smaller than a human`

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Universe Scale Explorer</h2>
      <p className="text-gray-400 text-sm mb-5">From a proton to the observable universe — 42 orders of magnitude in one place</p>

      {/* Scale bar */}
      <div className="mb-6 bg-gray-800/60 rounded-xl p-4">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Scale Position</div>
        <div className="relative h-6 bg-gray-900 rounded-full overflow-hidden mb-2">
          <div className="absolute inset-0 rounded-full" style={{
            background: 'linear-gradient(90deg, #a855f7, #6366f1, #3b82f6, #22c55e, #fbbf24, #f97316, #ef4444, #06b6d4)'
          }} />
          {/* Human marker */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-white opacity-60"
            style={{ left: `${((humanLog - minLog) / (maxLog - minLog)) * 100}%` }} />
          {/* Selected marker */}
          <div className="absolute top-0 bottom-0 w-1 rounded-full bg-white shadow-lg transition-all duration-500"
            style={{ left: `${pct}%`, transform: 'translateX(-50%)' }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Proton (10⁻¹⁵ m)</span>
          <span className="text-white text-xs font-semibold">{selected.name}</span>
          <span>Observable Universe (10²⁷ m)</span>
        </div>
        <div className="text-center text-xs mt-1" style={{ color: selected.color }}>{scaleLabel}</div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilter('all')}
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{
            background: filter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: filter === 'all' ? 'white' : '#6b7280',
            border: `1px solid ${filter === 'all' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >All</button>
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: filter === c.id ? c.color + '25' : 'rgba(255,255,255,0.04)',
              color: filter === c.id ? c.color : '#6b7280',
              border: `1px solid ${filter === c.id ? c.color + '50' : 'rgba(255,255,255,0.06)'}`,
            }}
          >{c.icon} {c.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Object list */}
        <div className="space-y-1.5">
          {filtered.map(obj => (
            <button
              key={obj.id}
              onClick={() => setSelected(obj)}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: selected.id === obj.id ? obj.color + '18' : 'transparent',
                border: `1px solid ${selected.id === obj.id ? obj.color + '45' : 'transparent'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{obj.icon}</span>
                <div>
                  <div className="text-sm font-semibold" style={{ color: selected.id === obj.id ? obj.color : '#e2e8f0' }}>{obj.name}</div>
                  <div className="text-gray-600 text-xs">{obj.sizeLabel}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-5xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="font-mono text-sm" style={{ color: selected.color }}>{selected.sizeLabel}</div>
                <div className="text-gray-500 text-xs mt-0.5">{scaleLabel}</div>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.description}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Size Comparison</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.comparison}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Blowing Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.mindBlowing}</p>
          </div>

          {/* Powers of 10 */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Journey from Human to {selected.name}</div>
            <div className="font-mono text-xs text-gray-400 leading-relaxed">
              {timesLargerThanHuman > 1 ? (
                <span>Human (1.7m) → <span style={{ color: selected.color }}>×{timesLargerThanHuman.toExponential(0)}</span> → {selected.name} ({selected.sizeLabel})</span>
              ) : (
                <span>{selected.name} ({selected.sizeLabel}) → <span style={{ color: selected.color }}>×{(humanSize / selected.size).toExponential(0)}</span> → Human (1.7m)</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
