import { useState, useMemo } from 'react'

// ── DATA ──────────────────────────────────────────────────────────────────────

interface Location {
  id: string
  label: string
  dailyMsv: number
  annualMsv: number
  note: string
  color: string
}

const LOCATIONS: Location[] = [
  {
    id: 'earth_sea',
    label: 'Earth (sea level)',
    dailyMsv: 0.00657,
    annualMsv: 2.4,
    note: 'Natural background radiation',
    color: '#34d399',
  },
  {
    id: 'earth_high',
    label: 'Earth (high altitude)',
    dailyMsv: 6 / 365,
    annualMsv: 6,
    note: 'Denver, CO equivalent',
    color: '#6ee7b7',
  },
  {
    id: 'flight',
    label: 'Commercial flight',
    dailyMsv: 0.003 * 8,
    annualMsv: 0.003 * 8 * 365,
    note: '0.003 mSv/hr · ~0.08 mSv per transatlantic',
    color: '#60a5fa',
  },
  {
    id: 'iss',
    label: 'ISS (LEO)',
    dailyMsv: 0.493,
    annualMsv: 180,
    note: 'Low Earth Orbit — shielded by Van Allen belts',
    color: '#818cf8',
  },
  {
    id: 'moon',
    label: 'Moon surface',
    dailyMsv: 1.04,
    annualMsv: 380,
    note: 'No magnetosphere protection',
    color: '#c4b5fd',
  },
  {
    id: 'mars_transit',
    label: 'Mars transit',
    dailyMsv: 1.84,
    annualMsv: 670,
    note: 'Open space, no planetary shielding',
    color: '#f97316',
  },
  {
    id: 'mars_surface',
    label: 'Mars surface',
    dailyMsv: 0.64,
    annualMsv: 234,
    note: 'Thin atmosphere provides partial shielding',
    color: '#fb923c',
  },
  {
    id: 'deep_space',
    label: 'Deep space',
    dailyMsv: 1.0,
    annualMsv: 365,
    note: 'Galactic cosmic rays; ~1 mSv/day average',
    color: '#e879f9',
  },
  {
    id: 'solar_event',
    label: 'Solar particle event',
    dailyMsv: 2000,
    annualMsv: 2000 * 365,
    note: 'Worst-case burst: up to 2,000 mSv in hours',
    color: '#f87171',
  },
]

interface HealthZone {
  label: string
  minMsv: number
  maxMsv: number | null
  icon: string
  color: string
  bg: string
}

const HEALTH_ZONES: HealthZone[] = [
  {
    label: 'No measurable health effect',
    minMsv: 0,
    maxMsv: 50,
    icon: '✅',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.08)',
  },
  {
    label: 'Increased cancer risk threshold',
    minMsv: 50,
    maxMsv: 100,
    icon: '⚠️',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
  },
  {
    label: 'Detectable immune changes',
    minMsv: 100,
    maxMsv: 500,
    icon: '⚠️',
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.08)',
  },
  {
    label: 'Radiation sickness begins',
    minMsv: 500,
    maxMsv: 1000,
    icon: '🔴',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.08)',
  },
  {
    label: 'Acute radiation sickness (nausea, fatigue)',
    minMsv: 1000,
    maxMsv: 2000,
    icon: '🔴',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
  },
  {
    label: 'Severe: 50% mortality without treatment',
    minMsv: 2000,
    maxMsv: 6000,
    icon: '🔴',
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.08)',
  },
  {
    label: 'Fatal without immediate medical intervention',
    minMsv: 6000,
    maxMsv: null,
    icon: '☠️',
    color: '#991b1b',
    bg: 'rgba(153,27,27,0.12)',
  },
]

interface Mission {
  name: string
  totalMsv: number
  duration: string
}

const MISSIONS: Mission[] = [
  { name: 'Apollo 11', totalMsv: 18, duration: '8 days' },
  { name: 'Mir 438 days (Polyakov)', totalMsv: 1020, duration: '438 days' },
  { name: 'ISS 1 year', totalMsv: 180, duration: '365 days' },
  { name: 'Mars mission (est. 2.5 yr)', totalMsv: 1100, duration: '~2.5 years' },
]

// Comparison reference lines for bar chart
const NASA_CAREER_LIMIT_MSV = 600
const NUCLEAR_WORKER_LIMIT_MSV = 50 // per year

// ── HELPERS ───────────────────────────────────────────────────────────────────

/** Slider uses a log scale: position 0→1 maps to 1 day → 1825 days (5 years) */
const MIN_DAYS = 1
const MAX_DAYS = 5 * 365 // 1825

function sliderToDays(pos: number): number {
  const logMin = Math.log10(MIN_DAYS)
  const logMax = Math.log10(MAX_DAYS)
  return Math.round(Math.pow(10, logMin + pos * (logMax - logMin)))
}

function daysToSlider(days: number): number {
  const logMin = Math.log10(MIN_DAYS)
  const logMax = Math.log10(MAX_DAYS)
  return (Math.log10(days) - logMin) / (logMax - logMin)
}

function formatDays(days: number): string {
  if (days === 1) return '1 day'
  if (days < 14) return `${days} days`
  if (days < 60) return `${(days / 7).toFixed(1)} weeks`
  if (days < 365) return `${(days / 30.4).toFixed(1)} months`
  const yrs = days / 365
  return yrs % 1 < 0.05 ? `${Math.round(yrs)} year${Math.round(yrs) !== 1 ? 's' : ''}` : `${yrs.toFixed(1)} years`
}

function formatMsv(msv: number): string {
  if (msv >= 1000) return `${(msv / 1000).toFixed(3)} Sv (${msv.toFixed(1)} mSv)`
  if (msv >= 1) return `${msv.toFixed(2)} mSv`
  return `${(msv * 1000).toFixed(1)} µSv`
}

function getHealthZone(totalMsv: number): HealthZone {
  for (let i = HEALTH_ZONES.length - 1; i >= 0; i--) {
    if (totalMsv >= HEALTH_ZONES[i].minMsv) return HEALTH_ZONES[i]
  }
  return HEALTH_ZONES[0]
}

// ── SVG BAR CHART ─────────────────────────────────────────────────────────────

interface BarChartProps {
  selectedId: string
  totalDose: number
}

function BarChart({ selectedId, totalDose }: BarChartProps) {
  // Chart shows annual doses; cap for display at deep space or mars transit
  const chartLocations = LOCATIONS.filter(l => l.id !== 'solar_event')
  const maxAnnual = Math.max(...chartLocations.map(l => l.annualMsv), NASA_CAREER_LIMIT_MSV * 1.1)

  const chartW = 460
  const barH = 20
  const gapY = 10
  const labelW = 150
  const valueW = 70
  const barAreaW = chartW - labelW - valueW - 8
  const paddingTop = 6
  const totalHeight = paddingTop + chartLocations.length * (barH + gapY) + 30

  return (
    <svg
      viewBox={`0 0 ${chartW} ${totalHeight}`}
      width="100%"
      style={{ overflow: 'visible' }}
      aria-label="Annual radiation dose comparison bar chart"
    >
      {/* Reference lines */}
      {[NASA_CAREER_LIMIT_MSV, NUCLEAR_WORKER_LIMIT_MSV].map((limit, i) => {
        const x = labelW + 4 + (limit / maxAnnual) * barAreaW
        const isNasa = i === 0
        return (
          <g key={limit}>
            <line
              x1={x} y1={paddingTop - 4}
              x2={x} y2={totalHeight - 20}
              stroke={isNasa ? '#f97316' : '#fbbf24'}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.7}
            />
            <text
              x={x + 2} y={paddingTop + 4}
              fill={isNasa ? '#f97316' : '#fbbf24'}
              fontSize={8}
              fontFamily="monospace"
            >
              {isNasa ? 'NASA career limit' : 'Nuclear worker/yr'}
            </text>
          </g>
        )
      })}

      {chartLocations.map((loc, i) => {
        const y = paddingTop + i * (barH + gapY)
        const barW = Math.max(2, (loc.annualMsv / maxAnnual) * barAreaW)
        const isSelected = loc.id === selectedId
        return (
          <g key={loc.id}>
            {/* Label */}
            <text
              x={labelW - 4} y={y + barH / 2 + 4}
              fill={isSelected ? '#fff' : '#9ca3af'}
              fontSize={9.5}
              textAnchor="end"
              fontWeight={isSelected ? 700 : 400}
            >
              {loc.label}
            </text>

            {/* Bar background */}
            <rect
              x={labelW + 4} y={y}
              width={barAreaW} height={barH}
              rx={4}
              fill="rgba(255,255,255,0.03)"
            />

            {/* Bar fill */}
            <rect
              x={labelW + 4} y={y}
              width={barW} height={barH}
              rx={4}
              fill={loc.color}
              opacity={isSelected ? 1 : 0.45}
            />

            {/* Selected border glow */}
            {isSelected && (
              <rect
                x={labelW + 4} y={y}
                width={barAreaW} height={barH}
                rx={4}
                fill="none"
                stroke={loc.color}
                strokeWidth={1.5}
                opacity={0.8}
              />
            )}

            {/* Value */}
            <text
              x={labelW + 4 + barAreaW + 4} y={y + barH / 2 + 4}
              fill={isSelected ? loc.color : '#6b7280'}
              fontSize={9}
              fontFamily="monospace"
              fontWeight={isSelected ? 700 : 400}
            >
              {loc.annualMsv >= 1000
                ? `${(loc.annualMsv / 1000).toFixed(1)} Sv`
                : `${loc.annualMsv} mSv`}
            </text>
          </g>
        )
      })}

      {/* X-axis label */}
      <text
        x={labelW + 4 + barAreaW / 2} y={totalHeight - 6}
        fill="#4b5563"
        fontSize={8}
        textAnchor="middle"
      >
        Annual dose (mSv/year) — log scale reference
      </text>

      {/* Current dose marker if annual */}
      {totalDose > 0 && (() => {
        const annualEquiv = totalDose
        const x = labelW + 4 + Math.min(1, annualEquiv / maxAnnual) * barAreaW
        return (
          <g>
            <line
              x1={x} y1={paddingTop - 4}
              x2={x} y2={totalHeight - 20}
              stroke="#e879f9"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              opacity={0.6}
            />
          </g>
        )
      })()}
    </svg>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function RadiationCalculator() {
  const [locationId, setLocationId] = useState<string>('iss')
  const [sliderPos, setSliderPos] = useState<number>(daysToSlider(365))

  const durationDays = useMemo(() => sliderToDays(sliderPos), [sliderPos])

  const location = LOCATIONS.find(l => l.id === locationId) ?? LOCATIONS[0]
  const totalMsv = location.dailyMsv * durationDays
  const healthZone = getHealthZone(totalMsv)

  // Comparisons
  const chestXrays = totalMsv / 0.1
  const transatlanticFlights = totalMsv / 0.08
  const dentalXrays = totalMsv / 0.005
  const mammograms = totalMsv / 0.4

  const formatCount = (n: number): string => {
    if (n < 0.01) return '<0.01'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
    if (n >= 10) return Math.round(n).toLocaleString()
    return n.toFixed(2)
  }

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="icon-box">☢️</div>
        <div>
          <h3 className="text-white font-bold text-lg leading-tight">Space Radiation Calculator</h3>
          <p className="text-gray-500 text-xs mt-0.5">Compare radiation exposure across environments</p>
        </div>
      </div>

      {/* Location selector */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 font-semibold">Location</p>
        <div className="flex flex-wrap gap-2">
          {LOCATIONS.map(loc => {
            const active = loc.id === locationId
            return (
              <button
                key={loc.id}
                onClick={() => setLocationId(loc.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                style={{
                  background: active ? `${loc.color}22` : 'transparent',
                  borderColor: active ? loc.color : 'rgba(99,102,241,0.18)',
                  color: active ? loc.color : '#6b7280',
                }}
              >
                {loc.label}
              </button>
            )
          })}
        </div>
        {location && (
          <p className="text-[11px] text-gray-600 mt-2 italic">{location.note}</p>
        )}
      </div>

      {/* Duration slider */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Duration</p>
          <span
            className="text-sm font-bold font-mono"
            style={{ color: location.color }}
          >
            {formatDays(durationDays)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={sliderPos}
          onChange={e => setSliderPos(parseFloat(e.target.value))}
          className="w-full accent-indigo-500 cursor-pointer"
          style={{ accentColor: location.color }}
        />
        <div className="flex justify-between text-[10px] text-gray-700 mt-1">
          <span>1 day</span>
          <span>1 week</span>
          <span>1 month</span>
          <span>1 year</span>
          <span>5 years</span>
        </div>
      </div>

      {/* Dose result */}
      <div
        className="rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3"
        style={{ background: `${location.color}10`, border: `1px solid ${location.color}35` }}
      >
        <div className="flex-1">
          <div className="text-[11px] text-gray-500 mb-1">Total dose — {location.label}, {formatDays(durationDays)}</div>
          <div className="text-2xl font-bold font-mono" style={{ color: location.color }}>
            {formatMsv(totalMsv)}
          </div>
          <div className="text-[11px] text-gray-600 mt-1">
            Daily rate: {location.dailyMsv >= 1 ? `${location.dailyMsv.toFixed(3)} mSv/day` : `${(location.dailyMsv * 1000).toFixed(2)} µSv/day`}
            {' · '}Annual: {location.annualMsv >= 1000 ? `${(location.annualMsv / 1000).toFixed(2)} Sv` : `${location.annualMsv} mSv`}/year
          </div>
        </div>
        <div
          className="px-4 py-2 rounded-xl text-center shrink-0"
          style={{ background: `${healthZone.color}15`, border: `1px solid ${healthZone.color}40` }}
        >
          <div className="text-xl mb-0.5">{healthZone.icon}</div>
          <div className="text-[10px] font-semibold" style={{ color: healthZone.color }}>
            {totalMsv >= 1000
              ? `${(totalMsv / 1000).toFixed(3)} Sv`
              : `${totalMsv.toFixed(2)} mSv`}
          </div>
        </div>
      </div>

      {/* Health effects zones */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">Health Effects Scale</p>
        <div className="space-y-1.5">
          {HEALTH_ZONES.map(zone => {
            const isActive =
              totalMsv >= zone.minMsv &&
              (zone.maxMsv === null || totalMsv < zone.maxMsv)
            const rangeLabel =
              zone.maxMsv === null
                ? `${zone.minMsv >= 1000 ? `${zone.minMsv / 1000} Sv` : `${zone.minMsv} mSv`}+`
                : `${zone.minMsv >= 1000 ? `${zone.minMsv / 1000} Sv` : `${zone.minMsv} mSv`} – ${zone.maxMsv >= 1000 ? `${zone.maxMsv / 1000} Sv` : `${zone.maxMsv} mSv`}`
            return (
              <div
                key={zone.label}
                className="flex items-center gap-3 rounded-xl px-3 py-2 transition-all"
                style={{
                  background: isActive ? zone.bg : 'transparent',
                  border: `1px solid ${isActive ? zone.color + '50' : 'transparent'}`,
                  opacity: isActive ? 1 : 0.5,
                }}
              >
                <span className="text-base w-5 shrink-0">{zone.icon}</span>
                <span className="font-mono text-[10px] shrink-0" style={{ color: zone.color, minWidth: 110 }}>
                  {rangeLabel}
                </span>
                <span className="text-[11px] text-gray-400 flex-1">{zone.label}</span>
                {isActive && (
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${zone.color}25`, color: zone.color }}
                  >
                    YOU ARE HERE
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Comparison bar chart */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">Annual Dose Comparison</p>
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(99,102,241,0.12)' }}
        >
          <BarChart selectedId={locationId} totalDose={totalMsv} />
          <div className="flex flex-wrap gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#f97316' }} />
              <span className="text-[10px] text-gray-600">NASA career limit (600 mSv)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#fbbf24' }} />
              <span className="text-[10px] text-gray-600">Nuclear worker limit (50 mSv/yr)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mission comparisons */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">Historic Missions</p>
        <div className="grid grid-cols-2 gap-2">
          {MISSIONS.map(m => {
            const fraction = Math.min(1, m.totalMsv / 1200)
            return (
              <div
                key={m.name}
                className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.1)' }}
              >
                <div className="text-[11px] font-semibold text-gray-300 mb-1">{m.name}</div>
                <div className="text-[10px] text-gray-600 mb-2">{m.duration}</div>
                <div className="relative h-2 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${fraction * 100}%`,
                      background: 'linear-gradient(90deg, #818cf8, #c4b5fd)',
                    }}
                  />
                </div>
                <div className="text-xs font-bold font-mono text-indigo-300">
                  {m.totalMsv >= 1000 ? `${(m.totalMsv / 1000).toFixed(2)} Sv` : `${m.totalMsv} mSv`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Equivalent exposures converter */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">
          Your {formatDays(durationDays)} dose equals…
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: '🩻', label: 'Chest X-rays', count: chestXrays, unit: '@ 0.1 mSv each' },
            { icon: '✈️', label: 'Transatlantic flights', count: transatlanticFlights, unit: '@ 0.08 mSv each' },
            { icon: '🦷', label: 'Dental X-rays', count: dentalXrays, unit: '@ 0.005 mSv each' },
            { icon: '🫁', label: 'Mammograms', count: mammograms, unit: '@ 0.4 mSv each' },
          ].map(item => (
            <div
              key={item.label}
              className="rounded-xl p-3 flex gap-3 items-start"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.1)' }}
            >
              <span className="text-xl shrink-0">{item.icon}</span>
              <div>
                <div
                  className="text-base font-bold font-mono leading-tight"
                  style={{ color: location.color }}
                >
                  {formatCount(item.count)}
                </div>
                <div className="text-[11px] font-semibold text-gray-300">{item.label}</div>
                <div className="text-[10px] text-gray-600">{item.unit}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-5 rounded-xl p-3" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}>
        <p className="text-[10px] text-gray-600 leading-relaxed">
          <span className="text-indigo-400 font-semibold">Note: </span>
          All figures are approximate averages. Actual doses vary with solar activity, shielding design, and individual orbit parameters.
          NASA's career limit (600 mSv) is age/sex adjusted. Data from NASA, ESA, and published Mars mission studies.
        </p>
      </div>
    </div>
  )
}
