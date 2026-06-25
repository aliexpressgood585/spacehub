import { useState } from 'react'

interface NuclearProcess {
  name: string
  abbreviation: string
  location: string
  temperature: string
  elements: string
  energyRate: string
  description: string
  key: string
  color: string
  icon: string
}

interface Isotope {
  name: string
  symbol: string
  halfLife: string
  decayMode: string
  production: string
  application: string
  color: string
}

interface CrossSection {
  reaction: string
  energy: string
  rate: string
  importance: string
}

const nuclearProcesses: NuclearProcess[] = [
  {
    name: 'Proton-Proton Chain (pp-I)',
    abbreviation: 'pp chain',
    location: 'Solar core (T < 2×10⁷ K)',
    temperature: '~1.5×10⁷ K',
    elements: '4¹H → ⁴He + 2e⁺ + 2ν + 2γ',
    energyRate: '2.53×10⁻²² MeV s⁻¹ per proton pair',
    description: 'Converts four hydrogen nuclei into one helium-4 nucleus, releasing 26.7 MeV. This is how the Sun and all stars below ~1.3 M☉ burn hydrogen. The first step — p+p → d + e⁺ + ν — is the bottleneck, occurring via the weak force.',
    key: 'The Sun produces ~4×10³⁸ proton-proton reactions per second. This releases ~3.8×10²⁶ watts of energy.',
    color: '#f97316',
    icon: '☀️'
  },
  {
    name: 'CNO Cycle',
    abbreviation: 'CNO',
    location: 'Stars > 1.3 M☉ cores',
    temperature: '~1.5–2.5×10⁷ K',
    elements: 'C, N, O as catalysts; net: 4H → He',
    energyRate: '10–100× faster than pp at same T',
    description: 'Carbon-12 captures protons sequentially through nitrogen and oxygen isotopes, returning to C-12 with a net product of He-4. Dominates energy production in stars above ~1.3 M☉. CNO is highly temperature sensitive (ε ∝ T²⁰) vs pp chain (ε ∝ T⁴).',
    key: 'CNO cycle dominates in Sirius, Vega, and all O/B stars. It\'s also the primary source of nitrogen-14 in the universe.',
    color: '#60a5fa',
    icon: '⚙️'
  },
  {
    name: 'Triple-Alpha Process',
    abbreviation: '3α',
    location: 'Red giant He-burning cores',
    temperature: '~10⁸ K',
    elements: '3⁴He → ¹²C (+ γ)',
    energyRate: 'ε ∝ T⁴⁰ (extremely temperature sensitive)',
    description: 'Three helium-4 nuclei fuse to form carbon-12 via an unstable beryllium-8 intermediate (half-life 10⁻¹⁷ s). The reaction requires a resonance in carbon-12 at 7.65 MeV — the "Hoyle state," predicted by Fred Hoyle in 1953 before it was discovered.',
    key: 'Without the Hoyle state resonance, no carbon would exist and life would be impossible. This is cited in fine-tuning arguments.',
    color: '#34d399',
    icon: '🔴'
  },
  {
    name: 'Alpha Capture (He burning)',
    abbreviation: 'α capture',
    location: 'Red giant He-burning shells',
    temperature: '~2–5×10⁸ K',
    elements: '¹²C + ⁴He → ¹⁶O + γ',
    energyRate: 'Rate competes with 3α',
    description: 'Carbon-12 captures an alpha particle to form oxygen-16. This reaction competes with triple-alpha, determining the C/O ratio in red giant cores, which sets the ratio of carbon to oxygen in the universe. The cross-section is notoriously hard to measure.',
    key: 'The C/O ratio from this reaction determines whether a white dwarf forms from C/O or if more complex chemistry is possible.',
    color: '#a78bfa',
    icon: '⭕'
  },
  {
    name: 'Silicon Burning',
    abbreviation: 'Si burn',
    location: 'Pre-SN massive star cores',
    temperature: '~3×10⁹ K',
    elements: 'Si → Fe/Ni peak (sequential α captures)',
    energyRate: 'Milliseconds to days in last stage',
    description: 'At 3 billion K, photodisintegration destroys nuclei faster than they\'re built. Nuclear statistical equilibrium (NSE) drives composition toward iron-peak elements (⁵⁶Fe, ⁵⁶Ni). Once the iron core forms, no more energy is available — core collapse begins.',
    key: 'Silicon burning lasts only 1 day in a 25 M☉ star. Iron cannot fuse to release energy — adding or removing nucleons from Fe-56 requires energy input.',
    color: '#f59e0b',
    icon: '⚡'
  },
  {
    name: 'r-Process (Rapid Neutron Capture)',
    abbreviation: 'r-process',
    location: 'Neutron star mergers, core-collapse SN',
    temperature: '~10⁹–10¹⁰ K',
    elements: 'Heavy nuclei from Ba to U, Th, Pu',
    energyRate: 'Neutron capture in 10⁻³ s or less',
    description: 'Rapid neutron capture creates nuclei far from the valley of stability. Requires extreme neutron flux (~10²² neutrons/cm² s⁻¹). Confirmed in kilonova GW170817 (AT2017gfo) via spectroscopic detection of Sr, lanthanides.',
    key: 'Gold, platinum, uranium, strontium — all made in neutron star mergers. LIGO\'s GW170817 directly showed r-process nucleosynthesis occurring.',
    color: '#fbbf24',
    icon: '🌠'
  },
  {
    name: 's-Process (Slow Neutron Capture)',
    abbreviation: 's-process',
    location: 'AGB star thermal pulses',
    temperature: '~1–3×10⁸ K',
    elements: 'Elements from Fe to Pb/Bi (weak) and Pb (strong)',
    energyRate: 'Timescales of 10²–10⁵ years per isotope',
    description: 'Slow neutron capture (relative to beta decay lifetime). Proceeds along the valley of beta stability. Produces elements like Ba, Ce, Nd, Sm, Pb, Bi. The neutrons come from ¹³C(α,n)¹⁶O and ²²Ne(α,n)²⁵Mg reactions.',
    key: 'Half of all elements heavier than Fe are made by s-process. Barium and lead detected in stellar spectra confirm s-process in AGB stars.',
    color: '#06b6d4',
    icon: '🌀'
  },
  {
    name: 'Spallation (Cosmic Ray)',
    abbreviation: 'CR spallation',
    location: 'Interstellar medium, upper atmosphere',
    temperature: 'N/A (energetic particles)',
    elements: 'Li, Be, B from C, N, O breakup',
    energyRate: 'Cosmic ray rate ∝ interstellar density',
    description: 'High-energy cosmic rays collide with interstellar carbon, nitrogen, oxygen nuclei, shattering them into lighter elements. The only known source of lithium-7, beryllium-9, and boron-10/11 (Big Bang BBN only makes small amounts of Li-7).',
    key: 'Li, Be, B cannot be made in stars (they\'d be immediately destroyed by fusion). Cosmic ray spallation is their primary synthesis route.',
    color: '#8b5cf6',
    icon: '💥'
  },
]

const cosmicIsotopes: Isotope[] = [
  { name: 'Iron-60', symbol: '⁶⁰Fe', halfLife: '2.6 million years', decayMode: 'β⁻', production: 'Supernova ejecta, stellar wind from massive stars', application: 'Found in deep-sea sediments and lunar regolith — proves nearby supernovae occurred ~2–3 Mya', color: '#f59e0b' },
  { name: 'Aluminum-26', symbol: '²⁶Al', halfLife: '717,000 years', decayMode: 'β⁺ / electron capture', production: 'Novae, Wolf-Rayet stars, AGB stars', application: 'Detected in Milky Way by COMPTEL; heating mechanism of early solar system planetesimals', color: '#34d399' },
  { name: 'Nickel-56', symbol: '⁵⁶Ni', halfLife: '6.1 days', decayMode: 'β⁺', production: 'Core-collapse + Type Ia supernovae', application: 'Powers supernova light curves via ⁵⁶Ni → ⁵⁶Co → ⁵⁶Fe decay chain; directly observed in SN 1987A', color: '#ef4444' },
  { name: 'Technetium-99', symbol: '⁹⁹Tc', halfLife: '211,000 years', decayMode: 'β⁻', production: 's-process in AGB stars', application: 'Detection in stellar spectra proved AGB stars actively produce heavy elements via s-process (Merrill 1952)', color: '#a78bfa' },
  { name: 'Carbon-14', symbol: '¹⁴C', halfLife: '5,730 years', decayMode: 'β⁻', production: 'Cosmic ray spallation: ¹⁴N + n → ¹⁴C + p', application: 'Radiocarbon dating; cosmic ray flux proxy; linked to supernovae events in tree ring records (Miyake events)', color: '#60a5fa' },
  { name: 'Lithium-7', symbol: '⁷Li', halfLife: 'Stable', decayMode: 'Stable', production: 'Big Bang BBN (~25%) + cosmic ray spallation', application: 'The "lithium problem" — observed stellar Li is 3× lower than BBN prediction (CMB measurement). Active research area.', color: '#f97316' },
]

const keyReactions: CrossSection[] = [
  { reaction: '¹²C(α,γ)¹⁶O', energy: 'E_r = 7.12 MeV', rate: 'S-factor: ~150 keV·b', importance: 'Most uncertain reaction in stellar physics. Controls C/O ratio in the universe.' },
  { reaction: 'p + p → d + e⁺ + νe', energy: 'E_CM ~ keV', rate: 'S₁₁ = 4×10⁻²² MeV·b', importance: 'Slowest step of pp chain (weak force). Sets the Sun\'s lifetime at ~10 Gyr.' },
  { reaction: '³He + ⁴He → ⁷Be + γ', energy: '~20 keV', rate: 'Branching: ~15% in Sun', importance: 'Produces solar neutrinos detected by SNO, Kamiokande — proved neutrino oscillations.' },
  { reaction: '¹⁴N(p,γ)¹⁵O', energy: '~25 keV', rate: 'Rate-limiting step of CNO', importance: 'The bottleneck of the CNO cycle. Determines luminosity of massive main-sequence stars.' },
]

type Tab = 'processes' | 'isotopes' | 'reactions'

export default function NuclearAstrophysics() {
  const [tab, setTab] = useState<Tab>('processes')
  const [selected, setSelected] = useState(nuclearProcesses[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'processes', label: 'Nuclear Processes' },
    { id: 'isotopes', label: 'Cosmic Isotopes' },
    { id: 'reactions', label: 'Key Reactions' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Nuclear Astrophysics</h2>
      <p className="text-gray-400 text-sm mb-5">The nuclear reactions that power stars, create elements, and forge the periodic table</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'processes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {nuclearProcesses.map(p => (
              <button key={p.name} onClick={() => setSelected(p)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === p.name ? 'border' : 'bg-gray-800/50 hover:bg-gray-700/50'}`} style={selected.name === p.name ? { borderColor: p.color, backgroundColor: p.color + '15' } : {}}>
                <div className="flex items-center gap-2">
                  <span>{p.icon}</span>
                  <div>
                    <div className="text-white text-xs font-bold">{p.abbreviation}</div>
                    <div className="text-gray-500 text-xs">{p.location.split(' ')[0]}</div>
                  </div>
                </div>
                <div className="text-xs mt-1" style={{ color: p.color }}>{p.elements.split('+')[0].trim()}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">{selected.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <div className="text-sm font-mono" style={{ color: selected.color }}>{selected.elements}</div>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Location</div>
                  <div className="text-gray-300 text-sm">{selected.location}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Temperature</div>
                  <div className="text-white font-mono">{selected.temperature}</div>
                </div>
                <div className="bg-gray-900/50 rounded p-3">
                  <div className="text-gray-500 text-xs uppercase mb-1">Energy Rate</div>
                  <div className="text-gray-300 text-xs font-mono">{selected.energyRate}</div>
                </div>
                <div className="bg-red-900/20 rounded p-3 border border-red-800/30">
                  <div className="text-red-400 text-xs uppercase mb-1">Key Fact</div>
                  <div className="text-gray-300 text-xs">{selected.key}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'isotopes' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-gray-800/60 rounded-xl p-4">
            Radioactive isotopes produced in stars are cosmic chronometers and tracers. Their detection in meteorites, lunar samples, ocean sediments, and stellar spectra reveals stellar nucleosynthesis in action and timestamps cosmic events.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cosmicIsotopes.map(iso => (
              <div key={iso.name} className="bg-gray-800/60 rounded-xl p-4 border-l-4" style={{ borderColor: iso.color }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-3xl font-bold font-mono" style={{ color: iso.color }}>{iso.symbol}</div>
                  <div>
                    <div className="text-white font-bold">{iso.name}</div>
                    <div className="text-gray-400 text-xs">t½ = {iso.halfLife}</div>
                  </div>
                  <div className="ml-auto text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">{iso.decayMode}</div>
                </div>
                <div className="text-gray-500 text-xs mb-2">Production: {iso.production}</div>
                <div className="bg-gray-900/50 rounded p-2 text-xs text-gray-300">{iso.application}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'reactions' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-gray-800/60 rounded-xl p-4">
            Nuclear reaction rates in stellar interiors are measured using underground accelerator labs (LUNA in Italy, CASPAR in the US) to eliminate cosmic ray background. Many key rates are still uncertain at the required astrophysical energies (Gamow window).
          </p>
          <div className="space-y-4">
            {keyReactions.map(r => (
              <div key={r.reaction} className="bg-gray-800/60 rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="bg-red-900/30 rounded-lg px-3 py-2 font-mono text-red-300 text-sm border border-red-800/40">{r.reaction}</div>
                  <div>
                    <div className="text-white text-sm font-semibold">{r.energy}</div>
                    <div className="text-gray-500 text-xs">{r.rate}</div>
                  </div>
                </div>
                <p className="text-gray-300 text-sm">{r.importance}</p>
              </div>
            ))}
          </div>

          <div className="bg-red-900/20 rounded-xl p-4 border border-red-800/40">
            <h4 className="text-white font-bold mb-2 text-sm">The Gamow Window</h4>
            <p className="text-gray-300 text-sm">Stars fuse nuclei at temperatures far below what classical physics would require to overcome the Coulomb barrier. Quantum tunneling allows reactions at much lower energies — the "Gamow window" is the narrow energy range where quantum tunneling probability and Maxwell-Boltzmann distribution overlap. Measuring reactions at Gamow energies requires underground labs to suppress cosmic ray backgrounds.</p>
          </div>
        </div>
      )}
    </div>
  )
}
