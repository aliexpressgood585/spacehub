import { useState, useRef, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type StarType = 'eclipsing' | 'cepheid' | 'mira' | 'semi-regular'

interface StarData {
  id: string
  name: string
  designation: string
  type: StarType
  constellation: string
  distanceLy: number
  period: number          // days
  magMin: number          // faintest (larger number)
  magMax: number          // brightest (smaller number)
  epoch: number           // JD of known minimum (eclipsers) or maximum (pulsators)
  funFact: string
  curveShape: 'eclipse' | 'cepheid' | 'sinusoid'
}

// ── Julian Day helper ─────────────────────────────────────────────────────────

function toJD(date: Date): number {
  const a = Math.floor((14 - (date.getMonth() + 1)) / 12)
  const y = date.getFullYear() + 4800 - a
  const m = (date.getMonth() + 1) + 12 * a - 3
  return (
    date.getDate() +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045 +
    (date.getUTCHours() - 12) / 24 +
    date.getUTCMinutes() / 1440
  )
}

// ── Light curve math ──────────────────────────────────────────────────────────

/** Returns magnitude for a given phase [0,1) */
function magnitudeFromPhase(phase: number, star: StarData): number {
  const range = star.magMin - star.magMax  // positive = range of variation

  if (star.curveShape === 'eclipse') {
    // Narrow dip at phase 0 (and secondary at 0.5 for Beta Lyrae)
    const primaryDip = Math.exp(-Math.pow((phase < 0.5 ? phase : 1 - phase) * 80, 2))
    let dip = primaryDip
    if (star.id === 'beta-lyrae') {
      // Secondary eclipse at phase 0.5, shallower
      const secondary = Math.exp(-Math.pow((phase - 0.5) * 50, 2)) * 0.4
      dip = Math.max(primaryDip, secondary)
    }
    return star.magMax + range * dip
  }

  if (star.curveShape === 'cepheid') {
    // Asymmetric: fast rise (phase 0→0.2 = brightest), slow decline (0.2→1.0)
    let brightness: number
    if (phase < 0.2) {
      // Rise: sinusoidal 0→1 over first 20% of period
      brightness = Math.sin((phase / 0.2) * Math.PI * 0.5)
    } else {
      // Decline: sinusoidal 1→0 over remaining 80%
      brightness = Math.cos(((phase - 0.2) / 0.8) * Math.PI * 0.5)
    }
    // brightness=1 → magMax (brightest), brightness=0 → magMin (faintest)
    return star.magMin - range * brightness
  }

  // sinusoid — standard cosine: phase 0 = maximum (brightest)
  const brightness = (1 + Math.cos(2 * Math.PI * phase)) / 2
  return star.magMin - range * brightness
}

/** Returns phase [0,1) for a given JD */
function phaseAtJD(jd: number, star: StarData): number {
  const raw = ((jd - star.epoch) % star.period + star.period) % star.period
  return raw / star.period
}

function magnitudeAtJD(jd: number, star: StarData): number {
  return magnitudeFromPhase(phaseAtJD(jd, star), star)
}

// ── Star data ─────────────────────────────────────────────────────────────────

const STARS: StarData[] = [
  {
    id: 'algol',
    name: 'Algol',
    designation: 'Beta Persei',
    type: 'eclipsing',
    constellation: 'Perseus',
    distanceLy: 93,
    period: 2.867,
    magMin: 3.4,
    magMax: 2.1,
    // epoch = JD of known mid-eclipse minimum
    epoch: 2452500.177,
    curveShape: 'eclipse',
    funFact:
      'Known as the "Demon Star" — its regular dimming was noticed in antiquity. The eclipses last about 10 hours and drop the star by 1.3 magnitudes.',
  },
  {
    id: 'delta-cephei',
    name: 'Delta Cephei',
    designation: 'Delta Cephei',
    type: 'cepheid',
    constellation: 'Cepheus',
    distanceLy: 887,
    period: 5.366,
    magMin: 4.37,
    magMax: 3.48,
    // epoch = JD of a known maximum
    epoch: 2443226.015,
    curveShape: 'cepheid',
    funFact:
      'The prototype of all Cepheid variables. Henrietta Leavitt used Cepheids to establish the cosmic distance ladder, revealing the true scale of the universe.',
  },
  {
    id: 'mira',
    name: 'Mira',
    designation: 'Omicron Ceti',
    type: 'mira',
    constellation: 'Cetus',
    distanceLy: 420,
    period: 332,
    magMin: 10.1,
    magMax: 2.0,
    // epoch = JD of a known maximum
    epoch: 2451071.4,
    curveShape: 'sinusoid',
    funFact:
      'The first known long-period variable star (observed since 1596). At maximum it can outshine every other star in Cetus; at minimum it vanishes without a telescope.',
  },
  {
    id: 'r-lyrae',
    name: 'R Lyrae',
    designation: 'R Lyrae',
    type: 'semi-regular',
    constellation: 'Lyra',
    distanceLy: 349,
    period: 46,
    magMin: 5.0,
    magMax: 3.9,
    // epoch = JD of a known maximum
    epoch: 2451700.0,
    curveShape: 'sinusoid',
    funFact:
      'A red giant semi-regular variable. Its period of ~46 days and relatively small amplitude makes it one of the easiest variable stars to monitor with binoculars.',
  },
  {
    id: 'chi-cygni',
    name: 'Chi Cygni',
    designation: 'Chi Cygni',
    type: 'mira',
    constellation: 'Cygnus',
    distanceLy: 550,
    period: 408,
    magMin: 14.2,
    magMax: 3.3,
    // epoch = JD of a known maximum
    epoch: 2451628.0,
    curveShape: 'sinusoid',
    funFact:
      'One of the most extreme amplitude variable stars known — varying by almost 11 magnitudes (a factor of ~25,000 in brightness). At minimum it requires a large telescope.',
  },
  {
    id: 'beta-lyrae',
    name: 'Beta Lyrae',
    designation: 'Beta Lyrae (Sheliak)',
    type: 'eclipsing',
    constellation: 'Lyra',
    distanceLy: 882,
    period: 12.94,
    magMin: 4.36,
    magMax: 3.25,
    // epoch = JD of primary minimum
    epoch: 2408247.966,
    curveShape: 'eclipse',
    funFact:
      'A deeply interacting binary — so close the stars are teardrop-shaped and material streams between them. It has two unequal eclipses per orbit.',
  },
]

// ── Prediction helpers ────────────────────────────────────────────────────────

interface Prediction {
  label: string
  jd: number
  mag: number
  daysFromNow: number
}

function nextExtreme(jdNow: number, star: StarData): { min: Prediction; max: Prediction } {
  // For eclipsers, max is between eclipses; min is at eclipse
  // For pulsators, epoch is at maximum, minimum is at phase 0.5 (sinusoid) or ~0.7 (cepheid)
  const phase = phaseAtJD(jdNow, star)

  let phaseOfMax: number
  let phaseOfMin: number

  if (star.curveShape === 'eclipse') {
    phaseOfMax = 0.5  // between eclipses
    phaseOfMin = 0.0  // eclipse
  } else if (star.curveShape === 'cepheid') {
    phaseOfMax = 0.0   // epoch is maximum for cepheid (phase 0 → peak brightness)
    phaseOfMin = 0.75  // roughly ~3/4 through period
  } else {
    phaseOfMax = 0.0  // epoch is maximum
    phaseOfMin = 0.5  // half-period later
  }

  function nextOccurrence(targetPhase: number): number {
    let delta = targetPhase - phase
    if (delta <= 0) delta += 1
    return jdNow + delta * star.period
  }

  const maxJD = nextOccurrence(phaseOfMax)
  const minJD = nextOccurrence(phaseOfMin)

  return {
    max: {
      label: 'Next Maximum',
      jd: maxJD,
      mag: star.magMax,
      daysFromNow: maxJD - jdNow,
    },
    min: {
      label: 'Next Minimum',
      jd: minJD,
      mag: star.magMin,
      daysFromNow: minJD - jdNow,
    },
  }
}

function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000)
}

function fmtDays(d: number): string {
  if (d < 1) {
    const h = Math.round(d * 24)
    return `${h}h`
  }
  const days = Math.floor(d)
  const hrs = Math.round((d - days) * 24)
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`
}

// ── Canvas light curve ────────────────────────────────────────────────────────

const CANVAS_W = 560
const CANVAS_H = 200
const PAD = { top: 16, right: 16, bottom: 32, left: 44 }

function drawLightCurve(
  canvas: HTMLCanvasElement,
  star: StarData,
  jdNow: number,
  dpr: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = CANVAS_W * dpr
  canvas.height = CANVAS_H * dpr
  canvas.style.width = `${CANVAS_W}px`
  canvas.style.height = `${CANVAS_H}px`
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  const plotW = CANVAS_W - PAD.left - PAD.right
  const plotH = CANVAS_H - PAD.top - PAD.bottom

  const days = 30
  const jdStart = jdNow - days

  // Magnitude range with a bit of padding
  const magRange = star.magMin - star.magMax
  const padMag = magRange * 0.1 + 0.1
  const yMin = star.magMax - padMag  // brightest display (top)
  const yMax = star.magMin + padMag  // faintest display (bottom)

  function xOf(jd: number): number {
    return PAD.left + ((jd - jdStart) / days) * plotW
  }

  function yOf(mag: number): number {
    // Inverted: brighter (lower mag) = higher on screen
    return PAD.top + ((mag - yMin) / (yMax - yMin)) * plotH
  }

  // ── Grid lines ──────────────────────────────────────────────────────────────
  const magStep = magRange > 5 ? 2 : magRange > 2 ? 0.5 : 0.25
  let gridMag = Math.ceil(yMin / magStep) * magStep

  ctx.font = '9px system-ui, sans-serif'
  ctx.textAlign = 'right'

  while (gridMag <= yMax + 0.01) {
    const y = yOf(gridMag)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, y)
    ctx.lineTo(CANVAS_W - PAD.right, y)
    ctx.stroke()

    ctx.fillStyle = '#4b5563'
    ctx.fillText(gridMag.toFixed(magStep < 1 ? 2 : 1), PAD.left - 4, y + 3)
    gridMag = Math.round((gridMag + magStep) * 1000) / 1000
  }

  // ── Day tick marks ──────────────────────────────────────────────────────────
  ctx.textAlign = 'center'
  ctx.fillStyle = '#374151'
  for (let d = 0; d <= 30; d += 5) {
    const jd = jdStart + d
    const x = xOf(jd)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, PAD.top)
    ctx.lineTo(x, CANVAS_H - PAD.bottom)
    ctx.stroke()

    if (d < 30) {
      const label = d === 0 ? '−30d' : d === 25 ? '−5d' : `−${30 - d}d`
      ctx.fillStyle = '#374151'
      ctx.fillText(label, x, CANVAS_H - PAD.bottom + 12)
    }
  }

  // "Today" vertical line
  const xToday = xOf(jdNow)
  ctx.strokeStyle = 'rgba(251,191,36,0.3)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(xToday, PAD.top)
  ctx.lineTo(xToday, CANVAS_H - PAD.bottom)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'center'
  ctx.font = '9px system-ui, sans-serif'
  ctx.fillText('Today', xToday, CANVAS_H - PAD.bottom + 12)

  // ── Y-axis label ────────────────────────────────────────────────────────────
  ctx.save()
  ctx.translate(10, PAD.top + plotH / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = '#374151'
  ctx.textAlign = 'center'
  ctx.font = '9px system-ui, sans-serif'
  ctx.fillText('Magnitude (brighter ↑)', 0, 0)
  ctx.restore()

  // ── Light curve ──────────────────────────────────────────────────────────────
  const steps = 300
  const gradient = ctx.createLinearGradient(PAD.left, 0, CANVAS_W - PAD.right, 0)
  gradient.addColorStop(0, 'rgba(167,139,250,0.6)')
  gradient.addColorStop(0.85, 'rgba(96,165,250,0.8)')
  gradient.addColorStop(1, 'rgba(251,191,36,0.9)')

  ctx.strokeStyle = gradient
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.beginPath()

  for (let i = 0; i <= steps; i++) {
    const jd = jdStart + (i / steps) * days
    const mag = magnitudeAtJD(jd, star)
    const x = xOf(jd)
    const y = yOf(mag)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // ── Today's dot (pulsing effect via double circle) ──────────────────────────
  const todayMag = magnitudeAtJD(jdNow, star)
  const yTodayDot = yOf(todayMag)

  ctx.beginPath()
  ctx.arc(xToday, yTodayDot, 7, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(251,191,36,0.15)'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(xToday, yTodayDot, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#fbbf24'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(xToday, yTodayDot, 2, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
}

// ── Type badge colors ──────────────────────────────────────────────────────────

const TYPE_COLOR: Record<StarType, string> = {
  eclipsing: '#60a5fa',
  cepheid: '#f59e0b',
  mira: '#f87171',
  'semi-regular': '#34d399',
}

const TYPE_LABEL: Record<StarType, string> = {
  eclipsing: 'Eclipsing Binary',
  cepheid: 'Classical Cepheid',
  mira: 'Mira-type LPV',
  'semi-regular': 'Semi-regular',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VariableStarTracker() {
  const [selectedId, setSelectedId] = useState<string>('algol')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const star = STARS.find(s => s.id === selectedId) ?? STARS[0]
  const jdNow = toJD(new Date())
  const currentMag = magnitudeAtJD(jdNow, star)
  const { min: nextMin, max: nextMax } = nextExtreme(jdNow, star)

  // Draw canvas whenever star changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    drawLightCurve(canvas, star, jdNow, dpr)
  }, [star, jdNow])

  const typeColor = TYPE_COLOR[star.type]

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">⭐</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Variable Star Tracker</h3>
          <p className="text-gray-500 text-xs">Brightness changes of famous variable stars · Mathematical light curves</p>
        </div>
        <span
          className="text-[10px] px-2 py-1 rounded-full font-bold shrink-0"
          style={{
            background: 'rgba(167,139,250,0.15)',
            border: '1px solid rgba(167,139,250,0.3)',
            color: '#c4b5fd',
          }}
        >
          {STARS.length} stars
        </span>
      </div>

      {/* Star selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {STARS.map(s => {
          const active = s.id === selectedId
          const col = TYPE_COLOR[s.type]
          return (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
              style={
                active
                  ? { background: `${col}22`, border: `1px solid ${col}66`, color: col }
                  : {
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#6b7280',
                    }
              }
            >
              {s.name}
            </button>
          )
        })}
      </div>

      {/* Selected star info panel */}
      <div
        className="rounded-2xl p-4 mb-5"
        style={{
          background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(96,165,250,0.05))',
          border: '1px solid rgba(167,139,250,0.2)',
        }}
      >
        <div className="flex items-start gap-4">
          {/* Left: name + type */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-white font-bold text-base">{star.name}</span>
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44` }}
              >
                {TYPE_LABEL[star.type]}
              </span>
            </div>
            <p className="text-gray-500 text-xs mb-0.5">{star.designation}</p>
            <div className="flex gap-4 text-[10px] mt-2 flex-wrap">
              <div>
                <span className="text-gray-600">Constellation </span>
                <span className="text-gray-300 font-semibold">{star.constellation}</span>
              </div>
              <div>
                <span className="text-gray-600">Distance </span>
                <span className="text-gray-300 font-semibold">{star.distanceLy.toLocaleString()} ly</span>
              </div>
              <div>
                <span className="text-gray-600">Period </span>
                <span className="text-gray-300 font-semibold">{star.period} days</span>
              </div>
              <div>
                <span className="text-gray-600">Range </span>
                <span className="text-gray-300 font-semibold">
                  {star.magMax.toFixed(2)} – {star.magMin.toFixed(2)} mag
                </span>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">{star.funFact}</p>
          </div>

          {/* Right: current magnitude */}
          <div className="shrink-0 text-center">
            <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">Current</div>
            <div
              className="text-2xl font-black tabular-nums"
              style={{ color: typeColor }}
            >
              {currentMag.toFixed(2)}
            </div>
            <div className="text-[9px] text-gray-600">magnitude</div>
            {/* Brightness bar */}
            <div className="mt-2 w-16">
              <div className="text-[8px] text-gray-700 mb-0.5 text-left">bright</div>
              <div
                className="h-16 w-3 mx-auto rounded-full relative overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-full transition-all"
                  style={{
                    height: `${((star.magMin - currentMag) / (star.magMin - star.magMax)) * 100}%`,
                    background: `linear-gradient(to top, ${typeColor}, ${typeColor}88)`,
                  }}
                />
              </div>
              <div className="text-[8px] text-gray-700 mt-0.5 text-left">faint</div>
            </div>
          </div>
        </div>
      </div>

      {/* Light curve canvas */}
      <div
        className="rounded-2xl p-3 mb-5 overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="text-[10px] text-gray-600 mb-2 px-1">
          Light curve — last 30 days (brighter = top of chart)
        </div>
        <div className="overflow-x-auto">
          <canvas
            ref={canvasRef}
            style={{ display: 'block' }}
          />
        </div>

        {/* Pulsing today indicator */}
        <div className="flex items-center gap-2 mt-2 px-1">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' }}
          />
          <span className="text-[10px] text-yellow-400 font-semibold">
            Today — magnitude {currentMag.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Next min/max predictions */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[nextMax, nextMin].map(pred => {
          const isBright = pred === nextMax
          const col = isBright ? '#4ade80' : '#f87171'
          const predDate = jdToDate(pred.jd)
          const dateStr = predDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
          return (
            <div
              key={pred.label}
              className="rounded-xl p-3"
              style={{
                background: `${col}0d`,
                border: `1px solid ${col}33`,
              }}
            >
              <div className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: col }}>
                {pred.label}
              </div>
              <div className="text-white font-bold text-sm">{dateStr}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                in {fmtDays(pred.daysFromNow)}
              </div>
              <div className="text-[10px] mt-1" style={{ color: col }}>
                mag {pred.mag.toFixed(2)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend / disclaimer */}
      <div
        className="rounded-xl p-3 mb-3"
        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}
      >
        <div className="flex flex-wrap gap-3 mb-2">
          {(Object.entries(TYPE_COLOR) as [StarType, string][]).map(([t, c]) => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[9px] text-gray-500">{TYPE_LABEL[t]}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 leading-relaxed">
          <span className="text-indigo-400 font-semibold">Note:</span> Actual brightness may vary —
          use{' '}
          <span className="text-indigo-400 font-semibold">AAVSO</span> (American Association of
          Variable Star Observers) for real observations. Light curves are computed mathematically
          from published periods and epochs.
        </p>
      </div>
    </div>
  )
}
