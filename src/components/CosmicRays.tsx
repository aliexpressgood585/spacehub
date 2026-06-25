import { useState } from 'react'

interface RayType {
  id: string
  name: string
  energy: string
  energyJoules: string
  icon: string
  color: string
  composition: string
  source: string
  fluxRate: string
  detectionMethod: string
  biologicalEffect: string
  earthProtection: string
  wouldFeelIt: boolean
  funFact: string
}

const RAY_TYPES: RayType[] = [
  {
    id: 'galactic',
    name: 'Galactic Cosmic Rays (GCR)',
    energy: '10⁸ – 10²⁰ eV',
    energyJoules: '10⁻¹¹ – 16 J',
    icon: '⚡',
    color: '#a855f7',
    composition: '~90% protons, ~9% alpha particles (helium nuclei), ~1% heavier nuclei (iron, nickel), ~1% electrons',
    source: 'Believed to originate from supernova remnants throughout the Milky Way (for energies <10¹⁵ eV). The highest-energy GCRs may come from extragalactic sources — active galactic nuclei, gamma-ray bursts.',
    fluxRate: '~1 particle per cm² per second at Earth\'s surface (all energies combined)',
    detectionMethod: 'Extensive Air Shower (EAS) arrays detect the "rain" of secondary particles (pions, muons, electrons) produced when a GCR hits the upper atmosphere. IceCube Neutrino Observatory (South Pole) detects associated neutrinos.',
    biologicalEffect: 'At Earth\'s surface, residual GCR muons are harmless background. In space (no atmospheric shielding): serious DNA damage risk over long missions. Mars astronauts would receive ~300 mSv/year from GCR alone (NASA limit is 1,000 mSv lifetime). High-Z particles ("HZE ions") like iron nuclei are most biologically damaging — they travel straight through cells leaving linear tracks of damage.',
    earthProtection: 'Earth\'s atmosphere (equivalent to 10 m of water shielding) + magnetosphere deflects lower-energy particles. At sea level, exposure is ~0.3 mSv/year. At cruise altitude (12 km), ~2 mSv/year.',
    wouldFeelIt: false,
    funFact: 'The "Oh-My-God" particle (1991, Utah) was a single cosmic ray with energy of 3 × 10²⁰ eV — roughly equal to a baseball thrown at 60 mph. It was a single proton moving at 99.99999999999999999999951% of the speed of light. Nothing in our Galaxy should be able to accelerate a particle to that energy — it still defies explanation.'
  },
  {
    id: 'solar',
    name: 'Solar Energetic Particles (SEP)',
    energy: '10⁶ – 10¹⁰ eV (MeV to GeV)',
    energyJoules: '10⁻¹³ – 10⁻⁹ J',
    icon: '☀️',
    color: '#f97316',
    composition: 'Mostly protons and alpha particles from the Sun; electrons and heavier ions during major events',
    source: 'Solar flares and Coronal Mass Ejections (CMEs). Major solar particle events (SPE) occur during solar maximum (~11-year solar cycle). The Carrington Event (1859) would produce a particle event capable of giving an unshielded astronaut a lethal dose.',
    fluxRate: 'Variable — background of ~10 particles/cm²/s; during a major SPE, can spike to millions/cm²/s over hours',
    detectionMethod: 'NOAA SWPC monitors with GOES satellite detectors. ~20-30 minutes warning time after a flare before particles arrive. Real-time alerts sent to ISS crew.',
    biologicalEffect: 'Major SPE can deliver lethal doses to unshielded astronauts in hours. A single large event could give a suited astronaut 1-10 Sv — well above the ~3-5 Sv acute lethal dose. Apollo 16 astronauts were on the Moon just months before a major SPE in August 1972 that would have been potentially fatal.',
    earthProtection: 'Magnetosphere deflects most SEPs except near the poles (where magnetic field lines funnel particles down — causing auroras). During a Carrington-class event, particles reach mid-latitudes.',
    wouldFeelIt: false,
    funFact: 'In August 1972, the Sun unleashed one of the largest solar particle events ever recorded — directly between the Apollo 16 and Apollo 17 missions. If it had occurred during a lunar EVA, astronauts would have received potentially lethal doses within hours. NASA had no real-time space weather warning systems at the time.'
  },
  {
    id: 'vhe',
    name: 'Very High Energy Cosmic Rays',
    energy: '10¹⁸ – 10²⁰ eV (EeV range)',
    energyJoules: '0.16 – 16 J',
    icon: '💥',
    color: '#ef4444',
    composition: 'Unknown at these energies — possibly heavy nuclei (iron), possibly exotic particles. The composition debate is ongoing.',
    source: 'Must come from extragalactic sources (particles above 6 × 10¹⁹ eV — the GZK cutoff — lose energy interacting with CMB photons and can only travel ~160 Mpc before becoming detectable energies). Likely: blazars (active galactic nuclei with jets pointing at us), gamma-ray bursts, galaxy clusters.',
    fluxRate: 'Extremely rare — at 10²⁰ eV, roughly 1 particle per km² per century',
    detectionMethod: 'Pierre Auger Observatory (Argentina): 3,000 km² of water Cherenkov detectors + fluorescence telescopes. Detects the enormous air showers — 10¹⁰ particles spread over tens of km² — produced by a single ultra-high-energy cosmic ray.',
    biologicalEffect: 'In space: at these energies, a single particle could potentially ionize a significant track through tissue. However, they\'re so rare (1 per km² per century) that the probability of a single one hitting a human is astronomically small.',
    earthProtection: 'The atmosphere provides equivalent shielding to 10 m of water — but it can\'t stop the highest-energy particles. They produce air showers that are detectable at ground level. The shower from one Oh-My-God particle covered hundreds of km².',
    wouldFeelIt: false,
    funFact: 'The Telescope Array in Utah (2023) detected "Amaterasu" — a cosmic ray with energy 2.4 × 10²⁰ eV. It came from a void in space — an empty region with no obvious source that could accelerate particles to that energy. This is one of the deepest mysteries in astrophysics: what produced it and where?'
  },
  {
    id: 'muons',
    name: 'Secondary Muons (Cosmic Ray Byproducts)',
    energy: '1–100 GeV',
    energyJoules: '~10⁻¹⁰ J each',
    icon: '🌧️',
    color: '#06b6d4',
    composition: 'Muons — heavy electrons (207× mass of electron). Produced when cosmic ray protons hit atmospheric nitrogen/oxygen nuclei at 10-15 km altitude.',
    source: 'Secondary particles from cosmic ray air showers. One primary GCR hitting the upper atmosphere produces a cascade of pions → muons + neutrinos.',
    fluxRate: '~1 muon per cm² per minute at sea level (10,000 per m² per second)',
    detectionMethod: 'Detected by scintillator detectors, cloud chambers, and specialized muon tomography systems. You can build a cosmic ray detector with a shoebox and a few electronic components.',
    biologicalEffect: 'At sea level, muons deliver ~0.3 mSv/year — a small but real contribution to background radiation. Muon tomography can scan inside volcanoes and pyramids (the Scan Pyramids project found hidden chambers inside the Great Pyramid using muons in 2017).',
    earthProtection: 'Despite atmospheric shielding, muons are so energetic they penetrate to sea level and even into mines. They\'re so penetrating that they\'re used to image large structures from the outside.',
    wouldFeelIt: false,
    funFact: 'Right now, roughly 10,000 cosmic ray muons are passing through your body every minute. They\'re so weakly interacting that almost none of them deposit energy in your DNA — but statistically, one or two per year may ionize a cell. You are a muon detector. The fact that you can read this sentence means you survived all the muons so far.'
  },
]

const FACTS = [
  { icon: '🌍', label: 'At sea level dose', value: '0.3 mSv/yr', sub: 'from cosmic rays' },
  { icon: '✈️', label: 'Airline pilot dose', value: '2–5 mSv/yr', sub: '6× sea level' },
  { icon: '🛸', label: 'ISS astronaut', value: '~150 mSv/yr', sub: '500× sea level' },
  { icon: '🔴', label: 'Mars surface', value: '~300 mSv/yr', sub: 'GCR + atmosphere' },
  { icon: '🌙', label: 'Lunar surface', value: '~380 mSv/yr', sub: 'no magnetosphere' },
  { icon: '🚀', label: 'Deep space transit', value: '~600 mSv/yr', sub: 'no magnetosphere' },
]

export default function CosmicRays() {
  const [selected, setSelected] = useState<RayType>(RAY_TYPES[0])
  const [showDetector, setShowDetector] = useState(false)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Rays</h2>
      <p className="text-gray-400 text-sm mb-5">The most energetic particles in the universe rain down on Earth constantly — invisible, unstoppable, and occasionally carrying more energy than a fastball</p>

      {/* Dose exposure table */}
      <div className="mb-5 bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Radiation Exposure: From Earth to Deep Space</div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {FACTS.map(f => (
            <div key={f.label} className="text-center bg-gray-900/60 rounded-lg p-2">
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="font-bold text-xs text-white">{f.value}</div>
              <div className="text-gray-600 text-[10px]">{f.sub}</div>
              <div className="text-gray-500 text-[9px] mt-0.5">{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Ray type selector */}
        <div className="space-y-2">
          {RAY_TYPES.map(ray => (
            <button
              key={ray.id}
              onClick={() => setSelected(ray)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === ray.id ? ray.color + '18' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === ray.id ? ray.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{ray.icon}</span>
                <div className="font-semibold text-sm" style={{ color: selected.id === ray.id ? ray.color : '#e2e8f0' }}>{ray.name}</div>
              </div>
              <div className="ml-8 text-gray-500 text-xs">{ray.energy}</div>
            </button>
          ))}

          <div className="mt-4 bg-gray-800/40 rounded-xl p-3 border border-gray-700/30">
            <button
              onClick={() => setShowDetector(v => !v)}
              className="w-full text-left"
            >
              <div className="text-indigo-400 text-xs font-semibold mb-1">🔬 DIY Cosmic Ray Detector</div>
              <div className="text-gray-500 text-xs">Click to expand</div>
            </button>
            {showDetector && (
              <div className="mt-2 text-gray-400 text-xs space-y-1 leading-relaxed">
                <p>Build a scintillator detector:</p>
                <p>1. Scintillator plastic sheet (LYSO or BC-408)</p>
                <p>2. Silicon photomultiplier (SiPM)</p>
                <p>3. Arduino Nano + ADC</p>
                <p>4. A flash of light per muon = cosmic ray detected</p>
                <p className="text-gray-500">~$50 total. Cosmic Watch project has full instructions online.</p>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <div className="text-sm font-mono" style={{ color: selected.color }}>{selected.energy}</div>
                <div className="text-gray-500 text-xs">{selected.energyJoules} per particle</div>
              </div>
            </div>
            <div className="text-gray-400 text-xs uppercase font-semibold mb-1">Composition</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.composition}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Origin / Source</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.source}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-1">Flux at Earth</div>
              <p className="text-gray-300 text-xs leading-relaxed">{selected.fluxRate}</p>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-1">Detection</div>
              <p className="text-gray-300 text-xs leading-relaxed">{selected.detectionMethod}</p>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-red-400 text-xs uppercase font-semibold mb-2">Biological & Health Effects</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.biologicalEffect}</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Earth's Protection</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.earthProtection}</p>
          </div>

          <div className="bg-amber-900/20 rounded-xl p-4 border border-amber-800/30">
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">😲 Mind-Blowing Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
