import { useState, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface DwarfPlanet {
  id: string
  name: string
  emoji: string
  color: string
  belt: 'kuiper' | 'asteroid'
  diameterKm: number
  diameterNote: string
  distanceAU: string
  orbitalPeriodYears: number
  moons: string[]
  surfaceTempC: number
  discoveryYear: number
  funFacts: [string, string]
  extraBadges: string[]
}

// ── Data ─────────────────────────────────────────────────────────────────────

const EARTH_DIAMETER_KM = 12742

const DWARF_PLANETS: DwarfPlanet[] = [
  {
    id: 'pluto',
    name: 'Pluto',
    emoji: '🩷',
    color: '#e879a0',
    belt: 'kuiper',
    diameterKm: 2377,
    diameterNote: '2,377 km',
    distanceAU: '39.5 AU (avg)',
    orbitalPeriodYears: 248,
    moons: ['Charon', 'Nix', 'Hydra', 'Kerberos', 'Styx'],
    surfaceTempC: -230,
    discoveryYear: 1930,
    funFacts: [
      'Features a heart-shaped region called Tombaugh Regio, covered in nitrogen ice — visible from space!',
      "Charon (1,212 km wide) is so large relative to Pluto that they're considered a binary dwarf planet system — both orbit a point in empty space between them.",
    ],
    extraBadges: ['Reclassified 2006', '5 Moons', 'Binary System'],
  },
  {
    id: 'eris',
    name: 'Eris',
    emoji: '⚪',
    color: '#94a3b8',
    belt: 'kuiper',
    diameterKm: 2326,
    diameterNote: '2,326 km',
    distanceAU: '38.3–97.7 AU',
    orbitalPeriodYears: 559,
    moons: ['Dysnomia'],
    surfaceTempC: -240,
    discoveryYear: 2005,
    funFacts: [
      "Eris's discovery in 2005 directly triggered the IAU debate that reclassified Pluto as a dwarf planet in 2006 — astronomers couldn't call them both planets.",
      "Despite being slightly smaller in diameter, Eris is about 27% more massive than Pluto, making it the most massive known dwarf planet.",
    ],
    extraBadges: ['Pluto Rival', 'Most Massive', 'Scattered Disc'],
  },
  {
    id: 'haumea',
    name: 'Haumea',
    emoji: '🥚',
    color: '#a16207',
    belt: 'kuiper',
    diameterKm: 1560,
    diameterNote: '1,560×996×996 km (oblong)',
    distanceAU: '43.3 AU',
    orbitalPeriodYears: 285,
    moons: ['Hiʻiaka', 'Namaka'],
    surfaceTempC: -241,
    discoveryYear: 2004,
    funFacts: [
      'Haumea spins faster than any other large body in the solar system — a day lasts only 3.9 hours! This extreme spin has stretched it into a rugby-ball shape.',
      "Haumea is the only dwarf planet beyond Neptune known to have a ring system, discovered in 2017 during a stellar occultation.",
    ],
    extraBadges: ['Has Ring!', 'Fastest Spin', 'Oblong Shape'],
  },
  {
    id: 'makemake',
    name: 'Makemake',
    emoji: '🟤',
    color: '#7f1d1d',
    belt: 'kuiper',
    diameterKm: 1430,
    diameterNote: '~1,430 km',
    distanceAU: '45.8 AU',
    orbitalPeriodYears: 310,
    moons: ['MK2 (S/2015)'],
    surfaceTempC: -239,
    discoveryYear: 2005,
    funFacts: [
      "Makemake is named after the Rapanui (Easter Island) deity of creation and fertility — its discovery near Easter 2005 inspired the name.",
      "For 10 years astronomers thought Makemake had no moons. In 2016 Hubble discovered MK2, a tiny dark moon just 175 km wide hiding in Makemake's glare.",
    ],
    extraBadges: ['2nd Brightest KBO', 'Polynesian Name', 'KBO'],
  },
  {
    id: 'ceres',
    name: 'Ceres',
    emoji: '🔵',
    color: '#4d7c4f',
    belt: 'asteroid',
    diameterKm: 939,
    diameterNote: '939 km',
    distanceAU: '2.77 AU',
    orbitalPeriodYears: 4.6,
    moons: [],
    surfaceTempC: -105,
    discoveryYear: 1801,
    funFacts: [
      "Occator Crater hosts Ceres's famous bright spots — highly reflective salt (sodium carbonate) and water deposits that suggest ancient briny water activity.",
      "NASA's Dawn spacecraft orbited Ceres from 2015–2018, finding evidence of liquid brines beneath the surface as recently as a few million years ago.",
    ],
    extraBadges: ['Inner Solar System', 'Visited by Dawn', 'No Moons', 'Oldest Discovery'],
  },
  {
    id: 'gonggong',
    name: 'Gonggong',
    emoji: '🔴',
    color: '#991b1b',
    belt: 'kuiper',
    diameterKm: 1230,
    diameterNote: '~1,230 km',
    distanceAU: '34–97 AU',
    orbitalPeriodYears: 554,
    moons: ['Xiangliu'],
    surfaceTempC: -230,
    discoveryYear: 2007,
    funFacts: [
      "Gonggong is one of the reddest known Kuiper Belt objects — its deep red color likely comes from tholins, complex organic molecules created by radiation striking methane ice.",
      "Named after a Chinese water god known for causing chaos, Gonggong has a highly inclined and elongated orbit that takes it from 34 AU to nearly 100 AU from the Sun.",
    ],
    extraBadges: ['Reddest KBO', 'High Inclination', 'Chinese Mythology'],
  },
]

// ── Size circle helper ────────────────────────────────────────────────────────

const MAX_DISPLAY_PX = 72  // max px for largest object (Pluto)
const EARTH_DISPLAY_PX = Math.round(MAX_DISPLAY_PX * (EARTH_DIAMETER_KM / DWARF_PLANETS[0].diameterKm))

function circlePx(diameterKm: number): number {
  // Scale relative to Pluto (largest) at MAX_DISPLAY_PX
  const largest = Math.max(...DWARF_PLANETS.map(d => d.diameterKm))
  return Math.max(8, Math.round((diameterKm / largest) * MAX_DISPLAY_PX))
}

// ── Comparison lineup ─────────────────────────────────────────────────────────

interface ComparisonProps {
  planets: DwarfPlanet[]
  highlighted: string | null
  onSelect: (id: string) => void
}

function ComparisonLineup({ planets, highlighted, onSelect }: ComparisonProps) {
  const earthPx = Math.min(EARTH_DISPLAY_PX, 90)

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4">
        Size comparison (relative to Earth)
      </p>
      <div className="flex items-end gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {/* Earth reference */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <svg width={earthPx} height={earthPx} viewBox={`0 0 ${earthPx} ${earthPx}`}>
            <circle
              cx={earthPx / 2}
              cy={earthPx / 2}
              r={earthPx / 2 - 1}
              fill="rgba(59,130,246,0.2)"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </svg>
          <span className="text-[9px] text-blue-400 font-semibold whitespace-nowrap">Earth</span>
          <span className="text-[8px] text-gray-600">12,742 km</span>
        </div>

        {/* Dwarf planets */}
        {planets.map(p => {
          const px = circlePx(p.diameterKm)
          const isHL = highlighted === p.id
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex flex-col items-center gap-2 flex-shrink-0 transition-all"
              style={{ opacity: highlighted && !isHL ? 0.45 : 1 }}
              title={`${p.name} — click to scroll to card`}
            >
              <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
                <circle
                  cx={px / 2}
                  cy={px / 2}
                  r={px / 2 - 1}
                  fill={`${p.color}30`}
                  stroke={p.color}
                  strokeWidth={isHL ? 2 : 1.5}
                  style={{ filter: isHL ? `drop-shadow(0 0 6px ${p.color})` : undefined }}
                />
              </svg>
              <span
                className="text-[9px] font-semibold whitespace-nowrap"
                style={{ color: isHL ? p.color : '#9ca3af' }}
              >
                {p.emoji} {p.name}
              </span>
              <span className="text-[8px] text-gray-600 whitespace-nowrap">{p.diameterNote.split(' ')[0]} km</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Individual card ───────────────────────────────────────────────────────────

interface CardProps {
  planet: DwarfPlanet
  highlighted: boolean
  cardRef: React.RefObject<HTMLDivElement | null>
}

function DwarfPlanetCard({ planet: p, highlighted, cardRef }: CardProps) {
  const [expanded, setExpanded] = useState(false)
  const px = circlePx(p.diameterKm)

  return (
    <div
      ref={cardRef}
      className="space-card p-6 transition-all"
      style={highlighted ? { borderColor: `${p.color}60`, boxShadow: `0 0 32px ${p.color}22` } : undefined}
    >
      {/* Header row */}
      <div className="flex items-start gap-4 mb-5">
        {/* Size SVG */}
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 80, height: 80 }}>
          <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
            <defs>
              <radialGradient id={`grad-${p.id}`} cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor={p.color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={p.color} stopOpacity="0.2" />
              </radialGradient>
            </defs>
            <circle
              cx={px / 2}
              cy={px / 2}
              r={px / 2 - 1}
              fill={`url(#grad-${p.id})`}
              stroke={p.color}
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* Name & badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-2xl">{p.emoji}</span>
            <h3 className="text-white font-black text-xl">{p.name}</h3>
            {/* Discovery badge */}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
              style={{ background: `${p.color}20`, color: p.color, border: `1px solid ${p.color}40` }}
            >
              Disc. {p.discoveryYear}
            </span>
          </div>
          {/* Extra badges */}
          <div className="flex flex-wrap gap-1.5">
            {p.extraBadges.map(badge => (
              <span
                key={badge}
                className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.09)' }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
        {[
          { icon: '📏', label: 'Diameter', val: p.diameterNote },
          { icon: '☀️', label: 'Distance', val: p.distanceAU },
          { icon: '📅', label: 'Orbital Period', val: `${p.orbitalPeriodYears.toLocaleString()} yrs` },
          { icon: '🌙', label: 'Moons', val: p.moons.length === 0 ? 'None' : `${p.moons.length} (${p.moons.join(', ')})` },
          { icon: '🌡️', label: 'Surface Temp', val: `${p.surfaceTempC}°C` },
          { icon: '📍', label: 'Belt', val: p.belt === 'kuiper' ? 'Kuiper Belt' : 'Asteroid Belt' },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="text-base mb-1">{stat.icon}</div>
            <p className="text-white font-semibold text-xs leading-snug">{stat.val}</p>
            <p className="text-gray-600 text-[9px] uppercase tracking-wider mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Expandable fun facts */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all"
        style={
          expanded
            ? { background: `${p.color}15`, border: `1px solid ${p.color}40` }
            : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
        }
      >
        <span className="text-xs font-bold" style={{ color: expanded ? p.color : '#9ca3af' }}>
          💡 Did you know?
        </span>
        <span className="text-gray-500 text-xs transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2.5">
          {p.funFacts.map((fact, i) => (
            <div
              key={i}
              className="flex gap-3 p-3 rounded-xl"
              style={{ background: `${p.color}08`, border: `1px solid ${p.color}20` }}
            >
              <span className="text-base flex-shrink-0">{i === 0 ? '🌟' : '🔭'}</span>
              <p className="text-gray-300 text-xs leading-relaxed">{fact}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type BeltTab = 'kuiper' | 'asteroid'

export default function DwarfPlanets() {
  const [activeTab, setActiveTab] = useState<BeltTab>('kuiper')
  const [highlighted, setHighlighted] = useState<string | null>(null)

  // One ref per planet id
  const cardRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({})
  DWARF_PLANETS.forEach(p => {
    if (!cardRefs.current[p.id]) {
      cardRefs.current[p.id] = { current: null }
    }
  })

  const visiblePlanets = DWARF_PLANETS.filter(p => p.belt === activeTab)

  function handleSelectFromLineup(id: string) {
    setHighlighted(id)
    const planet = DWARF_PLANETS.find(p => p.id === id)
    if (planet && planet.belt !== activeTab) {
      setActiveTab(planet.belt)
    }
    // Scroll after a brief tick to allow re-render
    setTimeout(() => {
      const ref = cardRefs.current[id]
      if (ref?.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 80)
    // Remove highlight after 2.5 s
    setTimeout(() => setHighlighted(null), 2500)
  }

  return (
    <div className="space-card p-6">
      {/* Component header */}
      <div className="flex items-center gap-3 mb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1.25rem' }}>
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl text-lg flex-shrink-0"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
        >
          🪐
        </div>
        <div>
          <h2 className="text-white font-bold text-base leading-tight">Dwarf Planet Explorer</h2>
          <p className="text-gray-500 text-xs mt-0.5">Pluto, Eris, Haumea, Makemake, Ceres &amp; Gonggong</p>
        </div>
      </div>

      {/* Comparison lineup — always shows all 6 */}
      <div className="mb-6">
        <ComparisonLineup
          planets={DWARF_PLANETS}
          highlighted={highlighted}
          onSelect={handleSelectFromLineup}
        />
      </div>

      {/* Belt tabs */}
      <div className="flex gap-2 mb-6">
        {([['kuiper', '🌌 Kuiper Belt', 5], ['asteroid', '☄️ Asteroid Belt', 1]] as [BeltTab, string, number][]).map(
          ([tab, label, count]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={
                activeTab === tab
                  ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }
              }
            >
              {label}
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-black"
                style={
                  activeTab === tab
                    ? { background: 'rgba(99,102,241,0.3)', color: '#c7d2fe' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#4b5563' }
                }
              >
                {count}
              </span>
            </button>
          )
        )}
      </div>

      {/* Belt description */}
      {activeTab === 'kuiper' && (
        <div
          className="rounded-xl p-3 mb-5 flex gap-3 items-start"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}
        >
          <span className="text-base flex-shrink-0 mt-0.5">🌌</span>
          <p className="text-gray-400 text-xs leading-relaxed">
            The <span className="text-indigo-300 font-semibold">Kuiper Belt</span> is a donut-shaped region beyond Neptune's orbit
            (30–50 AU), home to icy bodies left over from the solar system's formation.
            It contains hundreds of thousands of objects larger than 100 km.
          </p>
        </div>
      )}
      {activeTab === 'asteroid' && (
        <div
          className="rounded-xl p-3 mb-5 flex gap-3 items-start"
          style={{ background: 'rgba(77,124,79,0.1)', border: '1px solid rgba(77,124,79,0.3)' }}
        >
          <span className="text-base flex-shrink-0 mt-0.5">☄️</span>
          <p className="text-gray-400 text-xs leading-relaxed">
            The <span className="text-green-400 font-semibold">Asteroid Belt</span> lies between Mars and Jupiter (2.2–3.2 AU).
            Ceres is unique — the only dwarf planet in the inner solar system, making up about
            a third of the entire asteroid belt's mass.
          </p>
        </div>
      )}

      {/* Planet cards */}
      <div className="space-y-4">
        {visiblePlanets.map(planet => (
          <DwarfPlanetCard
            key={planet.id}
            planet={planet}
            highlighted={highlighted === planet.id}
            cardRef={cardRefs.current[planet.id]}
          />
        ))}
      </div>

      {/* Footer note */}
      <div
        className="mt-6 rounded-xl p-3"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <p className="text-gray-600 text-[10px] leading-relaxed text-center">
          IAU definition (2006): a dwarf planet orbits the Sun, has hydrostatic equilibrium (roughly spherical),
          but has <em>not</em> cleared its orbital neighbourhood. Currently 5 IAU-recognised + Gonggong (candidate).
        </p>
      </div>
    </div>
  )
}
