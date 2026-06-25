import { useState } from 'react'

interface Era {
  name: string
  time: string
  time_seconds: number
  temp: string
  desc: string
  events: string[]
  emoji: string
  color: string
}

const ERAS: Era[] = [
  {
    name: 'Planck Epoch',
    time: '0 – 10⁻⁴³ s',
    time_seconds: 0,
    temp: '> 10³² K',
    desc: 'The earliest known moment of the universe. All four fundamental forces (gravity, EM, strong, weak) were unified into one. Quantum gravity dominated — our physics breaks down here.',
    events: ['Time itself may not have existed', 'Space was smaller than an atom', 'Quantum foam dominated', 'All forces unified'],
    emoji: '💥',
    color: '#ffffff',
  },
  {
    name: 'Grand Unification Epoch',
    time: '10⁻⁴³ – 10⁻³⁶ s',
    time_seconds: 1e-43,
    temp: '10²⁷ – 10³² K',
    desc: 'Gravity separated from the other three forces. Strong, weak, and electromagnetic forces still unified.',
    events: ['Gravity splits off from unified force', 'GUT symmetry breaking begins', 'X/Y bosons abundant'],
    emoji: '⚡',
    color: '#e879f9',
  },
  {
    name: 'Inflationary Epoch',
    time: '10⁻³⁶ – 10⁻³² s',
    time_seconds: 1e-36,
    temp: '~10²⁸ K',
    desc: 'The universe expanded exponentially — doubling in size every ~10⁻³⁷ seconds. A quantum fluctuation expanded to cosmic scales, creating the large-scale structure seeds we see today.',
    events: ['Universe expanded by 10²⁶ factor (or more)', 'Quantum fluctuations became density variations', 'CMB temperature uniformity explained', 'Flatness of universe explained'],
    emoji: '🌊',
    color: '#8b5cf6',
  },
  {
    name: 'Electroweak Epoch',
    time: '10⁻³⁶ – 10⁻¹² s',
    time_seconds: 1e-36,
    temp: '10¹⁵ – 10²⁸ K',
    desc: 'Strong force separated from electroweak force. Matter and antimatter created in near-equal amounts. A tiny asymmetry (1 in 10^9 particles was matter) is why we exist.',
    events: ['Strong force splits from electroweak', 'Matter-antimatter asymmetry frozen in', 'Higgs field gives particles mass', 'Quark-gluon plasma forms'],
    emoji: '⚗️',
    color: '#6366f1',
  },
  {
    name: 'Quark Epoch',
    time: '10⁻¹² – 10⁻⁶ s',
    time_seconds: 1e-12,
    temp: '10¹² – 10¹⁵ K',
    desc: 'Universe was a hot quark-gluon plasma — quarks and gluons moved freely. Too hot for quarks to bind into protons or neutrons.',
    events: ['Quarks exist as free particles', 'Gluons freely interact', 'Temperature drops as universe expands'],
    emoji: '🔴',
    color: '#ef4444',
  },
  {
    name: 'Hadron Epoch',
    time: '10⁻⁶ – 1 s',
    time_seconds: 1e-6,
    temp: '10¹⁰ – 10¹² K',
    desc: 'Cool enough for quarks to bind into hadrons (protons, neutrons). Most matter-antimatter pairs annihilate, leaving the slight surplus of matter that becomes everything.',
    events: ['Quarks combine into protons & neutrons', 'Matter-antimatter annihilation', 'Net matter surplus survives (~1 per 10⁹)'],
    emoji: '⚛️',
    color: '#f97316',
  },
  {
    name: 'Lepton Epoch',
    time: '1 s – 10 s',
    time_seconds: 1,
    temp: '10⁹ – 10¹⁰ K',
    desc: 'Electrons, positrons, neutrinos dominated. Neutrinos decoupled from baryonic matter. Most electron-positron pairs annihilated, releasing photons.',
    events: ['Neutrinos decouple (cosmic neutrino background formed)', 'Electron-positron annihilation', 'Remaining electrons pair with protons'],
    emoji: '🔵',
    color: '#f59e0b',
  },
  {
    name: 'Big Bang Nucleosynthesis',
    time: '3 min – 20 min',
    time_seconds: 180,
    temp: '10⁷ – 10⁹ K',
    desc: 'Nuclear reactions fused protons and neutrons into the first atomic nuclei. The universe\'s original composition: ~75% hydrogen, ~24% helium-4, trace deuterium and lithium.',
    events: ['Hydrogen (1H) most abundant nucleus formed', 'Helium-4 (4He) — 24% of baryonic mass', 'Deuterium and He-3 trace amounts', 'Lithium-7 tiny amount'],
    emoji: '⚗️',
    color: '#eab308',
  },
  {
    name: 'Photon Epoch (radiation-dominated)',
    time: '20 min – 380,000 yr',
    time_seconds: 1200,
    temp: '3000 – 10⁹ K',
    desc: 'Plasma of electrons, protons, and photons. Light couldn\'t travel far — scattered constantly. Universe was opaque like the inside of the Sun.',
    events: ['Universe was opaque to light', 'Photon pressure prevented gravity from forming structures', 'Electrons kept tightly coupled to photons', 'Matter density growing relative to radiation'],
    emoji: '🔆',
    color: '#84cc16',
  },
  {
    name: 'Recombination / CMB',
    time: '380,000 yr',
    time_seconds: 1.2e13,
    temp: '~3000 K',
    desc: 'Universe cooled enough for electrons to combine with nuclei, forming neutral atoms. Photons decoupled and traveled freely — that flash of light is the Cosmic Microwave Background we detect today.',
    events: ['Neutral hydrogen atoms form', 'Universe became transparent', 'CMB photons released — now red-shifted to 2.725K', 'This is the oldest light we can see'],
    emoji: '🌅',
    color: '#10b981',
  },
  {
    name: 'Dark Ages',
    time: '380,000 – 150 Myr',
    time_seconds: 1.2e13,
    temp: '~100 K (at end)',
    desc: 'No stars yet. The universe was dark, filled with neutral hydrogen gas slowly clumping under gravity. No light except the fading CMB.',
    events: ['No stars, no light', 'Hydrogen clouds slowly collapse', 'Dark matter halos form first', 'Seeds of first galaxies beginning'],
    emoji: '🌑',
    color: '#1e293b',
  },
  {
    name: 'Cosmic Dawn / Reionization',
    time: '150 Myr – 1 Gyr',
    time_seconds: 4.7e15,
    temp: '~10–50 K',
    desc: 'First stars ignited — Population III stars, massive and incredibly hot. Their UV radiation reionized the surrounding hydrogen gas. The universe lit up for the first time.',
    events: ['First stars (Population III) form — 100–300 M☉', 'First gamma-ray bursts', 'Reionization of intergalactic medium', 'First quasars appear (~500 Myr)'],
    emoji: '⭐',
    color: '#f59e0b',
  },
  {
    name: 'Galaxy Formation Era',
    time: '1 – 4 Gyr',
    time_seconds: 3.15e16,
    temp: '~2.7–5 K',
    desc: 'Galaxies formed and grew by mergers. Peak star formation rate — the universe was creating stars 10× faster than today. Supermassive black holes grew rapidly.',
    events: ['Milky Way begins forming (~12 Gyr ago)', 'Cosmic star-formation peak (~10 Gyr ago)', 'Galaxy clusters assemble', 'Heavy elements spread by supernovae'],
    emoji: '🌀',
    color: '#3b82f6',
  },
  {
    name: 'Solar System Forms',
    time: '9.2 Gyr (4.6 Gyr ago)',
    time_seconds: 2.9e17,
    temp: '~3 K',
    desc: 'A molecular cloud enriched with stellar debris collapsed to form the Sun and Solar System. Earth formed ~4.5 Gyr ago. Life appeared ~3.8 Gyr ago.',
    events: ['Sun ignites from solar nebula', 'Planets form by accretion', 'Late Heavy Bombardment', 'Earth\'s oceans form', 'First life ~3.8 Gyr ago'],
    emoji: '🌍',
    color: '#22c55e',
  },
  {
    name: 'Present Day',
    time: '13.8 Gyr',
    time_seconds: 4.35e17,
    temp: '2.725 K (CMB)',
    desc: 'You are here. Dark energy dominates, causing accelerating expansion. The universe contains ~2 trillion galaxies, each with hundreds of billions of stars.',
    events: ['You are reading this', '~2 trillion galaxies', 'Dark energy dominates (68%)', 'Accelerating expansion since ~5 Gyr ago'],
    emoji: '🌌',
    color: '#6366f1',
  },
  {
    name: 'Far Future',
    time: '> 1 Trillion yr',
    time_seconds: 3.15e28,
    temp: '→ 0 K',
    desc: 'Stars die out. Black holes evaporate via Hawking radiation. The universe approaches maximum entropy — the "heat death". Timescales of 10^100 years.',
    events: ['Star formation ends (~100 Gyr)', 'Stellar remnants orbit dead galaxies', 'Black hole dominance era', 'Proton decay? (~10³⁴ years)', 'Black hole evaporation (10^67–10^100 years)', 'Heat death of the universe'],
    emoji: '❄️',
    color: '#94a3b8',
  },
]

export default function CosmologyTimeline() {
  const [selectedEra, setSelectedEra] = useState<Era>(ERAS[9])
  const visibleEras = ERAS

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🌐</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Cosmology Timeline</h2>
          <p className="text-blue-300 text-sm">From the Big Bang to the heat death of the universe — 13.8 billion years and beyond</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative mb-6">
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-white/50 via-blue-500/30 to-gray-800/50" />

        <div className="space-y-2">
          {visibleEras.map((era) => (
            <div
              key={era.name}
              onClick={() => setSelectedEra(era)}
              className={`relative pl-12 cursor-pointer group transition-all ${selectedEra.name === era.name ? '' : 'opacity-80 hover:opacity-100'}`}
            >
              {/* Timeline dot */}
              <div
                className="absolute left-3.5 w-3 h-3 rounded-full border-2 border-black transition-transform group-hover:scale-125 z-10"
                style={{ backgroundColor: era.color, top: '50%', transform: 'translateY(-50%)' }}
              />

              <div className={`rounded-lg p-3 border transition-all ${selectedEra.name === era.name ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{era.emoji}</span>
                    <div>
                      <div className="text-sm font-bold" style={{ color: era.color }}>{era.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{era.time}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">{era.temp}</div>
                </div>

                {selectedEra.name === era.name && (
                  <div className="mt-3 pt-2 border-t border-white/10">
                    <p className="text-sm text-gray-300 leading-relaxed mb-3">{era.desc}</p>
                    <div className="text-xs text-gray-400 font-semibold mb-1">Key events:</div>
                    <ul className="space-y-0.5">
                      {era.events.map(ev => (
                        <li key={ev} className="text-xs text-gray-300 flex gap-1.5">
                          <span style={{ color: era.color }}>▸</span>{ev}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Universe composition today */}
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="text-xs text-gray-400 font-semibold mb-3">Content of the Universe Today</div>
        <div className="flex gap-2 items-center mb-2">
          <div className="flex-1 flex rounded-full overflow-hidden h-4">
            <div className="bg-purple-600 h-full" style={{ width: '68%' }} title="Dark Energy 68%" />
            <div className="bg-blue-600 h-full" style={{ width: '27%' }} title="Dark Matter 27%" />
            <div className="bg-green-500 h-full" style={{ width: '4.9%' }} title="Baryonic 4.9%" />
            <div className="bg-yellow-400 h-full" style={{ width: '0.1%' }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-purple-600" /><span className="text-gray-300">Dark Energy 68%</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-600" /><span className="text-gray-300">Dark Matter 27%</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /><span className="text-gray-300">Normal Matter 4.9%</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-400" /><span className="text-gray-300">Radiation 0.01%</span></div>
        </div>
        <div className="mt-2 text-xs text-gray-500">Everything you can see — stars, galaxies, planets, you — is only 4.9% of the universe's content.</div>
      </div>

      {/* Big Bang to now scale */}
      <div className="mt-4 bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="text-xs text-gray-400 mb-2">If the entire history of the universe were compressed into 1 year:</div>
        <div className="space-y-1 text-xs text-gray-300">
          {[
            { event: 'Big Bang', date: 'January 1, 00:00:00' },
            { event: 'Milky Way forms', date: 'March 16' },
            { event: 'Solar System forms', date: 'September 2' },
            { event: 'Earth forms', date: 'September 9' },
            { event: 'First life on Earth', date: 'September 21' },
            { event: 'Dinosaurs extinct', date: 'December 30, 06:24' },
            { event: 'Homo sapiens', date: 'December 31, 23:46' },
            { event: 'Written history', date: 'December 31, 23:59:32' },
            { event: 'Now (2024 CE)', date: 'December 31, 23:59:59.999...' },
          ].map(item => (
            <div key={item.event} className="flex justify-between">
              <span className="text-gray-400">{item.event}</span>
              <span className="font-mono text-white">{item.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
