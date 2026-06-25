import { useState } from 'react'

interface Exoplanet {
  name: string
  type: string
  hostStar: string
  distanceLY: number
  radiusEarth: number
  massEarth: number
  orbitalPeriodDays: number
  equilibriumTempK: number
  atmosphereStatus: 'confirmed' | 'detected' | 'none' | 'unknown'
  atmosphereComposition: string[]
  biosignaturePotential: 'high' | 'moderate' | 'low' | 'none'
  discoveredYear: number
  discoveredBy: string
  missions: string[]
  description: string
  color: string
}

interface Biosignature {
  molecule: string
  formula: string
  significance: string
  detected: boolean
  falsePositiveRisk: string
  wavelengthMicron: string
}

const EXOPLANETS: Exoplanet[] = [
  {
    name: 'TRAPPIST-1e',
    type: 'Rocky terrestrial',
    hostStar: 'TRAPPIST-1 (M8V)',
    distanceLY: 39.5,
    radiusEarth: 0.92,
    massEarth: 0.77,
    orbitalPeriodDays: 6.1,
    equilibriumTempK: 251,
    atmosphereStatus: 'unknown',
    atmosphereComposition: ['Unknown — Earth-like possible'],
    biosignaturePotential: 'high',
    discoveredYear: 2017,
    discoveredBy: 'Gillon et al. / TRAPPIST telescope',
    missions: ['JWST (ongoing)', 'ELT (future)', 'LIFE (proposed)'],
    description: 'Most Earth-like planet yet found. Inside habitable zone of a red dwarf. 40 light-years away. JWST is trying to detect its atmosphere. If it has water, it\'s one of the best candidates for life.',
    color: '#4488FF',
  },
  {
    name: 'K2-18b',
    type: 'Sub-Neptune (Hycean?)',
    hostStar: 'K2-18 (M2.5V)',
    distanceLY: 124,
    radiusEarth: 2.6,
    massEarth: 8.6,
    orbitalPeriodDays: 32.9,
    equilibriumTempK: 265,
    atmosphereStatus: 'confirmed',
    atmosphereComposition: ['H₂ (dominant)', 'CH₄ (methane)', 'CO₂', 'Possible DMS (dimethyl sulfide)'],
    biosignaturePotential: 'moderate',
    discoveredYear: 2015,
    discoveredBy: 'EPIC / Kepler',
    missions: ['JWST NIRSpec (2023)', 'JWST NIRISS'],
    description: 'JWST detected methane and CO₂ in 2023 — and possibly dimethyl sulfide (DMS), which on Earth is only produced by living things. Controversial but exciting. May be a "Hycean" world: hydrogen envelope over a liquid water ocean.',
    color: '#44BB88',
  },
  {
    name: 'HD 189733b',
    type: 'Hot Jupiter',
    hostStar: 'HD 189733 (K1.5V)',
    distanceLY: 63,
    radiusEarth: 12.7,
    massEarth: 366,
    orbitalPeriodDays: 2.2,
    equilibriumTempK: 1200,
    atmosphereStatus: 'confirmed',
    atmosphereComposition: ['H₂', 'CO', 'H₂O', 'CH₄', 'Na', 'K', 'SiO', 'Iron rain (!)'],
    biosignaturePotential: 'none',
    discoveredYear: 2005,
    discoveredBy: 'Bouchy et al.',
    missions: ['Hubble STIS', 'Spitzer', 'JWST'],
    description: 'Deep cobalt blue from silicate cloud particles. Rains liquid iron. Winds exceeding 8,700 km/h. A hell world that is one of the best-studied exoplanet atmospheres. The blue color is NOT water — it\'s silicate (glass) droplets scattering blue light.',
    color: '#2244FF',
  },
  {
    name: 'WASP-39b',
    type: 'Hot Saturn',
    hostStar: 'WASP-39 (G8V)',
    distanceLY: 700,
    radiusEarth: 14.2,
    massEarth: 90,
    orbitalPeriodDays: 4.06,
    equilibriumTempK: 1166,
    atmosphereStatus: 'confirmed',
    atmosphereComposition: ['H₂O', 'CO₂', 'CO', 'SO₂', 'K', 'Na', 'CH₄ (trace)'],
    biosignaturePotential: 'none',
    discoveredYear: 2011,
    discoveredBy: 'WASP survey',
    missions: ['JWST (first full spectrum)', 'Hubble'],
    description: 'JWST\'s first detailed exoplanet atmospheric spectrum (2022). First detection of CO₂ in an exoplanet atmosphere. Photochemical sulfur dioxide (SO₂) discovered — a molecule produced by photochemical reactions, not life. A chemical lab for atmospheric physics.',
    color: '#FF8844',
  },
  {
    name: 'Proxima Centauri b',
    type: 'Rocky (potential)',
    hostStar: 'Proxima Centauri (M5.5Ve)',
    distanceLY: 4.24,
    radiusEarth: 1.07,
    massEarth: 1.27,
    orbitalPeriodDays: 11.2,
    equilibriumTempK: 234,
    atmosphereStatus: 'unknown',
    atmosphereComposition: ['Unknown — could be stripped by flares'],
    biosignaturePotential: 'low',
    discoveredYear: 2016,
    discoveredBy: 'Anglada-Escudé et al.',
    missions: ['ELT (future)', 'Starshot (concept)'],
    description: 'Nearest exoplanet to Earth — 4.24 light-years. Minimum mass similar to Earth. In habitable zone. BUT: Proxima Centauri is a violent flare star. Ultraviolet and X-ray bombardment may have stripped any atmosphere. Still a prime target for direct imaging.',
    color: '#FF4444',
  },
  {
    name: 'TOI-700d',
    type: 'Rocky terrestrial',
    hostStar: 'TOI-700 (M2V)',
    distanceLY: 101.4,
    radiusEarth: 1.19,
    massEarth: 1.72,
    orbitalPeriodDays: 37.4,
    equilibriumTempK: 269,
    atmosphereStatus: 'unknown',
    atmosphereComposition: ['Unknown — CO₂-dominated possible'],
    biosignaturePotential: 'moderate',
    discoveredYear: 2020,
    discoveredBy: 'TESS',
    missions: ['JWST (target)', 'TESS (follow-up)'],
    description: 'TESS mission discovery. Rocky planet in habitable zone, 101 light-years away. Tidally locked (same face always toward star). Climate models suggest it could host liquid water in some scenarios. JWST atmospheric observation campaigns planned.',
    color: '#88BB44',
  },
]

const BIOSIGNATURES: Biosignature[] = [
  { molecule: 'Oxygen', formula: 'O₂', significance: 'Produced by photosynthesis on Earth; highly reactive, rapidly destroyed without biological replenishment', detected: false, falsePositiveRisk: 'Low — abiotic production limited in most scenarios', wavelengthMicron: '0.76, 1.27' },
  { molecule: 'Ozone', formula: 'O₃', significance: 'Proxy for O₂; created when UV light breaks O₂. Stronger spectral feature than O₂ itself', detected: false, falsePositiveRisk: 'Low — requires large O₂ reservoir', wavelengthMicron: '0.6, 9.7' },
  { molecule: 'Methane', formula: 'CH₄', significance: 'Produced by methanogens (biology) but also volcanoes. Coexistence with O₂ is a strong biosignature disequilibrium', detected: true, falsePositiveRisk: 'Moderate — abiotic production possible', wavelengthMicron: '3.3, 7.7' },
  { molecule: 'Nitrous oxide', formula: 'N₂O', significance: 'Almost exclusively biological on Earth; microbes and agricultural processes. Very strong biosignature', detected: false, falsePositiveRisk: 'Very low — hard to produce abiotically', wavelengthMicron: '3.9, 4.5, 7.8' },
  { molecule: 'Water vapor', formula: 'H₂O', significance: 'Prerequisite for life as we know it; habitable zone indicator', detected: true, falsePositiveRisk: 'N/A — not a biosignature alone, but necessary', wavelengthMicron: '0.7–0.8, 1.4, 1.9, 2.7' },
  { molecule: 'Dimethyl sulfide', formula: 'DMS', significance: 'On Earth, only produced by phytoplankton/algae in oceans. Very specific biosignature. Possibly detected in K2-18b.', detected: true, falsePositiveRisk: 'Low — limited abiotic pathways known', wavelengthMicron: '3.3, 6–10' },
  { molecule: 'Phosphine', formula: 'PH₃', significance: 'Claimed (controversially) in Venus atmosphere 2020. In gas giants, geological; in rocky planets, a strong biosignature', detected: false, falsePositiveRisk: 'Depends on planetary type', wavelengthMicron: '2.7, 4.3, 10.1' },
]

export default function ExoplanetAtmospheres() {
  const [selected, setSelected] = useState<Exoplanet>(EXOPLANETS[0])
  const [activeTab, setActiveTab] = useState<'planets' | 'biosignatures' | 'jwst'>('planets')

  const potentialColor = (p: Exoplanet['biosignaturePotential']) =>
    p === 'high' ? 'text-green-400 bg-green-900/30' : p === 'moderate' ? 'text-yellow-400 bg-yellow-900/30' : p === 'low' ? 'text-orange-400 bg-orange-900/30' : 'text-red-400 bg-red-900/30'

  const atmosphereStatusColor = (s: Exoplanet['atmosphereStatus']) =>
    s === 'confirmed' ? 'text-green-400' : s === 'detected' ? 'text-blue-400' : s === 'none' ? 'text-red-400' : 'text-slate-400'

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Exoplanet Atmospheres</h2>
      <p className="text-slate-400 text-sm mb-5">JWST is opening a new window into alien worlds — detecting atmospheres, molecules, and searching for biosignatures</p>

      <div className="flex gap-1 mb-5">
        {([['planets', '🌍 Key Targets'], ['biosignatures', '🧬 Biosignatures'], ['jwst', '🔭 JWST Breakthroughs']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'planets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-2">
            {EXOPLANETS.map((p, i) => (
              <button key={i} onClick={() => setSelected(p)} className={`w-full text-left p-3 rounded-xl transition-all ${selected.name === p.name ? 'bg-slate-700 ring-1 ring-indigo-500' : 'bg-slate-800 hover:bg-slate-700'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}80` }} />
                  <span className="text-white font-semibold text-sm">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">{p.type}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${potentialColor(p.biosignaturePotential)}`}>{p.biosignaturePotential} potential</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-slate-900 rounded-xl p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color, boxShadow: `0 0 25px ${selected.color}60` }} />
              <div>
                <h3 className="text-white font-bold text-xl">{selected.name}</h3>
                <div className="text-slate-400 text-sm">{selected.type} · Host: {selected.hostStar}</div>
                <div className="text-slate-400 text-xs">{selected.distanceLY} light-years · Discovered {selected.discoveredYear}</div>
              </div>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed mb-4">{selected.description}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Radius', value: `${selected.radiusEarth} R⊕` },
                { label: 'Mass', value: `${selected.massEarth} M⊕` },
                { label: 'Orbital period', value: `${selected.orbitalPeriodDays} days` },
                { label: 'Temp', value: `${selected.equilibriumTempK} K` },
              ].map((s, i) => (
                <div key={i} className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">{s.label}</div>
                  <div className="text-white text-sm font-bold">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-slate-500 text-xs">Atmosphere:</span>
                <span className={`text-xs font-bold capitalize ${atmosphereStatusColor(selected.atmosphereStatus)}`}>{selected.atmosphereStatus}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${potentialColor(selected.biosignaturePotential)}`}>
                  🧬 {selected.biosignaturePotential} biosignature potential
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.atmosphereComposition.map((mol, i) => (
                  <span key={i} className="bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded-full">{mol}</span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-slate-500 text-xs mb-1">Active / Planned Missions</div>
              <div className="flex flex-wrap gap-2">
                {selected.missions.map((m, i) => (
                  <span key={i} className="bg-indigo-900/40 text-indigo-300 text-xs px-2 py-1 rounded">🔭 {m}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'biosignatures' && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm mb-4">A biosignature is a substance or feature that provides evidence of past or present life. No individual molecule is conclusive — astronomers look for disequilibrium combinations that can only be explained by biology.</p>
          {BIOSIGNATURES.map((b, i) => (
            <div key={i} className={`bg-slate-800 rounded-xl p-4 border-l-4 ${b.detected ? 'border-green-500' : 'border-slate-600'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold">{b.molecule}</span>
                  <span className="text-slate-400 font-mono text-sm">{b.formula}</span>
                  {b.detected && <span className="text-green-400 text-xs bg-green-900/30 px-2 py-0.5 rounded">✓ Detected in exoplanets</span>}
                </div>
                <span className="text-slate-400 font-mono text-xs">{b.wavelengthMicron} μm</span>
              </div>
              <p className="text-slate-300 text-sm mb-2">{b.significance}</p>
              <div className="text-slate-500 text-xs">False positive risk: <span className="text-slate-300">{b.falsePositiveRisk}</span></div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'jwst' && (
        <div className="space-y-4">
          <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-xl p-4">
            <h4 className="text-white font-bold mb-2">🔭 James Webb Space Telescope — The Atmosphere Revolution</h4>
            <p className="text-slate-300 text-sm leading-relaxed">JWST launched December 25, 2021. Its infrared sensitivity and giant 6.5m mirror allow it to analyze starlight filtered through exoplanet atmospheres with unprecedented precision. Every transit observation adds molecules to the roster of known exoplanet chemistry.</p>
          </div>
          {[
            { year: '2022', title: 'First CO₂ detection in an exoplanet (WASP-39b)', desc: 'Carbon dioxide detected for the first time in an exoplanet atmosphere. JWST\'s NIRISS and NIRSpec instruments identified it clearly. This carbon isotope ratio can in principle distinguish biological from geological CO₂.' },
            { year: '2022', title: 'Photochemical SO₂ found in WASP-39b', desc: 'Sulfur dioxide detected — the first time photochemical processes were observed in an exoplanet atmosphere. Shows JWST can detect complex atmospheric chemistry, not just bulk composition.' },
            { year: '2023', title: 'Methane + CO₂ in K2-18b (Hycean world?)', desc: 'JWST found methane and CO₂ in K2-18b, a sub-Neptune 124 light-years away. The abundance pattern suggests a possible liquid water ocean under a hydrogen atmosphere — a new planetary type called a "Hycean world".' },
            { year: '2023', title: 'Possible DMS detection in K2-18b (controversial)', desc: 'Dimethyl sulfide (DMS), produced only by life on Earth, was tentatively detected. Scientists cautious — more observations needed. If confirmed, would be the most significant astrobiology finding in history.' },
            { year: '2024', title: 'TRAPPIST-1b: No thick atmosphere', desc: 'JWST measured the thermal emission of TRAPPIST-1b, the innermost planet, and found it absorbs and emits heat like a bare rock with no thick atmosphere — likely stripped by stellar flares. Sets the stage for studying the more promising TRAPPIST-1e and 1f.' },
            { year: '2025+', title: 'TRAPPIST-1e and 1f — the main targets', desc: 'TRAPPIST-1e and 1f, both in the habitable zone, are JWST\'s ultimate targets. With 100+ hours of observation each, JWST may detect CO₂ or water vapor by 2026. Finding oxygen would take decades with current technology.' },
          ].map((ev, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-indigo-400 font-bold text-sm flex-shrink-0">{ev.year}</span>
                <div>
                  <div className="text-white font-semibold text-sm mb-1">{ev.title}</div>
                  <p className="text-slate-300 text-sm leading-relaxed">{ev.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
