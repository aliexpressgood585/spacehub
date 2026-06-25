import { useState } from 'react'

interface Telescope {
  name: string
  year: number
  type: string
  aperture: string
  location: string
  agency: string
  wavelength: string
  notable: string[]
  status: 'active' | 'retired' | 'planned'
  image: string
  desc: string
}

const TELESCOPES: Telescope[] = [
  { name: 'Galileo\'s Telescope', year: 1609, type: 'Refracting', aperture: '37mm', location: 'Padua, Italy', agency: 'Galileo Galilei', wavelength: 'Visible', notable: ['First astronomical telescope', 'Discovered Jupiter\'s 4 Galilean moons', 'Saw craters on the Moon', 'Observed phases of Venus'], status: 'retired', image: '🔭', desc: 'The telescope that started it all. 20× magnification revealed a universe Copernicus could only theorize about.' },
  { name: 'Herschel\'s 40-foot', year: 1789, type: 'Reflecting', aperture: '1.26m', location: 'Slough, UK', agency: 'William Herschel', wavelength: 'Visible', notable: ['Largest telescope for 50 years', 'Discovered Uranus (with smaller scope)', 'Catalogued 2500 nebulae', 'First to map the Milky Way shape'], status: 'retired', image: '🌌', desc: 'Hand-built by Herschel. Took 40 men to move. Revealed the universe was far larger than anyone imagined.' },
  { name: 'Mount Wilson 100-inch', year: 1917, type: 'Reflecting', aperture: '2.54m', location: 'California, USA', agency: 'Carnegie', wavelength: 'Visible', notable: ['Edwin Hubble proved galaxies exist beyond Milky Way', 'Hubble measured universe expansion', 'First evidence Big Bang via redshift', 'Largest telescope until 1948'], status: 'retired', image: '🌠', desc: 'Used by Hubble to discover Cepheid variables in Andromeda, proving it was a separate galaxy.' },
  { name: 'Palomar 200-inch', year: 1949, type: 'Reflecting', aperture: '5.08m', location: 'California, USA', agency: 'Caltech', wavelength: 'Visible', notable: ['First quasar identified (3C273)', 'Discovered hundreds of galaxies', 'Maarten Schmidt measured quasar redshifts', 'Still in use 75 years later'], status: 'active', image: '⭐', desc: 'Built after WWII, the Hale Telescope was the largest in the world for 45 years. Still producing science.' },
  { name: 'Arecibo', year: 1963, type: 'Radio', aperture: '305m', location: 'Puerto Rico', agency: 'NSF/Cornell', wavelength: 'Radio', notable: ['First binary pulsar discovered (1974 Nobel Prize)', 'Pioneer SETI searches', 'Radar mapping of Venus surface', 'Collapsed 2020'], status: 'retired', image: '📡', desc: 'For 53 years the world\'s largest radio telescope. Scene of Contact and GoldenEye. Collapsed after cable failures.' },
  { name: 'Hubble Space Telescope', year: 1990, type: 'Space (Reflector)', aperture: '2.4m', location: 'LEO (547 km)', agency: 'NASA/ESA', wavelength: 'UV/Visible/IR', notable: ['Measured age of universe (13.8 Gyr)', 'Deep field images revealed 10,000+ galaxies', 'Proved dark energy (accelerating expansion)', 'Over 1.6 million observations'], status: 'active', image: '🔬', desc: 'Launched with blurry mirror, corrected by astronauts in 1993. Transformed astronomy for 35 years.' },
  { name: 'Keck I & II', year: 1993, type: 'Reflecting (Segmented)', aperture: '10m (×2)', location: 'Mauna Kea, Hawaii', agency: 'Caltech/UC/NASA', wavelength: 'Visible/IR', notable: ['First segmented primary mirrors', 'Exoplanet atmosphere characterization', 'Black hole at galactic center confirmation', 'Adaptive optics pioneer'], status: 'active', image: '🪐', desc: 'Twin 10m telescopes using 36 hexagonal mirror segments. Inspired all future ELT designs.' },
  { name: 'VLT (Very Large Telescope)', year: 1998, type: 'Reflecting (×4)', aperture: '8.2m (×4)', location: 'Atacama Desert, Chile', agency: 'ESO', wavelength: 'UV/Visible/IR', notable: ['First direct image of an exoplanet', 'Black hole shadow confirmation', 'Longest observed gamma-ray burst', 'Interferometry: 130m baseline'], status: 'active', image: '🌋', desc: 'Four 8.2m and four 1.8m auxiliary telescopes. Can combine light like a 16m mirror.' },
  { name: 'Chandra X-ray Observatory', year: 1999, type: 'Space (X-ray)', aperture: '1.2m', location: 'HEO (140,000 km)', agency: 'NASA', wavelength: 'X-ray', notable: ['Supernova remnant imaging', 'Dark matter distribution maps', 'Black hole jets and accretion', 'Neutron star surfaces'], status: 'active', image: '💥', desc: 'X-ray vision of the universe. Reveals the hot, violent processes invisible to optical telescopes.' },
  { name: 'James Webb Space Telescope', year: 2022, type: 'Space (Reflector)', aperture: '6.5m', location: 'L2 (1.5M km)', agency: 'NASA/ESA/CSA', wavelength: 'Near-IR/Mid-IR', notable: ['Deepest infrared image of the early universe', 'First exoplanet atmospheric CO₂ detection', 'Jupiter aurora & storms in detail', 'Galaxy formation at z>12'], status: 'active', image: '✨', desc: 'Launched Dec 2021. 18 gold-coated beryllium hexagons cooled to -233°C. Sees back to 200 Myr after the Big Bang.' },
  { name: 'SKA (Square Kilometre Array)', year: 2027, type: 'Radio (Interferometry)', aperture: '1 km² (effective)', location: 'South Africa / Australia', agency: 'SKAO', wavelength: 'Radio', notable: ['Most sensitive radio telescope ever', '1+ million antennas', 'Search for ET civilizations', 'Map hydrogen across cosmic time'], status: 'planned', image: '📡', desc: 'When complete, 50× more sensitive than any existing radio telescope. Could detect airport radar on a planet 50 ly away.' },
  { name: 'ELT (Extremely Large Telescope)', year: 2028, type: 'Reflecting (Segmented)', aperture: '39.3m', location: 'Cerro Armazones, Chile', agency: 'ESO', wavelength: 'Visible/IR', notable: ['Largest optical/IR telescope ever built', 'Direct imaging of Earth-like exoplanets', 'Real-time universe expansion measurement', '798 mirror segments'], status: 'planned', image: '🔭', desc: 'Its 39m mirror will collect 15× more light than VLT. Atmospheric correction mirrors beat turbulence.' },
]

const WAVELENGTH_COLORS: Record<string, string> = {
  'Visible': '#facc15',
  'UV/Visible/IR': '#a78bfa',
  'Near-IR/Mid-IR': '#f97316',
  'X-ray': '#22d3ee',
  'Radio': '#4ade80',
  'UV/Visible/NIR': '#818cf8',
}

export default function TelescopeHistory() {
  const [selected, setSelected] = useState<Telescope | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'space' | 'radio'>('all')
  const [view, setView] = useState<'timeline' | 'grid'>('timeline')

  const filtered = TELESCOPES.filter(t => {
    if (filter === 'active') return t.status === 'active' || t.status === 'planned'
    if (filter === 'space') return t.type.includes('Space')
    if (filter === 'radio') return t.wavelength === 'Radio'
    return true
  })

  const statusColor = (s: string) => s === 'active' ? '#10b981' : s === 'planned' ? '#f59e0b' : '#6b7280'

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🔭</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Telescope Hall of Fame</h2>
          <p className="text-yellow-300 text-sm">From Galileo's 37mm refractor to the 39m ELT — 400 years of cosmic vision</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'active', 'space', 'radio'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all capitalize ${filter === f ? 'bg-yellow-600/80 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {f === 'all' ? '🌐 All' : f === 'active' ? '✅ Active/Planned' : f === 'space' ? '🛸 Space-based' : '📡 Radio'}
          </button>
        ))}
        <button
          onClick={() => setView(v => v === 'timeline' ? 'grid' : 'timeline')}
          className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-white/10 text-gray-300 hover:bg-white/20"
        >
          {view === 'timeline' ? '🔲 Grid view' : '📅 Timeline'}
        </button>
      </div>

      {view === 'timeline' && (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-white/10" />
          <div className="space-y-3">
            {filtered.map(t => (
              <div
                key={t.name}
                onClick={() => setSelected(selected?.name === t.name ? null : t)}
                className="relative pl-14 cursor-pointer group"
              >
                {/* Timeline dot */}
                <div
                  className="absolute left-4 top-3 w-4 h-4 rounded-full border-2 border-gray-800 transition-all group-hover:scale-125"
                  style={{ backgroundColor: statusColor(t.status) }}
                />
                <div className={`rounded-xl p-4 border transition-all ${selected?.name === t.name ? 'border-yellow-500/50 bg-yellow-900/10' : 'border-white/10 bg-white/5 hover:border-yellow-500/30'}`}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{t.image}</span>
                      <div>
                        <div className="font-bold text-white">{t.name}</div>
                        <div className="text-xs text-gray-400">{t.year} · {t.type} · {t.aperture}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: WAVELENGTH_COLORS[t.wavelength] + '20', color: WAVELENGTH_COLORS[t.wavelength] ?? '#ffffff' }}
                      >
                        {t.wavelength}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border"
                        style={{ color: statusColor(t.status), borderColor: statusColor(t.status) + '40' }}
                      >
                        {t.status}
                      </span>
                    </div>
                  </div>

                  {selected?.name === t.name && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-sm text-gray-300 mb-3 leading-relaxed">{t.desc}</p>
                      <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4 text-xs">
                        {[
                          { label: 'Location', value: t.location },
                          { label: 'Agency', value: t.agency },
                          { label: 'Aperture', value: t.aperture },
                          { label: 'Wavelength', value: t.wavelength },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white/5 rounded p-2">
                            <div className="text-gray-500">{label}</div>
                            <div className="text-white">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-yellow-400 font-semibold mb-1">Key discoveries</div>
                      <ul className="space-y-0.5">
                        {t.notable.map(n => (
                          <li key={n} className="text-xs text-gray-300 flex gap-1"><span className="text-yellow-500">★</span>{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'grid' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map(t => (
            <div
              key={t.name}
              onClick={() => setSelected(selected?.name === t.name ? null : t)}
              className={`rounded-xl p-4 border cursor-pointer transition-all ${selected?.name === t.name ? 'border-yellow-500/50 bg-yellow-900/10' : 'border-white/10 bg-white/5 hover:border-yellow-500/30'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{t.image}</span>
                <div>
                  <div className="text-sm font-bold text-white">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.year}</div>
                </div>
                <div className="ml-auto">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: statusColor(t.status) }}>●</span>
                </div>
              </div>
              <div className="text-xs text-gray-400 line-clamp-2">{t.desc}</div>

              {selected?.name === t.name && (
                <div className="mt-3 pt-2 border-t border-white/10">
                  <ul className="space-y-0.5">
                    {t.notable.slice(0, 3).map(n => (
                      <li key={n} className="text-xs text-gray-300">• {n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Aperture progression */}
      <div className="mt-6 bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="text-xs text-gray-400 font-semibold mb-3">Aperture Growth (mm) — 400 years of progress</div>
        <div className="flex items-end gap-1 h-16">
          {TELESCOPES.filter(t => t.type !== 'Radio').map(t => {
            const apertureMatch = t.aperture.match(/[\d.]+/)
            const numAperture = apertureMatch ? parseFloat(apertureMatch[0]) : 0
            const apertureMM = t.aperture.includes('m') && !t.aperture.includes('mm') ? numAperture * 1000 : numAperture
            const maxMM = 39300
            const h = Math.max(4, (apertureMM / maxMM) * 100)
            const isActive = t.status === 'active' || t.status === 'planned'
            return (
              <div key={t.name} className="flex-1 flex flex-col items-center gap-0.5" title={`${t.name}: ${t.aperture}`}>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: h + '%',
                    backgroundColor: isActive ? '#f59e0b' : '#4b5563',
                  }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1609</span><span>1800s</span><span>1900s</span><span>2020s+</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">From Galileo's 37mm to ELT's 39,300mm — 1000× more light-gathering power</div>
      </div>
    </div>
  )
}
