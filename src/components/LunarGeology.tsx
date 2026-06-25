import { useState } from 'react'

interface LunarFeature {
  name: string
  type: string
  emoji: string
  size: string
  age: string
  color: string
  desc: string
  facts: string[]
  visited?: string
}

const FEATURES: LunarFeature[] = [
  {
    name: 'Mare Tranquillitatis', type: 'Mare (Sea)', emoji: '🌑', color: '#374151',
    size: '873 km diameter', age: '3.9 billion years',
    desc: 'The Sea of Tranquility — dark basaltic plains formed by ancient volcanic eruptions filling impact basins. The Apollo 11 landing site (Sea of Tranquility Base) is here. The dark color comes from iron-rich basalt lava that flowed here billions of years ago.',
    facts: [
      'Apollo 11 landed here July 20, 1969',
      'Neil Armstrong\'s first step location',
      'Basalt lava formed 3.6-3.9 Gyr ago',
      'One of the largest mare on the nearside',
    ],
    visited: 'Apollo 11 (1969)',
  },
  {
    name: 'Tycho Crater', type: 'Impact Crater', emoji: '💥', color: '#9ca3af',
    size: '85 km diameter, 4.8 km deep', age: '108 million years (relatively young)',
    desc: 'One of the Moon\'s most prominent craters with spectacular ray systems extending thousands of kilometers across the surface. The bright rays are fresh ejecta from the impact. At 108 million years old, it\'s geologically young — dinosaurs were alive when it formed on Earth. Features a central peak mountain.',
    facts: [
      'Rays extend >1,500 km from crater',
      'Central peak reaches 2 km height',
      'Named after astronomer Tycho Brahe',
      '108 Myr old — formed in dinosaur era',
    ],
  },
  {
    name: 'Oceanus Procellarum', type: 'Mare (Ocean)', emoji: '🌊', color: '#1e3a5f',
    size: '2,500 km across (largest mare)', age: '3.0–3.5 billion years',
    desc: 'The Ocean of Storms is the largest dark region on the Moon, unlike typical circular impact-basin maria. Its irregular shape has puzzled scientists — recent evidence suggests it may be the remnant of an ancient volcanic province rather than a simple impact basin. Apollo 12 landed here.',
    facts: [
      'Largest mare on the Moon',
      'Irregular shape — unusual origin',
      'Apollo 12 landed here (1969)',
      'May be ancient volcanic "hot spot"',
    ],
    visited: 'Apollo 12 (1969)',
  },
  {
    name: 'Vallis Alpes (Alpine Valley)', type: 'Valley/Graben', emoji: '🏔️', color: '#6b7280',
    size: '166 km long, 10 km wide', age: '~3.9 billion years',
    desc: 'A dramatic straight valley cutting through the Lunar Alps mountain range. Likely formed by tectonic faulting (a graben) associated with the Imbrium basin impact. A thin sinuous rille (ancient lava channel) runs along its floor, suggesting later volcanic activity.',
    facts: [
      'Cuts through the Lunar Alps mountains',
      'Tectonic origin — not impact',
      'Sinuous rille on valley floor',
      'Visible through amateur telescope',
    ],
  },
  {
    name: 'Aristarchus Plateau', type: 'Volcanic Complex', emoji: '🌋', color: '#d97706',
    size: '200 km plateau', age: '3.9 billion year plateau; 450 Myr craters',
    desc: 'The most volcanically active region on the Moon. The bright Aristarchus crater (40 km, 2.7 km deep) is the Moon\'s brightest large crater. The Schröter\'s Valley (the Moon\'s largest rille) winds from the adjacent Herodotus volcano. Transient Lunar Phenomena — temporary glows — are frequently reported here.',
    facts: [
      'Most volcanically active lunar region',
      'Schröter\'s Valley: 160 km sinuous rille',
      'Aristarchus: Moon\'s brightest crater',
      'Transient glows reported — gas outgassing?',
    ],
  },
  {
    name: 'Mare Imbrium', type: 'Mare / Impact Basin', emoji: '⭕', color: '#1f2937',
    size: '1,145 km diameter', age: '3.85 billion years',
    desc: 'The Sea of Rains — one of the largest impact basins on the Moon, visible to the naked eye as the upper-right dark region. Formed by a massive asteroid impact during the Late Heavy Bombardment, then flooded with basaltic lava. Several Apollo missions landed on its edges.',
    facts: [
      'Diameter 1,145 km',
      'Formed 3.85 Gyr ago',
      'Surrounded by Apennine Mountains',
      'Apollo 15 landed at its edge',
    ],
    visited: 'Apollo 15 landed at edge',
  },
  {
    name: 'South Pole–Aitken Basin', type: 'Impact Basin (largest)', emoji: '🕳️', color: '#111827',
    size: '2,500 km diameter, 8 km deep', age: '~4.1 billion years',
    desc: 'The largest and oldest impact crater in the Solar System — 2,500 km across and 8 km deep, covering most of the lunar south pole. It\'s on the far side but extends to the south pole. Contains water ice in permanently shadowed craters. India\'s Chandrayaan-3 (2023) and China\'s Chang\'e missions targeted this region.',
    facts: [
      'Largest confirmed impact crater in Solar System',
      '2,500 km diameter — almost 25% of Moon',
      'Contains water ice in shadows',
      'Chandrayaan-3 landed near south pole (2023)',
      'Source of mantle material insights',
    ],
    visited: 'Chandrayaan-3 (2023) near south pole',
  },
  {
    name: 'Copernicus Crater', type: 'Impact Crater', emoji: '🎯', color: '#78716c',
    size: '93 km diameter, 3.8 km deep', age: '800 million years',
    desc: 'Often called the "Monarch of the Moon." A young, well-preserved complex crater with terraced walls, a central peak complex, and prominent ray system. The impact excavated deep material and created secondary craters for hundreds of kilometers. Its fresh rays make it spectacular in binoculars.',
    facts: [
      'Ray system extends 800+ km',
      'Three central peaks 1.2 km high',
      'Named after astronomer Copernicus',
      'Used to define the Copernican Period of lunar time',
    ],
  },
  {
    name: 'Lunar Poles — Water Ice', type: 'Water Ice Deposits', emoji: '🧊', color: '#bfdbfe',
    size: 'Multiple craters, total ~600 million tons estimated', age: 'Accumulated over billions of years',
    desc: 'Permanently shadowed craters at the lunar poles never see sunlight — temperatures stay at -230°C. Water ice delivered by comets and asteroids over billions of years accumulates here. NASA\'s LCROSS mission (2009) confirmed ice. Artemis will explore and potentially harvest this water for drinking, oxygen, and rocket fuel.',
    facts: [
      'LCROSS confirmed ice in 2009',
      '~600 million metric tons estimated',
      'Temperature: -230°C (colder than Pluto)',
      'Can be split into H₂ + O₂ for rocket fuel',
      'Artemis base camp planned here',
    ],
    visited: 'LCROSS impact 2009; Artemis planned',
  },
  {
    name: 'Rima Hadley', type: 'Sinuous Rille', emoji: '〰️', color: '#92400e',
    size: '135 km long, 1.5 km wide, 300 m deep', age: '3.3 billion years',
    desc: 'An ancient lava tube or channel carved by flowing lava 3.3 billion years ago. Apollo 15 landed next to it and astronauts drove their Lunar Roving Vehicle along its edge. The rille cuts through the lunar mare revealing exposed geological layers — a natural cross-section through lunar history.',
    facts: [
      'Apollo 15 landed 1.5 km away (1971)',
      'Astronauts could see the walls from surface',
      'Ancient lava channel or tube collapse',
      'Exposed geological stratigraphy',
    ],
    visited: 'Apollo 15 (1971)',
  },
]

const ROCK_TYPES = [
  { name: 'Mare Basalt', emoji: '🖤', color: '#374151', pct: 17, desc: 'Dark volcanic rocks filling ancient impact basins. Rich in iron and titanium. Similar to Earth\'s oceanic crust. Formed 3-4 billion years ago from lava flows.' },
  { name: 'Highland Anorthosite', emoji: '⚪', color: '#e5e7eb', pct: 83, desc: 'Light-colored plagioclase-rich rocks forming the ancient lunar crust. Created during the Magma Ocean phase ~4.5 billion years ago when anorthite crystals floated to the surface.' },
  { name: 'KREEP Terrain', emoji: '🟡', color: '#d97706', pct: 0, desc: 'Potassium (K), Rare Earth Elements, Phosphorus — concentrated in certain regions. Represents the last remnants of the primordial magma ocean, enriched in incompatible elements.' },
  { name: 'Regolith', emoji: '💭', color: '#9ca3af', pct: 0, desc: 'Pulverized rock and dust covering the surface, 2-20 meters deep. Created by billions of years of micrometeorite impacts. Contains glass beads from impact melts. Electrostatically charged — sticks to everything.' },
]

const MISSIONS_TIMELINE = [
  { year: 1959, name: 'Luna 2', country: '🇷🇺', type: 'Impactor', achievement: 'First spacecraft to reach the Moon' },
  { year: 1966, name: 'Luna 9', country: '🇷🇺', type: 'Lander', achievement: 'First soft landing on the Moon' },
  { year: 1969, name: 'Apollo 11', country: '🇺🇸', type: 'Crewed', achievement: 'First humans on the Moon (Armstrong, Aldrin)' },
  { year: 1972, name: 'Apollo 17', country: '🇺🇸', type: 'Crewed', achievement: 'Last crewed lunar landing; 741 kg of samples' },
  { year: 1994, name: 'Clementine', country: '🇺🇸', type: 'Orbiter', achievement: 'First evidence of polar ice deposits' },
  { year: 2009, name: 'LRO/LCROSS', country: '🇺🇸', type: 'Orbiter/Impactor', achievement: 'Confirmed water ice at south pole' },
  { year: 2013, name: 'Chang\'e 3', country: '🇨🇳', type: 'Lander+Rover', achievement: 'First Chinese lunar landing; Yutu rover' },
  { year: 2019, name: 'Chang\'e 4', country: '🇨🇳', type: 'Lander+Rover', achievement: 'First landing on lunar far side' },
  { year: 2023, name: 'Chandrayaan-3', country: '🇮🇳', type: 'Lander', achievement: 'First landing near south pole; confirmed sulfur' },
  { year: 2025, name: 'Artemis III', country: '🇺🇸', type: 'Crewed (planned)', achievement: 'First crewed south pole landing planned' },
]

export default function LunarGeology() {
  const [selected, setSelected] = useState<LunarFeature>(FEATURES[0])
  const [view, setView] = useState<'features' | 'rocks' | 'missions'>('features')
  const [filterType, setFilterType] = useState('All')

  const types = ['All', ...Array.from(new Set(FEATURES.map(f => f.type.split(' ')[0])))]
  const filtered = filterType === 'All' ? FEATURES : FEATURES.filter(f => f.type.startsWith(filterType))

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🌕</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Lunar Geology Explorer</h2>
          <p className="text-gray-300 text-sm">Craters, maria, mountain ranges, valleys, and ice deposits of the Moon</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['features', 'rocks', 'missions'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${view === v ? 'bg-gray-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {v === 'features' ? '🗺️ Features' : v === 'rocks' ? '🪨 Rock Types' : '🚀 Missions'}
          </button>
        ))}
      </div>

      {view === 'features' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {types.slice(0, 5).map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${filterType === t ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {filtered.map(f => (
                <button
                  key={f.name}
                  onClick={() => setSelected(f)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2 ${selected.name === f.name ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}
                >
                  <span className="text-lg">{f.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{f.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{f.type}</div>
                  </div>
                  {f.visited && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-500/20 flex-shrink-0">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">{selected.emoji}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{selected.type}</span>
                    {selected.visited && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-500/20">🚀 {selected.visited}</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white/5 rounded-lg p-2">
                  <div className="text-xs text-gray-500">Size</div>
                  <div className="text-xs text-white font-mono">{selected.size}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <div className="text-xs text-gray-500">Age</div>
                  <div className="text-xs text-white font-mono">{selected.age}</div>
                </div>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed mb-3">{selected.desc}</p>

              <div className="text-xs text-gray-400 font-semibold mb-1.5 uppercase">Key Facts</div>
              <ul className="space-y-1">
                {selected.facts.map(f => (
                  <li key={f} className="text-xs text-gray-300 flex gap-1.5">
                    <span className="text-gray-500">▸</span>{f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Moon face diagram (simplified text) */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-xs">
              <div className="text-gray-400 mb-2 font-semibold">Moon Quick Stats</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Diameter', value: '3,474 km' },
                  { label: 'Distance', value: '384,400 km' },
                  { label: 'Craters >1km', value: '~300,000' },
                  { label: 'Gravity', value: '1.62 m/s² (1/6 Earth)' },
                  { label: 'Rotation', value: 'Tidally locked' },
                  { label: 'Age', value: '4.51 billion years' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-lg p-2">
                    <div className="text-gray-600">{s.label}</div>
                    <div className="text-white font-mono">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'rocks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROCK_TYPES.map(rock => (
            <div key={rock.name} className="bg-white/5 rounded-xl p-5 border border-white/10 flex gap-3">
              <span className="text-3xl flex-shrink-0">{rock.emoji}</span>
              <div>
                <div className="font-bold text-white mb-0.5">{rock.name}</div>
                {rock.pct > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 bg-white/10 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${rock.pct}%`, backgroundColor: rock.color }} />
                    </div>
                    <span className="text-xs text-gray-400">{rock.pct}% of surface</span>
                  </div>
                )}
                <p className="text-sm text-gray-300 leading-relaxed">{rock.desc}</p>
              </div>
            </div>
          ))}

          <div className="md:col-span-2 bg-indigo-900/20 rounded-xl p-4 border border-indigo-500/20">
            <div className="font-bold text-white mb-2">The Lunar Magma Ocean</div>
            <p className="text-sm text-gray-300 leading-relaxed">
              When the Moon formed ~4.51 billion years ago (likely from debris after a Mars-sized body collided with early Earth),
              it was covered in a global magma ocean thousands of kilometers deep. As it cooled, dense minerals sank and light
              anorthosite crystals floated up — forming the bright lunar highlands we see today. The dark mare filled in later,
              1-3 billion years ago, as radioactive elements in the interior generated enough heat to produce basaltic lava flows.
            </p>
          </div>
        </div>
      )}

      {view === 'missions' && (
        <div className="space-y-2">
          {MISSIONS_TIMELINE.map(m => (
            <div key={m.name} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="text-center flex-shrink-0 w-12">
                <div className="font-mono text-xs text-gray-400">{m.year}</div>
              </div>
              <div className="text-2xl flex-shrink-0">{m.country}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm">{m.name}</div>
                <div className="text-xs text-gray-500">{m.type}</div>
                <div className="text-xs text-gray-300 mt-0.5">{m.achievement}</div>
              </div>
              {m.type === 'Crewed' && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-300 border border-yellow-500/20 flex-shrink-0">👨‍🚀</span>}
              {m.type.includes('planned') && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-500/20 flex-shrink-0">planned</span>}
            </div>
          ))}
          <div className="mt-3 text-xs text-gray-500 text-center">
            {MISSIONS_TIMELINE.length} missions shown. Total lunar missions to date: 110+
          </div>
        </div>
      )}
    </div>
  )
}
