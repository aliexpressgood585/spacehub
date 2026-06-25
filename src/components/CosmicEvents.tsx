import { useState } from 'react'

interface CosmicEvent {
  id: string
  name: string
  emoji: string
  category: 'explosion' | 'collision' | 'formation' | 'death' | 'exotic'
  energyJoules: number
  energyLabel: string
  duration: string
  frequency: string
  distance: string
  discovered: string
  description: string
  mechanism: string
  observations: string[]
  records: string[]
}

const EVENTS: CosmicEvent[] = [
  {
    id: 'grb',
    name: 'Gamma-Ray Burst (GRB)',
    emoji: '⚡',
    category: 'explosion',
    energyJoules: 1e47,
    energyLabel: '10⁴⁷ J (in seconds!)',
    duration: 'Milliseconds to hours',
    frequency: '~1 per day (detected)',
    distance: 'Billions of light-years',
    discovered: '1967 (Vela satellites)',
    description: 'The most energetic explosions in the universe since the Big Bang. A GRB releases more energy in seconds than the Sun will emit in its entire 10-billion-year lifetime.',
    mechanism: 'Two types: Short GRBs (< 2 sec) from neutron star mergers; Long GRBs (> 2 sec) from collapsars — massive stars collapsing directly to black holes. A relativistic jet pierces through the collapsing star at near light speed.',
    observations: [
      'GRB 221009A (2022) — "BOAT" (Brightest Of All Time): brightest event ever recorded',
      'GRB 970508: First optical afterglow detected; confirmed cosmological origin',
      'GRB 090423: Farthest observed at z=8.2 (13.1 billion light-years away)',
      'GRB 170817A: First GRB linked to gravitational wave event (neutron star merger)',
    ],
    records: ['Most energetic events since Big Bang', 'GRB jets travel at 99.999% speed of light', 'Single GRB can outshine all stars in observable universe combined'],
  },
  {
    id: 'supernova',
    name: 'Supernova',
    emoji: '💥',
    category: 'explosion',
    energyJoules: 1e44,
    energyLabel: '10⁴⁴ J (99% as neutrinos)',
    duration: 'Weeks to months',
    frequency: '~1 per century per galaxy',
    distance: 'Throughout the universe',
    discovered: '1054 AD (SN 1054 = Crab Nebula)',
    description: 'The explosive death of a massive star or a white dwarf exceeding the Chandrasekhar limit. For weeks it can outshine an entire galaxy of 200 billion stars.',
    mechanism: 'Type II: Iron core collapse when a massive star runs out of nuclear fuel. The core collapses in 0.25 seconds, bounces, and the shockwave ejects the outer layers. Type Ia: White dwarf accretes mass until it exceeds 1.4 solar masses and undergoes thermonuclear runaway.',
    observations: [
      'SN 1987A: Only supernova visible to naked eye in modern era (in Large Magellanic Cloud)',
      'SN 1054: Created Crab Nebula; Chinese & Arab astronomers recorded it in daylight',
      'SN Refsdal (2015): First multiply-imaged supernova (gravitational lensing)',
      'Cassiopeia A: Most well-studied supernova remnant (exploded ~1680 CE)',
    ],
    records: ['Type Ia used to discover dark energy (1998 Nobel Prize)', 'Creates elements heavier than iron', 'Shock wave triggers new star formation in nearby gas clouds'],
  },
  {
    id: 'hypernova',
    name: 'Hypernova / Collapsar',
    emoji: '🌋',
    category: 'explosion',
    energyJoules: 1e46,
    energyLabel: '10⁴⁶ J',
    duration: 'Seconds to minutes',
    frequency: 'Rare — <1% of supernovae',
    distance: 'Cosmological distances',
    discovered: '1998 (SN 1998bw linked to GRB)',
    description: 'An ultra-energetic explosion 100× more powerful than an ordinary supernova, associated with the collapse of a rapidly-spinning very massive star directly to a black hole.',
    mechanism: 'A Wolf-Rayet star (>20 solar masses) with rapid rotation collapses. Angular momentum prevents symmetric collapse, forming an accretion disk around the nascent black hole that launches the GRB jet.',
    observations: [
      'SN 1998bw: First hypernova confirmed, associated with GRB 980425',
      'SN 2006gy: Most luminous supernova at time (150× ordinary supernova)',
      'iPTF14hls: Mysteriously had 5 peaks over 2 years — mechanism unknown',
    ],
    records: ['Gateway between supernova and GRB', 'Direct progenitor of stellar-mass black holes', 'Synthesizes largest quantities of heavy r-process elements'],
  },
  {
    id: 'neutron_merger',
    name: 'Neutron Star Merger (Kilonova)',
    emoji: '💫',
    category: 'collision',
    energyJoules: 1e45,
    energyLabel: '10⁴⁵ J',
    duration: 'Days to weeks',
    frequency: 'Rare (billions of years between events per galaxy)',
    distance: 'Throughout observable universe',
    discovered: '2017 (GW170817 + AT2017gfo)',
    description: 'Two neutron stars in a binary system spiral together over millions of years, then collide in a cataclysmic event that produces gold, platinum, and other heavy elements through rapid neutron capture.',
    mechanism: 'Gravitational wave emission causes inspiral. Final merger releases ~3% of mass as gravitational wave energy in < 1 second. The collision creates a hyper-massive neutron star or black hole surrounded by a hot accretion disk.',
    observations: [
      'GW170817 (2017): First simultaneous gravitational wave + electromagnetic observation',
      'AT2017gfo: Kilonova optical counterpart; produced ~3–5 Earth masses of gold',
      'Confirmed gold and platinum formation via r-process nucleosynthesis',
    ],
    records: ['Multi-messenger astronomy milestone', '~50% of elements heavier than iron formed this way', 'Kilonova outshines ~1000 ordinary novae'],
  },
  {
    id: 'quasar',
    name: 'Quasar (Active Galactic Nucleus)',
    emoji: '🔆',
    category: 'exotic',
    energyJoules: 1e40,
    energyLabel: '10⁴⁰ J/s (continuous!)',
    duration: 'Millions to billions of years',
    frequency: 'Billions in the early universe',
    distance: 'Mostly at z > 1 (early universe)',
    discovered: '1963 (3C 273, Maarten Schmidt)',
    description: 'The most luminous sustained energy sources in the universe — supermassive black holes actively devouring matter. A single quasar can outshine 100 trillion stars.',
    mechanism: 'A supermassive black hole (10⁶–10¹⁰ solar masses) accretes matter from a surrounding disk. Friction and magnetic fields heat the disk to billions of degrees, releasing copious X-rays, UV, and visible light. Bipolar jets can extend millions of light-years.',
    observations: [
      '3C 273: First quasar identified; visible through 10-inch telescope',
      'J0529-4351 (2024): Most luminous quasar — 500 trillion times brighter than the Sun',
      'TON 618: Most massive quasar black hole known: 66 billion solar masses',
      'Most quasars seen at z=2–3 (10+ billion years ago — "cosmic noon")',
    ],
    records: ['Most luminous sustained objects in universe', 'Quasar jets are the longest known structures', 'Powered by same physics as stellar black holes but 10⁶× larger'],
  },
  {
    id: 'magnetar_flare',
    name: 'Magnetar Giant Flare',
    emoji: '🧲',
    category: 'exotic',
    energyJoules: 1e39,
    energyLabel: '10³⁹ J (milliseconds)',
    duration: 'Milliseconds to minutes',
    frequency: '~1 per decade (observed)',
    distance: 'Within and nearby galaxies',
    discovered: '1979 (March 5 event from SGR 0526-66)',
    description: 'A neutron star with the strongest magnetic field in the universe releases a burst of energy equivalent to the Sun\'s 100,000-year output in 0.2 seconds.',
    mechanism: 'Magnetars have fields of 10¹⁵ Gauss (10¹¹× Earth\'s field). Starquakes — sudden crust fractures triggered by magnetic stress — release catastrophic energy. The surface moves by only millimeters but releases enormous energy due to extreme field strength.',
    observations: [
      'SGR 1806-20 (2004): Largest giant flare ever; briefly outshone full Moon in gamma rays',
      'SGR 0526-66 (1979): First detected giant flare; from LMC satellite galaxy',
      'SGR 1935+2154 (2020): First magnetar associated with fast radio burst',
    ],
    records: ['Strongest magnetic fields in the universe', 'Surface gravity 200 billion times Earth\'s', 'One teaspoon of matter weighs ~1 billion tons'],
  },
  {
    id: 'fast_radio_burst',
    name: 'Fast Radio Burst (FRB)',
    emoji: '📡',
    category: 'exotic',
    energyJoules: 1e32,
    energyLabel: '10³² J (milliseconds)',
    duration: 'Milliseconds',
    frequency: '~1000 per day (estimated)',
    distance: 'Cosmological (mostly)',
    discovered: '2007 (Lorimer Burst, archival data)',
    description: 'A millisecond flash of radio waves from cosmological distances, releasing as much energy as the Sun emits in 3 days. Some repeat; most don\'t. Origin mostly unknown.',
    mechanism: 'Likely multiple origins. Confirmed source: magnetar flares. Also proposed: binary star interactions, cosmic string cusps, alien technosignatures (disfavored). Magnetar SGR 1935+2154 produced a FRB-like event in our own galaxy.',
    observations: [
      'FRB 121102: First known repeater, localized to dwarf galaxy at z=0.19',
      'FRB 20220912A: Record-breaking signal detected by FAST telescope',
      'CHIME telescope detects ~1000 FRBs/year',
      '~500 FRBs published as of 2024; patterns suggest many different sources',
    ],
    records: ['Fastest transient events', 'Probe intergalactic medium\'s electron density', 'Some may be used as cosmological distance rulers'],
  },
]

const CATEGORIES = {
  explosion: { label: 'Explosions', color: 'text-red-400', bg: 'bg-red-900/30' },
  collision: { label: 'Collisions', color: 'text-orange-400', bg: 'bg-orange-900/30' },
  formation: { label: 'Formation', color: 'text-green-400', bg: 'bg-green-900/30' },
  death: { label: 'Stellar Deaths', color: 'text-purple-400', bg: 'bg-purple-900/30' },
  exotic: { label: 'Exotic', color: 'text-cyan-400', bg: 'bg-cyan-900/30' },
}

function EnergyBar({ event, allEvents }: { event: CosmicEvent; allEvents: CosmicEvent[] }) {
  const maxLog = Math.log10(Math.max(...allEvents.map(e => e.energyJoules)))
  const minLog = Math.log10(Math.min(...allEvents.map(e => e.energyJoules)))
  const pct = ((Math.log10(event.energyJoules) - minLog) / (maxLog - minLog)) * 100
  return (
    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full bg-gradient-to-r from-yellow-600 to-red-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function CosmicEvents() {
  const [selected, setSelected] = useState<CosmicEvent>(EVENTS[0])
  const [filterCat, setFilterCat] = useState<string>('all')

  const filtered = filterCat === 'all' ? EVENTS : EVENTS.filter(e => e.category === filterCat)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Extreme Cosmic Events</h2>
      <p className="text-slate-400 text-sm mb-5">The most violent, energetic, and mysterious events in the known universe</p>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterCat('all')}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${filterCat === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >
          All Events
        </button>
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            onClick={() => setFilterCat(key)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${filterCat === key ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Event list */}
        <div className="space-y-2">
          {filtered.map(ev => (
            <button
              key={ev.id}
              onClick={() => setSelected(ev)}
              className={`w-full text-left p-3 rounded-xl transition-all ${
                selected.id === ev.id ? 'bg-slate-700 ring-1 ring-indigo-500' : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{ev.emoji}</span>
                <span className="text-white font-semibold text-sm">{ev.name}</span>
              </div>
              <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${CATEGORIES[ev.category].bg} ${CATEGORIES[ev.category].color}`}>
                {CATEGORIES[ev.category].label}
              </div>
              <div className="mt-2">
                <EnergyBar event={ev} allEvents={EVENTS} />
                <div className="text-slate-500 text-xs mt-1">{ev.energyLabel}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 bg-slate-900 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-4xl">{selected.emoji}</span>
            <div>
              <h3 className="text-white font-bold text-xl">{selected.name}</h3>
              <div className={`text-xs px-2 py-0.5 rounded-full inline-block mt-1 ${CATEGORIES[selected.category].bg} ${CATEGORIES[selected.category].color}`}>
                {CATEGORIES[selected.category].label}
              </div>
            </div>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed mb-4">{selected.description}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Energy', value: selected.energyLabel },
              { label: 'Duration', value: selected.duration },
              { label: 'Frequency', value: selected.frequency },
              { label: 'Typical distance', value: selected.distance },
              { label: 'Discovered', value: selected.discovered },
            ].map((stat, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-2">
                <div className="text-slate-500 text-xs">{stat.label}</div>
                <div className="text-white text-xs font-medium mt-0.5">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <div className="text-slate-400 text-xs mb-2 font-semibold">MECHANISM</div>
            <p className="text-slate-300 text-sm leading-relaxed">{selected.mechanism}</p>
          </div>

          <div className="mb-4">
            <div className="text-slate-400 text-xs mb-2 font-semibold">KEY OBSERVATIONS</div>
            <div className="space-y-1">
              {selected.observations.map((obs, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-indigo-400 text-xs mt-0.5">▸</span>
                  <span className="text-slate-300 text-xs">{obs}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-slate-400 text-xs mb-2 font-semibold">RECORDS & SUPERLATIVES</div>
            <div className="flex flex-wrap gap-2">
              {selected.records.map((r, i) => (
                <span key={i} className="bg-yellow-900/30 text-yellow-300 text-xs px-2 py-1 rounded-lg">
                  🏆 {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Energy scale */}
      <div className="mt-6">
        <div className="text-slate-400 text-xs mb-3">Relative Energy Scale (logarithmic)</div>
        <div className="space-y-1.5">
          {[...EVENTS].sort((a, b) => b.energyJoules - a.energyJoules).map(ev => (
            <div key={ev.id} className="flex items-center gap-3">
              <span className="text-xs w-8 text-center">{ev.emoji}</span>
              <div className="flex-1">
                <EnergyBar event={ev} allEvents={EVENTS} />
              </div>
              <span className="text-slate-400 text-xs w-28 text-right">{ev.energyLabel}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
