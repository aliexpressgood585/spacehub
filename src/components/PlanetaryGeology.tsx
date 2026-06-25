import { useState } from 'react'

type FeatureType = 'volcano' | 'canyon' | 'crater' | 'mountain' | 'ice' | 'ocean'

interface GeologicalFeature {
  id: string
  name: string
  world: string
  worldIcon: string
  type: FeatureType
  icon: string
  color: string
  size: string
  earthComparison: string
  howFormed: string
  discovery: string
  activeNow: boolean
  coordinates?: string
  funFact: string
  significance: string
}

const FEATURES: GeologicalFeature[] = [
  {
    id: 'olympus',
    name: 'Olympus Mons',
    world: 'Mars',
    worldIcon: '🔴',
    type: 'volcano',
    icon: '🌋',
    color: '#ef4444',
    size: '25 km tall, 600 km wide',
    earthComparison: 'Mauna Kea (Earth\'s tallest from ocean floor: 10 km). Olympus Mons is 2.5× taller. Its base would cover France. Its caldera is the size of Phoenix, Arizona.',
    howFormed: 'Mars has no plate tectonics — hot spots in the mantle stay in the same place as the crust moves. On Earth, this creates island chains (like Hawaii). On Mars, the crust doesn\'t move, so magma piles up in one place for billions of years, creating an enormous shield volcano.',
    discovery: 'First photographed as a bright feature ("Nix Olympica") in 1879 by Giovanni Schiaparelli. Mariner 9 (1971) was the first spacecraft to image it clearly.',
    activeNow: false,
    coordinates: '18.65°N, 226.2°E',
    funFact: 'The edge of Olympus Mons is an escarpment (cliff) 8 km high — taller than Mount Everest. If you stood at the base, you wouldn\'t be able to see the summit — it\'s beyond the horizon due to the planet\'s curvature. You\'d also technically not know you were on a volcano because its slopes are so gradual (~5°).',
    significance: 'The largest known volcano in the solar system. Its existence proves Mars had internal geological activity for billions of years — and potentially still does (recent data suggests eruptions may have occurred 25 million years ago).'
  },
  {
    id: 'valles',
    name: 'Valles Marineris',
    world: 'Mars',
    worldIcon: '🔴',
    type: 'canyon',
    icon: '🏜️',
    color: '#f97316',
    size: '4,000 km long, 200 km wide, 7 km deep',
    earthComparison: 'Grand Canyon (US): 450 km long, 29 km wide, 1.8 km deep. Valles Marineris is 9× longer and 4× deeper. If placed on Earth, it would stretch from New York to Los Angeles.',
    howFormed: 'Unlike the Grand Canyon (water erosion), Valles Marineris formed from tectonic rifting — the crust pulled apart as the Tharsis bulge (the volcanic region containing Olympus Mons) formed and stressed the crust. Some sections may have been enlarged by ancient water erosion.',
    discovery: 'Mariner 9 spacecraft (1971) — named in honor of the mission that discovered it.',
    activeNow: false,
    coordinates: '14°S, 304°E (centerline)',
    funFact: 'Valles Marineris contains "Coprates Montes" — mountains within the canyon that are taller than the Himalayas. The canyon is so large that it creates its own weather patterns, including massive dust clouds that spill out and affect the entire planet during dust storm season.',
    significance: 'The largest canyon in the solar system. Its formation history is a window into early Martian tectonics. Some sections contain hydrated minerals (phyllosilicates and sulfates) — evidence of ancient water. Future Mars colonies may be located here for atmospheric pressure benefits.'
  },
  {
    id: 'hellas',
    name: 'Hellas Planitia',
    world: 'Mars',
    worldIcon: '🔴',
    type: 'crater',
    icon: '🕳️',
    color: '#8b5cf6',
    size: '2,300 km across, 7 km deep',
    earthComparison: 'If placed on Earth, Hellas would stretch from New York to Dallas. The deepest point is 7 km below average Martian surface — and due to the depth, atmospheric pressure there is 89% higher than average Martian surface pressure.',
    howFormed: 'An ancient impact ~4 billion years ago (Late Heavy Bombardment era). The impactor was likely 300-400 km in diameter. The resulting ejecta blanket extends 4,000 km from the center and is visible from orbit.',
    discovery: 'Known since early telescopic observations as a bright feature (frost and dust tend to collect in this low basin). Mariner 9 revealed its full extent.',
    activeNow: false,
    coordinates: '40°S, 70°E',
    funFact: 'The relatively higher atmospheric pressure at the bottom of Hellas Planitia makes it one of the most promising locations for human settlement on Mars — liquid water can exist there at temperatures Mars occasionally reaches. It also has ice deposits at its deepest points.',
    significance: 'The largest clearly impact-formed basin in the solar system (possibly second to the Moon\'s South Pole–Aitken Basin). Understanding the Hellas impact illuminates the Late Heavy Bombardment period — a catastrophic era ~4 Gyr ago when the entire inner solar system was pummeled with massive asteroids.'
  },
  {
    id: 'maxwell',
    name: 'Maxwell Montes',
    world: 'Venus',
    worldIcon: '🌡️',
    type: 'mountain',
    icon: '⛰️',
    color: '#fbbf24',
    size: '11 km tall (tallest feature on Venus)',
    earthComparison: 'Mount Everest is 8.85 km. Maxwell Montes is 11 km — the highest point on Venus, surpassing Everest by more than 2 km. However, Maxwell Montes is not a volcano — it\'s more like a tectonic uplift.',
    howFormed: 'Venus may not have plate tectonics, but it does have "tessera terrain" — highly deformed, ancient crust that was compressed and folded. Maxwell Montes appears to be the result of crustal compression, similar to how the Himalayas form on Earth when plates collide.',
    discovery: 'Radar mapping by Pioneer Venus (1979) first revealed Venusian topography. Named after James Clerk Maxwell (the physicist who unified electricity, magnetism, and light) — the only major Venusian feature named after a man (Venus features are traditionally named after women).',
    activeNow: false,
    funFact: 'The top of Maxwell Montes shows a distinctive radar-bright coating. At first thought to be snow, it\'s actually a heavy metal "snow" — lead sulfide and bismuth sulfide that condense at the cooler high-altitude temperatures (-45°C at the peak versus +465°C on the plains). Venus has metallic snow on its mountain peaks.',
    significance: 'Maxwell Montes is evidence that Venus was geologically active in its past and may be today — whether Venus has active volcanism is a major open question. The Magellan spacecraft (1990-1994) mapped 98% of Venus\'s surface by radar, revealing a world with thousands of volcanoes, unique "coronae" (circular volcanic structures), and evidence of recent resurfacing.'
  },
  {
    id: 'south_pole_aitken',
    name: 'South Pole–Aitken Basin',
    world: 'Moon',
    worldIcon: '🌕',
    type: 'crater',
    icon: '🕳️',
    color: '#94a3b8',
    size: '2,500 km across, 8 km deep',
    earthComparison: 'The largest and deepest impact crater in the solar system that\'s been directly mapped. Would stretch from New York to Denver. It\'s so deep that it punched through the Moon\'s crust into the upper mantle.',
    howFormed: 'A massive impact ~4.1 billion years ago. The impacting body was estimated at 170-200 km diameter. The impact exposed the deep lunar mantle, giving us a window into the Moon\'s interior composition.',
    discovery: 'First recognized from Apollo 15 and 16 observations. Fully mapped by Clementine (1994) and Lunar Reconnaissance Orbiter.',
    activeNow: false,
    funFact: 'The South Pole–Aitken Basin is so deep and old that it permanently shadows many of its inner craters, where temperatures drop to -240°C — some of the coldest spots in the solar system. These permanently shadowed regions contain water ice deposits that are critical resources for the Artemis lunar program.',
    significance: 'NASA\'s Artemis missions specifically target the lunar South Pole region at its edge. The water ice here (confirmed by LCROSS impact in 2009 and many subsequent missions) represents billions of tons of potential rocket propellant and life support water. China\'s Chang\'e 6 (2024) landed in this basin and returned samples.'
  },
  {
    id: 'io_pele',
    name: 'Pele Volcano (Io)',
    world: 'Io (Jupiter\'s Moon)',
    worldIcon: '🟡',
    type: 'volcano',
    icon: '🌋',
    color: '#ef4444',
    size: 'Plume height: 300 km; lava lake 200 km across',
    earthComparison: 'Io\'s Pele eruption plume reaches 300 km high (Earth\'s tallest volcanic plume was ~90 km, Pinatubo 1991). Pele ejects sulfur dioxide that creates a ring deposit 1,400 km in diameter around the volcano.',
    howFormed: 'Io is tidally heated by Jupiter\'s enormous gravity — the gravitational forces between Jupiter, Europa, and Ganymede flex Io\'s interior like a rubber ball being squeezed repeatedly, generating enormous frictional heat. This makes Io the most volcanically active body in the solar system.',
    discovery: 'Voyager 1 (1979) — first active extraterrestrial volcano ever discovered. Navigator Linda Morabito first spotted the plume in processed images. The discovery shocked scientists — they had predicted Io might be geologically dead.',
    activeNow: true,
    funFact: 'Io has at least 150 active volcanic centers. Its surface is the youngest in the solar system — resurfaced constantly by lava, erasing all impact craters. The lava temperature can reach 1,800°C — hotter than any lava on Earth. Io\'s sulfur dioxide plumes create Jupiter\'s plasma torus — a ring of ionized gas around Jupiter.',
    significance: 'Io\'s volcanism is a laboratory for understanding tidal heating — a process that keeps Europa\'s ocean liquid and may maintain subsurface oceans on Enceladus, Titan, and Ganymede. NASA\'s Juno spacecraft began close Io flybys in 2023, returning the best images ever of active eruptions.'
  },
  {
    id: 'europa_chaos',
    name: 'Chaos Terrain (Europa)',
    world: 'Europa (Jupiter\'s Moon)',
    worldIcon: '🧊',
    type: 'ice',
    icon: '❄️',
    color: '#67e8f9',
    size: 'Covers ~25% of Europa\'s surface',
    earthComparison: 'No direct Earth analogy — unique to icy ocean worlds. Imagine the Arctic sea ice breaking up and refreezing, but in crust that\'s kilometers thick and driven by ocean currents from below.',
    howFormed: 'The ice shell above Europa\'s liquid water ocean is heated from below by tidal forces (similar to Io). This causes the lower ice to melt, break up into "rafts," drift, and refreeze in new positions — like Arctic sea ice breakup. The result: broken, jumbled blocks of ice called "chaos terrain."',
    discovery: 'Galileo spacecraft (1995-2003) returned detailed images. The chaos terrain was the key evidence that Europa has a subsurface ocean — the rafts of ice had moved independently, something only possible if liquid water was beneath the ice.',
    activeNow: true,
    funFact: 'Recent Hubble observations (2012-2019) detected water vapor plumes erupting from Europa\'s surface — possibly ocean water shooting through cracks in the ice. If confirmed, Europa may be ejecting ocean material into space, where a spacecraft could fly through and sample it without having to drill through kilometers of ice.',
    significance: 'Europa is NASA\'s #1 target for extraterrestrial life search. The ocean has been liquid for ~4 billion years, is in contact with a rocky seafloor (which could provide chemical energy through hydrothermal vents), and has chemistry that may support life. NASA\'s Europa Clipper (launched 2024, arrives 2030) will investigate.'
  },
  {
    id: 'enceladus_geysers',
    name: 'Tiger Stripes (Enceladus)',
    world: 'Enceladus (Saturn\'s Moon)',
    worldIcon: '💍',
    type: 'ice',
    icon: '💧',
    color: '#a855f7',
    size: '4 parallel fissures, each ~130 km long',
    earthComparison: 'Each "tiger stripe" is 500 m deep, 2 km wide, and 130 km long — longer than the entire state of Connecticut. From these four cracks, water geysers reach 500 km high.',
    howFormed: 'Saturn\'s gravitational tides flex Enceladus\'s interior, heating an internal ocean of liquid water. The ocean is in contact with a hot rocky core (hydrothermal activity). The tiger stripes are active fissures where ocean water escapes, freezes, and erupts as water vapor and ice into Saturn\'s E ring.',
    discovery: 'Cassini spacecraft (2005) — complete shock to the scientific community. Enceladus is tiny (only 500 km diameter) and was expected to be an inert ice ball. Instead, Cassini flew through the geysers and detected water vapor, organic molecules, molecular hydrogen (from hydrothermal vents), and silica nanoparticles (indicating hot water reacting with rock).',
    activeNow: true,
    funFact: 'Cassini flew through Enceladus\'s geysers 23 times and directly sampled the chemistry of an alien ocean. In 2017, Cassini detected molecular hydrogen (H₂) — a smoking gun for active hydrothermal vents on the seafloor. On Earth, hydrothermal vents support rich ecosystems without any sunlight. Enceladus may have the same.',
    significance: 'Enceladus has three of the conditions considered necessary for life: liquid water, chemistry (organics + minerals), and energy (hydrothermal vents). It\'s arguably the most compelling target for finding life in the solar system. ESA\'s planned Enceladus missions and NASA\'s Orbilander concept would land and sample the geyser material.'
  },
]

const FEATURE_TYPES: { id: FeatureType; label: string; icon: string }[] = [
  { id: 'volcano', label: 'Volcanoes', icon: '🌋' },
  { id: 'canyon', label: 'Canyons', icon: '🏜️' },
  { id: 'crater', label: 'Craters', icon: '🕳️' },
  { id: 'mountain', label: 'Mountains', icon: '⛰️' },
  { id: 'ice', label: 'Ice Features', icon: '❄️' },
]

export default function PlanetaryGeology() {
  const [selected, setSelected] = useState<GeologicalFeature>(FEATURES[0])
  const [filterType, setFilterType] = useState<FeatureType | 'all'>('all')

  const visible = filterType === 'all' ? FEATURES : FEATURES.filter(f => f.type === filterType)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Planetary Geology</h2>
      <p className="text-gray-400 text-sm mb-5">The most extraordinary geological features across the solar system — volcanoes, canyons, craters, and ice structures that dwarf anything on Earth</p>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterType('all')}
          className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
          style={{
            background: filterType === 'all' ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
            border: `1px solid ${filterType === 'all' ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
            color: filterType === 'all' ? '#a5b4fc' : '#94a3b8',
          }}
        >All</button>
        {FEATURE_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setFilterType(t.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: filterType === t.id ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${filterType === t.id ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
              color: filterType === t.id ? '#a5b4fc' : '#94a3b8',
            }}
          >{t.icon} {t.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Feature list */}
        <div className="space-y-2">
          {visible.map(feat => (
            <button
              key={feat.id}
              onClick={() => setSelected(feat)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === feat.id ? feat.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === feat.id ? feat.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xl">{feat.icon}</span>
                <div>
                  <div className="font-semibold text-sm" style={{ color: selected.id === feat.id ? feat.color : '#e2e8f0' }}>{feat.name}</div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span>{feat.worldIcon}</span>
                    <span>{feat.world}</span>
                    {feat.activeNow && <span className="text-red-400 ml-1">● Active</span>}
                  </div>
                </div>
              </div>
              <div className="ml-8 text-gray-600 text-xs">{feat.size}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3">
              <span className="text-4xl flex-shrink-0">{selected.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  {selected.activeNow && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold text-red-300" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
                      ● Geologically Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm" style={{ color: selected.color }}>
                  <span>{selected.worldIcon}</span>
                  <span>{selected.world}</span>
                </div>
                <div className="text-gray-400 text-xs mt-0.5">Size: {selected.size}</div>
              </div>
            </div>
            <div className="mt-3 bg-black/20 rounded-lg p-3">
              <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Earth Comparison</div>
              <p className="text-gray-300 text-sm">{selected.earthComparison}</p>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">How It Formed</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.howFormed}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Discovery</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.discovery}</p>
            {selected.coordinates && (
              <div className="mt-2 font-mono text-xs text-gray-500">Coordinates: {selected.coordinates}</div>
            )}
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">Scientific Significance</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.significance}</p>
          </div>

          <div className="bg-amber-900/20 rounded-xl p-4 border border-amber-800/30">
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">😲 Fascinating Detail</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
