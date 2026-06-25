import { useState } from 'react'

interface Ring {
  name: string
  innerKm: number
  outerKm: number
  widthKm: number
  thicknessM: number
  composition: string
  opacity: 'transparent' | 'translucent' | 'opaque'
  color: string
  discoveredYear: number
  discoveredBy: string
  notes: string
}

interface Planet {
  name: string
  emoji: string
  radiusKm: number
  ringColor: string
  bgGradient: string
  rings: Ring[]
  totalRings: number
  discoveryYear: number
  facts: string[]
}

const PLANETS: Planet[] = [
  {
    name: 'Saturn',
    emoji: '🪐',
    radiusKm: 58232,
    ringColor: '#C8A96E',
    bgGradient: 'from-yellow-900 to-yellow-700',
    totalRings: 7,
    discoveryYear: 1610,
    facts: [
      'Ring system spans 282,000 km but is only 10–100 m thick',
      '90–95% water ice with trace silicates and organic compounds',
      'B ring is the densest and brightest ring in the solar system',
      'Rings are geologically young: 100–200 million years old',
      'Cassini Division (4,800 km gap) caused by moon Mimas resonance',
      'F ring is shepherded by moons Prometheus and Pandora',
    ],
    rings: [
      { name: 'D Ring', innerKm: 66900, outerKm: 74510, widthKm: 7610, thicknessM: 30, composition: 'Dusty particles', opacity: 'transparent', color: '#8B7355', discoveredYear: 1969, discoveredBy: 'Pioneer 11', notes: 'Innermost faint ring, mostly dust' },
      { name: 'C Ring', innerKm: 74658, outerKm: 92000, widthKm: 17500, thicknessM: 5, composition: 'Water ice + silicates', opacity: 'translucent', color: '#A09070', discoveredYear: 1850, discoveredBy: 'W. Bond', notes: 'Also called Crepe Ring; low reflectivity' },
      { name: 'B Ring', innerKm: 92000, outerKm: 117580, widthKm: 25580, thicknessM: 10, composition: 'Pure water ice', opacity: 'opaque', color: '#E8D5A3', discoveredYear: 1610, discoveredBy: 'Galileo Galilei', notes: 'Brightest and most massive ring' },
      { name: 'Cassini Division', innerKm: 117580, outerKm: 122170, widthKm: 4590, thicknessM: 0, composition: 'Sparse dust', opacity: 'transparent', color: '#2A2010', discoveredYear: 1675, discoveredBy: 'Giovanni Cassini', notes: 'Gap created by 2:1 resonance with Mimas' },
      { name: 'A Ring', innerKm: 122170, outerKm: 136775, widthKm: 14610, thicknessM: 10, composition: 'Water ice + silicates', opacity: 'opaque', color: '#D4B87A', discoveredYear: 1610, discoveredBy: 'Galileo Galilei', notes: 'Contains Encke and Keeler gaps' },
      { name: 'F Ring', innerKm: 140180, outerKm: 140220, widthKm: 30, thicknessM: 1000, composition: 'Ice + dust clumps', opacity: 'translucent', color: '#F0E0B0', discoveredYear: 1979, discoveredBy: 'Pioneer 11', notes: 'Braided structure, shepherded by Prometheus & Pandora' },
      { name: 'G & E Rings', innerKm: 166000, outerKm: 483000, widthKm: 317000, thicknessM: 100, composition: 'Microscopic ice', opacity: 'transparent', color: '#7090A0', discoveredYear: 1979, discoveredBy: 'Voyager 1', notes: 'E ring fed by Enceladus geysers' },
    ]
  },
  {
    name: 'Uranus',
    emoji: '🔵',
    radiusKm: 25362,
    ringColor: '#7FC8E0',
    bgGradient: 'from-cyan-900 to-cyan-700',
    totalRings: 13,
    discoveryYear: 1977,
    facts: [
      'Rings discovered in 1977 when Uranus occulted a star',
      'Rings are very dark — albedo of only 1–4%',
      'Epsilon ring is the brightest and densest',
      'Inner rings are narrow and shepherded by moons',
      'Rings orbit nearly perpendicular to the ecliptic',
      'Composed of macroscopic particles: boulders to dust',
    ],
    rings: [
      { name: 'Zeta (ζ)', innerKm: 37000, outerKm: 39500, widthKm: 2500, thicknessM: 100, composition: 'Dark dust', opacity: 'transparent', color: '#203840', discoveredYear: 2006, discoveredBy: 'Hubble/Cassini', notes: 'Innermost diffuse ring' },
      { name: '6, 5, 4', innerKm: 41837, outerKm: 44718, widthKm: 2881, thicknessM: 100, composition: 'Dark boulders', opacity: 'translucent', color: '#304850', discoveredYear: 1977, discoveredBy: 'Elliot et al.', notes: 'Three narrow inner rings' },
      { name: 'Alpha (α)', innerKm: 44718, outerKm: 44770, widthKm: 7, thicknessM: 100, composition: 'Dark rocky particles', opacity: 'translucent', color: '#406070', discoveredYear: 1977, discoveredBy: 'Elliot et al.', notes: 'Sharp-edged narrow ring' },
      { name: 'Beta (β)', innerKm: 45661, outerKm: 45700, widthKm: 11, thicknessM: 100, composition: 'Dark rocky particles', opacity: 'translucent', color: '#507080', discoveredYear: 1977, discoveredBy: 'Elliot et al.', notes: 'Slightly wider than Alpha' },
      { name: 'Eta (η)', innerKm: 47176, outerKm: 47176, widthKm: 2, thicknessM: 100, composition: 'Dark particles', opacity: 'transparent', color: '#385868', discoveredYear: 1977, discoveredBy: 'Voyager 2', notes: 'Very narrow ring' },
      { name: 'Gamma (γ)', innerKm: 47627, outerKm: 47627, widthKm: 4, thicknessM: 100, composition: 'Dark boulders', opacity: 'opaque', color: '#507888', discoveredYear: 1977, discoveredBy: 'Elliot et al.', notes: 'Optical depth similar to epsilon' },
      { name: 'Delta (δ)', innerKm: 48300, outerKm: 48300, widthKm: 7, thicknessM: 100, composition: 'Dark particles', opacity: 'opaque', color: '#486878', discoveredYear: 1977, discoveredBy: 'Elliot et al.', notes: 'Circular orbit, narrow' },
      { name: 'Epsilon (ε)', innerKm: 51149, outerKm: 51149, widthKm: 96, thicknessM: 150, composition: 'Meter-sized boulders', opacity: 'opaque', color: '#7FC8E0', discoveredYear: 1977, discoveredBy: 'Elliot et al.', notes: 'Brightest, most massive Uranian ring' },
      { name: 'Nu (ν) & Mu (μ)', innerKm: 67300, outerKm: 97700, widthKm: 30400, thicknessM: 500, composition: 'Fine dust', opacity: 'transparent', color: '#305868', discoveredYear: 2003, discoveredBy: 'Hubble Space Telescope', notes: 'Outer diffuse rings discovered by HST' },
    ]
  },
  {
    name: 'Neptune',
    emoji: '🔷',
    radiusKm: 24622,
    ringColor: '#4B6CB7',
    bgGradient: 'from-blue-900 to-blue-800',
    totalRings: 5,
    discoveryYear: 1989,
    facts: [
      'Neptune\'s rings confirmed by Voyager 2 in 1989',
      'Adams ring has 3 bright arcs: Liberté, Égalité, Fraternité',
      'Arcs are confined by gravitational resonance with Galatea',
      'Very dark, composed of organic compounds and silicates',
      'Ring material may be decaying — arcs were brighter in 1989',
      'Le Verrier ring named after Neptune\'s discoverer',
    ],
    rings: [
      { name: 'Galle', innerKm: 41900, outerKm: 43000, widthKm: 2000, thicknessM: 100, composition: 'Dust + organics', opacity: 'transparent', color: '#1A2A4A', discoveredYear: 1989, discoveredBy: 'Voyager 2', notes: 'Innermost diffuse ring' },
      { name: 'Le Verrier', innerKm: 53200, outerKm: 53200, widthKm: 110, thicknessM: 100, composition: 'Dark silicates', opacity: 'opaque', color: '#2A3A6A', discoveredYear: 1989, discoveredBy: 'Voyager 2', notes: 'Narrow, well-defined ring' },
      { name: 'Lassell', innerKm: 53200, outerKm: 57200, widthKm: 4000, thicknessM: 100, composition: 'Diffuse dust', opacity: 'transparent', color: '#1E3058', discoveredYear: 1989, discoveredBy: 'Voyager 2', notes: 'Broad diffuse region between rings' },
      { name: 'Arago', innerKm: 57200, outerKm: 57200, widthKm: 100, thicknessM: 100, composition: 'Dark particles', opacity: 'opaque', color: '#2A4070', discoveredYear: 1989, discoveredBy: 'Voyager 2', notes: 'Faint narrow ring' },
      { name: 'Adams (with Arcs)', innerKm: 62932, outerKm: 62932, widthKm: 50, thicknessM: 100, composition: 'Dark clumps + organics', opacity: 'opaque', color: '#4B6CB7', discoveredYear: 1984, discoveredBy: 'Reitsema et al.', notes: 'Has 3 bright arcs: Liberté, Égalité, Fraternité' },
    ]
  },
  {
    name: 'Jupiter',
    emoji: '🟠',
    radiusKm: 71492,
    ringColor: '#C47A3A',
    bgGradient: 'from-orange-900 to-orange-700',
    totalRings: 4,
    discoveryYear: 1979,
    facts: [
      'Jupiter\'s rings discovered by Voyager 1 in 1979',
      'Much fainter than Saturn\'s rings — barely visible',
      'Main ring composed of tiny dark rocky particles',
      'Rings fed by meteoroid impacts on inner moons (Adrastea, Metis)',
      'No water ice: silicate rock and organics only',
      'Ring system extends over 800,000 km total',
    ],
    rings: [
      { name: 'Halo Ring', innerKm: 92000, outerKm: 122500, widthKm: 30500, thicknessM: 20000, composition: 'Fine dust', opacity: 'transparent', color: '#6A4020', discoveredYear: 1979, discoveredBy: 'Voyager 1', notes: 'Thick torus of fine particles' },
      { name: 'Main Ring', innerKm: 122500, outerKm: 129000, widthKm: 6500, thicknessM: 30, composition: 'Dark rocky dust', opacity: 'opaque', color: '#C47A3A', discoveredYear: 1979, discoveredBy: 'Voyager 1', notes: 'Brightest Jupiter ring; inner edge at Adrastea orbit' },
      { name: 'Amalthea Gossamer', innerKm: 129000, outerKm: 182000, widthKm: 53000, thicknessM: 2000, composition: 'Dust from Amalthea', opacity: 'transparent', color: '#8A5030', discoveredYear: 1979, discoveredBy: 'Voyager 2', notes: 'Dust shed by moon Amalthea' },
      { name: 'Thebe Gossamer', innerKm: 182000, outerKm: 226000, widthKm: 44000, thicknessM: 8400, composition: 'Dust from Thebe', opacity: 'transparent', color: '#6A4020', discoveredYear: 2000, discoveredBy: 'Galileo spacecraft', notes: 'Outermost ring, dust from moon Thebe' },
    ]
  },
  {
    name: 'Mars',
    emoji: '🔴',
    radiusKm: 3389,
    ringColor: '#C1440E',
    bgGradient: 'from-red-900 to-red-800',
    totalRings: 0,
    discoveryYear: 0,
    facts: [
      'Mars does not currently have rings',
      'Phobos is slowly spiraling inward due to tidal forces',
      'In ~30–50 million years, Phobos may break apart',
      'Phobos debris could form a temporary ring system',
      'Mars had rings in the distant past — evidence in regolith',
      'Mars may cycle between ringed and ring-free states',
    ],
    rings: []
  }
]

function RingDiagram({ planet }: { planet: Planet }) {
  const svgWidth = 300
  const svgHeight = 180
  const cx = svgWidth / 2
  const cy = svgHeight / 2

  if (planet.rings.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        No rings currently — but watch this space in 30 million years!
      </div>
    )
  }

  const allInner = planet.rings.map(r => r.innerKm)
  const allOuter = planet.rings.map(r => r.outerKm)
  const minR = Math.min(...allInner)
  const maxR = Math.max(...allOuter)
  const range = maxR - minR || 1

  const scale = (r: number) => ((r - minR) / range) * 110 + 20

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-w-sm mx-auto">
      {planet.rings.map((ring, i) => {
        if (ring.widthKm === 0) return null
        const rx = scale(ring.outerKm)
        const ry = rx * 0.3
        const rx2 = scale(ring.innerKm)
        const ry2 = rx2 * 0.3
        const opacity = ring.opacity === 'opaque' ? 0.85 : ring.opacity === 'translucent' ? 0.5 : 0.2
        return (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={ring.color} opacity={opacity} />
            <ellipse cx={cx} cy={cy} rx={rx2} ry={ry2} fill="#0a0a1a" opacity={1} />
          </g>
        )
      })}
      <ellipse cx={cx} cy={cy} rx={18} ry={14} fill={planet.ringColor} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="12" fill="white">{planet.emoji}</text>
    </svg>
  )
}

export default function PlanetaryRings() {
  const [selectedPlanet, setSelectedPlanet] = useState<Planet>(PLANETS[0])
  const [selectedRing, setSelectedRing] = useState<Ring | null>(null)
  const [activeTab, setActiveTab] = useState<'diagram' | 'rings' | 'facts'>('diagram')

  const opacityLabel = (o: Ring['opacity']) =>
    o === 'opaque' ? '⚫ Opaque' : o === 'translucent' ? '🔘 Translucent' : '⭕ Transparent'

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Planetary Ring Systems</h2>
      <p className="text-slate-400 text-sm mb-5">Explore the rings of our solar system's gas and ice giants</p>

      {/* Planet selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PLANETS.map(p => (
          <button
            key={p.name}
            onClick={() => { setSelectedPlanet(p); setSelectedRing(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              selectedPlanet.name === p.name
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>{p.emoji}</span>
            <span>{p.name}</span>
            {p.totalRings > 0 && (
              <span className="text-xs bg-black/30 rounded-full px-1.5">{p.totalRings}</span>
            )}
          </button>
        ))}
      </div>

      {/* Planet header */}
      <div className={`bg-gradient-to-r ${selectedPlanet.bgGradient} rounded-xl p-4 mb-5`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-lg">{selectedPlanet.emoji} {selectedPlanet.name}</div>
            <div className="text-white/70 text-sm">
              {selectedPlanet.totalRings > 0
                ? `${selectedPlanet.totalRings} ring groups · Discovered ${selectedPlanet.discoveryYear}`
                : 'No current rings · Future ring candidate'}
            </div>
          </div>
          <div className="text-right text-white/70 text-sm">
            <div>Radius: {selectedPlanet.radiusKm.toLocaleString()} km</div>
            {selectedPlanet.rings.length > 0 && (
              <div>Span: {(Math.max(...selectedPlanet.rings.map(r => r.outerKm)) - Math.min(...selectedPlanet.rings.map(r => r.innerKm))).toLocaleString()} km</div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {(['diagram', 'rings', 'facts'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t === 'diagram' ? '🪐 Diagram' : t === 'rings' ? '💫 Ring Details' : '📋 Facts'}
          </button>
        ))}
      </div>

      {activeTab === 'diagram' && (
        <div className="bg-slate-900 rounded-xl p-4">
          <RingDiagram planet={selectedPlanet} />
          <p className="text-center text-slate-500 text-xs mt-2">
            Cross-section view — not to scale. Opacity reflects actual ring density.
          </p>
        </div>
      )}

      {activeTab === 'rings' && (
        <div className="space-y-2">
          {selectedPlanet.rings.length === 0 ? (
            <div className="text-slate-400 text-center py-8">
              {selectedPlanet.name} currently has no rings.
              <br /><span className="text-sm text-slate-500">Phobos may create rings in ~30–50 million years.</span>
            </div>
          ) : (
            selectedPlanet.rings.map((ring, i) => (
              <div key={i}>
                <button
                  onClick={() => setSelectedRing(selectedRing?.name === ring.name ? null : ring)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: ring.color }} />
                    <span className="text-white font-medium text-sm">{ring.name}</span>
                    <span className="text-slate-400 text-xs">{opacityLabel(ring.opacity)}</span>
                  </div>
                  <span className="text-slate-400 text-xs">{ring.widthKm > 0 ? `${ring.widthKm.toLocaleString()} km wide` : 'Gap'}</span>
                </button>
                {selectedRing?.name === ring.name && (
                  <div className="bg-slate-900 rounded-b-lg p-4 border border-slate-700 border-t-0 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Inner edge</span>
                      <div className="text-white font-mono">{ring.innerKm.toLocaleString()} km</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Outer edge</span>
                      <div className="text-white font-mono">{ring.outerKm.toLocaleString()} km</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Thickness</span>
                      <div className="text-white font-mono">{ring.thicknessM > 0 ? `${ring.thicknessM.toLocaleString()} m` : '—'}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Discovered</span>
                      <div className="text-white">{ring.discoveredYear} by {ring.discoveredBy}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">Composition</span>
                      <div className="text-white">{ring.composition}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">Notes</span>
                      <div className="text-slate-300">{ring.notes}</div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'facts' && (
        <div className="space-y-3">
          {selectedPlanet.facts.map((fact, i) => (
            <div key={i} className="flex gap-3 items-start bg-slate-800/50 rounded-lg p-3">
              <span className="text-yellow-400 font-bold text-sm mt-0.5">{i + 1}.</span>
              <span className="text-slate-200 text-sm">{fact}</span>
            </div>
          ))}
        </div>
      )}

      {/* Comparison footer */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {PLANETS.filter(p => p.totalRings > 0).map(p => (
          <div key={p.name} className="bg-slate-800 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">{p.emoji}</div>
            <div className="text-white text-xs font-semibold">{p.name}</div>
            <div className="text-slate-400 text-xs">{p.totalRings} ring groups</div>
            <div className="text-slate-500 text-xs">Since {p.discoveryYear}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
