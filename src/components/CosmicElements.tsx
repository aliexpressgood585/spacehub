import { useState } from 'react'

interface Element {
  symbol: string
  name: string
  z: number
  origin: string
  forge: string
  bodyPercent: number
  cosmicAbundance: string
  timeScale: string
  detail: string
  color: string
}

const elements: Element[] = [
  {
    symbol: 'H', name: 'Hydrogen', z: 1,
    origin: 'Big Bang Nucleosynthesis',
    forge: 'Created 0.1–20 minutes after the Big Bang when the universe cooled enough for protons and neutrons to fuse.',
    bodyPercent: 60.0,
    cosmicAbundance: '92% of all atoms',
    timeScale: '3 minutes post-Big Bang',
    detail: '60% of your body\'s atoms are hydrogen — mostly in water (H₂O). The oldest matter in existence, forged in the first minutes of the universe.',
    color: '#60a5fa'
  },
  {
    symbol: 'He', name: 'Helium', z: 2,
    origin: 'Big Bang Nucleosynthesis',
    forge: 'About 25% of all ordinary matter by mass is helium-4, formed in the first 20 minutes after the Big Bang.',
    bodyPercent: 0.0,
    cosmicAbundance: '8% of all atoms',
    timeScale: '3–20 minutes post-Big Bang',
    detail: 'The second most abundant element but essentially absent in your body. Almost all helium formed in the Big Bang; stellar fusion adds a tiny fraction.',
    color: '#a78bfa'
  },
  {
    symbol: 'C', name: 'Carbon', z: 6,
    origin: 'Stellar Nucleosynthesis (Triple-Alpha)',
    forge: 'Three helium-4 nuclei fuse in the core of red giants via the triple-alpha process (helium burning at ~10⁸ K).',
    bodyPercent: 10.7,
    cosmicAbundance: '4th most abundant',
    timeScale: '~100 Myr stellar lifetimes',
    detail: 'The backbone of all organic chemistry. Created by the triple-alpha process inside red giant stars — two helium nuclei form beryllium-8, a third helium adds to form carbon-12. Without a quantum resonance (the Hoyle state), this reaction would fail.',
    color: '#34d399'
  },
  {
    symbol: 'N', name: 'Nitrogen', z: 7,
    origin: 'CNO Cycle in Massive Stars',
    forge: 'Produced as a catalyst byproduct in the CNO cycle operating in stars more massive than 1.3 M☉.',
    bodyPercent: 2.4,
    cosmicAbundance: '5th most abundant',
    timeScale: 'Main sequence massive stars',
    detail: 'Your DNA and proteins are full of nitrogen. Stars above 1.3 M☉ use the CNO cycle to burn hydrogen, leaving nitrogen as a byproduct ejected in stellar winds and supernovae.',
    color: '#22d3ee'
  },
  {
    symbol: 'O', name: 'Oxygen', z: 8,
    origin: 'Stellar Nucleosynthesis (He/C burning)',
    forge: 'Oxygen-16 forms when carbon-12 captures an alpha particle in the helium-burning shells of massive stars.',
    bodyPercent: 25.7,
    cosmicAbundance: '3rd most abundant',
    timeScale: 'He/C burning in massive stars',
    detail: 'The most abundant element in your body by mass. Produced when red giants add a helium nucleus to carbon-12. Massive stars also produce oxygen in carbon burning (C+C) and neon burning layers.',
    color: '#f97316'
  },
  {
    symbol: 'Fe', name: 'Iron', z: 26,
    origin: 'Silicon Burning + Core Collapse Supernovae',
    forge: 'The endpoint of stellar fusion — iron-56 has maximum binding energy. Produced in the last day of a massive star\'s life.',
    bodyPercent: 0.006,
    cosmicAbundance: '6th most abundant',
    timeScale: 'Last ~24 hours before SN',
    detail: 'The iron in your blood hemoglobin was forged in a dying massive star in the last day of its life. Iron-56 has the highest nuclear binding energy — adding or removing nucleons requires energy, so fusion stops. The iron core collapse triggers the supernova.',
    color: '#f59e0b'
  },
  {
    symbol: 'Au', name: 'Gold', z: 79,
    origin: 'Neutron Star Mergers (r-process)',
    forge: 'Neutron star mergers (kilonova events like GW170817) create extreme neutron fluxes enabling rapid neutron capture to build heavy elements like gold.',
    bodyPercent: 0.000001,
    cosmicAbundance: 'Extremely rare',
    timeScale: 'Neutron star mergers (~10⁸–10¹⁰ yr delay)',
    detail: 'The gold in any jewelry was created when two neutron stars spiraled together and merged in a kilonova explosion. The 2017 event GW170817 — detected by LIGO — directly confirmed gold production from neutron star mergers.',
    color: '#fbbf24'
  },
  {
    symbol: 'Sr', name: 'Strontium', z: 38,
    origin: 'Neutron Star Mergers / AGB Stars',
    forge: 'The first r-process element confirmed spectroscopically in kilonova AT2017gfo (GW170817). Also from s-process in AGB stars.',
    bodyPercent: 0.000003,
    cosmicAbundance: 'Trace heavy element',
    timeScale: 'AGB stars + neutron star mergers',
    detail: 'Strontium was the first element directly observed being created in a neutron star merger. Spectroscopic detection in the 2017 kilonova afterglow confirmed theories about r-process nucleosynthesis and heavy element origin.',
    color: '#e879f9'
  },
  {
    symbol: 'Ca', name: 'Calcium', z: 20,
    origin: 'Oxygen/Neon Burning in Massive Stars',
    forge: 'Silicon burning in the pre-supernova shells of massive stars (>8 M☉) at temperatures >3×10⁹ K produces calcium-40.',
    bodyPercent: 0.22,
    cosmicAbundance: '9th most abundant',
    timeScale: 'Pre-supernova silicon burning',
    detail: 'Your bones and teeth are calcium — built from nuclear ash of exploded stars. Calcium-40 is produced in the silicon-burning shell of massive stars, ejected in the subsequent supernova explosion.',
    color: '#94a3b8'
  },
  {
    symbol: 'Zn', name: 'Zinc', z: 30,
    origin: 'Type Ia Supernovae + Massive Stars',
    forge: 'Zinc is produced in both core-collapse supernovae (via the alpha-rich freezeout) and Type Ia supernovae via nuclear statistical equilibrium.',
    bodyPercent: 0.000031,
    cosmicAbundance: 'Trace transition metal',
    timeScale: 'Billions of years delay (Type Ia)',
    detail: 'The zinc in your enzymes and immune system was partly synthesized in white dwarf explosions. Type Ia supernovae — produced by white dwarfs exceeding the Chandrasekhar limit — create iron-peak elements including zinc.',
    color: '#6ee7b7'
  },
]

interface ForgeSource {
  name: string
  description: string
  elementsForged: string
  energyScale: string
  frequency: string
  icon: string
  color: string
}

const forgeSources: ForgeSource[] = [
  {
    name: 'Big Bang Nucleosynthesis',
    description: 'The first 3–20 minutes. Temperature drops from 10⁹ K to 3×10⁸ K. Only light elements can form — protons and neutrons fuse before the universe cools too much.',
    elementsForged: 'H (75% by mass), He-4 (25%), traces of D, He-3, Li-7',
    energyScale: '~1 MeV/nucleon',
    frequency: 'Once — at cosmic birth',
    icon: '🌌',
    color: '#60a5fa'
  },
  {
    name: 'Stellar Fusion (Main Sequence)',
    description: 'Hydrogen burning via p-p chain (Sun-like) or CNO cycle (massive stars). The primary energy source for ~90% of a star\'s life.',
    elementsForged: 'He-4 from H. CNO cycle byproduct: N-14.',
    energyScale: '~6 MeV per 4H→He',
    frequency: '10²² stars over 13 Gyr',
    icon: '⭐',
    color: '#f59e0b'
  },
  {
    name: 'Red Giant / AGB Shell Burning',
    description: 'Helium shell burning via triple-alpha (C-12, O-16). AGB stars also run the s-process — slow neutron capture building elements up to lead.',
    elementsForged: 'C, O, Ne, Mg, plus Sr, Ba, Pb via s-process',
    energyScale: 'He burning: ~7 MeV/nucleon',
    frequency: 'All stars > ~0.5 M☉ become red giants',
    icon: '🔴',
    color: '#ef4444'
  },
  {
    name: 'Core-Collapse Supernova',
    description: 'Massive stars (>8 M☉) burn successive shells: He→C→Ne→O→Si. Iron core collapses in <1s. Explosive nucleosynthesis in the ejecta.',
    elementsForged: 'O, Ne, Mg, Si, S, Ar, Ca, Ti, Cr, Fe (inner) + many others',
    energyScale: '10⁴⁴ J in neutrinos',
    frequency: '~1–2 per century per galaxy',
    icon: '💥',
    color: '#f97316'
  },
  {
    name: 'Type Ia Supernova',
    description: 'White dwarf in binary system accretes mass past Chandrasekhar limit (1.4 M☉), undergoes thermonuclear runaway. Uniform luminosity → standard candles for cosmology.',
    elementsForged: 'Ni-56 → Co-56 → Fe-56 (half of all iron), Si, S, Ca, Cr',
    energyScale: '~10⁴³ J (1–2×10⁵¹ erg)',
    frequency: '~1 per century per galaxy',
    icon: '⚡',
    color: '#a78bfa'
  },
  {
    name: 'Neutron Star Merger (Kilonova)',
    description: 'Binary neutron stars spiral together via gravitational wave emission and merge. The neutron-rich ejecta undergoes rapid neutron capture (r-process).',
    elementsForged: 'Lanthanides, actinides, Pt, Au, U, Th — elements heavier than Fe from r-process',
    energyScale: '~10⁴⁴–10⁴⁶ J in ejecta',
    frequency: '~1 per 10,000 years per galaxy',
    icon: '🌠',
    color: '#34d399'
  },
]

export default function CosmicElements() {
  const [selected, setSelected] = useState<Element>(elements[0])
  const [view, setView] = useState<'body' | 'forge'>('body')

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Elements</h2>
      <p className="text-gray-400 text-sm mb-5">Every atom in your body was forged in a star — trace the nuclear history of matter</p>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setView('body')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'body' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>Elements in Your Body</button>
        <button onClick={() => setView('forge')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'forge' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>Nucleosynthesis Sources</button>
      </div>

      {view === 'body' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Periodic table subset */}
          <div className="space-y-2">
            {elements.map(el => (
              <button key={el.symbol} onClick={() => setSelected(el)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.symbol === el.symbol ? 'bg-emerald-900/40 border border-emerald-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center text-white font-bold text-sm border border-current" style={{ borderColor: el.color, backgroundColor: el.color + '22', color: el.color }}>
                    <div className="text-xs opacity-60">{el.z}</div>
                    <div>{el.symbol}</div>
                  </div>
                  <div>
                    <div className="text-white text-sm font-semibold">{el.name}</div>
                    <div className="text-gray-500 text-xs">{el.origin}</div>
                  </div>
                  {el.bodyPercent > 0 && (
                    <div className="ml-auto text-right">
                      <div className="text-xs font-mono" style={{ color: el.color }}>{el.bodyPercent.toFixed(1)}%</div>
                      <div className="text-gray-600 text-xs">of atoms</div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center font-bold border-2" style={{ borderColor: selected.color, backgroundColor: selected.color + '22', color: selected.color }}>
                  <div className="text-xs opacity-70">{selected.z}</div>
                  <div className="text-3xl leading-tight">{selected.symbol}</div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{selected.name}</h3>
                  <div className="text-sm" style={{ color: selected.color }}>{selected.origin}</div>
                </div>
              </div>

              <div className="bg-emerald-900/20 rounded-lg p-4 border border-emerald-800/40 mb-4">
                <div className="text-emerald-400 text-xs font-semibold uppercase mb-2">In Your Body</div>
                <p className="text-gray-300 text-sm">{selected.detail}</p>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                <div className="text-gray-500 text-xs font-semibold uppercase mb-2">How It Was Forged</div>
                <p className="text-gray-300 text-sm">{selected.forge}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase">Cosmic Abundance</div>
                  <div className="text-white text-sm">{selected.cosmicAbundance}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase">Forged On</div>
                  <div className="text-white text-sm">{selected.timeScale}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3 col-span-2">
                  <div className="text-gray-500 text-xs uppercase">Body Composition</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-gray-700 rounded-full h-3">
                      <div className="h-3 rounded-full" style={{ width: `${Math.min(selected.bodyPercent / 62 * 100, 100)}%`, backgroundColor: selected.color }} />
                    </div>
                    <span className="text-white font-mono text-sm">{selected.bodyPercent > 0 ? selected.bodyPercent.toFixed(selected.bodyPercent < 0.01 ? 6 : 2) + '%' : 'Trace'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Carl Sagan quote */}
            <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/40">
              <p className="text-gray-400 text-sm italic">"The cosmos is within us. We are made of star-stuff. We are a way for the universe to know itself."</p>
              <div className="text-gray-600 text-xs mt-2">— Carl Sagan, Cosmos</div>
            </div>
          </div>
        </div>
      )}

      {view === 'forge' && (
        <div className="space-y-4">
          <div className="bg-gray-800/60 rounded-xl p-4 text-sm text-gray-300">
            All elements heavier than hydrogen and helium were created through nuclear processes across cosmic history. The periodic table is a map of the universe's nuclear history — each element tells a story of stellar births and deaths.
          </div>
          <div className="space-y-4">
            {forgeSources.map(source => (
              <div key={source.name} className="bg-gray-800/60 rounded-xl p-5 border-l-4" style={{ borderColor: source.color }}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl">{source.icon}</span>
                  <div>
                    <h3 className="text-white font-bold">{source.name}</h3>
                    <div className="text-xs mt-0.5" style={{ color: source.color }}>Frequency: {source.frequency}</div>
                  </div>
                </div>
                <p className="text-gray-300 text-sm mb-3">{source.description}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-gray-900/50 rounded p-3">
                    <div className="text-gray-500 text-xs uppercase mb-1">Elements Forged</div>
                    <div className="text-gray-300 text-sm">{source.elementsForged}</div>
                  </div>
                  <div className="bg-gray-900/50 rounded p-3">
                    <div className="text-gray-500 text-xs uppercase mb-1">Energy Scale</div>
                    <div className="text-gray-300 text-sm font-mono">{source.energyScale}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-emerald-900/20 rounded-xl p-4 border border-emerald-800/40">
            <h3 className="text-white font-bold mb-3 text-sm">The Cosmic Chemistry of You</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
              {[
                { label: 'H, He in you', source: 'Big Bang', pct: '~60% of atoms', color: '#60a5fa' },
                { label: 'C, O, N in you', source: 'Red giants & massive stars', pct: '~39% of atoms', color: '#34d399' },
                { label: 'Ca, Fe in you', source: 'Supernovae', pct: '~1% of atoms', color: '#f97316' },
                { label: 'Au, Zn trace', source: 'Neutron star mergers', pct: '<0.001%', color: '#fbbf24' },
              ].map(item => (
                <div key={item.label} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/40">
                  <div className="font-mono font-bold" style={{ color: item.color }}>{item.pct}</div>
                  <div className="text-white text-xs font-semibold mt-1">{item.label}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{item.source}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
