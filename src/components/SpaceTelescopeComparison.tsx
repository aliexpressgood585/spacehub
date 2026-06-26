import { useState } from 'react'

interface Telescope {
  id: string
  name: string
  shortName: string
  icon: string
  color: string
  agency: string
  launched: string
  status: 'active' | 'retired' | 'upcoming'
  orbit: string
  wavelength: string
  mirrorSize: string
  mirrorSizeM: number
  cost: string
  discoveries: string[]
  bestImage: string
  bestImageDesc: string
  limitation: string
  superpower: string
  comparedToHubble: string
  funFact: string
}

const TELESCOPES: Telescope[] = [
  {
    id: 'hubble',
    name: 'Hubble Space Telescope',
    shortName: 'Hubble',
    icon: '🔭',
    color: '#3b82f6',
    agency: 'NASA / ESA',
    launched: 'April 24, 1990',
    status: 'active',
    orbit: 'Low Earth Orbit — 547 km altitude',
    wavelength: 'Ultraviolet, Visible, Near-Infrared',
    mirrorSize: '2.4 meters',
    mirrorSizeM: 2.4,
    cost: '$4.7 billion (+ servicing missions)',
    discoveries: [
      'Measured expansion rate of the universe (Hubble constant)',
      'Proved supermassive black holes exist in most galaxies',
      'Hubble Deep Field — 3,000 galaxies in a tiny patch of "empty" sky',
      'Discovered dark energy by measuring distant supernovae',
    ],
    bestImage: 'Hubble Deep Field (1995)',
    bestImageDesc: 'A 10-day exposure of a tiny patch of "empty" sky revealed 3,000 galaxies — proof the universe is filled with billions of galaxies.',
    limitation: 'Cannot see through dust clouds. Limited to certain wavelengths.',
    superpower: 'Sharp optical images — the gold standard for visual astronomy for 34 years.',
    comparedToHubble: 'The reference — the most famous telescope in history.',
    funFact: 'Hubble\'s mirror was ground to the wrong prescription — off by 2.2 micrometers. NASA sent astronauts to install corrective "glasses" in 1993. It\'s been perfect ever since.'
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope',
    shortName: 'JWST',
    icon: '🌟',
    color: '#f97316',
    agency: 'NASA / ESA / CSA',
    launched: 'December 25, 2021',
    status: 'active',
    orbit: 'L2 Lagrange Point — 1.5 million km from Earth',
    wavelength: 'Near-Infrared, Mid-Infrared',
    mirrorSize: '6.5 meters (18 hexagonal segments)',
    mirrorSizeM: 6.5,
    cost: '$10 billion (30 years to build)',
    discoveries: [
      'Imaged galaxies from just 300 million years after the Big Bang',
      'Detected CO₂ in exoplanet atmosphere for first time (WASP-39b)',
      'Revealed unexpected structure in early universe — "Universe breakers"',
      'Directly imaged exoplanet atmospheres in unprecedented detail',
    ],
    bestImage: 'SMACS 0723 Deep Field (2022)',
    bestImageDesc: 'Webb\'s first deep field showed thousands of galaxies in stunning detail — some appearing as they were 13 billion years ago. Released July 12, 2022.',
    limitation: 'Cannot observe in visible light. Extremely cold — must stay below -233°C.',
    superpower: 'Sees through dust clouds. Sees the most distant objects ever observed. 100× more sensitive than Hubble.',
    comparedToHubble: 'Mirror is 6.25× larger by area. 100× more sensitive. Sees 13.6 billion years back.',
    funFact: 'JWST has 344 "single points of failure" — things that, if wrong, would end the mission. All 344 worked perfectly. The 29 days after launch were called "29 days on the edge."'
  },
  {
    id: 'chandra',
    name: 'Chandra X-ray Observatory',
    shortName: 'Chandra',
    icon: '💜',
    color: '#a855f7',
    agency: 'NASA',
    launched: 'July 23, 1999',
    status: 'active',
    orbit: 'Highly elliptical — up to 139,000 km altitude',
    wavelength: 'X-ray',
    mirrorSize: '1.2 meters (nested cylinders)',
    mirrorSizeM: 1.2,
    cost: '$1.65 billion',
    discoveries: [
      'First direct evidence of dark matter (Bullet Cluster)',
      'Measured the mass of black holes',
      'Discovered X-ray jets from supermassive black holes',
      'Mapped hot gas in galaxy clusters',
    ],
    bestImage: 'Bullet Cluster (2006)',
    bestImageDesc: 'Two galaxy clusters colliding — the hot gas (X-ray) separated from the dark matter, providing the best direct evidence for dark matter.',
    limitation: 'Only sees X-rays — misses most of the universe.',
    superpower: 'Sees the hottest, most violent phenomena: black holes, neutron stars, supernova remnants.',
    comparedToHubble: 'Sees completely different phenomena — complementary, not competing.',
    funFact: 'Chandra\'s orbit takes it 1/3 of the way to the Moon. It spends most of its orbit above Earth\'s radiation belts, giving it long, uninterrupted observation windows.'
  },
  {
    id: 'spitzer',
    name: 'Spitzer Space Telescope',
    shortName: 'Spitzer',
    icon: '🔴',
    color: '#ef4444',
    agency: 'NASA',
    launched: 'August 25, 2003',
    status: 'retired',
    orbit: 'Heliocentric (Earth-trailing) orbit',
    wavelength: 'Infrared',
    mirrorSize: '0.85 meters',
    mirrorSizeM: 0.85,
    cost: '$720 million',
    discoveries: [
      'TRAPPIST-1 system — 7 Earth-sized planets (3 in habitable zone)',
      'First exoplanet weather map',
      'Revealed the hidden structure of the Milky Way',
      'Discovered a giant ring of Saturn invisible to optical telescopes',
    ],
    bestImage: 'TRAPPIST-1 System (2017)',
    bestImageDesc: 'Spitzer confirmed 7 Earth-sized planets around a nearby star, 3 in the habitable zone — the most potentially habitable exoplanets found in one system.',
    limitation: 'Required liquid helium coolant — when it ran out in 2009, warm mission began with limited capability.',
    superpower: 'Sees through dust. Pioneered exoplanet atmosphere observations.',
    comparedToHubble: 'Smaller mirror but infrared vision revealed what Hubble couldn\'t see.',
    funFact: 'Spitzer ran out of coolant in 2009 but NASA continued operating it in "warm mission" mode until 2020 — getting 11 bonus years of science.'
  },
  {
    id: 'fermi',
    name: 'Fermi Gamma-ray Space Telescope',
    shortName: 'Fermi',
    icon: '⚡',
    color: '#fbbf24',
    agency: 'NASA',
    launched: 'June 11, 2008',
    status: 'active',
    orbit: 'Low Earth Orbit — 550 km',
    wavelength: 'Gamma-ray (highest energy light)',
    mirrorSize: 'No mirror — particle detector',
    mirrorSizeM: 0,
    cost: '$690 million',
    discoveries: [
      'Detected gamma-ray bursts — the most energetic explosions in the universe',
      'Found the Fermi Bubbles — giant structures above/below the Milky Way',
      'Most precise test of Einstein\'s special relativity',
      'Detected pulsars spinning 716 times per second',
    ],
    bestImage: 'Fermi Bubbles (2010)',
    bestImageDesc: 'Two giant gamma-ray bubbles extending 25,000 light-years above and below the Milky Way. Their origin is unknown — possibly past black hole activity.',
    limitation: 'Cannot produce sharp images — gamma-ray photons are too energetic.',
    superpower: 'Sees the most violent events in the universe. Every gamma-ray burst detected.',
    comparedToHubble: 'Sees a completely different universe — the violent, high-energy cosmos invisible to Hubble.',
    funFact: 'Fermi once detected a gamma-ray burst so bright it temporarily blinded its detectors — from a magnetar in our own galaxy, the brightest event ever recorded from within the Milky Way.'
  },
  {
    id: 'roman',
    name: 'Nancy Grace Roman Space Telescope',
    shortName: 'Roman',
    icon: '🔮',
    color: '#22c55e',
    agency: 'NASA',
    launched: 'Expected 2027',
    status: 'upcoming',
    orbit: 'L2 Lagrange Point (like JWST)',
    wavelength: 'Near-Infrared (like JWST)',
    mirrorSize: '2.4 meters (same as Hubble)',
    mirrorSizeM: 2.4,
    cost: '$3.93 billion',
    discoveries: [
      'Will survey 100× more sky than Hubble per observation',
      'Will discover thousands of exoplanets via microlensing',
      'Will create the largest ever map of dark matter',
      'Will study dark energy with unprecedented precision',
    ],
    bestImage: 'Not yet launched',
    bestImageDesc: 'Roman will produce images 100× the field of view of Hubble — essentially Hubble\'s sharpness across a vastly larger area of sky.',
    limitation: 'Not yet launched — schedule subject to change.',
    superpower: 'Wide-field surveys — will image in one shot what takes Hubble months to mosaic.',
    comparedToHubble: 'Same mirror size but 100× wider field of view. The "panoramic Hubble."',
    funFact: 'Roman was originally called WFIRST. It was renamed after Nancy Grace Roman — NASA\'s first Chief of Astronomy, who was crucial to making Hubble happen.'
  },
]

const STAT_KEYS: { key: keyof Telescope; label: string; icon: string }[] = [
  { key: 'launched', label: 'Launched', icon: '📅' },
  { key: 'orbit', label: 'Orbit', icon: '🛸' },
  { key: 'wavelength', label: 'Wavelength', icon: '🌈' },
  { key: 'mirrorSize', label: 'Mirror', icon: '🔭' },
  { key: 'cost', label: 'Cost', icon: '💰' },
]

export default function SpaceTelescopeComparison() {
  const [selected, setSelected] = useState<Telescope>(TELESCOPES[1])
  const [showDisc, setShowDisc] = useState(false)

  const maxMirror = Math.max(...TELESCOPES.map(t => t.mirrorSizeM))

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Telescope Comparison</h2>
      <p className="text-gray-400 text-sm mb-5">Hubble, JWST, Chandra, Spitzer, Fermi, Roman — what each sees that the others can't</p>

      {/* Telescope selector */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        {TELESCOPES.map(t => (
          <button
            key={t.id}
            onClick={() => { setSelected(t); setShowDisc(false) }}
            className="p-3 rounded-xl transition-all text-center"
            style={{
              background: selected.id === t.id ? t.color + '20' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.id === t.id ? t.color + '60' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-2xl mb-1">{t.icon}</div>
            <div className="text-xs font-bold leading-tight" style={{ color: selected.id === t.id ? t.color : '#9ca3af' }}>{t.shortName}</div>
            <div className="mt-1">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                t.status === 'active' ? 'bg-green-900/50 text-green-400' :
                t.status === 'retired' ? 'bg-gray-800 text-gray-500' :
                'bg-indigo-900/50 text-indigo-400'
              }`}>
                {t.status === 'active' ? '● LIVE' : t.status === 'retired' ? 'RETIRED' : '⏳ 2027'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Mirror size comparison */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Mirror Size Comparison</div>
        <div className="space-y-2">
          {TELESCOPES.filter(t => t.mirrorSizeM > 0).sort((a, b) => b.mirrorSizeM - a.mirrorSizeM).map(t => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="text-base w-6">{t.icon}</span>
              <div className="text-xs w-16 text-gray-400 flex-shrink-0">{t.mirrorSize}</div>
              <div className="flex-1 h-3 bg-gray-900 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(t.mirrorSizeM / maxMirror) * 100}%`, background: t.color }}
                />
              </div>
              <div className="text-xs w-16 text-right font-semibold" style={{ color: t.color }}>{t.shortName}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stats */}
        <div className="space-y-3">
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <div className="text-xs text-gray-400">{selected.agency}</div>
              </div>
            </div>
            {STAT_KEYS.map(s => (
              <div key={s.key} className="flex gap-2 text-xs mb-1.5">
                <span className="flex-shrink-0">{s.icon}</span>
                <span className="text-gray-500 w-20 flex-shrink-0">{s.label}</span>
                <span className="text-gray-300">{selected[s.key] as string}</span>
              </div>
            ))}
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Superpower</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.superpower}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">vs Hubble</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.comparedToHubble}</p>
          </div>
        </div>

        {/* Discoveries + fun fact */}
        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400 text-xs uppercase font-semibold">Key Discoveries</div>
              <button onClick={() => setShowDisc(v => !v)} className="text-xs text-indigo-400">{showDisc ? '▲' : '▼'} {showDisc ? 'hide' : 'show all'}</button>
            </div>
            <ul className="space-y-1.5">
              {(showDisc ? selected.discoveries : selected.discoveries.slice(0, 2)).map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="flex-shrink-0 mt-0.5" style={{ color: selected.color }}>▸</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-1">🏆 Most Famous Image</div>
            <div className="font-bold text-white text-sm mb-1">{selected.bestImage}</div>
            <p className="text-gray-400 text-xs leading-relaxed">{selected.bestImageDesc}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">😲 Fun Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
