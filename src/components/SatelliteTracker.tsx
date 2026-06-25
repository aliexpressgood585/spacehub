import { useState, useEffect, useCallback } from 'react'
import * as satellite from 'satellite.js'
import EarthGlobe3D from './EarthGlobe3D'

// ---------------------------------------------------------------------------
// Satellite metadata — NORAD IDs + display info
// ---------------------------------------------------------------------------
const SAT_LIST = [
  { id: '25544', name: 'ISS',            icon: '🛸', color: '#818cf8', category: 'Station' },
  { id: '20580', name: 'Hubble',         icon: '🔭', color: '#60a5fa', category: 'Science' },
  { id: '48274', name: 'Tiangong (CSS)', icon: '🇨🇳', color: '#f87171', category: 'Station' },
  { id: '43013', name: 'NOAA-20',        icon: '🌤️', color: '#4ade80', category: 'Weather' },
  { id: '28654', name: 'NOAA-18',        icon: '🛰️', color: '#34d399', category: 'Weather' },
  { id: '27424', name: 'Aqua',           icon: '🌊', color: '#38bdf8', category: 'Science' },
  { id: '25994', name: 'Terra',          icon: '🌍', color: '#86efac', category: 'Science' },
  { id: '43226', name: 'GOES-17',        icon: '🌪️', color: '#fbbf24', category: 'Weather' },
  { id: '44637', name: 'Starlink-1007',  icon: '📡', color: '#a78bfa', category: 'Comms' },
  { id: '44713', name: 'Starlink-1027',  icon: '📡', color: '#c4b5fd', category: 'Comms' },
] as const

type SatMeta = typeof SAT_LIST[number]
type Category = 'All' | 'Station' | 'Science' | 'Weather' | 'Comms'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TLERecord {
  line1: string
  line2: string
  satrec: satellite.SatRec
}

type LoadStatus = 'loading' | 'ok' | 'error'

interface SatState {
  id: string
  name: string
  icon: string
  color: string
  category: string
  status: LoadStatus
  lat: number
  lng: number
  alt: number          // km
  vel: number          // km/s
  period: number       // minutes
  inclination: number  // degrees
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a raw TLE text blob and return line1 + line2 */
function parseTLE(text: string): { line1: string; line2: string } | null {
  const lines = text
    .trim()
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  let line1 = ''
  let line2 = ''
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && !line1) { line1 = lines[i] }
    if (lines[i].startsWith('2 ') && !line2) { line2 = lines[i] }
    if (line1 && line2) break
  }
  if (!line1 || !line2) return null
  return { line1, line2 }
}

/** Compute live lat/lng/alt/vel from a satellite record */
function computePosition(rec: satellite.SatRec, now: Date): {
  lat: number; lng: number; alt: number; vel: number
} | null {
  const pv = satellite.propagate(rec, now)
  if (!pv || typeof pv.position === 'boolean' || typeof pv.velocity === 'boolean') return null

  const gmst = satellite.gstime(now)
  const geo  = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst)

  const lat = satellite.degreesLat(geo.latitude)
  const lng = satellite.degreesLong(geo.longitude)
  const alt = geo.height  // km

  // velocity magnitude in km/s
  const v = pv.velocity as satellite.EciVec3<number>
  const vel = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2)

  return { lat, lng, alt, vel }
}

/** Orbital period (minutes) from mean motion (revs/day stored in TLE line2) */
function computePeriod(satrec: satellite.SatRec): number {
  // satrec.no is in radians/minute; period = 2π / no (minutes)
  if (!satrec.no || satrec.no <= 0) return 0
  return (2 * Math.PI) / satrec.no
}

/** Inclination in degrees from satrec.inclo (radians) */
function computeInclination(satrec: satellite.SatRec): number {
  return (satrec.inclo * 180) / Math.PI
}

const CATEGORY_ORDER: Category[] = ['All', 'Station', 'Science', 'Weather', 'Comms']

const CATEGORY_COLORS: Record<Category, string> = {
  All:     'rgba(99,102,241,0.25)',
  Station: 'rgba(129,140,248,0.25)',
  Science: 'rgba(96,165,250,0.25)',
  Weather: 'rgba(74,222,128,0.25)',
  Comms:   'rgba(167,139,250,0.25)',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SatelliteTracker() {
  const [tleMap, setTleMap]       = useState<Map<string, TLERecord>>(new Map())
  const [sats, setSats]           = useState<SatState[]>(() =>
    SAT_LIST.map(m => ({
      id:          m.id,
      name:        m.name,
      icon:        m.icon,
      color:       m.color,
      category:    m.category,
      status:      'loading' as LoadStatus,
      lat: 0, lng: 0, alt: 0, vel: 0, period: 0, inclination: 0,
    }))
  )
  const [filter, setFilter]       = useState<Category>('All')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // ------------------------------------------------------------------
  // 1.  Fetch TLE data for all satellites in parallel on mount
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      const results = await Promise.allSettled(
        SAT_LIST.map(async (meta) => {
          const res  = await fetch(`/api/tle?id=${meta.id}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const text = await res.text()
          const tle  = parseTLE(text)
          if (!tle) throw new Error('TLE parse failed')
          const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
          return { id: meta.id, satrec, ...tle }
        })
      )

      if (cancelled) return

      const newMap = new Map<string, TLERecord>()
      const now    = new Date()

      setSats(prev => prev.map((s, i) => {
        const result = results[i]
        if (result.status === 'rejected') {
          return { ...s, status: 'error' as LoadStatus }
        }

        const rec = result.value
        newMap.set(s.id, { line1: rec.line1, line2: rec.line2, satrec: rec.satrec })

        const pos = computePosition(rec.satrec, now)
        if (!pos) return { ...s, status: 'error' as LoadStatus }

        return {
          ...s,
          status:      'ok' as LoadStatus,
          lat:         pos.lat,
          lng:         pos.lng,
          alt:         pos.alt,
          vel:         pos.vel,
          period:      computePeriod(rec.satrec),
          inclination: computeInclination(rec.satrec),
        }
      }))

      setTleMap(newMap)
      setLastUpdate(now)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [])

  // ------------------------------------------------------------------
  // 2.  Recompute positions every 5 seconds once TLEs are loaded
  // ------------------------------------------------------------------
  const refreshPositions = useCallback(() => {
    if (tleMap.size === 0) return
    const now = new Date()

    setSats(prev => prev.map(s => {
      if (s.status !== 'ok') return s
      const rec = tleMap.get(s.id)
      if (!rec) return s
      const pos = computePosition(rec.satrec, now)
      if (!pos) return s
      return { ...s, lat: pos.lat, lng: pos.lng, alt: pos.alt, vel: pos.vel }
    }))
    setLastUpdate(now)
  }, [tleMap])

  useEffect(() => {
    if (tleMap.size === 0) return
    const iv = setInterval(refreshPositions, 5000)
    return () => clearInterval(iv)
  }, [tleMap, refreshPositions])

  // ------------------------------------------------------------------
  // Derived values
  // ------------------------------------------------------------------
  const filtered   = filter === 'All' ? sats : sats.filter(s => s.category === filter)
  const loadedCount = sats.filter(s => s.status === 'ok').length

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------
  function fmtCoord(val: number, pos: 'lat' | 'lng') {
    const abs = Math.abs(val)
    if (pos === 'lat') return `${abs.toFixed(2)}° ${val >= 0 ? 'N' : 'S'}`
    return `${abs.toFixed(2)}° ${val >= 0 ? 'E' : 'W'}`
  }

  function fmtPeriod(min: number) {
    if (!min) return '—'
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="space-y-5">

      {/* ── 3D Globe ─────────────────────────────────────────────────── */}
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-box">🌍</div>
          <div>
            <h3 className="text-white font-bold text-base">3D Earth — Real-Time Satellites</h3>
            <p className="text-gray-500 text-xs">Interactive globe with live orbital tracks</p>
          </div>
        </div>
        <EarthGlobe3D />
      </div>

      {/* ── Live Satellite Cards ──────────────────────────────────────── */}
      <div className="space-card p-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="icon-box">🛰️</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base">Satellite Tracker — Live SGP4</h3>
            <p className="text-gray-500 text-xs">
              Real-time positions via TLE propagation · updated every 5 s
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lastUpdate && (
              <span className="text-gray-600 text-xs hidden sm:block">
                {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
              </span>
            )}
            <div className="live-badge">
              <span className="live-dot" />
              🟢 LIVE · {loadedCount}/{SAT_LIST.length}
            </div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-5">
          {CATEGORY_ORDER.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="px-3 py-1 rounded-xl text-xs font-medium transition-all"
              style={filter === cat ? {
                background: CATEGORY_COLORS[cat],
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#e2e8f0',
              } : {
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: '#6b7280',
              }}
            >
              {cat === 'All' ? `All (${sats.length})` : `${cat} (${sats.filter(s => s.category === cat).length})`}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(sat => {
            const meta = SAT_LIST.find((m): m is SatMeta => m.id === sat.id)!

            /* ── Loading skeleton ── */
            if (sat.status === 'loading') {
              return (
                <div
                  key={sat.id}
                  className="rounded-2xl p-5 animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}
                    >
                      {meta.icon}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="h-3 rounded bg-white/10 w-24" />
                      <div className="h-2 rounded bg-white/05 w-16" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[1,2,3,4].map(n => (
                      <div key={n} className="flex justify-between">
                        <div className="h-2 rounded bg-white/10 w-16" />
                        <div className="h-2 rounded bg-white/10 w-20" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-gray-600 text-center">Fetching TLE data…</div>
                </div>
              )
            }

            /* ── Error card ── */
            if (sat.status === 'error') {
              return (
                <div
                  key={sat.id}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}
                    >
                      {meta.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm" style={{ color: meta.color }}>{sat.name}</h4>
                      <p className="text-gray-600 text-xs">NORAD #{sat.id}</p>
                    </div>
                  </div>
                  <p className="text-red-400 text-xs text-center py-2">⚠️ Data unavailable</p>
                  <p className="text-gray-700 text-xs text-center">Could not fetch TLE from CelesTrak</p>
                </div>
              )
            }

            /* ── Live data card ── */
            const isISS = sat.id === '25544'
            const rows: { label: string; val: string }[] = [
              { label: 'Latitude',     val: fmtCoord(sat.lat, 'lat') },
              { label: 'Longitude',    val: fmtCoord(sat.lng, 'lng') },
              { label: 'Altitude',     val: `${sat.alt.toFixed(1)} km` },
              { label: 'Speed',        val: `${sat.vel.toFixed(2)} km/s` },
              { label: 'Orb. Period',  val: fmtPeriod(sat.period) },
              { label: 'Inclination',  val: `${sat.inclination.toFixed(1)}°` },
            ]

            return (
              <div
                key={sat.id}
                className="rounded-2xl p-5 transition-all"
                style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid rgba(255,255,255,0.07)` }}
              >
                {/* Card header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${sat.color}15`, border: `1px solid ${sat.color}30` }}
                  >
                    {sat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm truncate" style={{ color: sat.color }}>{sat.name}</h4>
                    <p className="text-gray-600 text-xs">NORAD #{sat.id}</p>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                    style={{ background: `${sat.color}20`, color: sat.color }}
                  >
                    {sat.category}
                  </span>
                </div>

                {/* Data rows */}
                <div className="space-y-1.5 text-sm">
                  {rows.map(row => (
                    <div key={row.label} className="flex justify-between items-baseline">
                      <span className="text-gray-600 text-xs">{row.label}</span>
                      <span className="text-white font-mono font-semibold text-xs">{row.val}</span>
                    </div>
                  ))}
                </div>

                {/* ISS extra detail */}
                {isISS && (
                  <div
                    className="mt-3 rounded-xl px-3 py-2 text-[10px]"
                    style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)' }}
                  >
                    <p className="text-indigo-300 font-semibold mb-0.5">ISS — Low Earth Orbit</p>
                    <p className="text-gray-500">Crew: 6 · Mass: 420 t · Length: 109 m</p>
                    <p className="text-gray-500">Inc. 51.6° · ~{Math.round(sat.period)} min/orbit</p>
                  </div>
                )}

                {/* Live pulse */}
                <div className="flex items-center gap-1.5 mt-3">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                    style={{ background: sat.color }}
                  />
                  <span className="text-gray-700 text-[10px]">Live SGP4 propagation</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="text-gray-700 text-xs mt-5 border-t border-white/[0.04] pt-4">
          TLE data from CelesTrak · Positions calculated using SGP4 orbital mechanics (satellite.js) · Refreshes every 5 s
        </p>
      </div>
    </div>
  )
}
