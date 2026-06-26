import { useState } from 'react'

interface Era {
  id: string
  name: string
  icon: string
  color: string
  timeStart: string
  timeStartLog: number
  timeEnd: string
  description: string
  events: string[]
  status: 'past' | 'now' | 'near' | 'far' | 'extreme' | 'final'
  humanRelevance: string
  funFact: string
}

const ERAS: Era[] = [
  {
    id: 'stelliferous',
    name: 'Stelliferous Era',
    icon: '⭐',
    color: '#fbbf24',
    timeStart: 'Now',
    timeStartLog: 10,
    timeEnd: '~100 trillion years',
    description: 'The age of stars. The universe is still forming new stars, planets exist, life is possible. We live in a brief golden window of cosmic history.',
    events: [
      'Our Sun dies in ~5 billion years, engulfing Earth',
      'Milky Way and Andromeda merge in ~4.5 billion years → "Milkomeda"',
      'Last red dwarf stars die after ~100 trillion years',
      'No more star formation — the universe goes dark',
    ],
    status: 'now',
    humanRelevance: 'We live in this era. The universe is warm, lit, and hospitable. This is the cosmic golden age — and it\'s nearly halfway over.',
    funFact: 'The Stelliferous Era will last 100 trillion years. Yet the universe is only 13.8 billion years old. We are watching sunrise, not sunset — stars have barely begun.'
  },
  {
    id: 'degenerate',
    name: 'Degenerate Era',
    icon: '☄️',
    color: '#6366f1',
    timeStart: '~10¹⁴ years',
    timeStartLog: 14,
    timeEnd: '~10⁴⁰ years',
    description: 'Stars are dead. The universe is populated by white dwarfs, neutron stars, and black holes slowly cooling in the dark. No new energy, no new light.',
    events: [
      'White dwarfs slowly cool to black dwarfs (> 10¹⁵ years)',
      'Brown dwarfs slowly fuse hydrogen at ultra-low rates',
      'Planets and rocks slowly evaporate via quantum tunneling',
      'Protons may decay (if proton lifetime ~10³⁶ years)',
    ],
    status: 'far',
    humanRelevance: 'Utterly uninhabitable. No liquid water possible. Only compact objects remain. Any life would need to extract energy from quantum processes.',
    funFact: 'Black dwarf stars — fully cooled white dwarfs — haven\'t formed yet. The universe is too young. The first ones won\'t exist for longer than the current age of the universe, multiplied many times over.'
  },
  {
    id: 'black_hole',
    name: 'Black Hole Era',
    icon: '⚫',
    color: '#a855f7',
    timeStart: '~10⁴⁰ years',
    timeStartLog: 40,
    timeEnd: '~10¹⁰⁰ years',
    description: 'Only black holes remain. All ordinary matter has decayed or been consumed. Black holes slowly evaporate via Hawking radiation over immense timescales.',
    events: [
      'Stellar-mass black holes evaporate in ~10⁶⁷ years',
      'Supermassive black holes (like Sgr A*) evaporate in ~10⁸³ years',
      'TON 618-mass black holes persist to ~10¹⁰⁰ years',
      'Final flash of Hawking radiation as the last black hole explodes',
    ],
    status: 'extreme',
    humanRelevance: 'The last black hole evaporation will release more energy in its final second than it radiated in billions of years. A brief, brilliant flash — then nothing.',
    funFact: 'Hawking radiation from Sgr A* (4 million solar masses) has a temperature of 0.00000000001527 Kelvin — colder than the CMB. Black holes can\'t even radiate right now; they\'re colder than their cosmic background.'
  },
  {
    id: 'dark',
    name: 'Dark Era',
    icon: '🌑',
    color: '#374151',
    timeStart: '> 10¹⁰⁰ years',
    timeStartLog: 100,
    timeEnd: '∞ (or Big Rip/Bounce)',
    description: 'The universe reaches maximum entropy — heat death. All energy is uniformly distributed. No more thermodynamic work is possible. Time becomes meaningless.',
    events: [
      'Quantum fluctuations create random Boltzmann Brains',
      'Poincaré recurrence: universe may fluctuate back to low-entropy state',
      'Possible Big Rip if dark energy strengthens',
      'Possible new Big Bang — quantum vacuum decay creates new universe',
    ],
    status: 'final',
    humanRelevance: 'Pure philosophical territory. Physics as we know it may break down. The concept of "time" loses meaning when nothing changes.',
    funFact: 'A "Boltzmann Brain" — a conscious mind spontaneously assembled by quantum fluctuations — is more likely to appear in the Dark Era than a full ordered universe. Some physicists think this is a problem with our cosmological models.'
  },
]

const STATUS_STYLES: Record<Era['status'], { bg: string; badge: string; badgeColor: string }> = {
  past:    { bg: 'rgba(107,114,128,0.08)', badge: 'Past', badgeColor: '#6b7280' },
  now:     { bg: 'rgba(251,191,36,0.08)',  badge: '← You Are Here', badgeColor: '#fbbf24' },
  near:    { bg: 'rgba(99,102,241,0.08)',  badge: 'Near Future', badgeColor: '#a5b4fc' },
  far:     { bg: 'rgba(99,102,241,0.08)',  badge: 'Distant Future', badgeColor: '#6366f1' },
  extreme: { bg: 'rgba(168,85,247,0.08)', badge: 'Incomprehensible Future', badgeColor: '#a855f7' },
  final:   { bg: 'rgba(17,24,39,0.5)',    badge: 'End of Everything', badgeColor: '#374151' },
}

const MIN_LOG = 9
const MAX_LOG = 105

export default function FutureOfUniverse() {
  const [selected, setSelected] = useState<Era>(ERAS[0])

  const s = STATUS_STYLES[selected.status]
  const nowMarker = ((10 - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 100

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Future of the Universe</h2>
      <p className="text-gray-400 text-sm mb-5">From now until the last black hole evaporates — the complete timeline of cosmic fate. All timescales are in powers of 10.</p>

      {/* Logarithmic timeline */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Cosmic Timeline (log scale — each step is 10× longer)</div>
        <div className="relative h-3 rounded-full mb-2 overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)' }}>
          {/* Era segments */}
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((14-MIN_LOG)/(MAX_LOG-MIN_LOG))*100}%`, background: 'linear-gradient(90deg, #fbbf24, #f97316)' }} />
          <div className="absolute inset-y-0" style={{ left: `${((14-MIN_LOG)/(MAX_LOG-MIN_LOG))*100}%`, width: `${((40-14)/(MAX_LOG-MIN_LOG))*100}%`, background: '#6366f1' }} />
          <div className="absolute inset-y-0" style={{ left: `${((40-MIN_LOG)/(MAX_LOG-MIN_LOG))*100}%`, width: `${((100-40)/(MAX_LOG-MIN_LOG))*100}%`, background: '#a855f7' }} />
          <div className="absolute inset-y-0" style={{ left: `${((100-MIN_LOG)/(MAX_LOG-MIN_LOG))*100}%`, right: 0, background: '#1f2937' }} />
          {/* "Now" marker */}
          <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${nowMarker}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mb-3">
          <span>10¹⁰ yrs (Now)</span>
          <span>10¹⁴ yrs</span>
          <span>10⁴⁰ yrs</span>
          <span>10¹⁰⁰ yrs</span>
        </div>

        {/* Era selector buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ERAS.map((era) => {
            const ss = STATUS_STYLES[era.status]
            return (
              <button
                key={era.id}
                onClick={() => setSelected(era)}
                className="p-2.5 rounded-xl text-center transition-all"
                style={{
                  background: selected.id === era.id ? era.color + '22' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${selected.id === era.id ? era.color + '60' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div className="text-2xl mb-1">{era.icon}</div>
                <div className="text-[10px] font-bold leading-tight" style={{ color: selected.id === era.id ? era.color : '#9ca3af' }}>{era.name}</div>
                <div className="text-[9px] mt-0.5 font-bold" style={{ color: ss.badgeColor }}>{ss.badge}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected era detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl p-5" style={{ background: s.bg, border: `1px solid ${selected.color}30` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{selected.icon}</span>
            <div>
              <h3 className="text-xl font-bold text-white">{selected.name}</h3>
              <div className="text-xs text-gray-500">Starts: <span style={{ color: selected.color }}>{selected.timeStart}</span> → Ends: {selected.timeEnd}</div>
              <div className="text-[10px] mt-0.5 font-bold px-2 py-0.5 rounded-full inline-block" style={{ color: s.badgeColor, background: s.badgeColor + '18' }}>{s.badge}</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{selected.description}</p>
          <div className="rounded-lg p-3 bg-gray-900/50">
            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">🧬 For Life</div>
            <p className="text-gray-300 text-sm">{selected.humanRelevance}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">📋 Key Events in This Era</div>
            <ul className="space-y-1.5">
              {selected.events.map((ev, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span style={{ color: selected.color }} className="mt-0.5 flex-shrink-0">▸</span>
                  {ev}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Bender</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>

      {/* Scale comparison */}
      <div className="mt-4 bg-gray-800/40 rounded-xl p-4">
        <div className="text-gray-500 text-xs uppercase font-semibold mb-2">⏱️ How Long Is This?</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            { label: 'Age of Universe', value: '13.8 billion years', color: '#22c55e' },
            { label: 'Last Star Dies', value: '~100 trillion years (10¹⁴)', color: '#fbbf24' },
            { label: 'Last Black Hole', value: '~10¹⁰⁰ years', color: '#a855f7' },
            { label: 'Universe age vs. Black Hole era', value: '= 1 second in 10⁸² years', color: '#ef4444' },
          ].map(item => (
            <div key={item.label} className="bg-gray-900/50 rounded-lg p-3">
              <div style={{ color: item.color }} className="font-bold text-sm mb-1">{item.value}</div>
              <div className="text-gray-500">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
