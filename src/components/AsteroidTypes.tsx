import { useState } from 'react'

interface AsteroidType {
  class: string
  symbol: string
  color: string
  pct_of_total: number
  albedo: string
  composition: string
  example: string
  example_size: string
  belt_location: string
  mining_value: string
  desc: string
  minerals: string[]
}

interface FamousAsteroid {
  name: string
  type: string
  diameter: string
  distance: string
  emoji: string
  notable: string
  visited?: string
  value?: string
}

const ASTEROID_TYPES: AsteroidType[] = [
  {
    class: 'C-type', symbol: 'C', color: '#6b7280',
    pct_of_total: 75, albedo: '0.03-0.09 (very dark)',
    composition: 'Carbonaceous — clay minerals, carbon, water ice',
    example: 'Ceres', example_size: '945 km', belt_location: 'Outer main belt',
    mining_value: 'High — water ice, carbon compounds',
    desc: 'The most common asteroid type, making up ~75% of all asteroids. Extremely dark (low albedo) because they\'re rich in carbon and contain unprocessed primordial material from the early solar system. Many contain water-bearing minerals, making them prime targets for space mining for water (→ rocket propellant).',
    minerals: ['Carbon compounds', 'Hydrated silicates', 'Water ice', 'Sulfur', 'Organic molecules'],
  },
  {
    class: 'S-type', symbol: 'S', color: '#d97706',
    pct_of_total: 17, albedo: '0.10-0.22 (moderately bright)',
    composition: 'Silicaceous — silicate rock + metal (iron-nickel)',
    example: 'Eros', example_size: '17 km', belt_location: 'Inner main belt',
    mining_value: 'Very high — precious metals, structural metals',
    desc: 'Silicaceous asteroids are the second most common type. They\'re moderately bright, made of silicate minerals mixed with metallic iron-nickel. Similar in composition to stony meteorites. Japan\'s Hayabusa missions returned samples from two S-type asteroids (Itokawa and Ryugu variant). The inner belt is full of S-types.',
    minerals: ['Olivine', 'Pyroxene', 'Iron-nickel', 'Plagioclase', 'Trace gold & platinum'],
  },
  {
    class: 'M-type', symbol: 'M', color: '#9ca3af',
    pct_of_total: 8, albedo: '0.10-0.18',
    composition: 'Metallic — predominantly iron-nickel alloy',
    example: 'Psyche (16)', example_size: '220 km', belt_location: 'Middle main belt',
    mining_value: 'Astronomical — solid metal core worth ~$10 quintillion',
    desc: 'Metallic asteroids may be the exposed iron-nickel cores of differentiated planetesimals — worlds that were shattered by ancient collisions, leaving only their metal cores. They\'re extraordinarily rare and valuable. The asteroid 16 Psyche is estimated to contain more iron than humans have ever mined in history — NASA\'s Psyche mission arrived in 2023.',
    minerals: ['Iron-nickel alloy', 'Cobalt', 'Iridium', 'Platinum group metals', 'Gold'],
  },
  {
    class: 'V-type', symbol: 'V', color: '#7c3aed',
    pct_of_total: 6, albedo: '0.20-0.40 (bright)',
    composition: 'Basaltic — volcanic surface rock',
    example: 'Vesta (4)', example_size: '525 km', belt_location: 'Inner-middle belt',
    mining_value: 'Moderate — volcanic rock, geochemical interest',
    desc: 'Vestoids — basaltic asteroids that likely originated from the large asteroid Vesta, which was struck and shattered long ago. Vesta is differentiated (has a core, mantle, and crust) making it a "protoplanet." HED meteorites on Earth are thought to come from Vesta. Dawn spacecraft orbited Vesta 2011-2012.',
    minerals: ['Pyroxene', 'Plagioclase', 'Basalt', 'Impact melt glass'],
  },
  {
    class: 'D-type', symbol: 'D', color: '#7f1d1d',
    pct_of_total: 4, albedo: '< 0.05 (very dark red)',
    composition: 'Very dark, reddish — organic compounds, possibly water ice',
    example: 'Trojans (Jupiter L4/L5)', example_size: 'Various', belt_location: 'Outer belt + Trojan clouds',
    mining_value: 'Unknown — complex organics could be scientifically valuable',
    desc: 'The darkest, reddest asteroid type. D-types are found predominantly in the outer main belt and Jupiter Trojan clouds. Their extremely dark red color suggests complex organic compounds (tholins) and possibly water ice. They may be similar to Kuiper Belt Objects that were scattered inward. NASA\'s Lucy mission will visit Trojan D-types in the 2020s-2030s.',
    minerals: ['Complex organics (tholins)', 'Possible water ice', 'Anhydrous silicates', 'Carbon'],
  },
]

const FAMOUS_ASTEROIDS: FamousAsteroid[] = [
  { name: 'Ceres', type: 'C-type (Dwarf Planet)', diameter: '945 km', distance: '2.77 AU', emoji: '⚪', notable: 'Largest asteroid — classified as a dwarf planet. Has water ice geysers (cryovolcanism). Dawn spacecraft found bright salt deposits.', visited: 'Dawn (2015-2018)' },
  { name: '16 Psyche', type: 'M-type', diameter: '220 km', distance: '2.92 AU', emoji: '⚫', notable: 'May be an exposed planetary core of solid iron-nickel. Estimated value: $10 quintillion (more than world economy).', visited: 'NASA Psyche mission (2023+)', value: '~$10 quintillion' },
  { name: 'Apophis (99942)', type: 'S-type', diameter: '375 m', distance: 'Earth-crossing', emoji: '☄️', notable: 'Will pass within 32,000 km of Earth in 2029 — visible to naked eye! Gravitational keyhole could alter its orbit. Renewed concern after 2021 refinements.' },
  { name: 'Bennu', type: 'C-type (rubble pile)', diameter: '490 m', distance: '1.13 AU', emoji: '🪨', notable: 'OSIRIS-REx returned 250g sample to Earth in 2023. Contains amino acids and water-bearing minerals. Low probability of Earth impact after 2175.', visited: 'OSIRIS-REx (2018-2020, sample 2023)' },
  { name: 'Itokawa', type: 'S-type (rubble pile)', diameter: '535 m', distance: '0.95-1.70 AU', emoji: '🪵', notable: 'Hayabusa 1 returned first ever asteroid samples (2010). Revealed asteroids are "rubble piles" held together by gravity, not solid rocks.', visited: 'Hayabusa 1 (2005, samples 2010)' },
  { name: 'Ryugu', type: 'C-type (rubble pile)', diameter: '900 m', distance: '1.19 AU', emoji: '⬛', notable: 'Hayabusa 2 returned samples with amino acids and organic compounds (2020). One of the most pristine samples of early solar system material.', visited: 'Hayabusa 2 (2018-2019, samples 2020)' },
  { name: 'Oumuamua', type: 'Unknown (interstellar)', diameter: '~200m × 30m', distance: 'Interstellar', emoji: '🛸', notable: 'First detected interstellar object (2017). Puzzling cigar-like shape, unusual acceleration. Origin and nature still debated. Some proposed it\'s a light sail fragment.' },
  { name: 'Didymos/Dimorphos', type: 'S-type binary', diameter: '780m/160m', distance: '1.18 AU', emoji: '🎯', notable: 'DART spacecraft successfully changed Dimorphos\' orbit in 2022 — first planetary defense test. Orbit shortened by 33 minutes.', visited: 'DART impact 2022 (first planetary defense test)' },
]

export default function AsteroidTypes() {
  const [selected, setSelected] = useState<AsteroidType>(ASTEROID_TYPES[0])
  const [view, setView] = useState<'types' | 'famous' | 'mining'>('types')

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🪨</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Asteroid Types & Space Mining</h2>
          <p className="text-orange-300 text-sm">Taxonomy, composition, famous objects, and the trillion-dollar asteroid economy</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['types', 'famous', 'mining'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === v ? 'bg-orange-700 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {v === 'types' ? '🏷️ Classifications' : v === 'famous' ? '⭐ Famous Asteroids' : '⛏️ Space Mining'}
          </button>
        ))}
      </div>

      {view === 'types' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {ASTEROID_TYPES.map(t => (
              <button
                key={t.class}
                onClick={() => setSelected(t)}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all flex items-center gap-3 ${selected.class === t.class ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg flex-shrink-0"
                  style={{ backgroundColor: t.color + '30', color: t.color, border: `1px solid ${t.color}50` }}>
                  {t.symbol}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm">{t.class}</div>
                  <div className="text-xs text-gray-500">{t.pct_of_total}% of asteroids</div>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-12 bg-white/10 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${t.pct_of_total}%`, backgroundColor: t.color }} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center font-black text-3xl"
                  style={{ backgroundColor: selected.color + '20', color: selected.color, border: `2px solid ${selected.color}50` }}>
                  {selected.symbol}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.class} Asteroids</h3>
                  <div className="text-sm text-gray-500">{selected.pct_of_total}% of known asteroids · {selected.belt_location}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: 'Albedo', value: selected.albedo },
                  { label: 'Composition', value: selected.composition },
                  { label: 'Example', value: `${selected.example} (${selected.example_size})` },
                  { label: 'Mining Value', value: selected.mining_value },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/5 rounded-lg p-2">
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="text-xs text-white">{value}</div>
                  </div>
                ))}
              </div>

              <p className="text-sm text-gray-300 leading-relaxed mb-3">{selected.desc}</p>

              <div className="text-xs text-gray-400 font-semibold mb-1.5 uppercase">Key Minerals</div>
              <div className="flex flex-wrap gap-1.5">
                {selected.minerals.map(m => (
                  <span key={m} className="text-xs px-2 py-0.5 rounded-full border text-gray-300"
                    style={{ borderColor: selected.color + '50', backgroundColor: selected.color + '15' }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Distribution chart */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-xs text-gray-400 font-semibold mb-3 uppercase">Distribution in Main Belt</div>
              {ASTEROID_TYPES.map(t => (
                <div key={t.class} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-gray-400 w-12">{t.class}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${t.pct_of_total}%`, backgroundColor: t.color }} />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-8 text-right">{t.pct_of_total}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'famous' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FAMOUS_ASTEROIDS.map(ast => (
            <div key={ast.name} className="bg-white/5 rounded-xl p-4 border border-white/10 flex gap-3">
              <span className="text-3xl flex-shrink-0">{ast.emoji}</span>
              <div>
                <div className="font-bold text-white">{ast.name}</div>
                <div className="flex flex-wrap gap-1.5 mt-0.5 mb-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-400">{ast.type}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-400">⌀ {ast.diameter}</span>
                  {ast.value && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-500/20">{ast.value}</span>}
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{ast.notable}</p>
                {ast.visited && <div className="text-xs text-cyan-400 mt-1.5">🛸 {ast.visited}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'mining' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-xl p-5 border border-yellow-500/20">
            <h3 className="font-bold text-white text-lg mb-2">The Asteroid Economy</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              The asteroid belt contains more metal than humans have mined in all of history, multiplied by millions.
              A single metallic M-type asteroid 1 km across contains more iron-nickel than Earth has ever produced.
              16 Psyche alone is estimated at $10 quintillion ($10,000,000,000,000,000,000) — more than the global economy by 1.3 million times.
            </p>
          </div>

          {[
            {
              resource: 'Water (H₂O)', emoji: '💧', from: 'C-type asteroids', value: 'Foundation resource',
              use: 'Split into hydrogen + oxygen for rocket fuel. Enables in-space propellant depots. Eliminates need to launch water from Earth at $10,000/kg.',
              companies: ['Planetary Resources (acquired)', 'TransAstra', 'Karman+'],
            },
            {
              resource: 'Platinum Group Metals', emoji: '🥈', from: 'S and M-type asteroids', value: '$25,000-$40,000/oz',
              use: 'Platinum, palladium, rhodium, osmium, iridium are critical for electronics, clean energy (fuel cells), catalysts. Earth supply is limited.',
              companies: ['Deep Space Industries (acquired)', 'AstroForge (active 2023)'],
            },
            {
              resource: 'Iron-Nickel', emoji: '⚙️', from: 'M-type asteroids', value: 'Structural material in space',
              use: 'Building material for space structures — space stations, solar panels, habitats. Far cheaper to mine in space than launch from Earth ($10,000/kg to LEO).',
              companies: ['Various conceptual programs'],
            },
            {
              resource: 'Helium-3', emoji: '☀️', from: 'Lunar regolith / outer asteroids', value: '$1,000/gram potential',
              use: 'Fusion fuel — clean fusion reactors using He-3 produce no neutron radiation. Moon is richest known source. Could power Earth for centuries.',
              companies: ['Interlune (lunar He-3)', 'Various fusion programs'],
            },
          ].map(r => (
            <div key={r.resource} className="bg-white/5 rounded-xl p-4 border border-white/10 flex gap-3">
              <span className="text-3xl flex-shrink-0">{r.emoji}</span>
              <div>
                <div className="font-bold text-white mb-0.5">{r.resource}</div>
                <div className="flex gap-2 mb-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-400">Source: {r.from}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/30 text-green-300 border border-green-500/20">{r.value}</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed mb-2">{r.use}</p>
                <div className="text-xs text-orange-300">Companies: {r.companies.join(', ')}</div>
              </div>
            </div>
          ))}

          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-xs text-gray-400">
            <span className="text-yellow-400 font-semibold">Legal status: </span>
            The 2015 US Commercial Space Launch Competitiveness Act grants US citizens the right to own resources extracted from space.
            Luxembourg, UAE, and Japan have similar laws. The Outer Space Treaty prohibits "national appropriation" of celestial bodies
            but doesn't address private resource extraction — a legal grey area being actively debated.
          </div>
        </div>
      )}
    </div>
  )
}
