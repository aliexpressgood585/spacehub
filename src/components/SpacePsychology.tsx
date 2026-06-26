import { useState } from 'react'

interface Effect {
  id: string
  name: string
  icon: string
  color: string
  category: 'cognitive' | 'emotional' | 'physical' | 'social' | 'perceptual'
  timeline: string
  description: string
  realCases: string
  howItFeels: string
  returnToEarth: string
  funFact: string
}

const EFFECTS: Effect[] = [
  {
    id: 'overview',
    name: 'The Overview Effect',
    icon: '🌍',
    color: '#3b82f6',
    category: 'perceptual',
    timeline: 'Within hours of reaching orbit',
    description: 'A profound cognitive shift that occurs when astronauts see Earth from space for the first time. The thin blue line of atmosphere, the lack of borders, the fragility — all become overwhelming and immediate.',
    realCases: 'Edgar Mitchell (Apollo 14): "I had an epiphany... I suddenly experienced the universe as intelligent, loving, harmonious." Ron Garan called it "orbital perspective." Nearly every astronaut reports some version of this.',
    howItFeels: 'A sudden, irreversible understanding that Earth is one fragile system — that all human conflict is petty, that borders are invisible, that we share one thin shield of air. Many describe it as a "religious" experience without being religious.',
    returnToEarth: 'Many astronauts become environmental activists, peace advocates, or philosophers. Ron Garan founded Orbital Perspective. Edgar Mitchell founded IONS (Institute of Noetic Sciences).',
    funFact: 'The Overview Effect has been reported by every nation\'s astronauts, regardless of background, politics, or religion. It may be the one experience that unifies the entire human species — and 99.9999% of humans have never had it.'
  },
  {
    id: 'isolation',
    name: 'Extreme Isolation & Confinement',
    icon: '🚪',
    color: '#f97316',
    category: 'emotional',
    timeline: 'Weeks to months into a mission',
    description: 'Space missions confine crews in tiny spaces (ISS has ~388 m³ of pressurized volume — smaller than a 6-bedroom house) for months. No privacy, same 6 people, no escape.',
    realCases: 'NASA HI-SEAS (Mars simulation in Hawaii): crews showed degrading communication, increased conflict in months 3-4, psychological "third-quarter phenomenon." Mir cosmonauts famously struggled with interpersonal conflict on long missions.',
    howItFeels: 'Think about being stuck in a house with 5 coworkers for 6 months — no leaving, no fresh air, same food, same people every moment. Add life-threatening stakes and distance from family by 400 km.',
    returnToEarth: 'Some astronauts describe the return as jarring — crowds feel overwhelming, gravity feels crushing, simple decisions (menu choices) become exhausting. ISS veterans often need weeks to readjust to Earth social norms.',
    funFact: 'NASA found that astronauts on 6-month missions experience changes in brain structure visible on MRI — the brain actually shifts upward inside the skull due to fluid redistribution. The changes persist for over a year after return.'
  },
  {
    id: 'time',
    name: 'Time Perception Distortion',
    icon: '⏱️',
    color: '#a855f7',
    category: 'cognitive',
    timeline: 'Variable — most pronounced in isolation',
    description: 'Without day/night cycles, seasons, or natural cues, the brain\'s sense of time becomes unreliable. ISS has 16 sunrises and sunsets per day, disrupting circadian rhythms. Astronauts must follow strictly scheduled artificial light cycles.',
    realCases: 'Valery Polyakov (438 days on Mir) reported days felt longer yet the mission felt compressed in memory. Jeff Williams noted that months could "disappear" in the relentless routine of orbital life.',
    howItFeels: 'Imagine waking up and not knowing if it\'s morning or evening. The rhythms that anchor human psychology — morning coffee, afternoon sunshine, evening darkness — are completely absent.',
    returnToEarth: 'Long-duration astronauts often report disorientation with time after return. Some need weeks before their internal sense of "what time is it" becomes reliable again.',
    funFact: 'ISS astronauts experience 16 sunrises per day at 90-minute intervals. To maintain a 24-hour schedule, NASA uses window shades and carefully choreographed artificial lighting. One misstep can throw the whole crew\'s sleep off for days.'
  },
  {
    id: 'earth_absence',
    name: 'Earth Absence & Homesickness',
    icon: '💔',
    color: '#ef4444',
    category: 'emotional',
    timeline: 'Peaks around month 3-4 (third-quarter phenomenon)',
    description: 'Psychological research on Antarctic crews, submarine crews, and astronauts consistently finds a dip in morale and motivation around the 3/4 mark of a mission — when the return feels both far and approaching.',
    realCases: 'Scott Kelly (1 year on ISS) documented longing for simple things: the smell of rain, petting a dog, eating fresh food. He wrote that emails from family felt "insufficient." Several cosmonauts have cried during long missions.',
    howItFeels: 'A deep, almost physical longing not just for people, but for sensory experiences that can\'t exist in space: wind, rain, soil, the smell of cut grass, the feeling of standing on the ground.',
    returnToEarth: 'The return is often described as overwhelming positive emotional release. Many astronauts cry immediately upon landing. The smell of Earth — grass, soil, rain — is described as one of the most profound sensory experiences of their lives.',
    funFact: 'NASA\'s psychological support program for ISS crews includes weekly video calls with family, surprise care packages (delivered by resupply rockets), and even private conversations with psychologists. Music is crucial — astronauts are encouraged to bring hundreds of hours of personal favorites.'
  },
  {
    id: 'cognitive_decline',
    name: 'Cognitive Changes in Microgravity',
    icon: '🧠',
    color: '#22c55e',
    category: 'cognitive',
    timeline: 'Progressive over weeks/months',
    description: 'Microgravity causes fluid to shift toward the head, increasing intracranial pressure and subtly compressing the brain. Studies show measurable changes in attention, processing speed, and fine motor control that develop over months.',
    realCases: 'Twin study: Scott Kelly vs. Mark Kelly (Earth-based). After 1 year, Scott showed: changes in gene expression, altered gut microbiome, lengthened telomeres (reversed after return), subtle cognitive score changes. NASA called them "significant."',
    howItFeels: 'Astronauts report occasional "brain fog" especially early in missions when fluid redistribution is most intense. Many describe needing to think through tasks they\'d normally do automatically.',
    returnToEarth: 'Most cognitive changes reverse within weeks to months of return. But a 2022 study found ISS astronauts still showed brain structural differences 7 months after return — the longest such study done.',
    funFact: 'One of Scott Kelly\'s cells became genetically distinct from his identical twin\'s after 1 year in space. 7% of his gene expression changed — some reversed, some didn\'t. Space literally changes who you are at a cellular level.'
  },
  {
    id: 'risk_reframing',
    name: 'Risk Normalization & Courage',
    icon: '⚡',
    color: '#fbbf24',
    category: 'social',
    timeline: 'Before and throughout the mission',
    description: 'Astronauts must make peace with the fact that they\'re riding an explosion into a vacuum that would kill them in seconds without their suit. Over time, this risk becomes "normalized" — seen as just part of the job.',
    realCases: 'After Challenger (1986), astronauts continued flying. After Columbia (2003), the next crew launched 2.5 years later. Sally Ride, asked about danger: "There\'s a lot of things that could go wrong... I know that. And I\'ve decided that\'s fine with me."',
    howItFeels: 'Most astronauts describe a calculated acceptance — not suppression of fear, but a decision that the mission is worth the risk. Many write letters to their families before launch "just in case," then focus completely on the mission.',
    returnToEarth: 'Many astronauts describe a changed relationship with risk and mortality. Having faced real death possibility and come through, ordinary fears feel diminished. Some describe a form of post-traumatic growth.',
    funFact: 'During Apollo, astronauts had roughly 50% estimated survival odds — NASA officials privately thought it. During the Columbia return disaster (2003), the crew was aware something might be wrong but proceeded professionally. Their final data transmissions were perfect.'
  },
]

const CATEGORY_LABELS: Record<Effect['category'], string> = {
  cognitive:   '🧠 Cognitive',
  emotional:   '💙 Emotional',
  physical:    '💪 Physical',
  social:      '👥 Social',
  perceptual:  '👁️ Perceptual',
}

const CATEGORY_COLORS: Record<Effect['category'], string> = {
  cognitive: '#3b82f6',
  emotional: '#ef4444',
  physical:  '#22c55e',
  social:    '#fbbf24',
  perceptual: '#a855f7',
}

export default function SpacePsychology() {
  const [selected, setSelected] = useState<Effect>(EFFECTS[0])
  const [catFilter, setCatFilter] = useState<Effect['category'] | 'all'>('all')

  const filtered = catFilter === 'all' ? EFFECTS : EFFECTS.filter(e => e.category === catFilter)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Psychology</h2>
      <p className="text-gray-400 text-sm mb-5">Space doesn't just change your body — it transforms your mind. The psychological effects of leaving Earth.</p>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setCatFilter('all')}
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{ background: catFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)', color: catFilter === 'all' ? 'white' : '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}
        >All Effects</button>
        {(Object.entries(CATEGORY_LABELS) as [Effect['category'], string][]).map(([cat, label]) => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: catFilter === cat ? CATEGORY_COLORS[cat] + '25' : 'rgba(255,255,255,0.04)',
              color: catFilter === cat ? CATEGORY_COLORS[cat] : '#6b7280',
              border: `1px solid ${catFilter === cat ? CATEGORY_COLORS[cat] + '50' : 'rgba(255,255,255,0.06)'}`,
            }}
          >{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Effect list */}
        <div className="space-y-1.5">
          {filtered.map(e => (
            <button
              key={e.id}
              onClick={() => setSelected(e)}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: selected.id === e.id ? e.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === e.id ? e.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl mt-0.5">{e.icon}</span>
                <div>
                  <div className="text-xs font-semibold" style={{ color: selected.id === e.id ? e.color : '#e2e8f0' }}>{e.name}</div>
                  <div className="text-[10px] text-gray-600">{CATEGORY_LABELS[e.category]}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5 truncate max-w-[160px]">{e.timeline}</div>
                </div>
              </div>
            </button>
          ))}

          {/* Overview stat */}
          <div className="bg-gray-800/60 rounded-xl p-3 mt-3">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🧬 By The Numbers</div>
            <div className="space-y-1.5">
              {[
                { label: 'ISS living space', value: '388 m³', color: '#3b82f6' },
                { label: 'Avg mission length', value: '6 months', color: '#22c55e' },
                { label: 'Bone density loss', value: '1%/month', color: '#ef4444' },
                { label: 'Vision changes', value: '~40% of crew', color: '#fbbf24' },
              ].map(s => (
                <div key={s.label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{s.label}</span>
                  <span className="font-bold" style={{ color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="text-sm text-gray-400">{CATEGORY_LABELS[selected.category]}</div>
                <div className="text-xs mt-0.5" style={{ color: selected.color }}>⏱️ {selected.timeline}</div>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.description}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🚀 Real Cases</div>
              <p className="text-gray-300 text-sm leading-relaxed">{selected.realCases}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">💭 How It Feels</div>
              <p className="text-gray-300 text-sm leading-relaxed">{selected.howItFeels}</p>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🌍 After Return to Earth</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.returnToEarth}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Stunning Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
