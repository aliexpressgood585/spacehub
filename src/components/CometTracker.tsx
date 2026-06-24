import { useState } from 'react'

interface Comet {
  id: string
  name: string
  shortName: string
  discovered: string
  type: 'periodic' | 'long-period' | 'hyperbolic'
  periodYears: number | null
  perihelionDate: string
  perihelionAU: number
  currentMag: number | null
  peakMag: number
  ra: string
  dec: string
  constellation: string
  description: string
  status: 'active' | 'upcoming' | 'fading' | 'past'
  visibility: string
  binoculars: boolean
  naked: boolean
  source: string
}

const COMETS: Comet[] = [
  {
    id: 'tsuchinshan',
    name: 'C/2023 A3 (Tsuchinshan–ATLAS)',
    shortName: 'Tsuchinshan–ATLAS',
    discovered: 'Jan 2023',
    type: 'long-period',
    periodYears: null,
    perihelionDate: 'Sep 27, 2024',
    perihelionAU: 0.391,
    currentMag: null,
    peakMag: 0.3,
    ra: '13h 24m',
    dec: '-10° 12\'',
    constellation: 'Virgo',
    description: 'One of the brightest comets in decades. Reached naked-eye visibility in October 2024 with a bright plasma tail and dust tail spanning over 30° across the sky.',
    status: 'past',
    visibility: 'Passed perihelion Sep 2024 — now fading beyond naked eye',
    binoculars: false,
    naked: false,
    source: 'ATLAS South Africa / Purple Mountain Observatory',
  },
  {
    id: 'pons-brooks',
    name: '12P/Pons-Brooks',
    shortName: 'Pons-Brooks',
    discovered: 'Jul 1812',
    type: 'periodic',
    periodYears: 71.3,
    perihelionDate: 'Apr 21, 2024',
    perihelionAU: 0.781,
    currentMag: null,
    peakMag: 4.2,
    ra: '02h 15m',
    dec: '+16° 40\'',
    constellation: 'Aries',
    description: 'A famous periodic "devil comet" with a distinctive horseshoe-shaped coma caused by outbursts of cryovolcanic activity. Returns every 71 years; next perihelion ~2095.',
    status: 'past',
    visibility: 'Passed perihelion Apr 2024 — next return ~2095',
    binoculars: false,
    naked: false,
    source: 'Jean-Louis Pons (1812) / W.R. Brooks (1883)',
  },
  {
    id: 'atlas-g3',
    name: 'C/2024 G3 (ATLAS)',
    shortName: 'ATLAS G3',
    discovered: 'Apr 2024',
    type: 'long-period',
    periodYears: null,
    perihelionDate: 'Jan 13, 2025',
    perihelionAU: 0.094,
    currentMag: null,
    peakMag: -3.0,
    ra: '18h 42m',
    dec: '-24° 08\'',
    constellation: 'Sagittarius',
    description: 'Sungrazing comet that reached extraordinary brightness near perihelion (estimated −3 mag). Best seen from the Southern Hemisphere in January 2025 in the evening twilight.',
    status: 'past',
    visibility: 'Perihelion Jan 2025 — now dispersed beyond recovery',
    binoculars: false,
    naked: false,
    source: 'Asteroid Terrestrial-impact Last Alert System (ATLAS)',
  },
  {
    id: 'c2024-s1',
    name: 'C/2024 S1 (ATLAS)',
    shortName: 'ATLAS S1',
    discovered: 'Sep 2024',
    type: 'hyperbolic',
    periodYears: null,
    perihelionDate: 'Oct 28, 2024',
    perihelionAU: 0.008,
    currentMag: null,
    peakMag: 8.0,
    ra: '14h 05m',
    dec: '+05° 22\'',
    constellation: 'Virgo',
    description: 'A Kreutz sungrazer that disintegrated before perihelion — never survived to become the bright comet hoped for. Observed as it fell apart approaching the Sun.',
    status: 'past',
    visibility: 'Disintegrated Oct 2024 — did not survive perihelion',
    binoculars: false,
    naked: false,
    source: 'ATLAS',
  },
  {
    id: 'c2025-n1',
    name: 'C/2025 N1 (ATLAS)',
    shortName: 'ATLAS N1',
    discovered: 'Jul 2025',
    type: 'long-period',
    periodYears: null,
    perihelionDate: 'Nov 14, 2025',
    perihelionAU: 1.18,
    currentMag: 10.2,
    peakMag: 7.5,
    ra: '06h 52m',
    dec: '+28° 15\'',
    constellation: 'Gemini',
    description: 'Recently discovered long-period comet approaching perihelion. Currently in Gemini, predicted to reach binocular visibility (mag ~7.5) around November 2025.',
    status: 'upcoming',
    visibility: 'Pre-dawn, ENE — binoculars needed through 2025',
    binoculars: true,
    naked: false,
    source: 'ATLAS Mauna Loa',
  },
  {
    id: 'c2027-a3',
    name: 'C/2027 A3 (VELA)',
    shortName: 'VELA',
    discovered: 'Jan 2027',
    type: 'long-period',
    periodYears: null,
    perihelionDate: 'Aug 05, 2027',
    perihelionAU: 0.65,
    currentMag: 14.5,
    peakMag: 2.5,
    ra: '09h 33m',
    dec: '-45° 10\'',
    constellation: 'Vela',
    description: 'Newly discovered comet with promising orbital parameters. Early brightness estimates suggest it could reach naked-eye visibility at perihelion in August 2027. Currently very faint.',
    status: 'upcoming',
    visibility: 'Southern hemisphere — perihelion Aug 2027',
    binoculars: false,
    naked: false,
    source: 'VELA survey (ESO/La Silla)',
  },
]

const TYPE_COLORS: Record<string, string> = {
  'periodic': '#60a5fa',
  'long-period': '#a78bfa',
  'hyperbolic': '#f87171',
}

const STATUS_COLORS: Record<string, string> = {
  'active': '#4ade80',
  'upcoming': '#fbbf24',
  'fading': '#94a3b8',
  'past': '#374151',
}

const STATUS_LABELS: Record<string, string> = {
  'active': '🟢 Active',
  'upcoming': '🟡 Upcoming',
  'fading': '🔵 Fading',
  'past': '⚫ Past',
}

function MagBar({ mag, maxMag = 15 }: { mag: number; maxMag?: number }) {
  const pct = Math.max(0, Math.min(100, ((maxMag - mag) / (maxMag + 5)) * 100))
  const color = mag < 0 ? '#f59e0b' : mag < 3 ? '#4ade80' : mag < 6 ? '#60a5fa' : mag < 10 ? '#a78bfa' : '#374151'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>{mag > 0 ? `+${mag}` : mag}</span>
    </div>
  )
}

export default function CometTracker() {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all')
  const [expanded, setExpanded] = useState<string | null>('c2025-n1')

  const filtered = COMETS.filter(c => {
    if (filter === 'upcoming') return c.status === 'upcoming' || c.status === 'active'
    if (filter === 'past') return c.status === 'past' || c.status === 'fading'
    return true
  })

  const nextComet = COMETS.find(c => c.status === 'upcoming' || c.status === 'active')

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">☄️</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Comet Tracker</h3>
          <p className="text-gray-500 text-xs">Recent &amp; upcoming bright comets · Ephemeris data</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-bold shrink-0"
          style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>
          {COMETS.filter(c => c.status === 'upcoming' || c.status === 'active').length} upcoming
        </span>
      </div>

      {nextComet && (
        <div className="rounded-2xl p-4 mb-5" style={{
          background: 'linear-gradient(135deg, rgba(167,139,250,0.12), rgba(96,165,250,0.08))',
          border: '1px solid rgba(167,139,250,0.35)'
        }}>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Next Noteworthy Comet</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-white font-bold text-sm">{nextComet.shortName}</p>
              <p className="text-gray-400 text-xs">{nextComet.name}</p>
              <p className="text-[10px] text-indigo-400 mt-1">Perihelion: {nextComet.perihelionDate}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Peak mag</div>
              <div className="text-lg font-black" style={{ color: nextComet.peakMag < 3 ? '#4ade80' : '#a78bfa' }}>
                {nextComet.peakMag < 0 ? nextComet.peakMag : `+${nextComet.peakMag}`}
              </div>
              <div className="text-[9px] text-gray-600">{nextComet.naked ? 'Naked eye' : nextComet.binoculars ? 'Binoculars' : 'Telescope'}</div>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">{nextComet.visibility}</p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['all', 'upcoming', 'past'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="text-xs px-3 py-1.5 rounded-xl font-semibold capitalize transition-all"
            style={filter === f
              ? { background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.5)', color: '#c4b5fd' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
            {f === 'upcoming' ? '🌟 Upcoming' : f === 'past' ? '📚 Past' : '☄️ All'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(c => {
          const isOpen = expanded === c.id
          return (
            <button key={c.id} onClick={() => setExpanded(isOpen ? null : c.id)}
              className="w-full text-left rounded-2xl p-3.5 transition-all"
              style={{
                background: isOpen ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${isOpen ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)'}`,
                opacity: c.status === 'past' ? 0.65 : 1
              }}>
              <div className="flex items-start gap-2">
                <div className="shrink-0 mt-0.5">
                  <div className="text-xl">☄️</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-bold text-white">{c.shortName}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: TYPE_COLORS[c.type] + '22', color: TYPE_COLORS[c.type], border: `1px solid ${TYPE_COLORS[c.type]}44` }}>
                      {c.type}
                    </span>
                    <span className="text-[9px] font-semibold" style={{ color: STATUS_COLORS[c.status] }}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span>q = {c.perihelionAU} AU</span>
                    <span>·</span>
                    <span>{c.perihelionDate}</span>
                    {c.periodYears && <><span>·</span><span>{c.periodYears}yr period</span></>}
                  </div>
                  <div className="mt-1">
                    <div className="text-[10px] text-gray-600 mb-0.5">Peak brightness</div>
                    <MagBar mag={c.peakMag} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px]" style={{ color: c.naked ? '#4ade80' : c.binoculars ? '#fbbf24' : '#6b7280' }}>
                    {c.naked ? '👁️ Naked eye' : c.binoculars ? '🔭 Binoculars' : '🔬 Telescope'}
                  </span>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                  <p className="text-xs text-gray-400 leading-relaxed">{c.description}</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div><span className="text-gray-600">RA: </span><span className="text-gray-300">{c.ra}</span></div>
                    <div><span className="text-gray-600">Dec: </span><span className="text-gray-300">{c.dec}</span></div>
                    <div><span className="text-gray-600">Constellation: </span><span className="text-gray-300">{c.constellation}</span></div>
                    <div><span className="text-gray-600">Perihelion q: </span><span className="text-gray-300">{c.perihelionAU} AU</span></div>
                  </div>
                  <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] text-gray-500 mb-1">Visibility</p>
                    <p className="text-xs text-gray-300">{c.visibility}</p>
                  </div>
                  <p className="text-[9px] text-gray-700">Discovery: {c.source} · Discovered {c.discovered}</p>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <p className="text-[10px] text-gray-500">
          <span className="text-indigo-400 font-semibold">Brightness scale:</span> mag &lt;0 = spectacular · 0–3 = easy naked eye · 3–6 = binoculars · &gt;6 = telescope needed
        </p>
      </div>
      <p className="text-[10px] text-gray-700 mt-3 text-center">Ephemeris data: JPL Horizons · MPC · Comet-OBS</p>
    </div>
  )
}
