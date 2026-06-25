import { useState, useEffect, useMemo } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const OXYGEN_KG_PER_PERSON_DAY = 0.84
const WATER_DRINKING_L_PER_PERSON_DAY = 3
const WATER_HYGIENE_L_PER_PERSON_DAY = 20
const FOOD_KG_PER_PERSON_DAY = 1.8
const POWER_KW_PER_PERSON = 1.5
const HABITAT_M2_PER_PERSON = 37
const INITIAL_SUPPLY_KG_PER_PERSON = 1000
const STARSHIP_PAYLOAD_KG = 100_000
const STARSHIP_COST_USD = 10_000_000

// Synodic period of Mars in ms
const MARS_SYNODIC_MS = 779.94 * 24 * 60 * 60 * 1000
// Reference window: January 2025
const REFERENCE_WINDOW_MS = new Date('2025-01-15').getTime()

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string
  label: string
  icon: string
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'landing_site',   icon: '📍', label: 'Select landing site (near water ice)' },
  { id: 'power',          icon: '☀️', label: 'Deploy solar panels / nuclear reactor' },
  { id: 'atmo_processor', icon: '🌬️', label: 'Set up atmospheric processor' },
  { id: 'comms',          icon: '📡', label: 'Establish communication relay' },
  { id: 'hydroponics',    icon: '🌱', label: 'Grow first hydroponic crop' },
  { id: 'water_drill',    icon: '🔩', label: 'Drill for subsurface water' },
  { id: 'recycling',      icon: '♻️', label: 'Establish recycling systems' },
]

const STORAGE_KEY = 'spacehub_colony_checklist'

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  label: string
  colonists: number
  icon: string
}

const PRESETS: Preset[] = [
  { label: 'Research outpost', colonists: 10,    icon: '🔬' },
  { label: 'Early settlement', colonists: 100,   icon: '🏕️' },
  { label: 'Small city',       colonists: 1_000, icon: '🏙️' },
  { label: 'Large colony',     colonists: 10_000, icon: '🌆' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(decimals > 0 ? decimals : 1) + 'k'
  return n.toFixed(decimals)
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(0) + 'M'
  return '$' + n.toLocaleString()
}

/** Map colonists (10–10000) to a slider value (0–100) using log scale */
function colonistsToSlider(colonists: number): number {
  return ((Math.log10(colonists) - Math.log10(10)) / (Math.log10(10_000) - Math.log10(10))) * 100
}

/** Map slider value (0–100) back to colonists (10–10000) using log scale */
function sliderToColonists(slider: number): number {
  const logMin = Math.log10(10)
  const logMax = Math.log10(10_000)
  return Math.round(Math.pow(10, logMin + (slider / 100) * (logMax - logMin)))
}

function nextLaunchWindow(): Date {
  const now = Date.now()
  let t = REFERENCE_WINDOW_MS
  while (t < now) {
    t += MARS_SYNODIC_MS
  }
  return new Date(t)
}

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ResourceBarProps {
  icon: string
  label: string
  value: string
  unit: string
  pct: number          // 0–100, visual fill (log-scaled)
  color: string
  borderColor: string
  bgColor: string
}

function ResourceBar({ icon, label, value, unit, pct, color, borderColor, bgColor }: ResourceBarProps) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-white font-bold text-sm">{value}</span>
          <span className="text-gray-500 text-xs ml-1">{unit}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: string
  label: string
  value: string
  sub?: string
}

function StatCard({ icon, label, value, sub }: StatCardProps) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-1"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="text-xl">{icon}</div>
      <div className="text-white font-bold text-base leading-tight">{value}</div>
      <div className="text-gray-500 text-xs">{label}</div>
      {sub && <div className="text-gray-600 text-[10px] mt-0.5">{sub}</div>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarsColonyPlanner() {
  const [colonists, setColonists] = useState(100)
  const [slider, setSlider] = useState(() => colonistsToSlider(100))
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as Record<string, boolean>
    } catch {
      // ignore
    }
    return {}
  })

  // Persist checklist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checklist))
    } catch {
      // ignore
    }
  }, [checklist])

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    setSlider(v)
    setColonists(sliderToColonists(v))
  }

  const setPreset = (c: number) => {
    setColonists(c)
    setSlider(colonistsToSlider(c))
  }

  const toggleCheck = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // ── Computed values ──────────────────────────────────────────────────────────

  const resources = useMemo(() => {
    const oxygenKg   = OXYGEN_KG_PER_PERSON_DAY * colonists
    const waterTotal = (WATER_DRINKING_L_PER_PERSON_DAY + WATER_HYGIENE_L_PER_PERSON_DAY) * colonists
    const foodKg     = FOOD_KG_PER_PERSON_DAY * colonists
    const powerKw    = POWER_KW_PER_PERSON * colonists
    const habitatM2  = HABITAT_M2_PER_PERSON * colonists
    const massKg     = INITIAL_SUPPLY_KG_PER_PERSON * colonists

    const starships  = Math.ceil(massKg / STARSHIP_PAYLOAD_KG)
    const cost       = starships * STARSHIP_COST_USD

    // ISRU: Sabatier reaction 2CO₂ + 2H₂ → CH₄ + 2H₂O; for O₂ from CO₂
    // Simplified: MOXIE-style electrolysis — each CO₂ → CO + ½O₂
    // Assume 10% ISRU coverage of O₂ need (optimistic near-future)
    const isruO2KgDay = oxygenKg * 0.10

    // Log scale for progress bar (colonist range 10–10000)
    const logPct = colonistsToSlider(colonists)

    return {
      oxygenKg, waterTotal, foodKg, powerKw, habitatM2, massKg,
      starships, cost, isruO2KgDay, logPct,
    }
  }, [colonists])

  const nextWindow = useMemo(() => nextLaunchWindow(), [])
  const daysToWindow = daysUntil(nextWindow)

  // Fun comparisons
  const swimmingPools  = (resources.waterTotal / 2_500).toFixed(1)    // avg pool ~2500L
  const windTurbines   = Math.ceil(resources.powerKw / 2000)           // avg turbine ~2MW
  const footballFields = (resources.habitatM2 / 7_140).toFixed(2)     // ~7140 m²

  const checkedCount = CHECKLIST_ITEMS.filter(i => checklist[i.id]).length

  return (
    <div className="space-card p-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <div className="icon-box text-xl">🔴</div>
        <div>
          <h3 className="text-white font-bold text-lg leading-tight">Mars Colony Planner</h3>
          <p className="text-gray-500 text-xs">Plan your Mars settlement — resources, logistics & survival</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-2xl font-black text-white">{colonists.toLocaleString()}</div>
          <div className="text-gray-500 text-[10px] uppercase tracking-widest">colonists</div>
        </div>
      </div>

      {/* ── Colony size slider ── */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Colony Size</span>
          <span className="text-xs text-gray-600">10 — 10,000 colonists</span>
        </div>

        {/* Log-scale slider */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={slider}
          onChange={handleSlider}
          className="w-full mb-4"
          style={{ accentColor: '#ef4444' }}
        />

        {/* Presets */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map(p => (
            <button
              key={p.colonists}
              onClick={() => setPreset(p.colonists)}
              className="text-xs py-2 px-3 rounded-xl font-semibold transition-all text-left"
              style={
                colonists === p.colonists
                  ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }
              }
            >
              <span className="mr-1">{p.icon}</span>{p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Resource calculators ── */}
      <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
        Daily Resource Requirements
      </h4>
      <div className="space-y-2.5 mb-5">
        <ResourceBar
          icon="💨" label="Oxygen"
          value={fmt(resources.oxygenKg, 1)} unit="kg/day"
          pct={resources.logPct}
          color="linear-gradient(90deg,#38bdf8,#7dd3fc)"
          borderColor="rgba(56,189,248,0.2)" bgColor="rgba(56,189,248,0.04)"
        />
        <ResourceBar
          icon="💧" label="Water"
          value={fmt(resources.waterTotal, 1)} unit="L/day"
          pct={resources.logPct}
          color="linear-gradient(90deg,#60a5fa,#93c5fd)"
          borderColor="rgba(96,165,250,0.2)" bgColor="rgba(96,165,250,0.04)"
        />
        <ResourceBar
          icon="🍖" label="Food"
          value={fmt(resources.foodKg, 1)} unit="kg/day"
          pct={resources.logPct}
          color="linear-gradient(90deg,#fb923c,#fbbf24)"
          borderColor="rgba(251,146,60,0.2)" bgColor="rgba(251,146,60,0.04)"
        />
        <ResourceBar
          icon="⚡" label="Power"
          value={fmt(resources.powerKw, 0)} unit="kW total"
          pct={resources.logPct}
          color="linear-gradient(90deg,#fbbf24,#fde68a)"
          borderColor="rgba(251,191,36,0.2)" bgColor="rgba(251,191,36,0.04)"
        />
        <ResourceBar
          icon="🏠" label="Habitat"
          value={fmt(resources.habitatM2, 0)} unit="m² total"
          pct={resources.logPct}
          color="linear-gradient(90deg,#a78bfa,#c4b5fd)"
          borderColor="rgba(167,139,250,0.2)" bgColor="rgba(167,139,250,0.04)"
        />
        <ResourceBar
          icon="🚀" label="Initial Supply Mass"
          value={fmt(resources.massKg, 0)} unit="kg"
          pct={resources.logPct}
          color="linear-gradient(90deg,#f87171,#fca5a5)"
          borderColor="rgba(248,113,113,0.2)" bgColor="rgba(248,113,113,0.04)"
        />
      </div>

      {/* ── Journey timeline ── */}
      <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
        Journey Timeline
      </h4>
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.18)' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-3xl font-black text-white">7</div>
            <div className="text-gray-400 text-xs mt-1">months avg transit</div>
            <div className="text-gray-600 text-[10px] mt-0.5">(6–9 mo depending on window)</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black" style={{ color: '#fb923c' }}>{formatDate(nextWindow)}</div>
            <div className="text-gray-400 text-xs mt-1">next launch window</div>
            <div className="text-gray-600 text-[10px] mt-0.5">26-month synodic cycle</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black text-white">{daysToWindow.toLocaleString()}</div>
            <div className="text-gray-400 text-xs mt-1">days until window</div>
            <div className="text-gray-600 text-[10px] mt-0.5">~{Math.ceil(daysToWindow / 30)} months away</div>
          </div>
        </div>
      </div>

      {/* ── Supply chain ── */}
      <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
        Supply Chain & Logistics
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon="🛸"
          label="Starships needed"
          value={resources.starships.toLocaleString()}
          sub={`~100t payload each`}
        />
        <StatCard
          icon="💰"
          label="Est. launch cost"
          value={fmtCurrency(resources.cost)}
          sub={`$10M / Starship`}
        />
        <StatCard
          icon="🧪"
          label="ISRU O₂ supply"
          value={`${fmt(resources.isruO2KgDay, 1)} kg/day`}
          sub={`~10% of O₂ need`}
        />
        <StatCard
          icon="📦"
          label="Total cargo mass"
          value={fmt(resources.massKg, 0) + ' kg'}
          sub={`6-month supply`}
        />
      </div>

      {/* ── Fun comparisons ── */}
      <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
        Fun Comparisons
      </h4>
      <div
        className="rounded-2xl p-4 space-y-2.5 mb-5"
        style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}
      >
        <p className="text-sm text-gray-300 leading-relaxed">
          <span className="text-indigo-400 font-semibold">💧 Water:</span>{' '}
          Your colony needs <strong className="text-white">{fmt(resources.waterTotal, 0)} L</strong> of water per day —
          that's <strong className="text-white">{swimmingPools}</strong> Olympic swimming pools.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed">
          <span className="text-yellow-400 font-semibold">⚡ Power:</span>{' '}
          <strong className="text-white">{fmt(resources.powerKw, 0)} kW</strong> required —
          equivalent to <strong className="text-white">{windTurbines}</strong> wind turbine{windTurbines !== 1 ? 's' : ''} running at full capacity.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed">
          <span className="text-violet-400 font-semibold">🏠 Habitat:</span>{' '}
          <strong className="text-white">{fmt(resources.habitatM2, 0)} m²</strong> of pressurised living space —
          the size of <strong className="text-white">{footballFields}</strong> football field{Number(footballFields) !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* ── Survival checklist ── */}
      <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
        Survival Checklist
        <span
          className="ml-2 text-[10px] font-normal px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}
        >
          {checkedCount}/{CHECKLIST_ITEMS.length} complete
        </span>
      </h4>
      <div className="space-y-2">
        {CHECKLIST_ITEMS.map(item => {
          const checked = !!checklist[item.id]
          return (
            <button
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
              style={
                checked
                  ? { background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.25)' }
                  : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              {/* Checkbox circle */}
              <div
                className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold transition-all"
                style={
                  checked
                    ? { background: 'rgba(74,222,128,0.2)', border: '1.5px solid #4ade80', color: '#4ade80' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.15)', color: 'transparent' }
                }
              >
                {checked ? '✓' : ''}
              </div>
              <span className="text-base">{item.icon}</span>
              <span
                className="text-sm flex-1 transition-all"
                style={{ color: checked ? '#86efac' : '#9ca3af', textDecoration: checked ? 'line-through' : 'none' }}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── ISRU note ── */}
      <div
        className="mt-5 p-4 rounded-2xl text-xs text-gray-500 leading-relaxed"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <strong className="text-gray-400">About ISRU:</strong> In-Situ Resource Utilization uses the Sabatier process
        (CO₂ + H₂ → CH₄ + H₂O) and electrolysis to produce O₂ from Mars' CO₂-rich atmosphere, reducing Earth supply
        mass over time. The 10% figure reflects early MOXIE-style production capability.
      </div>
    </div>
  )
}
