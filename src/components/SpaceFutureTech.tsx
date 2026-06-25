import { useState } from 'react'

type Category = 'propulsion' | 'habitat' | 'power' | 'manufacturing' | 'communication' | 'biology'

interface Technology {
  id: string
  name: string
  category: Category
  icon: string
  color: string
  trl: number
  readiness: string
  timeline: string
  shortDesc: string
  howItWorks: string
  currentState: string
  challenges: string[]
  gameChanger: string
  whoIsWorking: string
}

const TECHNOLOGIES: Technology[] = [
  {
    id: 'nuclear_thermal',
    name: 'Nuclear Thermal Propulsion (NTP)',
    category: 'propulsion',
    icon: '⚛️',
    color: '#ef4444',
    trl: 5,
    readiness: 'Proven in ground tests; needs flight demo',
    timeline: '2027–2035',
    shortDesc: 'Use a nuclear reactor to heat propellant to extreme temperatures for 2× better efficiency than chemical rockets',
    howItWorks: 'A nuclear fission reactor heats liquid hydrogen to ~2,500°C, which is then expelled through a nozzle. Specific impulse (Isp) of 800–1,000 s — vs. ~450 s for the best chemical engines. Same thrust as chemical but half the propellant needed.',
    currentState: 'NASA and DARPA\'s DRACO project (Demonstration Rocket for Agile Cislunar Operations) aims for a flight demonstration in 2027. BWXT Nuclear Energy and Lockheed Martin are developing the reactor. The U.S. tested nuclear thermal engines in the NERVA program (1966–1972) — never flew in space.',
    challenges: ['Nuclear launch safety regulations', 'Hydrogen storage and cryogenics in space', 'Reactor shielding mass', 'Public perception of nuclear in space', 'Refueling in deep space'],
    gameChanger: 'Mars transit time cut from 9 months to 4 months. Also crucial for Jupiter system exploration where solar power is too weak. Enables faster, safer crewed missions throughout the solar system.',
    whoIsWorking: 'NASA + DARPA (DRACO), Lockheed Martin, BWXT Nuclear Energy; Russia has nuclear propulsion history (TOPAZ reactors)'
  },
  {
    id: 'solar_sail',
    name: 'Solar & Laser Sails',
    category: 'propulsion',
    icon: '⛵',
    color: '#fbbf24',
    trl: 6,
    readiness: 'Flown in space; scaling challenges remain',
    timeline: '2025–2040 (solar); 2040–2060 (laser)',
    shortDesc: 'Use radiation pressure from sunlight (or a ground-based laser) to accelerate spacecraft with zero propellant',
    howItWorks: 'Photons impart momentum when they reflect off a reflective surface (pressure = 2P/c × A). Solar sails use sunlight; laser sails use a powerful ground or space-based laser array. Breakthrough Starshot proposes accelerating gram-scale probes to 20% light speed using a 100 GW laser array.',
    currentState: 'JAXA\'s IKAROS (2010) was the first successful solar sail in deep space. NASA\'s NEA Scout (2022) attempted a solar sail mission. The Planetary Society\'s LightSail 2 (2019) successfully demonstrated solar sailing in Earth orbit. Laser propulsion: Breakthrough Starshot is in early development.',
    challenges: ['Extremely thin sails (few microns) are fragile', 'Attitude control with light pressure', 'Laser sails require >100 GW laser arrays (not yet built)', 'Deceleration at destination', 'Thermal management'],
    gameChanger: 'Gram-scale probes could reach Alpha Centauri in 20 years (vs. thousands with conventional rockets). For cargo, continuous solar sailing could move large payloads through the solar system cheaply.',
    whoIsWorking: 'Breakthrough Starshot (Yuri Milner), NASA, JAXA, Planetary Society'
  },
  {
    id: 'ion_drive',
    name: 'Advanced Ion Propulsion (Hall Thrusters)',
    category: 'propulsion',
    icon: '🔵',
    color: '#3b82f6',
    trl: 9,
    readiness: 'Flight-proven; scaling to higher power ongoing',
    timeline: 'Now → 2035',
    shortDesc: 'Electrically accelerate ions to extreme velocities — much higher exhaust speed than chemical rockets, vastly lower propellant consumption',
    howItWorks: 'A magnetic field confines electrons in a ring (Hall effect). Xenon gas is ionized and accelerated by an electric field to 30+ km/s exhaust velocity (vs. ~4.5 km/s for hydrolox). Isp: 1,500–10,000 s. Low thrust but extremely efficient — perfect for long missions where time is not critical.',
    currentState: 'Deep Space 1 (1998), Dawn (2007–2018), Starlink satellites, and SMART-1 (ESA) all used ion propulsion. NASA\'s Solar Electric Propulsion (SEP) for the Lunar Gateway. New 50 kW Hall thruster demonstrated by Aerojet Rocketdyne for Mars missions.',
    challenges: ['Low thrust requires long burn times (months to accelerate)', 'Xenon supply and cost', 'Power source for high-power thrusters in deep space', 'Erosion of thruster walls over time'],
    gameChanger: 'Already transforming robotic exploration. For cargo (not crew, who can\'t wait months), SEP + solar panels could revolutionize supply chain logistics for a lunar/Mars economy.',
    whoIsWorking: 'NASA Glenn Research Center, Aerojet Rocketdyne, SpaceX (Starlink Krypton Hall thrusters), ExoTerra, Apollo Fusion'
  },
  {
    id: 'fusion_drive',
    name: 'Fusion Propulsion',
    category: 'propulsion',
    icon: '🌟',
    color: '#a855f7',
    trl: 2,
    readiness: 'Concept-stage; fusion itself not yet net energy positive in compact form',
    timeline: '2045–2070',
    shortDesc: 'Harness nuclear fusion to propel spacecraft at velocities unreachable by any other technology — enabling the outer solar system in weeks',
    howItWorks: 'Various concepts: Direct Fusion Drive (Princeton) uses a field-reversed configuration to fuse D-He³; the exhaust products are direct thrust + electricity. MSNW\'s Fusion Driven Rocket pulses a metal liner into plasma. Isp: 10,000–30,000 s at megawatt power levels. Thrust-to-weight far better than ion drives.',
    currentState: 'NASA\'s NIAC (Innovative Advanced Concepts) has funded multiple fusion propulsion studies. Princeton Plasma Physics Lab\'s Direct Fusion Drive is in early experiments. General Fusion, TAE Technologies building commercial fusion (not for propulsion). NIF (2022) achieved fusion ignition — first net energy gain.',
    challenges: ['Fusion containment at spacecraft scale (no large tokamaks)', 'D-He³ fuel requires mining He³ from the Moon or gas giants', 'Huge engineering complexity', 'Power management', 'Mass budget for shielding'],
    gameChanger: 'Titan in 3 months. Pluto in a year. Jupiter\'s moons as routine destinations. With fusion, the entire solar system becomes accessible on human timescales. This is the technology that makes the solar system a civilization.',
    whoIsWorking: 'Princeton Plasma Physics Lab, NASA NIAC, MSNW, TAE Technologies (commercially), ITER (science base)'
  },
  {
    id: 'space_habitat',
    name: 'Inflatable/Expandable Space Habitats',
    category: 'habitat',
    icon: '🏠',
    color: '#22c55e',
    trl: 7,
    readiness: 'Tested on ISS; commercial development active',
    timeline: '2025–2035',
    shortDesc: 'Flexible habitats that launch compact and expand to large volumes in space — fundamentally more efficient than rigid modules',
    howItWorks: 'Kevlar-reinforced multi-layer inflatable structures that expand to much larger volumes than their launch configuration. BEAM (on ISS since 2016) is ~16 m³ inflated, launched as 4 m³. Can be multi-layer for radiation shielding. Sierra Space\'s LIFE habitat is designed to be 3× ISS volume.',
    currentState: 'Bigelow Aerospace pioneered the concept (B330). NASA\'s BEAM module has been on ISS since 2016 and has performed well. Sierra Space (SNC) is developing LARGE Integrated Flexible Environment (LIFE) for commercial space stations. Northrop Grumman developing inflatable lunar habitat.',
    challenges: ['Micrometeorite resistance at full scale', 'Long-term radiation shielding sufficiency', 'Fire suppression in pressurized inflatable', 'Structural integrity over decades', 'Regolith augmentation for extra shielding on Moon/Mars'],
    gameChanger: 'A commercial space station could offer 20× the volume of ISS at a fraction of the cost per cubic meter. On the Moon or Mars, surface habitats could provide comfortable living space at a tiny fraction of rigid habitat launch mass.',
    whoIsWorking: 'Sierra Space, Axiom Space, Northrop Grumman, NASA (BEAM), Bigelow Aerospace (paused)'
  },
  {
    id: 'in_situ',
    name: 'In-Situ Resource Utilization (ISRU)',
    category: 'manufacturing',
    icon: '⛏️',
    color: '#f97316',
    trl: 5,
    readiness: 'Demonstrated on Mars (MOXIE); scaling needed',
    timeline: '2026–2040',
    shortDesc: 'Manufacture propellant, water, oxygen, and building materials from local resources on the Moon and Mars — ending dependence on Earth supply chains',
    howItWorks: 'Mars atmosphere (95% CO₂) → Sabatier reaction + electrolysis → CH₄/O₂ propellant (SpaceX\'s Raptor propellant). Moon regolith → heated at 1000°C → oxygen extraction. Mars/asteroid water ice → electrolysis → H₂ + O₂. Lunar concrete from regolith. 3D printing structures from local material.',
    currentState: 'MOXIE (Mars Oxygen In-Situ Resource Experiment, Perseverance rover) produced 122 g of oxygen from Mars atmosphere — proof of concept. SpaceX\'s entire Starship/Super Heavy mission architecture depends on making propellant on Mars. Moon water ice confirmed at poles.',
    challenges: ['Scaling MOXIE-scale to industrial (tons/day)', 'Energy requirements in low-light environments', 'Dust contamination of equipment', 'Processing efficiency at low temperatures', 'Autonomous operation without human maintenance'],
    gameChanger: 'ISRU is the single technology that transforms space from "extremely expensive expeditions" to "sustainable civilization." Without ISRU, every Mars mission costs $10B+. With ISRU, propellant is essentially free — only the first missions from Earth are expensive.',
    whoIsWorking: 'NASA (MOXIE, ISRU on Artemis), SpaceX (full Mars colony design), ESA (Moon Village concept), Astrobotic, Masten Space Systems'
  },
  {
    id: 'nuclear_power',
    name: 'Fission Surface Power (Space Nuclear Reactors)',
    category: 'power',
    icon: '⚡',
    color: '#06b6d4',
    trl: 5,
    readiness: 'Kilopower tested; Moon reactor in development',
    timeline: '2027–2035',
    shortDesc: 'Small nuclear fission reactors providing reliable 10–40 kW power on the Moon and Mars where solar panels are insufficient',
    howItWorks: 'A compact uranium-235 fission reactor with a Stirling engine or thermoelectric generator converts heat to electricity. NASA\'s Kilopower reactor: 1–10 kW, fission in enriched U-235 core, heat pipes for passive cooling, Stirling converters. No moving parts in the reactor. Operates in the dark (lunar night, polar regions, Mars dust storms).',
    currentState: 'NASA\'s Kilopower Reactor Using Stirling Technology (KRUSTY) operated successfully at 1 kW in 2018. NASA + DOE Fission Surface Power project aims for a 40 kW lunar demonstration by 2027. Los Alamos, Idaho National Laboratory developing concepts.',
    challenges: ['Launch safety certification', 'Heat rejection radiators at scale', 'Shielding mass for humans nearby', 'Regulatory framework', 'Integration with existing space systems'],
    gameChanger: 'Enables operations anywhere on the Moon or Mars regardless of sunlight. A 40 kW reactor powers a crew of 4 indefinitely, including ISRU oxygen production, lighting, life support, computing, and EVA recharging.',
    whoIsWorking: 'NASA + DOE (Fission Surface Power), Los Alamos National Lab, Idaho National Lab, BWX Technologies, Westinghouse'
  },
  {
    id: 'quantum_comms',
    name: 'Quantum Communication & Navigation',
    category: 'communication',
    icon: '🔗',
    color: '#8b5cf6',
    trl: 4,
    readiness: 'Ground-to-satellite QKD demonstrated; deep space extension needed',
    timeline: '2030–2050',
    shortDesc: 'Quantum key distribution (QKD) for unhackable communications; quantum clocks for GPS-free navigation anywhere in the solar system',
    howItWorks: 'QKD: Entangled photon pairs sent between locations; any eavesdropping disturbs the entanglement detectably → provably secure encryption. Quantum clocks: optical lattice clocks accurate to 1 second per 30 billion years → precision navigation without GPS infrastructure. Quantum sensors for gravity mapping (detecting underground ice/minerals).',
    currentState: 'China\'s Micius satellite demonstrated QKD over 1,200 km (2017). ESA\'s EAGLE-1 QKD satellite planned. Quantum clocks exist in labs (NIST-F2). DARPA\'s quantum navigation program. Honeywell\'s quantum sensors for INS.',
    challenges: ['Photon loss over long distances in space', 'Noise from background starlight', 'Scaling to interplanetary distances', 'Cost of quantum hardware', 'Integration with classical communication'],
    gameChanger: 'In a spacefaring civilization with assets spread across the solar system, secure quantum communications become critical infrastructure. Unhackable mission-critical data channels; precision navigation without GPS at Mars or beyond.',
    whoIsWorking: 'China (Micius), ESA (EAGLE-1), NASA, DARPA, Honeywell, IonQ, Quantinuum'
  },
  {
    id: 'space_medicine',
    name: 'Space Biomedical Engineering',
    category: 'biology',
    icon: '🧬',
    color: '#10b981',
    trl: 4,
    readiness: 'Research phase; first therapies entering trials',
    timeline: '2030–2050',
    shortDesc: 'Counter the devastating physiological effects of long-duration spaceflight: bone loss, muscle atrophy, radiation damage, vision changes, immune suppression',
    howItWorks: 'Artificial gravity via centrifuge modules or rotating spacecraft (2RPM at 10m radius = 1g). Pharmacological countermeasures for bone loss (bisphosphonates, PTH analogs). Gene therapy to upregulate radiation repair genes. Magnetic shielding for deep space. 3D-printed tissue/organ replacements. Cryogenic hibernation for transit.',
    currentState: 'ISS research has extensively characterized the health problems. NASA\'s Twin Study (Mark/Scott Kelly) showed gene expression changes, telomere lengthening. JAXA and NASA developing countermeasures. University of Rochester demonstrated partial cryoprotection in organoids. Radiation shielding materials research ongoing.',
    challenges: ['No perfect countermeasure for deep space radiation (2-3x higher than ISS)', 'Artificial gravity adds significant mass and complexity', 'Immune dysregulation in microgravity', 'Psychological effects of deep space isolation', 'Reproductive health in reduced gravity environments'],
    gameChanger: 'Without solving these problems, a Mars transit will leave a crew visually impaired and weakened upon arrival. Solving human physiology for space is the prerequisite for everything else — you can build the best rockets and habitats in the world and still lose the crew to radiation.',
    whoIsWorking: 'NASA (Human Research Program), ESA, JAXA, SpaceX, Blue Origin, academia (NASA HRP grants)'
  },
]

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'propulsion', label: 'Propulsion', icon: '🚀' },
  { id: 'habitat', label: 'Habitat', icon: '🏠' },
  { id: 'manufacturing', label: 'Manufacturing', icon: '⛏️' },
  { id: 'power', label: 'Power', icon: '⚡' },
  { id: 'communication', label: 'Comms', icon: '📡' },
  { id: 'biology', label: 'Biology', icon: '🧬' },
]

function TRLBar({ trl, color }: { trl: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Technology Readiness Level (TRL)</span>
        <span className="font-bold" style={{ color }}>{trl}/9</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-2 flex-1 rounded-sm"
            style={{ background: i < trl ? color : 'rgba(255,255,255,0.08)' }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>Research</span>
        <span>Flight proven</span>
      </div>
    </div>
  )
}

export default function SpaceFutureTech() {
  const [activeCategory, setActiveCategory] = useState<Category>('propulsion')
  const [selected, setSelected] = useState<Technology>(TECHNOLOGIES[0])

  const filtered = TECHNOLOGIES.filter(t => t.category === activeCategory)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Future Space Technologies</h2>
      <p className="text-gray-400 text-sm mb-5">The breakthrough technologies that will determine humanity's future in space — from nuclear propulsion to quantum communications</p>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat.id); setSelected(TECHNOLOGIES.find(t => t.category === cat.id)!) }}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
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
        {/* Tech list */}
        <div className="space-y-2">
          {filtered.map(tech => (
            <button
              key={tech.id}
              onClick={() => setSelected(tech)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === tech.id ? tech.color + '15' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === tech.id ? tech.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{tech.icon}</span>
                <div className="font-semibold text-sm" style={{ color: selected.id === tech.id ? tech.color : '#e2e8f0' }}>{tech.name}</div>
              </div>
              <div className="flex items-center gap-3 ml-8">
                <div className="flex gap-0.5">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div key={i} className="w-2 h-1.5 rounded-sm"
                      style={{ background: i < tech.trl ? tech.color : 'rgba(255,255,255,0.08)' }} />
                  ))}
                </div>
                <span className="text-gray-500 text-xs">{tech.timeline}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{selected.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <div className="text-sm" style={{ color: selected.color }}>{selected.timeline} • {selected.readiness}</div>
              </div>
            </div>
            <TRLBar trl={selected.trl} color={selected.color} />
            <p className="text-gray-300 text-sm mt-3">{selected.shortDesc}</p>
          </div>

          {/* How it works */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">How It Works</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.howItWorks}</p>
          </div>

          {/* Current state */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Current State of Development</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.currentState}</p>
            <div className="mt-2 text-xs text-gray-500">Working on it: {selected.whoIsWorking}</div>
          </div>

          {/* Challenges */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Key Challenges</div>
            <div className="space-y-1">
              {selected.challenges.map((c, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-orange-400 flex-shrink-0">⚠</span>
                  <span className="text-gray-300">{c}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Game changer */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}25` }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>Why It\'s a Game-Changer</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.gameChanger}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
