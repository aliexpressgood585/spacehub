import { useState } from 'react'

interface QuantumPhenomenon {
  id: string
  name: string
  principle: string
  icon: string
  color: string
  shortDesc: string
  explanation: string
  astronomicalRole: string
  evidence: string
  mindBlow: string
  equation?: string
}

const PHENOMENA: QuantumPhenomenon[] = [
  {
    id: 'tunneling',
    name: 'Quantum Tunneling',
    principle: 'Wave-particle duality',
    icon: '🌊',
    color: '#3b82f6',
    shortDesc: 'Particles pass through barriers that classical physics says are impassable',
    explanation: 'In quantum mechanics, particles aren\'t point objects — they have wave functions describing their probability distribution. A particle approaching a barrier has some probability of being found on the other side, even without enough energy to classically surmount it. The wave function "leaks through" the barrier.',
    astronomicalRole: 'Quantum tunneling is ESSENTIAL for stellar fusion. In the Sun\'s core, protons need to fuse but their thermal energies are ~1,000× too low to overcome the electrostatic repulsion classically. Tunneling allows protons to penetrate the Coulomb barrier at temperatures ~100× lower than classical physics requires. Without quantum tunneling, stars would not shine — the Sun would be cold.',
    evidence: 'Alpha decay rates in radioactive nuclei are quantitatively explained by tunneling (Gamow, 1928). Stellar fusion rates calculated from tunneling match observed solar luminosity. STM (scanning tunneling microscopes) use tunneling to image individual atoms.',
    mindBlow: 'Every photon of sunlight reaching your skin was enabled by quantum tunneling that occurred 8 minutes ago in the Sun\'s core. Without a quantum effect that has no classical analogue, there would be no sunlight, no warmth, no life.',
    equation: 'P ∝ e^(-2γ) where γ = (2m(V-E))^½ d/ℏ'
  },
  {
    id: 'pauli',
    name: 'Pauli Exclusion Principle',
    principle: 'Fermion statistics',
    icon: '🔴',
    color: '#ef4444',
    shortDesc: 'No two identical fermions can occupy the same quantum state',
    explanation: 'Wolfgang Pauli (1925) discovered that fermions (particles with half-integer spin: electrons, protons, neutrons) obey strict quantum statistics — no two identical fermions can have the same complete set of quantum numbers simultaneously. They generate a repulsive "degeneracy pressure" when forced into the same quantum state.',
    astronomicalRole: 'Electron degeneracy pressure supports white dwarf stars against gravitational collapse — even at absolute zero. This quantum pressure halts collapse at ~Earth\'s size for stellar remnants up to 1.4 M☉ (Chandrasekhar limit). Neutron degeneracy pressure similarly supports neutron stars. Without Pauli exclusion, all matter would collapse to nuclear density instantly.',
    evidence: 'White dwarf properties precisely match predictions. The Chandrasekhar limit (1.44 M☉) calculated from Pauli exclusion matches observations perfectly. Type Ia supernovae occur exactly at this limit (hence their standard brightness). Neutron star masses are bounded by a similar neutron degeneracy limit.',
    mindBlow: 'The chair you\'re sitting on supports your weight because of Pauli exclusion — electrons in the chair\'s atoms refuse to occupy the same states as electrons in your body, creating a quantum repulsion force. You never actually touch anything; you\'re always separated by Pauli exclusion.',
    equation: 'P_deg ≈ (ℏ²/5m_e)(3π²)^(2/3) n^(5/3) (non-relativistic)'
  },
  {
    id: 'uncertainty',
    name: 'Heisenberg Uncertainty Principle',
    principle: 'Quantum measurement limits',
    icon: '❓',
    color: '#f59e0b',
    shortDesc: 'Position and momentum cannot both be precisely known simultaneously',
    explanation: 'Werner Heisenberg (1927): the uncertainty in position (Δx) times the uncertainty in momentum (Δp) is always ≥ ℏ/2. This is not a limitation of measurement technology — it\'s a fundamental property of nature. The more precisely you know a particle\'s position, the less you can know about its momentum, and vice versa.',
    astronomicalRole: 'Heisenberg uncertainty prevents matter from collapsing to a mathematical point. Confining an electron to a tiny volume forces it to have a large momentum spread, generating kinetic energy that resists further confinement. This "zero-point energy" means even at absolute zero, particles are never completely still. It stabilizes atomic orbitals and prevents matter from collapsing. Also: vacuum energy (quantum foam) from uncertainty contributes to dark energy.',
    evidence: 'Atomic orbital structure (why electrons don\'t spiral into the nucleus). Zero-point energy measured in Casimir effect (1997). Josephson junctions in superconductors. Laser line widths. Vacuum energy has been measured; its magnitude (vs. dark energy) is a major unsolved problem in physics.',
    mindBlow: 'Virtual particle pairs constantly pop into existence from the vacuum because Heisenberg uncertainty allows energy borrowing ΔE · Δt ≈ ℏ — as long as they annihilate quickly enough. Near a black hole\'s event horizon, one of these virtual particles can escape (becoming real), with the other falling in — this is Hawking radiation.',
    equation: 'Δx · Δp ≥ ℏ/2'
  },
  {
    id: 'hawking',
    name: 'Hawking Radiation',
    principle: 'Quantum field theory in curved spacetime',
    icon: '⚫',
    color: '#a855f7',
    shortDesc: 'Black holes slowly evaporate by emitting thermal radiation via quantum effects',
    explanation: 'Stephen Hawking (1974) showed that black holes emit radiation through a quantum process at their event horizons. Near the horizon, virtual particle pairs form from vacuum fluctuations. If one falls in while the other escapes, the escaping particle carries energy away from the black hole. From a distant observer\'s perspective, the black hole radiates thermally at the Hawking temperature.',
    astronomicalRole: 'A stellar black hole (10 M☉) has a Hawking temperature of ~6 × 10⁻⁹ K — far colder than the CMB (2.725 K), so it actually gains mass from CMB photons. Only primordial black holes smaller than ~10¹¹ kg (asteroid mass) would have evaporated by now. At the end of the universe (~10^67 years), all black holes will evaporate, leaving only photons and leptons.',
    evidence: 'Hawking radiation has never been directly detected from real black holes (signal far too weak). Analog experiments using sound waves in flowing fluids (acoustic black holes) have demonstrated the equivalent — Steinhauer (2016). It remains one of the most important theoretical predictions connecting QM and GR.',
    mindBlow: 'When a black hole evaporates, what happens to the information about everything that fell in? Hawking initially said the information is destroyed — violating quantum mechanics. This sparked 30 years of debate. Current consensus (Page curve) suggests information is preserved but scrambled, emerging via subtle correlations in late Hawking radiation.',
    equation: 'T_H = ℏc³ / (8πGMk_B)'
  },
  {
    id: 'entanglement',
    name: 'Quantum Entanglement',
    principle: 'Non-local correlations',
    icon: '🔗',
    color: '#22c55e',
    shortDesc: 'Particles share correlated quantum states regardless of separation distance',
    explanation: 'When two particles interact and become entangled, their quantum states are correlated in ways that can\'t be explained classically. Measuring one particle instantly affects the probability distribution of the other, regardless of distance. Einstein called this "spooky action at a distance" and thought it proved QM was incomplete. Bell\'s theorem (1964) and subsequent experiments proved Einstein wrong — entanglement is real.',
    astronomicalRole: 'Entanglement appears in: (1) Photosynthesis efficiency — quantum coherence in chloroplasts helps transfer energy near perfectly; (2) Bird navigation — radical pairs in cryptochrome proteins, possibly entangled, detect Earth\'s magnetic field; (3) Black hole information paradox — entanglement between Hawking radiation and black hole interior may resolve the paradox; (4) Quantum cosmology — early universe entanglement between inflationary modes may be encoded in CMB correlations.',
    evidence: 'Bell inequality violations demonstrated experimentally (Aspect 1982, Zeilinger 2022 — Nobel Prize). China\'s Micius satellite demonstrated entanglement over 1,200 km (2017). IBM, Google quantum computers routinely create entangled qubits.',
    mindBlow: 'The CMB\'s temperature correlations across opposite sides of the sky may encode quantum entanglement from the inflationary epoch — meaning the entire observable universe\'s structure traces back to quantum entanglement in the first 10⁻³² seconds.',
    equation: '|Ψ⟩ = (|↑⟩₁|↓⟩₂ - |↓⟩₁|↑⟩₂) / √2'
  },
  {
    id: 'decoherence',
    name: 'Quantum Decoherence in Supernovae',
    principle: 'Quantum-to-classical transition',
    icon: '💥',
    color: '#f97316',
    shortDesc: 'Neutrino quantum oscillations influence supernova explosion dynamics',
    explanation: 'Quantum superposition breaks down when systems interact with their environment — this "decoherence" explains why large objects seem classical. In astrophysics, neutrino flavor oscillations (quantum superpositions of different neutrino types) and quantum effects in hot dense matter profoundly affect stellar physics and explosion dynamics.',
    astronomicalRole: 'In core-collapse supernovae, 3 × 10⁵³ J is released — 99% as neutrinos — in 10 seconds. These neutrinos propagate as quantum superpositions of flavors (electron, muon, tau neutrinos), and the dense neutrino gas collectively oscillates in a phenomenon called "neutrino collective oscillations" — a purely quantum effect with no classical analogue. This may be crucial for driving the supernova explosion and for nucleosynthesis of heavy elements (r-process).',
    evidence: 'Neutrino oscillations confirmed by Super-Kamiokande (1998, Nobel 2015) and SNO (2001, Nobel 2015). SN 1987A neutrino detection at Kamiokande, IMB, and Baksan — 12 neutrinos detected over 13 seconds, confirming the basic picture. Collective neutrino oscillations: active research area.',
    mindBlow: 'The gold in your jewelry and the uranium in nuclear reactors were both forged in the r-process during a supernova, where quantum neutrino oscillations created the extreme neutron flux needed to build these heavy elements. Quantum mechanics literally cooked the elements from which you\'re made.',
  },
  {
    id: 'casimir',
    name: 'Casimir Effect & Vacuum Energy',
    principle: 'Zero-point energy of quantum fields',
    icon: '⚡',
    color: '#06b6d4',
    shortDesc: 'Empty space exerts measurable pressure due to quantum vacuum fluctuations',
    explanation: 'Quantum field theory predicts that even in "empty" vacuum, fields fluctuate with zero-point energy. Between two close metal plates, the allowed wavelengths of electromagnetic modes are restricted compared to outside — creating a net inward pressure. This Casimir effect is a measurable consequence of vacuum energy. The vacuum is not empty; it\'s a sea of quantum fluctuations.',
    astronomicalRole: 'Vacuum energy (dark energy) drives the accelerating expansion of the universe. Quantum field theory predicts a vacuum energy density of ~10⁹⁶ kg/m³; the observed dark energy density is ~10⁻²⁷ kg/m³ — off by 10¹²³ — the worst prediction in physics. This "cosmological constant problem" is the deepest unsolved problem linking quantum mechanics to cosmology.',
    evidence: 'Casimir force measured experimentally by Lamoreaux (1997) with 1% precision. Dark energy\'s existence confirmed by supernova surveys (1998). The vacuum energy density\'s extreme fine-tuning (why is it not 10¹²³ times bigger?) remains mysterious.',
    mindBlow: 'The same quantum vacuum that drives your computer chips\' quantum effects is also driving the universe\'s accelerating expansion. If vacuum energy were 10¹²³× stronger (as naive QFT predicts), the universe would have expanded to infinite size in the first fraction of a second after the Big Bang — no galaxies, no stars, no us.',
  },
]

export default function QuantumInSpace() {
  const [selected, setSelected] = useState<QuantumPhenomenon>(PHENOMENA[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Quantum Mechanics in the Cosmos</h2>
      <p className="text-gray-400 text-sm mb-5">How the bizarre rules of quantum physics secretly run the universe — from stellar fusion to black hole evaporation</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Phenomenon list */}
        <div className="space-y-1.5">
          {PHENOMENA.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.id === p.id ? p.color + '15' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.id === p.id ? p.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{p.icon}</span>
                <div className="font-semibold text-sm" style={{ color: selected.id === p.id ? p.color : '#e2e8f0' }}>{p.name}</div>
              </div>
              <div className="text-gray-500 text-xs ml-7">{p.principle}</div>
              <div className="text-gray-400 text-xs ml-7 mt-0.5 line-clamp-1">{p.shortDesc}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-3">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{selected.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <div className="text-sm" style={{ color: selected.color }}>{selected.principle}</div>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.shortDesc}</p>
            {selected.equation && (
              <div className="mt-3 bg-black/30 rounded-lg px-4 py-2 font-mono text-sm" style={{ color: selected.color }}>
                {selected.equation}
              </div>
            )}
          </div>

          {/* What it is */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">The Quantum Effect</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.explanation}</p>
          </div>

          {/* Role in astronomy */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Role in the Universe</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.astronomicalRole}</p>
          </div>

          {/* Evidence */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Experimental Evidence</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.evidence}</p>
          </div>

          {/* Mind blow */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}25` }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>Reality-Breaking Implication</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.mindBlow}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
