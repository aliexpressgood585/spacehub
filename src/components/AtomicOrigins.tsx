import { useState } from 'react'

interface Element {
  symbol: string
  name: string
  atomicNumber: number
  percentInBody: number
  origin: 'big_bang' | 'stellar_fusion' | 'supernova' | 'neutron_star' | 'cosmic_ray'
  color: string
  story: string
  where: string
  mindBlow: string
  bodyRole: string
}

const ORIGIN_CONFIG = {
  big_bang:       { label: 'Big Bang Nucleosynthesis', icon: '💥', color: '#fbbf24', desc: 'Created in the first 3 minutes after the Big Bang, when the universe was a nuclear furnace.' },
  stellar_fusion: { label: 'Stellar Nucleosynthesis', icon: '⭐', color: '#f97316', desc: 'Forged in the cores of stars over billions of years of nuclear fusion.' },
  supernova:      { label: 'Supernova Explosion', icon: '🌟', color: '#ef4444', desc: 'Only created in the extreme violence of a star\'s death — a supernova explosion.' },
  neutron_star:   { label: 'Neutron Star Merger', icon: '💫', color: '#a855f7', desc: 'Forged when two neutron stars collide — the most energetic events since the Big Bang.' },
  cosmic_ray:     { label: 'Cosmic Ray Spallation', icon: '⚡', color: '#3b82f6', desc: 'Created when cosmic rays slam into heavier atoms and shatter them into lighter ones.' },
}

const ELEMENTS: Element[] = [
  {
    symbol: 'H',
    name: 'Hydrogen',
    atomicNumber: 1,
    percentInBody: 60.0,
    origin: 'big_bang',
    color: '#fbbf24',
    story: 'Every hydrogen atom in your body is 13.8 billion years old. It was born in the Big Bang, floated through the cosmos, became part of a nebula, was incorporated into our solar system, and is now inside you.',
    where: 'Water (H₂O), DNA, proteins, fats — 60% of all atoms in your body by count.',
    mindBlow: 'The hydrogen in your coffee was created 13.8 billion years ago in the Big Bang fireball. You\'re drinking 14-billion-year-old cosmic relic.',
    bodyRole: 'Water (H₂O) — the solvent of life. DNA backbone. Fat molecules. Acid-base balance.',
  },
  {
    symbol: 'O',
    name: 'Oxygen',
    atomicNumber: 8,
    percentInBody: 26.0,
    origin: 'stellar_fusion',
    color: '#3b82f6',
    story: 'Oxygen is the third most abundant element in the universe, made by stars 4-8× the Sun\'s mass. In their final years, these stars fused helium into carbon, then carbon into oxygen via the triple-alpha process.',
    where: 'Water, proteins, DNA, bones (calcium phosphate has oxygen), blood (hemoglobin).',
    mindBlow: 'The oxygen in every breath was exhaled by dying stars billions of years before Earth existed. You breathe stellar exhaust.',
    bodyRole: 'Cellular respiration — you burn oxygen to extract energy from food. Without it, cells die in minutes.',
  },
  {
    symbol: 'C',
    name: 'Carbon',
    atomicNumber: 6,
    percentInBody: 10.5,
    origin: 'stellar_fusion',
    color: '#6366f1',
    story: 'Carbon is the element of life — its 4 bonds let it form the complex molecular chains of DNA, proteins, and fats. Stars create carbon via the triple-alpha process: three helium nuclei fusing into one carbon-12. Fred Hoyle predicted the resonance state required — a famous prediction later confirmed.',
    where: 'DNA, proteins, fats, carbohydrates — every organic molecule in existence.',
    mindBlow: 'Fred Hoyle noted: if carbon resonance energy were 4% different, stars couldn\'t make it. If it were 0.5% different, oxygen would be rare. Life exists in a razor-thin nuclear physics window.',
    bodyRole: 'The backbone of every biological molecule. DNA, RNA, proteins, cell membranes — all carbon chains.',
  },
  {
    symbol: 'N',
    name: 'Nitrogen',
    atomicNumber: 7,
    percentInBody: 1.4,
    origin: 'stellar_fusion',
    color: '#22c55e',
    story: 'Nitrogen is made in massive stars and expelled in planetary nebulae and supernovae. The nitrogen cycle on Earth is driven by bacteria that convert atmospheric N₂ into forms living things can use.',
    where: 'DNA bases (adenine, thymine, cytosine, guanine), amino acids, proteins.',
    mindBlow: 'Every DNA base pair contains nitrogen that came from a dying star. Your genetic code is written with stellar ashes.',
    bodyRole: 'Amino acids and proteins (all contain nitrogen). DNA and RNA bases. Neurotransmitters like dopamine and serotonin.',
  },
  {
    symbol: 'Fe',
    name: 'Iron',
    atomicNumber: 26,
    percentInBody: 0.006,
    origin: 'supernova',
    color: '#ef4444',
    story: 'Iron is the final element that stars can fuse and release energy from. Once a star\'s core is iron, fusion stops — the star collapses in milliseconds, triggering a supernova. All iron heavier than that requires a supernova\'s energy to form.',
    where: 'Hemoglobin in red blood cells — carries oxygen through your blood.',
    mindBlow: 'Iron is the tombstone of a star. When a star can no longer fuse iron, it dies. The iron in your blood was the death trigger of a massive star billions of years ago.',
    bodyRole: 'The iron in hemoglobin binds to oxygen in your lungs and releases it in your tissues. Without iron, you can\'t carry oxygen — you die of anemia.',
  },
  {
    symbol: 'Ca',
    name: 'Calcium',
    atomicNumber: 20,
    percentInBody: 1.5,
    origin: 'supernova',
    color: '#f59e0b',
    story: 'Calcium is primarily created in the silicon-burning phase right before a core-collapse supernova — literally in the dying seconds of a massive star\'s life. It\'s scattered across the galaxy in the explosion.',
    where: 'Bones and teeth (hydroxyapatite). Muscle contraction. Nerve signals.',
    mindBlow: 'Your skeleton is built from atoms ejected in the final seconds before a star exploded. Your bones are literally crystallized supernova remnants.',
    bodyRole: 'Bones and teeth (99% of body calcium). Heart muscle contraction. Nerve signal transmission. Blood clotting.',
  },
  {
    symbol: 'Au',
    name: 'Gold',
    atomicNumber: 79,
    percentInBody: 0.00000014,
    origin: 'neutron_star',
    color: '#d97706',
    story: 'Gold cannot be made in ordinary stars or even supernova — it requires the r-process (rapid neutron capture), which occurs only in neutron star mergers. In 2017, LIGO detected two neutron stars merging (GW170817), and telescopes saw gold forming in real time.',
    where: 'Trace amounts in blood. Gold is used in some cancer treatments.',
    mindBlow: 'All gold on Earth came from neutron star collisions before the Sun formed. The gold in your ring is certified neutron star collision debris. The 2017 kilonova GW170817 created ~10 Earth masses of gold in one second.',
    bodyRole: 'Negligible biological role in humans, but used in cancer radiotherapy and as antifungal/anti-inflammatory compounds.',
  },
  {
    symbol: 'Li',
    name: 'Lithium',
    atomicNumber: 3,
    percentInBody: 0.000002,
    origin: 'big_bang',
    color: '#ec4899',
    story: 'Lithium was one of only three elements made in the Big Bang (along with hydrogen and helium). But there\'s a mystery: the Big Bang should have made 3× more lithium than we observe. Where did it go? This is an open problem in cosmology called "the Lithium Problem."',
    where: 'Trace amounts throughout the body. Used as a psychiatric medication (lithium carbonate treats bipolar disorder).',
    mindBlow: 'Lithium is used to stabilize human mood — and the Big Bang made too much of it. We can\'t account for the "missing" Big Bang lithium. The element stabilizing mental health is itself one of cosmology\'s great mysteries.',
    bodyRole: 'No essential biological role, but lithium compounds are the most effective treatment for bipolar disorder — dramatically reducing suicide rates.',
  },
]

export default function AtomicOrigins() {
  const [selected, setSelected] = useState<Element>(ELEMENTS[0])

  const byOrigin = (o: Element['origin']) => ELEMENTS.filter(e => e.origin === o)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Your Body's Cosmic Origins</h2>
      <p className="text-gray-400 text-sm mb-5">Every atom in your body was forged in a cosmic event. Here's where you actually came from.</p>

      {/* Origin legend */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        {(Object.entries(ORIGIN_CONFIG) as [Element['origin'], typeof ORIGIN_CONFIG[keyof typeof ORIGIN_CONFIG]][]).map(([key, cfg]) => (
          <div key={key} className="rounded-lg p-2 text-center" style={{ background: cfg.color + '10', border: `1px solid ${cfg.color}25` }}>
            <div className="text-xl mb-0.5">{cfg.icon}</div>
            <div className="text-[10px] font-semibold leading-tight" style={{ color: cfg.color }}>{cfg.label}</div>
            <div className="text-[10px] text-gray-600 mt-0.5 leading-tight hidden sm:block">{byOrigin(key).map(e => e.symbol).join(', ')}</div>
          </div>
        ))}
      </div>

      {/* Element selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {ELEMENTS.map(el => {
          const originCfg = ORIGIN_CONFIG[el.origin]
          return (
            <button
              key={el.symbol}
              onClick={() => setSelected(el)}
              className="px-3 py-1.5 rounded-xl transition-all"
              style={{
                background: selected.symbol === el.symbol ? originCfg.color + '25' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.symbol === el.symbol ? originCfg.color + '60' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <span className="text-sm font-bold" style={{ color: selected.symbol === el.symbol ? originCfg.color : '#9ca3af' }}>{el.symbol}</span>
              <span className="text-[10px] text-gray-600 ml-1">{el.name}</span>
            </button>
          )
        })}
      </div>

      {/* Selected element detail */}
      {(() => {
        const cfg = ORIGIN_CONFIG[selected.origin]
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl p-5" style={{ background: cfg.color + '10', border: `1px solid ${cfg.color}30` }}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center font-mono font-bold flex-shrink-0" style={{ background: cfg.color + '20', border: `2px solid ${cfg.color}50` }}>
                  <div className="text-[10px] text-gray-500">{selected.atomicNumber}</div>
                  <div className="text-2xl" style={{ color: cfg.color }}>{selected.symbol}</div>
                  <div className="text-[8px] text-gray-500">{selected.name}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{cfg.icon}</span>
                    <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <div className="text-white font-bold text-lg">{selected.name}</div>
                  <div className="text-xs text-gray-500">{selected.percentInBody}% of your body atoms</div>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed mb-3">{selected.story}</p>
              <div className="rounded-lg p-3 bg-gray-900/50">
                <div className="text-gray-500 text-xs uppercase font-semibold mb-1">💊 In Your Body</div>
                <p className="text-gray-300 text-sm">{selected.where}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-800/60 rounded-xl p-4">
                <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🔬 Your Body's Role</div>
                <p className="text-gray-300 text-sm leading-relaxed">{selected.bodyRole}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Bender</div>
                <p className="text-amber-100/80 text-sm leading-relaxed">{selected.mindBlow}</p>
              </div>

              {/* Body composition mini bar */}
              <div className="bg-gray-800/60 rounded-xl p-4">
                <div className="text-gray-400 text-xs uppercase font-semibold mb-2">📊 Your Body by Element (% of atoms)</div>
                <div className="space-y-1.5">
                  {ELEMENTS.filter(e => e.percentInBody >= 0.01).sort((a, b) => b.percentInBody - a.percentInBody).map(el => {
                    const c = ORIGIN_CONFIG[el.origin]
                    return (
                      <div key={el.symbol} className="flex items-center gap-2 text-xs">
                        <span className="w-6 font-mono font-bold text-right flex-shrink-0" style={{ color: c.color }}>{el.symbol}</span>
                        <div className="flex-1 h-1.5 bg-gray-900 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.sqrt(el.percentInBody) * 11}%`, background: c.color }} />
                        </div>
                        <span className="text-gray-500 w-12 text-right">{el.percentInBody >= 1 ? el.percentInBody.toFixed(0) : el.percentInBody.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-gray-700 text-[10px] mt-2">Bar widths use √scale for readability</p>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
