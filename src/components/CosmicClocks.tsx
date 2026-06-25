import { useState, useEffect } from 'react'

interface Clock {
  id: string
  label: string
  icon: string
  color: string
  description: string
  type: 'since' | 'until'
  baseYears: number
  unit: 'years' | 'seconds' | 'lightdays'
  detail: string
}

const CLOCKS: Clock[] = [
  {
    id: 'universe',
    label: 'Age of the Universe',
    icon: '🌌',
    color: '#8b5cf6',
    type: 'since',
    baseYears: 13_800_000_000,
    unit: 'years',
    description: 'Time since the Big Bang',
    detail: 'The universe began 13.8 billion years ago in the Big Bang. Every second, it gets 1 second older, continues expanding, and grows more structured.'
  },
  {
    id: 'firststar',
    label: 'Since First Stars Ignited',
    icon: '⭐',
    color: '#fbbf24',
    type: 'since',
    baseYears: 13_600_000_000,
    unit: 'years',
    description: 'Population III stars, ~200 Myr after Big Bang',
    detail: 'The first stars — massive Pop III stars made of pure hydrogen and helium — ignited about 200 million years after the Big Bang, ending the Cosmic Dark Ages.'
  },
  {
    id: 'milkyway',
    label: 'Age of the Milky Way',
    icon: '🌀',
    color: '#a855f7',
    type: 'since',
    baseYears: 13_600_000_000,
    unit: 'years',
    description: 'Our galaxy began forming 13.6 billion years ago',
    detail: 'The Milky Way started forming ~200 million years after the Big Bang. Its oldest stars date to 13.5–13.6 billion years — nearly as old as the universe itself.'
  },
  {
    id: 'sun',
    label: 'Age of Our Sun',
    icon: '☀️',
    color: '#f97316',
    type: 'since',
    baseYears: 4_600_000_000,
    unit: 'years',
    description: 'Our star formed 4.6 billion years ago',
    detail: 'The Sun formed from a collapsing molecular cloud 4.603 billion years ago. It has been fusing 620 million tons of hydrogen per second ever since.'
  },
  {
    id: 'earth',
    label: 'Age of Earth',
    icon: '🌍',
    color: '#22c55e',
    type: 'since',
    baseYears: 4_540_000_000,
    unit: 'years',
    description: 'Earth formed 4.54 billion years ago',
    detail: 'Earth accreted from the solar nebula ~4.54 billion years ago. Within 100 million years, it had a magma ocean, an early atmosphere, and the Moon formed from a giant impact.'
  },
  {
    id: 'life',
    label: 'Age of Life on Earth',
    icon: '🦠',
    color: '#06b6d4',
    type: 'since',
    baseYears: 3_800_000_000,
    unit: 'years',
    description: 'First single-celled life ~3.8 billion years ago',
    detail: 'The oldest known microfossils date to 3.5 billion years ago (Apex Chert, Australia). Chemical signatures (carbon isotopes) suggest life existed as early as 3.8 billion years ago.'
  },
  {
    id: 'multicellular',
    label: 'Since Multicellular Life',
    icon: '🧬',
    color: '#10b981',
    type: 'since',
    baseYears: 600_000_000,
    unit: 'years',
    description: 'Complex life began ~600 million years ago',
    detail: 'The Cambrian Explosion (~540 Mya) saw an unprecedented diversification of complex multicellular life. Before that, the Ediacaran fauna (~600 Mya) were the first large multicellular organisms.'
  },
  {
    id: 'humans',
    label: 'Since Anatomically Modern Humans',
    icon: '🧠',
    color: '#ef4444',
    type: 'since',
    baseYears: 300_000,
    unit: 'years',
    description: 'Homo sapiens appeared ~300,000 years ago',
    detail: 'The oldest Homo sapiens fossils date to ~315,000 years ago (Jebel Irhoud, Morocco). Agriculture began ~10,000 years ago; recorded history ~5,000 years ago.'
  },
  {
    id: 'spacerage',
    label: 'Space Age',
    icon: '🚀',
    color: '#3b82f6',
    type: 'since',
    baseYears: 67,
    unit: 'years',
    description: 'Sputnik launched October 4, 1957',
    detail: 'Humanity has been a spacefaring civilization since October 4, 1957 — just 67 years. In that time we\'ve walked on the Moon, landed rovers on Mars, and sent probes beyond the solar system.'
  },
  {
    id: 'sun_death',
    label: 'Until Sun Becomes Red Giant',
    icon: '🔴',
    color: '#ef4444',
    type: 'until',
    baseYears: 5_000_000_000,
    unit: 'years',
    description: 'In 5 billion years, the Sun will expand and likely engulf Earth',
    detail: 'In ~5 billion years, the Sun will exhaust its hydrogen fuel and expand into a red giant, growing to ~250× its current diameter. Earth\'s oceans will boil in ~1 billion years (as the Sun brightens).'
  },
  {
    id: 'andromeda',
    label: 'Until Andromeda Collision',
    icon: '🌌',
    color: '#a855f7',
    type: 'until',
    baseYears: 4_500_000_000,
    unit: 'years',
    description: 'The Milky Way and Andromeda will merge',
    detail: 'Andromeda is approaching at ~110 km/s and will collide with the Milky Way in ~4.5 billion years. The galaxies will merge over 2+ billion years into a new elliptical galaxy ("Milkdromeda").'
  },
  {
    id: 'last_star',
    label: 'Until Last Star Dies',
    icon: '💀',
    color: '#475569',
    type: 'until',
    baseYears: 100_000_000_000_000,
    unit: 'years',
    description: 'The last red dwarf star will burn out in ~100 trillion years',
    detail: 'Red dwarf stars (like Proxima Centauri) burn for trillions of years. The last stars will burn out in ~10¹³–10¹⁴ years. After that: the Degenerate Era, then Black Hole Era, then Heat Death.'
  },
]

function formatDuration(years: number): string {
  if (years >= 1_000_000_000) return `${(years / 1e9).toFixed(3)} billion years`
  if (years >= 1_000_000) return `${(years / 1e6).toFixed(3)} million years`
  if (years >= 1_000) return `${(years / 1e3).toFixed(2)} thousand years`
  return `${Math.round(years).toLocaleString()} years`
}

function LiveClockCard({ clock, nowYears }: { clock: Clock; nowYears: number }) {
  const elapsed = clock.type === 'since'
    ? nowYears - (nowYears - clock.baseYears)
    : clock.baseYears

  const secondsPerYear = 31_557_600
  const ageInSeconds = elapsed * secondsPerYear

  const progress = clock.type === 'since'
    ? Math.min((elapsed / 13_800_000_000) * 100, 100)
    : Math.max(0, 100 - (elapsed / 100_000_000_000_000) * 100)

  return (
    <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{clock.icon}</span>
        <div className="flex-1">
          <div className="text-white text-sm font-semibold">{clock.label}</div>
          <div className="text-gray-500 text-xs">{clock.description}</div>
        </div>
        <div className="text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{
            background: clock.type === 'since' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: clock.type === 'since' ? '#86efac' : '#fca5a5',
            border: `1px solid ${clock.type === 'since' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          {clock.type === 'since' ? 'AGO' : 'FUTURE'}
        </div>
      </div>

      <div className="font-mono text-lg font-bold mb-2" style={{ color: clock.color }}>
        {formatDuration(elapsed)}
      </div>

      {clock.type === 'since' && elapsed < 1e12 && (
        <div className="text-gray-500 text-xs font-mono mb-2">
          ≈ {(ageInSeconds).toExponential(3)} seconds
        </div>
      )}

      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
        <div className="h-1.5 rounded-full" style={{ width: `${Math.max(1, progress)}%`, background: clock.color, opacity: 0.8 }} />
      </div>

      <p className="text-gray-500 text-xs leading-relaxed">{clock.detail}</p>
    </div>
  )
}

export default function CosmicClocks() {
  const [nowYears] = useState(13_800_000_000)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const sincePast = CLOCKS.filter(c => c.type === 'since')
  const untilFuture = CLOCKS.filter(c => c.type === 'until')

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Clocks</h2>
      <p className="text-gray-400 text-sm mb-5">Time at every scale — from the birth of the universe to humanity's first rocket, and forward to the death of the last star</p>

      {/* Universal "now" indicator */}
      <div className="bg-indigo-900/20 rounded-xl p-4 mb-5 border border-indigo-800/30">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⏱️</span>
          <div>
            <div className="text-indigo-300 text-sm font-semibold">Universe Age Right Now</div>
            <div className="text-white font-mono text-xl font-bold">13,800,000,000 years + {tick.toLocaleString()} seconds</div>
            <div className="text-gray-400 text-xs mt-0.5">Since the Big Bang • Counting every second you're on this page</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-gray-400 text-xs uppercase font-semibold mb-3 flex items-center gap-2">
            <span className="text-green-400">↑</span> Time Since...
          </div>
          <div className="space-y-3">
            {sincePast.map(clock => (
              <LiveClockCard key={clock.id} clock={clock} nowYears={nowYears} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-gray-400 text-xs uppercase font-semibold mb-3 flex items-center gap-2">
            <span className="text-red-400">↓</span> Time Until...
          </div>
          <div className="space-y-3">
            {untilFuture.map(clock => (
              <LiveClockCard key={clock.id} clock={clock} nowYears={nowYears} />
            ))}
          </div>
        </div>
      </div>

      {/* Perspective box */}
      <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Perspective</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Age of Universe', value: '13.8B yr', sub: '100%' },
            { label: 'Age of Earth', value: '4.54B yr', sub: '33% of universe' },
            { label: 'Human civilization', value: '5,000 yr', sub: '0.000036% of universe' },
            { label: 'Space Age', value: '67 yr', sub: '0.00000049%' },
          ].map(item => (
            <div key={item.label} className="bg-gray-900/60 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">{item.label}</div>
              <div className="text-white text-sm font-bold">{item.value}</div>
              <div className="text-gray-600 text-xs">{item.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
