import { useState } from 'react'

interface Rung {
  id: number
  name: string
  method: string
  range: string
  rangeValue: string
  accuracy: string
  examples: string[]
  how: string
  limitedBy: string
  color: string
  icon: string
  discovered: string
}

const RUNGS: Rung[] = [
  {
    id: 1,
    name: 'Radar Ranging',
    method: 'Bounce radio waves off solar system bodies',
    range: 'Up to ~6 AU',
    rangeValue: '0.000001 ly',
    accuracy: '< 1 km',
    examples: ['Moon: 384,400 km (exact)', 'Venus: determined to ±3 km', 'Mars: used to define the AU precisely'],
    how: 'Send a radar pulse to a planet, measure the round-trip time. Distance = (time × speed of light) / 2. In 1961, Venus radar gave us the AU to unprecedented precision.',
    limitedBy: 'Signal strength — too weak for stars. Venus is the farthest practical target.',
    color: '#22c55e',
    icon: '📡',
    discovered: 'Modern (1946+)'
  },
  {
    id: 2,
    name: 'Trigonometric Parallax',
    method: 'Apparent star shift against background as Earth orbits',
    range: 'Up to ~3,000 light-years (Gaia extends to ~30,000 ly)',
    rangeValue: '3,000 ly',
    accuracy: '1–10% for nearby stars',
    examples: ['Proxima Centauri: 4.24 ly (most accurate stellar distance)', 'Sirius: 8.60 ly', 'Gaia catalog: 1.5 billion stars with parallax'],
    how: 'Observe a star in January and again in July — the Earth has moved 2 AU across its orbit. The star appears to shift against more distant background stars. The angle of shift (parallax) gives the distance: 1 parsec = 1 arcsecond of parallax = 3.26 ly.',
    limitedBy: 'Angular resolution — parallax becomes too small to measure accurately beyond 3,000 ly with ground telescopes. Gaia satellite achieves 0.001 milliarcsecond precision.',
    color: '#3b82f6',
    icon: '📐',
    discovered: '1838 (Friedrich Bessel, 61 Cygni)'
  },
  {
    id: 3,
    name: 'Main Sequence Fitting',
    method: 'Compare star cluster apparent brightness to known luminosity',
    range: 'Up to ~100,000 ly (Milky Way)',
    rangeValue: '100,000 ly',
    accuracy: '5–15%',
    examples: ['Pleiades: 444 ly', 'Hyades: 151 ly (anchor for this method)', 'Open clusters throughout the Milky Way'],
    how: 'Plot stars of a cluster on an HR diagram (color vs. brightness). The main sequence should have a predictable shape. Shift the cluster\'s HR diagram up/down until it matches the standard main sequence — the amount of shift gives the distance modulus and thus the distance.',
    limitedBy: 'Requires a cluster of stars. Interstellar dust dims and reddens light, requiring extinction corrections.',
    color: '#f59e0b',
    icon: '📊',
    discovered: '1914 (Ejnar Hertzsprung)'
  },
  {
    id: 4,
    name: 'Cepheid Variable Stars',
    method: 'Pulsating stars with period directly linked to luminosity',
    range: 'Up to ~100 million light-years',
    rangeValue: '100 million ly',
    accuracy: '5–10%',
    examples: ['Henrietta Swan Leavitt discovered the period-luminosity relation (1908)', 'Hubble used Cepheids to prove Andromeda is a separate galaxy (1924)', 'M31 distance: 2.537 million ly', 'Magellanic Clouds distances'],
    how: 'Cepheid variables pulse with a precise rhythm: brighter Cepheids pulse more slowly. Measure the pulsation period → look up luminosity from the known relation → compare apparent brightness to true luminosity → calculate distance. Henrietta Swan Leavitt\'s discovery of this law in 1908 was arguably the most important astronomical discovery of the 20th century.',
    limitedBy: 'Individual Cepheids must be resolvable. JWST has pushed this to 130 million ly. Crowded regions make identification difficult.',
    color: '#a855f7',
    icon: '⭐',
    discovered: '1908 (Henrietta Swan Leavitt)'
  },
  {
    id: 5,
    name: 'Type Ia Supernovae',
    method: 'Standard candles: white dwarf detonations at known luminosity',
    range: 'Up to ~10 billion light-years',
    rangeValue: '10 billion ly',
    accuracy: '5–10%',
    examples: ['Used to discover dark energy (1998)', 'Hubble\'s observation of SN 1987A', 'High-z Supernova Search Team (Perlmutter, Riess, Schmidt — Nobel 2011)', 'Thousands of SNe Ia observed by DES and SDSS'],
    how: 'Type Ia supernovae all detonate at nearly the same mass (Chandrasekhar limit, 1.4 M☉). The peak brightness is therefore nearly standard, with a well-understood correction: brighter supernovae fade more slowly. Measure apparent brightness at peak, apply the correction, and calculate distance. This method revealed that the universe\'s expansion is accelerating.',
    limitedBy: 'Rare events (~1 per galaxy per century). Not perfectly standard — metallicity and progenitor system affect peak brightness. DESI and Rubin Observatory will find thousands.',
    color: '#ef4444',
    icon: '💥',
    discovered: '1993 (Phillips relation calibrated)'
  },
  {
    id: 6,
    name: 'Tully-Fisher Relation',
    method: 'Galaxy rotation speed correlates with intrinsic luminosity',
    range: 'Up to ~1 billion light-years',
    rangeValue: '1 billion ly',
    accuracy: '10–20%',
    examples: ['Measuring distances to spiral galaxies across cosmic web', 'Virgo Cluster distance: ~65 million ly', 'Independent check on supernovae distances'],
    how: 'Spiral galaxies rotate faster if they contain more mass (and thus more stars = more light). Measure the rotation speed from 21-cm hydrogen emission (Doppler broadening) → look up luminosity from the Tully-Fisher calibration → compare to apparent brightness → distance. Discovered by R. Brent Tully and J. Richard Fisher (1977).',
    limitedBy: 'Only works for spiral galaxies. Less precise than Cepheids or SNe Ia. Requires face-on or edge-on orientation correction.',
    color: '#06b6d4',
    icon: '🌀',
    discovered: '1977 (Tully & Fisher)'
  },
  {
    id: 7,
    name: 'Hubble\'s Law / Redshift',
    method: 'Universe expansion redshifts light — recession velocity ∝ distance',
    range: 'Entire observable universe (up to 46 billion ly)',
    rangeValue: '46 billion ly',
    accuracy: '~5% (limited by H₀ tension)',
    examples: ['CMB last scattering surface: 45.7 billion ly', 'Most distant galaxy JADES-GS-z13-0: z=13.2', 'Quasar distances up to z=7.6', 'Mapping the large-scale structure'],
    how: 'The universe expands — every galaxy recedes from every other. The recession velocity v = H₀ × d, where H₀ is the Hubble constant. Measure a galaxy\'s redshift (shift in spectral lines) → infer recession velocity → calculate distance. The Hubble tension: local measurements give H₀ ≈ 73 km/s/Mpc, but CMB-based measurements give 67.4 — a 5σ discrepancy that may hint at new physics.',
    limitedBy: 'The Hubble constant value is uncertain by ~5% (Hubble tension). At very high redshift, cosmological model assumptions matter. Peculiar velocities add noise for nearby galaxies.',
    color: '#f97316',
    icon: '🌌',
    discovered: '1929 (Edwin Hubble)'
  },
]

export default function CosmicDistanceLadder() {
  const [selected, setSelected] = useState<Rung>(RUNGS[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Distance Ladder</h2>
      <p className="text-gray-400 text-sm mb-5">How astronomers measure distances from the Moon to the edge of the observable universe — each rung built on the last</p>

      {/* Ladder visualization */}
      <div className="mb-6 overflow-x-auto pb-2">
        <div className="flex gap-1 min-w-max">
          {RUNGS.map(r => (
            <button key={r.id} onClick={() => setSelected(r)}
              className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl transition-all min-w-[90px]"
              style={{
                background: selected.id === r.id ? r.color + '20' : 'rgba(30,41,59,0.6)',
                border: `1px solid ${selected.id === r.id ? r.color + '60' : 'rgba(255,255,255,0.05)'}`,
              }}>
              <span className="text-xl">{r.icon}</span>
              <span className="text-xs font-medium text-center leading-tight" style={{ color: selected.id === r.id ? r.color : '#94a3b8' }}>
                Rung {r.id}
              </span>
              <span className="text-xs text-gray-600 text-center leading-tight">{r.rangeValue}</span>
            </button>
          ))}
        </div>
        {/* Scale bar */}
        <div className="relative h-2 mt-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {RUNGS.map((r, i) => (
            <div key={r.id}
              className="absolute top-0 h-2 rounded-full opacity-70"
              style={{
                left: `${(i / RUNGS.length) * 100}%`,
                width: `${(1 / RUNGS.length) * 100}%`,
                background: r.color,
              }} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>Solar System</span>
          <span>Observable Universe (46 billion ly)</span>
        </div>
      </div>

      {/* Selected rung detail */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${selected.color}30` }}>
        <div className="px-5 py-4" style={{ background: selected.color + '10', borderBottom: `1px solid ${selected.color}20` }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selected.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: selected.color + '25', color: selected.color }}>Rung {selected.id}</span>
                <span className="text-white font-bold text-lg">{selected.name}</span>
              </div>
              <div className="text-sm" style={{ color: selected.color }}>{selected.method}</div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4 bg-gray-800/40">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              ['Max Range', selected.range],
              ['Accuracy', selected.accuracy],
              ['Pioneered', selected.discovered],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-900/60 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">{k}</div>
                <div className="text-gray-200 text-xs font-medium">{v}</div>
              </div>
            ))}
          </div>

          {/* How it works */}
          <div className="bg-gray-900/50 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">How it works</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.how}</p>
          </div>

          {/* Examples */}
          <div>
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Key examples &amp; milestones</div>
            <div className="space-y-1">
              {selected.examples.map((ex, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span style={{ color: selected.color }}>•</span>
                  <span className="text-gray-300">{ex}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Limitation */}
          <div className="rounded-lg p-3 bg-yellow-900/10 border border-yellow-800/20">
            <div className="text-yellow-600 text-xs uppercase font-semibold mb-1">Limitation</div>
            <p className="text-gray-300 text-sm">{selected.limitedBy}</p>
          </div>
        </div>
      </div>

      {/* Chain of knowledge box */}
      <div className="mt-4 bg-indigo-900/15 rounded-xl p-4 border border-indigo-800/25">
        <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">The Chain of Knowledge</div>
        <p className="text-gray-300 text-sm leading-relaxed">
          Each rung is calibrated using the rung below it. If the nearest rungs are wrong, all subsequent distances are wrong — this is the "ladder" metaphor. The Hubble tension (local vs. CMB Hubble constant) suggests either the Cepheid calibration has a systematic error, or there is genuinely new physics (early dark energy, sterile neutrinos) changing the universe's expansion history.
        </p>
      </div>
    </div>
  )
}
