import { useState, useEffect, useRef } from 'react'

interface FormationStage {
  stage: number
  name: string
  duration: string
  timeAfterBirth: string
  description: string
  processes: string[]
  color: string
}

interface Planet {
  name: string
  type: 'terrestrial' | 'gas' | 'ice'
  formationZone: string
  coreMass: string
  timeToForm: string
  key: string
  au: number
  color: string
}

interface DiskFeature {
  name: string
  description: string
  example: string
  significance: string
}

const STAGES: FormationStage[] = [
  {
    stage: 1,
    name: 'Molecular Cloud Collapse',
    duration: '~1 million years',
    timeAfterBirth: 'T = 0',
    description: 'A giant molecular cloud (10–100 ly across) is disturbed — by a supernova shockwave, galactic arm, or random turbulence — and begins to collapse under gravity.',
    processes: ['Gravity overcomes gas pressure', 'Angular momentum causes rotation', 'Cloud fragments into sub-regions', 'Protostars begin to form'],
    color: '#8b5cf6',
  },
  {
    stage: 2,
    name: 'Protoplanetary Disk',
    duration: '~3–10 million years',
    timeAfterBirth: '0.1–10 Myr',
    description: 'Gas and dust flatten into a rotating disk around the protostar. The disk contains all the material that will become planets, moons, asteroids, and comets.',
    processes: ['Disk flattens due to rotation', 'Temperature gradient: hot inside, cold outside', 'Dust grains stick together (coagulation)', 'Disk becomes visible as T-Tauri star'],
    color: '#f59e0b',
  },
  {
    stage: 3,
    name: 'Planetesimal Formation',
    duration: '~1–3 million years',
    timeAfterBirth: '1–10 Myr',
    description: 'Dust grains clump into centimeter-sized pebbles, then kilometer-sized planetesimals. The "meter-size barrier" problem: objects fragment at this scale, then rapidly coagulate via pebble accretion.',
    processes: ['Streaming instability concentrates pebbles', 'Gravitational collapse of pebble clouds', 'Planetesimals reach 100 km in size', 'Runaway growth begins'],
    color: '#10b981',
  },
  {
    stage: 4,
    name: 'Oligarchic Growth',
    duration: '~10–100 million years',
    timeAfterBirth: '10–100 Myr',
    description: 'A few large "oligarchs" dominate accretion, sweeping up smaller planetesimals in their feeding zones. Protoplanets (embryos) reach Mars-to-Earth sizes.',
    processes: ['Gravitational focusing enhances accretion', 'Resonances excite smaller bodies', 'Giant impacts melt protoplanets (magma oceans)', 'Moon-forming impacts possible'],
    color: '#3b82f6',
  },
  {
    stage: 5,
    name: 'Giant Planet Formation',
    duration: '~1–10 million years',
    timeAfterBirth: '3–10 Myr',
    description: 'Beyond the snow line, solid cores grow to 10–15 Earth masses, triggering rapid gas accretion. Jupiter forms within ~3–5 Myr, before the disk dissipates.',
    processes: ['Core accretion: solid core first', 'Gas envelope collapses onto 10+ M⊕ core', 'Jupiter opens gap in disk', 'Gas disk dissipated by stellar radiation'],
    color: '#ef4444',
  },
  {
    stage: 6,
    name: 'Late Heavy Bombardment / Clearing',
    duration: '~500 million years',
    timeAfterBirth: '500 Myr – 1 Gyr',
    description: 'Giant planets migrate slightly, destabilizing the outer disk. A late surge of asteroid and comet impacts scars the inner solar system. Delivers water to rocky planets.',
    processes: ['Nice model: Jupiter-Saturn resonance', 'Massive bombardment of Moon', 'Water delivery to Earth', 'Outer planets reach final orbits'],
    color: '#06b6d4',
  },
  {
    stage: 7,
    name: 'Stable Planetary System',
    duration: 'Billions of years',
    timeAfterBirth: '1 Gyr+',
    description: 'Surviving planets settle into long-term stable orbits. Asteroid belts and Kuiper Belt represent leftover planetesimals never incorporated into planets.',
    processes: ['Secular interactions slowly evolve orbits', 'Kozai–Lidov cycles in multi-body systems', 'Atmospheric evolution / erosion', 'Possible continued bombardment'],
    color: '#84cc16',
  },
]

const PLANETS: Planet[] = [
  { name: 'Mercury', type: 'terrestrial', formationZone: '0.2–0.4 AU', coreMass: '0.055 M⊕', timeToForm: '30–100 Myr', key: 'Lost much of its mantle in giant impact', au: 0.39, color: '#9ca3af' },
  { name: 'Venus', type: 'terrestrial', formationZone: '0.6–0.8 AU', coreMass: '0.82 M⊕', timeToForm: '30–100 Myr', key: 'Runaway greenhouse; originally habitable?', au: 0.72, color: '#f59e0b' },
  { name: 'Earth', type: 'terrestrial', formationZone: '0.8–1.2 AU', coreMass: '1.0 M⊕', timeToForm: '30–100 Myr', key: 'Theia impact formed Moon; water delivered by asteroids', au: 1.0, color: '#3b82f6' },
  { name: 'Mars', type: 'terrestrial', formationZone: '1.2–2.0 AU', coreMass: '0.107 M⊕', timeToForm: '10–15 Myr', key: 'Stunted by Jupiter\'s gravity blocking growth', au: 1.52, color: '#ef4444' },
  { name: 'Jupiter', type: 'gas', formationZone: '4–6 AU', coreMass: '317 M⊕', timeToForm: '3–5 Myr', key: 'Must form before disk disperses; core accretion or disk instability', au: 5.2, color: '#f97316' },
  { name: 'Saturn', type: 'gas', formationZone: '8–10 AU', coreMass: '95 M⊕', timeToForm: '5–10 Myr', key: 'Lagged behind Jupiter; resonance migration', au: 9.5, color: '#eab308' },
  { name: 'Uranus', type: 'ice', formationZone: '15–20 AU', coreMass: '14.5 M⊕', timeToForm: '10–30 Myr', key: 'May have formed closer to Sun then scattered outward', au: 19.2, color: '#06b6d4' },
  { name: 'Neptune', type: 'ice', formationZone: '20–30 AU', coreMass: '17.1 M⊕', timeToForm: '10–30 Myr', key: 'May have swapped position with Uranus during migration', au: 30.1, color: '#3b82f6' },
]

const DISK_FEATURES: DiskFeature[] = [
  { name: 'Snow Line', description: 'The distance from the star where water ice can exist. ~150 K boundary.', example: '~3 AU in our solar system (now ~1–2 AU due to luminosity)', significance: 'Determines where giant planets form; divides rocky and icy worlds' },
  { name: 'Gap Opening', description: 'A massive planet opens a gap in the disk by ejecting material via gravity resonances.', example: 'Jupiter creates a gap within ~5 Myr', significance: 'Stops outer disk from feeding inner planets; isolates feeding zones' },
  { name: 'Streaming Instability', description: 'Drag between gas and pebbles concentrates solids, triggering gravitational collapse into planetesimals.', example: 'Produces ~100 km planetesimals rapidly', significance: 'Solves the "meter-size barrier" — direct route to large bodies' },
  { name: 'Disk Winds', description: 'Magnetic fields launch jets and winds from disk surface, removing angular momentum.', example: 'T-Tauri jets visible in Orion', significance: 'Controls disk lifetime and mass — critical for giant planet formation window' },
]

function DiskAnimation({ phase }: { phase: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#02040a'
    ctx.fillRect(0, 0, W, H)

    // Star
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20)
    grad.addColorStop(0, '#fff8dc')
    grad.addColorStop(0.5, '#ffd700')
    grad.addColorStop(1, 'rgba(255,140,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, 20, 0, Math.PI * 2)
    ctx.fill()

    if (phase >= 2) {
      // Disk rings
      for (let r = 25; r < 140; r += 5) {
        const opacity = Math.max(0, 0.6 - r / 200)
        const hue = r < 50 ? 30 : r < 80 ? 50 : r < 110 ? 200 : 240
        ctx.strokeStyle = `hsla(${hue},70%,50%,${opacity})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    if (phase >= 3) {
      // Planetesimals
      [[50, 0.4], [80, 0.7], [110, 1.1], [130, 1.5]].forEach(([r, angle]) => {
        const x = cx + r * Math.cos(angle)
        const y = cy + r * 0.3 * Math.sin(angle)
        ctx.fillStyle = '#60a5fa'
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    if (phase >= 5) {
      // Giant planet gap
      ctx.strokeStyle = 'rgba(0,0,0,0)'
      ctx.lineWidth = 12
      ctx.beginPath()
      ctx.ellipse(cx, cy, 90, 27, 0, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      ctx.stroke()
      // Jupiter
      const jx = cx + 90, jy = cy
      const jgrad = ctx.createRadialGradient(jx, jy, 0, jx, jy, 10)
      jgrad.addColorStop(0, '#f97316')
      jgrad.addColorStop(1, 'rgba(249,115,22,0)')
      ctx.fillStyle = jgrad
      ctx.beginPath()
      ctx.arc(jx, jy, 10, 0, Math.PI * 2)
      ctx.fill()
    }

    // Labels
    ctx.fillStyle = '#9ca3af'
    ctx.font = '10px sans-serif'
    ctx.fillText(`Stage ${phase}: ${STAGES[phase - 1]?.name ?? ''}`, 8, 18)
  }, [phase])
  return <canvas ref={canvasRef} width={400} height={200} className="w-full rounded-xl" />
}

type TabType = 'stages' | 'planets' | 'disk'

export default function SolarSystemFormation() {
  const [activeTab, setActiveTab] = useState<TabType>('stages')
  const [phase, setPhase] = useState<number>(1)
  const [selected, setSelected] = useState<Planet>(PLANETS[2])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🌀</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Planetary System Formation</h2>
          <p className="text-gray-400 text-sm">How solar systems are born from collapsing clouds of gas and dust</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['stages', 'planets', 'disk'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === t ? 'bg-orange-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'stages' ? 'Formation Stages' : t === 'planets' ? 'How Each Planet Formed' : 'Disk Physics'}
          </button>
        ))}
      </div>

      {activeTab === 'stages' && (
        <div className="space-y-3">
          {STAGES.map(s => (
            <div key={s.stage} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0" style={{ background: s.color }}>
                  {s.stage}
                </div>
                <div>
                  <div className="text-white font-bold">{s.name}</div>
                  <div className="text-gray-400 text-xs">{s.timeAfterBirth} · Duration: {s.duration}</div>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-3">{s.description}</p>
              <div className="flex flex-wrap gap-2">
                {s.processes.map(p => (
                  <span key={p} className="text-xs px-2 py-1 rounded-full bg-white/10 text-gray-300">{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'planets' && (
        <div className="space-y-4">
          {/* Orbital distance bar */}
          <div className="bg-white/5 rounded-xl p-4">
            <div className="text-gray-400 text-xs mb-3">Formation zones (AU from Sun) — click a planet</div>
            <div className="relative h-10 bg-black/40 rounded-lg overflow-hidden">
              {PLANETS.map(p => {
                const pct = (Math.log10(p.au + 0.1) / Math.log10(35)) * 100
                return (
                  <button
                    key={p.name}
                    onClick={() => setSelected(p)}
                    className="absolute top-1 bottom-1 rounded-sm flex items-center justify-center transition-all hover:brightness-125"
                    style={{ left: `${pct}%`, width: p.au < 2 ? '20px' : '24px', background: p.color + 'cc', border: selected.name === p.name ? '2px solid white' : '1px solid transparent' }}
                    title={p.name}
                  >
                    <span className="text-white text-xs font-bold" style={{ fontSize: '8px' }}>{p.name[0]}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between text-gray-500 text-xs mt-1">
              <span>0 AU (Sun)</span>
              <span>5 AU</span>
              <span>10 AU</span>
              <span>30 AU</span>
            </div>
          </div>

          {/* Planet detail */}
          <div className="bg-white/5 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-5 rounded-full" style={{ background: selected.color }} />
              <h3 className="text-white text-xl font-bold">{selected.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{selected.type}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Formation Zone', value: selected.formationZone },
                { label: 'Final Mass', value: selected.coreMass },
                { label: 'Formation Time', value: selected.timeToForm },
                { label: 'Distance', value: `${selected.au} AU` },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3">
              <div className="text-orange-400 text-xs font-semibold mb-1">Key Formation Detail</div>
              <div className="text-gray-200 text-sm">{selected.key}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'disk' && (
        <div className="space-y-4">
          {/* Interactive disk animation */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-gray-300 text-sm">Formation Stage: <span className="text-orange-400 font-bold">{STAGES[phase - 1]?.name}</span></div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase(p => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-white/10 rounded-lg text-gray-300 hover:bg-white/20 text-sm"
                >←</button>
                <button
                  onClick={() => setPhase(p => Math.min(7, p + 1))}
                  className="px-3 py-1 bg-white/10 rounded-lg text-gray-300 hover:bg-white/20 text-sm"
                >→</button>
              </div>
            </div>
            <DiskAnimation phase={phase} />
          </div>

          {DISK_FEATURES.map((f, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-white font-bold mb-1">{f.name}</div>
              <p className="text-gray-300 text-sm mb-2">{f.description}</p>
              <div className="text-blue-400 text-xs mb-1">Example: {f.example}</div>
              <div className="text-yellow-300 text-xs">★ {f.significance}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Disk Lifetime', value: '3–10 Myr', desc: 'giant planets must form in this window' },
          { label: 'Snow Line', value: '~150 K', desc: 'water ice boundary' },
          { label: 'Exoplanet Systems', value: '5,700+', desc: 'confirmed planetary systems' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-orange-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
