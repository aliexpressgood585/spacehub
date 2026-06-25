import { useState, useEffect, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface MoonConfig {
  name: string
  period: number        // days
  sma: number           // semi-major axis in planet radii
  color: string
  size: number          // dot radius px
  initialPhase: number  // radians at J2000.0
}

interface MoonState extends MoonConfig {
  angle: number     // radians
  x: number         // in planet radii; positive = East
  direction: 'E' | 'W'
}

interface PlanetConfig {
  name: string
  icon: string
  color: string
  glowColor: string
  moons: MoonConfig[]
  maxSMA: number    // for diagram scaling
}

// ── Orbital data ─────────────────────────────────────────────────────────────
// Initial phases at J2000.0 (Jan 1.5, 2000 UTC) — approximate values in radians

const JUPITER: PlanetConfig = {
  name: 'Jupiter',
  icon: '🪐',
  color: '#c8956c',
  glowColor: 'rgba(200,149,108,0.4)',
  maxSMA: 30,
  moons: [
    { name: 'Io',       period: 1.769138,  sma:  5.9, color: '#f5a623', size: 5, initialPhase: 1.843 },
    { name: 'Europa',   period: 3.551181,  sma:  9.4, color: '#d4e8f0', size: 4, initialPhase: 4.562 },
    { name: 'Ganymede', period: 7.154553,  sma: 15.0, color: '#8b6914', size: 6, initialPhase: 2.137 },
    { name: 'Callisto', period: 16.689017, sma: 26.4, color: '#5a4a3a', size: 5, initialPhase: 5.891 },
  ],
}

const SATURN: PlanetConfig = {
  name: 'Saturn',
  icon: '🪐',
  color: '#e8d5a3',
  glowColor: 'rgba(232,213,163,0.4)',
  maxSMA: 24,
  moons: [
    { name: 'Enceladus', period: 1.370218, sma:  3.95, color: '#e8f4f8', size: 3, initialPhase: 0.612 },
    { name: 'Tethys',    period: 1.887802, sma:  4.89, color: '#c8d8e0', size: 4, initialPhase: 3.254 },
    { name: 'Dione',     period: 2.736915, sma:  6.26, color: '#b0c4ce', size: 4, initialPhase: 1.432 },
    { name: 'Rhea',      period: 4.517500, sma:  8.74, color: '#a0b4be', size: 5, initialPhase: 4.911 },
    { name: 'Titan',     period: 15.945421,sma: 20.3,  color: '#d4a843', size: 7, initialPhase: 2.775 },
  ],
}

// ── Orbital mechanics ─────────────────────────────────────────────────────────

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0) // Jan 1.5, 2000 = noon Jan 1

function computeMoonState(moon: MoonConfig, now: Date): MoonState {
  const daysSinceJ2000 = (now.getTime() - J2000_MS) / 86_400_000
  const angle = ((2 * Math.PI) / moon.period) * daysSinceJ2000 + moon.initialPhase
  const x = moon.sma * Math.cos(angle)
  return {
    ...moon,
    angle,
    x,
    direction: x >= 0 ? 'E' : 'W',
  }
}

function computeAllMoons(planet: PlanetConfig, now: Date): MoonState[] {
  return planet.moons.map(m => computeMoonState(m, now))
}

// ── Position Diagram (Canvas) ─────────────────────────────────────────────────

interface DiagramProps {
  planet: PlanetConfig
  moons: MoonState[]
}

function PositionDiagram({ planet, moons }: DiagramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const scale = (W / 2 - 40) / planet.maxSMA // px per planet radius

    // Clear
    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = 'rgba(2,5,16,0.6)'
    ctx.fillRect(0, 0, W, H)

    // Axis line
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.moveTo(20, cy)
    ctx.lineTo(W - 20, cy)
    ctx.stroke()

    // West / East labels
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '10px Space Grotesk, system-ui'
    ctx.textAlign = 'left'
    ctx.fillText('W', 4, cy + 4)
    ctx.textAlign = 'right'
    ctx.fillText('E', W - 4, cy + 4)

    // Planet center dot with glow
    const planetR = 10
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, planetR * 2.5)
    grad.addColorStop(0, planet.color)
    grad.addColorStop(0.5, planet.glowColor)
    grad.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.arc(cx, cy, planetR * 2.5, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx, cy, planetR, 0, Math.PI * 2)
    ctx.fillStyle = planet.color
    ctx.fill()

    // Moons — sort by x so labels on same side don't collide (draw far-to-near)
    const sorted = [...moons].sort((a, b) => Math.abs(b.x) - Math.abs(a.x))

    sorted.forEach(moon => {
      const mx = cx + moon.x * scale
      const my = cy

      // Moon dot with glow
      const moonGrad = ctx.createRadialGradient(mx, my, 0, mx, my, moon.size * 2.5)
      moonGrad.addColorStop(0, moon.color)
      moonGrad.addColorStop(0.6, moon.color + '88')
      moonGrad.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(mx, my, moon.size * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = moonGrad
      ctx.fill()

      ctx.beginPath()
      ctx.arc(mx, my, moon.size, 0, Math.PI * 2)
      ctx.fillStyle = moon.color
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 0.5
      ctx.stroke()

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = `bold 9px Space Grotesk, system-ui`
      ctx.textAlign = 'center'
      const labelY = my - moon.size - 5
      ctx.fillText(moon.name, mx, labelY)
    })
  }, [planet, moons])

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={110}
      style={{
        width: '100%',
        height: 110,
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'block',
      }}
    />
  )
}

// ── Data Table ────────────────────────────────────────────────────────────────

interface TableProps {
  moons: MoonState[]
  planetRadiusLabel: string
}

function MoonTable({ moons, planetRadiusLabel }: TableProps) {
  const sorted = [...moons].sort((a, b) => a.sma - b.sma)

  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {['Moon', 'Direction', `Distance (${planetRadiusLabel})`, 'Period (days)'].map(h => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '6px 10px',
                  color: 'rgba(255,255,255,0.45)',
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(moon => (
            <tr
              key={moon.name}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <td style={{ padding: '7px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: moon.size * 1.8,
                      height: moon.size * 1.8,
                      borderRadius: '50%',
                      background: moon.color,
                      boxShadow: `0 0 4px ${moon.color}88`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                    {moon.name}
                  </span>
                </div>
              </td>
              <td style={{ padding: '7px 10px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    background:
                      moon.direction === 'E'
                        ? 'rgba(99,102,241,0.2)'
                        : 'rgba(251,146,60,0.2)',
                    color:
                      moon.direction === 'E' ? '#818cf8' : '#fb923c',
                    border: `1px solid ${moon.direction === 'E' ? 'rgba(99,102,241,0.35)' : 'rgba(251,146,60,0.35)'}`,
                  }}
                >
                  {moon.direction}
                </span>
              </td>
              <td
                style={{
                  padding: '7px 10px',
                  color: 'rgba(255,255,255,0.7)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.abs(moon.x).toFixed(2)}
              </td>
              <td
                style={{
                  padding: '7px 10px',
                  color: 'rgba(255,255,255,0.55)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {moon.period.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Planet Card ───────────────────────────────────────────────────────────────

interface PlanetCardProps {
  planet: PlanetConfig
  now: Date
  radiusLabel: string
}

function PlanetCard({ planet, now, radiusLabel }: PlanetCardProps) {
  const moons = computeAllMoons(planet, now)

  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div
      className="space-card p-6"
      style={{ marginBottom: 24 }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>{planet.icon}</span>
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: planet.color,
                textShadow: `0 0 12px ${planet.glowColor}`,
                margin: 0,
              }}
            >
              {planet.name}
            </h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Galilean-style moon position diagram
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
            {dateStr}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
            {timeStr} UTC{now.getTimezoneOffset() === 0 ? '' : ` (local)`}
          </div>
        </div>
      </div>

      {/* Diagram */}
      <PositionDiagram planet={planet} moons={moons} />

      {/* Table */}
      <MoonTable moons={moons} planetRadiusLabel={radiusLabel} />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PlanetaryMoons() {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 8px' }}>
      {/* Section header */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1
          className="gradient-text"
          style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 4 }}
        >
          Planetary Moon Positions
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          Real-time orbital positions via Keplerian mechanics · Updates every 60 s
        </p>
      </div>

      <PlanetCard planet={JUPITER} now={now} radiusLabel="R♃" />
      <PlanetCard planet={SATURN}  now={now} radiusLabel="R♄" />

      {/* Legend */}
      <div
        style={{
          marginTop: 8,
          padding: '10px 16px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.35)',
          lineHeight: 1.6,
        }}
      >
        Positions computed using simplified Keplerian orbits (circular, coplanar) with J2000.0 epoch.
        Actual positions may differ by up to a few Jupiter/Saturn radii due to mutual gravitational
        perturbations and orbital eccentricity not modeled here.
      </div>
    </div>
  )
}
