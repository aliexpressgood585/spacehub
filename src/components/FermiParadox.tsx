import { useState } from 'react'

type Category = 'rare_earth' | 'filter' | 'they_exist' | 'dark_forest' | 'exotic'

interface Solution {
  id: string
  name: string
  category: Category
  icon: string
  color: string
  likelihood: 'high' | 'medium' | 'low' | 'unknown'
  shortDesc: string
  explanation: string
  evidence: string[]
  problems: string[]
  famousProponent: string
  scarinessLevel: number
  implication: string
}

const SOLUTIONS: Solution[] = [
  {
    id: 'rare_earth',
    name: 'Rare Earth Hypothesis',
    category: 'rare_earth',
    icon: '🌍',
    color: '#22c55e',
    likelihood: 'medium',
    shortDesc: 'Complex life is extraordinarily rare — Earth is uniquely lucky in countless ways that make it habitable',
    explanation: 'Proposed by Peter Ward and Joe Kirschvink (2000). Earth is exceptional: at the right distance from the Sun (not tidally locked), has a large Moon stabilizing our axial tilt, Jupiter deflects asteroids, on the outer edge of the Galactic Habitable Zone, has plate tectonics, right oxygen levels, liquid water, and a protective magnetic field. Any one of dozens of factors being slightly different would have prevented complex life.',
    evidence: [
      'Earth\'s Moon is uniquely large relative to its planet — stabilizes axial tilt within 2.4°, preventing ice age chaos',
      'Jupiter has deflected 85% of potential extinction-level asteroid strikes over 4 billion years',
      'Earth\'s location in the Galactic Habitable Zone — not too close to galactic center (radiation), not too far (low metallicity)',
      'Plate tectonics regulates carbon-silicate cycle, maintaining temperatures for billions of years',
      'The 542 Myr Cambrian Explosion that created complex life required a specific set of conditions',
    ],
    problems: [
      'TRAPPIST-1 system has 3 potentially habitable planets — suggests rocky planets in HZ are common',
      'Microbial life may be everywhere even if complex life is rare — making the paradox about intelligence specifically',
      'Selection bias: we wouldn\'t exist to wonder if conditions weren\'t perfect — doesn\'t explain the paradox',
    ],
    famousProponent: 'Peter Ward & Joe Kirschvink (paleontologists)',
    scarinessLevel: 2,
    implication: 'We are one of very few complex life forms in the galaxy. Humanity is precious — we may be alone or nearly alone. This is humbling but also gives us special responsibility.'
  },
  {
    id: 'great_filter_behind',
    name: 'The Great Filter (Behind Us)',
    category: 'filter',
    icon: '✅',
    color: '#3b82f6',
    likelihood: 'medium',
    shortDesc: 'Some incredibly difficult step in the development of life or intelligence happened behind us — we already passed through the worst',
    explanation: 'Robin Hanson (1998) proposed the Great Filter: a step so difficult that virtually no civilization passes through it. If the filter is behind us, we are genuinely rare. If it\'s ahead of us, we are all doomed. Candidates for a past filter: abiogenesis (life from chemistry), eukaryotic cells, sexual reproduction, multicellular life, or the evolution of intelligence.',
    evidence: [
      'Abiogenesis has only happened once on Earth in 4 billion years — possibly astronomically rare',
      'The jump from prokaryotes (bacteria) to eukaryotes (complex cells with nuclei) took 2 billion years — may be the filter',
      'Intelligence evolved once in Earth\'s history — might require too-specific conditions to repeat',
      'SETI has found no signals despite decades of searching — silence is consistent with a past filter',
    ],
    problems: [
      'We don\'t know if abiogenesis is easy or hard — we only have one data point (Earth)',
      'Intelligence has evolved convergently many times (dolphins, octopuses, corvids) — suggests it might not be the filter',
      'If the filter is sexual reproduction or multicellularity, why aren\'t we finding primitive complex life elsewhere?',
    ],
    famousProponent: 'Robin Hanson (economist/philosopher)',
    scarinessLevel: 1,
    implication: 'Best-case scenario: we\'re through the hardest part. Humanity should be able to spread across the galaxy and flourish. But it would mean we are genuinely rare or unique — profoundly lonely.'
  },
  {
    id: 'great_filter_ahead',
    name: 'The Great Filter (Ahead of Us)',
    category: 'filter',
    icon: '☠️',
    color: '#ef4444',
    likelihood: 'medium',
    shortDesc: 'Almost every civilization destroys itself before becoming interstellar — and we\'re next',
    explanation: 'If other filters are not sufficient to explain the silence — and if we find complex life elsewhere (fossils on Mars, extremophiles on Europa) — then the filter must be ahead of us. Every civilization reaches a technological level where it can create weapons of mass destruction, exhaust resources, or unleash uncontrolled AI, and virtually all destroy themselves. We may be on that path.',
    evidence: [
      'Nuclear weapons were developed within 80 years of flight — the "windows" of existential risk may be brief',
      'Climate change, AI safety risks, and bioweapons represent realistic civilizational threats now',
      'The absence of any radio signals despite billions of years of galaxy\'s history suggests no civilization survives long',
      'Enrico Fermi\'s original point: "If they existed, they would be here." The silence is deafening.',
    ],
    problems: [
      'Self-destruction is assumed universal, but we don\'t know if it\'s inevitable',
      'One surviving civilization in a billion would still colonize the galaxy — why no galactic empire visible?',
      'Selection bias: we can only observe civilizations that exist, not those that were destroyed',
    ],
    famousProponent: 'Nick Bostrom (philosopher, "existential risk" community)',
    scarinessLevel: 10,
    implication: 'The most terrifying interpretation. If we find microbial life on Mars, it\'s possibly the worst news in human history — it suggests the filter is ahead of us. Finding "Great Silence" itself may be the answer. Every news story about AI, climate, or nuclear weapons takes on cosmic significance.'
  },
  {
    id: 'zoo_hypothesis',
    name: 'Zoo Hypothesis',
    category: 'they_exist',
    icon: '🦁',
    color: '#a855f7',
    likelihood: 'low',
    shortDesc: 'Advanced civilizations deliberately avoid contact with us, letting us develop naturally — we\'re in a cosmic wildlife preserve',
    explanation: 'First proposed by John Ball (1973). Advanced civilizations know we exist but have agreed (through a "Galactic Club" or "Interdict Directive") not to interfere with our development. Just as zookeepers don\'t let animals out of exhibits, they don\'t reveal themselves. Once we reach sufficient technological maturity, they may make contact — or we may need to "graduate" first.',
    evidence: [
      'No advanced civilization we can imagine would need our resources — they have the entire galaxy',
      'A non-interference prime directive would explain the silence perfectly without contradiction',
      'The fact that UFO sightings correlate with technological capability suggests possible observation',
      'SETI silence could mean they\'re watching but not responding',
    ],
    problems: [
      'Requires all civilizations to agree — one defector would break the policy',
      'Why would they care about our development? What do they gain from observing us?',
      'Anthropocentric — assumes we\'re interesting enough to protect',
      'No mechanism for enforcing a galaxy-wide prohibition',
    ],
    famousProponent: 'John Ball (MIT) & various SETI researchers',
    scarinessLevel: 3,
    implication: 'Optimistic, but requires an implausible galactic consensus. If true, we might be about to receive contact — or we may never "graduate." Also raises dark questions about what they\'re waiting for.'
  },
  {
    id: 'dark_forest',
    name: 'Dark Forest Theory',
    category: 'dark_forest',
    icon: '🌑',
    color: '#1e293b',
    likelihood: 'low',
    shortDesc: 'The universe is a dark forest where every civilization hides because any revealed civilization will be destroyed by others',
    explanation: 'Popularized by Chinese sci-fi author Liu Cixin ("The Three-Body Problem", 2008). The logic: (1) Every civilization wants to survive. (2) Resources are finite. (3) Civilizations cannot verify another\'s intentions, and (4) A civilization capable of interstellar communication is a threat by definition. Therefore: any civilization that reveals itself will be targeted for destruction. The optimal strategy is silence. The universe is dark not because it\'s empty, but because every civilization is hiding — and hunting.',
    evidence: [
      'Game theory supports this: revealing yourself first is always the losing strategy if the above axioms hold',
      'Radio signals might genuinely attract killers: active METI is extremely controversial for this reason',
      'The Arecibo Reply controversy (2001 crop circle) was treated as a potential "response" — and immediately raised alarms',
      'Liu Cixin: "The answer to Fermi\'s paradox is — not speaking, hiding, destroying"',
    ],
    problems: [
      'Cooperation and altruism have evolutionary advantages even between species (mutualism)',
      'A sufficiently advanced civilization might not be threatened by any other — why would they care about us?',
      'If everyone is hiding, why has no one accidentally revealed themselves in billions of years?',
      'Requires that resources genuinely cannot be found in untouched cosmic regions — disputable',
    ],
    famousProponent: 'Liu Cixin (science fiction author, physicist)',
    scarinessLevel: 9,
    implication: 'If true: stop broadcasting. Every radio signal is a target marker. Our TV signals have already traveled 80 light-years. If Dark Forest theory is correct, the clock may already be ticking. This is one reason Stephen Hawking urged against active METI.'
  },
  {
    id: 'simulation',
    name: 'Simulation Hypothesis',
    category: 'exotic',
    icon: '💻',
    color: '#06b6d4',
    likelihood: 'unknown',
    shortDesc: 'We (and any aliens) exist inside a simulation, and the simulators control what we can observe',
    explanation: 'Nick Bostrom (2003) argued at least one of three things must be true: (1) Virtually all civilizations go extinct before reaching "posthuman" computational power, (2) Posthuman civilizations don\'t run ancestor simulations, or (3) We are almost certainly in a simulation. If a civilization with planet-scale computing power ran simulations of their own history, simulated beings would outnumber "real" beings by billions — making simulation residents statistically almost guaranteed.',
    evidence: [
      'Quantum mechanics shows nature behaves as if discretized — like pixels in a simulation',
      'The "computational boundary" at the Planck length (10⁻³⁵ m) might be the simulation\'s resolution limit',
      'The "fine-tuning" of physical constants for life could be the simulators\' parameter choices',
      'Elon Musk famously estimates we\'re in a simulation (probability "billions to one")',
    ],
    problems: [
      'Completely unfalsifiable by definition — any evidence could be explained as "the simulation provides it"',
      'Even if we\'re in a simulation, the "base reality" civilizations would still face the Fermi paradox',
      'Requires extraordinary technological assumptions about base reality',
      'Occam\'s Razor: the simpler explanation is that aliens just don\'t exist',
    ],
    famousProponent: 'Nick Bostrom (philosopher), Elon Musk',
    scarinessLevel: 7,
    implication: 'If true, the Fermi paradox is moot — other "civilizations" exist only if the simulator chose to include them. Our science is real within the simulation. But our entire universe could be turned off by one subprocess error. The philosophers have been arguing about this for 20 years without resolution.'
  },
  {
    id: 'they_are_us',
    name: 'Directed Panspermia',
    category: 'exotic',
    icon: '🧬',
    color: '#10b981',
    likelihood: 'low',
    shortDesc: 'Life on Earth was deliberately seeded by an ancient alien civilization — we are their descendants',
    explanation: 'Francis Crick (co-discoverer of DNA) and Leslie Orgel proposed (1973) that life was deliberately sent to Earth by an advanced civilization via a microbe-carrying spacecraft. The evidence they cited: the universality of the genetic code (one code for all life on Earth suggests a single origin), life appeared quickly after Earth cooled, and the presence of molybdenum as an essential trace element (more common in other star systems).',
    evidence: [
      'The genetic code is universal — all life on Earth uses the same DNA → protein system despite billions of years of evolution',
      'Life appeared ~400 million years after Earth formed — very quickly on geological timescales',
      'Molybdenum\'s essential role in biochemistry: rarer on early Earth than in cosmic abundances',
      'DNA\'s information density is extraordinary — could conceivably be an artificial design',
    ],
    problems: [
      'Only shifts the question back: where did the aliens come from? Infinite regress.',
      'The genetic code\'s universality is explained by common descent + natural selection, not design',
      'Most astrobiologists consider natural abiogenesis more parsimonious',
      'No actual evidence of artificially seeded life — all life traces to common ancestors via evolution',
    ],
    famousProponent: 'Francis Crick & Leslie Orgel (1973)',
    scarinessLevel: 4,
    implication: 'We might be genetically related to beings elsewhere. Our parent civilization may still exist — or may have gone extinct. We might be carrying their genetic legacy forward. It would mean the Fermi paradox is answered: one civilization is special (our creators). But without evidence, it remains speculation.'
  },
  {
    id: 'transcension',
    name: 'Transcension Hypothesis',
    category: 'exotic',
    icon: '🧠',
    color: '#8b5cf6',
    likelihood: 'low',
    shortDesc: 'Advanced civilizations don\'t expand outward into space — they expand inward into computation and virtual reality',
    explanation: 'John Smart (2011) proposed that advanced civilizations inevitably move into computationally optimized inner spaces — simulations, virtual realities, minds uploaded to computers — rather than expanding physically across the galaxy. A civilization 1 million years ahead of us may exist as trillions of minds living in a cm³ of hypercomputing substrate, not across star systems. They become invisible not because they hide, but because they transcend physical presence.',
    evidence: [
      'The trend in computing: exponential increases in computational density, approaching Bremermann\'s limit',
      'All technological progress involves managing matter and energy at increasingly fine scales',
      'A fully simulated environment offers far more "space" (possibility space) than the physical universe',
      'No need for physical space travel if you can simulate any environment you desire',
    ],
    problems: [
      'How do they power hypercomputing without physical infrastructure (stars, matter)?',
      'Even transcended civilizations would need physical substrate — and that substrate would be detectable',
      'No evidence for massive waste heat from hypercomputing in space',
      'Selection bias: we\'re looking for physical signatures, not signatures of computation',
    ],
    famousProponent: 'John Smart (futurist)',
    scarinessLevel: 2,
    implication: 'Advanced civilizations aren\'t out there — they\'re inside their own minds. Space exploration may be a phase, not a destiny. We might be the universe\'s way of looking at itself for the brief moment before it turns inward. Both hopeful (no galactic predators) and melancholy (we might be alone in "real" space).'
  },
]

const CATEGORIES: { id: Category; label: string; icon: string; color: string }[] = [
  { id: 'rare_earth', label: 'Rare Earth', icon: '🌍', color: '#22c55e' },
  { id: 'filter', label: 'Great Filter', icon: '☠️', color: '#ef4444' },
  { id: 'they_exist', label: 'They Exist', icon: '👽', color: '#a855f7' },
  { id: 'dark_forest', label: 'Dark Forest', icon: '🌑', color: '#64748b' },
  { id: 'exotic', label: 'Exotic', icon: '💡', color: '#06b6d4' },
]

const LIKELIHOOD_COLORS: Record<string, string> = {
  high: '#22c55e',
  medium: '#fbbf24',
  low: '#94a3b8',
  unknown: '#a855f7',
}

export default function FermiParadox() {
  const [selected, setSelected] = useState<Solution>(SOLUTIONS[0])
  const [filterCat, setFilterCat] = useState<Category | 'all'>('all')

  const visible = filterCat === 'all' ? SOLUTIONS : SOLUTIONS.filter(s => s.category === filterCat)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">The Fermi Paradox</h2>
      <p className="text-gray-400 text-sm mb-4">
        "If the universe is so vast and old, where is everybody?" — Enrico Fermi, 1950. Explore every major proposed solution to the most profound question in science.
      </p>

      {/* The paradox statement */}
      <div className="bg-indigo-900/20 rounded-xl p-4 mb-5 border border-indigo-800/30">
        <div className="text-indigo-300 text-xs uppercase font-semibold mb-2">The Paradox</div>
        <p className="text-gray-300 text-sm leading-relaxed">
          The Milky Way is <strong className="text-white">13.6 billion years old</strong> and contains <strong className="text-white">200–400 billion stars</strong>, with an estimated <strong className="text-white">100+ billion Earth-like planets</strong>. Even at just 1% the speed of light, a civilization could colonize the entire galaxy in <strong className="text-white">~10 million years</strong> — just 0.07% of the galaxy's age.
          <br /><br />
          So: if even one civilization arose millions of years before us and expanded, they should be everywhere. We should see signs of them. We don't. This is the Fermi Paradox. Every solution is either terrifying, humbling, or mind-bending.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterCat('all')}
          className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
          style={{
            background: filterCat === 'all' ? 'rgba(99,102,241,0.25)' : 'rgba(30,41,59,0.7)',
            border: `1px solid ${filterCat === 'all' ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.05)'}`,
            color: filterCat === 'all' ? '#a5b4fc' : '#94a3b8',
          }}
        >All Solutions</button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilterCat(cat.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: filterCat === cat.id ? cat.color + '25' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${filterCat === cat.id ? cat.color + '70' : 'rgba(255,255,255,0.05)'}`,
              color: filterCat === cat.id ? cat.color : '#94a3b8',
            }}
          >{cat.icon} {cat.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Solution list */}
        <div className="space-y-2">
          {visible.map(sol => (
            <button
              key={sol.id}
              onClick={() => setSelected(sol)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === sol.id ? sol.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === sol.id ? sol.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{sol.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold text-sm" style={{ color: selected.id === sol.id ? sol.color : '#e2e8f0' }}>{sol.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-8">
                <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                  style={{ background: LIKELIHOOD_COLORS[sol.likelihood] + '20', color: LIKELIHOOD_COLORS[sol.likelihood] }}>
                  {sol.likelihood}
                </span>
                <span className="text-gray-600 text-xs">😱 {sol.scarinessLevel}/10</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-4xl flex-shrink-0">{selected.icon}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: LIKELIHOOD_COLORS[selected.likelihood] + '25', color: LIKELIHOOD_COLORS[selected.likelihood], border: `1px solid ${LIKELIHOOD_COLORS[selected.likelihood]}40` }}>
                    {selected.likelihood} likelihood
                  </span>
                </div>
                <div className="text-gray-400 text-xs">Proposed by: {selected.famousProponent}</div>
              </div>
            </div>

            {/* Scaryness bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Existential Implications</span>
                <span className="font-bold text-orange-400">{selected.scarinessLevel}/10</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="h-1.5 flex-1 rounded-sm"
                    style={{ background: i < selected.scarinessLevel ? (selected.scarinessLevel > 7 ? '#ef4444' : selected.scarinessLevel > 4 ? '#f97316' : '#fbbf24') : 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
            </div>

            <p className="text-gray-300 text-sm leading-relaxed">{selected.shortDesc}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Full Explanation</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.explanation}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-emerald-400 text-xs uppercase font-semibold mb-2">Evidence Supporting It</div>
              <div className="space-y-1.5">
                {selected.evidence.map((e, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-emerald-400 flex-shrink-0">✓</span>
                    <span className="text-gray-300 leading-relaxed">{e}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-red-400 text-xs uppercase font-semibold mb-2">Problems & Counterarguments</div>
              <div className="space-y-1.5">
                {selected.problems.map((p, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-red-400 flex-shrink-0">✗</span>
                    <span className="text-gray-300 leading-relaxed">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}20` }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>What It Means for Humanity</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.implication}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
