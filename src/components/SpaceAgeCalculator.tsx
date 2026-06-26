import { useState, useMemo } from 'react'

interface World {
  id: string
  name: string
  icon: string
  color: string
  orbitalPeriodDays: number
  distanceAU: number
  type: 'planet' | 'dwarf' | 'moon'
  funFact: string
}

const WORLDS: World[] = [
  { id: 'mercury', name: 'Mercury', icon: '⚫', color: '#9ca3af', orbitalPeriodDays: 87.97, distanceAU: 0.387,
    type: 'planet', funFact: 'A year on Mercury is shorter than 3 Earth months. You age 4× faster in Mercury years.' },
  { id: 'venus', name: 'Venus', icon: '☁️', color: '#fbbf24', orbitalPeriodDays: 224.7, distanceAU: 0.723,
    type: 'planet', funFact: 'A day on Venus (243 Earth days) is longer than its year (225 days). A day outlasts a year.' },
  { id: 'earth', name: 'Earth', icon: '🌍', color: '#22c55e', orbitalPeriodDays: 365.25, distanceAU: 1.0,
    type: 'planet', funFact: 'Earth\'s year is exactly what you\'re used to. This is your baseline.' },
  { id: 'mars', name: 'Mars', icon: '🔴', color: '#ef4444', orbitalPeriodDays: 686.97, distanceAU: 1.524,
    type: 'planet', funFact: 'A Martian year is about 1.88 Earth years. You\'re roughly half your Earth age on Mars.' },
  { id: 'jupiter', name: 'Jupiter', icon: '🟠', color: '#f97316', orbitalPeriodDays: 4332.59, distanceAU: 5.203,
    type: 'planet', funFact: 'Jupiter orbits the Sun every 11.86 Earth years. Most people are under 5 Jupiter years old.' },
  { id: 'saturn', name: 'Saturn', icon: '🪐', color: '#fbbf24', orbitalPeriodDays: 10759.22, distanceAU: 9.537,
    type: 'planet', funFact: 'Saturn takes 29.5 Earth years to orbit the Sun. Only a handful of people have seen 3 Saturn years.' },
  { id: 'uranus', name: 'Uranus', icon: '🔵', color: '#06b6d4', orbitalPeriodDays: 30688.5, distanceAU: 19.19,
    type: 'planet', funFact: 'Uranus completes one orbit every 84 Earth years. Almost nobody lives to see 2 Uranus years.' },
  { id: 'neptune', name: 'Neptune', icon: '💙', color: '#3b82f6', orbitalPeriodDays: 60182, distanceAU: 30.07,
    type: 'planet', funFact: 'Neptune has only completed one orbit since it was discovered in 1846 (orbit completed 2011).' },
  { id: 'pluto', name: 'Pluto', icon: '🟤', color: '#a78bfa', orbitalPeriodDays: 90560, distanceAU: 39.48,
    type: 'dwarf', funFact: 'Pluto hasn\'t completed even half an orbit since it was discovered in 1930. Its year is 248 Earth years.' },
  { id: 'moon', name: 'Moon (lunar months)', icon: '🌕', color: '#94a3b8', orbitalPeriodDays: 29.53, distanceAU: 0.00257,
    type: 'moon', funFact: 'The Moon orbits Earth every 29.5 days. Your age in lunar months — how many full moons you\'ve seen.' },
]

function getAgeOnWorld(birthDateStr: string, world: World): number {
  const birth = new Date(birthDateStr)
  const now = new Date()
  const diffMs = now.getTime() - birth.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays / world.orbitalPeriodDays
}

function formatAge(age: number): string {
  if (age < 0.1) return `${(age * 365).toFixed(0)} days`
  if (age < 1) return `${age.toFixed(2)} years`
  if (age >= 100) return `${age.toFixed(1)} years`
  return `${age.toFixed(2)} years`
}

function getAgeEmoji(age: number): string {
  if (age < 1) return '👶'
  if (age < 5) return '🧒'
  if (age < 13) return '👦'
  if (age < 18) return '🧑'
  if (age < 30) return '👱'
  if (age < 50) return '🧔'
  if (age < 70) return '👴'
  return '🧓'
}

function getLifeStage(age: number): string {
  if (age < 1) return 'Newborn'
  if (age < 3) return 'Toddler'
  if (age < 12) return 'Child'
  if (age < 18) return 'Teenager'
  if (age < 30) return 'Young Adult'
  if (age < 60) return 'Adult'
  if (age < 80) return 'Senior'
  return 'Elder'
}

export default function SpaceAgeCalculator() {
  const [birthDate, setBirthDate] = useState('1990-01-01')
  const [selected, setSelected] = useState<World>(WORLDS[3])

  const maxDate = new Date().toISOString().split('T')[0]

  const ages = useMemo(() =>
    WORLDS.map(w => ({ world: w, age: getAgeOnWorld(birthDate, w) })),
    [birthDate]
  )

  const selectedAge = ages.find(a => a.world.id === selected.id)!.age
  const earthAge = ages.find(a => a.world.id === 'earth')!.age

  const nextBirthday = useMemo(() => {
    const fractional = selectedAge % 1
    const daysUntil = (1 - fractional) * selected.orbitalPeriodDays
    if (daysUntil < 1) return 'Today!'
    if (daysUntil < 30) return `${Math.round(daysUntil)} days`
    if (daysUntil < 365) return `${Math.round(daysUntil / 30)} months`
    return `${(daysUntil / 365).toFixed(1)} years`
  }, [selectedAge, selected])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Age Calculator</h2>
      <p className="text-gray-400 text-sm mb-5">How old are you on other planets? Enter your birthday to find out.</p>

      {/* Birthday input */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-5">
        <label className="text-gray-400 text-xs uppercase font-semibold block mb-2">Your Birthday</label>
        <input
          type="date"
          value={birthDate}
          max={maxDate}
          onChange={e => setBirthDate(e.target.value)}
          className="bg-gray-900 text-white text-xl font-bold rounded-lg px-4 py-2.5 border border-gray-700 focus:border-indigo-500 outline-none w-full sm:w-auto"
        />
        <div className="text-gray-500 text-xs mt-2">
          Earth age: <span className="text-white font-bold">{earthAge.toFixed(1)} years</span> {getAgeEmoji(earthAge)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* World list with ages */}
        <div className="space-y-1.5">
          {ages.map(({ world, age }) => (
            <button
              key={world.id}
              onClick={() => setSelected(world)}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: selected.id === world.id ? world.color + '20' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === world.id ? world.color + '60' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{world.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: selected.id === world.id ? world.color : '#e2e8f0' }}>{world.name}</div>
                  <div className="text-[10px] text-gray-600">{world.orbitalPeriodDays.toFixed(0)} Earth days / year</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black font-mono" style={{ color: world.color }}>{formatAge(age)}</div>
                  <div className="text-[9px] text-gray-600">{getAgeEmoji(age)} {getLifeStage(age)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Big age display */}
          <div className="rounded-xl p-6 text-center" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="text-5xl mb-2">{selected.icon}</div>
            <h3 className="text-lg font-bold text-white mb-1">You on {selected.name}</h3>
            <div className="font-black mb-2" style={{ fontSize: '4rem', lineHeight: 1, color: selected.color }}>
              {selectedAge.toFixed(2)}
            </div>
            <div className="text-xl text-gray-300 font-semibold mb-3">{selected.name} years old</div>
            <div className="text-3xl mb-2">{getAgeEmoji(selectedAge)}</div>
            <div className="text-gray-400 text-sm">{getLifeStage(selectedAge)} on {selected.name}</div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-gray-500 text-xs uppercase mb-1">Next Birthday On {selected.name}</div>
              <div className="text-xl font-black text-white">{nextBirthday}</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-gray-500 text-xs uppercase mb-1">Year Length</div>
              <div className="text-xl font-black text-white">{selected.orbitalPeriodDays.toFixed(0)} days</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-gray-500 text-xs uppercase mb-1">Earth Age</div>
              <div className="text-xl font-black text-white">{earthAge.toFixed(1)} yrs</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-gray-500 text-xs uppercase mb-1">vs Earth Age</div>
              <div className="text-xl font-black" style={{ color: selected.color }}>
                {selectedAge > earthAge ? `${(selectedAge / earthAge).toFixed(1)}×` : `÷${(earthAge / selectedAge).toFixed(1)}`}
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🌍 Did You Know?</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>

          {/* All ages quick bar */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">All Your Ages</div>
            <div className="space-y-1.5">
              {ages.filter(a => a.world.id !== 'moon').map(({ world, age }) => (
                <div key={world.id} className="flex items-center gap-2 text-xs">
                  <span className="w-4">{world.icon}</span>
                  <span className="w-16 text-gray-500">{world.name}</span>
                  <div className="flex-1 h-1.5 bg-gray-900 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, (age / (earthAge * 5)) * 100)}%`,
                      background: world.id === selected.id ? world.color : world.color + '60'
                    }} />
                  </div>
                  <span className="w-20 text-right font-mono font-bold" style={{ color: world.id === selected.id ? world.color : '#6b7280' }}>
                    {formatAge(age)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
