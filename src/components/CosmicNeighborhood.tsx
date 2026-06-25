import { useState } from 'react'

interface Layer {
  id: string
  name: string
  scale: string
  scaleMeters: string
  icon: string
  color: string
  description: string
  keyFacts: { label: string; value: string }[]
  neighbors: string[]
  ourPlace: string
  discovery: string
}

const LAYERS: Layer[] = [
  {
    id: 'earth',
    name: 'Earth',
    scale: '12,756 km diameter',
    scaleMeters: '1.28 × 10⁷ m',
    icon: '🌍',
    color: '#3b82f6',
    description: 'Third planet from the Sun. The only known world harboring life. Our home for 4.54 billion years.',
    keyFacts: [
      { label: 'Diameter', value: '12,756 km' },
      { label: 'Mass', value: '5.97 × 10²⁴ kg' },
      { label: 'Age', value: '4.54 billion years' },
      { label: 'Distance from Sun', value: '149.6 million km (1 AU)' },
      { label: 'Orbital period', value: '365.25 days' },
      { label: 'Natural satellites', value: '1 (the Moon)' },
    ],
    neighbors: ['Moon (384,400 km)', 'Venus (closest planet, ~38 million km at closest)', 'Mars (~55 million km at closest)'],
    ourPlace: 'Third rock from the Sun, orbiting in the habitable zone where liquid water can persist on the surface.',
    discovery: 'Ancient — our home for all of human history',
  },
  {
    id: 'solar',
    name: 'Solar System',
    scale: '~100,000 AU diameter (Oort Cloud)',
    scaleMeters: '1.5 × 10¹⁶ m',
    icon: '☀️',
    color: '#fbbf24',
    description: 'Our Sun and everything gravitationally bound to it: 8 planets, 5 dwarf planets, hundreds of moons, millions of asteroids, billions of comets in the Oort Cloud.',
    keyFacts: [
      { label: 'Star', value: 'G2V main-sequence (the Sun)' },
      { label: 'Planets', value: '8 (Mercury → Neptune)' },
      { label: 'Known moons', value: '292+ (across all planets)' },
      { label: 'Asteroid belt objects', value: '>1 million (>1 km)' },
      { label: 'Oort Cloud comets', value: '~10¹²–10¹³ objects (estimated)' },
      { label: 'Heliosphere diameter', value: '~200 AU (inner boundary)' },
    ],
    neighbors: ['Alpha Centauri system (4.37 ly)', 'Barnard\'s Star (5.96 ly)', 'Sirius (8.60 ly)', 'Epsilon Eridani (10.5 ly)'],
    ourPlace: 'The Sun is one of ~200–400 billion stars in the Milky Way. Our solar system orbits the galactic center at 26,000 ly, taking 225 million years per orbit (1 cosmic year).',
    discovery: 'Heliocentric model: Copernicus (1543). Kuiper Belt: 1992. Oort Cloud: proposed by Jan Oort (1950), never directly observed.',
  },
  {
    id: 'local_bubble',
    name: 'Local Bubble',
    scale: '~1,000 light-years across',
    scaleMeters: '9.5 × 10¹⁸ m',
    icon: '🫧',
    color: '#06b6d4',
    description: 'A cavity in the interstellar medium, roughly 1,000 light-years across, carved by a series of supernova explosions ~13–14 million years ago. Our solar system sits inside this hot, low-density bubble.',
    keyFacts: [
      { label: 'Diameter', value: '~1,000 light-years' },
      { label: 'Interior density', value: '~0.05 atoms/cm³ (very sparse)' },
      { label: 'Surrounding ISM density', value: '~1 atom/cm³ (20× denser)' },
      { label: 'Interior temperature', value: '~10⁶ K (hot but very sparse)' },
      { label: 'Origin', value: '14–15 supernovae, 13 Mya' },
      { label: 'Known stars inside', value: 'Several hundred nearby stars' },
    ],
    neighbors: ['Loop I Bubble (adjacent)', 'Orion-Eridanus Superbubble (900 ly)', 'Local Interstellar Cloud (0.2 ly, surrounds Solar System)'],
    ourPlace: 'Our solar system entered the Local Bubble ~5 million years ago and currently moves through the Local Interstellar Cloud — a dense cloudlet within the bubble. The bubble\'s wall is where nearby star-forming regions exist.',
    discovery: 'Local Bubble mapped by Lallement et al. (2003); origin linked to ancient supernovae by Zucker et al. (2022, Nature)',
  },
  {
    id: 'orion_arm',
    name: 'Orion Arm (Local Arm)',
    scale: '~10,000 light-years long',
    scaleMeters: '9.5 × 10¹⁹ m',
    icon: '🌀',
    color: '#8b5cf6',
    description: 'A minor spiral arm of the Milky Way, ~10,000 light-years long and ~3,500 light-years wide. Contains our solar system, the Orion Nebula, the Vela OB2 association, and other nearby star-forming regions.',
    keyFacts: [
      { label: 'Length', value: '~10,000 ly' },
      { label: 'Width', value: '~3,500 ly' },
      { label: 'Position', value: 'Between Perseus Arm (outer) and Sagittarius Arm (inner)' },
      { label: 'Notable objects', value: 'Orion Nebula (1,344 ly), Rosette Nebula (5,200 ly)' },
      { label: 'Star forming regions', value: 'Orion Molecular Cloud, Ophiuchus, Taurus' },
      { label: 'Our location', value: '~26,000 ly from galactic center' },
    ],
    neighbors: ['Perseus Arm (outer, ~6,400 ly)', 'Sagittarius Arm (inner, ~4,600 ly)', 'Norma Arm', 'Cygnus Arm'],
    ourPlace: 'We are in the Orion Arm, a minor spur between the two major adjacent spiral arms. This location is unusually calm — far from the dangerous galactic center and major arms where supernovae and radiation are more frequent.',
    discovery: 'Radio observations of HII regions (1950s); Gaia satellite provided the clearest picture (2018, 2022)',
  },
  {
    id: 'milky_way',
    name: 'The Milky Way',
    scale: '~100,000 light-years diameter',
    scaleMeters: '9.5 × 10²⁰ m',
    icon: '🌌',
    color: '#a855f7',
    description: 'Our home galaxy — a barred spiral galaxy containing 200–400 billion stars, with a supermassive black hole (Sgr A*, 4.3 million M☉) at its center.',
    keyFacts: [
      { label: 'Diameter (disk)', value: '~100,000–120,000 ly' },
      { label: 'Thickness (disk)', value: '~1,000 ly' },
      { label: 'Total mass', value: '~1.5 × 10¹² M☉ (mostly dark matter)' },
      { label: 'Stars', value: '200–400 billion (estimated)' },
      { label: 'Central black hole', value: 'Sgr A*: 4.3 million M☉' },
      { label: 'Age', value: '~13.6 billion years (some stars from 13.5 Gyr)' },
      { label: 'Satellite galaxies', value: '~60+ (LMC, SMC, Sagittarius Dwarf, etc.)' },
      { label: 'Galactic year', value: '225 million Earth years' },
    ],
    neighbors: ['Andromeda Galaxy (M31): 2.537 million ly', 'Triangulum Galaxy (M33): 2.73 million ly', 'LMC: 163,000 ly', 'SMC: 200,000 ly'],
    ourPlace: 'Sun is 26,000 ly from the galactic center — about 2/3 of the way out in the disk. We\'re in a relatively safe location away from the crowded, radiation-intense center.',
    discovery: 'Milky Way recognized as a galaxy: Edwin Hubble (1924); structure mapped with radio telescopes (1950s–); Gaia satellite gave best 3D map (2018)',
  },
  {
    id: 'local_group',
    name: 'Local Group',
    scale: '~10 million light-years across',
    scaleMeters: '9.5 × 10²² m',
    icon: '🔵',
    color: '#22c55e',
    description: 'A gravitationally bound group of ~80 galaxies dominated by the Milky Way and Andromeda (M31). The Local Group is our cosmic neighborhood and will remain bound together even as the universe expands.',
    keyFacts: [
      { label: 'Diameter', value: '~10 million light-years' },
      { label: 'Total mass', value: '~2 × 10¹² M☉' },
      { label: 'Member galaxies', value: '~80 known (mostly dwarfs)' },
      { label: 'Two dominant galaxies', value: 'Milky Way + Andromeda (M31)' },
      { label: 'Andromeda distance', value: '2.537 million ly' },
      { label: 'Milkdromeda collision', value: 'In ~4.5 billion years' },
    ],
    neighbors: ['Maffei Group (10 million ly)', 'Sculptor Group (13 million ly)', 'M81 Group (12 million ly)'],
    ourPlace: 'The Milky Way and Andromeda are the two dominant galaxies. They are approaching each other at 110 km/s and will merge in ~4.5 billion years to form an elliptical galaxy (sometimes called "Milkomeda" or "Milkdromeda").',
    discovery: 'Concept defined by Edwin Hubble (1936); membership expanded as new dwarf galaxies discovered',
  },
  {
    id: 'virgo_supercluster',
    name: 'Virgo Supercluster (Laniakea)',
    scale: '~520 million light-years across (Laniakea)',
    scaleMeters: '4.9 × 10²⁴ m',
    icon: '🌐',
    color: '#f97316',
    description: 'Our Local Group is part of the Virgo Supercluster, which is itself part of the Laniakea Supercluster — a massive supercluster containing ~100,000 galaxies and ~10¹⁷ M☉. The Virgo Cluster at its center lies 65 million ly away.',
    keyFacts: [
      { label: 'Laniakea diameter', value: '~520 million ly' },
      { label: 'Laniakea mass', value: '~10¹⁷ M☉' },
      { label: 'Galaxies in Laniakea', value: '~100,000' },
      { label: 'Virgo Cluster distance', value: '~65 million ly' },
      { label: 'Great Attractor', value: 'Gravitational anomaly at ~250 million ly, pulling the Local Group' },
    ],
    neighbors: ['Perseus-Pisces Supercluster', 'Coma Supercluster', 'Shapley Supercluster (750 Mly — one of the largest known mass concentrations)'],
    ourPlace: 'We are in the outskirts of Laniakea. The entire Local Group is being pulled toward the Great Attractor at ~630 km/s — a gravitational anomaly behind the Milky Way disk (the Zone of Avoidance makes it hard to observe directly).',
    discovery: 'Laniakea defined and mapped by R. Brent Tully et al. (2014, Nature) — coined from Hawaiian "immeasurable heaven"',
  },
  {
    id: 'observable_universe',
    name: 'Observable Universe',
    scale: '93 billion light-years across',
    scaleMeters: '8.8 × 10²⁶ m',
    icon: '🌠',
    color: '#ef4444',
    description: 'The sphere of the universe from which light has had time to reach us since the Big Bang. Beyond this horizon, the universe continues — but we can\'t observe it. The observable universe contains ~2 trillion galaxies.',
    keyFacts: [
      { label: 'Diameter', value: '~93 billion light-years' },
      { label: 'Age of light at edge', value: '13.8 billion years' },
      { label: 'Apparent receding speed (at edge)', value: '>3c (expansion, not motion through space)' },
      { label: 'Galaxies', value: '~2 trillion (Conselice et al. 2016)' },
      { label: 'Stars (estimated)', value: '~10²⁴ (1 septillion)' },
      { label: 'Composition', value: '68% dark energy, 27% dark matter, 5% ordinary matter' },
      { label: 'CMB temperature', value: '2.72548 K' },
    ],
    neighbors: ['The unobservable universe beyond our light horizon — unknown extent', 'Possible multiverse — entirely speculative'],
    ourPlace: 'We are not at the center of the universe (there is no center). From any point in the universe, the observable horizon extends equally in all directions. Our observable sphere is just what we happen to be able to see from Earth.',
    discovery: 'Observable universe concept: Einstein\'s GR + Friedmann equations (1922). CMB as edge: Gamow, Alpher, Herman (1948). Two trillion galaxies count: Conselice et al. (2016)',
  },
]

export default function CosmicNeighborhood() {
  const [selected, setSelected] = useState<Layer>(LAYERS[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Your Cosmic Address</h2>
      <p className="text-gray-400 text-sm mb-5">From Earth to the observable universe — explore every layer of our cosmic home, from 10⁷ to 10²⁷ meters</p>

      {/* Scale selector — zoom levels */}
      <div className="overflow-x-auto pb-2 mb-5">
        <div className="flex gap-1.5 min-w-max">
          {LAYERS.map((layer) => (
            <button
              key={layer.id}
              onClick={() => setSelected(layer)}
              className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl transition-all min-w-[90px]"
              style={{
                background: selected.id === layer.id ? layer.color + '20' : 'rgba(30,41,59,0.6)',
                border: `1px solid ${selected.id === layer.id ? layer.color + '60' : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              <span className="text-xl">{layer.icon}</span>
              <span className="text-xs font-medium text-center leading-tight" style={{ color: selected.id === layer.id ? layer.color : '#94a3b8' }}>
                {layer.name.split(' ')[0]}
              </span>
              <span className="text-xs text-gray-600 text-center font-mono leading-tight text-[9px]">×10^{Math.round(Math.log10(parseFloat(layer.scaleMeters.replace(/.*×\s*10⁻?(\d+).*/, '$1'))))}</span>
            </button>
          ))}
        </div>
        {/* Scale bar */}
        <div className="relative h-1.5 mt-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {LAYERS.map((l, idx) => (
            <div key={l.id}
              className="absolute top-0 h-1.5"
              style={{
                left: `${(idx / LAYERS.length) * 100}%`,
                width: `${(1 / LAYERS.length) * 100}%`,
                background: l.color,
                opacity: 0.7,
              }} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>10⁷ m (Earth)</span>
          <span>10²⁷ m (Observable Universe)</span>
        </div>
      </div>

      {/* Selected layer detail */}
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-xl p-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">{selected.icon}</span>
            <div>
              <h3 className="text-xl font-bold text-white">{selected.name}</h3>
              <div className="text-sm font-mono mt-0.5" style={{ color: selected.color }}>{selected.scale}</div>
            </div>
          </div>
          <p className="text-gray-200 text-sm leading-relaxed mt-2">{selected.description}</p>
        </div>

        {/* Key facts */}
        <div className="bg-gray-800/60 rounded-xl p-4">
          <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Key Facts</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {selected.keyFacts.map(fact => (
              <div key={fact.label} className="bg-gray-900/60 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-0.5">{fact.label}</div>
                <div className="text-gray-200 text-xs font-medium">{fact.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Our place */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Our Place Here</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.ourPlace}</p>
          </div>

          {/* Neighbors */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Nearest Neighbors</div>
            <div className="space-y-1.5">
              {selected.neighbors.map((n) => (
                <div key={n} className="flex gap-2 text-sm">
                  <span style={{ color: selected.color }}>→</span>
                  <span className="text-gray-300 text-xs">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Discovery */}
        <div className="rounded-xl p-4" style={{ background: selected.color + '06', border: `1px solid ${selected.color}20` }}>
          <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>How We Discovered This</div>
          <p className="text-gray-300 text-sm">{selected.discovery}</p>
        </div>
      </div>

      {/* Full address */}
      <div className="mt-4 bg-indigo-900/15 rounded-xl p-4 border border-indigo-800/25">
        <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">Your Complete Cosmic Address</div>
        <p className="text-gray-300 text-sm font-mono leading-loose">
          You → Earth → Solar System → Local Bubble → Orion Arm → Milky Way → Local Group → Virgo Supercluster (Laniakea) → Observable Universe
        </p>
      </div>
    </div>
  )
}
