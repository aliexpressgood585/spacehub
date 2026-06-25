import { useState, useRef, useEffect } from 'react'

interface GRBType {
  name: string
  duration: string
  origin: string
  energy: string
  rate: string
  afterglow: boolean
  description: string
  example: string
  color: string
}

interface FRB {
  name: string
  dm: number
  distance: string
  repeating: boolean
  discovered: number
  source: string
  significance: string
}

interface TransientEvent {
  type: string
  timescale: string
  energy: string
  mechanism: string
  detectableBy: string[]
  icon: string
  color: string
}

const grbTypes: GRBType[] = [
  { name: 'Short GRB', duration: '< 2 seconds', origin: 'Binary neutron star / NS-BH merger', energy: '10⁴⁹–10⁵¹ erg', rate: '~3–5 per day (all-sky)', afterglow: true, description: 'Produced by merger of two compact objects. GW170817 was the first with simultaneous gravitational wave detection, proving the NS-NS merger origin.', example: 'GRB 170817A (with GW170817)', color: '#60a5fa' },
  { name: 'Long GRB', duration: '2–1000+ seconds', origin: 'Collapsar — massive star core collapse', energy: '10⁵⁰–10⁵⁴ erg', rate: '~2 per day (all-sky)', afterglow: true, description: 'Most luminous events in the universe after Big Bang. Core of massive star collapses to black hole, launching relativistic jets through stellar envelope.', example: 'GRB 080319B (naked eye at z=0.94)', color: '#f97316' },
  { name: 'Ultra-Long GRB', duration: '1000+ seconds', origin: 'Supergiant star collapse / Blue Supergiant', energy: '10⁵²–10⁵³ erg', rate: 'Very rare (~1%)', afterglow: true, description: 'Duration too long for typical collapsars. May involve very extended stellar envelopes (blue supergiants) or rapidly rotating magnetars.', example: 'GRB 111209A (25,000 seconds long)', color: '#a78bfa' },
  { name: 'Magnetar Flare', duration: '< 0.5 seconds', origin: 'Magnetar spin-down / magnetic reconnection', energy: '10⁴⁶–10⁴⁷ erg', rate: '~1 per decade (detected)', afterglow: false, description: 'Giant flares from magnetars produce brief but extremely intense hard X-ray/gamma-ray pulses. SGR 1806-20 briefly outshone all gamma sources.', example: 'SGR 1806-20 giant flare 2004', color: '#ef4444' },
]

const frbs: FRB[] = [
  { name: 'FRB 20010724A (Lorimer Burst)', dm: 375, distance: '~1 Gpc', repeating: false, discovered: 2001, source: 'Unknown', significance: 'First FRB discovered (2007 in archival data). Showed extragalactic origin via dispersion measure.' },
  { name: 'FRB 20121102A', dm: 558, distance: '~1.7 Gpc', repeating: true, discovered: 2012, source: 'Dwarf galaxy z=0.193', significance: 'First repeating FRB. Localized to specific dwarf galaxy. Hundreds of bursts detected from single source.' },
  { name: 'FRB 20200120E', dm: 88, distance: '3.6 Mpc (M81)', repeating: true, discovered: 2020, source: 'Globular cluster in M81', significance: 'Closest known FRB — in nearby galaxy M81. First FRB in a globular cluster, pointing to recycled pulsars.' },
  { name: 'SGR 1935+2154', dm: 333, distance: '9 kpc (Milky Way)', repeating: true, discovered: 2020, source: 'Known Galactic magnetar', significance: 'First FRB-like burst from known Galactic source — directly linking magnetars to FRBs. Detected by CHIME and STARE2.' },
  { name: 'FRB 20220912A', dm: 220, distance: '~1 Gpc', repeating: true, discovered: 2022, source: 'Dwarf galaxy', significance: 'Highest activity repeating FRB observed. Over 1,000 bursts in 78 hours — enabled detailed sub-burst structure analysis.' },
]

const transients: TransientEvent[] = [
  { type: 'Gamma-Ray Burst', timescale: 'ms – 1000 s', energy: '10⁵¹–10⁵⁴ erg', mechanism: 'Relativistic jet from compact object merger or stellar collapse', detectableBy: ['Fermi-GBM', 'Swift-BAT', 'INTEGRAL'], icon: '💥', color: '#ef4444' },
  { type: 'Fast Radio Burst', timescale: '< 1 ms', energy: '10³⁷–10⁴² erg', mechanism: 'Magnetar flares? Compact object mergers? Many hypotheses', detectableBy: ['CHIME', 'FAST', 'Parkes'], icon: '📡', color: '#60a5fa' },
  { type: 'Kilonova', timescale: 'Days to weeks', energy: '10⁴⁷–10⁴⁸ erg', mechanism: 'r-process nucleosynthesis from neutron-rich ejecta of NS merger', detectableBy: ['Optical/NIR telescopes', 'HST', 'JWST'], icon: '🌟', color: '#fde68a' },
  { type: 'Tidal Disruption Event', timescale: 'Weeks to months', energy: '10⁵²–10⁵³ erg (total)', mechanism: 'Star torn apart by supermassive BH tidal forces', detectableBy: ['eROSITA', 'ZTF', 'Swift-XRT'], icon: '🌀', color: '#a78bfa' },
  { type: 'Soft Gamma Repeater', timescale: '0.1–30 s (flares)', energy: '10⁴⁴–10⁴⁶ erg', mechanism: 'Magnetar crust fracture releasing magnetic energy', detectableBy: ['Fermi-GBM', 'INTEGRAL', 'Swift'], icon: '⚡', color: '#f97316' },
  { type: 'Superluminous Supernova', timescale: 'Weeks to months', energy: '> 10⁵¹ erg optical', mechanism: 'Magnetar spin-down or pair-instability — 10-100x brighter than normal SN', detectableBy: ['ZTF', 'PS1', 'LSST'], icon: '✨', color: '#4ade80' },
]

function ExplosionCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2

    interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string }
    const particles: Particle[] = []
    let jetFrame = 0

    const spawnParticle = (angle: number, speed: number, color: string) => {
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed * (0.8 + Math.random() * 0.4),
        vy: Math.sin(angle) * speed * (0.8 + Math.random() * 0.4),
        life: 0, maxLife: 40 + Math.random() * 30,
        size: 1.5 + Math.random() * 2.5,
        color
      })
    }

    let frame: number
    const animate = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      // Stars
      if (jetFrame % 120 === 0) {
        for (let i = 0; i < 60; i++) {
          const angle = Math.random() * Math.PI * 2
          const speed = 2 + Math.random() * 4
          const colors = ['#ef4444', '#f97316', '#fde68a', '#60a5fa', '#a78bfa']
          spawnParticle(angle, speed, colors[Math.floor(Math.random() * colors.length)])
        }
      }

      // Jets (GRB bipolar jets)
      if (jetFrame % 4 === 0) {
        for (const jAngle of [-Math.PI / 2, Math.PI / 2]) {
          const spread = 0.3
          for (let k = 0; k < 3; k++) {
            spawnParticle(jAngle + (Math.random() - 0.5) * spread, 4 + Math.random() * 3, '#f97316aa')
          }
        }
      }

      // Draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        const alpha = 1 - p.life / p.maxLife
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2)
        ctx.fillStyle = p.color + Math.round(alpha * 200).toString(16).padStart(2, '0')
        ctx.fill()
        p.x += p.vx; p.y += p.vy; p.life++
        p.vx *= 0.97; p.vy *= 0.97
        if (p.life >= p.maxLife) particles.splice(i, 1)
      }

      // Central progenitor
      const glow = Math.abs(Math.sin(jetFrame * 0.05)) * 0.5 + 0.5
      const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12)
      cGrad.addColorStop(0, `rgba(255,255,255,${glow})`)
      cGrad.addColorStop(0.5, `rgba(251,191,36,${glow * 0.6})`)
      cGrad.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(cx, cy, 12, 0, Math.PI * 2)
      ctx.fillStyle = cGrad
      ctx.fill()

      // Labels
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('Relativistic Jet (N)', cx - 45, cy - 90)
      ctx.fillText('Relativistic Jet (S)', cx - 45, cy + 105)

      jetFrame++
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} width={400} height={260} className="w-full rounded-lg" />
}

type Tab = 'grb' | 'frb' | 'transients'

export default function CosmicExplosions() {
  const [tab, setTab] = useState<Tab>('grb')
  const [selected, setSelected] = useState<GRBType>(grbTypes[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'grb', label: 'Gamma-Ray Bursts' },
    { id: 'frb', label: 'Fast Radio Bursts' },
    { id: 'transients', label: 'Transient Zoo' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Explosions</h2>
      <p className="text-gray-400 text-sm mb-5">The most energetic transient phenomena in the observable universe</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'grb' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {grbTypes.map(g => (
              <button key={g.name} onClick={() => setSelected(g)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === g.name ? 'bg-red-900/40 border border-red-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="font-semibold text-white text-sm">{g.name}</span>
                </div>
                <div className="text-gray-400 text-xs">Duration: {g.duration}</div>
                <div className="text-gray-500 text-xs mt-0.5">{g.rate}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <ExplosionCanvas />
            <div className="bg-gray-800/60 rounded-lg p-4">
              <h3 className="text-lg font-bold text-white mb-2">{selected.name}</h3>
              <p className="text-gray-300 text-sm mb-3">{selected.description}</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { label: 'Duration', value: selected.duration },
                  { label: 'Energy', value: selected.energy },
                  { label: 'Origin', value: selected.origin },
                  { label: 'Afterglow', value: selected.afterglow ? 'Yes (X-ray/optical/radio)' : 'No' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900/50 rounded p-2">
                    <div className="text-gray-500 text-xs">{item.label}</div>
                    <div className="text-white text-sm font-medium mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="bg-orange-900/20 rounded p-3 border border-orange-800/30">
                <div className="text-orange-400 text-xs font-semibold uppercase mb-1">Notable Example</div>
                <p className="text-gray-300 text-sm">{selected.example}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'frb' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-blue-900/20 rounded-lg p-4 border border-blue-800/40">
            Fast Radio Bursts are millisecond-duration radio pulses of extragalactic origin. Each burst releases in milliseconds as much energy as the Sun emits in days. The dispersion measure (DM) reveals how much ionized gas the signal passed through — a proxy for distance. CHIME discovers ~2-3 FRBs per day.
          </p>
          {frbs.map(f => (
            <div key={f.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-white font-mono font-bold text-sm">{f.name}</h4>
                <div className="flex gap-2">
                  {f.repeating && <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded">Repeating</span>}
                  <span className="text-xs text-gray-500">DM: {f.dm} pc/cm³</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Distance</div>
                  <div className="text-white text-sm">{f.distance}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Discovered</div>
                  <div className="text-white text-sm">{f.discovered}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Source</div>
                  <div className="text-white text-sm">{f.source}</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm">{f.significance}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'transients' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {transients.map(t => (
            <div key={t.type} className="bg-gray-800/60 rounded-lg p-4 border-l-4" style={{ borderColor: t.color }}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{t.icon}</span>
                <h4 className="text-white font-bold">{t.type}</h4>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><span className="text-gray-500 text-xs">Timescale: </span><span className="text-gray-300 text-xs">{t.timescale}</span></div>
                <div><span className="text-gray-500 text-xs">Energy: </span><span className="text-gray-300 text-xs">{t.energy}</span></div>
              </div>
              <p className="text-gray-400 text-sm mb-2">{t.mechanism}</p>
              <div className="flex flex-wrap gap-1">
                {t.detectableBy.map(d => (
                  <span key={d} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{d}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
