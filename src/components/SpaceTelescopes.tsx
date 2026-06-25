import { useState } from 'react'

interface Telescope {
  name: string
  agency: string
  launched: number
  status: 'active' | 'retired' | 'planned'
  wavelength: string[]
  wavelengthType: 'radio' | 'infrared' | 'optical' | 'uv' | 'xray' | 'gamma' | 'multi'
  aperture: string
  orbit: string
  cost: string
  topDiscoveries: string[]
  description: string
  icon: string
}

interface WavelengthBand {
  name: string
  range: string
  color: string
  telescopes: string[]
  whySpace: string
}

const TELESCOPES: Telescope[] = [
  {
    name: 'James Webb Space Telescope',
    agency: 'NASA/ESA/CSA',
    launched: 2021,
    status: 'active',
    wavelength: ['0.6–28 μm'],
    wavelengthType: 'infrared',
    aperture: '6.5 m',
    orbit: 'L2 (1.5M km)',
    cost: '$10 billion',
    icon: '🔭',
    description: 'The most powerful space telescope ever built. Its gold-coated beryllium mirrors and infrared sensitivity allow it to see the first galaxies, exoplanet atmospheres, and stellar nurseries.',
    topDiscoveries: ['Oldest galaxy (JADES-GS-z14-0, 290 Myr after BB)', 'CO₂ in exoplanet atmospheres', 'Detailed Carina Nebula imagery', 'Protoplanetary disk details', 'TRAPPIST-1 system characterization'],
  },
  {
    name: 'Hubble Space Telescope',
    agency: 'NASA/ESA',
    launched: 1990,
    status: 'active',
    wavelength: ['115 nm – 2.5 μm'],
    wavelengthType: 'optical',
    aperture: '2.4 m',
    orbit: 'LEO (547 km)',
    cost: '$4.7 billion',
    icon: '🌌',
    description: 'The most productive science instrument in history. After a mirror fix in 1993, Hubble revolutionized astronomy with sharp optical images from near-UV to near-IR.',
    topDiscoveries: ['Accelerating universe / dark energy', 'Hubble Deep Fields', 'Black holes in galaxy centers', 'Age of universe (13.8 Gyr)', 'Stellar age of M31 / galaxy evolution'],
  },
  {
    name: 'Chandra X-ray Observatory',
    agency: 'NASA',
    launched: 1999,
    status: 'active',
    wavelength: ['0.1–10 keV'],
    wavelengthType: 'xray',
    aperture: '1.2 m (nested)',
    orbit: 'High elliptical',
    cost: '$1.65 billion',
    icon: '⚡',
    description: 'The most sensitive X-ray telescope ever built. Chandra sees hot gas, black holes, and supernovae remnants that are invisible at optical wavelengths.',
    topDiscoveries: ['Dark matter in Bullet Cluster', 'First X-ray image of Sgr A* flare', 'Milky Way black hole jets', 'Supernova shock-wave chemistry', 'Galaxy cluster hot gas'],
  },
  {
    name: 'Spitzer Space Telescope',
    agency: 'NASA',
    launched: 2003,
    status: 'retired',
    wavelength: ['3–180 μm'],
    wavelengthType: 'infrared',
    aperture: '0.85 m',
    orbit: 'Earth-trailing',
    cost: '$720 million',
    icon: '🌡️',
    description: 'NASA\'s flagship infrared telescope. Operated until 2020, revealing dusty stellar nurseries, cool brown dwarfs, and exoplanet thermal maps.',
    topDiscoveries: ['TRAPPIST-1 planetary system', 'First exoplanet weather maps', 'Cosmic ring around Saturn', 'Galaxy formation in early universe', 'Brown dwarf population census'],
  },
  {
    name: 'XMM-Newton',
    agency: 'ESA',
    launched: 1999,
    status: 'active',
    wavelength: ['0.1–15 keV'],
    wavelengthType: 'xray',
    aperture: '3 × 58 cm (nested)',
    orbit: 'High elliptical',
    cost: '$600 million',
    icon: '🔆',
    description: 'ESA\'s X-ray Multi-Mirror Mission. Complements Chandra with higher sensitivity (less resolution). Surveys galaxy clusters and active galactic nuclei.',
    topDiscoveries: ['Large-scale hot gas filaments', 'AGN X-ray variability census', 'Thousands of galaxy clusters', 'Magnetar emission spectra', 'Black hole spin measurements'],
  },
  {
    name: 'Fermi Gamma-ray Telescope',
    agency: 'NASA/DOE',
    launched: 2008,
    status: 'active',
    wavelength: ['20 MeV – 300 GeV'],
    wavelengthType: 'gamma',
    aperture: '1.8 m (LAT)',
    orbit: 'LEO (565 km)',
    cost: '$690 million',
    icon: '💥',
    description: 'The premier gamma-ray observatory. Monitors the most energetic phenomena: gamma-ray bursts, pulsars, and dark matter annihilation signals.',
    topDiscoveries: ['Fermi Bubbles above Milky Way', 'Hundreds of new pulsars', 'GRB distance records', 'Potential dark matter signals', 'Magnetar giant flare observation'],
  },
  {
    name: 'Euclid',
    agency: 'ESA',
    launched: 2023,
    status: 'active',
    wavelength: ['0.55–2 μm'],
    wavelengthType: 'optical',
    aperture: '1.2 m',
    orbit: 'L2 (1.5M km)',
    cost: '€1.4 billion',
    icon: '🌐',
    description: 'Europe\'s dark energy mapper. Surveys 15,000 sq degrees to map galaxy shapes and positions across 10 billion years of cosmic history.',
    topDiscoveries: ['First Euclid deep field (Nov 2023)', 'Galaxy shape catalog for weak lensing', 'Mapping dark matter distribution', 'Dark energy equation of state'],
  },
  {
    name: 'Roman Space Telescope',
    agency: 'NASA',
    launched: 2027,
    status: 'planned',
    wavelength: ['0.5–2.3 μm'],
    wavelengthType: 'infrared',
    aperture: '2.4 m',
    orbit: 'L2 (1.5M km)',
    cost: '$3.9 billion',
    icon: '🚀',
    description: 'Nancy Grace Roman Space Telescope — Hubble\'s wide-field successor. 100× the field of view of Hubble to survey dark energy, exoplanets via microlensing, and infrared sky.',
    topDiscoveries: ['First light planned 2027+', 'Expected: thousands of exoplanets', 'Supernova cosmology surveys', 'Deep galaxy field surveys'],
  },
]

const WAVELENGTH_BANDS: WavelengthBand[] = [
  {
    name: 'Radio',
    range: '> 1 mm',
    color: '#8b5cf6',
    telescopes: ['VLA', 'ALMA', 'FAST', 'Event Horizon Telescope'],
    whySpace: 'Radio penetrates atmosphere — ground-based works fine. Space adds baselines for VLBI.',
  },
  {
    name: 'Infrared',
    range: '1 μm – 1 mm',
    color: '#ef4444',
    telescopes: ['JWST', 'Spitzer', 'Herschel', 'Roman (2027)'],
    whySpace: 'Water vapor absorbs infrared. Space avoids thermal noise from warm atmosphere.',
  },
  {
    name: 'Optical / UV',
    range: '10 nm – 1 μm',
    color: '#3b82f6',
    telescopes: ['Hubble', 'Euclid', 'Kepler', 'TESS'],
    whySpace: 'Avoids atmospheric blurring (seeing). UV blocked by ozone — space essential.',
  },
  {
    name: 'X-ray',
    range: '0.01 nm – 10 nm',
    color: '#06b6d4',
    telescopes: ['Chandra', 'XMM-Newton', 'eROSITA', 'IXPE'],
    whySpace: 'X-rays absorbed by atmosphere. Space mandatory.',
  },
  {
    name: 'Gamma-ray',
    range: '< 0.01 nm',
    color: '#f59e0b',
    telescopes: ['Fermi', 'INTEGRAL', 'Swift'],
    whySpace: 'Gamma-rays completely absorbed by atmosphere. Space mandatory.',
  },
]

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  retired: 'bg-gray-500/20 text-gray-400',
  planned: 'bg-yellow-500/20 text-yellow-400',
}

const WAVE_COLORS: Record<string, string> = {
  radio: 'text-purple-400',
  infrared: 'text-red-400',
  optical: 'text-blue-400',
  uv: 'text-violet-400',
  xray: 'text-cyan-400',
  gamma: 'text-yellow-400',
  multi: 'text-green-400',
}

type TabType = 'telescopes' | 'spectrum' | 'compare'

export default function SpaceTelescopes() {
  const [activeTab, setActiveTab] = useState<TabType>('telescopes')
  const [selected, setSelected] = useState<Telescope>(TELESCOPES[0])
  const [waveFilter, setWaveFilter] = useState<string>('all')

  const waveTypes = ['all', 'infrared', 'optical', 'xray', 'gamma']
  const filtered = waveFilter === 'all' ? TELESCOPES : TELESCOPES.filter(t => t.wavelengthType === waveFilter)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🔭</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Telescopes</h2>
          <p className="text-gray-400 text-sm">Humanity's eyes across the electromagnetic spectrum</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['telescopes', 'spectrum', 'compare'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === t ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'telescopes' ? 'Observatories' : t === 'spectrum' ? 'EM Spectrum' : 'Comparison'}
          </button>
        ))}
      </div>

      {activeTab === 'telescopes' && (
        <div className="space-y-4">
          {/* Wave filter */}
          <div className="flex flex-wrap gap-2">
            {waveTypes.map(w => (
              <button
                key={w}
                onClick={() => setWaveFilter(w)}
                className={`px-3 py-1 rounded-full text-xs capitalize transition-all ${
                  waveFilter === w ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              {filtered.map(t => (
                <button
                  key={t.name}
                  onClick={() => setSelected(t)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected.name === t.name
                      ? 'bg-blue-600/30 border-blue-500'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{t.icon}</span>
                    <div>
                      <div className="text-white text-sm font-medium">{t.name}</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>{t.status}</span>
                        <span className={`text-xs ${WAVE_COLORS[t.wavelengthType]}`}>{t.wavelengthType}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-4xl">{selected.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <p className="text-gray-400 text-sm">{selected.agency} · Launched {selected.launched}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>
                    {selected.status}
                  </span>
                </div>
              </div>

              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Primary Mirror', value: selected.aperture },
                  { label: 'Wavelength', value: selected.wavelength.join(', ') },
                  { label: 'Orbit', value: selected.orbit },
                  { label: 'Cost', value: selected.cost },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                    <div className="text-white text-sm font-semibold">{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3">
                <div className="text-blue-400 text-xs font-semibold mb-2">Top Discoveries</div>
                <ul className="space-y-1">
                  {selected.topDiscoveries.map((d, i) => (
                    <li key={i} className="text-gray-300 text-xs flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">▸</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'spectrum' && (
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">The atmosphere blocks most of the electromagnetic spectrum. Space telescopes open windows inaccessible from the ground.</p>

          {/* EM spectrum bar */}
          <div className="relative h-12 rounded-xl overflow-hidden">
            {['#8b5cf6', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#06b6d4', '#f59e0b'].map((c, i) => (
              <div key={i} className="absolute top-0 bottom-0" style={{ left: `${i * 12.5}%`, width: '12.5%', background: c + '99' }} />
            ))}
            {/* Atmospheric opacity overlay */}
            {[
              { left: '0%', width: '12%', label: 'Radio ✓', opacity: 0.1 },
              { left: '12%', width: '20%', label: 'IR blocked', opacity: 0.7 },
              { left: '32%', width: '18%', label: 'Optical ✓', opacity: 0.1 },
              { left: '50%', width: '12%', label: 'UV blocked', opacity: 0.7 },
              { left: '62%', width: '20%', label: 'X-ray blocked', opacity: 0.9 },
              { left: '82%', width: '18%', label: 'γ-ray blocked', opacity: 0.95 },
            ].map((b, i) => (
              <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center" style={{ left: b.left, width: b.width, background: `rgba(0,0,0,${b.opacity})` }}>
                <span className="text-white text-xs font-medium" style={{ fontSize: '9px' }}>{b.label}</span>
              </div>
            ))}
          </div>
          <div className="text-gray-500 text-xs text-center">Dark regions = atmosphere blocks — space required</div>

          {WAVELENGTH_BANDS.map(band => (
            <div key={band.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 rounded-sm" style={{ background: band.color }} />
                <span className="text-white font-bold">{band.name}</span>
                <span className="text-gray-400 text-xs">{band.range}</span>
              </div>
              <div className="text-gray-300 text-sm mb-2">{band.whySpace}</div>
              <div className="flex flex-wrap gap-2">
                {band.telescopes.map(t => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full bg-white/10 text-gray-300">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-white/10">
                  <th className="text-left py-2 pr-4">Telescope</th>
                  <th className="text-left py-2 pr-4">Mirror</th>
                  <th className="text-left py-2 pr-4">Wavelength</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2">Cost</th>
                </tr>
              </thead>
              <tbody>
                {TELESCOPES.map(t => (
                  <tr key={t.name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span>{t.icon}</span>
                        <div>
                          <div className="text-white font-medium">{t.name}</div>
                          <div className="text-gray-500 text-xs">{t.agency}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-300">{t.aperture}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs ${WAVE_COLORS[t.wavelengthType]}`}>{t.wavelengthType}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>{t.status}</span>
                    </td>
                    <td className="py-3 text-gray-300">{t.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mirror comparison bars */}
          <div className="mt-4">
            <div className="text-white font-semibold mb-3">Mirror Diameter Comparison</div>
            {[
              { name: 'JWST', size: 6.5, color: '#f59e0b' },
              { name: 'Hubble', size: 2.4, color: '#3b82f6' },
              { name: 'Roman', size: 2.4, color: '#8b5cf6' },
              { name: 'Euclid', size: 1.2, color: '#06b6d4' },
              { name: 'Chandra', size: 1.2, color: '#06b6d4' },
              { name: 'Fermi', size: 1.8, color: '#f59e0b' },
              { name: 'Spitzer', size: 0.85, color: '#ef4444' },
            ].map(t => (
              <div key={t.name} className="flex items-center gap-3 mb-2">
                <div className="text-gray-300 text-xs w-20 text-right">{t.name}</div>
                <div className="flex-1 h-5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center pl-2"
                    style={{ width: `${(t.size / 6.5) * 100}%`, background: t.color + 'cc' }}
                  >
                    <span className="text-white text-xs font-mono">{t.size} m</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Active Space Telescopes', value: '30+', desc: 'in orbit today' },
          { label: 'JWST Mirror', value: '6.5 m', desc: 'largest in space' },
          { label: 'Hubble Images', value: '1.4M+', desc: 'science observations' },
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
