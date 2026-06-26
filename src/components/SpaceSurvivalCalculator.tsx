import { useState } from 'react'

interface Environment {
  id: string
  name: string
  icon: string
  color: string
  description: string
  tempC: number
  pressureAtm: number
  radiation: number      // mSv/day
  oxygen: boolean
  vacuum: boolean
  gravity: number        // g
  survivalSeconds: number
  causeOfDeath: string[]
  funFact: string
  difficulty: 'instant' | 'seconds' | 'minutes' | 'hours' | 'possible'
}

const ENVIRONMENTS: Environment[] = [
  {
    id: 'leo',
    name: 'Low Earth Orbit',
    icon: '🛸',
    color: '#3b82f6',
    description: 'Where the ISS lives — 400km above Earth',
    tempC: -270,
    pressureAtm: 0,
    radiation: 0.5,
    oxygen: false,
    vacuum: true,
    gravity: 0.0,
    survivalSeconds: 15,
    causeOfDeath: [
      'Consciousness lost in ~10-15s (hypoxia)',
      'Saliva/tears boil at ~46°C (near-vacuum)',
      'N₂ gas bubbles form in blood (ebullism)',
      'Body freezes on shadow side, burns on sun side',
    ],
    funFact: 'Your blood does NOT boil immediately — your skin holds pressure for ~30 seconds. You\'d pass out from lack of oxygen first.',
    difficulty: 'seconds'
  },
  {
    id: 'moon',
    name: 'Moon Surface',
    icon: '🌕',
    color: '#94a3b8',
    description: 'No atmosphere, extreme temperature swings',
    tempC: 127,
    pressureAtm: 0,
    radiation: 1.37,
    oxygen: false,
    vacuum: true,
    gravity: 0.165,
    survivalSeconds: 12,
    causeOfDeath: [
      'Vacuum exposure identical to space',
      'Day side: +127°C bakes you in seconds',
      'Night side: -173°C freezes tissue rapidly',
      'Radiation 150× higher than on Earth surface',
    ],
    funFact: 'Apollo astronauts who accidentally fogged their visors had to endure direct sunlight on the glass — it melted components. You\'d fare far worse without a suit.',
    difficulty: 'instant'
  },
  {
    id: 'mars',
    name: 'Mars Surface',
    icon: '🔴',
    color: '#ef4444',
    description: 'Thin CO₂ atmosphere, freezing cold',
    tempC: -60,
    pressureAtm: 0.006,
    radiation: 0.64,
    oxygen: false,
    vacuum: false,
    gravity: 0.376,
    survivalSeconds: 30,
    causeOfDeath: [
      'Pressure 0.6% of Earth — effective vacuum',
      'Hypoxia in ~20 seconds (no O₂)',
      '-60°C average (can reach -125°C at poles)',
      'CO₂ atmosphere is toxic',
    ],
    funFact: 'Mars atmosphere is 96% CO₂ at 0.6% Earth pressure. Even if you could breathe CO₂, there\'s barely enough pressure to inhale it.',
    difficulty: 'seconds'
  },
  {
    id: 'venus',
    name: 'Venus Surface',
    icon: '☁️',
    color: '#fbbf24',
    description: 'Crushing pressure, acid clouds, 465°C',
    tempC: 465,
    pressureAtm: 92,
    radiation: 0.002,
    oxygen: false,
    vacuum: false,
    gravity: 0.904,
    survivalSeconds: 1,
    causeOfDeath: [
      '465°C — hotter than a pizza oven at max heat',
      '92× Earth pressure — like being 900m underwater',
      'Sulfuric acid clouds dissolve organic matter',
      'CO₂ atmosphere with no oxygen',
    ],
    funFact: 'Soviet Venera probes survived only 23-127 minutes on the surface before being destroyed. No human engineering could keep you alive there.',
    difficulty: 'instant'
  },
  {
    id: 'europa',
    name: 'Europa (Jupiter Moon)',
    icon: '🌊',
    color: '#06b6d4',
    description: 'Ice surface, intense radiation from Jupiter',
    tempC: -160,
    pressureAtm: 0.000001,
    radiation: 540,
    oxygen: false,
    vacuum: true,
    gravity: 0.134,
    survivalSeconds: 8,
    causeOfDeath: [
      '540 mSv/day — lethal dose in ~1 hour',
      'Effective vacuum (pressure negligible)',
      '-160°C surface temperature',
      'Trapped in Jupiter\'s intense radiation belt',
    ],
    funFact: 'Europa\'s radiation is so intense that any unshielded human would receive a lethal dose in under 1 day. The surface glows blue at night from radiation.',
    difficulty: 'instant'
  },
  {
    id: 'titan',
    name: 'Titan (Saturn Moon)',
    icon: '🟠',
    color: '#f97316',
    description: 'Dense nitrogen atmosphere, methane lakes',
    tempC: -179,
    pressureAtm: 1.5,
    radiation: 0.001,
    oxygen: false,
    vacuum: false,
    gravity: 0.138,
    survivalSeconds: 300,
    causeOfDeath: [
      '-179°C freezes biological tissue in seconds',
      'No oxygen — nitrogen/methane atmosphere',
      'Methane liquid on the surface (not water)',
      'Ethane rain and hydrocarbon smog',
    ],
    funFact: 'Titan has the most breathable pressure of any world other than Earth — 1.5× Earth\'s. But without oxygen, and at -179°C, you wouldn\'t last long. With a heated oxygen mask, you could technically walk around!',
    difficulty: 'minutes'
  },
  {
    id: 'jupiter',
    name: 'Jupiter Atmosphere',
    icon: '🪐',
    color: '#a855f7',
    description: 'Crushing pressure, extreme wind, ammonia',
    tempC: -108,
    pressureAtm: 1.0,
    radiation: 36.0,
    oxygen: false,
    vacuum: false,
    gravity: 2.528,
    survivalSeconds: 5,
    causeOfDeath: [
      '2.5× Earth gravity = immediate muscle/bone failure',
      'No oxygen — H₂/He/CH₄/NH₃ atmosphere',
      'Wind speeds up to 600 km/h',
      'At 1 bar depth: ammonia, water ice clouds, lightning',
    ],
    funFact: 'If you fell into Jupiter, you\'d be torn apart by wind shear long before the pressure crushed you. The "surface" is just an increasingly thick gas until it becomes liquid hydrogen.',
    difficulty: 'instant'
  },
  {
    id: 'mercury',
    name: 'Mercury Surface',
    icon: '⚫',
    color: '#6b7280',
    description: 'Extreme hot/cold swings, solar radiation',
    tempC: 167,
    pressureAtm: 0.0000000001,
    radiation: 2.5,
    oxygen: false,
    vacuum: true,
    gravity: 0.378,
    survivalSeconds: 10,
    causeOfDeath: [
      'Vacuum — identical to open space',
      'Day side: 430°C (hot enough to melt lead)',
      'Night side: -180°C',
      '6× more solar radiation than Earth',
    ],
    funFact: 'Despite being closest to the Sun, Mercury is not the hottest planet. Venus is hotter due to its thick CO₂ blanket. But standing on Mercury\'s dayside? You\'d cook instantly.',
    difficulty: 'instant'
  },
]

function formatTime(seconds: number): string {
  if (seconds < 1) return '<1 second'
  if (seconds < 60) return `${seconds} seconds`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ${seconds % 60 > 0 ? (seconds % 60) + 's' : ''}`
  return `${(seconds / 3600).toFixed(1)} hours`
}

const DIFFICULTY_BADGE: Record<Environment['difficulty'], { label: string; color: string }> = {
  instant: { label: '💀 Instant', color: '#ef4444' },
  seconds: { label: '⚡ Seconds', color: '#f97316' },
  minutes: { label: '⏱ Minutes', color: '#fbbf24' },
  hours: { label: '⌛ Hours', color: '#22c55e' },
  possible: { label: '✅ Possible', color: '#3b82f6' },
}

export default function SpaceSurvivalCalculator() {
  const [selected, setSelected] = useState<Environment>(ENVIRONMENTS[0])
  const [showSteps, setShowSteps] = useState(false)

  const badge = DIFFICULTY_BADGE[selected.difficulty]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Survival Calculator</h2>
      <p className="text-gray-400 text-sm mb-5">How long would you survive unprotected? Pick a world and find out.</p>

      {/* Environment grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {ENVIRONMENTS.map(env => (
          <button
            key={env.id}
            onClick={() => { setSelected(env); setShowSteps(false) }}
            className="p-3 rounded-xl transition-all text-center"
            style={{
              background: selected.id === env.id ? env.color + '20' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.id === env.id ? env.color + '60' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-2xl mb-1">{env.icon}</div>
            <div className="text-xs font-bold leading-tight" style={{ color: selected.id === env.id ? env.color : '#9ca3af' }}>{env.name}</div>
            <div className="mt-1 text-[9px] font-bold px-1 py-0.5 rounded" style={{ color: DIFFICULTY_BADGE[env.difficulty].color }}>
              {DIFFICULTY_BADGE[env.difficulty].label}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Survival time display */}
        <div className="space-y-4">
          <div className="rounded-xl p-6 text-center" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="text-5xl mb-2">{selected.icon}</div>
            <h3 className="text-lg font-bold text-white mb-1">{selected.name}</h3>
            <p className="text-gray-500 text-xs mb-4">{selected.description}</p>
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Survival Time Without Protection</div>
            <div className="font-black text-5xl mb-2" style={{ color: selected.color }}>
              {formatTime(selected.survivalSeconds)}
            </div>
            <span className="inline-block text-xs font-bold px-3 py-1 rounded-full" style={{ background: badge.color + '25', color: badge.color }}>
              {badge.label}
            </span>
          </div>

          {/* Environment stats */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Conditions</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Temperature', value: `${selected.tempC > 0 ? '+' : ''}${selected.tempC}°C`, icon: '🌡️' },
                { label: 'Pressure', value: `${selected.pressureAtm} atm`, icon: '💨' },
                { label: 'Radiation', value: `${selected.radiation} mSv/day`, icon: '☢️' },
                { label: 'Gravity', value: `${selected.gravity}g`, icon: '⬇️' },
                { label: 'Oxygen', value: selected.oxygen ? 'Yes' : 'None', icon: '🫁' },
                { label: 'Vacuum', value: selected.vacuum ? 'Yes' : 'No', icon: '🕳️' },
              ].map(s => (
                <div key={s.label} className="bg-gray-900/50 rounded-lg p-2">
                  <div className="text-[10px] text-gray-500">{s.icon} {s.label}</div>
                  <div className="text-xs font-semibold text-gray-200">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* What kills you */}
        <div className="space-y-4">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <button
              onClick={() => setShowSteps(v => !v)}
              className="w-full flex items-center justify-between text-left mb-2"
            >
              <div className="text-gray-400 text-xs uppercase font-semibold">What Kills You (In Order)</div>
              <span className="text-xs text-indigo-400">{showSteps ? '▲' : '▼'} {showSteps ? 'hide' : 'show'}</span>
            </button>
            <ul className="space-y-2">
              {(showSteps ? selected.causeOfDeath : selected.causeOfDeath.slice(0, 2)).map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="flex-shrink-0 text-red-400 font-bold">{i + 1}.</span>
                  {c}
                </li>
              ))}
              {!showSteps && selected.causeOfDeath.length > 2 && (
                <li className="text-gray-600 text-xs">+ {selected.causeOfDeath.length - 2} more threats...</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🧠 The Reality</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>

          {/* Radiation context */}
          {selected.radiation > 0 && (
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Radiation Context</div>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>🌍 Earth surface</span><span className="text-gray-300">0.0085 mSv/day</span>
                </div>
                <div className="flex justify-between">
                  <span>✈️ Transatlantic flight</span><span className="text-gray-300">0.03 mSv</span>
                </div>
                <div className="flex justify-between">
                  <span>🏥 Lethal dose (humans)</span><span className="text-gray-300">~4,000 mSv</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                  <span style={{ color: selected.color }}>{selected.icon} {selected.name}</span>
                  <span className="font-bold" style={{ color: selected.color }}>{selected.radiation} mSv/day</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-600">
        <span>Survival times are approximate for an average unprotected adult. Actual times vary by physiology.</span>
        <span className="text-gray-500">🚀 SpaceHub</span>
      </div>
    </div>
  )
}
