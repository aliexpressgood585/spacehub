import { useState } from 'react'

interface World {
  id: string
  name: string
  icon: string
  color: string
  gravity: number   // relative to Earth (g)
  type: 'planet' | 'moon' | 'dwarf' | 'star' | 'neutron'
  description: string
  funFact: string
}

const WORLDS: World[] = [
  { id: 'mercury', name: 'Mercury', icon: '⚫', color: '#9ca3af', gravity: 0.38, type: 'planet',
    description: 'Tiny but dense — stronger gravity than the Moon despite being bigger',
    funFact: 'Mercury\'s weak gravity means you could jump ~2.5 meters high — almost 3× your Earth height.' },
  { id: 'venus', name: 'Venus', icon: '☁️', color: '#fbbf24', gravity: 0.904, type: 'planet',
    description: 'Almost Earth-like gravity, but the atmosphere would kill you first',
    funFact: 'Despite being Earth\'s twin in size, you\'d feel almost the same on Venus — just also be melted by acid and crushed by pressure.' },
  { id: 'earth', name: 'Earth', icon: '🌍', color: '#22c55e', gravity: 1.0, type: 'planet',
    description: 'Your reference point — what you feel every day',
    funFact: 'You weigh slightly less at the equator than at the poles, due to Earth\'s spin and slightly wider shape.' },
  { id: 'moon', name: 'The Moon', icon: '🌕', color: '#94a3b8', gravity: 0.1654, type: 'moon',
    description: 'Apollo astronauts bounced around because of this gravity',
    funFact: 'You could jump 6× higher on the Moon. Apollo astronauts had to learn a special "kangaroo hop" to move efficiently.' },
  { id: 'mars', name: 'Mars', icon: '🔴', color: '#ef4444', gravity: 0.376, type: 'planet',
    description: 'Less than half Earth\'s gravity — muscles would atrophy over months',
    funFact: 'After living on Mars for years, returning to Earth gravity would feel like wearing a 60% weight vest permanently.' },
  { id: 'io', name: 'Io (Jupiter Moon)', icon: '🟡', color: '#fbbf24', gravity: 0.183, type: 'moon',
    description: 'Most volcanically active body in the solar system',
    funFact: 'On Io you\'d weigh less than on the Moon, but the sulfur volcanoes erupting around you would be a bigger concern.' },
  { id: 'europa', name: 'Europa (Jupiter Moon)', icon: '🧊', color: '#06b6d4', gravity: 0.134, type: 'moon',
    description: 'An icy moon with a liquid ocean underneath',
    funFact: 'Europa\'s low gravity means any large underground ocean impact could send debris into space — potentially seeding life across the solar system.' },
  { id: 'jupiter', name: 'Jupiter', icon: '🟠', color: '#f97316', gravity: 2.528, type: 'planet',
    description: 'No solid surface — you\'d fall forever into increasingly dense gas',
    funFact: 'At Jupiter\'s "surface" (1 atm pressure level), a 70 kg person would weigh 177 kg. The wind shear would tear you apart before the pressure did.' },
  { id: 'saturn', name: 'Saturn', icon: '🪐', color: '#fbbf24', gravity: 1.065, type: 'planet',
    description: 'Surprisingly close to Earth gravity despite being a gas giant',
    funFact: 'Saturn\'s gravity at the "cloud tops" is only 6.5% more than Earth\'s. But its density is so low you\'d sink through it like quicksand.' },
  { id: 'uranus', name: 'Uranus', icon: '🔵', color: '#06b6d4', gravity: 0.886, type: 'planet',
    description: 'You\'d weigh slightly less than on Earth — on an ice giant',
    funFact: 'Uranus rotates on its side (98° tilt) — it rolls around the Sun like a ball. At the poles, the Sun is directly overhead for 42 years, then absent for 42 years.' },
  { id: 'neptune', name: 'Neptune', icon: '💙', color: '#3b82f6', gravity: 1.148, type: 'planet',
    description: 'Strongest gravity of the ice giants — slightly more than Earth',
    funFact: 'Neptune\'s winds blow at 2,100 km/h — the fastest in the solar system. You\'d be blown away before the gravity pinned you down.' },
  { id: 'pluto', name: 'Pluto', icon: '🟤', color: '#a78bfa', gravity: 0.063, type: 'dwarf',
    description: 'Tiny world — you\'d weigh less than 1/15th of your Earth weight',
    funFact: 'On Pluto you could jump ~11 meters high — almost 2 stories. Running could feel like slow-motion flying.' },
  { id: 'titan', name: 'Titan (Saturn Moon)', icon: '🟠', color: '#f97316', gravity: 0.138, type: 'moon',
    description: 'Dense atmosphere, low gravity — almost like flying with wings',
    funFact: 'Titan is so low-gravity and dense-atmosphere that humans with arm-mounted wings could actually fly there under their own power. Real engineering proposals exist.' },
  { id: 'sun', name: 'The Sun', icon: '☀️', color: '#fde68a', gravity: 27.9, type: 'star',
    description: 'You\'d be crushed — and vaporized at 5,778°C simultaneously',
    funFact: 'On the Sun\'s surface, a 70 kg person would weigh ~1,950 kg — nearly 2 tonnes. The radiation alone would vaporize any material in microseconds.' },
  { id: 'neutron', name: 'Neutron Star', icon: '💫', color: '#a855f7', gravity: 100000000000.0, type: 'neutron',
    description: 'Surface gravity 200 billion times Earth\'s — the most extreme in the universe',
    funFact: 'On a neutron star, a 1cm drop would release the energy of an atomic bomb. Mountains are microscopically small — the entire surface is smoother than a billiard ball.' },
]

export default function PlanetWeightCalculator() {
  const [weightKg, setWeightKg] = useState(70)
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg')
  const [selected, setSelected] = useState<World>(WORLDS[2])

  const inputKg = unit === 'lbs' ? weightKg / 2.20462 : weightKg
  const weightOnWorld = inputKg * selected.gravity

  const formatWeight = (kg: number): string => {
    if (unit === 'lbs') {
      const lbs = kg * 2.20462
      if (lbs > 1e9) return `${(lbs / 1e9).toExponential(2)} billion lbs`
      if (lbs > 1000) return `${lbs.toLocaleString(undefined, { maximumFractionDigits: 0 })} lbs`
      return `${lbs.toFixed(1)} lbs`
    } else {
      if (kg > 1e9) return `${(kg / 1e9).toExponential(2)} billion kg`
      if (kg > 1000) return `${kg.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg`
      return `${kg.toFixed(1)} kg`
    }
  }

  const jumpHeight = (gravity: number) => {
    const earthJump = 0.5
    const h = earthJump / gravity
    if (h > 1000) return '> 1 km!'
    if (h >= 1) return `${h.toFixed(1)} m`
    return `${(h * 100).toFixed(0)} cm`
  }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Planet Weight Calculator</h2>
      <p className="text-gray-400 text-sm mb-5">How much would YOU weigh on every world in the solar system?</p>

      {/* Weight input */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-gray-400 text-xs uppercase font-semibold block mb-2">Your Weight on Earth</label>
            <input
              type="number"
              value={weightKg}
              onChange={e => setWeightKg(Math.max(1, Math.min(500, Number(e.target.value))))}
              className="w-full bg-gray-900 text-white text-2xl font-bold rounded-lg px-4 py-2 border border-gray-700 focus:border-indigo-500 outline-none"
              min={1} max={500}
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs uppercase font-semibold block mb-2">Unit</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {(['kg', 'lbs'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className="px-4 py-2 text-sm font-bold transition-all"
                  style={{
                    background: unit === u ? '#4f46e5' : 'transparent',
                    color: unit === u ? 'white' : '#6b7280',
                  }}
                >{u}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* World grid */}
        <div className="grid grid-cols-2 gap-1.5 h-fit">
          {WORLDS.map(w => {
            const ww = inputKg * w.gravity
            return (
              <button
                key={w.id}
                onClick={() => setSelected(w)}
                className="p-2.5 rounded-xl transition-all text-center"
                style={{
                  background: selected.id === w.id ? w.color + '20' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${selected.id === w.id ? w.color + '60' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                <div className="text-xl mb-0.5">{w.icon}</div>
                <div className="text-[10px] font-bold leading-tight mb-0.5" style={{ color: selected.id === w.id ? w.color : '#9ca3af' }}>{w.name}</div>
                <div className="text-[10px] font-mono font-black" style={{ color: w.color }}>
                  {ww > 1e9 ? ww.toExponential(1) : ww.toFixed(1)}{unit}
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Big weight display */}
          <div className="rounded-xl p-6 text-center" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="text-5xl mb-2">{selected.icon}</div>
            <h3 className="text-lg font-bold text-white mb-1">{selected.name}</h3>
            <p className="text-gray-500 text-xs mb-4">{selected.description}</p>

            <div className="text-gray-400 text-xs uppercase font-semibold mb-1">Your Weight on {selected.name}</div>
            <div className="font-black mb-1" style={{ fontSize: '3.5rem', lineHeight: 1, color: selected.color }}>
              {formatWeight(weightOnWorld)}
            </div>
            <div className="text-gray-500 text-sm">
              ({selected.gravity}× Earth's gravity)
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: 'Weight on Earth',
                value: formatWeight(inputKg),
                icon: '🌍',
              },
              {
                label: 'Weight on ' + selected.name,
                value: formatWeight(weightOnWorld),
                icon: selected.icon,
              },
              {
                label: 'Jump Height',
                value: selected.type === 'neutron' ? '~0mm' : selected.type === 'star' ? '~0mm' : jumpHeight(selected.gravity),
                icon: '⬆️',
              },
            ].map((s, i) => (
              <div key={i} className="bg-gray-800/60 rounded-xl p-3 text-center">
                <div className="text-lg mb-1">{s.icon}</div>
                <div className="text-lg font-black text-white mb-1">{s.value}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🤔 Did You Know?</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>

          {/* All worlds quick compare */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">All Worlds Comparison</div>
            <div className="space-y-1.5">
              {[...WORLDS].filter(w => w.type !== 'neutron').sort((a, b) => b.gravity - a.gravity).map(w => {
                const ww = inputKg * w.gravity
                const pct = Math.min(100, (w.gravity / 28) * 100)
                return (
                  <div key={w.id} className="flex items-center gap-2 text-xs">
                    <span className="w-4">{w.icon}</span>
                    <span className="w-20 text-gray-500 truncate">{w.name}</span>
                    <div className="flex-1 h-1.5 bg-gray-900 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: w.id === selected.id ? w.color : w.color + '60' }} />
                    </div>
                    <span className="w-16 text-right font-mono font-bold" style={{ color: w.id === selected.id ? w.color : '#6b7280' }}>
                      {ww > 1000 ? (ww / 1000).toFixed(1) + 't' : ww.toFixed(0)}{ww <= 1000 ? unit : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
