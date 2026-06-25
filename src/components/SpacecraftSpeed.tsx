import { useState, useEffect, useRef } from 'react'

// ─── Data ────────────────────────────────────────────────────────────────────

const C = 299_792_458 // m/s, speed of light

interface SpeedEntry {
  id: string
  name: string
  speedMs: number        // m/s
  note?: string
  isLight?: boolean
}

const SPEEDS: SpeedEntry[] = [
  { id: 'walking',        name: 'Walking',               speedMs: 1.4 },
  { id: 'airplane',       name: 'Commercial Airplane',   speedMs: 250 },
  { id: 'sound',          name: 'Speed of Sound',        speedMs: 343,            note: 'sea level' },
  { id: 'iss',            name: 'ISS',                   speedMs: 7_660 },
  { id: 'apollo10',       name: 'Apollo 10',             speedMs: 11_082,         note: 'fastest crewed' },
  { id: 'newhorizons',    name: 'New Horizons',          speedMs: 14_310,         note: 'at launch' },
  { id: 'voyager2',       name: 'Voyager 2',             speedMs: 15_400 },
  { id: 'voyager1',       name: 'Voyager 1',             speedMs: 17_000 },
  { id: 'helios2',        name: 'Helios 2 (1976)',       speedMs: 70_200,         note: 'fastest probe record' },
  { id: 'parker',         name: 'Parker Solar Probe',    speedMs: 192_000,        note: 'fastest ever' },
  { id: 'light',          name: 'Speed of Light',        speedMs: C,              isLight: true },
]

// Spacecraft available in the calculator (excluding light)
const CALC_SPACECRAFT = SPEEDS.filter(s => !s.isLight)

// ─── Duration options ─────────────────────────────────────────────────────────

interface Duration {
  label: string
  seconds: number
}

const DURATIONS: Duration[] = [
  { label: '1 day',   seconds: 86_400 },
  { label: '1 week',  seconds: 604_800 },
  { label: '1 month', seconds: 2_592_000 },
  { label: '1 year',  seconds: 31_536_000 },
]

// ─── Distance milestones for calculator ───────────────────────────────────────

interface Milestone {
  label: string
  km: number
}

const MILESTONES: Milestone[] = [
  { label: 'around Earth\'s equator',      km: 40_075 },
  { label: 'to the Moon',                  km: 384_400 },
  { label: 'to the Sun',                   km: 149_597_870 },
  { label: 'to Mars (average)',             km: 225_000_000 },
  { label: 'to Jupiter (average)',          km: 778_500_000 },
  { label: 'to Saturn (average)',           km: 1_433_000_000 },
  { label: 'to Pluto (average)',            km: 5_906_380_000 },
  { label: 'to the edge of the Solar System (heliopause)', km: 18_000_000_000 },
  { label: 'to Alpha Centauri',             km: 40_208_000_000_000 },
]

function getDistanceMeaning(km: number): string {
  // Find the highest milestone we've passed
  let best = ''
  for (const m of MILESTONES) {
    if (km >= m.km) best = m.label
  }
  if (!best) {
    if (km < 40_075) {
      const pct = ((km / 40_075) * 100).toFixed(1)
      return `${pct}% of the way around Earth`
    }
    return 'close to Earth'
  }
  return `past the ${best}`
}

// ─── Voyager reference data ───────────────────────────────────────────────────

const REF_DATE = new Date('2024-01-01T00:00:00Z').getTime()  // ms
const VOYAGER1_REF_KM = 23_500_000_000   // km as of REF_DATE
const VOYAGER2_REF_KM = 19_500_000_000   // km as of REF_DATE
const V1_SPEED_KM_S = SPEEDS.find(s => s.id === 'voyager1')!.speedMs / 1000
const V2_SPEED_KM_S = SPEEDS.find(s => s.id === 'voyager2')!.speedMs / 1000
const C_KM_S = C / 1000
const AU_KM = 149_597_870.7  // km per AU

// ─── Speed of light countdown data ───────────────────────────────────────────

interface LightTravel {
  label: string
  seconds: number
}

const LIGHT_TRAVELS: LightTravel[] = [
  { label: 'Earth → Moon',           seconds: 1.282 },
  { label: 'Earth → Sun',            seconds: 499 },
  { label: 'Earth → Mars (avg)',      seconds: 720 },
  { label: 'Earth → Jupiter',        seconds: 2_595 },
  { label: 'Earth → Pluto',          seconds: 19_800 },
  { label: 'Earth → Alpha Centauri', seconds: 4.24 * 365.25 * 24 * 3600 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSpeed(ms: number): string {
  const kmh = ms * 3.6
  if (kmh >= 1_000_000) return `${(kmh / 1_000_000).toFixed(2)}M km/h`
  if (kmh >= 1_000)     return `${Math.round(kmh).toLocaleString()} km/h`
  return `${kmh.toFixed(1)} km/h`
}

function pctOfLight(ms: number): string {
  const pct = (ms / C) * 100
  if (pct < 0.0001) return `${(pct * 1_000_000).toFixed(2)} ppm c`
  if (pct < 0.01)   return `${(pct * 1000).toFixed(2)}‰ c`
  return `${pct.toFixed(4)}% c`
}

// Log-scale normalized 0→1 for bar widths
const LOG_MIN = Math.log10(SPEEDS[0].speedMs)
const LOG_MAX = Math.log10(C)
function logNorm(ms: number): number {
  return (Math.log10(ms) - LOG_MIN) / (LOG_MAX - LOG_MIN)
}

function barColor(ms: number): string {
  const pct = ms / C
  if (pct >= 0.1)      return '#f43f5e'  // red — very fast
  if (pct >= 0.01)     return '#f97316'  // orange
  if (pct >= 0.001)    return '#eab308'  // yellow
  if (pct >= 0.0001)   return '#22c55e'  // green
  if (pct >= 0.00001)  return '#3b82f6'  // blue
  return '#6b7280'                         // gray — slow
}

function formatSeconds(s: number): string {
  if (s < 60)       return `${s.toFixed(2)} seconds`
  if (s < 3600)     return `${Math.floor(s / 60)} min ${Math.round(s % 60)} sec`
  if (s < 86400)    return `${Math.floor(s / 3600)} hr ${Math.floor((s % 3600) / 60)} min`
  if (s < 31_536_000) return `${(s / 86400).toFixed(1)} days`
  return `${(s / (365.25 * 86400)).toFixed(2)} years`
}

function formatKm(km: number): string {
  if (km >= 1e12)  return `${(km / 1e12).toFixed(3)} trillion km`
  if (km >= 1e9)   return `${(km / 1e9).toFixed(3)} billion km`
  if (km >= 1e6)   return `${(km / 1e6).toFixed(3)} million km`
  if (km >= 1_000) return `${Math.round(km).toLocaleString()} km`
  return `${km.toFixed(1)} km`
}

function voyagerDistances(nowMs: number) {
  const elapsedSec = (nowMs - REF_DATE) / 1000
  const v1km = VOYAGER1_REF_KM + V1_SPEED_KM_S * elapsedSec
  const v2km = VOYAGER2_REF_KM + V2_SPEED_KM_S * elapsedSec
  return { v1km, v2km }
}

function signalTime(km: number): { hours: number; minutes: number; seconds: number } {
  const totalSec = (km / C_KM_S)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = Math.floor(totalSec % 60)
  return { hours, minutes, seconds }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpacecraftSpeed() {
  const [now, setNow] = useState(() => Date.now())
  const [selectedId, setSelectedId] = useState('voyager1')
  const [selectedDuration, setSelectedDuration] = useState(0) // index into DURATIONS
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 5000)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  // Live Voyager distances
  const { v1km, v2km } = voyagerDistances(now)
  const v1au = v1km / AU_KM
  const v2au = v2km / AU_KM
  const v1lh = v1km / (C_KM_S * 3600)
  const v2lh = v2km / (C_KM_S * 3600)
  const v1sig = signalTime(v1km)
  const v2sig = signalTime(v2km)

  // Calculator
  const craft = CALC_SPACECRAFT.find(s => s.id === selectedId) ?? CALC_SPACECRAFT[0]
  const dur = DURATIONS[selectedDuration]
  const calcDistKm = (craft.speedMs / 1000) * dur.seconds
  const calcDistMeaning = getDistanceMeaning(calcDistKm)

  return (
    <div className="space-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="icon-box">🚀</div>
        <div>
          <h3 className="text-white font-bold text-base">Spacecraft Speed Comparator</h3>
          <p className="text-gray-500 text-xs">From walking pace to the speed of light</p>
        </div>
      </div>

      {/* ── Section 1: Speed Bar Chart ─────────────────────────────────────── */}
      <div className="mb-8">
        <h4 className="text-gray-300 text-sm font-semibold mb-1">Speed Comparison <span className="text-gray-600 font-normal">(log scale)</span></h4>
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          {[
            { color: '#6b7280', label: 'Very slow' },
            { color: '#3b82f6', label: 'Slow' },
            { color: '#22c55e', label: 'Fast' },
            { color: '#eab308', label: 'Very fast' },
            { color: '#f97316', label: 'Extreme' },
            { color: '#f43f5e', label: 'Relativistic' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
              <span className="text-[10px] text-gray-600">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {SPEEDS.map(entry => {
            const w = logNorm(entry.speedMs) * 100
            const color = entry.isLight ? '#a78bfa' : barColor(entry.speedMs)
            return (
              <div key={entry.id}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-gray-300 truncate max-w-[140px]">{entry.name}</span>
                    {entry.note && (
                      <span className="text-[9px] text-gray-600 shrink-0 hidden sm:inline">{entry.note}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] font-mono text-gray-400">{formatSpeed(entry.speedMs)}</span>
                    <span className="text-[9px] font-mono" style={{ color: color + 'cc' }}>{pctOfLight(entry.speedMs)}</span>
                  </div>
                </div>
                <div className="relative h-5 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                    style={{
                      width: `${Math.max(w, 1)}%`,
                      background: entry.isLight
                        ? 'linear-gradient(90deg, #7c3aed, #a78bfa, #e879f9)'
                        : `linear-gradient(90deg, ${color}40, ${color})`,
                      boxShadow: entry.isLight ? `0 0 8px #a78bfa66` : `0 0 6px ${color}44`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Section 2: Live Voyager Tracker ──────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-gray-300 text-sm font-semibold">Live Voyager Distance</h4>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
            LIVE · 5s
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              name: 'Voyager 1',
              launched: 'Sep 5, 1977',
              km: v1km,
              au: v1au,
              lh: v1lh,
              sig: v1sig,
              color: '#60a5fa',
            },
            {
              name: 'Voyager 2',
              launched: 'Aug 20, 1977',
              km: v2km,
              au: v2au,
              lh: v2lh,
              sig: v2sig,
              color: '#34d399',
            },
          ].map(v => (
            <div
              key={v.name}
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${v.color}22` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold" style={{ color: v.color }}>{v.name}</span>
                <span className="text-[10px] text-gray-600">Launched {v.launched}</span>
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-wide">Distance from Earth</div>
                  <div className="text-base font-bold font-mono text-white leading-tight">{formatKm(v.km)}</div>
                </div>
                <div className="flex gap-4">
                  <div>
                    <div className="text-[10px] text-gray-600">AU</div>
                    <div className="text-xs font-mono text-gray-300">{v.au.toFixed(2)} AU</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-600">Light-hours</div>
                    <div className="text-xs font-mono text-gray-300">{v.lh.toFixed(2)} lh</div>
                  </div>
                </div>
                <div
                  className="mt-2 rounded-lg p-2 text-[11px] leading-relaxed"
                  style={{ background: `${v.color}0d` }}
                >
                  <span className="text-gray-400">Signal travel time: </span>
                  <span className="font-semibold" style={{ color: v.color }}>
                    {v.sig.hours > 0 ? `${v.sig.hours}h ` : ''}{v.sig.minutes}m {v.sig.seconds}s
                  </span>
                  <span className="text-gray-500 text-[10px] block mt-0.5">
                    It takes {v.sig.hours}h {v.sig.minutes}m for {v.name}'s signal to reach Earth
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 3: Travel Distance Calculator ────────────────────────── */}
      <div className="mb-8">
        <h4 className="text-gray-300 text-sm font-semibold mb-3">How Far Could You Travel?</h4>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {/* Spacecraft selector */}
            <div className="flex-1">
              <label className="text-[10px] text-gray-600 uppercase tracking-wide block mb-1">Spacecraft</label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full rounded-lg text-xs text-white px-3 py-2 outline-none focus:ring-1"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  // @ts-expect-error -- accent not in CSSProperties
                  colorScheme: 'dark',
                }}
              >
                {CALC_SPACECRAFT.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#1a1a2e' }}>
                    {s.name}{s.note ? ` (${s.note})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration selector */}
            <div>
              <label className="text-[10px] text-gray-600 uppercase tracking-wide block mb-1">Duration</label>
              <div className="flex gap-1.5">
                {DURATIONS.map((d, i) => (
                  <button
                    key={d.label}
                    onClick={() => setSelectedDuration(i)}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                    style={{
                      background: selectedDuration === i ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${selectedDuration === i ? '#60a5fa66' : 'rgba(255,255,255,0.08)'}`,
                      color: selectedDuration === i ? '#60a5fa' : '#9ca3af',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)' }}>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Distance traveled</div>
            <div className="text-xl font-bold text-white font-mono mb-1">{formatKm(calcDistKm)}</div>
            <div className="text-xs text-blue-400">{calcDistMeaning}</div>
            <div className="mt-2 text-[11px] text-gray-500">
              {craft.name} traveling at{' '}
              <span className="text-gray-300 font-mono">{formatSpeed(craft.speedMs)}</span>
              {' '}for {dur.label}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Speed of Light Countdown ──────────────────────────── */}
      <div>
        <h4 className="text-gray-300 text-sm font-semibold mb-3">Light Travel Times</h4>
        <div className="space-y-2">
          {LIGHT_TRAVELS.map(lt => (
            <div
              key={lt.label}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.1)' }}
            >
              <span className="text-xs text-gray-400">{lt.label}</span>
              <span className="text-xs font-mono font-bold text-violet-300">{formatSeconds(lt.seconds)}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-700 mt-2">
          Even at 299,792,458 m/s the universe is vast — Alpha Centauri light takes 4.24 years.
        </p>
      </div>
    </div>
  )
}
