import { useRef, useEffect, useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type StarType = 'Main Sequence' | 'Giant' | 'Supergiant' | 'White Dwarf'

interface StarData {
  name: string
  temp: number       // Kelvin
  luminosity: number // L☉
  distance: number   // light-years
  spectralClass: string
  type: StarType
}

interface TooltipState {
  x: number
  y: number
  star: StarData
  pinned: boolean
}

// ── Star catalogue ───────────────────────────────────────────────────────────

const STARS: StarData[] = [
  { name: 'Sun ☉',           temp: 5778,  luminosity: 1,        distance: 0.0000158,  spectralClass: 'G2V',   type: 'Main Sequence' },
  { name: 'Sirius A',        temp: 9940,  luminosity: 25,       distance: 8.6,        spectralClass: 'A1V',   type: 'Main Sequence' },
  { name: 'Betelgeuse',      temp: 3500,  luminosity: 100000,   distance: 700,        spectralClass: 'M1-2Ia',type: 'Supergiant'    },
  { name: 'Rigel',           temp: 12000, luminosity: 130000,   distance: 860,        spectralClass: 'B8Ia',  type: 'Supergiant'    },
  { name: 'Vega',            temp: 9602,  luminosity: 40,       distance: 25,         spectralClass: 'A0Va',  type: 'Main Sequence' },
  { name: 'Proxima Cen.',    temp: 3042,  luminosity: 0.0017,   distance: 4.24,       spectralClass: 'M5.5Ve',type: 'Main Sequence' },
  { name: 'Arcturus',        temp: 4286,  luminosity: 170,      distance: 36.7,       spectralClass: 'K0III', type: 'Giant'         },
  { name: 'Spica',           temp: 25300, luminosity: 12100,    distance: 250,        spectralClass: 'B1V',   type: 'Main Sequence' },
  { name: 'Aldebaran',       temp: 3910,  luminosity: 518,      distance: 65.3,       spectralClass: 'K5III', type: 'Giant'         },
  { name: 'Deneb',           temp: 8525,  luminosity: 200000,   distance: 2600,       spectralClass: 'A2Ia',  type: 'Supergiant'    },
  { name: 'Antares',         temp: 3600,  luminosity: 57000,    distance: 550,        spectralClass: 'M1.5Iab',type: 'Supergiant'   },
  { name: 'Canopus',         temp: 7350,  luminosity: 13600,    distance: 310,        spectralClass: 'F0II',  type: 'Supergiant'    },
  { name: 'Pollux',          temp: 4865,  luminosity: 32,       distance: 34,         spectralClass: 'K0IIIb',type: 'Giant'         },
  { name: 'Procyon A',       temp: 6530,  luminosity: 7,        distance: 11.4,       spectralClass: 'F5IV',  type: 'Main Sequence' },
  { name: 'Altair',          temp: 7670,  luminosity: 11,       distance: 16.7,       spectralClass: 'A7V',   type: 'Main Sequence' },
  { name: 'Fomalhaut',       temp: 8590,  luminosity: 16,       distance: 25.1,       spectralClass: 'A4V',   type: 'Main Sequence' },
  { name: 'Regulus',         temp: 12460, luminosity: 360,      distance: 79,         spectralClass: 'B7V',   type: 'Main Sequence' },
  { name: 'Achernar',        temp: 15000, luminosity: 3150,     distance: 139,        spectralClass: 'B3Vpe', type: 'Main Sequence' },
  { name: 'Castor A',        temp: 8840,  luminosity: 34,       distance: 51,         spectralClass: 'A2V',   type: 'Main Sequence' },
  { name: 'Capella Aa',      temp: 4970,  luminosity: 79,       distance: 42.9,       spectralClass: 'G8III', type: 'Giant'         },
  { name: "Barnard's Star",  temp: 3134,  luminosity: 0.0035,   distance: 5.96,       spectralClass: 'M4V',   type: 'Main Sequence' },
  { name: 'Wolf 359',        temp: 2800,  luminosity: 0.00073,  distance: 7.86,       spectralClass: 'M6Ve',  type: 'Main Sequence' },
  { name: 'Sirius B',        temp: 25200, luminosity: 0.056,    distance: 8.6,        spectralClass: 'DA2',   type: 'White Dwarf'   },
  { name: '40 Eri B',        temp: 16500, luminosity: 0.013,    distance: 16.3,       spectralClass: 'DA4',   type: 'White Dwarf'   },
  // Additional stars for richness
  { name: 'Epsilon Eri',     temp: 5084,  luminosity: 0.34,     distance: 10.5,       spectralClass: 'K2V',   type: 'Main Sequence' },
  { name: 'Tau Ceti',        temp: 5344,  luminosity: 0.52,     distance: 11.9,       spectralClass: 'G8.5V', type: 'Main Sequence' },
  { name: 'Alpha Cen A',     temp: 5790,  luminosity: 1.519,    distance: 4.37,       spectralClass: 'G2V',   type: 'Main Sequence' },
  { name: 'Alpha Cen B',     temp: 5260,  luminosity: 0.5,      distance: 4.37,       spectralClass: 'K1V',   type: 'Main Sequence' },
  { name: 'Eta Car.',        temp: 36000, luminosity: 4600000,  distance: 7500,       spectralClass: 'LBV',   type: 'Supergiant'    },
  { name: 'Mu Cephei',       temp: 3690,  luminosity: 269000,   distance: 5900,       spectralClass: 'M2Ia',  type: 'Supergiant'    },
  { name: 'VY CMa',          temp: 3490,  luminosity: 270000,   distance: 3840,       spectralClass: 'M3-4II',type: 'Supergiant'    },
  { name: 'Mira',            temp: 3669,  luminosity: 8400,     distance: 299,        spectralClass: 'M7IIIe',type: 'Giant'         },
  { name: 'Alnilam',         temp: 27000, luminosity: 832000,   distance: 2000,       spectralClass: 'B0Ia',  type: 'Supergiant'    },
  { name: 'Adhara',          temp: 22900, luminosity: 38700,    distance: 430,        spectralClass: 'B2II',  type: 'Supergiant'    },
  { name: 'Hadar',           temp: 25000, luminosity: 45000,    distance: 525,        spectralClass: 'B1III', type: 'Main Sequence' },
]

// ── Spectral class config ────────────────────────────────────────────────────

const SPECTRAL_CLASSES = [
  { label: 'O', minT: 30000, maxT: 60000, color: '#9bb0ff' },
  { label: 'B', minT: 10000, maxT: 30000, color: '#aabfff' },
  { label: 'A', minT: 7500,  maxT: 10000, color: '#cad7ff' },
  { label: 'F', minT: 6000,  maxT: 7500,  color: '#f8f7ff' },
  { label: 'G', minT: 5200,  maxT: 6000,  color: '#fff4ea' },
  { label: 'K', minT: 3700,  maxT: 5200,  color: '#ffd2a1' },
  { label: 'M', minT: 2400,  maxT: 3700,  color: '#ffab6b' },
]

function spectralColor(temp: number): string {
  if (temp >= 30000) return '#9bb0ff'
  if (temp >= 10000) return '#aabfff'
  if (temp >= 7500)  return '#cad7ff'
  if (temp >= 6000)  return '#f8f7ff'
  if (temp >= 5200)  return '#fff4ea'
  if (temp >= 3700)  return '#ffd2a1'
  return '#ffab6b'
}

const TYPE_COLORS: Record<StarType, string> = {
  'Main Sequence': '#6366f1',
  'Giant':         '#f59e0b',
  'Supergiant':    '#ef4444',
  'White Dwarf':   '#a5f3fc',
}

// ── Diagram constants ────────────────────────────────────────────────────────

const T_MIN = 2400     // rightmost (coolest)
const T_MAX = 60000    // leftmost (hottest) — clamped for Eta Car display
const L_MIN = 0.0001   // bottom
const L_MAX = 5000000  // top

const PADDING = { top: 60, right: 30, bottom: 60, left: 80 }

// Map temperature → canvas x (log scale, reversed: hot=left)
function tempToX(temp: number, width: number): number {
  const logT    = Math.log10(Math.min(Math.max(temp, T_MIN), T_MAX))
  const logTMin = Math.log10(T_MIN)
  const logTMax = Math.log10(T_MAX)
  const frac    = (logT - logTMin) / (logTMax - logTMin)
  // Reversed: high T → left
  return PADDING.left + (1 - frac) * (width - PADDING.left - PADDING.right)
}

// Map luminosity → canvas y (log scale, bright=top)
function lumToY(lum: number, height: number): number {
  const logL    = Math.log10(Math.min(Math.max(lum, L_MIN), L_MAX))
  const logLMin = Math.log10(L_MIN)
  const logLMax = Math.log10(L_MAX)
  const frac    = (logL - logLMin) / (logLMax - logLMin)
  return PADDING.top + (1 - frac) * (height - PADDING.top - PADDING.bottom)
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#020510'
  ctx.fillRect(0, 0, w, h)

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth   = 1

  // Temperature grid lines (vertical)
  const tLines = [3000, 4000, 5000, 6000, 7000, 8000, 10000, 15000, 20000, 30000, 50000]
  for (const t of tLines) {
    const x = tempToX(t, w)
    ctx.beginPath()
    ctx.moveTo(x, PADDING.top)
    ctx.lineTo(x, h - PADDING.bottom)
    ctx.stroke()
  }

  // Luminosity grid lines (horizontal)
  const lLines = [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000, 1000000]
  for (const l of lLines) {
    const y = lumToY(l, h)
    ctx.beginPath()
    ctx.moveTo(PADDING.left, y)
    ctx.lineTo(w - PADDING.right, y)
    ctx.stroke()
  }
}

function drawRegionBands(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Main sequence band (diagonal)
  const msPoints: [number, number][] = [
    [50000, 800000], [30000, 100000], [15000, 2000], [8000, 50],
    [6000, 5], [5000, 1.2], [4000, 0.2], [3000, 0.04],
  ]
  const msWidth = 0.12  // fractional log-lum half-width for the band

  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.fillStyle = '#6366f1'
  ctx.beginPath()
  // top edge
  for (let i = 0; i < msPoints.length; i++) {
    const [t, l] = msPoints[i]
    const x = tempToX(t, w)
    const y = lumToY(l * Math.pow(10, msWidth), h)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  // bottom edge reversed
  for (let i = msPoints.length - 1; i >= 0; i--) {
    const [t, l] = msPoints[i]
    const x = tempToX(t, w)
    const y = lumToY(l * Math.pow(10, -msWidth), h)
    ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Giant branch
  ctx.save()
  ctx.globalAlpha = 0.06
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  const gTopX = tempToX(5200, w), gTopY = lumToY(1000, h)
  const gBotX = tempToX(3200, w), gBotY = lumToY(50, h)
  ctx.moveTo(gTopX - 20, gTopY - 15)
  ctx.lineTo(gTopX + 20, gTopY + 15)
  ctx.lineTo(gBotX + 30, gBotY + 15)
  ctx.lineTo(gBotX - 30, gBotY - 15)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Supergiant region
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(PADDING.left, PADDING.top, w - PADDING.left - PADDING.right, lumToY(10000, h) - PADDING.top)
  ctx.restore()

  // White dwarf region
  ctx.save()
  ctx.globalAlpha = 0.06
  ctx.fillStyle = '#a5f3fc'
  const wdLeft  = tempToX(50000, w)
  const wdRight = tempToX(8000, w)
  const wdTop   = lumToY(0.1, h)
  const wdBot   = lumToY(0.0001, h)
  ctx.fillRect(wdLeft, wdTop, wdRight - wdLeft, wdBot - wdTop)
  ctx.restore()
}

function drawRegionLabels(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.font = 'bold 11px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'

  // Main sequence label
  ctx.fillStyle = 'rgba(99,102,241,0.55)'
  const msLX = tempToX(7000, w)
  const msLY = lumToY(10, h)
  ctx.save()
  ctx.translate(msLX - 30, msLY)
  ctx.rotate(-Math.PI / 5)
  ctx.fillText('Main Sequence', 0, 0)
  ctx.restore()

  // Giant
  ctx.fillStyle = 'rgba(245,158,11,0.55)'
  ctx.fillText('Giants', tempToX(3800, w), lumToY(300, h) - 10)

  // Supergiant
  ctx.fillStyle = 'rgba(239,68,68,0.55)'
  ctx.fillText('Supergiants', (PADDING.left + w - PADDING.right) / 2, PADDING.top + 15)

  // White Dwarf
  ctx.fillStyle = 'rgba(165,243,252,0.55)'
  ctx.fillText('White Dwarfs', tempToX(20000, w), lumToY(0.0008, h))
}

function drawAxes(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth   = 1.5
  ctx.beginPath()
  ctx.moveTo(PADDING.left, PADDING.top)
  ctx.lineTo(PADDING.left, h - PADDING.bottom)
  ctx.lineTo(w - PADDING.right, h - PADDING.bottom)
  ctx.stroke()

  // X-axis temperature labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font      = '10px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  const tLabels = [3000, 4000, 6000, 8000, 10000, 15000, 25000, 50000]
  for (const t of tLabels) {
    const x = tempToX(t, w)
    ctx.fillText(t >= 1000 ? `${t / 1000}k` : `${t}`, x, h - PADDING.bottom + 16)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(x, h - PADDING.bottom)
    ctx.lineTo(x, h - PADDING.bottom + 5)
    ctx.stroke()
  }

  // Y-axis luminosity labels
  ctx.textAlign = 'right'
  const lLabels = [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000, 1000000]
  for (const l of lLabels) {
    const y = lumToY(l, h)
    if (y < PADDING.top || y > h - PADDING.bottom) continue
    const label = l >= 1 ? (l >= 1000 ? `${l / 1000}k` : `${l}`) : `${l}`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText(label, PADDING.left - 6, y + 3.5)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(PADDING.left, y)
    ctx.lineTo(PADDING.left - 5, y)
    ctx.stroke()
  }

  // Axis titles
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font      = 'bold 11px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Surface Temperature (K) →  cool', (PADDING.left + w - PADDING.right) / 2, h - 8)

  ctx.save()
  ctx.translate(14, (PADDING.top + h - PADDING.bottom) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('Luminosity (L☉)', 0, 0)
  ctx.restore()
}

function drawSpectralLabels(ctx: CanvasRenderingContext2D, w: number) {
  const classes = [
    { label: 'O', t: 45000, color: '#9bb0ff' },
    { label: 'B', t: 20000, color: '#aabfff' },
    { label: 'A', t: 8700,  color: '#cad7ff' },
    { label: 'F', t: 6700,  color: '#f8f7ff' },
    { label: 'G', t: 5600,  color: '#fff4ea' },
    { label: 'K', t: 4400,  color: '#ffd2a1' },
    { label: 'M', t: 3100,  color: '#ffab6b' },
  ]
  ctx.font      = 'bold 13px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  for (const sc of classes) {
    const x = tempToX(sc.t, w)
    ctx.fillStyle = sc.color
    ctx.fillText(sc.label, x, PADDING.top - 10)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font      = '10px "Space Grotesk", sans-serif'
  ctx.fillText('Spectral Class', (PADDING.left + w - PADDING.right) / 2, PADDING.top - 26)
}

function dotRadius(star: StarData): number {
  if (star.type === 'Supergiant') return 8
  if (star.type === 'Giant')      return 6
  if (star.type === 'White Dwarf') return 4
  // main sequence: scale with luminosity
  return Math.max(3, Math.min(7, 3 + Math.log10(star.luminosity + 1)))
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stars: StarData[],
  hoveredStar: StarData | null,
  pinnedStar: StarData | null,
  filterType: StarType | null,
) {
  for (const star of stars) {
    const x   = tempToX(star.temp, w)
    const y   = lumToY(star.luminosity, h)
    const r   = dotRadius(star)
    const col = spectralColor(star.temp)

    const isActive  = filterType === null || star.type === filterType
    const isHovered = hoveredStar?.name === star.name
    const isPinned  = pinnedStar?.name  === star.name

    ctx.globalAlpha = isActive ? 1 : 0.15

    // Glow
    if (isHovered || isPinned) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4)
      glow.addColorStop(0, col.replace(')', ', 0.7)').replace('rgb', 'rgba'))
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, r * 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // Core dot
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(x, y, isHovered || isPinned ? r * 1.5 : r, 0, Math.PI * 2)
    ctx.fill()

    // White dwarf ring
    if (star.type === 'White Dwarf') {
      ctx.strokeStyle = 'rgba(165,243,252,0.5)'
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.arc(x, y, r + 2.5, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Sun symbol treatment
    if (star.name === 'Sun ☉' && isActive) {
      ctx.strokeStyle = 'rgba(255,244,234,0.5)'
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.arc(x, y, r + 3, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
  }
}



// ── Tooltip component ────────────────────────────────────────────────────────

function Tooltip({ tip, onClose }: { tip: TooltipState; onClose: () => void }) {
  const star = tip.star
  return (
    <div
      style={{
        position:     'absolute',
        left:         tip.x + 14,
        top:          tip.y - 10,
        pointerEvents: tip.pinned ? 'auto' : 'none',
        zIndex:       20,
        maxWidth:     220,
      }}
      className="space-card p-3"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-bold text-sm" style={{ color: spectralColor(star.temp) }}>
          {star.name}
        </span>
        {tip.pinned && (
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white leading-none"
            aria-label="Close tooltip"
          >
            ✕
          </button>
        )}
      </div>
      <div className="text-xs text-gray-300 space-y-0.5">
        <div><span className="text-gray-500">Spectral:</span> {star.spectralClass}</div>
        <div><span className="text-gray-500">Temp:</span> {star.temp.toLocaleString()} K</div>
        <div><span className="text-gray-500">Luminosity:</span> {star.luminosity < 0.01 ? star.luminosity.toExponential(2) : star.luminosity.toLocaleString()} L☉</div>
        <div><span className="text-gray-500">Distance:</span> {star.distance < 0.001 ? '~0 ly' : star.distance < 1 ? `${star.distance.toFixed(4)} ly` : `${star.distance.toLocaleString()} ly`}</div>
        <div>
          <span className="text-gray-500">Type:</span>{' '}
          <span style={{ color: TYPE_COLORS[star.type] }}>{star.type}</span>
        </div>
      </div>
    </div>
  )
}

// ── Fun facts ────────────────────────────────────────────────────────────────

const FUN_FACTS = [
  '⭐ The H-R Diagram was independently created by Ejnar Hertzsprung and Henry Norris Russell around 1910.',
  '🔵 O-type stars are 40× hotter than M-type and burn out in millions—not billions—of years.',
  '☀️ Our Sun is a perfectly average G-type main-sequence star—it will expand into a red giant in ~5 billion years.',
  '💀 White dwarfs are Earth-sized stellar remnants with the mass of a Sun—one teaspoon weighs ~5 tonnes.',
  '🔴 Betelgeuse is so large that if placed at the Sun\'s position, it would engulf all planets out to Jupiter.',
  '✨ Deneb may be the most luminous star in our night sky—200,000× the Sun—yet remains visible to the naked eye.',
]

// ── Crosshair drawing ────────────────────────────────────────────────────────

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(x, PADDING.top)
  ctx.lineTo(x, h - PADDING.bottom)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(PADDING.left, y)
  ctx.lineTo(w - PADDING.right, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

// ── Main component ───────────────────────────────────────────────────────────

export default function HRDiagram() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const wrapperRef  = useRef<HTMLDivElement>(null)
  const [size, setSize]           = useState({ w: 600, h: 480 })
  const [tooltip, setTooltip]     = useState<TooltipState | null>(null)
  const [filterType, setFilterType] = useState<StarType | null>(null)

  // ResizeObserver
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      const { width } = entry.contentRect
      setSize({ w: Math.floor(width), h: Math.floor(Math.max(380, width * 0.62)) })
    })
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [])

  // Render to canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = size
    canvas.width  = w
    canvas.height = h

    drawBackground(ctx, w, h)
    drawRegionBands(ctx, w, h)
    drawRegionLabels(ctx, w, h)
    drawAxes(ctx, w, h)
    drawSpectralLabels(ctx, w)
    drawStars(
      ctx, w, h, STARS,
      tooltip ? tooltip.star : null,
      tooltip?.pinned ? tooltip.star : null,
      filterType,
    )
    // Draw crosshair for hover
    if (tooltip) {
      const cx = tempToX(tooltip.star.temp, w)
      const cy = lumToY(tooltip.star.luminosity, h)
      drawCrosshair(ctx, cx, cy, w, h)
    }
  }, [size, tooltip, filterType])

  // Hit-test: find nearest star within radius pixels
  const findNearestStar = useCallback((mouseX: number, mouseY: number): StarData | null => {
    const { w, h } = size
    let nearest: StarData | null = null
    let minDist = 16  // px threshold

    for (const star of STARS) {
      if (filterType !== null && star.type !== filterType) continue
      const cx = tempToX(star.temp, w)
      const cy = lumToY(star.luminosity, h)
      const d  = Math.hypot(mouseX - cx, mouseY - cy)
      if (d < minDist) {
        minDist = d
        nearest = star
      }
    }
    return nearest
  }, [size, filterType])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect   = canvasRef.current!.getBoundingClientRect()
    const scaleX = size.w / rect.width
    const scaleY = size.h / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top)  * scaleY

    const star = findNearestStar(mx, my)
    if (star) {
      const relX = (e.clientX - rect.left)
      const relY = (e.clientY - rect.top)
      setTooltip(prev =>
        prev?.pinned ? prev :
        { x: relX, y: relY, star, pinned: false }
      )
    } else {
      setTooltip(prev => prev?.pinned ? prev : null)
    }
  }, [size, findNearestStar])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect   = canvasRef.current!.getBoundingClientRect()
    const scaleX = size.w / rect.width
    const scaleY = size.h / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top)  * scaleY

    const star = findNearestStar(mx, my)
    if (star) {
      const relX = (e.clientX - rect.left)
      const relY = (e.clientY - rect.top)
      setTooltip({ x: relX, y: relY, star, pinned: true })
    } else {
      // Click on empty space dismisses pinned tooltip
      setTooltip(prev => prev?.pinned ? null : prev)
    }
  }, [size, findNearestStar])

  const handleMouseLeave = useCallback(() => {
    setTooltip(prev => prev?.pinned ? prev : null)
  }, [])

  const allTypes: StarType[] = ['Main Sequence', 'Giant', 'Supergiant', 'White Dwarf']

  return (
    <div className="space-card p-6 w-full">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white mb-1">
          Hertzsprung–Russell Diagram
        </h2>
        <p className="text-sm text-gray-400">
          Interactive stellar classification diagram — hover or click a star to explore
        </p>
      </div>

      <div className="flex gap-4 flex-wrap lg:flex-nowrap">
        {/* Canvas */}
        <div
          ref={wrapperRef}
          className="relative flex-1 min-w-0"
          style={{ minWidth: 280 }}
        >
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            onMouseLeave={handleMouseLeave}
            style={{
              width:    '100%',
              height:   'auto',
              display:  'block',
              cursor:   'crosshair',
              borderRadius: 12,
              border:   '1px solid rgba(99,102,241,0.14)',
            }}
          />
          {tooltip && (
            <Tooltip
              tip={tooltip}
              onClose={() => setTooltip(null)}
            />
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4" style={{ minWidth: 160, maxWidth: 200 }}>
          {/* Spectral strip */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Spectral Classes
            </div>
            <div className="flex flex-col gap-1">
              {SPECTRAL_CLASSES.map(sc => (
                <div key={sc.label} className="flex items-center gap-2">
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{ width: 10, height: 10, background: sc.color }}
                  />
                  <span className="text-xs font-mono font-bold" style={{ color: sc.color }}>
                    {sc.label}
                  </span>
                  <span className="text-xs text-gray-500">
                    {sc.minT >= 1000 ? `${sc.minT / 1000}k` : sc.minT}–
                    {sc.maxT >= 1000 ? `${sc.maxT / 1000}k` : sc.maxT} K
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Filter buttons */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Filter by Type
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setFilterType(null)}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors text-left"
                style={{
                  background: filterType === null ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                  border:     `1px solid ${filterType === null ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color:      filterType === null ? '#fff' : '#9ca3af',
                }}
              >
                All Stars
              </button>
              {allTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(prev => prev === type ? null : type)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors text-left"
                  style={{
                    background: filterType === type ? `${TYPE_COLORS[type]}22` : 'rgba(255,255,255,0.05)',
                    border:     `1px solid ${filterType === type ? TYPE_COLORS[type] : 'rgba(255,255,255,0.1)'}`,
                    color:      filterType === type ? TYPE_COLORS[type] : '#9ca3af',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Type legend dots */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Legend
            </div>
            <div className="flex flex-col gap-1.5">
              {allTypes.map(type => (
                <div key={type} className="flex items-center gap-2">
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{
                      width:      type === 'Supergiant' ? 10 : type === 'Giant' ? 8 : 6,
                      height:     type === 'Supergiant' ? 10 : type === 'Giant' ? 8 : 6,
                      background: TYPE_COLORS[type],
                    }}
                  />
                  <span className="text-xs text-gray-400">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fun facts */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Stellar Evolution Facts
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FUN_FACTS.map((fact, i) => (
            <div
              key={i}
              className="text-xs text-gray-400 leading-relaxed px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {fact}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
