import { useState } from 'react'

interface Megastructure {
  id: string
  name: string
  icon: string
  color: string
  type: 'energy' | 'habitat' | 'propulsion' | 'communication' | 'defense'
  scale: string
  energy: string
  feasibility: 'theoretical' | 'far_future' | 'speculative' | 'impossible'
  kardashev: 'I' | 'II' | 'III' | 'beyond'
  description: string
  howItWorks: string
  challenges: string[]
  candidates: string
  funFact: string
}

const STRUCTURES: Megastructure[] = [
  {
    id: 'dyson_sphere',
    name: 'Dyson Sphere',
    icon: '☀️',
    color: '#fbbf24',
    type: 'energy',
    scale: '~300 million km diameter',
    energy: '3.8 × 10²⁶ watts (100% solar output)',
    feasibility: 'far_future',
    kardashev: 'II',
    description: 'A megastructure completely surrounding a star, capturing its entire energy output. Proposed by physicist Freeman Dyson in 1960 as a logical endpoint of advanced civilizations\' energy needs.',
    howItWorks: 'A shell or swarm of structures at ~1 AU from the star, capturing all radiation. Could power a civilization millions of times more advanced than ours. More likely to be a "Dyson Swarm" — millions of solar collectors — than a rigid sphere (which would be structurally impossible).',
    challenges: ['No known material strong enough to build a rigid sphere', 'Would take all the mass of a planet (or several) to construct', 'Waste heat would make it visible as an infrared excess', 'Takes thousands of years to build even with advanced tech'],
    candidates: 'KIC 8462852 ("Tabby\'s Star") showed bizarre irregular dimming — briefly considered a Dyson Sphere candidate. Now thought to be dust clouds. Some researchers monitor red dwarf stars for unusual infrared signatures.',
    funFact: 'Astronomers actually search for Dyson Spheres using NASA infrared data — a completed sphere would be invisible in visible light but bright in infrared from waste heat. So far: nothing definitive. But we\'ve only checked a tiny fraction of the galaxy.'
  },
  {
    id: 'ringworld',
    name: 'Ringworld',
    icon: '🔵',
    color: '#3b82f6',
    type: 'habitat',
    scale: '~300 million km radius ring',
    energy: 'Powered by its central star',
    feasibility: 'theoretical',
    kardashev: 'II',
    description: 'A massive ring-shaped artificial habitat orbiting a star at ~1 AU. Popularized by Larry Niven\'s 1970 novel "Ringworld." The ring spins to produce artificial gravity via centrifugal force.',
    howItWorks: 'Ring width: ~1.5 million km. Rotates at 1,250 km/s to simulate 1g on inner surface. Inner surface has ~3 million times Earth\'s habitable area. Walls on the edges hold in atmosphere. Sun at center provides light and heat.',
    challenges: ['Rotation speed requires materials 100× stronger than any known substance', 'Unstable — would drift off-center toward the star without active correction', 'Mass required: ~10× Jupiter (need to dismantle 10 gas giants)', 'Building time: thousands of years minimum'],
    candidates: 'NASA\'s "O\'Neill Cylinder" is a smaller, feasible version: 8 km diameter rotating space station for 10,000+ people. Could build one within 100 years with current technology. ESA has studied it seriously.',
    funFact: 'Astronomers have actually found evidence of possible ring-shaped megastructures around some distant stars — but more likely to be natural formations. The star KIC 8462852 shows unexplained dimming that still puzzles scientists.'
  },
  {
    id: 'stellar_engine',
    name: 'Caplan Thruster',
    icon: '🚀',
    color: '#ef4444',
    type: 'propulsion',
    scale: 'Encompasses entire solar system',
    energy: 'Partial stellar output (~10²⁵ watts)',
    feasibility: 'far_future',
    kardashev: 'II',
    description: 'A device that uses the Sun\'s own energy and stellar wind to generate thrust — effectively turning our entire solar system into a spacecraft. Proposed by astrophysicist Matthew Caplan in 2019.',
    howItWorks: 'Use a solar-powered particle accelerator to fire oxygen-ion beams at the Sun, triggering enhanced fusion. This creates a stellar jet of helium that pushes the Sun (and all its planets) in one direction. Speed: ~50 light-years per billion years.',
    challenges: ['Would require mining outer planets for oxygen fuel', 'Solar jet must be precisely aimed (off-center thrust would torque the sun)', 'Planets might destabilize over millions of years of acceleration', 'Requires technology we don\'t have yet — but physics allows it'],
    candidates: 'No confirmed stellar engines observed, but several asymmetrically-moving stars have been noted. "Runaway stars" — stars moving at unusual speeds — might naturally have similar dynamics.',
    funFact: 'A Caplan Thruster could move our entire solar system to avoid the Milky Way-Andromeda collision in 4.5 billion years. Or to escape a nearby supernova. It\'s not science fiction — it obeys all known physics, and Caplan published it in a peer-reviewed journal.'
  },
  {
    id: 'matrioshka_brain',
    name: 'Matrioshka Brain',
    icon: '🧠',
    color: '#a855f7',
    type: 'communication',
    scale: 'Earth-to-Jupiter orbit diameter',
    energy: 'Complete stellar output',
    feasibility: 'speculative',
    kardashev: 'II',
    description: 'A nested series of Dyson Spheres, each computing at optimal temperature using waste heat from the sphere inside. The ultimate computing device — using an entire star\'s output for pure computation.',
    howItWorks: 'Innermost shell operates at ~300K (computing). Outer shells capture and use waste heat at successively lower temperatures. Total computation: an almost incomprehensible 10⁴²-10⁴⁷ operations per second — enough to simulate trillions of full human civilizations simultaneously.',
    challenges: ['Requires multiple Dyson Spheres (each itself extraordinarily difficult)', 'Waste heat must be perfectly managed between layers', 'Requires all the mass of a solar system', 'Would take millions of years to construct even with advanced robotics'],
    candidates: 'Isaac Arthur (YouTube/SFIA) has extensively analyzed Matrioshka Brains as likely endpoints of advanced AI civilizations. Some SETI researchers think we should look for their waste heat signature rather than radio signals.',
    funFact: 'A Matrioshka Brain running human-equivalent simulations could run more conscious lives per second than there are atoms in the observable universe. If we ever build one, the question "what is real?" becomes critically important.'
  },
  {
    id: 'cosmic_web',
    name: 'Galactic Transport Network',
    icon: '🕸️',
    color: '#06b6d4',
    type: 'communication',
    scale: 'Galaxy-wide (100,000+ light-years)',
    energy: 'Multiple stellar sources',
    feasibility: 'speculative',
    kardashev: 'III',
    description: 'A network of wormholes, relay stations, or near-lightspeed communication lines spanning an entire galaxy — the ultimate infrastructure project of a Type III Kardashev civilization.',
    howItWorks: 'Could use natural or artificial wormholes for instant transport. Or laser communication highways between star systems. Or "Alcubierre drives" — theoretical warp drives using exotic matter with negative energy density (not clearly impossible — but barely possible).',
    challenges: ['Wormholes require exotic matter that may not exist', 'Alcubierre drive requires more energy than contained in Jupiter', 'Light-speed communications take 100,000 years across the galaxy', 'A true galactic empire is thermodynamically very difficult to maintain'],
    candidates: 'SETI researchers look for "galactic internet" signals — laser communications between stars that we might accidentally detect. The "Wow! Signal" (1977) was 72 seconds of an intense narrowband signal from space. Never repeated. Still unexplained.',
    funFact: 'If a Type III civilization exists in our galaxy, they could have built a galactic internet in the time since the first multicellular life on Earth. We should be surrounded by their infrastructure — and either we\'re alone, or we\'re just not looking correctly.'
  },
  {
    id: 'nicoll_dyson',
    name: 'Nicoll-Dyson Beam',
    icon: '⚡',
    color: '#f97316',
    type: 'defense',
    scale: 'Solar system → interstellar',
    energy: '10% stellar output (3.8 × 10²⁵ watts)',
    feasibility: 'far_future',
    kardashev: 'II',
    description: 'A partial Dyson Sphere used to focus stellar energy into an extreme laser beam — capable of sterilizing a planet light-years away, or propelling spacecraft to near-lightspeed.',
    howItWorks: 'Partial Dyson Swarm focuses ~10% of solar output into a coherent beam. Pointed at a target star system: destroys planetary atmospheres in seconds from light-years away. Pointed at a light sail: propels probes to 20-30% lightspeed. Completely feasible physics.',
    challenges: ['Building the Dyson Swarm itself is the main challenge', 'Weapon capable of killing civilizations from light-years away — extreme governance needed', 'Laser diffraction limits effective range to nearby star systems', 'Target civilization might retaliate with their own beam'],
    candidates: 'The Breakthrough Starshot project (funded by Yuri Milner, supported by Stephen Hawking) is a real proposal to use a ground-based laser to push a gram-scale probe to Alpha Centauri at 20% light speed. First step toward a Nicoll-Dyson Beam.',
    funFact: 'If the Sun were a Nicoll-Dyson Beam pointed at Earth, it could deposit enough energy to boil the oceans in seconds — from Alpha Centauri distance. This is the "Fermi Paradox Dark Forest" concern: advanced civilizations stay quiet because announcing yourself risks being targeted.'
  },
]

const FEASIBILITY_CONFIG = {
  theoretical:  { label: '🟢 Theoretically Possible', color: '#22c55e' },
  far_future:   { label: '🟡 Far Future Technology', color: '#fbbf24' },
  speculative:  { label: '🟠 Highly Speculative', color: '#f97316' },
  impossible:   { label: '🔴 May Be Impossible', color: '#ef4444' },
}

const KARDASHEV_CONFIG = {
  'I':      { label: 'Kardashev Type I', desc: 'Planetary energy', color: '#22c55e' },
  'II':     { label: 'Kardashev Type II', desc: 'Stellar energy', color: '#fbbf24' },
  'III':    { label: 'Kardashev Type III', desc: 'Galactic energy', color: '#a855f7' },
  'beyond': { label: 'Beyond Kardashev', desc: 'Cosmic scale', color: '#ec4899' },
}

const TYPE_LABELS = {
  energy: '⚡ Energy',
  habitat: '🏠 Habitat',
  propulsion: '🚀 Propulsion',
  communication: '📡 Communication',
  defense: '🛡️ Defense',
}

export default function SpaceMegastructures() {
  const [selected, setSelected] = useState<Megastructure>(STRUCTURES[0])

  const feas = FEASIBILITY_CONFIG[selected.feasibility]
  const kard = KARDASHEV_CONFIG[selected.kardashev]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Megastructures</h2>
      <p className="text-gray-400 text-sm mb-5">The theoretical engineering projects of advanced civilizations — all permitted by known physics.</p>

      {/* Kardashev scale */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Kardashev Scale — Civilization Energy Levels</div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(KARDASHEV_CONFIG) as [Megastructure['kardashev'], typeof KARDASHEV_CONFIG[keyof typeof KARDASHEV_CONFIG]][]).filter(([k]) => k !== 'beyond').map(([k, cfg]) => (
            <div key={k} className="rounded-lg p-2 text-center" style={{ background: cfg.color + '12', border: `1px solid ${cfg.color}25` }}>
              <div className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</div>
              <div className="text-[10px] text-gray-500">{cfg.desc}</div>
              <div className="text-[9px] text-gray-600 mt-0.5">{STRUCTURES.filter(s => s.kardashev === k).map(s => s.icon).join(' ')}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-gray-600 mt-2">Earth (2024) = 0.73 on the Kardashev Scale — not even Type I yet.</div>
      </div>

      {/* Structure selector */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
        {STRUCTURES.map(s => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className="p-2 rounded-xl text-center transition-all"
            style={{
              background: selected.id === s.id ? s.color + '22' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.id === s.id ? s.color + '60' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-2xl mb-0.5">{s.icon}</div>
            <div className="text-[9px] font-bold leading-tight" style={{ color: selected.id === s.id ? s.color : '#6b7280' }}>{s.name.split(' ')[0]}</div>
          </button>
        ))}
      </div>

      {/* Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl p-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{selected.icon}</span>
            <div>
              <h3 className="text-xl font-bold text-white">{selected.name}</h3>
              <div className="flex gap-2 flex-wrap mt-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: feas.color, background: feas.color + '18' }}>{feas.label}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: kard.color, background: kard.color + '18' }}>{kard.label}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{TYPE_LABELS[selected.type]}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div className="bg-gray-900/60 rounded-lg p-2">
              <div className="text-gray-500">Scale</div>
              <div className="text-white font-semibold">{selected.scale}</div>
            </div>
            <div className="bg-gray-900/60 rounded-lg p-2">
              <div className="text-gray-500">Energy</div>
              <div style={{ color: selected.color }} className="font-semibold">{selected.energy}</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{selected.description}</p>
          <div className="rounded-lg p-3 bg-gray-900/50">
            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">⚙️ How It Works</div>
            <p className="text-gray-300 text-sm">{selected.howItWorks}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">⚠️ Engineering Challenges</div>
            <ul className="space-y-1.5">
              {selected.challenges.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>{c}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🔭 Real-World Candidates / Efforts</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.candidates}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Bender</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
