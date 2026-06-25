import { useState } from 'react'

interface OceanWorld {
  id: string
  name: string
  parent: string
  type: string
  icon: string
  color: string
  oceanDepth: string
  oceanType: string
  surfaceDistance: string
  heatSource: string
  lifeScore: number
  lifeReason: string
  keyFeatures: string[]
  missions: { name: string; year: string; finding: string }[]
  futureMissions: string[]
  funFact: string
  hypothesis: string
}

const WORLDS: OceanWorld[] = [
  {
    id: 'europa',
    name: 'Europa',
    parent: 'Moon of Jupiter',
    type: 'Ice-covered saltwater ocean',
    icon: '🔵',
    color: '#60a5fa',
    oceanDepth: '60–150 km deep',
    oceanType: 'Saltwater with Mg, Na, SO₄ salts; possibly chlorine',
    surfaceDistance: '10–30 km of ice shell above the ocean',
    heatSource: 'Tidal flexing by Jupiter\'s gravity; possibly hydrothermal vents on seafloor',
    lifeScore: 9,
    lifeReason: 'Europa scores highest among known ocean worlds: (1) confirmed liquid water, (2) chemical ingredients (carbon, hydrogen, nitrogen, oxygen, sulfur), (3) energy from tidal heating and potential hydrothermal vents — all three requirements for life as we know it.',
    keyFeatures: [
      'Surface temperature: −160°C, but subsurface ocean may be 0°C or warmer near vents',
      'Ice shell shows "chaos terrain" — refrozen blocks suggesting surface-ocean interaction',
      'Plumes possibly venting ocean water into space (detected by Hubble 2012, 2016)',
      'Magnetic field interaction with Jupiter suggests electrically conductive liquid below',
      'Surface renewed constantly — very few impact craters (young surface)',
      'Slightly smaller than Earth\'s Moon; discovered by Galileo Galilei in 1610',
    ],
    missions: [
      { name: 'Voyager 1 & 2', year: '1979', finding: 'First close-up images showing Europa\'s remarkably smooth, cracked surface' },
      { name: 'Galileo spacecraft', year: '1995–2003', finding: 'Confirmed subsurface ocean; detected magnetic signature; mapped surface features' },
      { name: 'Hubble Space Telescope', year: '2012, 2016', finding: 'Possible water plume eruptions near south pole, 200 km high' },
    ],
    futureMissions: ['Europa Clipper (NASA, launch Oct 2024, arrival 2030) — 50 flybys, will sample plumes', 'JUICE (ESA, 2023 launch) — focuses on Ganymede but will flyby Europa'],
    funFact: 'Europa\'s ocean may contain more than twice the liquid water of all Earth\'s oceans combined, despite Europa being smaller than our Moon.',
    hypothesis: 'If hydrothermal vents exist on Europa\'s seafloor (like black smokers on Earth), they could support chemosynthetic life using chemical energy rather than sunlight — just as deep-sea ecosystems do on Earth.'
  },
  {
    id: 'enceladus',
    name: 'Enceladus',
    parent: 'Moon of Saturn',
    type: 'Saltwater ocean with active geysers',
    icon: '💧',
    color: '#a5b4fc',
    oceanDepth: '~10 km deep (possibly more)',
    oceanType: 'Warm, alkaline saltwater with H₂, CO₂, methane, silica nanoparticles, organics',
    surfaceDistance: '~1 km of ice at south pole; ~30 km elsewhere',
    heatSource: 'Tidal flexing by Saturn; confirmed hydrothermal activity on seafloor',
    lifeScore: 9,
    lifeReason: 'Enceladus is the most promising astrobiology target: Cassini FLEW THROUGH its plumes and detected hydrogen gas (H₂) — a telltale sign of active hydrothermal venting. Life on Earth at hydrothermal vents uses H₂ + CO₂ to make methane for energy. All building blocks for life have been found in Enceladus plumes.',
    keyFeatures: [
      'Active geysers at south pole shoot water 500+ km into space, creating Saturn\'s E ring',
      'Cassini detected H₂, CO₂, methane, ethane, complex organics in the plumes',
      'Silica nanoparticles found in Saturn\'s rings — formed at 90°C in hydrothermal vents',
      'Plume pH: 8.5–9 (alkaline, similar to Earth\'s carbonate-driven hydrothermal systems)',
      'The seafloor is rocky, allowing water-rock chemistry crucial for life',
      'Only ~500 km diameter — a tiny moon with an enormous astrobiology significance',
    ],
    missions: [
      { name: 'Voyager 2', year: '1981', finding: 'First close flyby, spotted E ring and bright, young surface' },
      { name: 'Cassini (Huygens)', year: '2004–2017', finding: 'Discovered geysers (2005), flew through plumes, detected all key chemical biosignatures' },
    ],
    futureMissions: ['Enceladus Orbilander (NASA concept) — orbit then land to sample plumes and surface', 'No funded mission yet; community strongly advocates for one'],
    funFact: 'If you stood at Enceladus\'s south pole, you would be surrounded by erupting geysers shooting water 500 km into space. The surface gravity is so low (0.011 g) that you could throw a ball into orbit.',
    hypothesis: 'The Cassini discovery of H₂ in Enceladus\'s plumes was as close as we\'ve come to detecting a biosignature without going there. The reaction H₂ + CO₂ → CH₄ (methanogenesis) is performed by microbes called methanogens on Earth. They may be doing the same thing right now on Enceladus.'
  },
  {
    id: 'titan',
    name: 'Titan',
    parent: 'Moon of Saturn',
    type: 'Subsurface liquid water ocean + surface hydrocarbon lakes',
    icon: '🟠',
    color: '#f97316',
    oceanDepth: '~200 km deep (subsurface)',
    oceanType: 'Subsurface: ammonia-water mixture. Surface: liquid methane and ethane lakes',
    surfaceDistance: '~50 km of ice above subsurface water ocean',
    heatSource: 'Tidal heating; radiogenic heat from rocky interior',
    lifeScore: 7,
    lifeReason: 'Titan offers two potential niches for life: (1) the subsurface liquid water ocean (similar to Europa/Enceladus), and (2) uniquely, surface lakes of liquid methane/ethane could host exotic chemistry-based life using different biochemistry than Earth life. Both scenarios are speculative but scientifically motivated.',
    keyFeatures: [
      'Only moon in the solar system with a thick atmosphere (1.5× Earth\'s surface pressure)',
      'Atmosphere is 95% nitrogen + 5% methane — similar to early Earth\'s',
      'Surface lakes and seas of liquid methane at −179°C (Ligeia Mare, Kraken Mare)',
      'Weather cycle of methane rain, rivers, and evaporation — like Earth\'s water cycle but with methane',
      'Thick orange haze of complex organic molecules (tholins) covering the surface',
      'Cassini-Huygens landed on Titan (2005) — only landing beyond Mars in outer solar system',
    ],
    missions: [
      { name: 'Voyager 1', year: '1980', finding: 'Revealed thick orange atmosphere, couldn\'t see surface through haze' },
      { name: 'Cassini + Huygens lander', year: '2004–2017 / 2005', finding: 'Huygens landed (2005), Cassini mapped lakes and seas with radar, confirmed complex organics' },
    ],
    futureMissions: ['Dragonfly (NASA, launch 2028, arrival 2034) — rotorcraft that flies between sites on Titan\'s surface, studies prebiotic chemistry'],
    funFact: 'Titan is the only place in the solar system besides Earth with stable liquid on its surface. You could swim in Titan\'s methane lakes (if you had the right spacesuit) — though the liquid methane is −179°C.',
    hypothesis: 'Carl Sagan and others proposed that Titan\'s surface tholins (complex organic molecules) resemble the chemistry of early Earth before life arose. Dragonfly will investigate whether Titan\'s chemistry has progressed toward biology — making it a frozen snapshot of early Earth chemistry.'
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    parent: 'Moon of Jupiter',
    type: 'Deep subsurface saltwater ocean',
    icon: '⚫',
    color: '#94a3b8',
    oceanDepth: '~800 km deep (possibly)',
    oceanType: 'Saltwater, possibly bracketed between ice layers',
    surfaceDistance: '~150 km of ice above the ocean',
    heatSource: 'Tidal heating (less than Europa); radiogenic decay',
    lifeScore: 6,
    lifeReason: 'Ganymede\'s ocean is very deep but may be sandwiched between ice layers, limiting water-rock contact needed for chemistry. This reduces its habitability compared to Europa. However, its confirmed liquid water ocean and size make it a major candidate.',
    keyFeatures: [
      'Largest moon in the Solar System — bigger than Mercury (5,268 km diameter)',
      'Only moon known to have its own magnetic field (magnetosphere)',
      'Hubble detected rocking auroras caused by ocean\'s magnetic influence (2015)',
      'Multiple ice layers may sandwich the ocean, limiting rock-water interaction',
      'Has both ancient heavily cratered terrain and younger grooved terrain',
      'ESA\'s JUICE mission will orbit Ganymede extensively (2034)',
    ],
    missions: [
      { name: 'Galileo spacecraft', year: '1995–2003', finding: 'Detected magnetic field; evidence of subsurface ocean from gravity measurements' },
      { name: 'Hubble (aurora observations)', year: '2015', finding: 'Rocking of Ganymede\'s auroras matched what a subsurface saltwater ocean would produce' },
    ],
    futureMissions: ['JUICE (ESA, launched 2023, arrival 2034) — will orbit Ganymede for 9 months; first spacecraft to orbit a moon other than Earth\'s Moon'],
    funFact: 'If Ganymede orbited the Sun instead of Jupiter, it would be classified as a planet. It\'s larger than Mercury and has its own magnetosphere — but it\'s 100× less massive than Earth.',
    hypothesis: 'Ganymede\'s ocean may contain more water than Earth\'s entire ocean. But its depth and possible sandwich geometry between ice layers may limit its habitability — unlike Europa, where the seafloor is likely rocky and directly in contact with ocean water.'
  },
  {
    id: 'callisto',
    name: 'Callisto',
    parent: 'Moon of Jupiter',
    type: 'Possible subsurface briny ocean',
    icon: '🟤',
    color: '#92400e',
    oceanDepth: '~10 km (uncertain)',
    oceanType: 'Possibly salty liquid water mixed with ammonia',
    surfaceDistance: '~100–300 km of ice/rock mixture',
    heatSource: 'Primarily radiogenic decay; little tidal heating (outer orbit)',
    lifeScore: 4,
    lifeReason: 'Callisto receives very little tidal heating (being far from Jupiter), so its interior is cold. The evidence for a liquid layer is weak — based mainly on the lack of an expected induced magnetic field, which suggests some conductive material (possibly liquid). The habitability potential is low.',
    keyFeatures: [
      'Most heavily cratered object in the solar system — shows 4.5 billion years of bombardment',
      'Dark, ancient surface — very different from icy Europa and Ganymede',
      'Silicate minerals mixed throughout the ice (not differentiated like Ganymede)',
      'No internal heat from tidal flexing — most inactive of Jupiter\'s large moons',
      'Has a very thin oxygen atmosphere (from ice sublimation)',
    ],
    missions: [
      { name: 'Galileo spacecraft', year: '1995–2003', finding: 'Magnetic field measurements suggested a possible conducting interior layer; very old cratered surface' },
    ],
    futureMissions: ['JUICE will flyby Callisto multiple times on the way to Ganymede'],
    funFact: 'Callisto is the most radiation-safe of Jupiter\'s large moons due to its distant orbit — making it a potential base for human exploration of the Jupiter system, despite its low habitability potential.',
    hypothesis: 'Some scientists have proposed Callisto as an operational base for exploring Europa and Ganymede, since it\'s far enough from Jupiter\'s intense radiation belts to be survivable for longer periods.'
  },
  {
    id: 'ceres',
    name: 'Ceres',
    parent: 'Dwarf Planet (Asteroid Belt)',
    type: 'Possible ancient subsurface ocean / briny reservoirs',
    icon: '⚪',
    color: '#64748b',
    oceanDepth: 'Unknown — possibly a muddy ocean layer at 40–200 km depth',
    oceanType: 'Briny water + salt mixture; possibly ammonia-rich',
    surfaceDistance: '~40 km of ice and rock',
    heatSource: 'Mostly gone — ancient radiogenic heat; possible residual activity',
    lifeScore: 3,
    lifeReason: 'Ceres likely had a liquid water ocean early in its history that has largely frozen. Bright spots in Occator Crater reveal recent brine activity — salty water coming from below. But with little heat source, sustained habitable conditions are unlikely today.',
    keyFeatures: [
      'Bright spots in Occator Crater (Faculae) = sodium carbonate brines from below surface',
      'Dawn spacecraft detected water ice at polar craters (permanently shadowed)',
      'Organics detected on surface by Dawn (2017) — carbon-rich organic compounds',
      'Largest object in the asteroid belt (940 km diameter)',
      'Evidence of ongoing brine activity as recently as a few million years ago',
    ],
    missions: [
      { name: 'Dawn spacecraft (NASA)', year: '2015–2018', finding: 'Mapped the entire surface; discovered bright spots = salt deposits; found organics; water ice at poles' },
    ],
    futureMissions: ['No funded missions; proposed follow-up orbiters have been studied'],
    funFact: 'Ceres has more water than Earth — about 200 million km³ of water ice makes up 25% of its mass. If all of Ceres\'s water were liquid, it would create a global ocean 100 km deep.',
    hypothesis: 'Ceres was once "alive" — an active water world in the early solar system when radioactive decay provided heat. As that heat faded over billions of years, the ocean froze. The bright spots hint that pockets of briny water remain active even today.'
  },
]

function LifeScoreBar({ score }: { score: number }) {
  const colors = score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : '#ef4444'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Habitability Potential</span>
        <span className="font-bold" style={{ color: colors }}>{score}/10</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${score * 10}%`, background: colors }} />
      </div>
    </div>
  )
}

export default function OceanWorldsGuide() {
  const [selected, setSelected] = useState<OceanWorld>(WORLDS[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Ocean Worlds of the Solar System</h2>
      <p className="text-gray-400 text-sm mb-5">Hidden oceans beneath ice shells — the most promising places to search for extraterrestrial life within our own solar system</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* World list */}
        <div className="space-y-2">
          {WORLDS.map(w => (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === w.id ? w.color + '20' : 'rgba(15,23,42,0.6)',
                border: `1px solid ${selected.id === w.id ? w.color + '60' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{w.icon}</span>
                <div>
                  <div className="font-semibold text-sm" style={{ color: selected.id === w.id ? w.color : '#e2e8f0' }}>{w.name}</div>
                  <div className="text-gray-500 text-xs">{w.parent}</div>
                </div>
                <div className="ml-auto text-xs font-bold" style={{ color: w.lifeScore >= 8 ? '#22c55e' : w.lifeScore >= 6 ? '#f59e0b' : '#ef4444' }}>
                  {w.lifeScore}/10
                </div>
              </div>
              <div className="text-gray-600 text-xs ml-10">{w.oceanType.split(';')[0]}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="text-sm" style={{ color: selected.color }}>{selected.parent} • {selected.type}</div>
              </div>
            </div>
            <LifeScoreBar score={selected.lifeScore} />
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                ['Ocean Depth', selected.oceanDepth],
                ['Ice Thickness', selected.surfaceDistance],
                ['Heat Source', selected.heatSource],
                ['Ocean Type', selected.oceanType.split(';')[0]],
              ].map(([k, v]) => (
                <div key={k} className="bg-black/20 rounded-lg p-2">
                  <div className="text-gray-500 text-xs">{k}</div>
                  <div className="text-gray-200 text-xs font-medium">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Life potential */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Habitability Assessment</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.lifeReason}</p>
          </div>

          {/* Key features */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Key Facts</div>
            <div className="space-y-1.5">
              {selected.keyFeatures.map((feat, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span style={{ color: selected.color }} className="flex-shrink-0">→</span>
                  <span className="text-gray-300 text-xs">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Missions */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Past Missions &amp; Key Findings</div>
            <div className="space-y-2">
              {selected.missions.map(m => (
                <div key={m.name} className="bg-gray-900/60 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-xs font-semibold">{m.name}</span>
                    <span className="text-gray-500 text-xs">{m.year}</span>
                  </div>
                  <p className="text-gray-400 text-xs">{m.finding}</p>
                </div>
              ))}
            </div>
            {selected.futureMissions.length > 0 && (
              <div className="mt-3">
                <div className="text-gray-400 text-xs uppercase font-semibold mb-1.5">Future Missions</div>
                {selected.futureMissions.map(m => (
                  <div key={m} className="flex gap-2 text-xs">
                    <span className="text-indigo-400">🚀</span>
                    <span className="text-indigo-300">{m}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fun fact + hypothesis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}20` }}>
              <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>Amazing Fact</div>
              <p className="text-gray-200 text-sm">{selected.funFact}</p>
            </div>
            <div className="bg-green-900/10 border border-green-800/20 rounded-xl p-4">
              <div className="text-green-400 text-xs uppercase font-semibold mb-2">Life Hypothesis</div>
              <p className="text-green-100/80 text-sm leading-relaxed">{selected.hypothesis}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 bg-blue-900/15 rounded-xl p-4 border border-blue-800/25">
        <div className="text-blue-400 text-xs uppercase font-semibold mb-2">The Big Picture</div>
        <p className="text-gray-300 text-sm leading-relaxed">
          Our solar system contains at least 5–6 worlds with subsurface liquid water — more potentially habitable real estate than just Earth. If life can arise in any of these environments, it would transform our understanding of biology, chemistry, and our place in the universe. Europa Clipper arrives in 2030; Dragonfly reaches Titan in 2034. We may answer the question of whether life is unique to Earth within our lifetimes.
        </p>
      </div>
    </div>
  )
}
