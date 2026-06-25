import { useState, useRef, useCallback, useEffect } from 'react'

// ─── Data ──────────────────────────────────────────────────────────────────────

interface ScaleObject {
  id: string
  name: string
  exponent: number          // log10 of size in meters
  sizeMeters: number        // exact size in meters
  humanSize: string         // friendly description
  description: string
  facts: [string, string, string]
  color: string
  svgType: 'dot' | 'circle' | 'ring' | 'spiral' | 'cluster' | 'grid' | 'helix' | 'star'
}

const SCALE_OBJECTS: ScaleObject[] = [
  {
    id: 'proton',
    name: 'Proton',
    exponent: -15,
    sizeMeters: 1e-15,
    humanSize: '0.000000000000001 mm',
    description: 'A proton sits at the heart of every atomic nucleus.',
    facts: [
      'A proton is roughly 100,000 times smaller than the atom that contains it.',
      'Protons are made of three quarks held together by the strong nuclear force.',
      'If an atom were the size of a football stadium, the nucleus would be a grain of sand at the centre.',
    ],
    color: '#f472b6',
    svgType: 'dot',
  },
  {
    id: 'nucleus',
    name: 'Atomic Nucleus',
    exponent: -14,
    sizeMeters: 1e-14,
    humanSize: '0.00000000001 mm',
    description: 'The dense core of an atom, containing protons and neutrons.',
    facts: [
      'Atomic nuclei contain almost all the mass of an atom in an incredibly tiny volume.',
      'The nuclear density is about 10¹⁷ kg/m³ — a teaspoon would weigh 100 million tons.',
      'Larger atoms have nuclei approaching 10 femtometres (10⁻¹⁴ m) across.',
    ],
    color: '#fb923c',
    svgType: 'circle',
  },
  {
    id: 'hydrogen',
    name: 'Hydrogen Atom',
    exponent: -10,
    sizeMeters: 5.3e-11,
    humanSize: '~0.05 nanometres (Bohr radius)',
    description: 'The simplest atom: one proton orbited by one electron.',
    facts: [
      'The Bohr radius of hydrogen is 5.29×10⁻¹¹ m — the most probable electron distance.',
      'Hydrogen is the most abundant element in the universe, making up ~75% of all normal matter.',
      'The electron cloud around the nucleus is mostly empty space.',
    ],
    color: '#a78bfa',
    svgType: 'ring',
  },
  {
    id: 'dna',
    name: 'DNA Double Helix',
    exponent: -9,
    sizeMeters: 2e-9,
    humanSize: '2 nanometres wide',
    description: 'The molecule of life — a twisted ladder carrying genetic information.',
    facts: [
      'Human DNA stretched end-to-end would reach from Earth to the Sun and back ~300 times.',
      'The double helix was first described by Watson and Crick in 1953 using X-ray data from Franklin.',
      'There are ~3.2 billion base pairs in the human genome, encoding ~20,000 genes.',
    ],
    color: '#34d399',
    svgType: 'helix',
  },
  {
    id: 'bacteria',
    name: 'Bacterium',
    exponent: -6,
    sizeMeters: 1e-6,
    humanSize: '1 micrometre (μm)',
    description: 'A single-celled microorganism — the most numerous life form on Earth.',
    facts: [
      'The human body hosts roughly 38 trillion bacteria — similar to the number of human cells.',
      'Some bacteria can survive in boiling water, acid, and even the vacuum of space.',
      'Bacteria reproduce by binary fission and can double in number every 20 minutes.',
    ],
    color: '#4ade80',
    svgType: 'circle',
  },
  {
    id: 'sand',
    name: 'Grain of Sand',
    exponent: -3,
    sizeMeters: 1e-3,
    humanSize: '1 millimetre',
    description: 'A tiny fragment of eroded rock — the building block of beaches and deserts.',
    facts: [
      'There are an estimated 7.5×10¹⁸ grains of sand on all Earth\'s beaches — fewer than stars in the observable universe.',
      'Sand grains are typically made of quartz (silicon dioxide), worn smooth by water and wind over millions of years.',
      'The Sahara Desert covers 9.2 million km² — yet has far fewer grains of sand than Earth\'s oceans.',
    ],
    color: '#fbbf24',
    svgType: 'dot',
  },
  {
    id: 'human',
    name: 'Human',
    exponent: 0,
    sizeMeters: 1.7,
    humanSize: '1.7 metres tall',
    description: 'A species capable of understanding the cosmos from quantum to galactic scales.',
    facts: [
      'The human body contains ~37 trillion cells and ~7×10²⁷ atoms.',
      'If every atom in a human were the size of a blueberry, the person would be larger than the Earth.',
      'Humans are roughly midway on the logarithmic scale between a proton and the observable universe.',
    ],
    color: '#60a5fa',
    svgType: 'grid',
  },
  {
    id: 'everest',
    name: 'Mount Everest',
    exponent: 3,
    sizeMeters: 8849,
    humanSize: '8,849 metres — tallest peak on Earth',
    description: 'The highest mountain above sea level, on the border of Nepal and Tibet.',
    facts: [
      'Everest grows about 4 mm per year due to the Indian tectonic plate pushing northward.',
      'The summit has only one-third of the atmospheric pressure at sea level — breathing is extremely difficult.',
      'By underwater base measurement, Mauna Kea in Hawaii is taller than Everest at ~10,000 m total.',
    ],
    color: '#94a3b8',
    svgType: 'grid',
  },
  {
    id: 'earth',
    name: 'Earth',
    exponent: 7,
    sizeMeters: 1.2742e7,
    humanSize: '12,742 km diameter',
    description: 'Our home planet — a pale blue dot in the cosmic ocean.',
    facts: [
      'Earth is the densest planet in the solar system (5.51 g/cm³) and the only one known to harbour life.',
      'The surface area of Earth is ~510 million km² — only 29% is land.',
      'Earth\'s magnetic field, generated by its molten iron core, deflects deadly solar radiation.',
    ],
    color: '#3b82f6',
    svgType: 'circle',
  },
  {
    id: 'earth-moon',
    name: 'Earth–Moon System',
    exponent: 9,
    sizeMeters: 3.844e8,
    humanSize: '384,400 km — Earth to Moon distance',
    description: 'The average distance between Earth and its natural satellite.',
    facts: [
      'The Moon is receding from Earth at ~3.8 cm per year due to tidal interactions.',
      'The Moon is large enough relative to Earth that scientists sometimes call them a "double planet."',
      'All human Moon landings (Apollo 11–17) occurred between 1969 and 1972.',
    ],
    color: '#e2e8f0',
    svgType: 'ring',
  },
  {
    id: 'sun',
    name: 'The Sun',
    exponent: 11,
    sizeMeters: 1.391e9,
    humanSize: '1.39 million km diameter',
    description: 'Our star — a medium-sized ball of plasma 4.6 billion years old.',
    facts: [
      'The Sun contains 99.86% of all the mass in the solar system.',
      'Core temperature reaches 15 million °C; the surface (photosphere) is ~5,500 °C.',
      'Light takes 8 minutes 20 seconds to travel from the Sun\'s surface to Earth.',
    ],
    color: '#fbbf24',
    svgType: 'star',
  },
  {
    id: 'earth-sun',
    name: 'Earth–Sun Distance (1 AU)',
    exponent: 12,
    sizeMeters: 1.496e11,
    humanSize: '149.6 million km — 1 Astronomical Unit',
    description: 'The mean distance from Earth to the Sun, used as the fundamental unit in astronomy.',
    facts: [
      'Light travels this distance in exactly 8 minutes and 20 seconds.',
      'The AU was first accurately measured by timing the 1769 transit of Venus across the Sun.',
      'Neptune orbits at 30 AU; Pluto at ~39 AU; Voyager 1 is now beyond 160 AU.',
    ],
    color: '#f59e0b',
    svgType: 'ring',
  },
  {
    id: 'solar-system-jupiter',
    name: 'Solar System to Jupiter',
    exponent: 13,
    sizeMeters: 7.783e11,
    humanSize: '5.2 AU — Jupiter\'s orbital radius',
    description: 'The distance to the largest planet in our solar system.',
    facts: [
      'Jupiter is so massive it barely qualifies as not a star — it would need ~80× more mass to fuse hydrogen.',
      'The Great Red Spot, a storm larger than Earth, has raged for at least 350 years.',
      'Jupiter\'s gravity acts as a "shield," deflecting many comets away from the inner solar system.',
    ],
    color: '#d97706',
    svgType: 'ring',
  },
  {
    id: 'lightyear',
    name: '1 Light-Year',
    exponent: 16,
    sizeMeters: 9.461e15,
    humanSize: '9.46 trillion km',
    description: 'The distance light travels in one year through a vacuum.',
    facts: [
      'Even at Voyager 1\'s speed of 17 km/s, reaching 1 light-year would take ~17,000 years.',
      'The Oort Cloud, source of long-period comets, extends to ~1 light-year from the Sun.',
      'The nearest star system, Alpha Centauri, is 4.37 light-years away.',
    ],
    color: '#c084fc',
    svgType: 'dot',
  },
  {
    id: 'proxima',
    name: 'Proxima Centauri',
    exponent: 16,
    sizeMeters: 4.014e16,
    humanSize: '4.24 light-years — nearest star',
    description: 'The closest star to our Sun — a red dwarf with at least one confirmed planet.',
    facts: [
      'Proxima Centauri b orbits in the habitable zone, but intense stellar flares may strip away any atmosphere.',
      'At our fastest spacecraft speeds today, it would take ~70,000 years to reach Proxima Centauri.',
      'Proxima is gravitationally bound to the larger Alpha Centauri A and B binary system.',
    ],
    color: '#f87171',
    svgType: 'star',
  },
  {
    id: 'milky-way',
    name: 'Milky Way Galaxy',
    exponent: 20,
    sizeMeters: 9.461e19,
    humanSize: '~100,000 light-years wide',
    description: 'Our home galaxy — a barred spiral containing 200–400 billion stars.',
    facts: [
      'The Milky Way takes ~225 million years to complete one rotation around its centre (a "galactic year").',
      'At its heart lies Sagittarius A*, a supermassive black hole 4 million times the mass of the Sun.',
      'There are an estimated 2 trillion galaxies in the observable universe.',
    ],
    color: '#818cf8',
    svgType: 'spiral',
  },
  {
    id: 'andromeda',
    name: 'Andromeda Galaxy',
    exponent: 22,
    sizeMeters: 2.4e22,
    humanSize: '2.537 million light-years away',
    description: 'Our nearest major galactic neighbour — destined to collide with the Milky Way.',
    facts: [
      'Andromeda is on a collision course with the Milky Way, expected to merge in ~4.5 billion years.',
      'It contains ~1 trillion stars — more than the Milky Way.',
      'On a dark night, Andromeda is the most distant object visible to the naked eye.',
    ],
    color: '#a5b4fc',
    svgType: 'spiral',
  },
  {
    id: 'local-group',
    name: 'Local Group',
    exponent: 23,
    sizeMeters: 9.461e22,
    humanSize: '~10 million light-years across',
    description: 'The cluster of ~80 galaxies including the Milky Way and Andromeda.',
    facts: [
      'The Local Group is gravitationally bound and will not be torn apart by the expansion of the universe.',
      'The two largest members — Milky Way and Andromeda — dominate, with dozens of dwarf galaxies orbiting them.',
      'The Large and Small Magellanic Clouds are dwarf galaxies visible from Earth\'s southern hemisphere.',
    ],
    color: '#7dd3fc',
    svgType: 'cluster',
  },
  {
    id: 'virgo-supercluster',
    name: 'Virgo Supercluster',
    exponent: 24,
    sizeMeters: 4.9e24,
    humanSize: '~520 million light-years across',
    description: 'The enormous supercluster of galaxies that contains our Local Group.',
    facts: [
      'The Virgo Supercluster (also called Laniakea) contains ~100,000 galaxies.',
      'Laniakea means "immeasurable heaven" in Hawaiian.',
      'Our Local Group sits on the outer edge of Laniakea, moving toward the Great Attractor.',
    ],
    color: '#67e8f9',
    svgType: 'cluster',
  },
  {
    id: 'observable-universe',
    name: 'Observable Universe',
    exponent: 26,
    sizeMeters: 8.8e26,
    humanSize: '93 billion light-years diameter',
    description: 'Everything we can observe — limited by the distance light has travelled in 13.8 billion years.',
    facts: [
      'The observable universe contains an estimated 2 trillion galaxies and 10²⁴ stars.',
      'Because the universe is expanding, the edge of what we can observe is 46.5 billion light-years away — not just 13.8 billion.',
      'Beyond the observable universe, space almost certainly continues — possibly infinitely.',
    ],
    color: '#e879f9',
    svgType: 'circle',
  },
]

const MIN_EXP = -15
const MAX_EXP = 26

// ─── SVG Illustrations ─────────────────────────────────────────────────────────

function ObjectIllustration({ obj, size = 160 }: { obj: ScaleObject; size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const color = obj.color

  switch (obj.svgType) {
    case 'dot':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.9} />
          <circle cx={cx} cy={cy} r={12} fill={color} opacity={0.15} />
          <circle cx={cx} cy={cy} r={20} fill={color} opacity={0.07} />
        </svg>
      )

    case 'circle':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.15} stroke={color} strokeWidth={2} />
          <circle cx={cx} cy={cy} r={r * 0.5} fill={color} opacity={0.25} />
          <circle cx={cx} cy={cy} r={r * 0.2} fill={color} opacity={0.6} />
        </svg>
      )

    case 'ring':
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} strokeDasharray="6 3" />
          <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke={color} strokeWidth={1} opacity={0.25} strokeDasharray="4 4" />
          <circle cx={cx} cy={cy} r={10} fill={color} opacity={0.7} />
          {/* orbiting dot */}
          <circle cx={cx + r} cy={cy} r={5} fill={color} opacity={0.85} />
        </svg>
      )

    case 'star': {
      const rays = 8
      const points: string[] = []
      for (let i = 0; i < rays * 2; i++) {
        const angle = (Math.PI / rays) * i - Math.PI / 2
        const rr = i % 2 === 0 ? r : r * 0.45
        points.push(`${cx + Math.cos(angle) * rr},${cy + Math.sin(angle) * rr}`)
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={points.join(' ')} fill={color} opacity={0.25} />
          <circle cx={cx} cy={cy} r={r * 0.4} fill={color} opacity={0.6} />
          <circle cx={cx} cy={cy} r={r * 0.15} fill="#fff" opacity={0.8} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const a = (Math.PI * 2 / 8) * i
            const rd = r * 1.05
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * r * 0.45}
                y1={cy + Math.sin(a) * r * 0.45}
                x2={cx + Math.cos(a) * rd}
                y2={cy + Math.sin(a) * rd}
                stroke={color}
                strokeWidth={1}
                opacity={0.4}
              />
            )
          })}
        </svg>
      )
    }

    case 'helix': {
      const points1: string[] = []
      const points2: string[] = []
      const rungs: { x1: number; y1: number; x2: number; y2: number }[] = []
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = cx - r * 0.5 + t * r
        const yOffset = Math.sin(t * Math.PI * 4) * r * 0.35
        points1.push(`${x},${cy + yOffset}`)
        points2.push(`${x},${cy - yOffset}`)
        if (i % 3 === 0) {
          rungs.push({ x1: x, y1: cy + yOffset, x2: x, y2: cy - yOffset })
        }
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {rungs.map((rung, i) => (
            <line key={i} x1={rung.x1} y1={rung.y1} x2={rung.x2} y2={rung.y2}
              stroke={color} strokeWidth={1} opacity={0.35} />
          ))}
          <polyline points={points1.join(' ')} fill="none" stroke={color} strokeWidth={2.5} opacity={0.8} strokeLinecap="round" />
          <polyline points={points2.join(' ')} fill="none" stroke={color} strokeWidth={2.5} opacity={0.5} strokeLinecap="round" />
        </svg>
      )
    }

    case 'spiral': {
      const spiralPoints: string[] = []
      const arms = 120
      for (let i = 0; i <= arms; i++) {
        const t = i / arms
        const angle = t * Math.PI * 6
        const rr = t * r * 0.9
        spiralPoints.push(`${cx + Math.cos(angle) * rr},${cy + Math.sin(angle) * rr}`)
      }
      const spiralPoints2: string[] = []
      for (let i = 0; i <= arms; i++) {
        const t = i / arms
        const angle = t * Math.PI * 6 + Math.PI
        const rr = t * r * 0.9
        spiralPoints2.push(`${cx + Math.cos(angle) * rr},${cy + Math.sin(angle) * rr}`)
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.05} />
          <polyline points={spiralPoints.join(' ')} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
          <polyline points={spiralPoints2.join(' ')} fill="none" stroke={color} strokeWidth={1.5} opacity={0.45} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={5} fill={color} opacity={0.9} />
        </svg>
      )
    }

    case 'cluster': {
      const dots = [
        { x: cx, y: cy, r: 6 },
        { x: cx - 22, y: cy - 18, r: 4 },
        { x: cx + 25, y: cy - 12, r: 5 },
        { x: cx - 30, y: cy + 20, r: 3 },
        { x: cx + 18, y: cy + 24, r: 4 },
        { x: cx - 10, y: cy + 35, r: 2 },
        { x: cx + 38, y: cy + 8, r: 3 },
        { x: cx - 38, y: cy - 5, r: 3 },
        { x: cx + 10, y: cy - 38, r: 2 },
        { x: cx - 18, y: cy + 5, r: 2 },
      ]
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.05} />
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={color} opacity={0.6 + i * 0.03} />
          ))}
        </svg>
      )
    }

    case 'grid': {
      const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
      const cols = 5
      const rows = 7
      const gw = r * 1.4
      const gh = r * 1.6
      const sx = cx - gw / 2
      const sy = cy - gh / 2
      for (let i = 0; i <= cols; i++) {
        const x = sx + (gw / cols) * i
        lines.push({ x1: x, y1: sy, x2: x, y2: sy + gh })
      }
      for (let j = 0; j <= rows; j++) {
        const y = sy + (gh / rows) * j
        lines.push({ x1: sx, y1: y, x2: sx + gw, y2: y })
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {lines.map((ln, i) => (
            <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
              stroke={color} strokeWidth={0.8} opacity={0.3} />
          ))}
          <rect x={sx} y={sy} width={gw} height={gh} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5} rx={2} />
        </svg>
      )
    }

    default:
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.3} />
        </svg>
      )
  }
}

// ─── Two-object comparison SVG ─────────────────────────────────────────────────

function ComparisonView({ objA, objB }: { objA: ScaleObject; objB: ScaleObject }) {
  const logA = Math.log10(objA.sizeMeters)
  const logB = Math.log10(objB.sizeMeters)
  const minLog = Math.min(logA, logB)
  const maxLog = Math.max(logA, logB)
  const span = maxLog - minLog || 1

  // Normalize radii into [4, 70] pixel range logarithmically
  const MAX_R = 70
  const MIN_R = 4
  const rA = MIN_R + ((logA - minLog) / span) * (MAX_R - MIN_R)
  const rB = MIN_R + ((logB - minLog) / span) * (MAX_R - MIN_R)

  const W = 340
  const H = 180
  const midY = H / 2

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto">
      {/* Object A */}
      <circle cx={W * 0.28} cy={midY} r={rA} fill={objA.color} opacity={0.3} stroke={objA.color} strokeWidth={1.5} />
      <circle cx={W * 0.28} cy={midY} r={Math.min(rA * 0.4, 6)} fill={objA.color} opacity={0.8} />
      <text x={W * 0.28} y={midY + rA + 16} textAnchor="middle" fill={objA.color}
        fontSize={11} fontFamily="inherit" opacity={0.9}>{objA.name}</text>

      {/* VS label */}
      <text x={W * 0.5} y={midY + 5} textAnchor="middle" fill="rgba(255,255,255,0.3)"
        fontSize={13} fontFamily="inherit" fontWeight="bold">vs</text>

      {/* Object B */}
      <circle cx={W * 0.72} cy={midY} r={rB} fill={objB.color} opacity={0.3} stroke={objB.color} strokeWidth={1.5} />
      <circle cx={W * 0.72} cy={midY} r={Math.min(rB * 0.4, 6)} fill={objB.color} opacity={0.8} />
      <text x={W * 0.72} y={midY + rB + 16} textAnchor="middle" fill={objB.color}
        fontSize={11} fontFamily="inherit" opacity={0.9}>{objB.name}</text>

      {/* Scale ratio annotation */}
      {span > 0.5 && (
        <text x={W / 2} y={20} textAnchor="middle" fill="rgba(255,255,255,0.4)"
          fontSize={10} fontFamily="inherit">
          {`ratio: 10^${Math.round(Math.abs(logA - logB))} : 1`}
        </text>
      )}
    </svg>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function expToSlider(exp: number): number {
  return ((exp - MIN_EXP) / (MAX_EXP - MIN_EXP)) * 100
}

function sliderToExp(val: number): number {
  return MIN_EXP + (val / 100) * (MAX_EXP - MIN_EXP)
}

function findNearestObject(exp: number): ScaleObject {
  let best = SCALE_OBJECTS[0]
  let bestDist = Math.abs(SCALE_OBJECTS[0].exponent - exp)
  for (const obj of SCALE_OBJECTS) {
    const dist = Math.abs(obj.exponent - exp)
    if (dist < bestDist) {
      bestDist = dist
      best = obj
    }
  }
  return best
}

function formatExp(exp: number): string {
  const rounded = Math.round(exp)
  if (rounded >= 0) return `10⁺${rounded} m`.replace('⁺', rounded === 0 ? '' : '+')
  const sup = String(Math.abs(rounded)).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[parseInt(c)]).join('')
  return `10⁻${sup} m`
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CosmicScale() {
  const [sliderVal, setSliderVal] = useState(expToSlider(0)) // start at human scale
  const [compareA, setCompareA] = useState('earth')
  const [compareB, setCompareB] = useState('sun')
  const [isPlaying, setIsPlaying] = useState(false)
  const [showCompare, setShowCompare] = useState(false)

  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const startValRef = useRef<number>(0)

  const currentExp = sliderToExp(sliderVal)
  const currentObj = findNearestObject(currentExp)

  const objA = SCALE_OBJECTS.find(o => o.id === compareA) ?? SCALE_OBJECTS[8]
  const objB = SCALE_OBJECTS.find(o => o.id === compareB) ?? SCALE_OBJECTS[10]

  // Journey auto-play: atom (~10⁻¹⁰) → universe (10²⁶) over 30 s
  const JOURNEY_START_EXP = -10
  const JOURNEY_END_EXP = 26
  const JOURNEY_DURATION_MS = 30000

  const stopJourney = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    startTimeRef.current = null
    setIsPlaying(false)
  }, [])

  const tickJourney = useCallback((ts: number) => {
    if (startTimeRef.current === null) {
      startTimeRef.current = ts
      startValRef.current = expToSlider(JOURNEY_START_EXP)
    }
    const elapsed = ts - startTimeRef.current
    const frac = Math.min(elapsed / JOURNEY_DURATION_MS, 1)
    const targetExp = JOURNEY_START_EXP + frac * (JOURNEY_END_EXP - JOURNEY_START_EXP)
    setSliderVal(expToSlider(targetExp))

    if (frac < 1) {
      rafRef.current = requestAnimationFrame(tickJourney)
    } else {
      stopJourney()
    }
  }, [stopJourney])

  const startJourney = useCallback(() => {
    stopJourney()
    setIsPlaying(true)
    startTimeRef.current = null
    rafRef.current = requestAnimationFrame(tickJourney)
  }, [tickJourney, stopJourney])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPlaying) stopJourney()
    setSliderVal(Number(e.target.value))
  }

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="icon-box">🔭</div>
        <div>
          <h3 className="text-white font-bold text-lg">Scale of the Universe</h3>
          <p className="text-gray-500 text-xs">From quantum to cosmic — drag to explore</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={showCompare ? () => setShowCompare(false) : () => setShowCompare(true)}
            className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
            style={{
              background: showCompare ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showCompare ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: showCompare ? '#a5b4fc' : '#6b7280',
            }}
          >
            Compare
          </button>
          <button
            onClick={isPlaying ? stopJourney : startJourney}
            className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
            style={{
              background: isPlaying ? 'rgba(239,68,68,0.15)' : 'rgba(74,222,128,0.1)',
              border: `1px solid ${isPlaying ? 'rgba(239,68,68,0.4)' : 'rgba(74,222,128,0.35)'}`,
              color: isPlaying ? '#f87171' : '#4ade80',
            }}
          >
            {isPlaying ? '⏹ Stop' : '▶ Journey'}
          </button>
        </div>
      </div>

      {/* Main display area */}
      <div className="flex gap-6 mb-6 items-center">
        {/* SVG illustration */}
        <div
          className="flex-shrink-0 rounded-2xl flex items-center justify-center"
          style={{
            width: 160,
            height: 160,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${currentObj.color}22`,
            boxShadow: `0 0 40px ${currentObj.color}18`,
          }}
        >
          <ObjectIllustration obj={currentObj} size={140} />
        </div>

        {/* Info panel */}
        <div className="flex-1 min-w-0">
          <div
            className="text-xs font-mono mb-1"
            style={{ color: currentObj.color }}
          >
            {formatExp(currentExp)}
          </div>
          <h2 className="text-white text-xl font-black mb-1 leading-tight">{currentObj.name}</h2>
          <div
            className="text-xs mb-2 font-medium"
            style={{ color: currentObj.color, opacity: 0.8 }}
          >
            {currentObj.humanSize}
          </div>
          <p className="text-gray-400 text-sm leading-relaxed">{currentObj.description}</p>
        </div>
      </div>

      {/* Slider */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-600 mb-2 font-mono">
          <span>10⁻¹⁵ m (proton)</span>
          <span>10²⁶ m (universe)</span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={sliderVal}
            onChange={handleSliderChange}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${currentObj.color} 0%, ${currentObj.color} ${sliderVal}%, rgba(255,255,255,0.08) ${sliderVal}%, rgba(255,255,255,0.08) 100%)`,
              accentColor: currentObj.color,
            }}
          />
        </div>
        {/* Scale tick marks */}
        <div className="flex justify-between mt-1 px-0.5">
          {[-15, -10, -6, -3, 0, 3, 7, 11, 16, 20, 26].map(exp => (
            <button
              key={exp}
              onClick={() => { if (isPlaying) stopJourney(); setSliderVal(expToSlider(exp)) }}
              className="text-[9px] text-gray-700 hover:text-gray-400 transition-colors font-mono"
              title={`Jump to 10^${exp} m`}
            >
              {exp}
            </button>
          ))}
        </div>
      </div>

      {/* Fun facts */}
      <div
        className="rounded-2xl p-4 mb-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="text-xs font-semibold mb-3" style={{ color: currentObj.color }}>
          Fun Facts
        </div>
        <div className="space-y-2">
          {currentObj.facts.map((fact, i) => (
            <div key={i} className="flex gap-2 text-xs text-gray-400 leading-relaxed">
              <span style={{ color: currentObj.color, opacity: 0.7, flexShrink: 0 }}>
                {i === 0 ? '①' : i === 1 ? '②' : '③'}
              </span>
              <span>{fact}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Compare mode */}
      {showCompare && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}
        >
          <div className="text-xs font-semibold text-indigo-400 mb-3">Compare Two Objects</div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Object A</label>
              <select
                value={compareA}
                onChange={e => setCompareA(e.target.value)}
                className="w-full text-xs rounded-xl px-3 py-2 font-medium"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0',
                }}
              >
                {SCALE_OBJECTS.map(o => (
                  <option key={o.id} value={o.id} style={{ background: '#1e1b4b' }}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Object B</label>
              <select
                value={compareB}
                onChange={e => setCompareB(e.target.value)}
                className="w-full text-xs rounded-xl px-3 py-2 font-medium"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0',
                }}
              >
                {SCALE_OBJECTS.map(o => (
                  <option key={o.id} value={o.id} style={{ background: '#1e1b4b' }}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ComparisonView objA={objA} objB={objB} />
          <div className="flex justify-between mt-3 text-xs text-gray-500">
            <span style={{ color: objA.color }}>{objA.humanSize}</span>
            <span style={{ color: objB.color }}>{objB.humanSize}</span>
          </div>
        </div>
      )}
    </div>
  )
}
