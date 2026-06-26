import { useState } from 'react'

interface Step {
  id: string
  title: string
  icon: string
  color: string
  probability: string
  probabilityNum: number
  explanation: string
  context: string
  alternative: string
}

const STEPS: Step[] = [
  {
    id: 'universe',
    title: 'A Universe Capable of Life',
    icon: '🌌',
    color: '#6366f1',
    probability: '~1 in ???',
    probabilityNum: 1e-120,
    explanation: 'The physical constants of our universe (gravitational constant, fine structure constant, proton-electron mass ratio, etc.) must fall within absurdly narrow ranges for stars, atoms, and chemistry to exist at all.',
    context: 'If the strong nuclear force were 2% weaker, hydrogen wouldn\'t fuse and stars couldn\'t exist. If the cosmological constant were 10⁻¹²⁰ times larger (it\'s already mysteriously small), galaxies couldn\'t form. The odds of these constants being "just right" is essentially incalculable.',
    alternative: 'Most possible universes would be dark, structureless seas of radiation — or would collapse immediately, or fly apart instantly. Ours is extraordinarily improbable.'
  },
  {
    id: 'galaxy',
    title: 'The Right Galaxy',
    icon: '🌀',
    color: '#3b82f6',
    probability: '~1 in 200 billion',
    probabilityNum: 5e-12,
    explanation: 'There are ~200 billion galaxies in the observable universe. Your ancestors needed to be in a spiral galaxy (not too dense, not too sparse), away from the dangerous galactic center.',
    context: 'Most galaxies are elliptical — not suitable for stable planetary orbits. Dwarf irregular galaxies lack heavy elements. Very dense galaxies have too many supernovae and black holes. The Milky Way is in the sweet spot.',
    alternative: 'Born in an elliptical galaxy: no solar systems. In the galactic center: lethal radiation. In a dwarf galaxy: insufficient heavy elements for rocky planets or DNA.'
  },
  {
    id: 'star',
    title: 'A Long-Lived Star',
    icon: '☀️',
    color: '#fbbf24',
    probability: '~1 in 20',
    probabilityNum: 0.05,
    explanation: 'Stars more massive than 1.5 solar masses burn too quickly (millions of years — not enough time for complex life). Red dwarfs may have habitable zone issues. The Sun is in a rare "Goldilocks" mass range.',
    context: 'Red dwarfs (75% of all stars) have violent flares that may strip atmospheres. Massive stars live only millions of years — not enough for evolution. Only stars like our Sun give 5-10 billion years of stable energy.',
    alternative: 'Around a red dwarf: likely tidally locked and radiation-blasted. Around a hot blue star: only 10 million years of life before it explodes as a supernova.'
  },
  {
    id: 'planet',
    title: 'An Earthlike Planet',
    icon: '🌍',
    color: '#22c55e',
    probability: '~1 in 10',
    probabilityNum: 0.1,
    explanation: 'The planet needs to be in the habitable zone, roughly Earth-mass (for plate tectonics), with a large moon (for stable axial tilt), and a Jupiter-like shield (to deflect asteroids). Earth hit all these.',
    context: 'Kepler data suggests ~10-20% of Sun-like stars have Earth-sized planets in the habitable zone. But having a large moon + Jupiter shield is rarer. The Moon formed from an improbably precise giant impact.',
    alternative: 'Without the Moon: axial tilt oscillates wildly, causing extreme climate swings. Without Jupiter: 1,000× more asteroid impacts. Either would likely prevent complex life.'
  },
  {
    id: 'life',
    title: 'Life Arising',
    icon: '🧬',
    color: '#10b981',
    probability: 'Unknown (possibly rare)',
    probabilityNum: 0.01,
    explanation: 'The probability of life arising from chemistry is unknown — the hardest question in all of science. Earth has life, but we\'ve only studied one sample.',
    context: 'The RNA world hypothesis requires improbably complex self-replicating molecules to arise. Some argue life is nearly inevitable given right conditions; others argue it\'s a one-in-a-universe miracle. We genuinely don\'t know.',
    alternative: 'If abiogenesis is rare (1 in 10^40 attempts), Earth may be the only life-bearing planet in the observable universe. If it\'s common (1 in 10), the galaxy is full of life.'
  },
  {
    id: 'intelligence',
    title: 'Complex Intelligence',
    icon: '🧠',
    color: '#a855f7',
    probability: '~1 in 10⁹ life-years',
    probabilityNum: 1e-9,
    explanation: 'Life on Earth existed for ~3.5 billion years before complex, conscious, technologically-capable life (us) appeared. It required the Cambrian explosion, 5 mass extinctions, and mammals surviving the asteroid that killed dinosaurs.',
    context: 'The Permian extinction (252M years ago) killed 96% of all species. The Cretaceous-Paleogene impact (66M years ago) wiped out dinosaurs — letting small mammals evolve into primates. Each was a razor\'s edge.',
    alternative: 'If the Chicxulub asteroid missed: dinosaurs might dominate for another 100 million years. No primate evolution, no Homo sapiens. Or life stays microbial forever, as it was for 3 billion years on Earth.'
  },
  {
    id: 'you',
    title: 'Specifically You',
    icon: '🧑',
    color: '#f97316',
    probability: '~1 in 10²,685,000',
    probabilityNum: 1e-400,
    explanation: 'For you specifically to exist: every one of your ancestors back to the origin of sexual reproduction (600M years) must have survived, found a mate, and produced offspring. One different ancestor = different genetic line = you don\'t exist.',
    context: 'Dr. Ali Binazir calculated the odds of your specific parents meeting, mating, and the exact sperm reaching the exact egg: about 1 in 10^2,685,000. That\'s a number with over 2 million digits. The observable universe has fewer atoms (10^80).',
    alternative: 'Every war that killed an ancestor, every famine survived, every disease recovered from — all required to happen exactly as they did. Change one: different you, or no you.'
  },
]

export default function CosmicOdds() {
  const [activeStep, setActiveStep] = useState<number>(0)
  const step = STEPS[activeStep]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">The Odds of You</h2>
      <p className="text-gray-400 text-sm mb-5">The improbable chain of cosmic events that had to happen exactly right for you to exist right now, reading this.</p>

      {/* Chain visualization */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">The Chain of Improbability</div>
        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => setActiveStep(i)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-all border-2 flex-shrink-0"
                style={{
                  background: activeStep === i ? s.color + '30' : 'rgba(15,23,42,0.7)',
                  borderColor: activeStep === i ? s.color : 'rgba(255,255,255,0.08)',
                }}
              >{s.icon}</button>
              {i < STEPS.length - 1 && (
                <div className="text-gray-700 text-xs">×</div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="text-gray-500 text-xs">Combined odds of your existence:</div>
          <div className="text-xs font-bold" style={{ color: '#ef4444' }}>Essentially 0 — yet here you are</div>
        </div>
      </div>

      {/* Active step */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl p-5" style={{ background: step.color + '12', border: `1px solid ${step.color}35` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{step.icon}</span>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Step {activeStep + 1} of {STEPS.length}</div>
              <h3 className="text-xl font-bold text-white">{step.title}</h3>
              <div className="text-sm font-mono mt-0.5" style={{ color: step.color }}>Probability: {step.probability}</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{step.explanation}</p>
          <div className="rounded-lg p-3 bg-gray-900/50">
            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">📊 Context</div>
            <p className="text-gray-300 text-sm">{step.context}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-red-400 text-xs uppercase font-semibold mb-2">🌀 The Alternative</div>
            <p className="text-gray-300 text-sm leading-relaxed">{step.alternative}</p>
          </div>

          {/* Navigation */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
              disabled={activeStep === 0}
              className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-30 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >← Previous Step</button>
            <button
              onClick={() => setActiveStep(Math.min(STEPS.length - 1, activeStep + 1))}
              disabled={activeStep === STEPS.length - 1}
              className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-30 transition-all"
              style={{ background: step.color + '25', color: step.color }}
            >Next Step →</button>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1.5 justify-center">
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => setActiveStep(i)} className="w-2 h-2 rounded-full transition-all"
                style={{ background: i === activeStep ? s.color : 'rgba(255,255,255,0.12)' }} />
            ))}
          </div>

          {activeStep === STEPS.length - 1 && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 The Conclusion</div>
              <p className="text-amber-100/80 text-sm leading-relaxed">
                The probability of your existence is so small that it can't be meaningfully written as a number. Yet here you are, a collection of stardust that somehow became aware of its own improbability. That's not a small thing. That's possibly the most remarkable thing in the observable universe.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
