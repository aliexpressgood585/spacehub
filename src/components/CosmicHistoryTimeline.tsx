import { useState } from 'react'

interface CosmicEvent {
  id: string
  time: string
  timeAgo: string
  era: Era
  icon: string
  color: string
  title: string
  description: string
  significance: string
  scale: 'universe' | 'galaxy' | 'solar' | 'earth' | 'life' | 'human'
  mindBlow: string
}

type Era = 'planck' | 'quark' | 'stellar' | 'galactic' | 'solar' | 'life' | 'human'

const ERA_DEFS: { id: Era; label: string; color: string; icon: string }[] = [
  { id: 'planck',  label: 'Big Bang Era',     color: '#fbbf24', icon: '💥' },
  { id: 'quark',   label: 'Particle Era',     color: '#f97316', icon: '⚛️' },
  { id: 'stellar', label: 'First Stars',      color: '#a855f7', icon: '⭐' },
  { id: 'galactic',label: 'Galaxy Formation', color: '#6366f1', icon: '🌌' },
  { id: 'solar',   label: 'Solar System',     color: '#fbbf24', icon: '☀️' },
  { id: 'life',    label: 'Life on Earth',    color: '#22c55e', icon: '🧬' },
  { id: 'human',   label: 'Human Era',        color: '#3b82f6', icon: '🧍' },
]

const EVENTS: CosmicEvent[] = [
  {
    id: 'bigbang',
    time: 'T+0',
    timeAgo: '13.8 billion years ago',
    era: 'planck',
    icon: '💥',
    color: '#fbbf24',
    title: 'The Big Bang',
    description: 'All matter, energy, space, and time begins in a singularity smaller than an atom. Temperature: 10³² Kelvin. The universe expands faster than light.',
    significance: 'The beginning of everything — not just matter, but space itself.',
    scale: 'universe',
    mindBlow: 'There was no "before" the Big Bang — time itself began at this moment. Asking what happened before is like asking what is north of the North Pole.'
  },
  {
    id: 'inflation',
    time: 'T+10⁻³²s',
    timeAgo: '13.8 billion years ago',
    era: 'planck',
    icon: '📈',
    color: '#f97316',
    title: 'Cosmic Inflation',
    description: 'The universe expands by a factor of 10²⁶ in a fraction of a second. A region smaller than a proton becomes larger than the observable universe today.',
    significance: 'Inflation explains why the universe looks the same in every direction and is nearly flat.',
    scale: 'universe',
    mindBlow: 'During inflation, space expanded faster than light — this doesn\'t violate Einstein\'s laws because space itself was expanding, not matter moving through it.'
  },
  {
    id: 'quarks',
    time: 'T+1 microsecond',
    timeAgo: '13.8 billion years ago',
    era: 'quark',
    icon: '⚛️',
    color: '#ef4444',
    title: 'Quarks Form Protons',
    description: 'Temperature cools enough for quarks to bind into protons and neutrons. The universe is a hot plasma of elementary particles.',
    significance: 'The building blocks of all matter — hydrogen, helium — form in the first minutes.',
    scale: 'universe',
    mindBlow: 'In the first 3 minutes, the universe forged all the hydrogen and most of the helium that exists today. Every atom in your body\'s hydrogen was made here.'
  },
  {
    id: 'cmb',
    time: 'T+380,000 years',
    timeAgo: '13.8 billion years ago',
    era: 'quark',
    icon: '🌡️',
    color: '#fbbf24',
    title: 'Universe Becomes Transparent',
    description: 'Temperature drops to 3,000K. Electrons and protons combine into neutral hydrogen atoms. Light can finally travel freely — the universe goes from opaque plasma to transparent gas.',
    significance: 'This ancient light, now cooled to 2.7K, is the Cosmic Microwave Background — detectable today as a faint hiss in every direction.',
    scale: 'universe',
    mindBlow: 'Your microwave detects CMB radiation. About 1% of old TV static was the afterglow of the Big Bang.'
  },
  {
    id: 'first_stars',
    time: 'T+200 million years',
    timeAgo: '13.6 billion years ago',
    era: 'stellar',
    icon: '⭐',
    color: '#a855f7',
    title: 'First Stars Ignite',
    description: 'Gravity collapses hydrogen clouds into the first stars — massive, hot, short-lived giants 100-300× the mass of the Sun. They forge the first heavy elements.',
    significance: 'Before these stars, the universe contained only hydrogen, helium, and traces of lithium. Everything else — carbon, oxygen, iron — was made in stellar furnaces.',
    scale: 'universe',
    mindBlow: 'You are made of stardust — literally. Every atom in your body heavier than hydrogen was forged inside a star that exploded billions of years ago.'
  },
  {
    id: 'first_galaxies',
    time: 'T+500 million years',
    timeAgo: '13.3 billion years ago',
    era: 'galactic',
    icon: '🌌',
    color: '#6366f1',
    title: 'First Galaxies Form',
    description: 'Gravity pulls stars and gas into the first proto-galaxies. These early galaxies are smaller, irregular, and actively merging with each other.',
    significance: 'The James Webb Space Telescope is imaging galaxies from this era — rewriting our understanding of early galaxy formation.',
    scale: 'galaxy',
    mindBlow: 'JWST found a galaxy called JADES-GS-z14-0 that existed just 290 million years after the Big Bang — older than expected, challenging models of galaxy formation.'
  },
  {
    id: 'milkyway',
    time: 'T+1 billion years',
    timeAgo: '12.8 billion years ago',
    era: 'galactic',
    icon: '🌀',
    color: '#3b82f6',
    title: 'Milky Way Begins Forming',
    description: 'Our galaxy starts as small clumps of stars that gradually merge. Over billions of years, it builds up through collisions and accretion into the spiral galaxy we inhabit.',
    significance: 'The Milky Way has cannibalized dozens of smaller galaxies to reach its current size.',
    scale: 'galaxy',
    mindBlow: 'The Milky Way is still actively merging — the Sagittarius Dwarf Galaxy is currently being torn apart and absorbed by our galaxy right now.'
  },
  {
    id: 'sun_forms',
    time: 'T+9.2 billion years',
    timeAgo: '4.6 billion years ago',
    era: 'solar',
    icon: '☀️',
    color: '#fbbf24',
    title: 'The Sun is Born',
    description: 'A cloud of gas and dust — enriched by previous generations of stellar explosions — collapses under gravity. The Sun ignites nuclear fusion in its core.',
    significance: 'Our Sun is a third-generation star — built from the ashes of at least two previous stellar generations.',
    scale: 'solar',
    mindBlow: 'The Sun contains material from stars that lived and died before our solar system existed. We are the cosmic inheritors of dead stars.'
  },
  {
    id: 'earth_forms',
    time: 'T+9.2 billion years + 100M',
    timeAgo: '4.5 billion years ago',
    era: 'solar',
    icon: '🌍',
    color: '#22c55e',
    title: 'Earth Forms',
    description: 'Dust and rocks left over from the Sun\'s formation collide and accrete into a molten proto-Earth. A Mars-sized body (Theia) smashes into Earth — the debris forms the Moon.',
    significance: 'The Moon-forming impact may be why Earth has plate tectonics, a magnetic field, and a tilted axis — all crucial for life.',
    scale: 'earth',
    mindBlow: 'Without the Moon, Earth\'s axial tilt would be chaotic, seasons would be extreme and unpredictable, and complex life may never have emerged.'
  },
  {
    id: 'life',
    time: 'T+9.6 billion years',
    timeAgo: '4.2 billion years ago',
    era: 'life',
    icon: '🦠',
    color: '#22c55e',
    title: 'First Life Emerges',
    description: 'The first self-replicating molecules appear — likely near deep-sea hydrothermal vents. Life begins almost as soon as Earth cools enough to have liquid water.',
    significance: 'Life arose so quickly after Earth formed that it may be inevitable wherever liquid water and chemistry exist.',
    scale: 'life',
    mindBlow: 'The first 4 billion years of life on Earth were entirely microbial. Bacteria rule the planet for longer than all complex life has existed — combined.'
  },
  {
    id: 'oxygen',
    time: 'T+11.3 billion years',
    timeAgo: '2.5 billion years ago',
    era: 'life',
    icon: '💨',
    color: '#06b6d4',
    title: 'Great Oxidation Event',
    description: 'Cyanobacteria evolve photosynthesis and flood the atmosphere with oxygen. Most existing life — which had evolved without oxygen — goes extinct. The biggest mass extinction ever.',
    significance: 'The oxygen we breathe is biological waste. The Great Oxidation Event was the deadliest extinction in Earth\'s history.',
    scale: 'earth',
    mindBlow: 'Oxygen was originally a toxic pollutant that killed most life on Earth. We evolved to breathe it only because our ancestors survived the catastrophe.'
  },
  {
    id: 'complex_life',
    time: 'T+13.2 billion years',
    timeAgo: '600 million years ago',
    era: 'life',
    icon: '🐟',
    color: '#3b82f6',
    title: 'Cambrian Explosion',
    description: 'Complex multicellular animals explode in diversity in just 20 million years. Eyes, shells, nervous systems, and predation all appear almost simultaneously.',
    significance: 'The blueprint for all animal body plans alive today appeared during the Cambrian period.',
    scale: 'life',
    mindBlow: '99.9% of all species that ever existed are now extinct. Life is not a tree that grows — it\'s an endless cycle of extinction and reinvention.'
  },
  {
    id: 'dinosaurs',
    time: 'T+13.57 billion years',
    timeAgo: '230 million years ago',
    era: 'life',
    icon: '🦕',
    color: '#84cc16',
    title: 'Age of Dinosaurs',
    description: 'Dinosaurs dominate Earth for 165 million years — far longer than mammals have existed. They were not the evolutionary dead-end popular culture suggests; birds are living dinosaurs.',
    significance: 'Dinosaurs occupied Earth for 75× longer than Homo sapiens has existed so far.',
    scale: 'life',
    mindBlow: 'T. rex is closer in time to us than to Brachiosaurus. More time separates the earliest dinosaurs from T. rex than separates T. rex from today.'
  },
  {
    id: 'extinction',
    time: 'T+13.734 billion years',
    timeAgo: '66 million years ago',
    era: 'life',
    icon: '☄️',
    color: '#ef4444',
    title: 'Asteroid Extinction',
    description: 'A 10 km asteroid strikes Yucatán. The impact triggers firestorms, acid rain, and a years-long nuclear winter. 75% of all species go extinct including non-avian dinosaurs.',
    significance: 'Without this extinction, mammals may never have diversified. Humans may never have evolved.',
    scale: 'earth',
    mindBlow: 'We exist because an asteroid hit Earth 66 million years ago. Catastrophe is the mother of evolution.'
  },
  {
    id: 'homo_sapiens',
    time: 'T+13.7998 billion years',
    timeAgo: '300,000 years ago',
    era: 'human',
    icon: '🧍',
    color: '#f97316',
    title: 'Homo Sapiens Evolves',
    description: 'Modern humans appear in Africa. Our species is defined by large brains, language, and symbolic thought — the ability to believe in things that don\'t exist yet.',
    significance: 'We are the only species that asks where it came from and what the universe is.',
    scale: 'human',
    mindBlow: 'If the history of the universe were compressed to one year, humans appear at 11:59:59.9 PM on December 31st. All of recorded history is the last fraction of a second.'
  },
  {
    id: 'space_age',
    time: 'T+13.8 billion years',
    timeAgo: '67 years ago',
    era: 'human',
    icon: '🚀',
    color: '#6366f1',
    title: 'Space Age Begins',
    description: 'Sputnik 1 launches in 1957. Within 12 years, humans walk on the Moon. In 67 years, we have put telescopes in orbit that see the first light of the universe.',
    significance: 'For the first time in 13.8 billion years, life from Earth leaves its home planet and looks back at the cosmos.',
    scale: 'human',
    mindBlow: 'We went from first flight (1903) to Moon landing (1969) in 66 years. The pace of our expansion into space is accelerating. Where will we be in another 66 years?'
  },
]

export default function CosmicHistoryTimeline() {
  const [selected, setSelected] = useState<CosmicEvent>(EVENTS[0])
  const [eraFilter, setEraFilter] = useState<Era | 'all'>('all')

  const filtered = eraFilter === 'all' ? EVENTS : EVENTS.filter(e => e.era === eraFilter)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic History Timeline</h2>
      <p className="text-gray-400 text-sm mb-5">13.8 billion years in one timeline — from the Big Bang to the first humans to look back at it</p>

      {/* Era filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setEraFilter('all')}
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{
            background: eraFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: eraFilter === 'all' ? 'white' : '#6b7280',
            border: `1px solid ${eraFilter === 'all' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >All Eras</button>
        {ERA_DEFS.map(era => (
          <button
            key={era.id}
            onClick={() => setEraFilter(era.id)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: eraFilter === era.id ? era.color + '25' : 'rgba(255,255,255,0.04)',
              color: eraFilter === era.id ? era.color : '#6b7280',
              border: `1px solid ${eraFilter === era.id ? era.color + '50' : 'rgba(255,255,255,0.06)'}`,
            }}
          >{era.icon} {era.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Timeline list */}
        <div className="relative">
          <div className="absolute left-3.5 top-3 bottom-3 w-0.5 bg-gray-700/60" />
          <div className="space-y-1">
            {filtered.map(event => (
              <button
                key={event.id}
                onClick={() => setSelected(event)}
                className="w-full text-left pl-9 pr-3 py-2.5 rounded-xl transition-all relative"
                style={{
                  background: selected.id === event.id ? event.color + '18' : 'transparent',
                  border: `1px solid ${selected.id === event.id ? event.color + '45' : 'transparent'}`,
                }}
              >
                <div className="absolute left-2 top-3 text-base">{event.icon}</div>
                <div className="font-mono text-[10px] mb-0.5" style={{ color: event.color }}>{event.timeAgo}</div>
                <div className="text-sm font-semibold leading-tight" style={{ color: selected.id === event.id ? event.color : '#e2e8f0' }}>
                  {event.title}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-4">
              <span className="text-5xl flex-shrink-0">{selected.icon}</span>
              <div>
                <div className="font-mono text-xs mb-1" style={{ color: selected.color }}>{selected.timeAgo}</div>
                <h3 className="text-xl font-bold text-white mb-1">{selected.title}</h3>
                <div className="text-xs px-2 py-0.5 rounded-full inline-block font-semibold mb-3"
                  style={{ background: ERA_DEFS.find(e => e.id === selected.era)?.color + '25', color: ERA_DEFS.find(e => e.id === selected.era)?.color }}>
                  {ERA_DEFS.find(e => e.id === selected.era)?.icon} {ERA_DEFS.find(e => e.id === selected.era)?.label}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{selected.description}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Why It Matters</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.significance}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Blowing Perspective</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.mindBlow}</p>
          </div>
        </div>
      </div>

      {/* Cosmic calendar footer */}
      <div className="mt-6 bg-gray-800/40 rounded-xl p-5 border border-gray-700/30">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">The Cosmic Calendar — If 13.8 Billion Years = 1 Year</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { icon: '💥', label: 'Big Bang', date: 'Jan 1, 00:00' },
            { icon: '⭐', label: 'First Stars', date: 'Jan 22' },
            { icon: '☀️', label: 'Sun Forms', date: 'Sep 2' },
            { icon: '🌍', label: 'Earth Forms', date: 'Sep 6' },
            { icon: '🦠', label: 'First Life', date: 'Sep 21' },
            { icon: '🐟', label: 'Cambrian Explosion', date: 'Dec 17' },
            { icon: '🦕', label: 'Dinosaurs', date: 'Dec 25' },
            { icon: '🧍', label: 'Homo Sapiens', date: 'Dec 31, 23:59:46' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900/50 rounded-lg p-2 text-center">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="font-bold text-white text-xs">{s.date}</div>
              <div className="text-gray-500 text-[10px]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
