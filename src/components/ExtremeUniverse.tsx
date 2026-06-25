import { useState } from 'react'

type Category = 'hottest' | 'coldest' | 'largest' | 'densest' | 'fastest' | 'oldest' | 'brightest' | 'magnetic'

interface ExtremeRecord {
  title: string
  object: string
  value: string
  unit: string
  location: string
  description: string
  comparison: string
  discoveredBy: string
  icon: string
  color: string
}

const RECORDS: Record<Category, ExtremeRecord> = {
  hottest: {
    title: 'Hottest Natural Object',
    object: 'Neutron Star Merger (GW170817)',
    value: '~10¹²',
    unit: 'Kelvin (1 trillion K)',
    location: '130 million light-years (NGC 4993)',
    description: 'During a neutron star merger, the collision briefly creates temperatures exceeding 10¹² K — hotter than the core of a supernova and approaching temperatures not seen since the first second after the Big Bang. Quark matter may briefly exist.',
    comparison: 'The Sun\'s core is 15 million K. This is 70,000× hotter than the Sun\'s core, and 100 billion× hotter than the surface of the Sun. For comparison, the Large Hadron Collider achieves ~5.5 × 10¹² K in heavy-ion collisions.',
    discoveredBy: 'LIGO/Virgo + 70 observatories (2017) — first multi-messenger astronomy event',
    icon: '🔥',
    color: '#ef4444',
  },
  coldest: {
    title: 'Coldest Natural Place',
    object: 'Boomerang Nebula',
    value: '1',
    unit: 'Kelvin (−272.15°C)',
    location: '5,000 light-years away in Centaurus',
    description: 'The Boomerang Nebula is a proto-planetary nebula where gas expanding from a dying star cools to just 1 K — colder than the cosmic microwave background (2.725 K). It\'s the only known natural object colder than the CMB in the observable universe.',
    comparison: 'Absolute zero = 0 K. The CMB = 2.725 K. Outer space = 2.7 K. The coldest temperature ever created in a lab = 38 picokelvin (38 × 10⁻¹² K) at MIT. The Boomerang Nebula at 1 K sits between space\'s background temperature and lab records.',
    discoveredBy: 'Raghvendra Sahai and Lars-Åke Nyman (1995, SEST telescope), confirmed with ALMA 2013',
    icon: '🧊',
    color: '#60a5fa',
  },
  largest: {
    title: 'Largest Known Structure',
    object: 'Hercules–Corona Borealis Great Wall',
    value: '10',
    unit: 'billion light-years across',
    location: 'z = 1.6–2.1 (about 10 billion light-years away)',
    description: 'A massive filamentary superstructure of galaxies spanning roughly 10 billion light-years — about 10% of the observable universe\'s diameter. It may challenge the Cosmological Principle (the assumption that the universe is homogeneous at large scales).',
    comparison: 'The observable universe is 93 billion light-years in diameter. The Milky Way is 0.1 million light-years. The Great Wall is 100,000× larger than the Milky Way. The Sloan Great Wall (previous record holder) was 1.4 billion ly — this is 7× larger.',
    discoveredBy: 'Istvan Horvath et al. (2013-2015), via gamma-ray burst distribution analysis',
    icon: '🌐',
    color: '#8b5cf6',
  },
  densest: {
    title: 'Densest Object Short of a Black Hole',
    object: 'Neutron Star (PSR J0952-0607)',
    value: '~4 × 10¹⁷',
    unit: 'kg/m³ (400 million tons per teaspoon)',
    location: '3,200–5,700 light-years, Sextans',
    description: 'PSR J0952-0607 is a neutron star with ~2.35 solar masses compressed into a sphere ~20 km across. The interior density may be high enough to contain exotic matter: hyperons, quark-gluon plasma, or strange quark matter. It\'s the most massive neutron star known.',
    comparison: 'Water = 1,000 kg/m³. Lead = 11,340 kg/m³. White dwarf core = 10⁹ kg/m³. Atomic nucleus = 2 × 10¹⁷ kg/m³. This neutron star is essentially one enormous atomic nucleus. A sugar-cube-sized piece would weigh 100 million tons on Earth.',
    discoveredBy: 'Roger Romani et al. (2022), Keck Observatory; potentially the heaviest neutron star ever measured',
    icon: '💠',
    color: '#a855f7',
  },
  fastest: {
    title: 'Fastest Star',
    object: 'S5-HVS1 (Hypervelocity Star)',
    value: '1,755',
    unit: 'km/s (0.6% speed of light)',
    location: 'Ejected from the galactic center, now in Grus constellation',
    description: 'S5-HVS1 was flung from the Milky Way\'s supermassive black hole (Sgr A*) at 1,755 km/s — fast enough to escape the galaxy entirely. It was ejected ~5 million years ago when its binary companion was captured by Sgr A* via the Hills mechanism.',
    comparison: 'Earth orbits the Sun at 30 km/s. The Sun orbits the galactic center at 220 km/s. Voyager 1 travels at 17 km/s. This star moves at 1,755 km/s — 58× faster than Earth\'s orbital speed. It will leave the Milky Way in ~100 million years.',
    discoveredBy: 'Sergey Koposov et al. (2019), Southern Stellar Stream Spectroscopic Survey (S5)',
    icon: '💨',
    color: '#22c55e',
  },
  oldest: {
    title: 'Oldest Known Star',
    object: 'HD 140283 ("Methuselah Star")',
    value: '13.7 ± 0.7',
    unit: 'billion years old',
    location: '190 light-years away in Libra',
    description: 'HD 140283 is a metal-poor subgiant star with an age estimate close to (or possibly older than) the estimated age of the universe (13.8 Gyr). Its extreme metal-poverty indicates it formed from near-pristine Big Bang material, making it one of the first generation of stars.',
    comparison: 'The Sun is 4.6 billion years old. The universe is 13.8 billion years old. This star was born when the universe was less than 0.5 billion years old. The measurement uncertainty (+0.7 Gyr) makes it consistent with the universe\'s age — barely.',
    discoveredBy: 'Known since 1912; age precisely measured by Howard Bond et al. (2013), Hubble Space Telescope parallax',
    icon: '⏰',
    color: '#f59e0b',
  },
  brightest: {
    title: 'Brightest Object in the Universe',
    object: 'Quasar J0529-4351',
    value: '5 × 10¹⁴',
    unit: 'L☉ (500 trillion times Sun\'s luminosity)',
    location: 'z = 3.962 (~12 billion light-years)',
    description: 'J0529-4351 is a quasar powered by a black hole accreting mass at a rate equivalent to one Sun every day. It is the most luminous object ever discovered, outshining the previous record holder by 3×. At peak, it outshines the entire Milky Way\'s 200+ billion stars combined by a factor of 500 trillion.',
    comparison: 'The Sun\'s luminosity = 3.8 × 10²⁶ W. A typical bright galaxy = 10¹⁰ L☉. The previous brightest quasar (J1007+2115) = 1.5 × 10¹⁴ L☉. This quasar is 3× brighter. If it were 30 light-years away instead of 12 billion, it would outshine the full Moon.',
    discoveredBy: 'Christian Wolf et al. (2024), using VLT X-shooter; confirmed as most luminous object known',
    icon: '✨',
    color: '#fbbf24',
  },
  magnetic: {
    title: 'Strongest Known Magnetic Field',
    object: 'SGR 1806-20 (Magnetar)',
    value: '10¹⁵',
    unit: 'Gauss (100 billion Tesla)',
    location: '50,000 light-years, Sagittarius',
    description: 'SGR 1806-20 is a magnetar — a neutron star with an extraordinarily powerful magnetic field. On December 27, 2004, it released a giant flare: 2 × 10⁴⁶ J in 0.2 seconds — more energy than the Sun emits in 250,000 years. The pulse measurably ionized Earth\'s upper atmosphere from 50,000 light-years away.',
    comparison: 'Earth\'s magnetic field = 0.5 Gauss. Hospital MRI = ~30,000 Gauss. Record lab field = ~45 Tesla (450,000 Gauss). This magnetar\'s field = 10¹⁵ Gauss — 10 billion times stronger than any field we can create. At this field strength, atomic structure breaks down — electrons occupy different orbitals than in normal matter.',
    discoveredBy: 'Originally discovered 1979; 2004 flare characterized by Hurley et al., Palmer et al. in Nature (2005)',
    icon: '🧲',
    color: '#06b6d4',
  },
}

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'hottest', label: 'Hottest', icon: '🔥' },
  { id: 'coldest', label: 'Coldest', icon: '🧊' },
  { id: 'largest', label: 'Largest', icon: '🌐' },
  { id: 'densest', label: 'Densest', icon: '💠' },
  { id: 'fastest', label: 'Fastest', icon: '💨' },
  { id: 'oldest', label: 'Oldest', icon: '⏰' },
  { id: 'brightest', label: 'Brightest', icon: '✨' },
  { id: 'magnetic', label: 'Magnetic', icon: '🧲' },
]

export default function ExtremeUniverse() {
  const [active, setActive] = useState<Category>('hottest')
  const rec = RECORDS[active]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Extreme Universe Records</h2>
      <p className="text-gray-400 text-sm mb-5">The most extreme objects and phenomena ever discovered — reality that outstrips imagination</p>

      {/* Category buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActive(cat.id)}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: active === cat.id ? RECORDS[cat.id].color + '20' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${active === cat.id ? RECORDS[cat.id].color + '60' : 'rgba(255,255,255,0.05)'}`,
              color: active === cat.id ? RECORDS[cat.id].color : '#94a3b8',
            }}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Record detail */}
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-xl p-5" style={{ background: rec.color + '10', border: `1px solid ${rec.color}35` }}>
          <div className="flex items-start gap-4">
            <span className="text-5xl">{rec.icon}</span>
            <div className="flex-1">
              <div className="text-xs uppercase font-semibold mb-1" style={{ color: rec.color }}>{rec.title}</div>
              <h3 className="text-xl font-bold text-white mb-1">{rec.object}</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black" style={{ color: rec.color }}>{rec.value}</span>
                <span className="text-gray-400 text-sm">{rec.unit}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span>📍</span>
            <span>{rec.location}</span>
          </div>
        </div>

        {/* Description */}
        <div className="bg-gray-800/60 rounded-xl p-4">
          <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What It Is</div>
          <p className="text-gray-200 text-sm leading-relaxed">{rec.description}</p>
        </div>

        {/* Comparison */}
        <div className="bg-gray-800/60 rounded-xl p-4">
          <div className="text-gray-400 text-xs uppercase font-semibold mb-2">How Extreme — Put In Perspective</div>
          <p className="text-gray-300 text-sm leading-relaxed">{rec.comparison}</p>
        </div>

        {/* Discovery */}
        <div className="rounded-xl p-4" style={{ background: rec.color + '06', border: `1px solid ${rec.color}20` }}>
          <div className="text-xs uppercase font-semibold mb-2" style={{ color: rec.color }}>Discovery</div>
          <p className="text-gray-300 text-sm">{rec.discoveredBy}</p>
        </div>
      </div>
    </div>
  )
}
