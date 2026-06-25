import { useState } from 'react'

type Danger = 'vacuum' | 'radiation' | 'temperature' | 'impact' | 'gravity'

interface Location {
  id: string
  name: string
  icon: string
  color: string
  type: string
  distance: string
  temperature: string
  radiation: string
  atmosphere: string | null
  gravity: string
  survivalTime: string
  survivalTimeSeconds: number
  whatHappens: string[]
  biggestKiller: Danger
  couldYouSurvive: string
  strangeFact: string
  protectionNeeded: string[]
  realMission: string
}

const LOCATIONS: Location[] = [
  {
    id: 'leo',
    name: 'Low Earth Orbit (ISS)',
    icon: '🛸',
    color: '#3b82f6',
    type: 'Near-Earth space',
    distance: '400 km above Earth',
    temperature: '-157°C to +121°C (alternates every 45 min)',
    radiation: '~80× Earth surface (still below lethal acute dose)',
    atmosphere: null,
    gravity: '~8.7 m/s² (microgravity due to freefall)',
    survivalTime: '~15 seconds of useful consciousness; ~2 minutes until death',
    survivalTimeSeconds: 120,
    biggestKiller: 'vacuum',
    whatHappens: [
      '0-10 s: You hold your breath (this is wrong — exhale or your lungs rupture as pressure differentiates)',
      '0-15 s: Nitrogen dissolved in blood begins to form bubbles (decompression sickness). Saliva, tears boil.',
      '10-20 s: Blood pressure drops rapidly. Brain receives insufficient oxygen. You lose consciousness.',
      '30-60 s: Blood begins to "boil" (actually evaporate) in low-pressure regions. Skin and tissue swell.',
      '60-120 s: Cardiac arrest follows oxygen deprivation. Brain death begins.',
      'Temperature: Barely an issue in this timeframe — space is a poor conductor (no convection in vacuum).',
      'Radiation: A few minutes of EVA radiation exposure is within survivable doses — not the immediate killer.',
    ],
    couldYouSurvive: 'If repressurized within ~30-60 seconds with emergency treatment, possibly — with serious decompression injuries. NASA has studied brief accidental exposures in altitude chambers. Recovery within 30 seconds is probably survivable.',
    strangeFact: 'You would NOT freeze instantly. Space is extremely cold but vacuum is an insulator — without air to conduct heat away, you\'d actually be in danger of overheating from solar radiation before you\'d feel cold. Astronaut suits have active cooling systems.',
    protectionNeeded: ['Pressurized suit (minimum ~3.3 kPa for oxygen breathing)', 'Thermal regulation (active heating/cooling)', 'Oxygen supply', 'Micrometeorite protection (Whipple shield)'],
    realMission: 'The ISS is protected by the Van Allen belts from the worst solar particles. Astronauts receive ~150 mSv/year (compared to ~3 mSv at Earth\'s surface). Lifetime exposure limits are strictly monitored.'
  },
  {
    id: 'moon',
    name: 'The Moon (Daylight)',
    icon: '🌕',
    color: '#94a3b8',
    type: 'Lunar surface',
    distance: '384,400 km (average)',
    temperature: '+127°C (daytime) / -173°C (night)',
    radiation: '~200× Earth surface (no magnetosphere, no atmosphere)',
    atmosphere: 'Essentially none (10⁻¹² Earth pressure)',
    gravity: '1.62 m/s² (16.5% of Earth)',
    survivalTime: '~15 seconds of consciousness; ~2 minutes until death',
    survivalTimeSeconds: 120,
    biggestKiller: 'vacuum',
    whatHappens: [
      'Same vacuum physiology as LEO — but radiation dose is 200× Earth surface.',
      'Daytime temperature: +127°C. Without a suit, direct solar radiation would rapidly heat your body.',
      'Lunar dust (regolith) is extremely abrasive — jagged, glass-like particles from meteorite impacts.',
      'UV radiation is unfiltered — severe radiation burns within seconds.',
      'Zero atmospheric pressure means immediate decompression of all body cavities.',
      'Without a suit, micrometeoroids present a higher hazard than in LEO (no Kármán line deflection).',
    ],
    couldYouSurvive: 'Not without a suit. However, once you have a suit, the Moon is actually relatively accessible — 3-day transit, 1/6 gravity, plenty of water ice at poles for ISRU. The main suit challenges are dust abrasion, thermal management, and radiation.',
    strangeFact: 'A single lunar day is 29.5 Earth days. An astronaut on the Moon during "lunar noon" in the Sea of Tranquility stands under direct sunlight for ~2 weeks straight. The temperature swing from lunar night (-173°C) to noon (+127°C) is 300°C — handled by the Apollo suits\' highly polished thermal coating.',
    protectionNeeded: ['Full Extravehicular Mobility Unit (EMU) or xEMU', 'Radiation shelter for solar particle events', 'Dust-sealed joints and seals', 'Thermal control (multi-layer insulation + heaters)'],
    realMission: 'Apollo astronauts spent up to 7 hours outside at a time. The biggest operational problem was dust — it coated everything, abraded seals, and stuck electrostatically to visors. NASA\'s Artemis program prioritizes improved dust mitigation.'
  },
  {
    id: 'mars',
    name: 'Mars Surface',
    icon: '🔴',
    color: '#ef4444',
    type: 'Martian surface',
    distance: '54–401 million km (varies enormously)',
    temperature: '-60°C average (-125°C night / +20°C afternoon)',
    radiation: '~100× Earth surface (thin CO₂ atmosphere provides some shielding)',
    atmosphere: '0.6% of Earth\'s (95% CO₂, ~1% argon, ~2% nitrogen, trace O₂)',
    gravity: '3.72 m/s² (38% of Earth)',
    survivalTime: '~2 minutes without pressure suit',
    survivalTimeSeconds: 120,
    biggestKiller: 'vacuum',
    whatHappens: [
      'Atmospheric pressure: ~0.6 kPa — far below the Armstrong limit (6.3 kPa below which fluids boil at body temperature).',
      'You would experience decompression sickness and unconsciousness within 15-30 seconds.',
      'The CO₂ atmosphere can\'t be breathed — but even if breathable pressure existed, the composition is toxic.',
      'Temperature: In summer near equator, afternoon temps reach 20°C. The main thermal danger is windchill from dust storms.',
      'Dust storms can last months and cover the entire planet. Solar panels lose 90% efficiency.',
      'Radiation: 2-3× ISS exposure. Cumulative doses during transit + surface = major cancer risk.',
    ],
    couldYouSurvive: 'With a suit — absolutely yes. Mars is one of the most accessible targets for long-term settlement. SpaceX\'s entire architecture aims for Mars settlements in the 2030s. The challenges are: radiation (requires underground habitat), dust, perchlorate soil chemistry, and supply chain.',
    strangeFact: 'Mars has the largest volcano in the solar system (Olympus Mons, 25 km high, 600 km wide) and the deepest canyon (Valles Marineris, 7 km deep, stretches 3,000 km — the width of the US). Its moons (Phobos and Deimos) are captured asteroids — Phobos will crash into Mars in ~50 million years.',
    protectionNeeded: ['Pressurized habitat (not necessarily full suit 24/7)', 'Radiation shelter (3-5m regolith cover provides adequate shielding)', 'CO₂ filtration', 'Dust storm contingency power'],
    realMission: 'Perseverance rover (2021) carries MOXIE (oxygen production from CO₂). Ingenuity helicopter demonstrated powered flight in 1% Earth atmosphere. Mars is currently humanity\'s most actively explored other world.'
  },
  {
    id: 'venus',
    name: 'Venus Surface',
    icon: '🌡️',
    color: '#fbbf24',
    type: 'Venusian surface',
    distance: '38–261 million km',
    temperature: '+465°C average (constant — no night/day variation at surface)',
    radiation: 'Minimal (thick cloud cover blocks most radiation)',
    atmosphere: '92× Earth pressure (9.2 MPa) — mostly CO₂, sulfuric acid clouds',
    gravity: '8.87 m/s² (90% of Earth — feels almost like home)',
    survivalTime: 'Less than 1 second',
    survivalTimeSeconds: 1,
    biggestKiller: 'temperature',
    whatHappens: [
      'Temperature: 465°C — hotter than a standard oven\'s maximum setting, hotter than some volcanic lava.',
      'Your body would literally begin cooking before you could register the sensation.',
      'Pressure: 92 atm — equivalent to being 900 meters underwater. You would be immediately crushed.',
      'Atmosphere: Dense CO₂ and SO₂. The "air" is a toxic, suffocating mixture that would also be superheating you.',
      'Sulfuric acid clouds are 40-70 km up (not at surface), but H₂SO₄ rain does reach some altitudes.',
      'The Soviet Venera probes survived only 23-127 minutes on the surface despite being armored steel spheres.',
    ],
    couldYouSurvive: 'No. Not even remotely. Venus is the most hostile planetary surface in the solar system for Earth life. Temperature alone is lethal in under a second — no suit material we currently have would survive more than a few minutes. The Venera 13 probe (1982) held the surface record: 127 minutes.',
    strangeFact: 'Venus rotates backwards relative to most planets (retrograde rotation) and so slowly that a Venusian day (243 Earth days) is longer than its year (225 Earth days). If you could stand on Venus, the Sun would rise in the west and set in the east — very slowly. The cloud tops, however, are surprisingly temperate (~70°C) and have been proposed as habitats for aerial life forms.',
    protectionNeeded: ['No currently-feasible human suit exists for Venus surface', 'Extreme-temperature alloys (titanium aluminide) survive minutes only', 'Future concept: aerostats in upper cloud layer (50-60 km altitude, 1 atm pressure, 70°C temperature)'],
    realMission: 'NASA\'s DAVINCI+ and ESA\'s EnVision (2030s) will send probes. HAVOC (High Altitude Venus Operational Concept) proposes habitable aerostats at 50-60 km altitude where conditions are relatively Earthlike.'
  },
  {
    id: 'europa',
    name: 'Europa Surface',
    icon: '🧊',
    color: '#67e8f9',
    type: 'Jovian moon surface',
    distance: '~628 million km from Earth (varies)',
    temperature: '-160°C average',
    radiation: '540 rem/day (lethal human dose is ~450 rem total)',
    atmosphere: 'Trace oxygen (10⁻¹¹ bar — negligible)',
    gravity: '1.315 m/s² (13.4% of Earth)',
    survivalTime: '~1 day (but you\'d be receiving a lethal radiation dose constantly)',
    survivalTimeSeconds: 86400,
    biggestKiller: 'radiation',
    whatHappens: [
      'Radiation: Europa sits deep in Jupiter\'s radiation belts. You receive 540 rem/day — a lethal whole-body dose of ~450 rem would kill most humans.',
      'Temperature: -160°C is severely cold but not instantly lethal with a suit.',
      'Vacuum: Same immediate decompression hazard as other airless bodies.',
      'The ice surface is constantly being churned by tidal heating and radiation — chaotic "chaos terrain."',
      'Tidal flexing generates enormous heat in the subsurface ocean — but the surface is literally frozen.',
      'If you somehow survived, you\'d experience Jupiter rising huge in the sky — 24× the angular diameter of our Moon.',
    ],
    couldYouSurvive: 'Not on the surface — the radiation alone would be lethal within a day even in a suit. However, below ~10 meters of ice, radiation drops to survivable levels. The subsurface ocean (100-170 km deep) is shielded by all that ice and might harbor life without any suit issues — if you had a submarine.',
    strangeFact: 'Europa\'s subsurface ocean may contain twice as much liquid water as all of Earth\'s oceans combined. The water-ice shell is 15-25 km thick. Beneath it, the ocean has been liquid for ~4 billion years — nearly as long as life has existed on Earth. NASA\'s Europa Clipper (launched 2024) will make 50 flybys to characterize the ice shell and ocean.',
    protectionNeeded: ['Extreme radiation shielding (>10g/cm² of water-equivalent shielding)', 'Cryogenic suit for -160°C', 'Vacuum pressure suit', 'Anti-radiation pharmaceuticals (still theoretical)'],
    realMission: 'NASA\'s Europa Clipper launched in 2024 and will arrive at Jupiter in 2030. It cannot orbit Europa (radiation would destroy electronics in weeks) — instead it makes rapid flybys. ESA\'s JUICE (Jupiter Icy Moons Explorer) also launched 2023.'
  },
  {
    id: 'titan',
    name: 'Titan (Saturn\'s Moon)',
    icon: '🟠',
    color: '#f97316',
    type: 'Saturnian moon surface',
    distance: '~1.2 billion km from Earth',
    temperature: '-179°C',
    radiation: 'Low (Saturn\'s magnetosphere provides some shielding)',
    atmosphere: '1.45× Earth pressure (nitrogen-rich, with methane — breathable pressure but unbreathable composition)',
    gravity: '1.352 m/s² (13.8% of Earth)',
    survivalTime: 'Hours to days (cold is the primary killer; radiation is low)',
    survivalTimeSeconds: 3600,
    biggestKiller: 'temperature',
    whatHappens: [
      'Temperature: -179°C is cold enough to freeze methane (methane\'s boiling point is -161°C). Lakes of liquid methane exist on the surface.',
      'Atmosphere: Titan is the only moon with a thick atmosphere — 1.5× Earth pressure. But it\'s nitrogen + methane + trace organics. You need oxygen.',
      'Pressure: Actually comfortable for a suit — you need oxygen and thermal protection, not a pressure suit per se.',
      'Radiation: Surprisingly low compared to Europa — Saturn\'s field is less intense and further from the sun.',
      'Orange haze: Titan\'s sky is orange due to complex organic molecules (tholins) formed by UV and cosmic rays.',
      'Methane rain and rivers exist. Lakes of liquid methane at the poles.',
    ],
    couldYouSurvive: 'Titan is one of the most intriguing places in the solar system for human exploration. You\'d need: oxygen (no O₂ in the atmosphere), thermal suit for -179°C, but NOT a pressure suit (the atmosphere is thick enough). You could arguably walk on Titan with an insulated oxygen suit and no full pressure garment. This makes Titan uniquely accessible.',
    strangeFact: 'In Titan\'s low gravity + thick atmosphere, you could strap wings to your arms and fly by flapping. The atmosphere is dense enough for human-powered flight. NASA\'s Dragonfly mission (launch ~2027) is a nuclear-powered helicopter that will hop across Titan\'s surface — the first aerial vehicle on another moon.',
    protectionNeeded: ['Oxygen supply (atmosphere has no O₂)', 'Extreme-cold insulation (-179°C)', 'Eye protection (UV from organic haze)', 'NOT a pressure suit — atmospheric pressure is similar to Earth\'s ocean floor at shallow depth (sufficient)'],
    realMission: 'NASA\'s Dragonfly (expected launch 2028, arrival 2034) will fly across Titan\'s surface, sampling chemistry and looking for prebiotic organic compounds. Titan\'s methane lakes can\'t harbor Earth-style life (no liquid water) but could host exotic methane-based life forms.'
  },
  {
    id: 'interstellar',
    name: 'Interstellar Space',
    icon: '🌑',
    color: '#1e293b',
    type: 'Beyond the heliopause',
    distance: '> 120 AU from the Sun',
    temperature: '~2.73 K (cosmic microwave background) — effectively absolute zero',
    radiation: 'Galactic cosmic rays (unshielded by solar wind)',
    atmosphere: 'Sub-atomic — ~1 hydrogen atom per cubic meter',
    gravity: 'Negligible (far from any mass)',
    survivalTime: 'Less than 1 second',
    survivalTimeSeconds: 1,
    biggestKiller: 'vacuum',
    whatHappens: [
      'Identical vacuum physiology to LEO — decompression, boiling of blood, unconsciousness within 15-30 seconds.',
      'Temperature: 2.73 K = -270.42°C. Thermal radiation from your body would dissipate into the CMB background.',
      'But! Without air to conduct heat, cooling would be very slow (only radiative cooling). You\'d actually radiate at ~310 K. Space at 2.73 K is extremely cold but a poor thermal sink without convection.',
      'Galactic cosmic rays: High-energy particles (protons, alpha particles, heavy ions from supernova shocks) would stream through you. Much worse than LEO or even Mars.',
      'Complete isolation: The nearest stellar system is ~4.2 light-years away. No rescue. No resources.',
      'If given a suit — you\'d still drift forever at whatever velocity you have relative to the solar system.',
    ],
    couldYouSurvive: 'With a suit — you could technically survive for years if supplied with power and oxygen. But you\'d be utterly stranded with no propulsion. The Voyager probes travel at ~17 km/s — it would still take them 75,000 years to reach the nearest star. Interstellar space is where "isolation" gets its cosmic definition.',
    strangeFact: 'The interstellar medium between stars is a mix of gas (mostly hydrogen), cosmic rays, and occasionally very faint starlight. It\'s not truly empty — there are about 1 hydrogen atom per cubic centimeter (10⁶ per m³ in denser regions). That\'s still a trillion times less dense than Earth\'s atmosphere.',
    protectionNeeded: ['Everything a space station provides: oxygen, pressure, water, food, power', 'Propulsion (impossible to return without it)', 'Extended radiation shielding for galactic cosmic rays', 'Psychological support — there is literally nothing to see but stars'],
    realMission: 'Voyager 1 (launched 1977) crossed the heliopause in 2012 and is now in interstellar space at ~164 AU. It\'s powered by a plutonium RTG producing 4 watts. The probe still transmits data that takes 22+ hours to reach Earth at light speed.'
  },
]

const DANGER_COLORS: Record<Danger, string> = {
  vacuum: '#3b82f6',
  radiation: '#a855f7',
  temperature: '#ef4444',
  impact: '#f97316',
  gravity: '#22c55e',
}

const DANGER_LABELS: Record<Danger, string> = {
  vacuum: 'Vacuum/Pressure',
  radiation: 'Radiation',
  temperature: 'Temperature',
  impact: 'Impact',
  gravity: 'Gravity',
}

export default function SpaceSurvivalGuide() {
  const [selected, setSelected] = useState<Location>(LOCATIONS[0])

  const survivabilityPct = Math.min(100, Math.round((Math.log10(selected.survivalTimeSeconds + 1) / Math.log10(86400 * 365)) * 100))

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Survival Guide</h2>
      <p className="text-gray-400 text-sm mb-5">What would happen to an unprotected human at different locations in space — and what protection would actually work</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Location list */}
        <div className="space-y-2">
          {LOCATIONS.map(loc => (
            <button
              key={loc.id}
              onClick={() => setSelected(loc)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === loc.id ? loc.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === loc.id ? loc.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{loc.icon}</span>
                <div>
                  <div className="font-semibold text-sm" style={{ color: selected.id === loc.id ? loc.color : '#e2e8f0' }}>{loc.name}</div>
                  <div className="text-gray-500 text-xs">{loc.type}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-8">
                <div
                  className="text-xs px-2 py-0.5 rounded-md font-semibold"
                  style={{ background: DANGER_COLORS[loc.biggestKiller] + '20', color: DANGER_COLORS[loc.biggestKiller] }}
                >
                  ⚠ {DANGER_LABELS[loc.biggestKiller]}
                </div>
                <span className="text-red-400 text-xs font-bold">{loc.survivalTime.split(';')[0]}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-5xl flex-shrink-0">{selected.icon}</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-0.5">{selected.name}</h3>
                <div className="text-sm" style={{ color: selected.color }}>{selected.type} • {selected.distance}</div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {[
                { label: 'Temperature', value: selected.temperature },
                { label: 'Radiation', value: selected.radiation },
                { label: 'Gravity', value: selected.gravity },
                { label: 'Pressure', value: selected.atmosphere ?? 'Vacuum' },
                { label: 'Biggest Threat', value: DANGER_LABELS[selected.biggestKiller] },
                { label: 'Without Suit', value: selected.survivalTime.split(';')[0] },
              ].map(s => (
                <div key={s.label} className="bg-black/20 rounded-lg p-2">
                  <div className="text-gray-500 text-xs">{s.label}</div>
                  <div className="font-semibold text-xs text-white">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Survival meter */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Relative Survivability</span>
                <span className="font-bold" style={{ color: selected.color }}>{selected.survivalTime.split(';')[0]}</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-2 rounded-full transition-all"
                  style={{ width: `${Math.max(2, survivabilityPct)}%`, background: selected.color }} />
              </div>
            </div>
          </div>

          {/* What happens */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-red-400 text-xs uppercase font-semibold mb-2">⚠ What Happens (Unprotected)</div>
            <div className="space-y-1.5">
              {selected.whatHappens.map((w, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-red-500 flex-shrink-0 mt-0.5">▸</span>
                  <span className="text-gray-300 leading-relaxed">{w}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Could you survive */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-emerald-400 text-xs uppercase font-semibold mb-2">🛡 Could You Survive? (With Proper Equipment)</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.couldYouSurvive}</p>
          </div>

          {/* Protection */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🔧 Protection Needed</div>
            <div className="space-y-1">
              {selected.protectionNeeded.map((p, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-indigo-400 flex-shrink-0">✓</span>
                  <span className="text-gray-300">{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Strange fact + real mission */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-amber-900/20 rounded-xl p-3 border border-amber-800/30">
              <div className="text-amber-400 text-xs uppercase font-semibold mb-1">😮 Strange Fact</div>
              <p className="text-amber-100/80 text-xs leading-relaxed">{selected.strangeFact}</p>
            </div>
            <div className="bg-indigo-900/20 rounded-xl p-3 border border-indigo-800/30">
              <div className="text-indigo-400 text-xs uppercase font-semibold mb-1">🚀 Real Mission Data</div>
              <p className="text-indigo-100/80 text-xs leading-relaxed">{selected.realMission}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
