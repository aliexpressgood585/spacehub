import { useState } from 'react'

interface PropSystem {
  name: string
  emoji: string
  type: string
  trl: number
  isp: string
  thrust: string
  power: string
  exhaust_velocity: string
  travel_to_mars: string
  era: 'heritage' | 'current' | 'near' | 'far' | 'theoretical'
  color: string
  desc: string
  used_by: string[]
  pros: string[]
  cons: string[]
}

const SYSTEMS: PropSystem[] = [
  {
    name: 'Chemical (LOX/LH2)',
    emoji: '🔥', type: 'Chemical', trl: 9, era: 'heritage', color: '#ef4444',
    isp: '450 s', thrust: 'Very High', power: 'None (fuel energy)',
    exhaust_velocity: '4.4 km/s',
    travel_to_mars: '7-9 months',
    desc: 'Burns liquid oxygen and liquid hydrogen to produce water vapor at extreme temperatures. The highest performance chemical propellant. Powers the Space Shuttle Main Engine (SSME/RS-25) and upper stages.',
    used_by: ['Space Shuttle', 'SLS', 'Delta IV Heavy', 'Saturn V S-IVB'],
    pros: ['Highest ISP of any chemical rocket', 'Well understood', 'Relatively safe'],
    cons: ['Hydrogen is hard to store (cryogenic)', 'Low energy density by volume', 'Still far from interplanetary ideal'],
  },
  {
    name: 'Chemical (LOX/Kerosene)',
    emoji: '⛽', type: 'Chemical', trl: 9, era: 'current', color: '#f97316',
    isp: '350 s', thrust: 'Extremely High', power: 'None (fuel energy)',
    exhaust_velocity: '3.5 km/s',
    travel_to_mars: '7-9 months',
    desc: 'Burns kerosene (RP-1) with liquid oxygen. Lower ISP than LH2 but much higher density and simpler to handle. Powers most first stages and the iconic Russian RD-180/RD-170 engines.',
    used_by: ['Falcon 9', 'Starship (Raptor)', 'Atlas V', 'Soyuz', 'Saturn V F-1'],
    pros: ['High thrust-to-weight', 'Dense fuel (small tanks)', 'Proven reliability'],
    cons: ['Lower ISP than LH2', 'Carbon deposits on reuse', 'Limited specific impulse ceiling'],
  },
  {
    name: 'Solid Rocket Booster',
    emoji: '🚀', type: 'Chemical', trl: 9, era: 'heritage', color: '#fbbf24',
    isp: '280 s', thrust: 'Extremely High', power: 'None',
    exhaust_velocity: '2.8 km/s',
    travel_to_mars: 'Booster only',
    desc: 'Pre-mixed solid fuel and oxidizer. Once ignited, cannot be throttled or shut down. Used for high-thrust launch boost phases, military missiles, and kick stages.',
    used_by: ['Space Shuttle SRBs', 'SLS SRBs', 'Ariane 5/6', 'Minuteman III'],
    pros: ['Extremely high thrust', 'Long shelf life', 'Simple (no cryogenics)', 'Instant ignition'],
    cons: ['Cannot throttle/stop', 'Lowest ISP of any type', 'Single use (mostly)', 'Toxic exhaust'],
  },
  {
    name: 'Ion Drive (Hall Effect)',
    emoji: '⚡', type: 'Electric', trl: 9, era: 'current', color: '#60a5fa',
    isp: '1,600-3,000 s', thrust: 'Very Low', power: '1-20 kW',
    exhaust_velocity: '15-30 km/s',
    travel_to_mars: '4-5 years (continuous burn)',
    desc: 'Ionizes xenon gas with electricity and accelerates ions electromagnetically. Incredibly fuel-efficient — a little propellant goes a very long way. Used on deep-space probes and commercial satellites.',
    used_by: ['Dawn (asteroid mission)', 'Hayabusa', 'Boeing 702SP satellites', 'Starlink'],
    pros: ['10× better ISP than chemical', 'Very fuel efficient', 'Long operational life'],
    cons: ['Tiny thrust (mN range)', 'Needs large solar panels or nuclear power', 'Very slow acceleration'],
  },
  {
    name: 'Ion Drive (VASIMR)',
    emoji: '🌀', type: 'Electric Plasma', trl: 5, era: 'near', color: '#38bdf8',
    isp: '3,000-30,000 s', thrust: 'Low-Medium', power: '200 kW+',
    exhaust_velocity: '30-300 km/s',
    travel_to_mars: '39-90 days (high power)',
    desc: 'Variable Specific Impulse Magnetoplasma Rocket (VASIMR) heats plasma using radio waves and accelerates it with a magnetic nozzle. Can vary ISP vs thrust tradeoff. Could potentially enable 39-day Mars transits with nuclear power.',
    used_by: ['Ad Astra Rocket Company (testing)', 'Proposed ISS reboost'],
    pros: ['Variable ISP/thrust tradeoff', 'Much higher ISP than ion drives', 'Faster Mars transit possible'],
    cons: ['Requires massive power (MW scale)', 'TRL still not flight ready', 'Very complex plasma physics'],
  },
  {
    name: 'Nuclear Thermal Rocket',
    emoji: '☢️', type: 'Nuclear', trl: 6, era: 'near', color: '#a78bfa',
    isp: '800-1,000 s', thrust: 'High', power: 'Nuclear fission core',
    exhaust_velocity: '8-10 km/s',
    travel_to_mars: '3-4 months',
    desc: 'A nuclear reactor heats liquid hydrogen to extreme temperatures, which expands through a nozzle. Twice the ISP of the best chemical rockets. NERVA program proved it in 1960s. NASA and DARPA are actively developing it (DRACO program).',
    used_by: ['NERVA (tested 1960s)', 'DRACO program (NASA/DARPA 2024+)', 'Soviet RD-0410'],
    pros: ['2× ISP of chemical', 'High thrust unlike ion drives', 'No propellant combustion needed'],
    cons: ['Nuclear fuel handling challenges', 'Political and regulatory hurdles', 'Shielding mass overhead'],
  },
  {
    name: 'Nuclear Pulse (Orion)',
    emoji: '💥', type: 'Nuclear Pulse', trl: 2, era: 'far', color: '#f59e0b',
    isp: '6,000-100,000 s', thrust: 'Enormous', power: 'Nuclear bombs',
    exhaust_velocity: '60-1000 km/s',
    travel_to_mars: '2-4 weeks',
    desc: 'Project Orion (1958-1965): detonate nuclear bombs behind a massive pusher plate. Shockingly high ISP. Could carry thousands of tons to Mars in weeks. Freeman Dyson calculated it was theoretically feasible. Banned by the Nuclear Test Ban Treaty of 1963.',
    used_by: ['Project Orion (studied 1958-65)', 'Daedalus (design study)'],
    pros: ['Enormous payload capacity', 'Very fast interplanetary transit', 'Scales to interstellar probe'],
    cons: ['Nuclear detonations in space (illegal)', 'Political impossibility', 'Fallout on launch'],
  },
  {
    name: 'Solar Sail',
    emoji: '⛵', type: 'Photon', trl: 7, era: 'current', color: '#fde68a',
    isp: '∞ (no propellant)', thrust: 'Extremely Low', power: 'Sunlight',
    exhaust_velocity: 'c (photon momentum)',
    travel_to_mars: '1-3 years',
    desc: 'Uses radiation pressure from sunlight (or a laser) to propel a large, thin reflective sail. No propellant — accelerates indefinitely as long as light is available. IKAROS (JAXA 2010) and LightSail-2 (Planetary Society 2019) demonstrated it works.',
    used_by: ['IKAROS (JAXA 2010)', 'LightSail-2 (2019)', 'Near Earth Asteroid Scout'],
    pros: ['Zero propellant — unlimited ΔV', 'Laser-driven version could reach 20% c', 'Cheap propulsion for small probes'],
    cons: ['Extremely low thrust', 'Works best near star', 'Huge sail area required', 'Fragile structure'],
  },
  {
    name: 'Laser Sail (Starshot)',
    emoji: '🔆', type: 'Directed Energy', trl: 2, era: 'far', color: '#fcd34d',
    isp: '∞', thrust: 'Low but intense', power: 'Ground-based GW laser',
    exhaust_velocity: 'c',
    travel_to_mars: 'Hours (outer system in days)',
    desc: 'Breakthrough Starshot concept: a ground-based gigawatt laser array accelerates a gram-scale "nanocraft" to 20% the speed of light. Could reach Alpha Centauri in 20 years. Enormous engineering challenges remain, but physics checks out.',
    used_by: ['Breakthrough Starshot (concept stage)'],
    pros: ['Could reach another star system', '20% speed of light achievable', 'No onboard power needed'],
    cons: ['Enormous laser (100 GW+)', 'Communications take 4 years', 'Nanosized spacecraft only', 'No deceleration at destination'],
  },
  {
    name: 'Alcubierre Warp Drive',
    emoji: '🌌', type: 'Theoretical', trl: 0, era: 'theoretical', color: '#c084fc',
    isp: 'N/A', thrust: 'N/A', power: 'Exotic matter (negative energy)',
    exhaust_velocity: '> c (spacetime compression)',
    travel_to_mars: 'Minutes',
    desc: 'A theoretical spacetime metric (1994) that would compress space in front and expand it behind a "warp bubble" — the ship itself stays still while spacetime moves around it. Not violating relativity, but requires exotic matter with negative energy density — nothing known to exist. May be prohibited by quantum effects.',
    used_by: ['Science fiction', 'Theoretical physics papers'],
    pros: ['Could enable FTL travel', 'Doesn\'t violate special relativity locally', 'Active research area'],
    cons: ['Requires exotic negative energy (hypothetical)', 'Energy requirements = mass of Jupiter', 'No known mechanism', 'Causality violations?'],
  },
]

const ERA_LABELS: Record<string, string> = {
  heritage: 'Heritage', current: 'Current', near: 'Near Future (2030s)', far: 'Far Future', theoretical: 'Theoretical',
}
const ERA_COLORS: Record<string, string> = {
  heritage: '#6b7280', current: '#22d3ee', near: '#34d399', far: '#a78bfa', theoretical: '#f0abfc',
}

const TRL_LABELS: Record<number, string> = {
  0: 'Concept only', 1: 'Principle observed', 2: 'Concept formulated', 3: 'Proof of concept',
  4: 'Lab validation', 5: 'Relevant environment', 6: 'Demonstration', 7: 'Prototype flight',
  8: 'System complete', 9: 'Flight proven',
}

export default function SpacePropulsion() {
  const [selected, setSelected] = useState<PropSystem>(SYSTEMS[3])
  const [filterEra, setFilterEra] = useState<string>('all')

  const filtered = filterEra === 'all' ? SYSTEMS : SYSTEMS.filter(s => s.era === filterEra)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🚀</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Propulsion Technologies</h2>
          <p className="text-orange-300 text-sm">From chemical rockets to warp drives — every propulsion method ever proposed</p>
        </div>
      </div>

      {/* Era filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setFilterEra('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterEra === 'all' ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
          All
        </button>
        {Object.entries(ERA_LABELS).map(([era, label]) => (
          <button key={era} onClick={() => setFilterEra(era)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterEra === era ? 'text-white' : 'text-gray-400 hover:text-white'}`}
            style={{ background: filterEra === era ? ERA_COLORS[era] + '40' : 'rgba(255,255,255,0.03)', border: `1px solid ${ERA_COLORS[era]}40` }}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* System list */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {filtered.map(sys => (
            <button
              key={sys.name}
              onClick={() => setSelected(sys)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-3 ${selected.name === sys.name ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}
            >
              <span className="text-xl">{sys.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{sys.name}</div>
                <div className="text-xs text-gray-500">{sys.type}</div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-12 bg-white/10 rounded-full h-1 mb-0.5">
                  <div className="h-1 rounded-full" style={{ width: `${sys.trl * 11.1}%`, backgroundColor: sys.color }} />
                </div>
                <div className="text-[10px] text-gray-600 text-right">TRL {sys.trl}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white/5 rounded-xl p-5 border border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">{selected.emoji}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: ERA_COLORS[selected.era] + '30', color: ERA_COLORS[selected.era], border: `1px solid ${ERA_COLORS[selected.era]}40` }}>
                    {ERA_LABELS[selected.era]}
                  </span>
                  <span className="text-xs text-gray-500">TRL {selected.trl}/9 — {TRL_LABELS[selected.trl]}</span>
                </div>
              </div>
            </div>

            {/* TRL bar */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500 w-10">TRL</span>
              <div className="flex-1 flex gap-0.5">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="flex-1 h-2 rounded-sm"
                    style={{ backgroundColor: i < selected.trl ? selected.color : 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
              <span className="text-xs font-mono text-white">{selected.trl}/9</span>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed mb-4">{selected.desc}</p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: 'Specific Impulse', value: selected.isp },
                { label: 'Exhaust Velocity', value: selected.exhaust_velocity },
                { label: 'Thrust Level', value: selected.thrust },
                { label: 'Mars Transit Time', value: selected.travel_to_mars },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/5 rounded-lg p-2.5">
                  <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                  <div className="text-sm font-mono text-white font-bold">{value}</div>
                </div>
              ))}
            </div>

            {selected.used_by.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1.5">Used by / Examples</div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.used_by.map(u => (
                    <span key={u} className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">{u}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-green-400 font-semibold mb-1.5">Advantages</div>
                <ul className="space-y-1">
                  {selected.pros.map(p => (
                    <li key={p} className="text-xs text-gray-300 flex gap-1.5"><span className="text-green-400">+</span>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs text-red-400 font-semibold mb-1.5">Limitations</div>
                <ul className="space-y-1">
                  {selected.cons.map(c => (
                    <li key={c} className="text-xs text-gray-300 flex gap-1.5"><span className="text-red-400">−</span>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ISP comparison */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs text-gray-400 font-semibold mb-3">ISP Comparison (higher = more fuel efficient)</div>
            <div className="space-y-1.5">
              {[
                { name: 'Solid Rocket', isp: 280, color: '#fbbf24' },
                { name: 'Chemical LOX/Kerosene', isp: 350, color: '#f97316' },
                { name: 'Chemical LOX/LH2', isp: 450, color: '#ef4444' },
                { name: 'Nuclear Thermal', isp: 900, color: '#a78bfa' },
                { name: 'Ion (Hall Effect)', isp: 2000, color: '#60a5fa' },
                { name: 'VASIMR', isp: 10000, color: '#38bdf8' },
                { name: 'Nuclear Pulse', isp: 30000, color: '#fcd34d' },
              ].map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-36 text-right">{item.name}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${(Math.log10(item.isp) / Math.log10(30000)) * 100}%`, backgroundColor: item.color }} />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-14 text-right">{item.isp.toLocaleString()} s</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
