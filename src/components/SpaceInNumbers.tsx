import { useState } from 'react'

type Category = 'size' | 'distance' | 'time' | 'speed' | 'mass' | 'temperature' | 'count'

interface SpaceNumber {
  id: string
  category: Category
  icon: string
  color: string
  label: string
  rawNumber: string
  scientific: string
  unit: string
  analogy: string
  mindBlow: string
  comparison: string
  source: string
}

const NUMBERS: SpaceNumber[] = [
  {
    id: 'stars',
    category: 'count',
    icon: '⭐',
    color: '#fbbf24',
    label: 'Observable Stars',
    rawNumber: '2,000,000,000,000,000,000,000,000',
    scientific: '2 × 10²⁴',
    unit: 'stars',
    analogy: 'If every grain of sand on every beach and desert on Earth is one star, that\'s only ~7.5 × 10¹⁸ grains — still 300,000 times fewer than the stars.',
    mindBlow: 'There are more stars in the observable universe than atoms in a human body (7 × 10²⁷). Every star you see in the night sky could have multiple planets. The Milky Way alone has 200–400 billion stars.',
    comparison: 'More stars than seconds since the Big Bang (4.3 × 10¹⁷ s)',
    source: 'ESA / Hubble observations'
  },
  {
    id: 'universe_size',
    category: 'size',
    icon: '🌌',
    color: '#8b5cf6',
    label: 'Observable Universe Diameter',
    rawNumber: '880,000,000,000,000,000,000,000,000',
    scientific: '8.8 × 10²⁶',
    unit: 'meters',
    analogy: 'If the Sun were shrunk to the size of a white blood cell (7 micrometers), the observable universe would be 200 meters across — still a football field.',
    mindBlow: 'The observable universe is only a tiny fraction of the total universe. The actual universe may be infinite. We can\'t see beyond 46 billion light-years because light from farther hasn\'t reached us yet — and the space in between is expanding faster than light.',
    comparison: '93 billion light-years across; 930 times the distance to our cosmic horizon',
    source: 'Planck satellite 2018 cosmological parameters'
  },
  {
    id: 'light_second',
    category: 'speed',
    icon: '⚡',
    color: '#06b6d4',
    label: 'Speed of Light',
    rawNumber: '299,792,458',
    scientific: '2.998 × 10⁸',
    unit: 'meters/second',
    analogy: 'Light circles Earth 7.5 times per second. At this speed, you\'d travel from New York to Los Angeles in 0.016 seconds — faster than the neurons in your brain fire to register the thought.',
    mindBlow: 'Even at light speed: Moon is 1.3 seconds away. Sun is 8.3 minutes. Mars (at closest) is 3 minutes. Neptune: 4 hours. Alpha Centauri: 4.2 years. The Andromeda Galaxy: 2.5 million years. Nothing breaks this speed limit.',
    comparison: 'Faster than anything physical by an enormous margin — the next fastest particle (neutrinos) travel at 99.9999999% of c',
    source: 'NIST / BIPM fundamental constants'
  },
  {
    id: 'sun_mass',
    category: 'mass',
    icon: '☀️',
    color: '#f97316',
    label: 'Mass of the Sun',
    rawNumber: '1,989,000,000,000,000,000,000,000,000,000',
    scientific: '1.989 × 10³⁰',
    unit: 'kilograms',
    analogy: 'The Sun contains 99.86% of all the mass in the solar system. All 8 planets, asteroids, comets, and moons together are less than 0.14% of the Sun\'s mass.',
    mindBlow: 'The Sun fuses 600 million tons of hydrogen into helium every second. It has been doing this for 4.6 billion years and has enough hydrogen for another 5 billion. In a single second, the Sun releases 3.8 × 10²⁶ joules — more energy than humanity has produced in all of recorded history.',
    comparison: '333,000× Earth\'s mass; but only a medium-small star — UY Scuti is ~7 billion solar masses in volume',
    source: 'NASA Solar Physics'
  },
  {
    id: 'cosmic_age',
    category: 'time',
    icon: '⏳',
    color: '#a855f7',
    label: 'Age of the Universe',
    rawNumber: '13,800,000,000',
    scientific: '1.38 × 10¹⁰',
    unit: 'years',
    analogy: 'On the Cosmic Calendar (Carl Sagan\'s scale where the universe\'s history fits in one year): humans appear at 11:59:46 PM on December 31. All of recorded history is the last 14 seconds of December 31st.',
    mindBlow: 'The Earth formed at 8:43 AM on September 2nd (on the cosmic calendar). Dinosaurs died at 11:39 PM on December 30. Homo sapiens appear at 11:59:46 PM. All human civilization — Egypt, Rome, the internet — is the last 14 seconds.',
    comparison: '4.32 × 10¹⁷ seconds; universe is about 3× older than Earth',
    source: 'Planck 2018: 13.787 ± 0.020 Gyr'
  },
  {
    id: 'neutron_density',
    category: 'mass',
    icon: '⚫',
    color: '#64748b',
    label: 'Neutron Star Density',
    rawNumber: '800,000,000,000,000,000',
    scientific: '8 × 10¹⁷',
    unit: 'kg/m³',
    analogy: 'A teaspoon (5 mL) of neutron star material weighs about 10 million tons — the mass of Mount Everest in a sugar spoon. The entire mass of the Sun compressed into a sphere the size of Manhattan (~20 km).',
    mindBlow: 'Neutron star surface gravity is 200 billion times Earth\'s. A 70 kg human would weigh 14 trillion kg on its surface. The escape velocity is ~0.5× the speed of light. Atoms are crushed — only neutrons (and possibly quarks) survive.',
    comparison: 'Denser than an atomic nucleus itself (normal nuclear density: 2.3 × 10¹⁷ kg/m³)',
    source: 'Neutron Star Interior Composition Explorer (NICER, NASA)'
  },
  {
    id: 'empty_space',
    category: 'count',
    icon: '🫙',
    color: '#1e40af',
    label: 'Atoms per m³ of Deep Space',
    rawNumber: '1',
    scientific: '~1',
    unit: 'hydrogen atoms per cubic meter',
    analogy: 'The best vacuum humans can create in a lab is ~10⁻¹³ Pa, containing ~10⁶ atoms/cm³. Deep space has just 1 atom per cubic meter — a trillion trillion times more empty than our best lab vacuum.',
    mindBlow: 'Despite being nearly empty, there are 2 × 10⁸⁰ atoms in the observable universe. The total is enormous because the universe is so vast. But at any given location, space is overwhelmingly nothing.',
    comparison: 'A cubic meter of Earth\'s atmosphere has 2.7 × 10²⁵ molecules — 25 million trillion trillion times denser',
    source: 'NASA intergalactic medium density estimates'
  },
  {
    id: 'black_hole',
    category: 'size',
    icon: '🕳️',
    color: '#0f172a',
    label: 'TON 618 Black Hole Mass',
    rawNumber: '66,000,000,000',
    scientific: '6.6 × 10¹⁰',
    unit: 'solar masses',
    analogy: 'TON 618\'s event horizon is 200 billion km across — 1,300 times the orbit of Earth around the Sun. Neptune\'s entire orbit around the Sun fits inside this black hole 33 times over.',
    mindBlow: 'TON 618 is the most massive known black hole — 66 billion solar masses. Its Schwarzschild radius is ~130 AU. The supermassive black hole at the Milky Way\'s center (Sagittarius A*) is "only" 4 million solar masses by comparison.',
    comparison: 'If you replaced our Sun with TON 618, the event horizon would extend 200× beyond Neptune',
    source: 'Shemmer et al. 2004; TON 618 mass measurement'
  },
  {
    id: 'voyager_distance',
    category: 'distance',
    icon: '🚀',
    color: '#3b82f6',
    label: 'Voyager 1 Distance (2026)',
    rawNumber: '24,500,000,000',
    scientific: '2.45 × 10¹⁰',
    unit: 'km from Earth',
    analogy: 'A signal from Voyager 1 takes ~22.5 hours to reach Earth at light speed. Yet the nearest star (Proxima Centauri) is still 2,000× farther away. Voyager 1 would take 75,000 years to reach Proxima at its current speed.',
    mindBlow: 'Voyager 1 was launched in 1977 and is now in interstellar space — the first human object to leave the solar system. Its nuclear power source generates only ~4 watts. Yet it still beams data across the cosmic void that we can receive with a 70-meter dish antenna.',
    comparison: '164 AU from Sun; the Sun\'s light takes 22.5 hours to get there (versus 8.3 minutes to Earth)',
    source: 'NASA JPL Voyager mission status (real-time)'
  },
  {
    id: 'expansion',
    category: 'speed',
    icon: '📈',
    color: '#10b981',
    label: 'Universe Expansion Rate',
    rawNumber: '67.4',
    scientific: '67.4',
    unit: 'km/s per megaparsec (Hubble constant)',
    analogy: 'Galaxies 1 megaparsec away recede at 67.4 km/s. Galaxies 100 Mpc away recede at 6,740 km/s. Galaxies 4,400 Mpc away recede at the speed of light — and galaxies beyond that are moving away faster than light (space itself expanding).',
    mindBlow: 'There is a "cosmic horizon" at ~46 billion light-years where space expands faster than light can travel. We can never see or communicate with anything beyond it. And this horizon is always shrinking — the universe\'s accelerating expansion is isolating us over cosmic time.',
    comparison: 'The Andromeda Galaxy is approaching us at 110 km/s — local gravity overrides expansion at small scales',
    source: 'Planck 2018 CMB data: H₀ = 67.4 ± 0.5 km/s/Mpc'
  },
  {
    id: 'boomerang',
    category: 'temperature',
    icon: '🥶',
    color: '#67e8f9',
    label: 'Coldest Known Place in Universe',
    rawNumber: '0.00000000001',
    scientific: '1 × 10⁻¹⁰',
    unit: 'Kelvin (lab) / 1 K in space',
    analogy: 'The Boomerang Nebula in space is 1 K — colder than the CMB at 2.73 K. But in labs, humans have achieved 10⁻¹⁰ K — colder than any place in nature. Absolute zero (0 K) can never actually be reached.',
    mindBlow: 'Absolute zero is -273.15°C. At this temperature, atoms would stop moving entirely — but quantum mechanics prevents this (zero-point energy). The Boomerang Nebula is the coldest natural place (1 K), colder than the 2.73 K background of space. Humans have gotten 100 times colder in labs.',
    comparison: 'CMB: 2.73 K | Boomerang Nebula: 1 K | Lab record: 10⁻¹⁰ K | Absolute zero: 0 K (impossible)',
    source: 'NIST BEC experiments; ESA Planck CMB temperature'
  },
  {
    id: 'planck_hot',
    category: 'temperature',
    icon: '🔥',
    color: '#ef4444',
    label: 'Temperature at the Big Bang',
    rawNumber: '141,679,000,000,000,000,000,000,000,000,000',
    scientific: '1.416 × 10³²',
    unit: 'Kelvin (Planck temperature)',
    analogy: 'The Planck temperature is the hottest possible temperature in physics. Beyond it, our laws of physics break down. The Sun\'s core is a relatively chilly 15 million K — less than one billion-billionth of the Big Bang\'s temperature.',
    mindBlow: 'At 10⁻⁴³ seconds after the Big Bang (Planck time), the universe was at this temperature — all four fundamental forces were unified. As it expanded, it cooled. 380,000 years later, it was cool enough for atoms to form. Today, the CMB remnant is just 2.73 K.',
    comparison: 'Sun\'s core: 1.5 × 10⁷ K | Largest nuclear explosion: 3.6 × 10⁸ K | Planck temp: 1.4 × 10³² K',
    source: 'NIST CODATA fundamental constants'
  },
]

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'size', label: 'Size', icon: '📏' },
  { id: 'distance', label: 'Distance', icon: '📐' },
  { id: 'time', label: 'Time', icon: '⏳' },
  { id: 'speed', label: 'Speed', icon: '⚡' },
  { id: 'mass', label: 'Mass', icon: '⚖️' },
  { id: 'temperature', label: 'Temperature', icon: '🌡️' },
  { id: 'count', label: 'Counts', icon: '🔢' },
]

export default function SpaceInNumbers() {
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all')
  const [selected, setSelected] = useState<SpaceNumber>(NUMBERS[0])

  const filtered = activeCategory === 'all' ? NUMBERS : NUMBERS.filter(n => n.category === activeCategory)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space in Numbers</h2>
      <p className="text-gray-400 text-sm mb-5">The most mind-bending numbers in the universe — with real-world analogies to help your brain actually grasp them</p>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setActiveCategory('all')}
          className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
          style={{
            background: activeCategory === 'all' ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
            border: `1px solid ${activeCategory === 'all' ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
            color: activeCategory === 'all' ? '#a5b4fc' : '#94a3b8',
          }}
        >All</button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: activeCategory === cat.id ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${activeCategory === cat.id ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
              color: activeCategory === cat.id ? '#a5b4fc' : '#94a3b8',
            }}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Number list */}
        <div className="space-y-2">
          {filtered.map(num => (
            <button
              key={num.id}
              onClick={() => setSelected(num)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === num.id ? num.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === num.id ? num.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{num.icon}</span>
                <div className="font-semibold text-sm" style={{ color: selected.id === num.id ? num.color : '#e2e8f0' }}>{num.label}</div>
              </div>
              <div className="ml-8 font-mono text-xs font-bold" style={{ color: num.color + 'cc' }}>{num.scientific}</div>
              <div className="ml-8 text-gray-600 text-xs">{num.unit}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Big number display */}
          <div className="rounded-xl p-5 text-center" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
            <div className="text-4xl mb-2">{selected.icon}</div>
            <h3 className="text-xl font-bold text-white mb-1">{selected.label}</h3>
            <div className="font-mono text-3xl font-black mb-1" style={{ color: selected.color }}>{selected.scientific}</div>
            <div className="text-gray-400 text-sm mb-3">{selected.unit}</div>
            <div className="bg-black/30 rounded-lg p-3 text-xs font-mono text-gray-400 break-all">
              = {selected.rawNumber} {selected.unit}
            </div>
          </div>

          {/* Analogy */}
          <div className="bg-indigo-900/20 rounded-xl p-4 border border-indigo-800/30">
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">🧠 Real-World Analogy</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.analogy}</p>
          </div>

          {/* Mind blow */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Bending Context</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.mindBlow}</p>
          </div>

          {/* Comparison */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">📊 Comparison</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.comparison}</p>
          </div>

          {/* Source */}
          <div className="text-gray-600 text-xs px-1">Source: {selected.source}</div>
        </div>
      </div>

      {/* Quick facts row */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Stars in observable universe', value: '2 × 10²⁴', icon: '⭐', color: '#fbbf24' },
          { label: 'Age of universe', value: '13.8 billion yr', icon: '⏳', color: '#a855f7' },
          { label: 'Speed of light', value: '299,792 km/s', icon: '⚡', color: '#06b6d4' },
          { label: 'Observable universe', value: '93 billion ly', icon: '🌌', color: '#8b5cf6' },
        ].map(f => (
          <div key={f.label} className="bg-gray-800/40 rounded-xl p-3 text-center border border-gray-700/30">
            <div className="text-2xl mb-1">{f.icon}</div>
            <div className="font-mono text-sm font-bold mb-0.5" style={{ color: f.color }}>{f.value}</div>
            <div className="text-gray-500 text-xs">{f.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
