import { useState, useMemo } from 'react'

interface StarTarget {
  name: string
  distance_ly: number
  emoji: string
  type: string
  has_planets: boolean
  habitable: boolean
  desc: string
}

const TARGETS: StarTarget[] = [
  { name: 'Proxima Centauri b', distance_ly: 4.24, emoji: '🔴', type: 'Red dwarf (M5Ve)', has_planets: true, habitable: true, desc: 'Nearest known exoplanet, potentially habitable. Tidally locked, frequent flares — habitability uncertain.' },
  { name: 'Alpha Centauri A/B', distance_ly: 4.37, emoji: '⭐', type: 'Binary (G2+K1)', has_planets: false, habitable: false, desc: 'Nearest Sun-like stars. Part of a triple system with Proxima. No confirmed planets yet.' },
  { name: 'Barnard\'s Star', distance_ly: 5.96, emoji: '🔴', type: 'Red dwarf (M4Ve)', has_planets: false, habitable: false, desc: 'Second nearest star system. Fastest moving star (10.3"/yr). Barnard\'s Star b claimed then disputed.' },
  { name: 'TRAPPIST-1', distance_ly: 40.7, emoji: '🌍', type: 'Ultra-cool dwarf (M8V)', has_planets: true, habitable: true, desc: '7 Earth-sized planets, 3 in habitable zone. Prime astrobiology target. All planets tidally locked.' },
  { name: 'Tau Ceti e', distance_ly: 11.9, emoji: '🟡', type: 'G-type (G8.5V)', has_planets: true, habitable: true, desc: 'Sun-like star with 5 planets. Tau Ceti e and f are in the habitable zone, though high debris disk.' },
  { name: 'Gliese 667C', distance_ly: 23.6, emoji: '🔴', type: 'Red dwarf (M1.5V)', has_planets: true, habitable: true, desc: 'Triple star system; Gliese 667C has up to 3 habitable zone planets — unprecedented density.' },
]

const METHODS = [
  {
    name: 'Current Chemical Rocket', speed_c: 0.000047,
    emoji: '🚀', color: '#6b7280', trl: 9, status: 'Current',
    desc: 'Best chemical propulsion (Voyager 1 speed: 17 km/s). At this speed, reaching Alpha Centauri takes 90,000 years.',
  },
  {
    name: 'Nuclear Pulse (Orion)', speed_c: 0.033,
    emoji: '💥', color: '#f97316', trl: 2, status: 'Theoretical',
    desc: 'Project Orion (1958): detonate nuclear bombs behind a pusher plate. Could reach 10% c. Still would take 44+ years. Banned by Nuclear Test Ban Treaty.',
  },
  {
    name: 'Bussard Ramjet', speed_c: 0.5,
    emoji: '🌀', color: '#6366f1', trl: 0, status: 'Speculative',
    desc: 'Hypothetical: a magnetic scoop collects interstellar hydrogen for fusion. Requires collecting H at rates physics may not allow. Widely considered infeasible in original form.',
  },
  {
    name: 'Laser Sail (Breakthrough Starshot)', speed_c: 0.2,
    emoji: '🔆', color: '#fcd34d', trl: 2, status: 'Concept',
    desc: 'Ground-based 100 GW laser array accelerates a gram-scale nanocraft to 20% c. Could reach Proxima in 20 years. Funded by Yuri Milner. Enormous engineering hurdles remain.',
  },
  {
    name: 'Fusion Rocket (Daedalus)', speed_c: 0.12,
    emoji: '⚛️', color: '#10b981', trl: 1, status: 'Design Study',
    desc: 'Project Daedalus (1973): pulsed inertial confinement fusion using helium-3. Could reach Barnard\'s Star in 50 years. Requires mining helium-3 from Jupiter\'s atmosphere.',
  },
  {
    name: 'Alcubierre Warp Drive', speed_c: 1000,
    emoji: '🌌', color: '#c084fc', trl: 0, status: 'Theoretical',
    desc: 'Compresses spacetime in front, expands behind — no local FTL violation. Requires exotic negative-energy matter. Energy requirements are astronomical. May be prohibited by physics.',
  },
]

function formatTime(years: number): string {
  if (years < 0.001) return `${(years * 365.25 * 24).toFixed(1)} hours`
  if (years < 0.1) return `${(years * 365.25).toFixed(1)} days`
  if (years < 2) return `${(years * 12).toFixed(1)} months`
  if (years < 200) return `${years.toFixed(1)} years`
  if (years < 5000) return `${(years / 1000).toFixed(2)} millennia`
  if (years < 1e6) return `${(years / 1000).toFixed(0)}K years`
  if (years < 1e9) return `${(years / 1e6).toFixed(2)}M years`
  return `${(years / 1e9).toFixed(2)}B years`
}

function calcTravelTime(dist_ly: number, speed_c: number): number {
  return dist_ly / Math.min(speed_c, 999)
}

function lorentzFactor(speed_c: number): number {
  if (speed_c >= 1) return Infinity
  return 1 / Math.sqrt(1 - speed_c * speed_c)
}

function shipTime(travelYears: number, speedC: number): string {
  if (speedC >= 1) return 'Instantaneous'
  const gamma = lorentzFactor(speedC)
  const shipYrs = travelYears / gamma
  return formatTime(shipYrs)
}

const PARADOXES = [
  {
    name: 'Twin Paradox', emoji: '👥',
    desc: 'If you travel to Alpha Centauri at 90% c and return, 8.7 years pass on Earth. But on your ship, only 3.8 years pass. You return younger than your twin who stayed home. This is real — confirmed by muon decay experiments and GPS satellites.',
  },
  {
    name: 'Relativistic Doppler', emoji: '📡',
    desc: 'At high speeds, light from stars ahead is blue-shifted (higher energy). Stars behind are red-shifted. The night sky appears distorted. At 90% c, stars ahead appear concentrated into a bright forward arc.',
  },
  {
    name: 'Interstellar Medium', emoji: '💥',
    desc: 'At 20% c (Starshot), a single dust grain (1μg) carries the kinetic energy of a hand grenade. A 1mm rock would be like a nuclear weapon. Shielding against interstellar dust at high speeds is a major unsolved problem.',
  },
  {
    name: 'Communication Delay', emoji: '📻',
    desc: 'Even at the speed of light, a message to Alpha Centauri takes 4.24 years each way. Round-trip conversation: 8.5 years minimum. Real-time communication is impossible. Interstellar civilizations would communicate in "bursts," not conversations.',
  },
  {
    name: 'Energy Required', emoji: '⚡',
    desc: 'Accelerating a 1-ton spacecraft to 10% c requires 4.5 × 10²⁰ joules — comparable to humanity\'s total current annual energy production. Deceleration at destination requires the same energy again. Fuel mass for rocket equation becomes prohibitive.',
  },
]

export default function InterstellarTravel() {
  const [selectedTarget, setSelectedTarget] = useState<StarTarget>(TARGETS[0])
  const [selectedMethod, setSelectedMethod] = useState(METHODS[3])
  const [view, setView] = useState<'journey' | 'paradoxes' | 'targets'>('journey')

  const travelYears = useMemo(() => calcTravelTime(selectedTarget.distance_ly, selectedMethod.speed_c), [selectedTarget, selectedMethod])
  const gamma = lorentzFactor(selectedMethod.speed_c)
  const ageOnArrival = shipTime(travelYears, selectedMethod.speed_c)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🚀</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Interstellar Travel</h2>
          <p className="text-cyan-300 text-sm">The mathematics, physics, and paradoxes of reaching other star systems</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['journey', 'targets', 'paradoxes'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === v ? 'bg-cyan-700 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {v === 'journey' ? '🛸 Journey Calculator' : v === 'targets' ? '⭐ Target Stars' : '⚛️ Physics Paradoxes'}
          </button>
        ))}
      </div>

      {view === 'journey' && (
        <div className="space-y-5">
          {/* Target selector */}
          <div>
            <div className="text-xs text-gray-400 font-semibold mb-2 uppercase">Destination</div>
            <div className="flex flex-wrap gap-2">
              {TARGETS.map(t => (
                <button key={t.name} onClick={() => setSelectedTarget(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${selectedTarget.name === t.name ? 'border-cyan-500 bg-cyan-900/20 text-cyan-300' : 'border-white/10 text-gray-400 hover:border-white/30'}`}>
                  {t.emoji} {t.name.split('(')[0].trim()} ({t.distance_ly} ly)
                </button>
              ))}
            </div>
          </div>

          {/* Method selector */}
          <div>
            <div className="text-xs text-gray-400 font-semibold mb-2 uppercase">Propulsion Method</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {METHODS.map(m => (
                <button key={m.name} onClick={() => setSelectedMethod(m)}
                  className={`px-2.5 py-2 rounded-lg text-xs text-left transition-all border ${selectedMethod.name === m.name ? 'border-white/40 bg-white/10' : 'border-white/5 bg-white/[0.02] hover:border-white/20'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span>{m.emoji}</span>
                    <span style={{ color: m.color }} className="font-semibold">{m.speed_c < 1 ? `${(m.speed_c * 100).toFixed(1)}% c` : `${m.speed_c}× c`}</span>
                  </div>
                  <div className="text-gray-300 font-medium leading-tight">{m.name.split('(')[0].trim()}</div>
                  <div className="text-gray-600 text-[10px]">{m.status}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Result display */}
          <div className="bg-gradient-to-r from-cyan-900/30 to-indigo-900/30 rounded-xl p-5 border border-cyan-500/20">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <div className="text-3xl font-black text-white font-mono">{formatTime(travelYears)}</div>
                <div className="text-xs text-gray-400 mt-0.5">Earth-frame travel time</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-cyan-300 font-mono">{ageOnArrival}</div>
                <div className="text-xs text-gray-400 mt-0.5">Ship-frame (crew age)</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-purple-300 font-mono">
                  {gamma === Infinity ? '∞' : gamma < 1.001 ? '~1.0' : gamma.toFixed(2)}×
                </div>
                <div className="text-xs text-gray-400 mt-0.5">Lorentz factor (γ)</div>
              </div>
            </div>

            <div className="bg-black/20 rounded-lg p-3 text-sm text-gray-300">
              <span className="text-cyan-400 font-semibold">{selectedMethod.emoji} {selectedMethod.name}</span> → {selectedTarget.emoji} {selectedTarget.name} ({selectedTarget.distance_ly} ly away)
              <br /><span className="text-xs text-gray-500 mt-1 block">{selectedMethod.desc}</span>
            </div>
          </div>

          {/* Scale comparison */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 font-semibold mb-3 uppercase">Travel time to Alpha Centauri (4.24 ly) by method</div>
            <div className="space-y-2">
              {METHODS.filter(m => m.speed_c < 1).map(m => {
                const years = 4.24 / m.speed_c
                const logYears = Math.log10(years)
                const logMax = Math.log10(4.24 / METHODS[0].speed_c)
                const logMin = Math.log10(4.24 / METHODS[3].speed_c)
                const pct = Math.max(2, Math.min(100, ((logMax - logYears) / (logMax - logMin)) * 100))
                return (
                  <div key={m.name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-36 text-right flex-shrink-0">{m.name.split('(')[0].trim()}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: m.color }} />
                    </div>
                    <span className="text-xs font-mono text-gray-300 w-24 flex-shrink-0">{formatTime(years)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {view === 'targets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TARGETS.map(t => (
            <div key={t.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{t.emoji}</span>
                <div>
                  <div className="font-bold text-white">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.type}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-mono text-cyan-300 text-sm">{t.distance_ly} ly</div>
                  <div className="text-xs text-gray-600">{(t.distance_ly * 63241).toFixed(0)} AU</div>
                </div>
              </div>
              <p className="text-xs text-gray-300 mb-2">{t.desc}</p>
              <div className="flex gap-2">
                {t.has_planets && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-500/20">Has planets</span>}
                {t.habitable && <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/30 text-green-300 border border-green-500/20">Habitable zone</span>}
              </div>
            </div>
          ))}
          <div className="md:col-span-2 bg-white/5 rounded-xl p-4 border border-white/10 text-xs text-gray-400">
            <span className="text-yellow-300 font-semibold">Light travel time note: </span>
            The nearest star is 4.24 light-years away. Even a signal traveling at the speed of light takes 4.24 years to arrive
            and 4.24 years for a response to return. Any interstellar civilization would communicate across timescales of human generations.
          </div>
        </div>
      )}

      {view === 'paradoxes' && (
        <div className="space-y-4">
          {PARADOXES.map(p => (
            <div key={p.name} className="bg-white/5 rounded-xl p-4 border border-white/10 flex gap-3">
              <span className="text-3xl flex-shrink-0">{p.emoji}</span>
              <div>
                <div className="font-bold text-white mb-1">{p.name}</div>
                <p className="text-sm text-gray-300 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
          <div className="bg-indigo-900/20 rounded-xl p-4 border border-indigo-500/20 text-sm text-indigo-200">
            <span className="font-bold">Bottom line: </span>
            The nearest star is 270,000 AU away. If our Solar System were the size of a US quarter (2.5 cm), Alpha Centauri would be
            4 km away. Interstellar travel isn't just an engineering challenge — it challenges our understanding of what civilization means
            when distances involve human lifetimes.
          </div>
        </div>
      )}
    </div>
  )
}
