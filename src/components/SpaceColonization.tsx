import { useState } from 'react'

interface Colony {
  name: string
  location: string
  emoji: string
  distanceKm: number
  gravity: number
  dayLength: string
  radiation: string
  temperature: string
  atmosphere: string
  resources: string[]
  challenges: string[]
  timeline: string
  status: 'active' | 'planned' | 'concept' | 'proposed'
  statusColor: string
  description: string
  missions: string[]
  population: string
}

interface Habitat {
  name: string
  type: string
  size: string
  population: number
  pros: string[]
  cons: string[]
  examples: string[]
  description: string
}

const COLONIES: Colony[] = [
  {
    name: 'Moon (Luna Base)',
    location: 'Earth\'s Moon',
    emoji: '🌕',
    distanceKm: 384400,
    gravity: 0.165,
    dayLength: '29.5 Earth days',
    radiation: '13× Earth surface',
    temperature: '-170°C to +130°C',
    atmosphere: 'Virtually none',
    resources: ['Water ice (poles)', 'Helium-3', 'Silicon', 'Iron', 'Titanium', 'Oxygen from regolith'],
    challenges: ['2-week night', 'Micrometeorite impacts', 'Regolith dust toxicity', 'Radiation exposure', 'Low gravity effects on biology'],
    timeline: '2030s (Artemis Base Camp) → 2040s permanent base',
    status: 'planned',
    statusColor: 'text-blue-400',
    description: 'The nearest celestial body and the first likely permanent human presence beyond Earth. NASA\'s Artemis program aims to establish a lunar base at the south pole where water ice exists in permanently shadowed craters.',
    missions: ['Artemis III (2026 crewed landing)', 'Gateway lunar station (2027)', 'CLPS commercial deliveries (ongoing)', 'ESA Moon Village concept'],
    population: '6–12 crew (2030s) → hundreds (2040s)',
  },
  {
    name: 'Mars (Red City)',
    location: 'Mars',
    emoji: '🔴',
    distanceKm: 78000000,
    gravity: 0.376,
    dayLength: '24h 37m (nearly Earth-like!)',
    radiation: '70× Earth surface',
    temperature: '-80°C average (-140°C to +35°C)',
    atmosphere: 'CO₂ (95%), N₂ (3%), very thin (0.6% Earth pressure)',
    resources: ['CO₂ for propellant', 'Water ice (poles + subsurface)', 'Iron oxide', 'Perchlorate (toxic but manageable)', 'Silicate for construction'],
    challenges: ['7-month journey one-way', 'Dust storms covering the planet (2018 storm lasted 8 months)', 'Cosmic radiation', 'No global magnetic field', 'Terraforming requires millennia'],
    timeline: '2030s first humans → 2040s-50s first permanent base',
    status: 'planned',
    statusColor: 'text-blue-400',
    description: 'The prime target for human colonization. Nearly Earth-like day length, accessible water ice, CO₂ for ISRU oxygen and propellant production. SpaceX Starship + NASA Moon-to-Mars architecture both target Mars. First humans likely in the 2030s.',
    missions: ['SpaceX Starship crewed (2029 target)', 'NASA Mars Sample Return (2030s)', 'Mars Oxygen ISRU (MOXIE on Perseverance proven concept)', 'China Tianwen missions'],
    population: 'First crew of 6 → self-sustaining city of 1M (SpaceX 2050s vision)',
  },
  {
    name: 'Ceres (Asteroid Belt Hub)',
    location: 'Main Asteroid Belt',
    emoji: '⭕',
    distanceKm: 413700000,
    gravity: 0.029,
    dayLength: '9h 4m',
    radiation: '2× Earth',
    temperature: '-105°C average',
    atmosphere: 'Water vapor detected',
    resources: ['Massive water ice deposits', 'Ammonia', 'Carbonates', 'Minerals for asteroid mining support'],
    challenges: ['Very low gravity (hard to work in)', 'Distance from Earth (communication 4–24 min)', 'Extreme cold', 'No magnetic field'],
    timeline: '2050s+ concept',
    status: 'concept',
    statusColor: 'text-yellow-400',
    description: 'The largest body in the asteroid belt — once called a planet, now a dwarf planet. Ceres is 25% water by mass. It could serve as a refueling depot and logistics hub for the outer solar system, and its water ice makes it uniquely valuable.',
    missions: ['Dawn spacecraft (2015–2018 — found bright spots are salt deposits)', 'No crewed missions planned'],
    population: 'Concept: small outpost for asteroid mining support',
  },
  {
    name: 'Europa Ocean Base',
    location: 'Jupiter\'s moon Europa',
    emoji: '🧊',
    distanceKm: 628730000,
    gravity: 0.134,
    dayLength: '3.5 Earth days (tidally locked)',
    radiation: 'Extreme (500 rem/day on surface!)',
    temperature: '-160°C (surface), ~0°C (subsurface ocean)',
    atmosphere: 'Thin O₂ from radiation ice splitting',
    resources: ['Liquid water ocean (twice Earth\'s total water)', 'Thermal energy (tidal heating)', 'Possible hydrothermal vents'],
    challenges: ['Jupiter\'s radiation belt is lethal on surface', 'Ice shell 10–30 km thick to penetrate', 'Extreme cold', 'No solar power at this distance'],
    timeline: '22nd century concept',
    status: 'concept',
    statusColor: 'text-yellow-400',
    description: 'Europa has a liquid water ocean beneath its icy crust, likely containing twice Earth\'s total ocean water. Hydrothermal vents may exist on the ocean floor — similar to where life first emerged on Earth. A subsurface base in the ocean could theoretically be shielded from radiation.',
    missions: ['NASA Europa Clipper (2030 arrival)', 'ESA JUICE mission (Jupiter system)', 'Future: ice-penetrating cryobot probe (2040s+)'],
    population: 'Robotic only for centuries; possible subsurface habitats in 22nd century',
  },
  {
    name: 'Titan Floating City',
    location: 'Saturn\'s moon Titan',
    emoji: '🟠',
    distanceKm: 1272000000,
    gravity: 0.14,
    dayLength: '16 Earth days (tidally locked)',
    radiation: 'Low (Saturn\'s magnetosphere shields it)',
    temperature: '-179°C',
    atmosphere: 'Dense N₂ (95%) + CH₄ (5%) at 1.5× Earth pressure',
    resources: ['Methane lakes (surface)', 'Nitrogen (abundant)', 'Ethane', 'Water ice', 'Organic chemistry (tholins)'],
    challenges: ['Extreme cold (-179°C)', 'Methane lakes not liquid water', '80-minute communication delay', 'Distance from Sun (1/100th Earth solar energy)'],
    timeline: '22nd century concept',
    status: 'concept',
    statusColor: 'text-yellow-400',
    description: 'Titan has the most Earth-like atmosphere of any body in the solar system. Dense nitrogen atmosphere means humans could walk outside in a warm suit without a pressure suit — just an oxygen mask and thermal protection. Methane rain, rivers, and seas on the surface. Dragonfly rotorcraft mission launches 2028.',
    missions: ['NASA Dragonfly rotorcraft (2028 launch, 2034 arrival)', 'No crewed missions planned'],
    population: 'Floating cities concept (warm lighter-than-air habitats in thick atmosphere)',
  },
]

const HABITATS: Habitat[] = [
  {
    name: 'Underground Lava Tubes',
    type: 'Subsurface',
    size: 'Potentially kilometers wide',
    population: 10000,
    pros: ['Radiation shielding from overlying rock', 'Thermal stability (constant temp)', 'Meteor protection', 'No pressure vessel needed if sealed'],
    cons: ['Limited sunlight/solar power', 'Structural uncertainty', 'Difficult construction', 'Potential seismic risk'],
    examples: ['Discovered on Moon and Mars by orbital imaging', 'Some may be 1+ km wide on the Moon'],
    description: 'Volcanic lava tubes on the Moon and Mars could provide ready-made underground habitats. Their rock ceilings block radiation and maintain stable temperatures. NASA considers them a top priority for permanent bases.',
  },
  {
    name: 'Inflatable Habitat (BEAM-type)',
    type: 'Surface module',
    size: '16 m³ to 300 m³',
    population: 6,
    pros: ['Lightweight for launch', 'Expandable after deployment', 'Some radiation shielding', 'Proven technology (BEAM on ISS)'],
    cons: ['Puncture risk', 'Limited radiation protection', 'Dust seals challenging', 'Relatively small volume'],
    examples: ['BEAM (Bigelow Expandable Activity Module) on ISS', 'Sierra Nevada LIFE habitat', 'Axiom Station commercial module'],
    description: 'Inflatable modules can be packed into rockets and expanded on site. NASA tested BEAM on the ISS 2016–2020. Next-gen versions will be larger. The Moon and Mars require additional radiation shielding (regolith bags or water walls).',
  },
  {
    name: 'O\'Neill Cylinder',
    type: 'Space station',
    size: '8 km diameter × 32 km long',
    population: 10000000,
    pros: ['Earth-like 1g gravity via rotation', 'Controlled environment', 'Could house millions', 'Solar power from space', 'No planetary surface constraints'],
    cons: ['Enormous construction cost', 'Material requirements massive', 'Technology not yet available', 'Far future concept'],
    examples: ['Gerard O\'Neill "The High Frontier" (1977)', 'Jeff Bezos Blue Origin orbital habitats', 'Amazon founder\'s "preferred future"'],
    description: 'A pair of rotating cylindrical space stations providing artificial gravity. Proposed by physicist Gerard O\'Neill in 1977. Each cylinder could contain its own ecosystem, weather, agriculture, and millions of people. Uses asteroid-mined materials.',
  },
  {
    name: '3D-Printed Regolith Base',
    type: 'Surface structure',
    size: 'Scalable modules',
    population: 100,
    pros: ['Uses local materials (ISRU)', 'Radiation shielding from thick walls', 'Low transport mass from Earth', 'Scalable'],
    cons: ['Requires capable robotic printers', 'Regolith chemistry may be challenging', 'Quality control in extreme environments', 'Multi-year construction time'],
    examples: ['NASA CHAPEA analog habitat (2023)', 'ICON\'s Project Olympus (Moon printer)', 'ESA\'s 3D-printed Moon base concept'],
    description: 'Robots 3D-print habitats from local regolith before humans arrive. NASA ran the CHAPEA Mars analog mission in 2023 in a 3D-printed habitat. ICON is developing the "Project Olympus" lunar construction system for Artemis.',
  },
]

export default function SpaceColonization() {
  const [selected, setSelected] = useState<Colony>(COLONIES[0])
  const [activeTab, setActiveTab] = useState<'colonies' | 'habitats' | 'technology'>('colonies')

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Colonization</h2>
      <p className="text-slate-400 text-sm mb-5">Humanity's roadmap to becoming a multi-planetary species — where we could go and how</p>

      <div className="flex gap-1 mb-5">
        {([['colonies', '🌍 Target Worlds'], ['habitats', '🏗️ Habitat Designs'], ['technology', '⚙️ Key Technologies']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'colonies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-2">
            {COLONIES.map((c, i) => (
              <button key={i} onClick={() => setSelected(c)} className={`w-full text-left p-3 rounded-xl transition-all ${selected.name === c.name ? 'bg-slate-700 ring-1 ring-indigo-500' : 'bg-slate-800 hover:bg-slate-700'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="text-white font-semibold text-sm">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`font-medium ${c.statusColor}`}>{c.status.toUpperCase()}</span>
                  <span className="text-slate-400">{c.timeline.split('→')[0].trim()}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-slate-900 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-4xl">{selected.emoji}</span>
              <div>
                <h3 className="text-white font-bold text-xl">{selected.name}</h3>
                <div className="text-slate-400 text-sm">{selected.location}</div>
                <span className={`text-xs font-bold ${selected.statusColor}`}>{selected.status.toUpperCase()}</span>
              </div>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed mb-4">{selected.description}</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Gravity', value: `${selected.gravity}g` },
                { label: 'Day length', value: selected.dayLength },
                { label: 'Radiation', value: selected.radiation },
                { label: 'Temperature', value: selected.temperature },
                { label: 'Atmosphere', value: selected.atmosphere },
                { label: 'Population goal', value: selected.population },
              ].map((s, i) => (
                <div key={i} className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">{s.label}</div>
                  <div className="text-white text-xs font-medium mt-0.5">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-slate-500 text-xs mb-1">Resources ✅</div>
                {selected.resources.map((r, i) => <div key={i} className="text-green-400 text-xs">• {r}</div>)}
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">Challenges ⚠️</div>
                {selected.challenges.map((c, i) => <div key={i} className="text-orange-400 text-xs">• {c}</div>)}
              </div>
            </div>

            <div>
              <div className="text-slate-500 text-xs mb-1">Key missions</div>
              {selected.missions.map((m, i) => (
                <div key={i} className="flex gap-2 items-start text-xs">
                  <span className="text-indigo-400">▸</span>
                  <span className="text-slate-300">{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'habitats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HABITATS.map((h, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-white font-bold">{h.name}</h4>
                <span className="text-slate-400 text-xs">{h.size}</span>
              </div>
              <div className="text-slate-400 text-xs mb-2">{h.type} · Up to {h.population.toLocaleString()} people</div>
              <p className="text-slate-300 text-sm leading-relaxed mb-3">{h.description}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-green-400 text-xs mb-1">Pros</div>
                  {h.pros.slice(0, 3).map((p, j) => <div key={j} className="text-slate-400 text-xs">+ {p}</div>)}
                </div>
                <div>
                  <div className="text-orange-400 text-xs mb-1">Cons</div>
                  {h.cons.slice(0, 3).map((c, j) => <div key={j} className="text-slate-400 text-xs">− {c}</div>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'technology' && (
        <div className="space-y-3">
          {[
            { icon: '🚀', name: 'In-Situ Resource Utilization (ISRU)', trl: 8, desc: 'Using local materials to produce oxygen, water, and propellant. NASA\'s MOXIE on Perseverance produced O₂ from Martian CO₂ in 2021. Eliminates need to bring everything from Earth.', examples: 'MOXIE (Mars O₂), lunar water extraction, regolith sintering' },
            { icon: '☢️', name: 'Nuclear Power (Fission)', trl: 7, desc: 'Solar panels are too weak beyond Mars. Nuclear fission reactors provide reliable power regardless of location, dust, or night length. NASA/DOE Kilopower reactor demonstrated 2018.', examples: 'Kilopower (10kW), NASA Fission Surface Power (40kW), space nuclear propulsion' },
            { icon: '🌱', name: 'Closed-Loop Life Support', trl: 6, desc: 'Recycling air, water, and waste with near-100% efficiency. ISS already recycles 93% of water. Plants can close biological loops and provide food + oxygen. No resupply from Earth.', examples: 'MELiSSA (ESA), ECLSS (NASA ISS), Antarctic base analogs' },
            { icon: '🧬', name: 'Radiation Countermeasures', trl: 4, desc: 'Long-duration space radiation causes cancer, cataracts, and CNS damage. Solutions: active magnetic shielding, hydrogen-rich materials, pharmaceutical radioprotectors, genetic engineering.', examples: 'Peppermint oil tests (antioxidants), stem cell research, polyethylene shielding' },
            { icon: '🤖', name: 'Advanced Robotics & Autonomous Construction', trl: 5, desc: 'Robots must build habitats before humans arrive. Need to operate autonomously in extreme conditions, 3D-print structures, and maintain systems without human supervision.', examples: 'ICON\'s Vulcan 3D printer, ESA\'s RegoLith 3D printing, Boston Dynamics robotic construction' },
            { icon: '🌡️', name: 'Terraforming (Long-term)', trl: 1, desc: 'Transforming a planet\'s atmosphere, temperature, and surface to support Earth life. Mars terraforming estimates: 100 years (optimistic, with greenhouse gases) to 100,000 years. Ethical debates ongoing.', examples: 'Mars atmospheric pressure increase, polar ice sublimation, nitrogen import from Titan (SpaceX concept)' },
          ].map((tech, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{tech.icon}</span>
                  <span className="text-white font-semibold">{tech.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-slate-500 text-xs">TRL</div>
                  <div className="text-white font-bold">{tech.trl}/9</div>
                </div>
              </div>
              <div className="mb-2 h-1.5 bg-slate-700 rounded-full">
                <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full" style={{ width: `${(tech.trl / 9) * 100}%` }} />
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-1">{tech.desc}</p>
              <div className="text-slate-500 text-xs">Examples: <span className="text-slate-400">{tech.examples}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
