import { useState, useEffect } from 'react'

interface Counter {
  id: string
  label: string
  icon: string
  color: string
  perSecond: number
  unit: string
  description: string
  context: string
}

const COUNTERS: Counter[] = [
  {
    id: 'universe_expansion',
    label: 'Universe Expanded',
    icon: '🌌',
    color: '#6366f1',
    perSecond: 73200,
    unit: 'km (between us and any galaxy 1 Mpc away)',
    description: 'Space itself is expanding. Every megaparsec of distance grows by ~73.2 km per second.',
    context: 'The Andromeda Galaxy (2.5M ly) isn\'t moving away — it\'s actually approaching us. But galaxies beyond ~13.5 billion light-years are receding faster than light due to expansion.'
  },
  {
    id: 'stars_born',
    label: 'New Stars Born',
    icon: '⭐',
    color: '#fbbf24',
    perSecond: 0.036,
    unit: 'stars (across all galaxies)',
    description: 'Roughly 3 new stars form every second somewhere in the observable universe.',
    context: 'Star formation rate peaked ~10 billion years ago (cosmic noon) when galaxies were forming fastest. Today\'s rate is ~1/10th of the peak. We\'re in the declining era of star formation.'
  },
  {
    id: 'stars_died',
    label: 'Stars Died',
    icon: '💀',
    color: '#6366f1',
    perSecond: 0.036,
    unit: 'stars (stellar deaths)',
    description: 'Roughly as many stars die as are born — the universe is in rough equilibrium now.',
    context: 'Most stars die quietly as white dwarfs. About 1-3 per century per galaxy die as supernovae — spectacular explosions visible across billions of light-years.'
  },
  {
    id: 'photons_sun',
    label: 'Photons From Our Sun',
    icon: '☀️',
    color: '#f97316',
    perSecond: 3.83e26,
    unit: 'photons emitted by the Sun',
    description: 'The Sun emits 3.83 × 10²⁶ photons every second, equivalent to 3.83 × 10²⁶ watts of power.',
    context: 'Only 1/2,000,000,000 of the Sun\'s light hits Earth. Of that, plants capture about 2%. Of that captured energy, evolution has given us food, weather, and ultimately civilization.'
  },
  {
    id: 'neutrinos',
    label: 'Neutrinos Through You',
    icon: '⚡',
    color: '#22c55e',
    perSecond: 65000000000,
    unit: 'solar neutrinos pass through your thumbnail',
    description: '65 billion solar neutrinos pass through every square centimeter of you every second — day and night, through the entire Earth.',
    context: 'Neutrinos interact so weakly that a neutrino could pass through a light-year of solid lead with only 50% chance of hitting anything. You\'re essentially transparent to them.'
  },
  {
    id: 'hawking_radiation',
    label: 'Photons From Sgr A*',
    icon: '⚫',
    color: '#a855f7',
    perSecond: 1,
    unit: 'Hawking radiation photon (wavelength: 10⁵ km)',
    description: 'Our galaxy\'s supermassive black hole emits ~1 Hawking radiation photon per second at an incredible 1.5 × 10⁻¹⁴ Kelvin.',
    context: 'This is so cold it\'s immeasurable. CMB background (2.7K) is hotter — meaning the black hole actually absorbs more than it emits. It won\'t truly evaporate for 10⁸³ years.'
  },
  {
    id: 'asteroid_hits',
    label: 'Material Hits Earth',
    icon: '☄️',
    color: '#ef4444',
    perSecond: 0.0012,
    unit: 'tonnes of space material (100 tonnes/day)',
    description: 'Earth gains about 100 tonnes of extraterrestrial material per day — mostly micrometeorites and cosmic dust.',
    context: 'Most is invisible microscopic dust. About 5-6 times per year, a car-sized rock hits — usually exploding harmlessly in the atmosphere. A Tunguska-sized impact (200m) happens ~1 per millennium.'
  },
  {
    id: 'earth_orbit',
    label: 'Earth\'s Orbital Speed',
    icon: '🌍',
    color: '#3b82f6',
    perSecond: 29780,
    unit: 'm/s (Earth moves around the Sun)',
    description: 'Earth orbits the Sun at ~29.78 km/s (107,000 km/h). In the time you\'ve been reading this, Earth moved ~300 km around the Sun.',
    context: 'But the Sun itself orbits the Milky Way at 230 km/s. And our galaxy moves through space at ~620 km/s toward the Great Attractor. Total: you\'re moving at ~1,000 km/s through the universe right now.'
  },
]

function Counter({ counter, elapsed }: { counter: Counter; elapsed: number }) {
  const count = counter.perSecond * elapsed
  const formatted = count < 1
    ? count.toFixed(3)
    : count < 1000
    ? count.toFixed(1)
    : count < 1e6
    ? (count / 1000).toFixed(2) + 'K'
    : count < 1e9
    ? (count / 1e6).toFixed(2) + 'M'
    : count < 1e12
    ? (count / 1e9).toFixed(2) + 'B'
    : count.toExponential(2)

  return (
    <div className="rounded-xl p-4 transition-all" style={{ background: counter.color + '10', border: `1px solid ${counter.color}25` }}>
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{counter.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 font-semibold uppercase mb-1">{counter.label}</div>
          <div className="font-bold font-mono text-lg leading-none" style={{ color: counter.color }}>{formatted}</div>
          <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">{counter.unit}</div>
        </div>
      </div>
    </div>
  )
}

export default function CosmicCounters() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [selected, setSelected] = useState<Counter | null>(null)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed(e => e + 0.1), 100)
    return () => clearInterval(id)
  }, [running])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Counters</h2>
      <p className="text-gray-400 text-sm mb-5">Everything happening in the universe right now — live, since you opened this page.</p>

      {/* Timer header */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5 flex items-center justify-between">
        <div>
          <div className="text-gray-500 text-xs font-semibold uppercase">Time Since You Arrived</div>
          <div className="font-mono text-2xl font-bold text-white mt-0.5">{elapsed.toFixed(1)}<span className="text-gray-500 text-sm ml-1">seconds</span></div>
        </div>
        <button
          onClick={() => { if (running) { setRunning(false) } else { setRunning(true); setElapsed(0) } }}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: running ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', color: running ? '#ef4444' : '#22c55e', border: `1px solid ${running ? '#ef4444' : '#22c55e'}40` }}
        >
          {running ? '⏸ Pause' : '▶ Resume'}
        </button>
      </div>

      {/* Counters grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 cursor-pointer">
        {COUNTERS.map(c => (
          <div key={c.id} onClick={() => setSelected(selected?.id === c.id ? null : c)}>
            <Counter counter={c} elapsed={elapsed} />
          </div>
        ))}
      </div>

      {/* Selected detail */}
      {selected && (
        <div className="rounded-xl p-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{selected.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{selected.label}</h3>
              <div className="text-xs font-mono" style={{ color: selected.color }}>{selected.perSecond.toLocaleString()} per second</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{selected.description}</p>
          <div className="rounded-lg p-3 bg-gray-900/50">
            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">🔭 Context</div>
            <p className="text-gray-300 text-sm">{selected.context}</p>
          </div>
        </div>
      )}

      {!selected && (
        <p className="text-gray-600 text-xs text-center">Click any counter to learn more</p>
      )}
    </div>
  )
}
