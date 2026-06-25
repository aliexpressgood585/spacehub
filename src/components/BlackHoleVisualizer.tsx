import { useEffect, useRef, useState } from 'react'

// ── Physical constants ───────────────────────────────────────────────────────
const SOLAR_MASS_KG = 1.989e30
const G = 6.674e-11          // m³ kg⁻¹ s⁻²
const C = 2.998e8            // m/s
const HBAR = 1.055e-34       // J·s
const KB = 1.381e-23         // J/K
const AU_M = 1.496e11        // metres per AU
const KM_M = 1e3

// ── Famous black holes ───────────────────────────────────────────────────────
interface FamousBH {
  name: string
  label: string
  massM: number     // solar masses
  location: string
  funFact: string
}

const FAMOUS: FamousBH[] = [
  {
    name: 'Sgr A*',
    label: 'Sagittarius A*',
    massM: 4.15e6,
    location: 'Milky Way center',
    funFact: 'Despite being 4 million times the mass of our Sun, it is surprisingly quiet — astronomers suspect it recently "went to sleep" after a massive meal.',
  },
  {
    name: 'M87*',
    label: 'M87*',
    massM: 6.5e9,
    location: 'Galaxy M87, 55 Mly away',
    funFact: 'First black hole ever photographed (2019). Its shadow is larger than our entire solar system, and it powers a relativistic jet 5,000 light-years long.',
  },
  {
    name: 'Cygnus X-1',
    label: 'Cygnus X-1',
    massM: 21,
    location: 'Milky Way, 7,200 ly',
    funFact: 'First widely accepted stellar-mass black hole (1971). Stephen Hawking lost a famous bet about its nature to Kip Thorne. It rips gas from its companion star HDE 226868.',
  },
  {
    name: 'TON 618',
    label: 'TON 618',
    massM: 6.6e10,
    location: 'Canes Venatici, 10.4 Bly',
    funFact: 'One of the most massive black holes known. Its event horizon is so large that our entire solar system would fit inside 11 times over.',
  },
  {
    name: 'GW150914',
    label: 'GW150914 (merged)',
    massM: 70,
    location: '~1.3 billion ly',
    funFact: 'The first direct gravitational wave detection (LIGO, 2015). Two black holes of ~35 M☉ each spiralled together, releasing more power in 0.2 s than all stars in the observable universe combined.',
  },
]

// ── Physics helpers ──────────────────────────────────────────────────────────
function schwarzschildRadiusKm(massM: number): number {
  // r_s = 2GM/c²  (result in km)
  return (2 * G * massM * SOLAR_MASS_KG) / (C * C * KM_M)
}

function schwarzschildRadiusAU(massM: number): number {
  return (2 * G * massM * SOLAR_MASS_KG) / (C * C * AU_M)
}

function hawkingTemp(massM: number): number {
  // T = ℏc³/(8πGMk_B) ≈ 6.17e-8 K / (M/M☉)
  return (HBAR * C * C * C) / (8 * Math.PI * G * massM * SOLAR_MASS_KG * KB)
}

function timeDilationFactor(massM: number): number {
  // Gravitational redshift at r = 3r_s: sqrt(1 - r_s/r) = sqrt(1 - 1/3) = sqrt(2/3)
  // More precisely: sqrt(1 - 2GM/(rc²)) at r=3r_s => sqrt(1-1/3)
  return Math.sqrt(1 - 1 / 3)
}

function isSpaghettified(massM: number): boolean {
  // Tidal force at horizon ~ 2GMm/r_s³. Human survives if r_s is large enough.
  // Critical mass ≈ 1e8 M☉ (supermassive BH: horizon > human body)
  return massM < 1e6
}

// ── Star seed ───────────────────────────────────────────────────────────────
interface Star { x: number; y: number; r: number; alpha: number }

function generateStars(w: number, h: number, count: number): Star[] {
  const rng = (seed: number) => {
    let s = seed
    return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
  }
  const rand = rng(42)
  return Array.from({ length: count }, () => ({
    x: rand() * w,
    y: rand() * h,
    r: rand() * 1.4 + 0.3,
    alpha: rand() * 0.6 + 0.4,
  }))
}

// ── Canvas renderer ──────────────────────────────────────────────────────────
function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  stars: Star[],
): void {
  const cx = w / 2
  const cy = h / 2

  // Background
  ctx.fillStyle = '#020510'
  ctx.fillRect(0, 0, w, h)

  // Stars
  for (const s of stars) {
    const twinkle = 0.6 + 0.4 * Math.sin(t * 1.2 + s.x)
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${s.alpha * twinkle})`
    ctx.fill()
  }

  // ── Accretion disk ───────────────────────────────────────────────────────
  const bhR = 48
  const diskInner = bhR * 1.15
  const diskOuter = bhR * 3.2

  // Outer glow layers (behind BH)
  const glowPulse = 0.7 + 0.3 * Math.sin(t * 0.8)
  for (let layer = 0; layer < 6; layer++) {
    const frac = layer / 5
    const glowR = diskOuter * (1.05 + frac * 0.6)
    const glowGrad = ctx.createRadialGradient(cx, cy, diskInner, cx, cy, glowR)
    glowGrad.addColorStop(0, `rgba(255,160,30,${0.08 * glowPulse * (1 - frac)})`)
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.beginPath()
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
    ctx.fillStyle = glowGrad
    ctx.fill()
  }

  // Disk itself — drawn as 2 half-ellipses with color rotation
  const colorAngle = t * 0.18  // slow rotation
  ctx.save()
  ctx.translate(cx, cy)

  // Draw elliptical disk (perspective tilt)
  const drawDiskHalf = (yScale: number, alpha: number) => {
    ctx.save()
    ctx.scale(1, yScale)
    const diskGrad = ctx.createRadialGradient(0, 0, diskInner, 0, 0, diskOuter)

    // Rotating hue offset
    const hue1 = (30 + Math.sin(colorAngle) * 20 + 360) % 360          // near white-yellow
    const hue2 = (18 + Math.cos(colorAngle * 0.7) * 15 + 360) % 360    // orange
    const hue3 = (0 + Math.sin(colorAngle * 0.5) * 10 + 360) % 360     // red

    diskGrad.addColorStop(0, `hsla(${hue1},100%,95%,${alpha})`)
    diskGrad.addColorStop(0.15, `hsla(${hue1},100%,80%,${alpha * 0.95})`)
    diskGrad.addColorStop(0.4, `hsla(${hue2},100%,55%,${alpha * 0.8})`)
    diskGrad.addColorStop(0.7, `hsla(${hue3},90%,40%,${alpha * 0.6})`)
    diskGrad.addColorStop(1, `rgba(60,0,0,0)`)

    ctx.beginPath()
    ctx.arc(0, 0, diskOuter, 0, Math.PI * 2)
    ctx.fillStyle = diskGrad
    ctx.fill()
    ctx.restore()
  }

  // Back half (behind BH, drawn first so BH occludes it)
  drawDiskHalf(0.32, 0.88)

  ctx.restore()

  // ── Light ray bending (gravitational lensing lines) ─────────────────────
  const rayCount = 16
  ctx.save()
  ctx.translate(cx, cy)
  for (let i = 0; i < rayCount; i++) {
    const baseAngle = (i / rayCount) * Math.PI * 2 + t * 0.04
    const startDist = diskOuter * 1.6
    const sx = Math.cos(baseAngle) * startDist
    const sy = Math.sin(baseAngle) * startDist * 0.5

    // Control point bends toward center
    const bendFactor = 0.55 + 0.15 * Math.sin(t * 0.3 + i)
    const cpx = sx * bendFactor * 0.4
    const cpy = sy * bendFactor * 0.4

    // End point: opposite side, slightly offset
    const endAngle = baseAngle + Math.PI + 0.35 * Math.sin(baseAngle + t * 0.05)
    const endDist = diskOuter * 1.4
    const ex = Math.cos(endAngle) * endDist
    const ey = Math.sin(endAngle) * endDist * 0.5

    const alpha = 0.06 + 0.04 * Math.sin(t * 0.5 + i * 0.7)
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    ctx.strokeStyle = `rgba(180,200,255,${alpha})`
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  ctx.restore()

  // ── Black hole (drawn over disk back-half, under disk front-half) ─────
  // Photon sphere ring (1.5 × Schwarzschild = 1.5 × bhR scale)
  const photonR = bhR * 1.5
  ctx.save()
  ctx.translate(cx, cy)
  const photonPulse = 0.5 + 0.5 * Math.sin(t * 1.1)
  const photonGrad = ctx.createRadialGradient(0, 0, photonR - 3, 0, 0, photonR + 6)
  photonGrad.addColorStop(0, `rgba(140,160,255,0)`)
  photonGrad.addColorStop(0.4, `rgba(140,160,255,${0.18 * photonPulse})`)
  photonGrad.addColorStop(1, `rgba(100,120,220,0)`)
  ctx.beginPath()
  ctx.arc(0, 0, photonR + 6, 0, Math.PI * 2)
  ctx.fillStyle = photonGrad
  ctx.fill()
  // Thin ring stroke
  ctx.beginPath()
  ctx.arc(0, 0, photonR, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(160,180,255,${0.22 * photonPulse})`
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.restore()

  // Black hole body with edge glow
  ctx.save()
  ctx.translate(cx, cy)
  const edgeGrad = ctx.createRadialGradient(0, 0, bhR * 0.7, 0, 0, bhR * 1.08)
  edgeGrad.addColorStop(0, '#000000')
  edgeGrad.addColorStop(0.85, '#080408')
  edgeGrad.addColorStop(1, `rgba(90,40,120,${0.5 + 0.2 * Math.sin(t * 0.9)})`)
  ctx.beginPath()
  ctx.arc(0, 0, bhR, 0, Math.PI * 2)
  ctx.fillStyle = edgeGrad
  ctx.fill()
  ctx.restore()

  // Front half of disk (in front of BH)
  ctx.save()
  ctx.translate(cx, cy)
  // Clip to front semicircle (bottom half in screen space = front of tilted disk)
  ctx.beginPath()
  ctx.rect(-diskOuter * 1.1, 0, diskOuter * 2.2, diskOuter * 0.5)
  ctx.clip()
  const frontGrad = ctx.createRadialGradient(0, 0, diskInner, 0, 0, diskOuter)
  const hf1 = (30 + Math.sin(colorAngle) * 20 + 360) % 360
  const hf2 = (18 + Math.cos(colorAngle * 0.7) * 15 + 360) % 360
  const hf3 = (0 + Math.sin(colorAngle * 0.5) * 10 + 360) % 360
  frontGrad.addColorStop(0, `hsla(${hf1},100%,95%,0.95)`)
  frontGrad.addColorStop(0.15, `hsla(${hf1},100%,80%,0.90)`)
  frontGrad.addColorStop(0.4, `hsla(${hf2},100%,55%,0.80)`)
  frontGrad.addColorStop(0.7, `hsla(${hf3},90%,40%,0.55)`)
  frontGrad.addColorStop(1, `rgba(60,0,0,0)`)
  ctx.beginPath()
  ctx.ellipse(0, 0, diskOuter, diskOuter * 0.32, 0, 0, Math.PI * 2)
  ctx.fillStyle = frontGrad
  ctx.fill()
  ctx.restore()

  // ── Labels ────────────────────────────────────────────────────────────────
  ctx.save()
  ctx.font = '11px "Space Grotesk", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(160,180,255,0.7)'
  ctx.textAlign = 'center'

  // Event horizon label
  ctx.fillText('Event Horizon', cx, cy - bhR - 10)

  // Photon sphere label
  ctx.fillStyle = 'rgba(120,140,220,0.55)'
  ctx.fillText('Photon Sphere (1.5 r_s)', cx + photonR + 2, cy - photonR * 0.25)

  ctx.restore()
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BlackHoleVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const starsRef = useRef<Star[]>([])

  const [massM, setMassM] = useState(10)

  // ── Derived physics ──────────────────────────────────────────────────────
  const rsKm = schwarzschildRadiusKm(massM)
  const rsAU = schwarzschildRadiusAU(massM)
  const tHawking = hawkingTemp(massM)
  const dilFactor = timeDilationFactor(massM)
  const spaghettified = isSpaghettified(massM)
  const isSMBH = massM >= 1e6

  // ── Canvas animation ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.offsetWidth || 800
    const H = 400
    canvas.width = W
    canvas.height = H

    if (starsRef.current.length === 0) {
      starsRef.current = generateStars(W, H, 180)
    }

    let start: number | null = null

    const frame = (ts: number) => {
      if (start === null) start = ts
      const t = (ts - start) / 1000
      drawFrame(ctx, W, H, t, starsRef.current)
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)

    const handleResize = () => {
      const newW = canvas.offsetWidth || 800
      canvas.width = newW
      canvas.height = H
      starsRef.current = generateStars(newW, H, 180)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // ── Formatting helpers ───────────────────────────────────────────────────
  const formatRs = () => {
    if (isSMBH) {
      return rsAU >= 1
        ? `${rsAU.toFixed(2)} AU`
        : `${(rsAU * 1000).toFixed(3)} mAU`
    }
    return rsKm >= 1 ? `${rsKm.toFixed(2)} km` : `${(rsKm * 1000).toFixed(1)} m`
  }

  const formatTemp = () => {
    if (tHawking < 1e-6) return `${(tHawking * 1e9).toExponential(2)} nK`
    if (tHawking < 1e-3) return `${(tHawking * 1e6).toExponential(2)} μK`
    if (tHawking < 1) return `${(tHawking * 1000).toExponential(2)} mK`
    return `${tHawking.toExponential(3)} K`
  }

  const formatMass = (m: number) => {
    if (m >= 1e9) return `${(m / 1e9).toFixed(2)}B M☉`
    if (m >= 1e6) return `${(m / 1e6).toFixed(2)}M M☉`
    if (m >= 1e3) return `${(m / 1e3).toFixed(1)}k M☉`
    return `${m.toFixed(1)} M☉`
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="mb-5">
        <span className="section-label mb-3 inline-flex">
          ◉ BLACK HOLE PHYSICS
        </span>
        <h2 className="text-2xl font-bold gradient-text mt-2">
          Black Hole Visualizer
        </h2>
        <p className="text-sm text-white/40 mt-1">
          Interactive gravitational lensing · Schwarzschild physics · Hawking radiation
        </p>
      </div>

      {/* Canvas */}
      <div className="relative w-full rounded-2xl overflow-hidden mb-6"
           style={{ height: 400, background: '#020510', border: '1px solid rgba(99,102,241,0.15)' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        {/* Corner labels */}
        <div className="absolute top-3 left-4 text-xs text-white/30 font-mono">
          Gravitational Lensing Simulation
        </div>
        <div className="absolute bottom-3 right-4 text-xs text-white/20 font-mono">
          Photon sphere @ 1.5 r_s · Accretion disk rotation
        </div>
      </div>

      {/* Mass Slider */}
      <div className="mb-6 p-4 rounded-xl"
           style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-white/80">
            Black Hole Mass
          </label>
          <div className="text-right">
            <span className="text-lg font-bold gradient-text">{formatMass(massM)}</span>
            <span className="text-xs text-white/40 ml-2">solar masses</span>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={massM}
          onChange={e => setMassM(Number(e.target.value))}
          className="w-full accent-indigo-500"
          style={{ height: 4, cursor: 'pointer' }}
        />
        <div className="flex justify-between text-xs text-white/30 mt-1">
          <span>1 M☉ (stellar)</span>
          <span>100 M☉ (massive stellar)</span>
        </div>
      </div>

      {/* Calculator grid */}
      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
        {/* Schwarzschild radius */}
        <div className="stat-card">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Schwarzschild r</div>
          <div className="text-xl font-bold gradient-text-gold">{formatRs()}</div>
          <div className="text-xs text-white/30 mt-1">r_s = 2GM/c²</div>
          {isSMBH && (
            <div className="text-xs text-indigo-400 mt-1">{rsAU.toFixed(3)} AU</div>
          )}
        </div>

        {/* Event horizon note */}
        <div className="stat-card">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Event Horizon</div>
          <div className="text-sm font-semibold text-red-400">No escape</div>
          <div className="text-xs text-white/30 mt-1">beyond this radius</div>
          <div className="text-xs text-white/50 mt-1">{formatRs()} from center</div>
        </div>

        {/* Hawking temperature */}
        <div className="stat-card">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Hawking Temp</div>
          <div className="text-xl font-bold" style={{ color: '#60a5fa' }}>{formatTemp()}</div>
          <div className="text-xs text-white/30 mt-1">T = ℏc³/(8πGMk_B)</div>
        </div>

        {/* Time dilation */}
        <div className="stat-card">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Time Dilation @ 3r_s</div>
          <div className="text-xl font-bold" style={{ color: '#34d399' }}>
            {dilFactor.toFixed(4)}
          </div>
          <div className="text-xs text-white/30 mt-1">√(1 − r_s/r) redshift</div>
          <div className="text-xs text-white/50 mt-1">
            1 hr here = {(1 / dilFactor).toFixed(3)} hr far away
          </div>
        </div>
      </div>

      {/* Spaghettification alert */}
      <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${
        spaghettified
          ? 'bg-red-500/10 border border-red-500/25'
          : 'bg-green-500/10 border border-green-500/20'
      }`}>
        <span className="text-xl mt-0.5">{spaghettified ? '💀' : '✅'}</span>
        <div>
          <div className={`text-sm font-semibold ${spaghettified ? 'text-red-400' : 'text-green-400'}`}>
            {spaghettified
              ? 'Tidal Spaghettification: YES'
              : 'Tidal Spaghettification: No (SMBH)'}
          </div>
          <div className="text-xs text-white/50 mt-1">
            {spaghettified
              ? `A human approaching the ${formatMass(massM)} event horizon would be stretched into a thin stream of particles — tidal force F = 2GMm/r³ exceeds biological limits long before crossing.`
              : `This supermassive black hole's event horizon is so vast (${formatRs()}) that tidal forces there are gentle — a human could cross it without immediate harm. The doom comes later.`}
          </div>
        </div>
      </div>

      {/* Famous black holes */}
      <div className="mb-3">
        <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">
          Famous Black Holes
        </h3>
        <div
          className="flex gap-3 pb-2"
          style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}
        >
          {FAMOUS.map(bh => {
            const bhRsKm = schwarzschildRadiusKm(bh.massM)
            const bhRsAU = schwarzschildRadiusAU(bh.massM)
            const isBig = bh.massM >= 1e6
            const rsDisplay = isBig
              ? `${bhRsAU.toFixed(1)} AU`
              : `${bhRsKm.toFixed(2)} km`

            return (
              <div
                key={bh.name}
                className="glass-card rounded-xl p-4 card-hover flex-shrink-0"
                style={{ minWidth: 220, maxWidth: 240, border: '1px solid rgba(99,102,241,0.18)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-6 h-6 rounded-full flex-shrink-0"
                    style={{
                      background: 'radial-gradient(circle at 35% 35%, #333, #000)',
                      boxShadow: '0 0 8px rgba(255,140,0,0.5)',
                    }}
                  />
                  <div>
                    <div className="text-sm font-bold text-white">{bh.label}</div>
                    <div className="text-xs text-white/40">{bh.location}</div>
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">Mass</span>
                    <span className="font-semibold gradient-text-gold">{formatMass(bh.massM)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">r_s</span>
                    <span className="font-mono text-indigo-300">{rsDisplay}</span>
                  </div>
                </div>

                <p className="text-xs text-white/45 leading-relaxed line-clamp-3">
                  {bh.funFact}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer note */}
      <div className="text-xs text-white/25 text-center mt-4 pt-4"
           style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        Physics constants: G = 6.674×10⁻¹¹, c = 2.998×10⁸ m/s, ℏ = 1.055×10⁻³⁴ J·s
        &nbsp;·&nbsp; Visualization is artistic — not a numerical GR simulation
      </div>
    </div>
  )
}
