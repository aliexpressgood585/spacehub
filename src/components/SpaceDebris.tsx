import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebrisParticle {
  /** Orbital band: 0 = LEO, 1 = MEO, 2 = GEO */
  band: 0 | 1 | 2
  /** Normalised orbital radius (canvas units, computed at draw time) */
  radiusFactor: number
  /** Initial angle in radians, randomised per particle */
  phase: number
  /** Angular velocity in radians per second (scaled for visualisation) */
  angularSpeed: number
  /** Dot radius in px */
  dotRadius: number
  /** CSS colour string */
  color: string
}

interface DebrisEvent {
  year: number
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATS = {
  tracked: 27_000,
  untracked: 900_000,
  activeSatellites: 7_500,
  defunctSatellites: 3_000,
  missionDebris: 2_000,
}

const DEBRIS_EVENTS: DebrisEvent[] = [
  {
    year: 1957,
    title: 'Sputnik 1 — The Beginning',
    description: 'First artificial satellite launched by the USSR, opening the space age and starting humanity\'s presence in orbit.',
    impact: 'low',
  },
  {
    year: 2007,
    title: 'Chinese ASAT Test (SC-19)',
    description: 'China destroyed its Fengyun-1C weather satellite, generating 3,000+ tracked fragments and ~35,000 estimated pieces >1cm.',
    impact: 'high',
  },
  {
    year: 2009,
    title: 'Iridium 33 / Cosmos 2251 Collision',
    description: 'First accidental hypervelocity collision between two intact satellites, adding ~2,300 tracked fragments to LEO.',
    impact: 'high',
  },
  {
    year: 2019,
    title: 'India ASAT Test — Mission Shakti',
    description: 'India demonstrated ASAT capability by destroying Microsat-R at ~283km altitude. Most debris re-entered within months due to low altitude.',
    impact: 'medium',
  },
  {
    year: 2021,
    title: 'Russian ASAT Test (Nudol PL19)',
    description: 'Russia destroyed Cosmos 1408 at ~480km, creating 1,500+ tracked fragments and forcing ISS crew to shelter.',
    impact: 'high',
  },
  {
    year: 2022,
    title: 'Starlink / Cosmos Near-Miss',
    description: 'OneWeb reported a near-collision with a Starlink satellite. Highlighted growing conjunction risks as mega-constellations expand.',
    impact: 'medium',
  },
]

// ─── Particle factory ─────────────────────────────────────────────────────────

/**
 * Generate debris particles for all three orbital bands.
 *
 * Orbital visualisation is not to scale — rings are spaced for clarity.
 *
 * Band radii (as fraction of half canvas width, excluding Earth radius):
 *   LEO  band centre ≈ 0.35–0.55 (visualisation)
 *   MEO  band centre ≈ 0.60–0.75
 *   GEO  band centre ≈ 0.85
 *
 * Angular speeds are compressed to be visible:
 *   LEO ~90-min orbit → fastest  (2π / 5400 s, scaled ×50 000)
 *   MEO ~12-hr orbit  → medium   (2π / 43200 s, scaled ×50 000)
 *   GEO 24-hr orbit   → slowest  (2π / 86400 s, scaled ×50 000)
 */
function buildParticles(): DebrisParticle[] {
  const particles: DebrisParticle[] = []

  const rng = () => Math.random()

  // Colour helper
  const colorForSize = (size: 'small' | 'trackable' | 'large'): string => {
    if (size === 'small') return 'rgba(220,220,220,0.85)'
    if (size === 'trackable') return 'rgba(250,204,21,0.90)'
    return 'rgba(251,146,60,0.95)'
  }

  // LEO — ~50 particles, fastest, densest debris region
  const leoBaseSpeed = (2 * Math.PI) / 5400 // rad/s real; we scale below
  for (let i = 0; i < 50; i++) {
    const rf = 0.33 + rng() * 0.20          // band width within [0.33, 0.53]
    const speedVariance = 0.8 + rng() * 0.4  // ±20% variance
    // Scale factor: compress 90-min orbit to ~30s visual period for LEO
    const visualScale = 5400 / 30
    const sizes: Array<'small' | 'trackable' | 'large'> = ['small', 'small', 'small', 'trackable']
    const size = sizes[Math.floor(rng() * sizes.length)]
    particles.push({
      band: 0,
      radiusFactor: rf,
      phase: rng() * 2 * Math.PI,
      angularSpeed: leoBaseSpeed * visualScale * speedVariance,
      dotRadius: size === 'small' ? 1.5 : 2.5,
      color: colorForSize(size),
    })
  }

  // MEO — ~15 particles, medium speed (GPS region)
  const meoBaseSpeed = (2 * Math.PI) / 43200
  for (let i = 0; i < 15; i++) {
    const rf = 0.57 + rng() * 0.14
    const speedVariance = 0.85 + rng() * 0.3
    const visualScale = 43200 / 45
    const sizes: Array<'small' | 'trackable' | 'large'> = ['small', 'trackable', 'trackable']
    const size = sizes[Math.floor(rng() * sizes.length)]
    particles.push({
      band: 1,
      radiusFactor: rf,
      phase: rng() * 2 * Math.PI,
      angularSpeed: meoBaseSpeed * visualScale * speedVariance,
      dotRadius: size === 'small' ? 2 : 3,
      color: colorForSize(size),
    })
  }

  // GEO — ~20 particles, slowest, larger objects (defunct satellites, rocket bodies)
  const geoBaseSpeed = (2 * Math.PI) / 86400
  for (let i = 0; i < 20; i++) {
    const rf = 0.83 + rng() * 0.06          // narrow ring at GEO
    const speedVariance = 0.95 + rng() * 0.1
    const visualScale = 86400 / 80
    const sizes: Array<'trackable' | 'large'> = ['trackable', 'large']
    const size = sizes[Math.floor(rng() * sizes.length)]
    particles.push({
      band: 2,
      radiusFactor: rf,
      phase: rng() * 2 * Math.PI,
      angularSpeed: geoBaseSpeed * visualScale * speedVariance,
      dotRadius: size === 'trackable' ? 3 : 4,
      color: colorForSize(size),
    })
  }

  return particles
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpaceDebris() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<DebrisParticle[]>(buildParticles())
  const animFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  const [activeEvent, setActiveEvent] = useState<number | null>(null)

  // ── Canvas animation ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const SIZE = 400
    canvas.width = SIZE
    canvas.height = SIZE
    const cx = SIZE / 2
    const cy = SIZE / 2
    const maxR = SIZE / 2 - 8   // max usable radius

    // Earth radius in canvas px
    const earthR = 40

    // ISS angle (updated each frame)
    let issAngle = 0

    const draw = (timestamp: number) => {
      const dt = lastTimeRef.current === 0 ? 0 : (timestamp - lastTimeRef.current) / 1000
      lastTimeRef.current = timestamp

      // ── Background ──
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = '#060a10'
      ctx.fillRect(0, 0, SIZE, SIZE)

      // Subtle star field (static)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      // Paint 60 stars once per frame at deterministic positions derived from a
      // seeded list so they don't flicker; we precompute outside the loop below.

      // ── Orbital band rings ──
      const bandDefs = [
        { label: 'LEO', innerF: 0.30, outerF: 0.55, color: 'rgba(99,102,241,0.10)' },
        { label: 'MEO', innerF: 0.55, outerF: 0.73, color: 'rgba(59,130,246,0.07)' },
        { label: 'GEO', innerF: 0.80, outerF: 0.92, color: 'rgba(16,185,129,0.07)' },
      ]

      for (const band of bandDefs) {
        const innerR = earthR + band.innerF * (maxR - earthR)
        const outerR = earthR + band.outerF * (maxR - earthR)

        // Filled annulus
        ctx.beginPath()
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true)
        ctx.fillStyle = band.color
        ctx.fill()

        // Inner ring edge
        ctx.beginPath()
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        // Outer ring edge
        ctx.beginPath()
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        // Band label
        const labelR = (innerR + outerR) / 2
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.20)'
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(band.label, cx + labelR, cy - 3)
        ctx.restore()
      }

      // ── Earth ──
      const earthGrad = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, earthR)
      earthGrad.addColorStop(0, '#38bdf8')
      earthGrad.addColorStop(0.4, '#0ea5e9')
      earthGrad.addColorStop(0.7, '#1e40af')
      earthGrad.addColorStop(1, '#0f2355')
      ctx.beginPath()
      ctx.arc(cx, cy, earthR, 0, Math.PI * 2)
      ctx.fillStyle = earthGrad
      ctx.fill()

      // Continent-like blobs (static decorative)
      ctx.save()
      ctx.clip()
      ctx.fillStyle = 'rgba(34,197,94,0.35)'
      ctx.beginPath()
      ctx.ellipse(cx - 8, cy - 10, 14, 8, -0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(cx + 10, cy + 6, 8, 12, 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(cx - 18, cy + 8, 6, 5, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Earth atmosphere glow
      const atmoGrad = ctx.createRadialGradient(cx, cy, earthR - 4, cx, cy, earthR + 12)
      atmoGrad.addColorStop(0, 'rgba(56,189,248,0.18)')
      atmoGrad.addColorStop(1, 'rgba(56,189,248,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, earthR + 12, 0, Math.PI * 2)
      ctx.fillStyle = atmoGrad
      ctx.fill()

      // ── ISS ──
      const issR = earthR + 0.135 * (maxR - earthR)   // ~408km in LEO band
      issAngle += dt * ((2 * Math.PI) / 5400) * (5400 / 30) * 1.15  // slightly faster than LEO avg
      const issX = cx + Math.cos(issAngle) * issR
      const issY = cy + Math.sin(issAngle) * issR
      ctx.save()
      ctx.font = '11px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🛸', issX, issY)
      ctx.restore()

      // ── Debris particles ──
      for (const p of particlesRef.current) {
        p.phase += p.angularSpeed * dt
        const r = earthR + p.radiusFactor * (maxR - earthR)
        const x = cx + Math.cos(p.phase) * r
        const y = cy + Math.sin(p.phase) * r

        // Subtle glow
        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.dotRadius * 2.5)
        glow.addColorStop(0, p.color)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.arc(x, y, p.dotRadius * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, p.dotRadius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }

      animFrameRef.current = requestAnimationFrame(draw)
    }

    // Precompute star positions (stable across frames)
    const stars: Array<{ x: number; y: number; r: number }> = []
    const starRng = (() => {
      // Simple deterministic LCG
      let seed = 42
      return () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff
        return (seed >>> 0) / 0xffffffff
      }
    })()
    for (let i = 0; i < 80; i++) {
      stars.push({ x: starRng() * SIZE, y: starRng() * SIZE, r: starRng() * 0.9 + 0.4 })
    }

    // Draw stars into the initial clear (redrawn each frame before everything else)
    const originalDraw = draw
    const drawWithStars = (timestamp: number) => {
      // We'll inject star rendering via overriding fillStyle just before clearRect
      // Actually, just inline it below — re-implement draw to include stars.
      originalDraw(timestamp)
    }

    // Re-implement to embed stars inside frame:
    const fullDraw = (timestamp: number) => {
      const dt2 = lastTimeRef.current === 0 ? 0 : (timestamp - lastTimeRef.current) / 1000
      lastTimeRef.current = timestamp

      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = '#060a10'
      ctx.fillRect(0, 0, SIZE, SIZE)

      // Stars
      for (const s of stars) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fill()
      }

      // Orbital bands
      const bandDefs = [
        { label: 'LEO', innerF: 0.30, outerF: 0.55, color: 'rgba(99,102,241,0.10)' },
        { label: 'MEO', innerF: 0.55, outerF: 0.73, color: 'rgba(59,130,246,0.07)' },
        { label: 'GEO', innerF: 0.80, outerF: 0.92, color: 'rgba(16,185,129,0.07)' },
      ]
      for (const band of bandDefs) {
        const innerR = earthR + band.innerF * (maxR - earthR)
        const outerR = earthR + band.outerF * (maxR - earthR)

        ctx.beginPath()
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true)
        ctx.fillStyle = band.color
        ctx.fill()

        ctx.beginPath()
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        const labelR = (innerR + outerR) / 2
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.20)'
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(band.label, cx + labelR, cy - 3)
        ctx.restore()
      }

      // Earth
      const earthGrad2 = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, earthR)
      earthGrad2.addColorStop(0, '#38bdf8')
      earthGrad2.addColorStop(0.4, '#0ea5e9')
      earthGrad2.addColorStop(0.7, '#1e40af')
      earthGrad2.addColorStop(1, '#0f2355')
      ctx.beginPath()
      ctx.arc(cx, cy, earthR, 0, Math.PI * 2)
      ctx.fillStyle = earthGrad2
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, earthR, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = 'rgba(34,197,94,0.35)'
      ctx.beginPath()
      ctx.ellipse(cx - 8, cy - 10, 14, 8, -0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(cx + 10, cy + 6, 8, 12, 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(cx - 18, cy + 8, 6, 5, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      const atmoGrad2 = ctx.createRadialGradient(cx, cy, earthR - 4, cx, cy, earthR + 12)
      atmoGrad2.addColorStop(0, 'rgba(56,189,248,0.18)')
      atmoGrad2.addColorStop(1, 'rgba(56,189,248,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, earthR + 12, 0, Math.PI * 2)
      ctx.fillStyle = atmoGrad2
      ctx.fill()

      // ISS
      const issR2 = earthR + 0.135 * (maxR - earthR)
      issAngle += dt2 * ((2 * Math.PI) / 5400) * (5400 / 30) * 1.15
      const issX2 = cx + Math.cos(issAngle) * issR2
      const issY2 = cy + Math.sin(issAngle) * issR2
      ctx.save()
      ctx.font = '11px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🛸', issX2, issY2)
      ctx.restore()

      // Debris
      for (const p of particlesRef.current) {
        p.phase += p.angularSpeed * dt2
        const r = earthR + p.radiusFactor * (maxR - earthR)
        const x = cx + Math.cos(p.phase) * r
        const y = cy + Math.sin(p.phase) * r

        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.dotRadius * 2.5)
        glow.addColorStop(0, p.color)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.arc(x, y, p.dotRadius * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, p.dotRadius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }

      animFrameRef.current = requestAnimationFrame(fullDraw)
    }

    // Suppress unused warning for the intermediate draw functions above
    void drawWithStars

    animFrameRef.current = requestAnimationFrame(fullDraw)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      lastTimeRef.current = 0
    }
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const impactColor = (impact: DebrisEvent['impact']) => {
    if (impact === 'high') return '#f87171'
    if (impact === 'medium') return '#fb923c'
    return '#4ade80'
  }

  const fmtNum = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M+`
      : n >= 1000
      ? `${(n / 1000).toFixed(0)}k+`
      : `${n}`

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🛰️</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Space Debris Tracker</h3>
          <p className="text-gray-500 text-xs">Real-time orbital visualisation · Educational</p>
        </div>
        <div className="live-badge"><span className="live-dot" /> Live</div>
      </div>

      {/* Canvas + Legend */}
      <div className="flex flex-col items-center gap-3 mb-6">
        <canvas
          ref={canvasRef}
          style={{
            width: 400,
            height: 400,
            maxWidth: '100%',
            borderRadius: 12,
            display: 'block',
          }}
        />

        {/* Colour legend */}
        <div className="flex gap-4 flex-wrap justify-center">
          {[
            { color: 'rgba(220,220,220,0.85)', label: 'Small (<10cm)' },
            { color: 'rgba(250,204,21,0.90)',  label: 'Trackable (10cm–1m)' },
            { color: 'rgba(251,146,60,0.95)',  label: 'Large (>1m)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span className="text-gray-400 text-[11px]">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">🛸</span>
            <span className="text-gray-400 text-[11px]">ISS (~408km)</span>
          </div>
        </div>

        {/* Orbital band labels */}
        <div className="flex gap-4 flex-wrap justify-center">
          {[
            { label: 'LEO', desc: '200–2,000km', color: '#818cf8' },
            { label: 'MEO', desc: '2,000–35,786km', color: '#60a5fa' },
            { label: 'GEO', desc: '~35,786km', color: '#34d399' },
          ].map(({ label, desc, color }) => (
            <div key={label} className="flex items-center gap-1">
              <span className="text-[11px] font-bold font-mono" style={{ color }}>{label}</span>
              <span className="text-gray-600 text-[10px]">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Statistics bar */}
      <div
        className="grid grid-cols-2 gap-2 mb-6 sm:grid-cols-3"
      >
        {[
          { label: 'Tracked Objects',       value: fmtNum(STATS.tracked),           color: '#818cf8' },
          { label: 'Untracked (<1cm est.)', value: fmtNum(STATS.untracked),          color: '#f87171' },
          { label: 'Active Satellites',     value: fmtNum(STATS.activeSatellites),   color: '#4ade80' },
          { label: 'Defunct Satellites',    value: fmtNum(STATS.defunctSatellites),  color: '#fb923c' },
          { label: 'Mission Debris',        value: fmtNum(STATS.missionDebris),      color: '#facc15' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl p-3 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="font-bold font-mono text-lg" style={{ color }}>{value}</p>
            <p className="text-gray-500 text-[10px] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Debris event timeline */}
      <div className="mb-6">
        <h4 className="text-white font-semibold text-sm mb-3">Notable Debris Events</h4>
        <div className="relative">
          {/* Vertical timeline line */}
          <div
            className="absolute left-[28px] top-0 bottom-0 w-px"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          />
          <div className="space-y-1">
            {DEBRIS_EVENTS.map((event, idx) => (
              <div
                key={idx}
                className="relative flex gap-3 cursor-pointer rounded-xl px-2 py-2 transition-all"
                style={{
                  background: activeEvent === idx ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: activeEvent === idx ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                }}
                onClick={() => setActiveEvent(activeEvent === idx ? null : idx)}
              >
                {/* Year bubble */}
                <div
                  className="relative z-10 flex-shrink-0 w-14 h-6 flex items-center justify-center rounded-full text-[10px] font-bold font-mono"
                  style={{
                    background: `${impactColor(event.impact)}18`,
                    border: `1px solid ${impactColor(event.impact)}60`,
                    color: impactColor(event.impact),
                  }}
                >
                  {event.year}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold leading-tight">{event.title}</p>
                  {activeEvent === idx && (
                    <p className="text-gray-400 text-[11px] mt-1 leading-relaxed">
                      {event.description}
                    </p>
                  )}
                </div>

                {/* Impact dot */}
                <span
                  className="flex-shrink-0 self-center w-2 h-2 rounded-full"
                  style={{ background: impactColor(event.impact) }}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="text-gray-700 text-[10px] mt-2 text-center">Click an event to expand details</p>
      </div>

      {/* Kessler Syndrome explainer */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">⚠️</span>
          <h4 className="text-white font-semibold text-sm">What is Kessler Syndrome?</h4>
        </div>
        <p className="text-gray-400 text-xs leading-relaxed mb-3">
          Proposed by NASA scientist Donald Kessler in 1978, Kessler Syndrome describes a
          catastrophic cascade: when orbital debris density becomes high enough that collisions
          produce <span className="text-orange-400 font-semibold">more debris than they destroy</span>,
          creating a self-sustaining chain reaction.
        </p>
        <div className="space-y-2">
          {[
            {
              step: '1',
              text: 'Two objects collide — a satellite and a fragment, or two fragments.',
              color: '#f87171',
            },
            {
              step: '2',
              text: 'The collision shatters both into hundreds of new high-velocity fragments.',
              color: '#fb923c',
            },
            {
              step: '3',
              text: 'Each new fragment has a higher probability of hitting other objects.',
              color: '#facc15',
            },
            {
              step: '4',
              text: 'The cascade escalates — entire orbital shells become impassable for centuries.',
              color: '#4ade80',
            },
          ].map(({ step, text, color }) => (
            <div key={step} className="flex gap-2 items-start">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
              >
                {step}
              </span>
              <p className="text-gray-400 text-[11px] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
        <p className="text-gray-600 text-[10px] mt-3 border-t border-white/5 pt-2">
          Current risk: LEO is approaching critical density in some inclinations. Active debris
          removal (ADR) missions by ESA, ClearSpace, and Astroscale aim to address the threat.
        </p>
      </div>
    </div>
  )
}
