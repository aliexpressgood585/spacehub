import { useState } from 'react'

interface Mystery {
  id: string
  name: string
  icon: string
  color: string
  category: 'particle' | 'cosmic' | 'galaxy' | 'fundamental' | 'observation'
  status: 'unsolved' | 'partial' | 'recent_breakthrough'
  yearsOpen: number
  whatWeKnow: string
  whatWeDoNotKnow: string
  bestGuesses: string[]
  whyItMatters: string
  clues: string
  funFact: string
}

const MYSTERIES: Mystery[] = [
  {
    id: 'dark_energy',
    name: 'What Is Dark Energy?',
    icon: '🌑',
    color: '#a855f7',
    category: 'fundamental',
    status: 'unsolved',
    yearsOpen: 26,
    whatWeKnow: 'In 1998, astronomers found the universe\'s expansion is accelerating. Something — called dark energy — is pushing everything apart with increasing speed. It makes up ~68% of the total energy-mass of the universe.',
    whatWeDoNotKnow: 'What it is. Completely. We have no theory that successfully explains it from first principles. The cosmological constant (Einstein\'s "greatest blunder") fits the data — but quantum mechanics predicts a value 10¹²⁰ times larger. This is the worst prediction in all of science.',
    bestGuesses: [
      'Cosmological constant — energy inherent to empty space',
      'Quintessence — a dynamic field slowly changing over time',
      'Modified gravity — general relativity breaks down at cosmic scales',
      'Extra dimensions leaking gravity to other branes',
    ],
    whyItMatters: 'Dark energy determines the ultimate fate of the universe. If it\'s constant, we get the "Big Freeze." If it grows: "Big Rip" — everything tears apart in ~20 billion years. If it decreases: "Big Crunch" — reversal and collapse.',
    clues: 'The Dark Energy Survey mapped 300M galaxies. DESI (2024) found hints that dark energy may be changing — the first crack in the cosmological constant model. The Vera Rubin Observatory (2025+) will map billions more.',
    funFact: 'Quantum field theory predicts the energy of empty space should be 10¹²⁰ times larger than what we observe. This may be the largest discrepancy between theory and observation in the history of science — and we have no idea why.'
  },
  {
    id: 'matter_antimatter',
    name: 'Why Is There Matter At All?',
    icon: '⚛️',
    color: '#ef4444',
    category: 'particle',
    status: 'unsolved',
    yearsOpen: 60,
    whatWeKnow: 'The Big Bang should have created equal amounts of matter and antimatter. They would have annihilated each other, leaving a universe of pure energy — nothing. But here we are: matter exists. Something broke the symmetry.',
    whatWeDoNotKnow: 'Why matter won. We\'ve observed CP violation (slight matter-antimatter asymmetry) in particle experiments, but the amount is thousands of times too small to explain the matter surplus we see.',
    bestGuesses: [
      'Undiscovered CP violation much larger than known',
      'Leptogenesis — asymmetry created in leptons first, then converted to baryons',
      'Baryogenesis via Sakharov conditions at high temperature',
      'Some antimatter is hidden in unreachable parts of the universe',
    ],
    whyItMatters: 'This is literally why you exist. If matter and antimatter had perfectly equal amounts at the Big Bang, the entire universe would be a sea of radiation with no atoms, no stars, no planets, no life — no anything.',
    clues: 'CERN\'s LHCb experiment and Japan\'s T2K experiment have found CP violation in neutrinos (2019-2020) — the first hint that leptons might be the source. The matter-antimatter asymmetry may trace back to neutrinos.',
    funFact: 'For every billion particle-antiparticle pairs that annihilated in the early universe, there was one extra matter particle. That one-in-a-billion surplus is everything you see: all galaxies, all stars, all planets, every atom in every being. We are the excess.'
  },
  {
    id: 'fast_radio_bursts',
    name: 'Fast Radio Bursts',
    icon: '📡',
    color: '#fbbf24',
    category: 'observation',
    status: 'partial',
    yearsOpen: 17,
    whatWeKnow: 'FRBs are millisecond-duration radio pulses arriving from billions of light-years away. They release as much energy as the Sun emits in ~3 days — in 1 millisecond. We now detect hundreds per day. Some repeat; most don\'t.',
    whatWeDoNotKnow: 'What produces them. Repeating FRBs and non-repeating ones might be different phenomena. The mechanism must be incredibly energetic and precise — the pulse width requires a source smaller than a few hundred km.',
    bestGuesses: [
      'Magnetar flares — the most magnetic objects known (10¹⁴ Tesla)',
      'Colliding neutron stars or black holes',
      'Cosmic string vibrations (exotic theoretical structures)',
      'Advanced civilizations — dismissed but not fully excluded',
    ],
    whyItMatters: 'FRBs are now used to measure the universe\'s "baryon density" — the density of ordinary matter between galaxies. They pierce the cosmic web and their dispersion tells us how much matter they passed through. They\'re becoming a new cosmic tool.',
    clues: 'In 2020, a magnetar in our galaxy (SGR 1935+2154) produced an FRB visible from Earth — definitively proving magnetars can make FRBs. But it was weaker than typical extragalactic FRBs, suggesting either they\'re all magnetars, or some aren\'t.',
    funFact: 'The CHIME telescope in Canada detects ~1,000 FRBs per year. Some repeat precisely — FRB 20201124A fired 1,863 bursts in 82 hours with a mysterious 16.35-day cycle. No known natural process explains that regularity.'
  },
  {
    id: 'hubble_tension',
    name: 'The Hubble Tension',
    icon: '🔭',
    color: '#3b82f6',
    category: 'cosmic',
    status: 'recent_breakthrough',
    yearsOpen: 10,
    whatWeKnow: 'Two independent methods of measuring the Hubble constant (how fast the universe is expanding) give different answers. CMB measurements: 67.4 km/s/Mpc. Local measurements (Cepheid stars, supernovae): 73.2 km/s/Mpc. The discrepancy is 8% — far too large for error.',
    whatWeDoNotKnow: 'Which measurement is wrong — or whether new physics is required. Both methods have been checked exhaustively. JWST confirmed the local measurement in 2023, making systematic error less likely.',
    bestGuesses: [
      'Unknown new physics between recombination and today',
      '"Early dark energy" briefly active in early universe',
      'Primordial magnetic fields altering CMB physics',
      'One or both measurement chains has hidden systematic errors',
    ],
    whyItMatters: 'If neither measurement is wrong, it requires new physics beyond ΛCDM — the standard model of cosmology. This would be the biggest revolution in cosmology since dark energy discovery (1998).',
    clues: 'JWST\'s first science paper (2023) confirmed Cepheid distances independently. The DESI 2024 baryon acoustic oscillation results hint at a slightly lower expansion rate. Tension remains. Growing consensus: it\'s real, not errors.',
    funFact: 'The Hubble tension means the universe measured from its early history disagrees with the universe measured today. This is like measuring a person\'s height at age 5 and predicting their adult height, but when they grow up, they\'re taller than the model predicted — and nobody knows why.'
  },
  {
    id: 'black_hole_information',
    name: 'Black Hole Information Paradox',
    icon: '⚫',
    color: '#6366f1',
    category: 'fundamental',
    status: 'partial',
    yearsOpen: 50,
    whatWeKnow: 'Stephen Hawking proved black holes emit thermal radiation and slowly evaporate. But thermal radiation carries no information — it\'s random. This means information about everything that fell into a black hole is destroyed, violating quantum mechanics\' requirement that information is always preserved.',
    whatWeDoNotKnow: 'How information escapes (if it does). Whether quantum mechanics or general relativity needs to be modified. What happens at the singularity.',
    bestGuesses: [
      'Information is encoded in subtle correlations in Hawking radiation ("scrambled" not destroyed)',
      'Firewalls — a wall of high-energy quanta at the horizon destroys infalling matter',
      'Black hole remnants store all information forever',
      'ER=EPR: wormholes and entanglement are the same thing (Maldacena/Susskind)',
    ],
    whyItMatters: 'This is the deepest conflict between quantum mechanics and general relativity. Resolving it requires a theory of quantum gravity — the holy grail of theoretical physics. String theory, loop quantum gravity, and holography all attempt this.',
    clues: 'The holographic principle (\'t Hooft, Susskind) suggests all information in a volume is encoded on its surface. Page\'s theorem (1993) shows information must leak out. The "Page time" (halfway through evaporation) marks when information starts appearing.',
    funFact: 'Hawking bet that information IS destroyed. Preskill bet it\'s preserved. In 2004, Hawking conceded the bet — information is probably preserved. He never fully explained how. Forty years of work and we still don\'t know the mechanism.'
  },
  {
    id: 'wow_signal',
    name: 'The Wow! Signal & Fermi Paradox',
    icon: '👽',
    color: '#22c55e',
    category: 'observation',
    status: 'unsolved',
    yearsOpen: 47,
    whatWeKnow: 'On August 15, 1977, astronomer Jerry Ehman detected a 72-second burst of narrowband radio emission from the direction of Sagittarius at the Big Ear telescope. It was so striking he circled it on the printout and wrote "Wow!" It has never been detected again.',
    whatWeDoNotKnow: 'What caused it. The signal had characteristics consistent with an extraterrestrial transmission: it was at 1420 MHz (hydrogen line, a predicted "cosmic channel"), narrowband, and from space. No natural explanation fully fits.',
    bestGuesses: [
      'A rare natural astronomical phenomenon (interstellar scintillation, cometary hydrogen cloud)',
      'A signal from an extraterrestrial intelligence — never repeated because they transmitted once',
      'A classified military satellite (government denies)',
      'An instrumental artifact — but the telescope design makes this unlikely',
    ],
    whyItMatters: 'The Fermi Paradox asks: if intelligent life is common, where is everybody? The Wow! Signal is the best (and only) candidate SETI signal ever received. If it\'s natural, we have no SETI signal. If it\'s artificial, we have one — and it stopped.',
    clues: 'In 2022, astronomers found two comets (266P/Christensen and P/2008 Y2 Gibbs) passed through the telescope\'s field of view on that date. Hydrogen clouds from comets could explain the signal. But this hypothesis is disputed.',
    funFact: 'If the Wow! Signal came from 200 light-years away, and was a broadcast, the beings who sent it lived when our ancestors were farming ancient Mesopotamia. Our reply — if we sent one in 1977 — would arrive there around 2177. They\'d have to wait 400 years for confirmation we exist.'
  },
]

const STATUS_CONFIG = {
  unsolved:           { label: '🔴 Unsolved', color: '#ef4444' },
  partial:            { label: '🟡 Partially Understood', color: '#fbbf24' },
  recent_breakthrough: { label: '🟢 Recent Breakthrough', color: '#22c55e' },
}

const CATEGORY_LABELS: Record<Mystery['category'], string> = {
  particle:    '⚛️ Particle Physics',
  cosmic:      '🌌 Cosmology',
  galaxy:      '🌀 Galactic',
  fundamental: '🧬 Fundamental',
  observation: '🔭 Observation',
}

export default function CosmicMysteries() {
  const [selected, setSelected] = useState<Mystery>(MYSTERIES[0])
  const [catFilter, setCatFilter] = useState<Mystery['category'] | 'all'>('all')

  const filtered = catFilter === 'all' ? MYSTERIES : MYSTERIES.filter(m => m.category === catFilter)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Greatest Cosmic Mysteries</h2>
      <p className="text-gray-400 text-sm mb-5">The deepest unsolved questions in astrophysics — where human knowledge ends and the unknown begins.</p>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setCatFilter('all')} className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{ background: catFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)', color: catFilter === 'all' ? 'white' : '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}>
          All Mysteries
        </button>
        {(Object.entries(CATEGORY_LABELS) as [Mystery['category'], string][]).map(([cat, label]) => (
          <button key={cat} onClick={() => setCatFilter(cat)} className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{ background: catFilter === cat ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)', color: catFilter === cat ? '#a5b4fc' : '#6b7280', border: `1px solid ${catFilter === cat ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}` }}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Mystery list */}
        <div className="space-y-1.5">
          {filtered.map(m => {
            const sc = STATUS_CONFIG[m.status]
            return (
              <button key={m.id} onClick={() => setSelected(m)} className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                style={{ background: selected.id === m.id ? m.color + '18' : 'rgba(15,23,42,0.5)', border: `1px solid ${selected.id === m.id ? m.color + '50' : 'rgba(255,255,255,0.04)'}` }}>
                <div className="flex items-start gap-2">
                  <span className="text-xl mt-0.5">{m.icon}</span>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: selected.id === m.id ? m.color : '#e2e8f0' }}>{m.name}</div>
                    <div className="text-[10px] text-gray-600">{CATEGORY_LABELS[m.category]}</div>
                    <div className="flex gap-1.5 mt-0.5 items-center">
                      <span className="text-[9px] font-bold" style={{ color: sc.color }}>{sc.label}</span>
                      <span className="text-[9px] text-gray-700">• {m.yearsOpen}y open</span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: STATUS_CONFIG[selected.status].color, background: STATUS_CONFIG[selected.status].color + '20' }}>
                    {STATUS_CONFIG[selected.status].label}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">Open for {selected.yearsOpen} years</span>
                </div>
              </div>
            </div>
            <div className="mb-3">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-1">✅ What We Know</div>
              <p className="text-gray-300 text-sm leading-relaxed">{selected.whatWeKnow}</p>
            </div>
            <div className="rounded-lg p-3 bg-gray-900/50">
              <div className="text-red-400 text-xs uppercase font-semibold mb-1">❓ What We Don't Know</div>
              <p className="text-gray-300 text-sm">{selected.whatWeDoNotKnow}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🔬 Best Current Guesses</div>
              <ul className="space-y-1">
                {selected.bestGuesses.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                    <span style={{ color: selected.color }} className="mt-0.5 flex-shrink-0">▸</span>{g}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🌍 Why It Matters</div>
              <p className="text-gray-300 text-sm leading-relaxed">{selected.whyItMatters}</p>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🔭 Latest Clues</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.clues}</p>
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
