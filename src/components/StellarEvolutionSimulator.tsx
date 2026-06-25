import { useState, useRef, useEffect, useCallback } from 'react'

interface Stage {
  name: string
  duration: string
  temp: number
  luminosity: number
  radius: number
  color: string
  description: string
}

function getEvolutionPath(massRatio: number): Stage[] {
  if (massRatio < 0.08) {
    return [
      { name: 'Protostar', duration: '~1 Myr', temp: 3000, luminosity: 0.001, radius: 2, color: '#ff6b35', description: 'Molecular cloud collapses under gravity. Not massive enough to fuse hydrogen.' },
      { name: 'Brown Dwarf', duration: '~10 Gyr', temp: 1500, luminosity: 0.0001, radius: 0.1, color: '#8B4513', description: 'Failed star. Fuses deuterium briefly, then slowly cools over billions of years.' },
    ]
  }
  if (massRatio < 0.5) {
    return [
      { name: 'Protostar', duration: '~1 Myr', temp: 3500, luminosity: 0.01, radius: 2, color: '#ff6b35', description: 'Molecular cloud collapses. Protostellar disk forms.' },
      { name: 'Red Dwarf (M-type)', duration: '~10–100 Gyr', temp: 3500, luminosity: 0.04, radius: 0.5, color: '#ff4500', description: 'Fully convective. Burns hydrogen extremely slowly. Will outlive the Universe.' },
      { name: 'White Dwarf', duration: '∞ (cooling)', temp: 10000, luminosity: 0.001, radius: 0.01, color: '#e0e0ff', description: 'No fusion left. Slowly cools over hundreds of billions of years.' },
    ]
  }
  if (massRatio < 2) {
    return [
      { name: 'Protostar', duration: '~1 Myr', temp: 4000, luminosity: 0.5, radius: 3, color: '#ff6b35', description: 'Gravitational contraction heats the core.' },
      { name: 'T Tauri / Pre-MS', duration: '~10 Myr', temp: 4500, luminosity: 0.7, radius: 2, color: '#ff8c00', description: 'Stellar winds blow off surrounding cloud. Li burning begins.' },
      { name: 'Main Sequence (G/K)', duration: `~${(10 / massRatio).toFixed(0)} Gyr`, temp: massRatio < 1 ? 5000 : 5778, luminosity: massRatio < 1 ? 0.4 : 1, radius: massRatio < 1 ? 0.8 : 1, color: massRatio < 1 ? '#ffa500' : '#fff200', description: 'Stable hydrogen fusion in the core. The Sun spends 10 Gyr here.' },
      { name: 'Red Giant (RGB)', duration: '~1–2 Gyr', temp: 4000, luminosity: 100, radius: 30, color: '#ff4500', description: 'Core He ignition after H exhaustion. Shell H-fusion expands the star enormously.' },
      { name: 'Horizontal Branch / AGB', duration: '~200 Myr', temp: 5000, luminosity: 50, radius: 80, color: '#ff6600', description: 'He-burning core plus H+He burning shells. Thermal pulses produce heavy elements.' },
      { name: 'Planetary Nebula', duration: '~20,000 yr', temp: 50000, luminosity: 200, radius: 0.02, color: '#7fffad', description: 'Outer layers ejected at up to 20 km/s, illuminated by the hot core.' },
      { name: 'White Dwarf', duration: '~10+ Gyr', temp: 25000, luminosity: 0.5, radius: 0.013, color: '#ddeeff', description: 'Earth-sized remnant. Supported by electron degeneracy pressure. Slowly cools.' },
    ]
  }
  if (massRatio < 8) {
    return [
      { name: 'Protostar', duration: '~100 kyr', temp: 8000, luminosity: 100, radius: 5, color: '#ff6b35', description: 'Rapidly accreting from disk. Powerful jets from magnetic poles.' },
      { name: 'Main Sequence (A/F)', duration: `~${(2000 / massRatio / massRatio).toFixed(0)} Myr`, temp: massRatio < 3 ? 8500 : 12000, luminosity: Math.pow(massRatio, 3.5), radius: massRatio, color: '#ffffd0', description: 'CNO cycle dominates H-burning. Convective core, radiative envelope.' },
      { name: 'Subgiant / Red Giant', duration: '~100 Myr', temp: 5000, luminosity: Math.pow(massRatio, 3.5) * 10, radius: massRatio * 10, color: '#ff6600', description: 'H exhaustion causes envelope expansion, dramatic luminosity increase.' },
      { name: 'AGB / Carbon Star', duration: '~10 Myr', temp: 3500, luminosity: 10000, radius: massRatio * 50, color: '#ff4444', description: 'He-burning produces C, O, and heavy elements via s-process.' },
      { name: 'Planetary Nebula', duration: '~30,000 yr', temp: 80000, luminosity: 5000, radius: 0.02, color: '#7fffad', description: 'Multiple shell ejections create complex nebular structures.' },
      { name: 'White Dwarf (C/O)', duration: 'Gyr', temp: 30000, luminosity: 1, radius: 0.01, color: '#ddeeff', description: 'Carbon-oxygen core below 1.4 M☉ (Chandrasekhar limit). No more fusion.' },
    ]
  }
  if (massRatio < 25) {
    return [
      { name: 'Protostar', duration: '~10 kyr', temp: 20000, luminosity: 1000, radius: 8, color: '#ff6b35', description: 'Radiation pressure halts accretion. Ultracompact HII region forms.' },
      { name: 'Main Sequence (B-type)', duration: '~20–50 Myr', temp: 20000, luminosity: Math.pow(massRatio, 3.5), radius: massRatio * 0.8, color: '#aaddff', description: 'Rapid H-burning via CNO cycle. Strong stellar winds carry mass away.' },
      { name: 'Red / Blue Supergiant', duration: '~5 Myr', temp: massRatio < 15 ? 4000 : 20000, luminosity: Math.pow(massRatio, 3.5) * 20, radius: massRatio * 100, color: massRatio < 15 ? '#cc4400' : '#8888ff', description: 'Multiple burning shells (H, He, C, Ne, O, Si) form onion-layer structure.' },
      { name: 'Type II Supernova', duration: '~weeks', temp: 500000, luminosity: 1e9, radius: 1e6, color: '#ffffff', description: 'Iron core collapse at 25% c → bounce → shock wave → stellar explosion!' },
      { name: 'Neutron Star', duration: '~Gyr', temp: 1e7, luminosity: 0.00001, radius: 0.000014, color: '#44ffff', description: 'City-sized remnant. 1.4–2 M☉ in 10 km. Surface g = 2×10¹¹ m/s².' },
    ]
  }
  return [
    { name: 'Protostar (O-type)', duration: '~1 kyr', temp: 50000, luminosity: 1e5, radius: 15, color: '#9999ff', description: 'Ionizes surrounding gas before main sequence. Forms HII region hundreds of ly wide.' },
    { name: 'Main Sequence (O-type)', duration: '~3–5 Myr', temp: 40000, luminosity: Math.pow(massRatio, 3.5), radius: massRatio * 0.7, color: '#aaaaff', description: 'Most luminous stable phase. Powerful stellar wind ejects several M☉ of mass.' },
    { name: 'Wolf-Rayet Star', duration: '~300 kyr', temp: 80000, luminosity: 1e6, radius: massRatio * 5, color: '#dd88ff', description: 'Outer layers stripped by winds expose bare He/C/O core. No hydrogen left.' },
    { name: 'Pair Instability (if >130M☉)', duration: 'Seconds', temp: 1e9, luminosity: 1e11, radius: 1e4, color: '#ffffaa', description: 'Gamma rays create e⁺e⁻ pairs, core contracts, oxygen ignition — total disruption!' },
    { name: 'Type Ic SN / Collapsar', duration: '~months', temp: 1e6, luminosity: 1e10, radius: 1e7, color: '#ffffff', description: 'Core collapse without H envelope. May produce long gamma-ray burst.' },
    { name: 'Black Hole', duration: '∞', temp: 0, luminosity: 0, radius: 0.000009 * massRatio, color: '#220044', description: `Schwarzschild radius = ${(3 * massRatio).toFixed(0)} km. Event horizon from which nothing escapes.` },
  ]
}

const MASS_PRESETS = [
  { label: '0.05 M☉', value: 0.05, note: 'Brown dwarf' },
  { label: '0.3 M☉', value: 0.3, note: 'Red dwarf' },
  { label: '0.8 M☉', value: 0.8, note: 'K-type star' },
  { label: '1.0 M☉', value: 1, note: 'Sun-like' },
  { label: '3 M☉', value: 3, note: 'A-type' },
  { label: '8 M☉', value: 8, note: 'B-type' },
  { label: '20 M☉', value: 20, note: 'O-type' },
  { label: '60 M☉', value: 60, note: 'O supergiant' },
  { label: '150 M☉', value: 150, note: 'Extreme' },
]

function tempToColor(temp: number): string {
  if (temp < 2000) return '#6B0000'
  if (temp < 3500) return '#ff2200'
  if (temp < 5000) return '#ff8c00'
  if (temp < 7500) return '#ffe066'
  if (temp < 10000) return '#fffbe0'
  if (temp < 25000) return '#cce0ff'
  if (temp < 80000) return '#aaaaff'
  return '#ffffff'
}

export default function StellarEvolutionSimulator() {
  const [mass, setMass] = useState(1.0)
  const [stageIdx, setStageIdx] = useState(0)
  const [animating, setAnimating] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const pulseRef = useRef(0)

  const stages = getEvolutionPath(mass)
  const stage = stages[Math.min(stageIdx, stages.length - 1)]

  const drawStar = useCallback((t: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#05020f'
    ctx.fillRect(0, 0, W, H)

    // Stars in background
    const starSeed = 42
    for (let i = 0; i < 60; i++) {
      const sx = ((starSeed * (i * 7 + 1)) % 100) / 100 * W
      const sy = ((starSeed * (i * 13 + 3)) % 100) / 100 * H
      const sa = 0.3 + ((i * 17) % 70) / 100
      ctx.fillStyle = `rgba(255,255,255,${sa})`
      ctx.beginPath()
      ctx.arc(sx, sy, 0.7, 0, Math.PI * 2)
      ctx.fill()
    }

    const cx = W / 2
    const cy = H / 2 - 10

    const maxR = Math.min(W, H) * 0.38
    // Map radius: log scale
    const logR = Math.log10(Math.max(0.000009, stage.radius))
    const logMin = Math.log10(0.000009)
    const logMax = Math.log10(1e7)
    const normR = Math.max(0.05, (logR - logMin) / (logMax - logMin))
    const r = Math.max(4, normR * maxR)

    const pulse = 0.97 + 0.03 * Math.sin(t * 3)
    const displayR = r * pulse

    // Glow layers
    const starColor = tempToColor(stage.temp)
    for (let i = 3; i >= 0; i--) {
      const glowR = displayR * (1 + i * 0.6)
      const alpha = 0.08 - i * 0.015
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
      grd.addColorStop(0, starColor + Math.floor(alpha * 255).toString(16).padStart(2, '0'))
      grd.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()
    }

    // Main star body
    const grad = ctx.createRadialGradient(cx - displayR * 0.2, cy - displayR * 0.2, 0, cx, cy, displayR)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.3, starColor)
    grad.addColorStop(1, starColor + '80')
    ctx.beginPath()
    ctx.arc(cx, cy, displayR, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // Black hole special render
    if (stage.name === 'Black Hole') {
      ctx.fillStyle = '#000000'
      ctx.beginPath()
      ctx.arc(cx, cy, displayR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8800ff'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx, cy, displayR * 1.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#aa44ff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, displayR * 2.2, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Supernova special render
    if (stage.name.includes('Supernova') || stage.name.includes('SN')) {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + t
        const len = displayR * (1.5 + 0.5 * Math.sin(t * 4 + i))
        ctx.strokeStyle = `rgba(255,200,100,${0.3 + 0.3 * Math.sin(t * 3 + i)})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx + displayR * 0.5 * Math.cos(ang), cy + displayR * 0.5 * Math.sin(ang))
        ctx.lineTo(cx + len * Math.cos(ang), cy + len * Math.sin(ang))
        ctx.stroke()
      }
    }

    // Neutron star pulsar beam
    if (stage.name === 'Neutron Star') {
      const beamAngle = t * 2
      ctx.strokeStyle = 'rgba(100,255,255,0.4)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(beamAngle) * W, cy + Math.sin(beamAngle) * H)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(100,255,255,0.15)'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(beamAngle) * W, cy + Math.sin(beamAngle) * H)
      ctx.stroke()
    }

    // Planetary nebula shells
    if (stage.name === 'Planetary Nebula') {
      const colors = ['rgba(0,200,100,0.2)', 'rgba(100,150,255,0.15)', 'rgba(255,100,50,0.1)']
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = colors[i]
        ctx.lineWidth = 4 - i
        ctx.beginPath()
        ctx.arc(cx, cy, displayR + (i + 1) * 20 + Math.sin(t + i) * 3, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // Info text
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '11px monospace'
    ctx.fillText(`R = ${stage.radius < 0.001 ? stage.radius.toExponential(1) : stage.radius >= 1000 ? (stage.radius / 1000).toFixed(0) + 'k' : stage.radius.toFixed(2)} R☉`, 8, H - 20)
    ctx.fillText(`T = ${stage.temp.toExponential(2)} K`, 8, H - 6)
  }, [stage])

  useEffect(() => {
    let running = true
    const tick = () => {
      if (!running) return
      pulseRef.current += 0.016
      drawStar(pulseRef.current)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(animRef.current) }
  }, [drawStar])

  useEffect(() => {
    if (!animating) return
    const timer = setInterval(() => {
      setStageIdx(i => {
        if (i >= stages.length - 1) { setAnimating(false); return i }
        return i + 1
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [animating, stages.length])

  const logL = Math.log10(Math.max(0.000001, stage.luminosity))

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">⭐</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Stellar Evolution Simulator</h2>
          <p className="text-yellow-300 text-sm">Birth, life, and death of stars — from brown dwarfs to black holes</p>
        </div>
      </div>

      {/* Mass input */}
      <div className="mb-4">
        <label className="text-sm text-gray-300 mb-1 block">
          Initial Mass: <span className="font-mono text-yellow-300 font-bold">{mass < 1 ? mass.toFixed(2) : mass.toFixed(mass >= 10 ? 0 : 1)} M☉</span>
        </label>
        <input
          type="range" min={0.02} max={150} step={0.01} value={mass}
          onChange={e => { setMass(parseFloat(e.target.value)); setStageIdx(0); setAnimating(false) }}
          className="w-full accent-yellow-400"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0.02 (brown dwarf)</span>
          <span>1 M☉ (Sun)</span>
          <span>150 M☉ (extreme)</span>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-6">
        {MASS_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { setMass(p.value); setStageIdx(0); setAnimating(false) }}
            className={`px-2 py-1 rounded text-xs border transition-all ${Math.abs(mass - p.value) < 0.01 ? 'border-yellow-500 bg-yellow-900/30 text-yellow-300' : 'border-white/20 text-gray-400 hover:border-yellow-500/50'}`}
          >
            {p.label} <span className="text-gray-500">({p.note})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Canvas */}
        <div>
          <canvas
            ref={canvasRef}
            width={320}
            height={280}
            className="w-full rounded-xl border border-white/10"
            style={{ height: 280, background: '#05020f' }}
          />
          {/* Luminosity bar */}
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Luminosity: {stage.luminosity >= 1 ? stage.luminosity.toExponential(1) : stage.luminosity.toFixed(4)} L☉</span>
              <span>log₁₀(L) = {logL.toFixed(2)}</span>
            </div>
            <div className="bg-white/10 h-2 rounded-full">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(2, (logL + 6) / 17 * 100))}%`,
                  backgroundColor: tempToColor(stage.temp),
                }}
              />
            </div>
          </div>
        </div>

        {/* Stage info */}
        <div>
          {/* Stage progression */}
          <div className="mb-3">
            <div className="flex gap-1 flex-wrap mb-2">
              {stages.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => { setStageIdx(i); setAnimating(false) }}
                  className={`text-xs px-2 py-1 rounded transition-all ${i === stageIdx ? 'text-white font-semibold' : 'text-gray-500 hover:text-gray-300'}`}
                  style={i === stageIdx ? { backgroundColor: tempToColor(s.temp) + '50', border: `1px solid ${tempToColor(s.temp)}` } : {}}
                >
                  {i + 1}. {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tempToColor(stage.temp) }} />
              <div className="font-bold text-white text-lg">{stage.name}</div>
            </div>
            <div className="text-xs text-gray-400 mb-3">Duration: <span className="text-white font-mono">{stage.duration}</span></div>
            <p className="text-sm text-gray-300 leading-relaxed mb-3">{stage.description}</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'Surface Temp', value: stage.temp >= 1000 ? `${(stage.temp / 1000).toFixed(0)} kK` : `${stage.temp} K` },
                { label: 'Luminosity', value: `${stage.luminosity >= 1 ? stage.luminosity.toExponential(1) : stage.luminosity.toFixed(4)} L☉` },
                { label: 'Radius', value: `${stage.radius < 0.001 ? stage.radius.toExponential(1) : stage.radius.toFixed(2)} R☉` },
                { label: 'Spectral class', value: stage.temp > 30000 ? 'O' : stage.temp > 10000 ? 'B/A' : stage.temp > 7500 ? 'F' : stage.temp > 6000 ? 'G' : stage.temp > 5200 ? 'K' : 'M/L/T' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/5 rounded p-2">
                  <div className="text-gray-500">{label}</div>
                  <div className="text-white font-mono">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-play */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { setStageIdx(0); setAnimating(true) }}
              className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded-lg font-semibold transition-all"
            >
              ▶ Auto-play Evolution
            </button>
            <button
              onClick={() => setAnimating(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-all"
            >
              ■ Stop
            </button>
          </div>
        </div>
      </div>

      {/* End state summary */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { range: '< 0.5 M☉', end: 'White Dwarf', icon: '⚪', color: '#e0e0ff' },
          { range: '0.5–8 M☉', end: 'White Dwarf', icon: '⚪', color: '#ddeeff' },
          { range: '8–25 M☉', end: 'Neutron Star', icon: '💫', color: '#44ffff' },
          { range: '> 25 M☉', end: 'Black Hole', icon: '⚫', color: '#8800ff' },
          { range: '< 0.08 M☉', end: 'Brown Dwarf', icon: '🟤', color: '#8B4513' },
          { range: '> 130 M☉', end: 'Pair-instability SN', icon: '💥', color: '#ffffff' },
        ].map(item => (
          <div key={item.range} className="bg-white/5 rounded-lg p-2 border border-white/10">
            <div className="text-lg">{item.icon}</div>
            <div className="font-semibold" style={{ color: item.color }}>{item.end}</div>
            <div className="text-gray-500">{item.range}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
