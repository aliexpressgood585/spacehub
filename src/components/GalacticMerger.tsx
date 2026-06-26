import { useState } from 'react'

interface MergerPhase {
  id: string
  name: string
  icon: string
  color: string
  timeFromNow: string
  timeYears: number
  skyDescription: string
  earthStatus: string
  starCount: string
  nightSky: string
  physics: string
  funFact: string
}

const PHASES: MergerPhase[] = [
  {
    id: 'today',
    name: 'Right Now',
    icon: '🌌',
    color: '#3b82f6',
    timeFromNow: 'Today (2024)',
    timeYears: 0,
    skyDescription: 'Andromeda is already visible to the naked eye as a faint fuzzy patch in dark skies — the most distant object visible without a telescope at 2.537 million light-years.',
    earthStatus: 'Earth is perfectly habitable. The Sun is 4.6B years old — halfway through main sequence.',
    starCount: '200-400 billion stars in Milky Way, ~1 trillion in Andromeda',
    nightSky: 'Andromeda appears as a faint oval smudge. Magnitude 3.4 — barely visible to naked eye.',
    physics: 'Andromeda approaches at 110 km/s. Dark matter halos are already beginning to interact.',
    funFact: 'You can see the future collision RIGHT NOW: Andromeda is the faint oval in Andromeda constellation. Its apparent size is already 6× wider than the Moon — we just can\'t see its dimmer outer regions without binoculars.'
  },
  {
    id: 'first_approach',
    name: 'First Close Pass',
    icon: '🔴',
    color: '#ef4444',
    timeFromNow: 'In ~3.75 billion years',
    timeYears: 3750000000,
    skyDescription: 'Andromeda fills a quarter of the night sky. An enormous band of stars stretches across the heavens, brighter than the Milky Way. New star formation is triggered along the collision edges.',
    earthStatus: 'Sun is 8+ billion years old — entering late main sequence. Earth is becoming inhospitable due to increasing solar luminosity (Sun gets 10% brighter per billion years).',
    starCount: 'Star formation rate spikes 10× as gas clouds collide and compress',
    nightSky: 'Andromeda\'s core blazes as a second "milky way" across the sky. Thousands of star-forming regions light up in blue and pink.',
    physics: 'Dark matter halos interpenetrate — this is the "first pass." Gravity from both galaxies creates tidal tails of stars being flung outward. Few actual star-star collisions occur (space is mostly empty).',
    funFact: 'Stars won\'t actually collide — they\'ll pass through each other like two ghost ships. The nearest star to our Sun is 4 light-years away; a typical galaxy collision is 99.99999% empty space passing through empty space.'
  },
  {
    id: 'separation',
    name: 'Temporary Separation',
    icon: '💫',
    color: '#fbbf24',
    timeFromNow: 'In ~4 billion years',
    timeYears: 4000000000,
    skyDescription: 'After the first pass, the galaxies swing out and away — but gravity pulls them back. Two bright cores visible in the sky, trailing tidal streams of stars between them.',
    earthStatus: 'The Sun may have evolved into a subgiant. Earth\'s oceans may have evaporated. Life would need to have migrated or adapted.',
    starCount: 'Many stars ejected into intergalactic space in long tidal tails',
    nightSky: 'Two galaxy cores visible simultaneously — like two full moons, but as glowing bands. Streams of stars trace arcs between them.',
    physics: 'Gravity causes the galaxies to slow down and reverse — they\'ll pass through again. The Triangulum Galaxy (M33) may join the merger as a third participant.',
    funFact: 'Our solar system will likely be flung to a completely different location in the merged galaxy — perhaps twice as far from the new galactic center. The "night sky" in 4 billion years will look nothing like it does today.'
  },
  {
    id: 'final_merge',
    name: 'Final Merger',
    icon: '🌟',
    color: '#a855f7',
    timeFromNow: 'In ~5-7 billion years',
    timeYears: 6000000000,
    skyDescription: 'After multiple passes, the two galaxies fully merge. A single, giant elliptical galaxy — "Milkomeda" — forms. The sky blazes with billions of new stars triggered by the final merger.',
    earthStatus: 'The Sun is now a red giant, having expanded to 200× its current size. It will have engulfed Mercury, Venus, and possibly Earth. Life on Earth would be extinct.',
    starCount: '~1 trillion stars in the merged elliptical galaxy',
    nightSky: 'The merged galaxy core blazes across the entire sky. An ancient civilization on a surviving planet would see a sky filled with stars — nowhere near as dark as today\'s nights.',
    physics: 'The two supermassive black holes (Sgr A* = 4M solar masses, M31* = ~100M solar masses) spiral together, emitting intense gravitational waves, before merging into a single monstrous black hole ~150M solar masses.',
    funFact: 'When the two supermassive black holes merge, they\'ll emit gravitational waves detectable across the entire universe for billions of years — the loudest event since the Big Bang, and the final act of our galaxy\'s life story.'
  },
]

const formatYears = (y: number) => {
  if (y === 0) return 'Now'
  if (y < 1e9) return `${(y/1e6).toFixed(0)}M years`
  return `${(y/1e9).toFixed(1)}B years`
}

export default function GalacticMerger() {
  const [selected, setSelected] = useState<MergerPhase>(PHASES[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">The Andromeda Collision</h2>
      <p className="text-gray-400 text-sm mb-5">In 3.75 billion years, our galaxy will collide with Andromeda. Here's the full timeline of our cosmic destiny.</p>

      {/* Timeline bar */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Timeline to Merger (billions of years)</div>
        <div className="relative h-2 bg-gray-900 rounded-full mb-1 overflow-hidden">
          <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg, #3b82f6, #ef4444, #fbbf24, #a855f7)' }} />
          {PHASES.map((p) => {
            const pos = (p.timeYears / 7e9) * 100
            return (
              <div
                key={p.id}
                className="absolute top-0 w-2 h-full rounded-full border-2 border-gray-900 cursor-pointer"
                style={{ left: `${pos}%`, transform: 'translateX(-50%)', background: p.color }}
                onClick={() => setSelected(p)}
              />
            )
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>Now</span>
          <span>3.75B yrs</span>
          <span>4B yrs</span>
          <span>6B yrs</span>
        </div>
      </div>

      {/* Phase buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {PHASES.map(p => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className="p-3 rounded-xl text-center transition-all"
            style={{
              background: selected.id === p.id ? p.color + '20' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.id === p.id ? p.color + '60' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-2xl mb-1">{p.icon}</div>
            <div className="text-[10px] font-bold" style={{ color: selected.id === p.id ? p.color : '#9ca3af' }}>{p.name}</div>
            <div className="text-[9px] text-gray-600 mt-0.5">{formatYears(p.timeYears)}</div>
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
              <div className="text-sm" style={{ color: selected.color }}>{selected.timeFromNow}</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{selected.skyDescription}</p>
          <div className="rounded-lg p-3 bg-gray-900/50">
            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">🌍 Earth at This Time</div>
            <p className="text-gray-300 text-sm">{selected.earthStatus}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🔭 Night Sky</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.nightSky}</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">⚛️ Physics</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.physics}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤯 Mind-Bender</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>

      {/* Fast fact bar */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Andromeda Distance', value: '2.537M ly', color: '#3b82f6' },
          { label: 'Approach Speed', value: '110 km/s', color: '#22c55e' },
          { label: 'First Close Pass', value: '3.75B years', color: '#ef4444' },
          { label: 'Final Result', value: '"Milkomeda"', color: '#a855f7' },
        ].map(f => (
          <div key={f.label} className="bg-gray-800/50 rounded-xl p-3 text-center">
            <div className="font-bold text-sm" style={{ color: f.color }}>{f.value}</div>
            <div className="text-gray-500 text-[10px] mt-0.5">{f.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
