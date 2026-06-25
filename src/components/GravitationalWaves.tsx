import { useState, useRef, useEffect } from 'react'

interface GWEvent {
  id: string
  date: string
  type: 'BBH' | 'BNS' | 'NSBH' | 'burst'
  m1: number
  m2: number
  distance: number
  snr: number
  detectors: string[]
  significance: string
  description: string
  firstOfType?: boolean
}

interface Detector {
  name: string
  location: string
  armLength: number
  sensitivity: string
  status: 'operating' | 'planned' | 'upgraded'
  country: string
  firstRun: string
}

interface GWSource {
  type: string
  freq: string
  detector: string
  description: string
  icon: string
}

const events: GWEvent[] = [
  { id: 'GW150914', date: 'Sep 14, 2015', type: 'BBH', m1: 36, m2: 29, distance: 410, snr: 24, detectors: ['LIGO-H', 'LIGO-L'], significance: '5.1σ', description: 'First gravitational wave detection. Two black holes merged 1.4 billion years ago, converting 3 M☉ to pure wave energy in 0.2 seconds.', firstOfType: true },
  { id: 'GW170817', date: 'Aug 17, 2017', type: 'BNS', m1: 1.46, m2: 1.27, distance: 40, snr: 32.4, detectors: ['LIGO-H', 'LIGO-L', 'Virgo'], significance: '> 5σ', description: 'First neutron star merger — also detected in gamma rays, X-rays, optical (kilonova AT2017gfo), and radio. Multi-messenger astronomy born.', firstOfType: true },
  { id: 'GW190521', date: 'May 21, 2019', type: 'BBH', m1: 85, m2: 66, distance: 5300, snr: 14.7, detectors: ['LIGO-H', 'LIGO-L', 'Virgo'], significance: '> 5σ', description: 'First intermediate mass black hole merger, producing a 142 M☉ IMBH — first direct evidence of this long-sought class of black holes.', firstOfType: true },
  { id: 'GW200105', date: 'Jan 5, 2020', type: 'NSBH', m1: 8.9, m2: 1.9, distance: 280, snr: 13, detectors: ['LIGO-L', 'Virgo'], significance: '> 5σ', description: 'First neutron star-black hole merger. The 8.9 M☉ black hole likely swallowed the neutron star whole without electromagnetic counterpart.', firstOfType: true },
  { id: 'GW170104', date: 'Jan 4, 2017', type: 'BBH', m1: 31.2, m2: 19.4, distance: 880, snr: 13, detectors: ['LIGO-H', 'LIGO-L'], significance: '> 5σ', description: 'Third gravitational wave event. Helped constrain spin-orbit alignment in binary systems — spins likely misaligned, favoring dynamical capture.', firstOfType: false },
  { id: 'GW151226', date: 'Dec 26, 2015', type: 'BBH', m1: 14.2, m2: 7.5, distance: 440, snr: 13.1, detectors: ['LIGO-H', 'LIGO-L'], significance: '> 5σ', description: 'Second detection. "Boxing Day" event. At least one black hole had measurable spin, providing first evidence of spinning black holes in mergers.', firstOfType: false },
]

const detectorList: Detector[] = [
  { name: 'LIGO Hanford', location: 'Washington, USA', armLength: 4, sensitivity: '10⁻²³ Hz⁻¹/²', status: 'operating', country: '🇺🇸', firstRun: '2002' },
  { name: 'LIGO Livingston', location: 'Louisiana, USA', armLength: 4, sensitivity: '10⁻²³ Hz⁻¹/²', status: 'operating', country: '🇺🇸', firstRun: '2002' },
  { name: 'Virgo', location: 'Cascina, Italy', armLength: 3, sensitivity: '10⁻²³ Hz⁻¹/²', status: 'operating', country: '🇪🇺', firstRun: '2007' },
  { name: 'KAGRA', location: 'Hida, Japan', armLength: 3, sensitivity: '10⁻²³ Hz⁻¹/²', status: 'operating', country: '🇯🇵', firstRun: '2020' },
  { name: 'LIGO India', location: 'Aundha, Maharashtra', armLength: 4, sensitivity: '10⁻²³ Hz⁻¹/²', status: 'planned', country: '🇮🇳', firstRun: '~2030' },
  { name: 'Einstein Telescope', location: 'Europe (proposed)', armLength: 10, sensitivity: '10⁻²⁴ Hz⁻¹/²', status: 'planned', country: '🇪🇺', firstRun: '~2035' },
  { name: 'LISA', location: 'Heliocentric orbit', armLength: 2500000, sensitivity: '10⁻²⁰ Hz⁻¹/²', status: 'planned', country: '🛸', firstRun: '~2037' },
]

const sources: GWSource[] = [
  { type: 'Binary Black Holes', freq: '10–1000 Hz', detector: 'LIGO/Virgo/KAGRA', description: 'Most common source. Mergers lasting seconds to minutes depending on mass.', icon: '⚫' },
  { type: 'Binary Neutron Stars', freq: '10–2000 Hz', detector: 'LIGO/Virgo/KAGRA', description: 'Rare but scientifically rich — produce kilonovae and heavy elements.', icon: '⭐' },
  { type: 'Neutron Star – Black Hole', freq: '10–1000 Hz', detector: 'LIGO/Virgo/KAGRA', description: 'May produce gamma-ray bursts if NS disrupted before merger.', icon: '🌀' },
  { type: 'Continuous GW', freq: '10–1000 Hz', detector: 'LIGO/Virgo', description: 'Rotating neutron stars with asymmetric mass distribution. Not yet detected.', icon: '🔄' },
  { type: 'Supermassive BH Mergers', freq: '10⁻⁴ – 10⁻² Hz', detector: 'LISA', description: 'Galaxy mergers bringing together million-solar-mass black holes.', icon: '🌌' },
  { type: 'Stochastic Background', freq: '10⁻⁹ – 10⁻⁷ Hz', detector: 'Pulsar Timing Arrays', description: 'Relic GWs from early universe. Evidence found by NANOGrav in 2023.', icon: '📡' },
]

function WaveCanvas({ event }: { event: GWEvent }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#03061a'
    ctx.fillRect(0, 0, W, H)

    // Draw inspiral → merger → ringdown waveform
    const points: [number, number][] = []
    const totalMass = event.m1 + event.m2
    const chirpPhases = 300
    const mergerX = W * 0.72

    for (let i = 0; i < chirpPhases; i++) {
      const t = i / chirpPhases
      const x = 30 + t * (mergerX - 30)
      const freq = 0.5 + t * t * (totalMass > 50 ? 3 : 8)
      const amp = (0.05 + t * t * 0.45) * (H * 0.38)
      const y = H / 2 + Math.sin(i * freq * 0.4) * amp
      points.push([x, y])
    }

    // Merger peak
    for (let i = 0; i < 15; i++) {
      const t = i / 15
      const x = mergerX + t * 30
      const amp = (1 - t) * H * 0.42
      const y = H / 2 + Math.sin(i * 2.5) * amp
      points.push([x, y])
    }

    // Ringdown
    for (let i = 0; i < 80; i++) {
      const t = i / 80
      const x = mergerX + 30 + t * (W - mergerX - 60)
      const amp = Math.exp(-t * 4) * H * 0.18
      const y = H / 2 + Math.sin(i * 3) * amp
      points.push([x, y])
    }

    const grad = ctx.createLinearGradient(30, 0, W - 20, 0)
    grad.addColorStop(0, '#4f46e5')
    grad.addColorStop(0.7, '#7c3aed')
    grad.addColorStop(0.85, '#ec4899')
    grad.addColorStop(1, '#6366f1')

    ctx.beginPath()
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
    ctx.strokeStyle = grad
    ctx.lineWidth = 2
    ctx.stroke()

    // Baseline
    ctx.beginPath()
    ctx.moveTo(20, H / 2)
    ctx.lineTo(W - 10, H / 2)
    ctx.strokeStyle = 'rgba(100,116,139,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Phase labels
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText('Inspiral', 35, H - 10)
    ctx.fillText('Merger', mergerX - 15, H - 10)
    ctx.fillText('Ringdown', mergerX + 35, H - 10)

    // Vertical line at merger
    ctx.beginPath()
    ctx.moveTo(mergerX, 20)
    ctx.lineTo(mergerX, H - 20)
    ctx.strokeStyle = 'rgba(236,72,153,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])

  }, [event])
  return <canvas ref={ref} width={500} height={180} className="w-full rounded-lg" />
}

type Tab = 'events' | 'detectors' | 'sources'

export default function GravitationalWaves() {
  const [tab, setTab] = useState<Tab>('events')
  const [selected, setSelected] = useState<GWEvent>(events[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'events', label: 'Detection Events' },
    { id: 'detectors', label: 'Observatories' },
    { id: 'sources', label: 'Wave Sources' },
  ]

  const typeLabel = { BBH: 'Binary Black Hole', BNS: 'Binary Neutron Star', NSBH: 'NS–Black Hole', burst: 'Burst' }
  const typeColor = { BBH: 'text-purple-400', BNS: 'text-blue-400', NSBH: 'text-green-400', burst: 'text-orange-400' }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Gravitational Waves</h2>
      <p className="text-gray-400 text-sm mb-5">Ripples in spacetime — a new window on the universe opened by LIGO in 2015</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {events.map(e => (
              <button key={e.id} onClick={() => setSelected(e)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.id === e.id ? 'bg-indigo-900/40 border border-indigo-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-white text-sm">{e.id}</span>
                  {e.firstOfType && <span className="text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">First</span>}
                </div>
                <div className={`text-xs capitalize ${typeColor[e.type]}`}>{typeLabel[e.type]}</div>
                <div className="text-gray-400 text-xs mt-0.5">{e.date} · {e.distance} Mpc</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <WaveCanvas event={selected} />
            <div className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-mono text-lg font-bold text-white">{selected.id}</h3>
                <span className={`text-sm font-medium ${typeColor[selected.type]}`}>{typeLabel[selected.type]}</span>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Mass 1', value: `${selected.m1} M☉` },
                  { label: 'Mass 2', value: `${selected.m2} M☉` },
                  { label: 'Distance', value: `${selected.distance} Mpc` },
                  { label: 'SNR', value: selected.snr.toString() },
                  { label: 'Significance', value: selected.significance },
                  { label: 'Detectors', value: selected.detectors.join(', ') },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900/50 rounded p-2">
                    <div className="text-gray-500 text-xs">{item.label}</div>
                    <div className="text-white text-sm font-medium mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'detectors' && (
        <div className="space-y-3">
          {detectorList.map(d => (
            <div key={d.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{d.country}</span>
                  <div>
                    <h4 className="text-white font-bold">{d.name}</h4>
                    <p className="text-gray-400 text-sm">{d.location}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full capitalize ${d.status === 'operating' ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'}`}>{d.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Arm Length</div>
                  <div className="text-white text-sm font-medium">{d.armLength.toLocaleString()} km</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Strain Sensitivity</div>
                  <div className="text-white text-sm font-medium">{d.sensitivity}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">First Science Run</div>
                  <div className="text-white text-sm font-medium">{d.firstRun}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'sources' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-indigo-900/20 rounded-lg p-4 border border-indigo-800/40">
            Gravitational waves are produced whenever massive objects accelerate asymmetrically. They stretch and compress spacetime by fractions of a proton width over 4 km — requiring quantum-level laser interferometry to detect. Over 90 events confirmed through O3 run.
          </p>
          {sources.map(s => (
            <div key={s.type} className="bg-gray-800/60 rounded-lg p-4 flex gap-4">
              <div className="text-3xl">{s.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h4 className="text-white font-semibold">{s.type}</h4>
                  <span className="text-xs text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded">freq: {s.freq}</span>
                  <span className="text-xs text-gray-500">{s.detector}</span>
                </div>
                <p className="text-gray-400 text-sm">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
