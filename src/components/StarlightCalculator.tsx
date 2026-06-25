import { useState } from 'react'

interface Star {
  name: string
  constellation: string
  distanceLy: number
  type: string
  magnitude: number
  color: string
  colorHex: string
  earthEvent: string
  era: string
}

const STARS: Star[] = [
  { name: 'Proxima Centauri', constellation: 'Centaurus', distanceLy: 4.24, type: 'Red dwarf (M5.5Ve)', magnitude: 11.13, color: 'Deep red', colorHex: '#ef4444', earthEvent: 'That light left when ancient Rome was in its twilight years (~500 AD)', era: 'Late Roman Empire / Early Middle Ages' },
  { name: 'Alpha Centauri A', constellation: 'Centaurus', distanceLy: 4.37, type: 'G2V (Sun-like)', magnitude: -0.01, color: 'Yellow-white', colorHex: '#fbbf24', earthEvent: 'That light left during the fall of the Western Roman Empire (~500 AD)', era: 'Migration Period' },
  { name: 'Sirius A', constellation: 'Canis Major', distanceLy: 8.6, type: 'A1V (Blue-white)', magnitude: -1.46, color: 'Blue-white', colorHex: '#93c5fd', earthEvent: 'That light left when the Viking Age had just ended, around 1015–1020 AD', era: 'Medieval — Norman Conquests era' },
  { name: 'Epsilon Eridani', constellation: 'Eridanus', distanceLy: 10.5, type: 'K2V (Orange)', magnitude: 3.73, color: 'Orange', colorHex: '#f97316', earthEvent: 'That light left around the year 1000 AD — the year Leif Erikson reached North America', era: 'Medieval — Viking Age peak' },
  { name: 'Tau Ceti', constellation: 'Cetus', distanceLy: 11.9, type: 'G8V (Sun-like)', magnitude: 3.50, color: 'Yellow', colorHex: '#fde68a', earthEvent: 'That light left around 1010 AD — a generation before the Battle of Hastings (1066)', era: 'Medieval' },
  { name: 'Procyon A', constellation: 'Canis Minor', distanceLy: 11.4, type: 'F5IV-V', magnitude: 0.34, color: 'Yellow-white', colorHex: '#fef08a', earthEvent: 'That light left around 1013 AD — during the reign of King Cnut of England', era: 'Medieval' },
  { name: 'Vega', constellation: 'Lyra', distanceLy: 25, type: 'A0Va (Blue-white)', magnitude: 0.03, color: 'Blue-white', colorHex: '#bfdbfe', earthEvent: 'That light left around the year 1000 AD — Leif Erikson\'s voyage, the Aztec founding of Tenochtitlan was still 400 years away', era: 'High Medieval Period' },
  { name: 'Arcturus', constellation: 'Boötes', distanceLy: 37, type: 'K1.5IIIFe (Giant)', magnitude: -0.05, color: 'Orange giant', colorHex: '#fb923c', earthEvent: 'That light left around 987 AD — the Capetian dynasty was just founded in France', era: 'Early Medieval' },
  { name: 'Capella A', constellation: 'Auriga', distanceLy: 43, type: 'G8III (Yellow giant)', magnitude: 0.08, color: 'Yellow', colorHex: '#fde047', earthEvent: 'That light left around 980 AD — during the reign of Otto II of the Holy Roman Empire', era: 'Early Medieval' },
  { name: 'Aldebaran', constellation: 'Taurus', distanceLy: 65, type: 'K5III (Red giant)', magnitude: 0.85, color: 'Red-orange giant', colorHex: '#f87171', earthEvent: 'That light left around 958 AD — during the late Tang Dynasty collapse in China', era: 'Early Medieval' },
  { name: 'Regulus', constellation: 'Leo', distanceLy: 79, type: 'B7V (Blue)', magnitude: 1.35, color: 'Blue-white', colorHex: '#a5b4fc', earthEvent: 'That light left around 945 AD — during the Byzantine Golden Age under Constantine VII', era: 'Early Medieval — Byzantine peak' },
  { name: 'Spica', constellation: 'Virgo', distanceLy: 250, type: 'B1III+B2V (Blue)', magnitude: 0.97, color: 'Blue giant', colorHex: '#818cf8', earthEvent: 'That light left around 1774 AD — just two years before the American Declaration of Independence', era: 'Age of Enlightenment / American Revolution' },
  { name: 'Betelgeuse', constellation: 'Orion', distanceLy: 700, type: 'M2Iab (Red supergiant)', magnitude: 0.42, color: 'Deep red supergiant', colorHex: '#dc2626', earthEvent: 'That light left around 1324 AD — the year Marco Polo died and 140 years before Columbus reached America', era: 'Late Medieval — Black Death era' },
  { name: 'Rigel', constellation: 'Orion', distanceLy: 860, type: 'B8Ia (Blue supergiant)', magnitude: 0.13, color: 'Blue-white supergiant', colorHex: '#60a5fa', earthEvent: 'That light left around 1164 AD — during the Crusades era and rise of Genghis Khan', era: 'High Medieval — Crusades era' },
  { name: 'Deneb', constellation: 'Cygnus', distanceLy: 2600, type: 'A2Ia (White supergiant)', magnitude: 1.25, color: 'White supergiant', colorHex: '#e2e8f0', earthEvent: 'That light left around 574 BC — the era of Confucius and Gautama Buddha', era: 'Classical Antiquity — Axial Age' },
  { name: 'Eta Carinae', constellation: 'Carina', distanceLy: 7500, type: 'LBV (Luminous Blue Variable)', magnitude: 4.30, color: 'Variable blue', colorHex: '#7dd3fc', earthEvent: 'That light left around 5477 BC — the era of early Sumerian city-states and Egyptian pre-dynastic period', era: 'Neolithic / Chalcolithic Revolution' },
  { name: 'Andromeda Galaxy (core)', constellation: 'Andromeda', distanceLy: 2537000, type: 'Spiral Galaxy (sb)', magnitude: 3.44, color: 'Warm white core', colorHex: '#fef3c7', earthEvent: 'That light left 2.537 million years ago — Homo habilis was just evolving; stone tools were brand new technology', era: 'Early Pleistocene — earliest humans' },
]

function getEarthYear(distanceLy: number): number {
  return new Date().getFullYear() - Math.round(distanceLy)
}

function getEraColor(era: string): string {
  if (era.includes('Neolithic') || era.includes('Pleistocene')) return '#a855f7'
  if (era.includes('Classical') || era.includes('BC')) return '#f59e0b'
  if (era.includes('Medieval')) return '#22c55e'
  if (era.includes('Enlightenment') || era.includes('Revolution')) return '#3b82f6'
  return '#94a3b8'
}

export default function StarlightCalculator() {
  const [selected, setSelected] = useState<Star>(STARS[0])
  const [search, setSearch] = useState('')

  const filtered = STARS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.constellation.toLowerCase().includes(search.toLowerCase())
  )

  const yearLeft = getEarthYear(selected.distanceLy)
  const eraColor = getEraColor(selected.era)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Starlight Time Machine</h2>
      <p className="text-gray-400 text-sm mb-5">Every star you see is a window into the past — the light you're looking at tonight left its source years, centuries, or millions of years ago</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Star list */}
        <div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stars…"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-indigo-500"
          />
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
            {filtered.map(s => (
              <button key={s.name} onClick={() => setSelected(s)}
                className="w-full text-left px-3 py-2.5 rounded-lg transition-all"
                style={{
                  background: selected.name === s.name ? s.colorHex + '18' : 'rgba(30,41,59,0.5)',
                  border: `1px solid ${selected.name === s.name ? s.colorHex + '55' : 'transparent'}`,
                }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.colorHex, boxShadow: `0 0 6px ${s.colorHex}` }} />
                  <div>
                    <div className="text-white text-sm font-medium">{s.name}</div>
                    <div className="text-gray-500 text-xs">{s.constellation} · {s.distanceLy >= 1000 ? (s.distanceLy / 1000).toLocaleString() + 'K ly' : s.distanceLy.toLocaleString() + ' ly'}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Star header */}
          <div className="rounded-xl p-5" style={{ background: selected.colorHex + '10', border: `1px solid ${selected.colorHex}30` }}>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-3xl"
                style={{ background: selected.colorHex + '20', border: `2px solid ${selected.colorHex}60`, boxShadow: `0 0 20px ${selected.colorHex}40` }}>
                ⭐
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{selected.name}</h3>
                <div className="text-sm mt-0.5" style={{ color: selected.colorHex }}>{selected.constellation} · {selected.type}</div>
                <div className="text-gray-400 text-sm mt-1">{selected.color} · Apparent magnitude {selected.magnitude}</div>
              </div>
            </div>
          </div>

          {/* Time travel card */}
          <div className="bg-gray-800/60 rounded-xl p-5 text-center">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">When the light you see tonight left this star</div>
            <div className="text-5xl font-bold text-white mb-2">
              {yearLeft < 0 ? Math.abs(yearLeft).toLocaleString() + ' BC' : yearLeft.toLocaleString() + ' AD'}
            </div>
            <div className="text-xl font-semibold mb-3" style={{ color: selected.colorHex }}>
              {selected.distanceLy >= 1000000
                ? (selected.distanceLy / 1000000).toFixed(3) + ' million light-years ago'
                : selected.distanceLy >= 1000
                  ? (selected.distanceLy / 1000).toFixed(1) + ',000 light-years ago'
                  : selected.distanceLy.toLocaleString() + ' light-years ago'}
            </div>
            <div className="inline-block px-4 py-1.5 rounded-full text-sm font-medium" style={{ background: eraColor + '20', color: eraColor, border: `1px solid ${eraColor}40` }}>
              {selected.era}
            </div>
          </div>

          {/* Earth context */}
          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">On Earth when this light left {selected.name}</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.earthEvent}</p>
          </div>

          {/* Technical stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Distance', value: selected.distanceLy >= 1000000 ? (selected.distanceLy / 1000000).toFixed(2) + 'M ly' : selected.distanceLy.toLocaleString() + ' ly', color: selected.colorHex },
              { label: 'Travel time', value: selected.distanceLy.toLocaleString() + ' years', color: '#94a3b8' },
              { label: 'Apparent mag', value: selected.magnitude.toFixed(2), color: '#fbbf24' },
              { label: 'Light speed', value: '299,792 km/s', color: '#818cf8' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900/60 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Mind-bending comparison */}
          <div className="bg-indigo-900/20 rounded-xl p-4 border border-indigo-800/30">
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">Scale to comprehend</div>
            <p className="text-gray-300 text-sm">
              If you could pause light in mid-flight and look at it right now, the photon from <strong className="text-white">{selected.name}</strong> that will hit your eye tonight has been traveling since
              {' '}<strong style={{ color: eraColor }}>{yearLeft < 0 ? Math.abs(yearLeft).toLocaleString() + ' BC' : yearLeft.toLocaleString() + ' AD'}</strong>.
              {' '}During that entire time — across every war, civilization, ice age, and empire — that photon was racing toward this exact moment when you look up.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
