import { useState } from 'react'

interface Epoch {
  id: string
  name: string
  time: string
  timeSI: string
  temp: string
  color: string
  icon: string
  what: string
  physics: string
  evidence: string
  wow: string
}

const EPOCHS: Epoch[] = [
  {
    id: 'planck',
    name: 'Planck Epoch',
    time: '0 → 10⁻⁴³ seconds',
    timeSI: '10⁻⁴³ s',
    temp: '> 10³² K',
    color: '#ef4444',
    icon: '♾️',
    what: 'The universe begins — or rather, the moment before which our physics breaks down entirely. All four fundamental forces (gravity, electromagnetism, strong nuclear, weak nuclear) are unified into one single superforce.',
    physics: 'General relativity and quantum mechanics both fail at this scale. The Planck length (1.6 × 10⁻³⁵ m) is the smallest meaningful distance. No known theory — not string theory, not loop quantum gravity — can fully describe this epoch.',
    evidence: 'No direct evidence possible. This regime is beyond any conceivable experiment. We infer its existence only by extrapolating known physics backward.',
    wow: 'The entire observable universe — 93 billion light-years across — was compressed into a space smaller than a proton. Probably smaller than anything we have words for.'
  },
  {
    id: 'gut',
    name: 'Grand Unification Epoch',
    time: '10⁻⁴³ → 10⁻³⁶ seconds',
    timeSI: '10⁻³⁶ s',
    temp: '10²⁷ – 10³² K',
    color: '#f97316',
    icon: '⚡',
    what: 'Gravity splits from the unified force. Three forces remain unified: electromagnetism, strong nuclear, and weak nuclear — the GUT (Grand Unified Theory) force. The universe is a quark-gluon plasma of extraordinary density.',
    physics: 'Grand Unified Theories predict that protons eventually decay — with a half-life of > 10³⁴ years. Experiments searching for proton decay (Super-Kamiokande) test these theories. So far: no proton decay observed, constraining which GUT models survive.',
    evidence: 'Proton decay experiments at Super-Kamiokande, IceCube. Cosmic background radiation patterns encode echoes of conditions at this time.',
    wow: 'If GUT theories are correct, every proton in your body is slowly decaying — but with a half-life 10²⁴ times the age of the universe, none will decay in your lifetime (or in the Sun\'s lifetime).'
  },
  {
    id: 'inflation',
    name: 'Cosmic Inflation',
    time: '10⁻³⁶ → 10⁻³² seconds',
    timeSI: '10⁻³² s',
    temp: '~10²⁷ K',
    color: '#a855f7',
    icon: '💨',
    what: 'The universe undergoes exponential expansion — doubling in size at least 60 times in a tiny fraction of a second. A region smaller than a proton inflates to a sphere larger than a grapefruit (though still microscopic by everyday standards).',
    physics: 'Inflation solves three cosmological puzzles: (1) the Flatness problem — why is the universe so geometrically flat? (2) the Horizon problem — why is the CMB temperature the same everywhere? (3) the Monopole problem — why are there no magnetic monopoles? Tiny quantum fluctuations during inflation became the seeds of all galaxies.',
    evidence: 'The CMB is incredibly uniform (1 part in 100,000) across regions that couldn\'t have communicated — inflation explains why. The pattern of CMB fluctuations (Planck satellite data) precisely matches inflationary predictions. Primordial gravitational waves (B-mode polarization) would confirm inflation — BICEP/Keck arrays search for them.',
    wow: 'Every galaxy in the observable universe — including our Milky Way — grew from quantum fluctuations during inflation. You exist because quantum randomness amplified during inflation seeded density variations that eventually collapsed into stars.'
  },
  {
    id: 'electroweak',
    name: 'Electroweak Epoch',
    time: '10⁻³² → 10⁻¹² seconds',
    timeSI: '10⁻¹² s',
    temp: '10¹⁵ – 10²⁷ K',
    color: '#8b5cf6',
    icon: '⚛️',
    what: 'The strong nuclear force separates. Electromagnetism and the weak nuclear force remain unified as the electroweak force. Quarks, leptons, and gauge bosons all exist but the Higgs field hasn\'t yet given mass to particles.',
    physics: 'At 10⁻¹² s, the electroweak symmetry breaks — the Higgs field "freezes" and particles acquire mass. This is the Higgs mechanism discovered by Peter Higgs (and 5 others) in 1964. The Higgs boson was confirmed by CERN\'s LHC in 2012, completing the Standard Model.',
    evidence: 'The Higgs boson discovered at the LHC (ATLAS and CMS experiments, July 4, 2012 — one of the biggest physics announcements in history). W and Z bosons discovered at CERN in 1983.',
    wow: 'The Higgs boson discovery confirmed that a field permeating all of space gives mass to all matter. Without the Higgs field, quarks and electrons would be massless and travel at light speed — no atoms, no chemistry, no us.'
  },
  {
    id: 'quark',
    name: 'Quark Epoch',
    time: '10⁻¹² → 10⁻⁶ seconds',
    timeSI: '10⁻⁶ s',
    temp: '10¹² – 10¹⁵ K',
    color: '#3b82f6',
    icon: '🔵',
    what: 'The universe is a dense quark-gluon plasma. Quarks and gluons exist freely — not yet confined inside protons and neutrons. A slight asymmetry: for every 1 billion antiquarks, there are 1,000,000,001 quarks. This asymmetry is why matter dominates the universe.',
    physics: 'CP violation — a subtle asymmetry in how matter and antimatter behave — created the imbalance. The Standard Model predicts some CP violation (CKM matrix), but not enough to explain the observed matter-antimatter asymmetry. This is one of the biggest unsolved problems in physics: where did all the antimatter go?',
    evidence: 'Quark-gluon plasma recreated at CERN\'s LHC and Brookhaven\'s RHIC by colliding heavy ions at near-light speed. The matter-antimatter asymmetry (baryon asymmetry) is observed throughout the universe.',
    wow: 'If the Big Bang had created perfectly equal amounts of matter and antimatter, everything would have annihilated and the universe would contain only photons — no atoms, no planets, no life. We exist because of one extra quark per billion.'
  },
  {
    id: 'hadron',
    name: 'Hadron Epoch',
    time: '10⁻⁶ → 1 second',
    timeSI: '1 s',
    temp: '10⁹ – 10¹² K',
    color: '#06b6d4',
    icon: '⚪',
    what: 'The universe cools enough for quarks to bind together into hadrons (protons and neutrons). Most matter-antimatter pairs annihilate, leaving one proton or neutron for every 10⁹ photons. This ratio (baryon-to-photon ratio) is measured precisely from the CMB.',
    physics: 'QCD (Quantum Chromodynamics) — the theory of the strong nuclear force — describes quark confinement. The proton\'s mass is mostly NOT from its quarks\' rest masses, but from the binding energy of gluons (E=mc²). Only 1% of the proton\'s mass comes from quark rest masses.',
    evidence: 'The baryon-to-photon ratio (6 × 10⁻¹⁰) precisely measured from CMB temperature fluctuations and Big Bang Nucleosynthesis. QCD confirmed in countless particle physics experiments.',
    wow: '99% of your body\'s mass doesn\'t come from the Higgs mechanism giving mass to quarks — it comes from the kinetic energy of quarks bouncing around inside protons, via E=mc². You are mostly made of pure energy that became matter.'
  },
  {
    id: 'lepton',
    name: 'Lepton Epoch',
    time: '1 → 10 seconds',
    timeSI: '10 s',
    temp: '~5 × 10⁹ K',
    color: '#22c55e',
    icon: '🟢',
    what: 'Leptons (electrons, positrons, neutrinos) dominate. Massive electron-positron annihilation occurs, leaving a tiny excess of electrons. Neutrinos decouple from matter and stream freely — the Cosmic Neutrino Background. Each cm³ of space today still contains ~336 relic neutrinos from this epoch.',
    physics: 'Neutrino decoupling occurs at ~2 MeV (about 2 seconds). After decoupling, neutrinos free-stream through the universe unchanged — the Cosmic Neutrino Background (CνB). These 1.95 K neutrinos pervade all of space but are nearly impossible to detect due to their low energy.',
    evidence: 'The CνB has not been directly detected yet (too low energy). N-body simulations of large-scale structure require exactly the right neutrino background to reproduce observed galaxy distributions. PTOLEMY experiment aims to directly detect relic neutrinos.',
    wow: 'Right now, 336 neutrinos from 1 second after the Big Bang are passing through every cubic centimeter of space — including through you. They are the oldest particles in the universe, and we\'ve never directly detected a single one of them.'
  },
  {
    id: 'nucleosynthesis',
    name: 'Big Bang Nucleosynthesis',
    time: '10 seconds → 20 minutes',
    timeSI: '20 min',
    temp: '10⁷ – 10⁹ K',
    color: '#f59e0b',
    icon: '🌟',
    what: 'The first atomic nuclei form! Protons and neutrons fuse to create hydrogen (75%), helium-4 (25%), traces of deuterium, helium-3, and lithium-7. This elemental recipe is the fingerprint of the Big Bang and one of our most precise tests of cosmology.',
    physics: 'The neutron-to-proton ratio at the start of BBN (1:7) determines the final helium abundance. This ratio was set by weak interactions (n ↔ p conversion) freezing out at ~1 MeV. The predicted abundances depend on only one parameter: the baryon density of the universe.',
    evidence: 'Observed deuterium abundance in pristine gas clouds at high redshift. Helium abundance in metal-poor stars and HII regions. Lithium problem: predicted Li-7 abundance is 3× higher than observed in oldest stars — an unresolved tension. CMB observations independently confirm BBN\'s baryon density.',
    wow: 'Every helium atom in a party balloon was created 20 minutes after the Big Bang. BBN finished in 20 minutes — before the universe was old enough to form a planet — and no new primordial elements were created after that.'
  },
  {
    id: 'recombination',
    name: 'Recombination & CMB',
    time: '380,000 years',
    timeSI: '380 kyr',
    temp: '~3,000 K',
    color: '#fbbf24',
    icon: '💡',
    what: 'Electrons and protons combine to form neutral hydrogen atoms. The universe becomes transparent — photons can travel freely for the first time. These first photons form the Cosmic Microwave Background (CMB), the oldest light we can observe, now cooled to 2.725 K.',
    physics: 'Before recombination, the universe was opaque plasma — photons scattered continuously off free electrons. After recombination, the universe became transparent. The CMB is a snapshot of the universe at 380,000 years — a "baby photo" of the cosmos. Temperature fluctuations of 1 in 100,000 encode the seeds of all large-scale structure.',
    evidence: 'CMB discovered by Penzias and Wilson (1965, Nobel Prize 1978). Mapped with unprecedented precision by COBE (1992), WMAP (2001), and Planck (2013-2018). The CMB\'s blackbody spectrum matches a 2.72548 ± 0.00057 K thermal source — the most perfect blackbody ever measured.',
    wow: 'Your microwave oven\'s magnetron produces photons similar to CMB photons (both are microwave radiation). The "snow" on old analog TVs was partly CMB photons. The background noise of the cosmos is detectable with a simple antenna.'
  },
  {
    id: 'dark_ages',
    name: 'Cosmic Dark Ages',
    time: '380,000 → 150 million years',
    timeSI: '150 Myr',
    temp: '~60 K → 3 K',
    color: '#1e293b',
    icon: '🌑',
    what: 'No light-emitting objects exist. Neutral hydrogen fills the universe, invisible to optical telescopes. Dark matter halos are slowly growing, pulling hydrogen gas inward. The universe is completely dark — no stars, no galaxies, just cooling gas and dark matter scaffolding.',
    physics: 'During the Dark Ages, 21-cm hydrogen emission (the spin-flip transition) provides the only observable signal. The 21-cm line at high redshift will be detected by instruments like the Square Kilometre Array (SKA) and EDGES. In 2018, EDGES claimed a detection of the Dark Ages 21-cm signal at z~17 — deeper than expected, potentially signaling dark matter interactions.',
    evidence: 'No direct observations of the Dark Ages exist. The 21-cm signal from this era is the target of current experiments. Ly-α forest in quasar spectra probes the transition out of the Dark Ages.',
    wow: 'For 150 million years, the universe was utterly dark and silent — no photons of light, no warmth, no stars. The cosmos was a cold, dark sea of hydrogen gas, patiently waiting for gravity to do its work.'
  },
  {
    id: 'reionization',
    name: 'Cosmic Dawn & Reionization',
    time: '150 million → 1 billion years',
    timeSI: '1 Gyr',
    temp: '~10,000 K (reionized)',
    color: '#6366f1',
    icon: '✨',
    what: 'The first stars ignite — Population III stars, 100–1,000 times more massive than the Sun, burning hydrogen and helium only (no metals). Their UV radiation reionizes the surrounding hydrogen. The first galaxies form. The universe lights up.',
    physics: 'Population III stars are theorized to be massive (some models: up to 1,000 M☉). They die as supernovae in millions of years, seeding space with the first heavy elements (carbon, oxygen, iron). The epoch of reionization (EoR) is the last major phase transition of the universe — from neutral to ionized hydrogen.',
    evidence: 'JWST is now directly observing galaxies from the Epoch of Reionization (z > 6-10, <1 billion years old). The CMB optical depth constrains when reionization ended. Quasar Gunn-Peterson troughs show the neutral hydrogen fraction at different epochs.',
    wow: 'JWST is right now imaging galaxies from just 200-400 million years after the Big Bang — near the beginning of Cosmic Dawn. We are watching the universe turn the lights on for the first time, from 13+ billion light-years away.'
  },
  {
    id: 'stellarage',
    name: 'Stellar Age — Peak Star Formation',
    time: '1 → 5 billion years',
    timeSI: '5 Gyr',
    temp: 'Galaxy-scale: millions K (stellar interiors)',
    color: '#f97316',
    icon: '⭐',
    what: 'Galaxies mature and merge. Star formation reaches its cosmic peak around 3 billion years after the Big Bang (z ≈ 2, "Cosmic Noon"). Second and third generation stars (Population I and II) form, enriched with metals from earlier supernovae. Our galaxy\'s thick disk forms.',
    physics: 'Star formation rate density peaked at z ≈ 2 (about 3 Gyr after Big Bang) — about 10× higher than today. Since then, the universe has been "winding down" in star formation. Dark energy is taking over, accelerating expansion, and diluting the gas available for new stars.',
    evidence: 'Galaxy surveys (SDSS, CANDELS, COSMOS) trace star formation rate across cosmic history. Stellar archaeology in our own galaxy reveals the history of the Milky Way\'s star formation. The "Main Sequence" of star-forming galaxies evolves with redshift.',
    wow: 'The universe was 10× more productive in its youth. If star formation rates had stayed at peak cosmic noon levels, the Milky Way would now have 10× more stars. The universe has already lived its most productive era.'
  },
  {
    id: 'solarsystem',
    name: 'Birth of Our Solar System',
    time: '9.2 billion years after Big Bang',
    timeSI: '4.6 Gyr ago',
    temp: '~50 K (protoplanetary disk outer edge)',
    color: '#fbbf24',
    icon: '☀️',
    what: 'A molecular cloud in the Milky Way — enriched by 5+ billion years of stellar evolution and supernova seeding — collapses under gravity. The Sun ignites at the center. A disk of gas and dust forms planets, asteroids, and comets within 100 million years.',
    physics: 'The protoplanetary disk was chemically stratified: rocky materials close to the Sun (terrestrial planets), gas giants beyond the frost line. Jupiter formed first, within 2-3 million years, and its gravity sculpted the outer solar system. The Grand Tack hypothesis: Jupiter migrated inward then outward, scattering asteroids into the inner solar system.',
    evidence: 'Radiometric dating of meteorites (oldest: 4.5682 Gyr old CAIs in Allende meteorite). Zircon crystals from Jack Hills, Australia: 4.404 Gyr old — oldest terrestrial material. Planet formation models reproduce solar system architecture.',
    wow: 'The calcium in your bones, the iron in your blood, the oxygen you breathe — all were forged in stars that lived and died before the Sun was born. You are stardust from at least 3 prior generations of stellar evolution.'
  },
  {
    id: 'now',
    name: 'Present Day — Accelerating Universe',
    time: '13.8 billion years',
    timeSI: 'Now',
    temp: '2.725 K (CMB), ~3 K (average)',
    color: '#22c55e',
    icon: '🌍',
    what: 'The universe is 13.8 billion years old. Dark energy dominates (68%), causing accelerating expansion. Stars still form, but at 1/10 the rate of Cosmic Noon. Galaxies are merging into larger structures. In 5 billion years, our Sun will become a red giant and engulf Earth.',
    physics: 'The "Hubble tension": local measurements (supernovae) give H₀ = 73 km/s/Mpc; CMB-based measurements give 67.4 km/s/Mpc. This 5σ discrepancy may indicate new physics beyond ΛCDM. Dark energy\'s nature remains completely unknown — it acts like Einstein\'s cosmological constant, but no one knows why it has the value it does.',
    evidence: 'DESI survey (2024) provides the most precise dark energy measurements. Dark energy was discovered in 1998 via Type Ia supernovae (Nobel Prize 2011). Euclid satellite launched 2023 to map dark energy with unprecedented precision.',
    wow: 'In 100 billion years, all galaxies beyond the Local Group will be too far away to see — expanding faster than light. Future civilizations will look out and see only their own galaxy in an otherwise empty, dark universe, with no evidence that other galaxies ever existed.'
  },
]

export default function BigBangTimeline() {
  const [selected, setSelected] = useState<Epoch>(EPOCHS[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Big Bang to Now</h2>
      <p className="text-gray-400 text-sm mb-5">The complete history of the universe — from 10⁻⁴³ seconds to 13.8 billion years — with the physics and evidence behind each epoch</p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Timeline column */}
        <div className="lg:col-span-1">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-4 bottom-4 w-px" style={{ background: 'linear-gradient(180deg, #ef4444, #22c55e)' }} />

            <div className="space-y-1">
              {EPOCHS.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => setSelected(ep)}
                  className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all relative"
                  style={{
                    background: selected.id === ep.id ? ep.color + '15' : 'transparent',
                    border: `1px solid ${selected.id === ep.id ? ep.color + '50' : 'transparent'}`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm z-10 relative"
                    style={{ background: ep.color + '20', border: `2px solid ${ep.color}60` }}
                  >
                    {ep.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold leading-tight" style={{ color: selected.id === ep.id ? ep.color : '#e2e8f0' }}>
                      {ep.name}
                    </div>
                    <div className="text-gray-600 text-xs mt-0.5 font-mono">{ep.timeSI}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detail column */}
        <div className="lg:col-span-3 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="text-sm font-mono mt-0.5" style={{ color: selected.color }}>{selected.time}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">Temperature</div>
                <div className="text-gray-200 text-xs font-mono font-medium">{selected.temp}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">Time marker</div>
                <div className="text-gray-200 text-xs font-mono font-medium">{selected.timeSI}</div>
              </div>
            </div>
          </div>

          {/* What happened */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What Happened</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.what}</p>
          </div>

          {/* Physics */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">The Physics</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.physics}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Evidence */}
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Evidence &amp; Observations</div>
              <p className="text-gray-300 text-sm leading-relaxed">{selected.evidence}</p>
            </div>

            {/* Wow fact */}
            <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}25` }}>
              <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>Mind-Bending Implication</div>
              <p className="text-gray-200 text-sm leading-relaxed">{selected.wow}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mt-5 bg-indigo-900/15 rounded-xl p-4 border border-indigo-800/25">
        <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">Scale of Time</div>
        <p className="text-gray-300 text-sm leading-relaxed">
          If the 13.8 billion year history of the universe were compressed into one calendar year: the Big Bang is January 1st, the Milky Way forms May 16th, the Solar System forms September 2nd, multi-cellular life appears December 5th, dinosaurs go extinct December 30th at 6 AM, all of recorded human history is the last 15 seconds of December 31st.
        </p>
      </div>
    </div>
  )
}
