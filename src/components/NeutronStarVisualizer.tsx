import { useState, useRef, useEffect, useCallback } from 'react'

interface PulsarType {
  name: string
  period_ms: number
  bField_T: number
  age_yr: number
  type: string
  distance_ly: number
  description: string
}

const PULSARS: PulsarType[] = [
  { name: 'Crab Pulsar (B0531+21)', period_ms: 33, bField_T: 3.8e8, age_yr: 970, type: 'Young', distance_ly: 6500, description: 'Born in the supernova of 1054 AD, observed by Chinese astronomers. Powers the Crab Nebula with its wind.' },
  { name: 'Vela Pulsar', period_ms: 89, bField_T: 3.4e8, age_yr: 11000, type: 'Young', distance_ly: 1000, description: 'One of the brightest X-ray and gamma-ray pulsars. Embedded in the Vela supernova remnant.' },
  { name: 'PSR B1937+21', period_ms: 1.558, bField_T: 4.1e5, age_yr: 2.4e8, type: 'Millisecond', distance_ly: 13700, description: 'First millisecond pulsar discovered (1982). Spins 642 times per second — faster than a kitchen blender!' },
  { name: 'PSR J0437-4715', period_ms: 5.757, bField_T: 2.8e5, age_yr: 7e9, type: 'Millisecond', distance_ly: 510, description: 'Nearest millisecond pulsar. Used for gravitational wave detection via Pulsar Timing Arrays.' },
  { name: 'SGR 1806-20 (Magnetar)', period_ms: 7500, bField_T: 1.6e11, age_yr: 1000, type: 'Magnetar', distance_ly: 50000, description: 'Strongest known magnetic field in the universe. 2004 flare released more energy than the Sun emits in 250,000 years.' },
  { name: 'Double Pulsar PSR J0737-3039A', period_ms: 22.7, bField_T: 6.9e7, age_yr: 200e6, type: 'Binary', distance_ly: 2000, description: 'Only known double pulsar system. Perfect laboratory for testing general relativity to exquisite precision.' },
]

const NS_LAYERS = [
  { name: 'Atmosphere', thick: 2, color: '#93c5fd', density: '~1 kg/m³', desc: 'Thin layer of hot plasma, just millimeters thick' },
  { name: 'Outer Crust', thick: 8, color: '#60a5fa', density: '~4×10⁶ kg/m³', desc: 'Normal nuclei in electron sea; becomes increasingly neutron-rich' },
  { name: 'Inner Crust', thick: 12, color: '#3b82f6', density: '~10¹⁴ kg/m³', desc: 'Neutron-rich nuclei + free neutrons; superfluid neutrons may exist' },
  { name: 'Outer Core', thick: 30, color: '#1d4ed8', density: '~5×10¹⁷ kg/m³', desc: 'Pure neutron superfluid; possibly proton superconductor' },
  { name: 'Inner Core', thick: 48, color: '#1e3a8a', density: '~10¹⁸ kg/m³', desc: 'Unknown: quark-gluon plasma? Hyperons? Strange matter?' },
]

export default function NeutronStarVisualizer() {
  const [selectedPulsar, setSelectedPulsar] = useState<PulsarType>(PULSARS[0])
  const [showLayer, setShowLayer] = useState<number | null>(null)
  const [animating, setAnimating] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const tRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Background
    const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6)
    bgGrad.addColorStop(0, '#050a2e')
    bgGrad.addColorStop(1, '#020510')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    // Stars
    for (let i = 0; i < 80; i++) {
      const sx = (((i * 137 + 17) % 100) / 100) * W
      const sy = (((i * 61 + 43) % 100) / 100) * H
      const sa = 0.2 + ((i * 29) % 80) / 100
      ctx.fillStyle = `rgba(255,255,255,${sa})`
      ctx.beginPath()
      ctx.arc(sx, sy, 0.8, 0, Math.PI * 2)
      ctx.fill()
    }

    const cx = W / 2
    const cy = H / 2
    const t = tRef.current

    // Rotation period in seconds (scale down for visibility)
    const period = Math.max(0.5, selectedPulsar.period_ms / 33) // normalize: Crab = 0.5s visible
    const rotation = (t / period) * Math.PI * 2

    // Pulsar beams (two opposite poles)
    const isMagnetar = selectedPulsar.type === 'Magnetar'
    const beamColor = isMagnetar ? '#ff6666' : '#66ffff'
    const beamWidth = isMagnetar ? 18 : 10
    for (let pole = 0; pole < 2; pole++) {
      const angle = rotation + pole * Math.PI + (isMagnetar ? Math.sin(t * 0.3) * 0.4 : 0)
      for (let layer = 0; layer < 3; layer++) {
        const alpha = 0.4 - layer * 0.12
        const lw = beamWidth - layer * 4
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(angle)
        ctx.strokeStyle = beamColor.replace(')', `,${alpha})`.replace('rgb', 'rgba'))
        ctx.lineWidth = lw
        ctx.lineCap = 'round'
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(W * 0.8, 0)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.restore()
      }
    }

    // Magnetic field lines
    ctx.strokeStyle = isMagnetar ? 'rgba(255,100,100,0.15)' : 'rgba(100,200,255,0.15)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rotation * 0.1
      ctx.beginPath()
      for (let j = 0; j <= 40; j++) {
        const r = 28 + j * 2.5
        const curveAngle = angle + Math.sin(j * 0.2) * 0.8
        const px = cx + r * Math.cos(curveAngle)
        const py = cy + r * Math.sin(curveAngle) * 0.5
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    // Glow rings (emission)
    const pulsePhase = (t * 1000 / selectedPulsar.period_ms) % 1
    for (let ring = 0; ring < 3; ring++) {
      const ringR = 25 + (pulsePhase + ring * 0.33) % 1 * 60
      const ringAlpha = Math.max(0, 0.3 - ((pulsePhase + ring * 0.33) % 1) * 0.3)
      ctx.strokeStyle = isMagnetar ? `rgba(255,100,100,${ringAlpha})` : `rgba(100,200,255,${ringAlpha})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Neutron star layers (cross-section half-sphere)
    const baseR = 24
    NS_LAYERS.forEach((layer, i) => {
      const outerR = baseR + (NS_LAYERS.slice(0, i + 1).reduce((s, l) => s + l.thick, 0) / 100) * baseR
      const highlighted = showLayer === i
      const alpha = highlighted ? 1 : 0.85

      const grad = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, outerR)
      grad.addColorStop(0, layer.color + (highlighted ? 'ff' : 'cc'))
      grad.addColorStop(1, layer.color + '44')
      ctx.fillStyle = grad
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      // Layer border
      ctx.strokeStyle = highlighted ? '#ffffff' : 'rgba(255,255,255,0.1)'
      ctx.lineWidth = highlighted ? 2 : 0.5
      ctx.beginPath()
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
      ctx.stroke()

    })

    // Hotspot at poles
    for (const yMul of [-1, 1]) {
      const grad = ctx.createRadialGradient(cx, cy + yMul * 24, 0, cx, cy + yMul * 24, 10)
      grad.addColorStop(0, isMagnetar ? 'rgba(255,200,200,0.9)' : 'rgba(200,220,255,0.9)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy + yMul * 24, 10, 0, Math.PI * 2)
      ctx.fill()
    }

    tRef.current += 0.016

    if (animating) {
      animRef.current = requestAnimationFrame(draw)
    }
  }, [selectedPulsar, showLayer, animating])

  useEffect(() => {
    if (animating) {
      animRef.current = requestAnimationFrame(draw)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [draw, animating])

  useEffect(() => {
    if (!animating) draw()
  }, [showLayer, animating, draw])

  const fluxDensity = (bField: number) => {
    if (bField > 1e10) return 'Magnetar (rips atoms apart)'
    if (bField > 1e8) return 'Young pulsar (extreme)'
    return 'Recycled millisecond pulsar'
  }

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">💫</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Neutron Star Explorer</h2>
          <p className="text-cyan-300 text-sm">Pulsars, magnetars & the densest matter in the Universe</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Canvas */}
        <div>
          <canvas
            ref={canvasRef}
            width={320}
            height={320}
            className="w-full rounded-xl border border-white/10"
            style={{ height: 280 }}
          />
          <button
            onClick={() => setAnimating(a => !a)}
            className="mt-2 px-4 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
          >
            {animating ? '⏸ Pause' : '▶ Resume'}
          </button>

          {/* Layer selector */}
          <div className="mt-3">
            <div className="text-xs text-gray-400 mb-2">Internal structure (click to inspect):</div>
            <div className="space-y-1">
              {NS_LAYERS.map((layer, i) => (
                <button
                  key={layer.name}
                  onClick={() => setShowLayer(showLayer === i ? null : i)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${showLayer === i ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: layer.color }} />
                  <div>
                    <span className="font-medium">{layer.name}</span>
                    <span className="text-gray-500 ml-2">{layer.density}</span>
                  </div>
                </button>
              ))}
              {showLayer !== null && (
                <div className="px-3 py-2 bg-blue-900/20 rounded-lg border border-blue-500/20 text-xs text-blue-200">
                  {NS_LAYERS[showLayer].desc}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div>
          <div className="text-xs text-gray-400 mb-2">Select a pulsar:</div>
          <div className="space-y-1 mb-4">
            {PULSARS.map(p => (
              <button
                key={p.name}
                onClick={() => { setSelectedPulsar(p); tRef.current = 0 }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${selectedPulsar.name === p.name ? 'bg-cyan-900/30 border border-cyan-500/50 text-cyan-300' : 'bg-white/5 border border-white/10 text-gray-300 hover:border-cyan-500/30'}`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 px-1.5 py-0.5 rounded text-xs" style={{
                  backgroundColor: p.type === 'Magnetar' ? '#ef444420' : p.type === 'Millisecond' ? '#8b5cf620' : '#1d4ed820',
                  color: p.type === 'Magnetar' ? '#ef4444' : p.type === 'Millisecond' ? '#8b5cf6' : '#60a5fa',
                }}>
                  {p.type}
                </span>
              </button>
            ))}
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="font-bold text-white mb-1">{selectedPulsar.name}</div>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">{selectedPulsar.description}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'Spin period', value: selectedPulsar.period_ms >= 1000 ? `${(selectedPulsar.period_ms / 1000).toFixed(2)} s` : `${selectedPulsar.period_ms} ms` },
                { label: 'Spin rate', value: `${(1000 / selectedPulsar.period_ms).toFixed(1)} Hz` },
                { label: 'B-field', value: `${selectedPulsar.bField_T.toExponential(1)} T` },
                { label: 'B-field class', value: fluxDensity(selectedPulsar.bField_T) },
                { label: 'Age', value: selectedPulsar.age_yr >= 1e6 ? `${(selectedPulsar.age_yr / 1e6).toFixed(1)} Myr` : `${(selectedPulsar.age_yr / 1000).toFixed(0)} kyr` },
                { label: 'Distance', value: `${selectedPulsar.distance_ly.toLocaleString()} ly` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/5 rounded p-2">
                  <div className="text-gray-500">{label}</div>
                  <div className="text-cyan-300 font-mono text-xs mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fast facts */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-xs">
        {[
          { icon: '⚖️', label: 'Typical mass', value: '1.4 M☉', sub: 'In ~10 km diameter' },
          { icon: '🏋️', label: 'Surface gravity', value: '2×10¹¹ m/s²', sub: '2×10¹⁰ × Earth\'s' },
          { icon: '🧲', label: 'Max B-field', value: '10¹¹ T', sub: '10¹⁵ × Earth\'s' },
          { icon: '🌡️', label: 'Core temp (young)', value: '~10¹¹ K', sub: 'Cools via neutrinos' },
        ].map(f => (
          <div key={f.label} className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-xl mb-1">{f.icon}</div>
            <div className="text-gray-400">{f.label}</div>
            <div className="font-bold text-cyan-300 font-mono">{f.value}</div>
            <div className="text-gray-600 mt-0.5">{f.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
