import { useState, useEffect, useRef } from 'react'

interface Telescope {
  name: string
  location: string
  diameter: string
  freq: string
  built: number
  notable: string
  lat: number
  lon: number
  active: boolean
}

interface Discovery {
  year: number
  name: string
  telescope: string
  description: string
  category: 'pulsar' | 'quasar' | 'cmb' | 'molecule' | 'signal' | 'galaxy'
}

interface FreqBand {
  name: string
  range: string
  wavelength: string
  uses: string
  color: string
  pct: number
}

const TELESCOPES: Telescope[] = [
  { name: 'FAST', location: 'China', diameter: '500 m', freq: '70 MHz – 3 GHz', built: 2016, notable: 'Largest single-dish radio telescope', lat: 25.65, lon: 106.86, active: true },
  { name: 'Arecibo (decommissioned)', location: 'Puerto Rico', diameter: '305 m', freq: '300 MHz – 10 GHz', built: 1963, notable: 'Sent Arecibo Message; discovered first pulsar planets', lat: 18.34, lon: -66.75, active: false },
  { name: 'VLA', location: 'New Mexico, USA', diameter: '27 × 25 m', freq: '74 MHz – 50 GHz', built: 1980, notable: 'Array of 27 antennas spanning 36 km', lat: 34.08, lon: -107.62, active: true },
  { name: 'MeerKAT', location: 'South Africa', diameter: '64 × 13.5 m', freq: '580 MHz – 14.5 GHz', built: 2018, notable: 'Precursor to SKA; surveying neutral hydrogen', lat: -30.71, lon: 21.44, active: true },
  { name: 'Parkes (Murriyang)', location: 'Australia', diameter: '64 m', freq: '700 MHz – 26 GHz', built: 1961, notable: 'Received Apollo 11 moonwalk signals; FRB discoveries', lat: -32.99, lon: 148.26, active: true },
  { name: 'Effelsberg', location: 'Germany', diameter: '100 m', freq: '300 MHz – 96 GHz', built: 1972, notable: 'Europe\'s largest fully steerable telescope', lat: 50.52, lon: 6.88, active: true },
  { name: 'EHT Array', location: 'Global', diameter: 'Earth-sized', freq: '230 GHz', built: 2017, notable: 'Imaged black holes in M87 and Milky Way center', lat: 0, lon: 0, active: true },
  { name: 'SKA', location: 'Africa/Australia', diameter: 'Thousands of dishes', freq: '50 MHz – 15 GHz', built: 2025, notable: 'Square Kilometre Array — world\'s largest observatory', lat: -30, lon: 21, active: true },
]

const DISCOVERIES: Discovery[] = [
  { year: 1932, name: 'Radio emissions from Milky Way', telescope: 'Jansky\'s antenna', description: 'Karl Jansky detected radio waves from the galactic center, founding radio astronomy.', category: 'galaxy' },
  { year: 1965, name: 'Cosmic Microwave Background', telescope: 'Holmdel Horn Antenna', description: 'Penzias & Wilson discovered the CMB — relic radiation from the Big Bang.', category: 'cmb' },
  { year: 1967, name: 'First Pulsar (PSR B1919+21)', telescope: 'Mullard Radio Observatory', description: 'Jocelyn Bell Burnell detected precise radio pulses from a rotating neutron star.', category: 'pulsar' },
  { year: 1963, name: '3C 273 — First Quasar', telescope: 'Parkes', description: 'Maarten Schmidt identified the redshift of 3C 273, revealing quasi-stellar objects.', category: 'quasar' },
  { year: 1974, name: 'Binary Pulsar (Hulse-Taylor)', telescope: 'Arecibo', description: 'First indirect evidence of gravitational waves; earned 1993 Nobel Prize.', category: 'pulsar' },
  { year: 1992, name: 'First Exoplanet Detection', telescope: 'Arecibo', description: 'Wolszczan & Frail found planets orbiting pulsar PSR 1257+12 via radio timing.', category: 'pulsar' },
  { year: 2019, name: 'First Black Hole Image (M87*)', telescope: 'EHT', description: 'Event Horizon Telescope resolved the shadow of a 6.5 billion solar mass black hole.', category: 'galaxy' },
  { year: 2022, name: 'Sgr A* Black Hole Image', telescope: 'EHT', description: 'First image of the Milky Way\'s central black hole, 4 million solar masses.', category: 'galaxy' },
  { year: 2007, name: 'Fast Radio Burst (FRB 010724)', telescope: 'Parkes', description: 'Duncan Lorimer found a millisecond burst of unknown extragalactic origin.', category: 'signal' },
  { year: 1963, name: 'Interstellar Hydroxyl (OH)', telescope: 'Lincoln Laboratory', description: 'First interstellar molecule detected — opening astrochemistry.', category: 'molecule' },
  { year: 1974, name: 'Arecibo Message', telescope: 'Arecibo', description: 'Encoded 1679-bit message sent toward Messier 13 globular cluster (25,000 ly away).', category: 'signal' },
  { year: 2020, name: 'Repeating FRB in Milky Way', telescope: 'CHIME/Parkes', description: 'SGR 1935+2154 — first FRB linked to a magnetar inside our own galaxy.', category: 'signal' },
]

const FREQ_BANDS: FreqBand[] = [
  { name: 'P-band', range: '230–470 MHz', wavelength: '65–130 cm', uses: 'Galactic structure, HI surveys', color: '#8b5cf6', pct: 8 },
  { name: 'L-band', range: '1–2 GHz', wavelength: '15–30 cm', uses: 'HI 21cm line, pulsars, SETI', color: '#3b82f6', pct: 14 },
  { name: 'S-band', range: '2–4 GHz', wavelength: '7.5–15 cm', uses: 'Spacecraft tracking, CMB', color: '#06b6d4', pct: 14 },
  { name: 'C-band', range: '4–8 GHz', wavelength: '3.75–7.5 cm', uses: 'Quasars, VLBI, satellite comm', color: '#10b981', pct: 16 },
  { name: 'X-band', range: '8–12 GHz', wavelength: '2.5–3.75 cm', uses: 'Deep space networks, radar', color: '#84cc16', pct: 16 },
  { name: 'K-band', range: '18–27 GHz', wavelength: '1.1–1.7 cm', uses: 'Water vapor, galactic mapping', color: '#f59e0b', pct: 18 },
  { name: 'W-band', range: '75–110 GHz', wavelength: '2.7–4 mm', uses: 'Black hole imaging (EHT)', color: '#ef4444', pct: 14 },
]

const CAT_COLORS: Record<string, string> = {
  pulsar: 'text-yellow-400',
  quasar: 'text-purple-400',
  cmb: 'text-cyan-400',
  molecule: 'text-green-400',
  signal: 'text-blue-400',
  galaxy: 'text-pink-400',
}
const CAT_LABELS: Record<string, string> = {
  pulsar: 'Pulsar', quasar: 'Quasar', cmb: 'CMB', molecule: 'Molecule', signal: 'Signal', galaxy: 'Galaxy/BH',
}

function SpectrumBands() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    let x = 0
    FREQ_BANDS.forEach(band => {
      const w = (band.pct / 100) * W
      ctx.fillStyle = band.color + 'cc'
      ctx.fillRect(x, 10, w - 2, H - 20)
      ctx.fillStyle = '#fff'
      ctx.font = '10px monospace'
      ctx.fillText(band.name, x + 4, H / 2 + 4)
      x += w
    })
    // Waterfall effect rows
    for (let row = 0; row < 6; row++) {
      let xw = 0
      FREQ_BANDS.forEach(band => {
        const w = (band.pct / 100) * W
        const noise = Math.random() * 0.4 + 0.1
        ctx.fillStyle = band.color + Math.floor(noise * 200).toString(16).padStart(2, '0')
        ctx.fillRect(xw, H + row * 12 + 4, w - 2, 10)
        xw += w
      })
    }
  }, [])
  return <canvas ref={canvasRef} width={600} height={60} className="w-full rounded" />
}

type TabType = 'telescopes' | 'discoveries' | 'spectrum'

export default function RadioAstronomy() {
  const [activeTab, setActiveTab] = useState<TabType>('telescopes')
  const [selected, setSelected] = useState<Telescope>(TELESCOPES[0])
  const [catFilter, setCatFilter] = useState<string>('all')

  const filteredDiscoveries = catFilter === 'all'
    ? DISCOVERIES
    : DISCOVERIES.filter(d => d.category === catFilter)

  const categories = ['all', 'pulsar', 'quasar', 'cmb', 'molecule', 'signal', 'galaxy']

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">📡</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Radio Astronomy</h2>
          <p className="text-gray-400 text-sm">Listening to the universe across the radio spectrum</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['telescopes', 'discoveries', 'spectrum'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === t ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'telescopes' ? 'Observatories' : t === 'discoveries' ? 'Key Discoveries' : 'Radio Spectrum'}
          </button>
        ))}
      </div>

      {activeTab === 'telescopes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* List */}
          <div className="space-y-2">
            {TELESCOPES.map(t => (
              <button
                key={t.name}
                onClick={() => setSelected(t)}
                className={`w-full text-left p-3 rounded-lg transition-all border ${
                  selected.name === t.name
                    ? 'bg-blue-600/30 border-blue-500'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm">{t.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {t.active ? 'Active' : 'Retired'}
                  </span>
                </div>
                <div className="text-gray-400 text-xs mt-0.5">{t.location}</div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <p className="text-gray-400 text-sm">{selected.location} · Built {selected.built}</p>
              </div>
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${selected.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {selected.active ? '✓ Operational' : '✗ Retired'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: 'Aperture', value: selected.diameter },
                { label: 'Frequency Range', value: selected.freq },
                { label: 'Year Built', value: selected.built.toString() },
                { label: 'Status', value: selected.active ? 'Active' : 'Decommissioned' },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white font-semibold text-sm">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="text-blue-400 text-xs font-semibold mb-1">Notable Achievement</div>
              <div className="text-gray-200 text-sm">{selected.notable}</div>
            </div>

            {/* Fake aperture SVG */}
            <div className="mt-4 flex justify-center">
              <svg viewBox="0 0 160 80" className="w-64 h-32">
                <ellipse cx="80" cy="60" rx="70" ry="12" fill="none" stroke="#3b82f6" strokeWidth="2" />
                <ellipse cx="80" cy="55" rx="50" ry="8" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.5" />
                <ellipse cx="80" cy="50" rx="30" ry="5" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.3" />
                <line x1="80" y1="60" x2="80" y2="20" stroke="#60a5fa" strokeWidth="2" />
                <circle cx="80" cy="18" r="4" fill="#3b82f6" />
                {/* Signal waves */}
                {[0,1,2].map(i => (
                  <ellipse key={i} cx="80" cy="18" rx={8 + i*10} ry={4 + i*5} fill="none" stroke="#60a5fa" strokeWidth="1" opacity={0.5 - i*0.15} strokeDasharray="3,3" />
                ))}
              </svg>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'discoveries' && (
        <div>
          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mb-5">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  catFilter === cat ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {cat === 'all' ? 'All' : CAT_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="relative border-l-2 border-blue-500/30 ml-4 space-y-0">
            {filteredDiscoveries.sort((a, b) => a.year - b.year).map((d, i) => (
              <div key={i} className="relative pl-6 pb-5">
                <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-blue-600 border-2 border-blue-400" />
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-blue-300 font-bold text-lg">{d.year}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full bg-white/10 ${CAT_COLORS[d.category]} font-medium`}>
                      {CAT_LABELS[d.category]}
                    </span>
                  </div>
                  <div className="text-white font-semibold mb-1">{d.name}</div>
                  <div className="text-blue-400 text-xs mb-2">📡 {d.telescope}</div>
                  <div className="text-gray-300 text-sm">{d.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'spectrum' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-white font-semibold mb-2">Radio Frequency Bands Used in Astronomy</h3>
            <SpectrumBands />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FREQ_BANDS.map(band => (
              <div key={band.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-4 h-4 rounded-sm" style={{ background: band.color }} />
                  <span className="text-white font-bold">{band.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <div className="text-gray-400 text-xs">Frequency</div>
                    <div className="text-gray-200">{band.range}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Wavelength</div>
                    <div className="text-gray-200">{band.wavelength}</div>
                  </div>
                </div>
                <div className="text-gray-400 text-xs">{band.uses}</div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${band.pct * 5}%`, background: band.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* HI 21cm line callout */}
          <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/30 rounded-xl p-5">
            <div className="text-blue-300 font-bold text-lg mb-2">The 21-cm Hydrogen Line</div>
            <p className="text-gray-300 text-sm mb-3">
              The most important frequency in radio astronomy: 1420.405 MHz. Neutral hydrogen emits at this wavelength when its electron flips spin state. Since hydrogen is the most abundant element in the universe, this line maps cosmic structure, galactic rotation, and star-forming regions across billions of light-years.
            </p>
            <div className="flex flex-wrap gap-3">
              {['Maps galactic structure', 'Measures radial velocity', 'Probes dark matter halos', 'SETI water hole'].map(f => (
                <span key={f} className="bg-blue-500/20 text-blue-300 text-xs px-3 py-1 rounded-full">{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer stat row */}
      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Observatories', value: '200+', desc: 'worldwide' },
          { label: 'Frequency Range', value: '10 MHz – 300 GHz', desc: 'radio window' },
          { label: 'First Detection', value: '1932', desc: 'Karl Jansky' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-blue-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
