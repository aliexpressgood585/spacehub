import { useState, useMemo } from 'react'

interface DrakeParam {
  key: string
  symbol: string
  name: string
  desc: string
  min: number
  max: number
  step: number
  pessimistic: number
  optimistic: number
  drake: number
  unit: string
}

const PARAMS: DrakeParam[] = [
  {
    key: 'R', symbol: 'R★', name: 'Star Formation Rate',
    desc: 'Average rate at which new stars are formed in the Milky Way per year',
    min: 0.5, max: 20, step: 0.5, pessimistic: 1, optimistic: 10, drake: 7,
    unit: 'stars/yr',
  },
  {
    key: 'fp', symbol: 'fₚ', name: 'Fraction with Planets',
    desc: 'Fraction of those stars that have planetary systems',
    min: 0.01, max: 1, step: 0.01, pessimistic: 0.2, optimistic: 1.0, drake: 0.5,
    unit: 'fraction',
  },
  {
    key: 'ne', symbol: 'nₑ', name: 'Habitable Planets per System',
    desc: 'Average number of planets that could support life per solar system',
    min: 0, max: 5, step: 0.1, pessimistic: 0.2, optimistic: 2.0, drake: 2,
    unit: 'planets',
  },
  {
    key: 'fl', symbol: 'fₗ', name: 'Fraction Where Life Emerges',
    desc: 'Fraction of those planets where life actually appears',
    min: 0.000001, max: 1, step: 0.001, pessimistic: 0.001, optimistic: 1.0, drake: 1,
    unit: 'fraction',
  },
  {
    key: 'fi', symbol: 'fᵢ', name: 'Fraction with Intelligence',
    desc: 'Fraction of life that develops intelligent, communicating civilizations',
    min: 0.000001, max: 1, step: 0.001, pessimistic: 0.001, optimistic: 0.5, drake: 0.01,
    unit: 'fraction',
  },
  {
    key: 'fc', symbol: 'f꜀ ', name: 'Fraction that Communicate',
    desc: 'Fraction of civilizations that develop technology detectable from space',
    min: 0.000001, max: 1, step: 0.001, pessimistic: 0.01, optimistic: 0.5, drake: 0.01,
    unit: 'fraction',
  },
  {
    key: 'L', symbol: 'L', name: 'Civilization Lifespan',
    desc: 'How long a civilization releases detectable signals (years)',
    min: 100, max: 1e9, step: 100, pessimistic: 100, optimistic: 1e9, drake: 10000,
    unit: 'years',
  },
]

const PRESETS = [
  { label: 'Drake Original (1961)', values: { R: 7, fp: 0.5, ne: 2, fl: 1, fi: 0.01, fc: 0.01, L: 10000 } },
  { label: 'Pessimistic (Rare Earth)', values: { R: 3, fp: 0.4, ne: 0.2, fl: 0.001, fi: 0.001, fc: 0.01, L: 100 } },
  { label: 'Optimistic (Life is Common)', values: { R: 10, fp: 1.0, ne: 2.0, fl: 1.0, fi: 0.5, fc: 0.5, L: 1e9 } },
  { label: 'Modern Estimates (2023)', values: { R: 1.5, fp: 1.0, ne: 0.4, fl: 0.1, fi: 0.01, fc: 0.1, L: 1000 } },
]

function formatN(n: number): string {
  if (n < 0.0001) return n.toExponential(2)
  if (n < 1) return n.toFixed(4)
  if (n < 1000) return n.toFixed(1)
  if (n < 1e6) return `${(n / 1e3).toFixed(1)}K`
  if (n < 1e9) return `${(n / 1e6).toFixed(2)}M`
  if (n < 1e12) return `${(n / 1e9).toFixed(2)}B`
  return n.toExponential(2)
}

const FERMI_SOLUTIONS = [
  { name: 'The Great Filter', emoji: '🚧', desc: 'A near-universal extinction or barrier most civilizations never pass. It may be behind us (life starting) or ahead of us (nuclear war, AI, climate collapse). If ahead — terrifying.' },
  { name: 'They\'re Too Far Away', emoji: '📡', desc: 'The universe is so vast that signals take millions of years. Civilizations bloom and die before their signals arrive. We\'ve only searched for ~80 years at radio frequencies.' },
  { name: 'Zoo Hypothesis', emoji: '🦁', desc: 'Advanced civilizations deliberately avoid contact — watching us develop like a nature preserve. We\'re being "quarantined" until we reach some cosmic maturity threshold.' },
  { name: 'They\'re Already Here', emoji: '👽', desc: 'ETI is present but unrecognized — perhaps as probes, signals we haven\'t decoded, or in forms we can\'t conceptualize. We may be failing to recognize the signatures.' },
  { name: 'We Are First', emoji: '🌱', desc: 'Intelligent life is extremely rare and we are among the first civilizations in the galaxy. The universe is young. Complex life may be an extraordinarily recent phenomenon.' },
  { name: 'Dark Forest Theory', emoji: '🌑', desc: 'The galaxy is a dark forest where all civilizations hide to avoid being detected and destroyed by others. Broadcasting existence is suicidal — silence is survival.' },
  { name: 'Transcension Hypothesis', emoji: '🧠', desc: 'Advanced civilizations turn inward — into miniaturization, virtual realities, and inner space — rather than expanding outward. They leave no detectable radio signatures.' },
]

export default function DrakeEquation() {
  const [values, setValues] = useState<Record<string, number>>({
    R: 7, fp: 0.5, ne: 2, fl: 1, fi: 0.01, fc: 0.01, L: 10000,
  })
  const [tab, setTab] = useState<'calculator' | 'fermi'>('calculator')

  const N = useMemo(() => {
    return Object.values(values).reduce((acc, v) => acc * v, 1)
  }, [values])

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setValues(preset.values)
  }

  const getInterpretation = (n: number) => {
    if (n < 0.001) return { text: 'We are almost certainly alone in the observable universe', color: '#94a3b8' }
    if (n < 0.1) return { text: 'Intelligent civilizations are exceedingly rare — we may be one of very few', color: '#60a5fa' }
    if (n < 1) return { text: 'Less than 1 civilization expected — Earth may be unique in the galaxy right now', color: '#6366f1' }
    if (n < 10) return { text: 'A few civilizations may exist in our galaxy but contact is unlikely', color: '#a78bfa' }
    if (n < 1000) return { text: 'Dozens of civilizations could be out there — contact is plausible but difficult', color: '#34d399' }
    if (n < 1e6) return { text: 'Many thousands of civilizations may be active — why haven\'t we heard from them?', color: '#fbbf24' }
    return { text: 'The galaxy should be teeming with life — the Fermi Paradox is profound!', color: '#f87171' }
  }

  const interp = getInterpretation(N)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🔭</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Drake Equation & Fermi Paradox</h2>
          <p className="text-indigo-300 text-sm">How many communicating civilizations exist in the Milky Way right now?</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['calculator', 'fermi'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {t === 'calculator' ? '🧮 Calculator' : '🌌 Fermi Paradox'}
          </button>
        ))}
      </div>

      {tab === 'calculator' && (
        <>
          {/* Equation display */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-6 text-center overflow-x-auto">
            <div className="font-mono text-sm text-gray-400 whitespace-nowrap">
              N = R★ × fₚ × nₑ × fₗ × fᵢ × f꜀ × L
            </div>
            <div className="mt-2 text-3xl font-black font-mono" style={{ color: interp.color }}>
              N = {formatN(N)}
            </div>
            <div className="text-sm text-gray-300 mt-1">{interp.text}</div>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2 mb-5">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:border-indigo-500/40 transition-all">
                {p.label}
              </button>
            ))}
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            {PARAMS.map(param => (
              <div key={param.key} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-indigo-300 font-bold">{param.symbol}</span>
                      <span className="text-sm font-semibold text-white">{param.name}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{param.desc}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-white font-bold">{formatN(values[param.key])}</div>
                    <div className="text-xs text-gray-600">{param.unit}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-12 text-right">{formatN(param.min)}</span>
                  <input
                    type="range"
                    min={Math.log10(Math.max(param.min, 1e-10))}
                    max={Math.log10(Math.max(param.max, 1))}
                    step={0.01}
                    value={Math.log10(Math.max(values[param.key], 1e-10))}
                    onChange={e => setValues(v => ({ ...v, [param.key]: Math.pow(10, parseFloat(e.target.value)) }))}
                    className="flex-1 accent-indigo-500"
                  />
                  <span className="text-xs text-gray-600 w-12">{formatN(param.max)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <button onClick={() => setValues(v => ({ ...v, [param.key]: param.pessimistic }))}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors">← pessimistic</button>
                  <button onClick={() => setValues(v => ({ ...v, [param.key]: param.drake }))}
                    className="text-xs text-gray-500 hover:text-indigo-400 transition-colors">Drake</button>
                  <button onClick={() => setValues(v => ({ ...v, [param.key]: param.optimistic }))}
                    className="text-xs text-gray-500 hover:text-green-400 transition-colors">optimistic →</button>
                </div>
              </div>
            ))}
          </div>

          {/* Result breakdown */}
          <div className="mt-5 bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 font-semibold mb-3 uppercase">Running Product</div>
            <div className="space-y-1 font-mono text-xs">
              {PARAMS.map((param, i) => {
                const runningProduct = PARAMS.slice(0, i + 1).reduce((acc, p) => acc * values[p.key], 1)
                return (
                  <div key={param.key} className="flex justify-between items-center gap-2">
                    <span className="text-gray-400">{PARAMS.slice(0, i + 1).map(p => p.symbol).join(' × ')}</span>
                    <span className="text-white">{formatN(runningProduct)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'fermi' && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl p-4 border border-indigo-500/20 mb-2">
            <div className="text-white font-bold mb-1">The Fermi Paradox</div>
            <p className="text-sm text-gray-300 leading-relaxed">
              If intelligent life is common in the universe, where is everybody? Enrico Fermi first asked this in 1950.
              Even at sub-light speeds, a civilization could colonize the entire Milky Way in ~10 million years
              — a cosmic eye-blink in a 13.8-billion-year-old galaxy. The silence is deafening.
            </p>
          </div>
          {FERMI_SOLUTIONS.map(sol => (
            <div key={sol.name} className="bg-white/5 rounded-xl p-4 border border-white/10 flex gap-3">
              <span className="text-3xl flex-shrink-0">{sol.emoji}</span>
              <div>
                <div className="font-bold text-white mb-1">{sol.name}</div>
                <div className="text-sm text-gray-300 leading-relaxed">{sol.desc}</div>
              </div>
            </div>
          ))}
          <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-500/20 text-sm text-yellow-200">
            <span className="font-bold">Key insight: </span>
            The Drake Equation doesn't actually predict N precisely — it organizes our ignorance.
            Most parameters are uncertain by many orders of magnitude. The equation is most valuable
            as a framework for discussion, not as a calculation.
          </div>
        </div>
      )}
    </div>
  )
}
