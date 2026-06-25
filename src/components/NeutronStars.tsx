import { useState, useRef, useEffect } from 'react'

interface NeutronStarType {
  name: string
  subtype: string
  period: string
  bField: string
  temp: string
  count: string
  description: string
  color: string
  discovery: string
}

interface StructureLayer {
  name: string
  depth: string
  density: string
  composition: string
  color: string
}

interface FamousPulsar {
  name: string
  period: number
  type: string
  distance: number
  discovered: number
  significance: string
}

const starTypes: NeutronStarType[] = [
  { name: 'Radio Pulsar', subtype: 'Classical', period: '0.5–8 s', bField: '10¹² G', temp: '10⁶ K', count: '~3,000', description: 'Rapidly rotating neutron stars with beamed radio emission sweeping past Earth like a lighthouse. First discovered by Jocelyn Bell in 1967.', color: '#60a5fa', discovery: '1967' },
  { name: 'Millisecond Pulsar', subtype: 'Recycled', period: '1.4–30 ms', bField: '10⁸–⁹ G', temp: '10⁵–⁶ K', count: '~400', description: 'Spun up by accreting matter from a binary companion to millisecond periods. Extremely stable clocks used in pulsar timing arrays to detect gravitational waves.', color: '#34d399', discovery: '1982' },
  { name: 'Magnetar', subtype: 'Ultra-magnetic', period: '2–12 s', bField: '10¹⁴–¹⁵ G', temp: '10⁸ K', count: '~30', description: 'Neutron stars with fields 1,000× stronger than ordinary pulsars. Emit X-ray and gamma-ray bursts powered by magnetic field decay, not rotation.', color: '#f87171', discovery: '1979' },
  { name: 'X-ray Pulsar', subtype: 'Accreting', period: '0.069–1,000 s', bField: '10¹² G', temp: '10⁷ K', count: '~100', description: 'Found in binary systems accreting from a companion. Matter funneled onto magnetic poles creates X-ray hot spots. Can reach 10^38 erg/s luminosity.', color: '#fb923c', discovery: '1971' },
  { name: 'Rotating Radio Transient', subtype: 'RRAT', period: '0.4–7 s', bField: '10¹³ G', temp: '10⁶ K', count: '~100', description: 'Sporadic radio emitters detected only occasionally. May be an older pulsar population with dying radio beams. Bridge between pulsars and magnetars.', color: '#a78bfa', discovery: '2006' },
  { name: 'Central Compact Object', subtype: 'CCO', period: '0.1–0.4 s', bField: '10¹⁰–¹¹ G', temp: '3×10⁶ K', count: '~10', description: 'Thermally emitting neutron stars at centers of supernova remnants. Anti-magnetars — born with buried magnetic fields that gradually emerge.', color: '#fde68a', discovery: '1999' },
]

const layers: StructureLayer[] = [
  { name: 'Outer Crust', depth: '0–0.5 km', density: '10⁶–⁴×10¹¹ g/cm³', composition: 'Iron-56 lattice + free electrons', color: '#78716c' },
  { name: 'Inner Crust', depth: '0.5–1.5 km', density: '4×10¹¹–2×10¹⁴ g/cm³', composition: 'Neutron-rich nuclei + superfluid neutrons', color: '#6b7280' },
  { name: 'Outer Core', depth: '1.5–8 km', density: '2×10¹⁴–5×10¹⁴ g/cm³', composition: 'Superfluid neutrons + superconducting protons', color: '#4b5563' },
  { name: 'Inner Core', depth: '> 8 km', density: '> 5×10¹⁴ g/cm³', composition: 'Unknown: quark matter? Hyperons? Strange quark soup?', color: '#374151' },
]

const famousPulsars: FamousPulsar[] = [
  { name: 'PSR B1919+21', period: 1337, type: 'Radio', distance: 2300, discovered: 1967, significance: 'First pulsar ever discovered (Jocelyn Bell, 1967). Originally called LGM-1 (Little Green Men).' },
  { name: 'Crab Pulsar', period: 33, type: 'Radio/X-ray/Optical', distance: 6500, discovered: 1968, significance: 'Remnant of SN 1054 (recorded by Chinese astronomers). Powers the Crab Nebula with 100,000 L☉ in pulsar wind.' },
  { name: 'Vela Pulsar', period: 89, type: 'Radio/Gamma', distance: 1000, discovered: 1968, significance: 'Brightest persistent gamma-ray source in the sky. Glitches confirm neutron star superfluidity.' },
  { name: 'PSR B1913+16', period: 59, type: 'Radio (Binary)', distance: 21000, discovered: 1974, significance: 'Hulse-Taylor binary pulsar. Orbital decay matched general relativity — first indirect evidence of gravitational waves. Nobel Prize 1993.' },
  { name: 'PSR J0437-4715', period: 5.757, type: 'Millisecond', distance: 520, discovered: 1993, significance: 'Closest and brightest millisecond pulsar. Used in pulsar timing arrays for low-frequency GW detection.' },
  { name: 'SGR 1806-20', period: 7600, type: 'Magnetar', distance: 50000, discovered: 1979, significance: 'Giant flare in 2004 briefly outshone all gamma-ray sources except the Sun. Energy: 2×10^46 ergs in 0.2 seconds.' },
]

function PulsarCanvas({ type }: { type: NeutronStarType }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    let angle = 0
    let frame: number

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      // Magnetic field lines
      for (let i = 0; i < 8; i++) {
        const phi = (i / 8) * Math.PI * 2
        ctx.beginPath()
        for (let r = 10; r < 80; r += 2) {
          const theta = phi + (r / 80) * Math.PI * 0.3
          const x = cx + Math.cos(theta + angle * 0.3) * r
          const y = cy + Math.sin(theta + angle * 0.3) * r * 0.6
          r === 10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(139,92,246,0.2)`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Neutron star body
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22)
      grad.addColorStop(0, type.color)
      grad.addColorStop(0.6, type.color + '99')
      grad.addColorStop(1, type.color + '22')
      ctx.beginPath()
      ctx.arc(cx, cy, 22, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // Rotation axis
      ctx.beginPath()
      ctx.moveTo(cx, cy - 55)
      ctx.lineTo(cx, cy + 55)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])

      // Emission beams
      const beamAngle = angle + Math.PI * 0.3
      for (const sign of [1, -1]) {
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        const bx = cx + Math.cos(beamAngle) * sign * 90
        const by = cy + Math.sin(beamAngle) * sign * 40
        ctx.lineTo(bx, by)
        const beamGrad = ctx.createLinearGradient(cx, cy, bx, by)
        beamGrad.addColorStop(0, type.color + 'cc')
        beamGrad.addColorStop(1, type.color + '00')
        ctx.strokeStyle = beamGrad
        ctx.lineWidth = 6
        ctx.stroke()
      }

      // Pulse rings (when beam crosses viewer direction ~x-axis)
      const pulseBright = Math.max(0, Math.cos(angle * 2)) ** 8
      if (pulseBright > 0.1) {
        for (let r = 30; r < 90; r += 15) {
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.strokeStyle = type.color + Math.round(pulseBright * 60).toString(16).padStart(2, '0')
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      angle += type.period.includes('ms') ? 0.15 : 0.04
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [type])
  return <canvas ref={ref} width={340} height={200} className="w-full rounded-lg" />
}

type Tab = 'types' | 'structure' | 'famous'

export default function NeutronStars() {
  const [tab, setTab] = useState<Tab>('types')
  const [selected, setSelected] = useState<NeutronStarType>(starTypes[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'types', label: 'Neutron Star Types' },
    { id: 'structure', label: 'Internal Structure' },
    { id: 'famous', label: 'Famous Pulsars' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Neutron Stars & Pulsars</h2>
      <p className="text-gray-400 text-sm mb-5">The densest observable objects — a teaspoon weighs a billion tons</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'types' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {starTypes.map(s => (
              <button key={s.name} onClick={() => setSelected(s)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === s.name ? 'bg-blue-900/40 border border-blue-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold text-white text-sm">{s.name}</span>
                </div>
                <div className="text-gray-500 text-xs">{s.subtype} · P: {s.period}</div>
                <div className="text-gray-500 text-xs mt-0.5">{s.count} known</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <PulsarCanvas type={selected} />
            <div className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selected.color }} />
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <span className="text-xs text-gray-400">First discovered: {selected.discovery}</span>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Period', value: selected.period },
                  { label: 'Magnetic Field', value: selected.bField },
                  { label: 'Surface Temp', value: selected.temp },
                  { label: 'Known Count', value: selected.count },
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

      {tab === 'structure' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-blue-900/20 rounded-lg p-4 border border-blue-800/40">
            Neutron stars are ~10–12 km in radius but up to 2 M☉ in mass. Their cores exceed nuclear density by 5–10×. The equation of state at these densities is unknown — one of the biggest open questions in physics. Gravitational wave measurements from neutron star mergers are beginning to constrain it.
          </p>
          <div className="relative">
            {layers.map((layer, i) => (
              <div key={layer.name} className={`rounded-lg p-4 mb-2 border border-gray-700/50`} style={{ backgroundColor: layer.color + '40', marginLeft: `${i * 12}px`, marginRight: `${i * 12}px` }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-white font-bold">{layer.name}</h4>
                  <span className="text-gray-400 text-sm">{layer.depth}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-gray-500 text-xs">Density</div>
                    <div className="text-white text-sm font-mono">{layer.density}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Composition</div>
                    <div className="text-gray-300 text-sm">{layer.composition}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[
              { stat: '10–12 km', label: 'Radius' },
              { stat: '~2 M☉', label: 'Maximum mass' },
              { stat: '10¹⁴ g/cm³', label: 'Core density' },
            ].map(s => (
              <div key={s.label} className="bg-gradient-to-br from-blue-900/30 to-indigo-900/30 rounded-lg p-4 text-center border border-blue-800/30">
                <div className="text-2xl font-bold text-blue-300">{s.stat}</div>
                <div className="text-gray-400 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'famous' && (
        <div className="space-y-3">
          {famousPulsars.map(p => (
            <div key={p.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-white font-mono font-bold">{p.name}</h4>
                  <div className="text-gray-400 text-sm mt-0.5">{p.type} · {p.distance} ly away · Discovered {p.discovered}</div>
                </div>
                <div className="text-right">
                  <div className="text-blue-300 font-bold text-lg">{p.period < 1000 ? `${p.period} ms` : `${(p.period/1000).toFixed(2)} s`}</div>
                  <div className="text-gray-500 text-xs">period</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm">{p.significance}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
