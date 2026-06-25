import { useState, useRef, useEffect } from 'react'

interface DebrisShell {
  altitudeKm: number
  label: string
  objectCount: number
  risk: 'critical' | 'high' | 'moderate' | 'low'
  color: string
  dominantType: string
  notes: string
}

interface CollisionEvent {
  year: number
  name: string
  type: string
  debrisAdded: number
  altitude: number
  description: string
  impact: string
}

interface MitigationMethod {
  name: string
  emoji: string
  status: 'operational' | 'tested' | 'proposed' | 'concept'
  description: string
  examples: string[]
}

const DEBRIS_SHELLS: DebrisShell[] = [
  { altitudeKm: 400, label: 'LEO Core (ISS Zone)', objectCount: 22000, risk: 'critical', color: '#EF4444', dominantType: 'Rocket bodies & fragmentation', notes: 'ISS performs ~3 debris avoidance maneuvers/year. Chinese ASAT test (2007) added ~3,500 objects here.' },
  { altitudeKm: 550, label: 'Starlink Belt', objectCount: 7000, risk: 'high', color: '#F97316', dominantType: 'Active satellites + fragments', notes: 'SpaceX Starlink constellation operates here. Conjunction warnings issued daily.' },
  { altitudeKm: 800, label: 'Sun-sync Orbit', objectCount: 15000, risk: 'critical', color: '#EF4444', dominantType: 'Defunct military satellites', notes: 'Densest debris region. Iridium 33/Cosmos 2251 collision (2009) added ~2,000 objects.' },
  { altitudeKm: 1200, label: 'Upper LEO', objectCount: 8000, risk: 'high', color: '#F97316', dominantType: 'Navigation & earth obs sats', notes: 'Long debris lifetime — fragments persist for centuries.' },
  { altitudeKm: 20200, label: 'MEO (GPS)', objectCount: 300, risk: 'moderate', color: '#EAB308', dominantType: 'Navigation satellites', notes: 'GPS, GLONASS, Galileo operate here. Debris lifetime: thousands of years.' },
  { altitudeKm: 35786, label: 'GEO Belt', objectCount: 900, risk: 'moderate', color: '#EAB308', dominantType: 'Communication satellites', notes: 'Highly valuable real estate. Defunct sats moved to graveyard orbits +300 km above.' },
  { altitudeKm: 36100, label: 'Graveyard Orbit', objectCount: 400, risk: 'low', color: '#22C55E', dominantType: 'Retired GEO satellites', notes: 'Retirement orbits for old GEO sats. Not truly stable — drift over centuries.' },
]

const COLLISION_EVENTS: CollisionEvent[] = [
  { year: 1996, name: 'Cerise & Ariane Debris', type: 'First satellite collision', debrisAdded: 0, altitude: 680, description: 'French military satellite Cerise was struck by debris from an Ariane rocket stage, severing its gravity gradient boom.', impact: 'Cerise survived but was damaged. First confirmed debris-on-satellite collision.' },
  { year: 2007, name: 'Chinese ASAT Test (FY-1C)', type: 'ASAT test', debrisAdded: 3500, altitude: 865, description: 'China destroyed its own Fengyun-1C weather satellite with a kinetic kill vehicle. Created the largest single debris event in history.', impact: 'Created ~3,500 trackable objects + estimated 150,000 fragments >1 cm. Debris will persist until 2050+.' },
  { year: 2009, name: 'Iridium 33 / Cosmos 2251', type: 'First hypervelocity collision', debrisAdded: 2000, altitude: 789, description: 'First accidental collision between two intact satellites. Commercial Iridium 33 and defunct Russian Cosmos 2251 struck at 11.7 km/s.', impact: 'Both satellites destroyed; ~2,000 trackable debris pieces. Iridium replaced the satellite within days.' },
  { year: 2019, name: 'Indian ASAT Test (Mission Shakti)', type: 'ASAT test', debrisAdded: 400, altitude: 283, description: 'India destroyed its Microsat-R satellite in LEO at 283 km altitude, intentionally chosen to minimize debris persistence.', impact: '~400 trackable fragments, most re-entered within weeks. Lower altitude than China\'s 2007 test reduced long-term debris.' },
  { year: 2021, name: 'Russian ASAT (Kosmos 1408)', type: 'ASAT test', debrisAdded: 1700, altitude: 485, description: 'Russia destroyed its defunct Kosmos 1408 satellite with a direct-ascent ASAT missile, forcing ISS crew to shelter in Soyuz capsule.', impact: '~1,700 trackable fragments at ISS altitude. Widely condemned internationally. ISS crew sheltered 3 times in first day.' },
  { year: 2023, name: 'Near-misses surge', type: 'Conjunction trend', debrisAdded: 0, altitude: 550, description: 'Record 28,000+ conjunction warnings issued to satellite operators in 2023 as constellation density increases.', impact: 'SpaceX performed hundreds of automated collision avoidance maneuvers. ESA reported a 50% increase in avoidance burns.' },
]

const MITIGATION: MitigationMethod[] = [
  {
    name: '25-Year Rule',
    emoji: '📋',
    status: 'operational',
    description: 'International guideline requiring satellites in LEO to deorbit within 25 years of end-of-life. Now being tightened to 5 years by some regulators.',
    examples: ['ESA Zero Debris Charter (2023)', 'FCC 5-year rule (USA, 2022)', 'ITU guidelines'],
  },
  {
    name: 'Drag Augmentation Devices',
    emoji: '🪂',
    status: 'operational',
    description: 'Deployable sails or inflatable structures that increase atmospheric drag to accelerate deorbit of small satellites.',
    examples: ['Spire Global drag sails', 'Exotrail propulsion', 'Saber Astronautics DragEN'],
  },
  {
    name: 'Active Debris Removal (ADR)',
    emoji: '🤖',
    status: 'tested',
    description: 'Spacecraft that rendezvous with, capture, and deorbit large defunct satellites. ESA\'s ClearSpace-1 mission targeting first commercial ADR in 2026.',
    examples: ['ClearSpace-1 (ESA, 2026)', 'Astroscale ELSA-M', 'D-Orbit ION'],
  },
  {
    name: 'Laser Broom',
    emoji: '⚡',
    status: 'proposed',
    description: 'Ground-based or space-based laser system that heats debris surface, creating asymmetric thrust to alter trajectory into re-entry path.',
    examples: ['NASA ORION concept', 'EOS Australia studies', 'Chinese ground-based laser research'],
  },
  {
    name: 'Harpoon & Net Capture',
    emoji: '🪤',
    status: 'tested',
    description: 'Physical capture using harpoons, nets, or robotic arms. Surrey Space Centre demonstrated net capture in orbit in 2018 (RemoveDebris mission).',
    examples: ['RemoveDebris (2018 demo)', 'Airbus harpoon test', 'JAXA HTV tether experiments'],
  },
  {
    name: 'Ion Beam Shepherd',
    emoji: '🌀',
    status: 'concept',
    description: 'Spacecraft flies alongside debris and fires ion beam to push debris into lower orbit without physical contact. Avoids tumbling problem of contact methods.',
    examples: ['ESA concept studies', 'Sitael ion beam shepherd', 'Academic research phase'],
  },
]

const STATS = [
  { label: 'Trackable objects (>10 cm)', value: '27,000+', color: 'text-red-400' },
  { label: 'Estimated objects >1 cm', value: '~1,000,000', color: 'text-orange-400' },
  { label: 'Estimated objects >1 mm', value: '~130,000,000', color: 'text-yellow-400' },
  { label: 'Total mass in orbit', value: '~10,000 t', color: 'text-blue-400' },
  { label: 'Average collision speed', value: '10 km/s', color: 'text-purple-400' },
  { label: 'Countries operating debris', value: '100+', color: 'text-green-400' },
]

function OrbitalMap({ shells }: { shells: DebrisShell[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2, cy = H / 2
    const earthR = 30

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#050a18'
    ctx.fillRect(0, 0, W, H)

    // Stars
    for (let i = 0; i < 80; i++) {
      ctx.beginPath()
      ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.3})`
      ctx.fill()
    }

    // Earth
    const earthGrad = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, earthR)
    earthGrad.addColorStop(0, '#3B82F6')
    earthGrad.addColorStop(0.6, '#1D4ED8')
    earthGrad.addColorStop(1, '#1E3A5F')
    ctx.beginPath()
    ctx.arc(cx, cy, earthR, 0, Math.PI * 2)
    ctx.fillStyle = earthGrad
    ctx.fill()

    // Draw shells
    const maxAlt = 40000
    shells.forEach(shell => {
      const r = earthR + (shell.altitudeKm / maxAlt) * (Math.min(W, H) / 2 - earthR - 5)
      const density = Math.min(shell.objectCount / 25000, 1)
      const dotCount = Math.floor(density * 40) + 5

      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + (shell.altitudeKm * 0.01)
        const jitter = (Math.random() - 0.5) * 6
        const x = cx + Math.cos(angle) * (r + jitter)
        const y = cy + Math.sin(angle) * (r + jitter) * 0.4
        ctx.beginPath()
        ctx.arc(x, y, 1.2, 0, Math.PI * 2)
        ctx.fillStyle = shell.color + 'CC'
        ctx.fill()
      }
    })

    // Labels for key shells
    ctx.font = '9px sans-serif'
    ctx.fillStyle = 'rgba(180,200,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('LEO', cx, cy - earthR - 20)
    ctx.fillText('GEO', cx, cy - (Math.min(W, H) / 2 - 8))
  }, [shells])

  return <canvas ref={canvasRef} width={240} height={240} className="mx-auto rounded-lg" />
}

export default function SpaceDebrisDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'mitigation'>('overview')
  const [selectedShell, setSelectedShell] = useState<DebrisShell | null>(null)

  const riskColor = (risk: DebrisShell['risk']) => {
    return risk === 'critical' ? 'text-red-400' : risk === 'high' ? 'text-orange-400' : risk === 'moderate' ? 'text-yellow-400' : 'text-green-400'
  }

  const statusBadge = (status: MitigationMethod['status']) => {
    const styles: Record<string, string> = {
      operational: 'bg-green-900/50 text-green-300',
      tested: 'bg-blue-900/50 text-blue-300',
      proposed: 'bg-yellow-900/50 text-yellow-300',
      concept: 'bg-slate-700 text-slate-300',
    }
    return styles[status]
  }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Debris Dashboard</h2>
      <p className="text-slate-400 text-sm mb-5">Tracking humanity's orbital trash problem and solutions</p>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {STATS.map((s, i) => (
          <div key={i} className="bg-slate-800/60 rounded-lg p-3">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-slate-400 text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {([['overview', '🌍 Orbital Zones'], ['history', '💥 Collision Events'], ['mitigation', '🛡️ Solutions']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <OrbitalMap shells={DEBRIS_SHELLS} />
          <div className="space-y-2">
            {DEBRIS_SHELLS.map((shell, i) => (
              <button
                key={i}
                onClick={() => setSelectedShell(selectedShell?.label === shell.label ? null : shell)}
                className="w-full text-left p-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: shell.color }} />
                    <span className="text-white text-sm font-medium">{shell.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs">{shell.objectCount.toLocaleString()}</span>
                    <span className={`text-xs font-bold ${riskColor(shell.risk)}`}>{shell.risk.toUpperCase()}</span>
                  </div>
                </div>
                {selectedShell?.label === shell.label && (
                  <div className="mt-2 text-slate-300 text-xs leading-relaxed border-t border-slate-700 pt-2">
                    <div className="text-slate-500 mb-1">Alt: {shell.altitudeKm.toLocaleString()} km · {shell.dominantType}</div>
                    {shell.notes}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {COLLISION_EVENTS.map((ev, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-white font-bold">{ev.name}</span>
                  <span className="text-slate-400 text-xs ml-2">({ev.type})</span>
                </div>
                <div className="text-right text-sm">
                  <div className="text-slate-300">{ev.year}</div>
                  {ev.debrisAdded > 0 && <div className="text-red-400 text-xs">+{ev.debrisAdded.toLocaleString()} objects</div>}
                </div>
              </div>
              <div className="text-slate-300 text-sm mb-2">{ev.description}</div>
              <div className="bg-slate-900/60 rounded-lg p-2 text-xs text-orange-300">
                ⚡ Impact: {ev.impact}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mitigation' && (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-3 text-sm text-blue-200 mb-4">
            💡 Kessler Syndrome: A cascade of collisions creating so much debris that low Earth orbit becomes unusable. Currently theoretical but models suggest we may already be past the threshold in some altitude bands.
          </div>
          {MITIGATION.map((m, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{m.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{m.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusBadge(m.status)}`}>{m.status}</span>
                  </div>
                </div>
              </div>
              <p className="text-slate-300 text-sm mb-3">{m.description}</p>
              <div className="space-y-1">
                {m.examples.map((ex, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="w-1 h-1 rounded-full bg-indigo-400" />
                    {ex}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
