import { useState } from 'react'

interface Level {
  id: string
  name: string
  icon: string
  color: string
  scale: string
  scaleMeters: number
  description: string
  yourPlace: string
  neighbors: string
  funFact: string
}

const LEVELS: Level[] = [
  {
    id: 'you',
    name: 'You',
    icon: '🧑',
    color: '#22c55e',
    scale: '~1.8 meters',
    scaleMeters: 1.8,
    description: 'A carbon-based life form on the surface of a rocky planet.',
    yourPlace: 'You are made of ~37 trillion cells, each containing DNA with 3.2 billion base pairs — unique in the universe.',
    neighbors: 'Other humans, animals, plants, microbes. 8 billion humans on this planet.',
    funFact: 'The atoms in your body were forged in the cores of stars that exploded billions of years before the Sun formed. You are, literally, stardust.'
  },
  {
    id: 'earth',
    name: 'Earth',
    icon: '🌍',
    color: '#3b82f6',
    scale: '12,742 km diameter',
    scaleMeters: 1.27e7,
    description: 'The third planet from the Sun — the only known harbor of life.',
    yourPlace: 'Surface dweller on the crust — a thin layer 5-70 km thick over a molten mantle and iron core.',
    neighbors: 'The Moon, artificial satellites, the Van Allen belts, and occasional meteor visitors.',
    funFact: 'Earth is the densest planet in the solar system. If you drilled straight down, you\'d hit mantle in minutes but the core is further away than the nearest major city.'
  },
  {
    id: 'solar',
    name: 'Solar System',
    icon: '☀️',
    color: '#fbbf24',
    scale: '~200 AU (Oort Cloud)',
    scaleMeters: 3e13,
    description: 'Our Sun and its family: 8 planets, 5 dwarf planets, hundreds of moons, millions of asteroids.',
    yourPlace: 'Third planet from the Sun, in the inner rocky planet zone, just inside the habitable zone\'s inner edge.',
    neighbors: 'Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Ceres, and billions of comets in the Oort Cloud.',
    funFact: 'The solar system is mostly empty space. If the Sun were a basketball, Earth would be a small pea 26 meters away, and Pluto would be the size of a dust grain 1 km away.'
  },
  {
    id: 'local_bubble',
    name: 'Local Bubble',
    icon: '💫',
    color: '#a855f7',
    scale: '~300 light-years across',
    scaleMeters: 2.84e18,
    description: 'A cavity in the interstellar medium carved by ancient supernova explosions ~10-20 million years ago.',
    yourPlace: 'Inside a low-density region of space — partly why the Sun is relatively isolated and Earth isn\'t bombarded by nearby stellar radiation.',
    neighbors: 'Proxima Centauri (4.24 ly), Alpha Centauri A/B, Sirius (8.6 ly), Epsilon Eridani (10.5 ly), Tau Ceti (11.9 ly).',
    funFact: 'Our Sun sits inside a "bubble" blown out by 14-20 ancient supernovae. The nearest stars are unusually sparse — we\'re in a cosmic clearing. Without it, deadly radiation might have sterilized early Earth life.'
  },
  {
    id: 'orion_arm',
    name: 'Orion Arm (Local Arm)',
    icon: '🌀',
    color: '#06b6d4',
    scale: '~10,000 light-years long',
    scaleMeters: 9.46e19,
    description: 'A minor spiral arm of the Milky Way — a spur between the larger Sagittarius and Perseus arms.',
    yourPlace: 'About halfway along the Orion Arm, roughly 26,000 light-years from the galactic center.',
    neighbors: 'Thousands of star clusters, nebulae (Orion Nebula, Eagle Nebula), and hundreds of billions of stars.',
    funFact: 'Our arm is called the "Orion Arm" because Orion\'s brightest stars (Betelgeuse, Rigel) are within it. These are our cosmic neighbors — all within the same galactic suburb.'
  },
  {
    id: 'milky_way',
    name: 'Milky Way Galaxy',
    icon: '🌌',
    color: '#f97316',
    scale: '~100,000 light-years',
    scaleMeters: 9.46e20,
    description: 'A barred spiral galaxy containing 200-400 billion stars, an ancient bulge, and a 4-million solar mass black hole at the center.',
    yourPlace: 'About 26,000 light-years from the galactic center (Sagittarius A*), roughly 2/3 from center to edge.',
    neighbors: 'The Magellanic Clouds (satellite galaxies), Canis Major Dwarf (25,000 ly), Sagittarius Dwarf galaxy (70,000 ly).',
    funFact: 'Our galaxy is currently cannibalizing the Sagittarius Dwarf galaxy — ripping stars away from it and pulling them into the Milky Way. This is normal galaxy behavior.'
  },
  {
    id: 'local_group',
    name: 'Local Group',
    icon: '🔵',
    color: '#3b82f6',
    scale: '~10 million light-years',
    scaleMeters: 9.46e22,
    description: 'A gravitationally bound group of ~80 galaxies. Our galactic family.',
    yourPlace: 'In the Milky Way — one of the two largest galaxies in the group (Andromeda is the other, slightly bigger).',
    neighbors: 'Andromeda (M31, 2.5M ly), Triangulum Galaxy (M33, 2.7M ly), dozens of dwarf galaxies orbiting both.',
    funFact: 'The Milky Way and Andromeda are on a collision course — they\'ll merge in ~4.5 billion years. The result will be a giant elliptical galaxy astronomers call "Milkomeda" or "Andromilky."'
  },
  {
    id: 'virgo_cluster',
    name: 'Virgo Supercluster',
    icon: '🌐',
    color: '#ec4899',
    scale: '~110 million light-years',
    scaleMeters: 1.04e24,
    description: 'A supercluster of galaxies containing ~100 galaxy groups and clusters, centered on the Virgo Cluster.',
    yourPlace: 'In an outlying filament — the Local Group is on the periphery, gravitationally falling slowly toward the Virgo Cluster.',
    neighbors: 'The Virgo Cluster (54M ly) with 1,500+ galaxies; the Fornax Cluster; dozens of galaxy groups.',
    funFact: 'The Virgo Supercluster is being pulled toward an even larger structure — the Great Attractor — an enormous mass concentration 150-250M light-years away that tugs on hundreds of thousands of galaxies.'
  },
  {
    id: 'laniakea',
    name: 'Laniakea Supercluster',
    icon: '🌊',
    color: '#a855f7',
    scale: '~520 million light-years',
    scaleMeters: 4.9e24,
    description: 'Our home supercluster — Hawaiian for "immeasurable heaven." Identified in 2014. Contains 100,000+ galaxies.',
    yourPlace: 'In the Virgo Supercluster, which is part of one of Laniakea\'s outer tendrils. The Milky Way is in the very outer suburbs.',
    neighbors: 'The Shapley Supercluster (650M ly), Perseus-Pisces Supercluster, Coma Supercluster.',
    funFact: 'Laniakea was only defined in 2014 — before that, nobody knew which supercluster we were in. It\'s the largest structure our galaxy belongs to and contains the mass of 100 quadrillion Suns.'
  },
  {
    id: 'cosmic_web',
    name: 'Cosmic Web',
    icon: '🕸️',
    color: '#6366f1',
    scale: 'Billions of light-years',
    scaleMeters: 1e25,
    description: 'The large-scale structure of the universe — filaments of galaxies separated by vast cosmic voids.',
    yourPlace: 'On a filament — galaxies trace out web-like threads of dark matter, with empty voids hundreds of millions of light-years across in between.',
    neighbors: 'Other superclusters on nearby filaments. The Boötes Void (300M ly wide) — a cosmic hole with almost no galaxies.',
    funFact: 'The cosmic web resembles the structure of a human brain or a neural network — filaments with dense nodes at intersections. The similarity is striking, though purely coincidental.'
  },
  {
    id: 'observable_universe',
    name: 'Observable Universe',
    icon: '🌐',
    color: '#fbbf24',
    scale: '93 billion light-years diameter',
    scaleMeters: 8.8e26,
    description: 'Everything we can, in principle, ever see from Earth — limited by the speed of light and the age of the universe.',
    yourPlace: 'At the exact center — by definition, we are always at the center of our own observable universe.',
    neighbors: 'The CMB edge at 13.8 billion years ago. Beyond: potentially infinite universe, possibly containing other regions like ours.',
    funFact: 'You are at the center of YOUR observable universe. Every observer anywhere is at the center of their own observable universe. Everyone is simultaneously at the center of everything and nowhere special.'
  },
]

export default function CosmicAddress() {
  const [selected, setSelected] = useState<Level>(LEVELS[0])

  const selectedIndex = LEVELS.findIndex(l => l.id === selected.id)

  const formatScale = (m: number) => {
    if (m < 1000) return `${m.toFixed(0)} m`
    if (m < 1e6) return `${(m / 1000).toFixed(0)} km`
    if (m < 9.46e15) return `${(m / 1e9).toFixed(0)}M km`
    if (m < 9.46e18) return `${(m / 9.46e15).toFixed(1)} ly`
    if (m < 9.46e21) return `${(m / 9.46e18).toFixed(0)}k ly`
    return `${(m / 9.46e22).toFixed(0)}M ly`
  }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Your Cosmic Address</h2>
      <p className="text-gray-400 text-sm mb-5">Where in the universe are you? From your body to the edge of everything.</p>

      {/* Address chain */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Full Cosmic Address</div>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {LEVELS.map((l, i) => (
            <span key={l.id} className="flex items-center gap-1">
              <button
                onClick={() => setSelected(l)}
                className="px-2 py-0.5 rounded font-semibold transition-all text-xs"
                style={{
                  background: selected.id === l.id ? l.color + '25' : 'transparent',
                  color: selected.id === l.id ? l.color : '#6b7280',
                }}
              >{l.icon} {l.name}</button>
              {i < LEVELS.length - 1 && <span className="text-gray-700">›</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Scale zoom bar */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Scale: You to Observable Universe</div>
        <div className="relative h-2 bg-gray-900 rounded-full mb-1">
          <div
            className="absolute h-full rounded-full transition-all duration-500"
            style={{
              width: `${((Math.log10(selected.scaleMeters) - Math.log10(1)) / (Math.log10(8.8e26) - Math.log10(1))) * 100}%`,
              background: `linear-gradient(90deg, #22c55e, #3b82f6, #a855f7, #fbbf24)`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>1.8m (You)</span>
          <span className="font-bold" style={{ color: selected.color }}>{formatScale(selected.scaleMeters)}</span>
          <span>93B ly (Observable Universe)</span>
        </div>
      </div>

      {/* Level navigation */}
      <div className="grid grid-cols-5 md:grid-cols-11 gap-1 mb-6">
        {LEVELS.map(l => (
          <button
            key={l.id}
            onClick={() => setSelected(l)}
            className="p-1.5 rounded-lg transition-all text-center"
            style={{
              background: selected.id === l.id ? l.color + '25' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.id === l.id ? l.color + '60' : 'rgba(255,255,255,0.04)'}`,
            }}
          >
            <div className="text-base">{l.icon}</div>
            <div className="text-[8px] leading-tight mt-0.5 font-semibold" style={{ color: selected.id === l.id ? l.color : '#6b7280' }}>
              {l.name.split(' ')[0]}
            </div>
          </button>
        ))}
      </div>

      {/* Selected level detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl p-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{selected.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{selected.name}</h3>
              <div className="text-sm font-mono" style={{ color: selected.color }}>{selected.scale}</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{selected.description}</p>
          <div className="rounded-lg p-3 bg-gray-900/50">
            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">📍 Your Place Here</div>
            <p className="text-gray-300 text-sm">{selected.yourPlace}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">👥 Neighbors</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.neighbors}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Bender</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => selectedIndex > 0 && setSelected(LEVELS[selectedIndex - 1])}
              disabled={selectedIndex === 0}
              className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-30 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >← Zoom In</button>
            <button
              onClick={() => selectedIndex < LEVELS.length - 1 && setSelected(LEVELS[selectedIndex + 1])}
              disabled={selectedIndex === LEVELS.length - 1}
              className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-30 transition-all"
              style={{ background: selected.color + '25', color: selected.color }}
            >Zoom Out →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
