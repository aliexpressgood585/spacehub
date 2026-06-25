import { useState, useMemo } from 'react'

interface GlossaryTerm {
  term: string
  category: string
  definition: string
  formula?: string
  related: string[]
}

const terms: GlossaryTerm[] = [
  { term: 'Absolute Magnitude', category: 'Stellar', definition: 'The intrinsic brightness of a celestial object — the apparent magnitude it would have if placed at a standard distance of 10 parsecs (32.6 ly) from Earth.', formula: 'M = m - 5·log₁₀(d/10)', related: ['Apparent Magnitude', 'Luminosity', 'Distance Modulus'] },
  { term: 'Accretion Disk', category: 'Physics', definition: 'A disk of gas and dust orbiting a massive central object (black hole, neutron star, protostar). Material spirals inward, converting gravitational potential energy to heat and radiation.', related: ['Black Hole', 'Quasar', 'Protoplanetary Disk'] },
  { term: 'Angular Resolution', category: 'Telescopes', definition: 'The smallest angular separation that a telescope can distinguish. Limited by diffraction (θ = 1.22λ/D) and atmospheric seeing. JWST achieves 0.1 arcsecond.', formula: 'θ = 1.22 λ/D', related: ['Diffraction', 'Interferometry', 'Seeing'] },
  { term: 'Astronomical Unit (AU)', category: 'Units', definition: 'The mean distance from Earth to the Sun: 149,597,870.7 km. Used as a convenient unit for solar system distances. 1 AU = 499 light-seconds.', formula: '1 AU = 1.496×10¹¹ m', related: ['Parsec', 'Light-year', 'Parallax'] },
  { term: 'Baryon', category: 'Physics', definition: 'Composite particles made of three quarks (protons, neutrons). Ordinary matter is baryonic. Baryons comprise only 5% of the total energy content of the universe.', related: ['Dark Matter', 'Nucleosynthesis', 'Quark'] },
  { term: 'Black Body Radiation', category: 'Physics', definition: 'Thermal electromagnetic radiation emitted by an idealized body in thermodynamic equilibrium. Stars approximate black bodies. Peak wavelength given by Wien\'s Law.', formula: 'λ_peak = 2.898×10⁻³/T (m)', related: ['Wien\'s Law', 'Stefan-Boltzmann Law', 'Planck Function'] },
  { term: 'Chandrasekhar Limit', category: 'Stellar', definition: 'Maximum mass a white dwarf can have while supported by electron degeneracy pressure: ~1.4 M☉. Above this, the star collapses to a neutron star or black hole.', formula: 'M_Ch ≈ 1.4 M☉', related: ['White Dwarf', 'Type Ia Supernova', 'Neutron Star'] },
  { term: 'Chromatic Aberration', category: 'Telescopes', definition: 'Optical defect where a lens focuses different wavelengths at different focal lengths, causing color fringing. Corrected by achromatic doublet lenses or reflector telescopes.', related: ['Refractor', 'Reflector', 'Apochromat'] },
  { term: 'Circumstellar Habitable Zone', category: 'Astrobiology', definition: 'The range of orbital distances around a star where liquid water can exist on a planet\'s surface under appropriate atmospheric conditions. Also called the "Goldilocks Zone."', related: ['Exoplanet', 'Biosignature', 'Transit Method'] },
  { term: 'Cosmic Microwave Background', category: 'Cosmology', definition: 'Thermal radiation from the epoch of recombination (~380,000 years after Big Bang) when electrons and protons combined into neutral atoms. Temperature 2.725 K today.', related: ['Big Bang', 'Recombination', 'Inflation'] },
  { term: 'Dark Energy', category: 'Cosmology', definition: 'Unknown form of energy causing the accelerating expansion of the universe. Comprises ~68% of total energy content. Characterized by equation of state w = p/ρc² ≈ −1.', related: ['Cosmological Constant', 'Dark Matter', 'Hubble Constant'] },
  { term: 'Declination', category: 'Coordinates', definition: 'The celestial equivalent of geographic latitude — angular distance north (+) or south (−) of the celestial equator, measured in degrees. Ranges from −90° (south pole) to +90°.', related: ['Right Ascension', 'Equatorial Coordinates', 'Celestial Equator'] },
  { term: 'Doppler Effect', category: 'Physics', definition: 'Apparent change in wavelength/frequency of a wave due to relative motion between source and observer. Redshift (recession) and blueshift (approach). Fundamental to measuring radial velocities.', formula: 'z = Δλ/λ = v/c (non-relativistic)', related: ['Redshift', 'Radial Velocity', 'Spectroscopy'] },
  { term: 'Eccentricity', category: 'Orbits', definition: 'A measure of how elongated an orbit is. e=0 is circular, 0<e<1 is elliptical, e=1 is parabolic, e>1 is hyperbolic. Earth\'s eccentricity is 0.017.', related: ['Semi-major Axis', 'Kepler\'s Laws', 'Conic Section'] },
  { term: 'Event Horizon', category: 'Black Holes', definition: 'The boundary around a black hole from within which no light or matter can escape. For a Schwarzschild BH: r_s = 2GM/c². Not a physical surface — a mathematical boundary.', formula: 'r_s = 2GM/c²', related: ['Schwarzschild Radius', 'Hawking Radiation', 'Singularity'] },
  { term: 'Flux', category: 'Measurements', definition: 'The power per unit area received from a source at a given distance. Related to luminosity by the inverse square law. Units: W/m² or Jy (Jansky) in radio.', formula: 'F = L/(4πd²)', related: ['Luminosity', 'Magnitude', 'Inverse Square Law'] },
  { term: 'Gravitational Lensing', category: 'Physics', definition: 'Bending of light by gravity, predicted by General Relativity. Strong lensing creates arcs/Einstein rings; weak lensing causes statistical shape distortions; microlensing detects compact objects.', related: ['General Relativity', 'Dark Matter', 'Einstein Ring'] },
  { term: 'Hertzsprung-Russell Diagram', category: 'Stellar', definition: 'A scatter plot of stars showing luminosity vs. surface temperature (or color). Most stars lie on the main sequence. Giant branches, white dwarf region, and instability strips are visible.', related: ['Main Sequence', 'Stellar Evolution', 'Spectral Type'] },
  { term: 'Hubble Constant (H₀)', category: 'Cosmology', definition: 'The current rate of expansion of the universe: v = H₀ × d. Measured to be ~67–73 km/s/Mpc, with a tension between CMB-based and distance ladder measurements.', formula: 'H₀ ≈ 70 km/s/Mpc', related: ['Redshift', 'Hubble Tension', 'Dark Energy'] },
  { term: 'Inclination', category: 'Orbits', definition: 'The angle between an orbital plane and a reference plane (e.g., ecliptic or equatorial). ISS at 51.6°, Polar orbits at ~90°, Retrograde > 90°.', related: ['Orbital Elements', 'Ecliptic', 'Argument of Periapsis'] },
  { term: 'Jeans Mass', category: 'Physics', definition: 'Critical mass below which a cloud is stable against gravitational collapse. Above Jeans Mass, gravity wins over thermal pressure. M_J ∝ T^(3/2)/ρ^(1/2).', formula: 'M_J ∝ T^1.5 ρ^-0.5', related: ['Star Formation', 'Molecular Cloud', 'Free-fall Time'] },
  { term: 'Kelvin', category: 'Units', definition: 'SI unit of temperature. Absolute zero (0 K = −273.15°C) is the minimum possible temperature. Space background temperature: 2.725 K. Solar corona: 10⁶ K.', formula: 'K = °C + 273.15', related: ['Boltzmann Constant', 'Blackbody', 'Thermal Radiation'] },
  { term: 'Lagrange Points', category: 'Orbits', definition: 'Five equilibrium positions in a two-body gravitational system where a small object can maintain a stable position. L4/L5 are stable, L1-L3 are unstable. JWST is at Earth-Sun L2.', related: ['Three-body Problem', 'Trojan Asteroids', 'Halo Orbit'] },
  { term: 'Light-year', category: 'Units', definition: 'The distance light travels in one Julian year in vacuum: 9.461×10¹⁵ m. The Andromeda Galaxy is 2.5 million light-years away. The observable universe is 93 billion ly in diameter.', formula: '1 ly = 9.461×10¹⁵ m', related: ['Parsec', 'Astronomical Unit', 'Speed of Light'] },
  { term: 'Magnitude Scale', category: 'Measurements', definition: 'Logarithmic scale of brightness. Each 5 magnitudes = factor 100 in brightness. Lower = brighter. Venus: −4.6, Sirius: −1.46, faintest naked-eye: +6.5, HST limit: +31.', formula: 'Δm = −2.5·log₁₀(F₂/F₁)', related: ['Flux', 'Absolute Magnitude', 'Photometry'] },
  { term: 'Nebula', category: 'Objects', definition: 'A cloud of gas and dust in space. Types include emission (ionized gas glowing), reflection (dust scattering starlight), dark (obscuring), supernova remnants, and planetary nebulae.', related: ['HII Region', 'Star Formation', 'ISM'] },
  { term: 'Parsec', category: 'Units', definition: 'Distance at which 1 AU subtends an angle of 1 arcsecond. 1 pc = 3.086×10¹⁶ m = 3.26 ly. Used for stellar and galactic distances. Mega- and Giga-parsecs for cosmology.', formula: '1 pc = 3.086×10¹⁶ m', related: ['Parallax', 'Astronomical Unit', 'Light-year'] },
  { term: 'Quasar', category: 'Objects', definition: 'Quasi-stellar object — extremely luminous active galactic nucleus powered by accretion onto a supermassive black hole (10⁸–10¹⁰ M☉). Most luminous persistent objects in the universe.', related: ['Active Galactic Nucleus', 'Supermassive Black Hole', 'Accretion Disk'] },
  { term: 'Redshift', category: 'Physics', definition: 'Increase in wavelength of electromagnetic radiation. Cosmological redshift (z) measures both recession velocity and cosmic time — z=1 means light emitted when universe was half current size.', formula: 'z = (λ_observed - λ_emitted) / λ_emitted', related: ['Hubble Constant', 'Doppler Effect', 'Cosmic Expansion'] },
  { term: 'Spectral Type', category: 'Stellar', definition: 'Classification of stars by surface temperature using spectral lines: O B A F G K M (hottest to coolest). Sun is G2V. Mnemonic: "Oh Be A Fine Girl/Guy, Kiss Me."', related: ['HR Diagram', 'Temperature', 'Luminosity Class'] },
]

const categories = ['All', ...Array.from(new Set(terms.map(t => t.category))).sort()]

export default function AstronomyGlossary() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState<GlossaryTerm | null>(null)

  const filtered = useMemo(() => {
    return terms.filter(t => {
      const matchCat = category === 'All' || t.category === category
      const matchSearch = !search || t.term.toLowerCase().includes(search.toLowerCase()) || t.definition.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    }).sort((a, b) => a.term.localeCompare(b.term))
  }, [search, category])

  const catColor: Record<string, string> = {
    Stellar: '#f59e0b', Physics: '#60a5fa', Cosmology: '#a78bfa', Telescopes: '#34d399', Units: '#94a3b8', Orbits: '#fb923c', Astrobiology: '#4ade80', Coordinates: '#f472b6', Measurements: '#38bdf8', 'Black Holes': '#ef4444', Objects: '#fde68a'
  }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Astronomy Glossary</h2>
      <p className="text-gray-400 text-sm mb-5">Comprehensive reference for {terms.length} key astronomical terms</p>

      <div className="flex gap-3 mb-4 flex-col sm:flex-row">
        <input
          type="text"
          placeholder="Search terms..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-2">
          {filtered.length === 0 && <div className="text-gray-500 text-sm py-4 text-center">No terms found</div>}
          {filtered.map(t => (
            <button key={t.term} onClick={() => setSelected(t)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected?.term === t.term ? 'bg-blue-900/40 border border-blue-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white text-sm">{t.term}</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ color: catColor[t.category] || '#94a3b8', backgroundColor: (catColor[t.category] || '#94a3b8') + '22' }}>{t.category}</span>
              </div>
              <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{t.definition}</p>
            </button>
          ))}
          <div className="text-gray-600 text-xs text-center py-2">{filtered.length} of {terms.length} terms</div>
        </div>

        <div className="bg-gray-800/60 rounded-lg p-5 min-h-[300px]">
          {selected ? (
            <>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-xl font-bold text-white">{selected.term}</h3>
                <span className="text-xs px-2 py-1 rounded-full" style={{ color: catColor[selected.category] || '#94a3b8', backgroundColor: (catColor[selected.category] || '#94a3b8') + '22' }}>{selected.category}</span>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">{selected.definition}</p>
              {selected.formula && (
                <div className="bg-gray-900/60 rounded p-3 mb-4 font-mono text-sm text-amber-300 text-center">{selected.formula}</div>
              )}
              {selected.related.length > 0 && (
                <div>
                  <div className="text-gray-500 text-xs font-semibold uppercase mb-2">Related Terms</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.related.map(r => {
                      const exists = terms.find(t => t.term === r)
                      return (
                        <button key={r} onClick={() => { if (exists) setSelected(exists) }} className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${exists ? 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60' : 'bg-gray-700 text-gray-400'}`}>{r}</button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">Select a term to see its definition</div>
          )}
        </div>
      </div>
    </div>
  )
}
