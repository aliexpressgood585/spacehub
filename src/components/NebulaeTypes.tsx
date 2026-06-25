import { useState } from 'react'

interface Nebula {
  id: string
  type: string
  icon: string
  color: string
  howFormed: string
  whatItIs: string
  examples: { name: string; distance: string; size: string; notes: string }[]
  observing: string
  lifespan: string
  starFormation: boolean
  fascinatingFact: string
  composition: string[]
}

const NEBULAE: Nebula[] = [
  {
    id: 'emission',
    type: 'Emission Nebulae',
    icon: '🔴',
    color: '#ef4444',
    howFormed: 'Hot young stars ionize surrounding hydrogen gas. Ultraviolet radiation from O-type and B-type stars strips electrons from hydrogen atoms. When electrons recombine with protons, they emit light at specific wavelengths — predominantly red H-alpha (656 nm) from hydrogen recombination.',
    whatItIs: 'Glowing clouds of ionized gas (plasma), mostly hydrogen with helium, oxygen, nitrogen, and sulfur. The reddish color comes from hydrogen-alpha emission. The region ionized by a hot star is called an HII region.',
    examples: [
      { name: 'Orion Nebula (M42)', distance: '1,344 ly', size: '24 ly across', notes: 'Most studied HII region; nursery of ~700 stars; visible to naked eye as fuzzy star in Orion\'s sword' },
      { name: 'Eagle Nebula (M16)', distance: '5,700 ly', size: '70×55 ly', notes: 'Contains the famous "Pillars of Creation" — dense gas columns sculpted by stellar winds, 5 ly tall' },
      { name: 'Lagoon Nebula (M8)', distance: '4,100 ly', size: '140×60 ly', notes: 'Visible to naked eye from dark sites; contains Hourglass Nebula within it' },
      { name: 'Rosette Nebula (NGC 2244)', distance: '5,200 ly', size: '130 ly across', notes: 'Perfect circular shape; open star cluster NGC 2244 sculpted it from inside out' },
    ],
    observing: 'Best observed through H-alpha narrowband filters, which block light pollution and reveal structure. Visual telescopes show the brighter regions; astrophotography reveals stunning detail. Orion Nebula is visible to the naked eye as a fuzzy star.',
    lifespan: '~1–10 million years before dissipated by stellar winds and radiation',
    starFormation: true,
    fascinatingFact: 'The "Pillars of Creation" in M16 were actually destroyed by a supernova explosion ~6,000 years ago — but we won\'t see the destruction for another 1,000 years, because light from the explosion hasn\'t reached us yet. We\'re seeing them as they were 5,700 years ago.',
    composition: ['Hydrogen (90%)', 'Helium (8%)', 'Oxygen, Nitrogen, Sulfur (traces)', 'Dust grains']
  },
  {
    id: 'reflection',
    type: 'Reflection Nebulae',
    icon: '🔵',
    color: '#3b82f6',
    howFormed: 'Interstellar dust scatters light from nearby stars, similar to how Earth\'s atmosphere scatters sunlight to make the sky blue. The dust preferentially scatters blue light (shorter wavelength) more efficiently than red, making reflection nebulae appear blue.',
    whatItIs: 'Clouds of interstellar dust illuminated by starlight — not their own emitted light. They shine by reflected and scattered light. Unlike emission nebulae, they don\'t emit their own radiation; they merely redirect the light of nearby stars.',
    examples: [
      { name: 'Witch Head Nebula (IC 2118)', distance: '900 ly', size: '50 ly long', notes: 'Illuminated by Rigel; faint, requires dark skies; ghostly witch profile' },
      { name: 'Pleiades Reflection Nebula', distance: '444 ly', size: '~30 ly', notes: 'The Pleiades star cluster is passing through an unrelated dust cloud, illuminating it blue' },
      { name: 'Merope Nebula (IC 349)', distance: '440 ly', size: '0.3 ly', notes: 'Dense reflection nebula around Merope in the Pleiades; shows remarkable fine structure' },
      { name: 'Iris Nebula (NGC 7023)', distance: '1,300 ly', size: '6 ly', notes: 'Beautiful blue reflection nebula with yellow/brown filaments; popular astrophotography target' },
    ],
    observing: 'Blue reflection nebulae are best photographed with broadband (LRGB) filters without narrowband. They require longer exposures than emission nebulae. The Pleiades nebula is photographable with modest equipment.',
    lifespan: 'As long as the dust cloud and nearby star coexist — can be very long-lived',
    starFormation: false,
    fascinatingFact: 'Reflection nebulae are not associated with the illuminating star — the Pleiades are simply passing through an unrelated dust cloud. In 100,000 years, the cluster will have moved on and the blue haze will vanish.',
    composition: ['Silicate dust grains (0.1–10 μm)', 'Carbon/graphite grains', 'Polycyclic aromatic hydrocarbons (PAHs)', 'Ice mantles on grains']
  },
  {
    id: 'dark',
    type: 'Dark Nebulae',
    icon: '⬛',
    color: '#475569',
    howFormed: 'Dense clouds of interstellar dust and gas that block light from stars or nebulae behind them. They contain no nearby hot stars to illuminate them, so they appear as dark patches against brighter backgrounds.',
    whatItIs: 'Cold, dense molecular clouds containing hydrogen (mostly H₂), carbon monoxide, complex organic molecules, and dust. Despite appearing empty, they are actually the densest parts of the interstellar medium — and the sites where new stars form.',
    examples: [
      { name: 'Horsehead Nebula (B33)', distance: '1,375 ly', size: '3.5 ly tall', notes: 'Iconic silhouette against emission nebula IC 434; photogenic but faint; requires H-alpha filter' },
      { name: 'Barnard 68', distance: '410 ly', size: '0.5 ly', notes: 'Nearly perfectly round dark cloud; completely opaque in visible light; transparent in infrared' },
      { name: 'Coal Sack Nebula', distance: '600 ly', size: '30 ly across', notes: 'Naked-eye dark nebula in Crux; Aboriginal Australians called it the "Dark Emu"' },
      { name: 'Rho Ophiuchi Cloud Complex', distance: '460 ly', size: '~50 ly', notes: 'Nearest star-forming region; beautiful color mixture of emission, reflection, and dark nebulae' },
    ],
    observing: 'Dark nebulae are best seen against bright backgrounds — emission nebulae or the Milky Way band. The Horsehead is notoriously difficult visually but beautiful in photos. The Coal Sack is obvious to the naked eye from the southern hemisphere.',
    lifespan: '~10–100 million years; eventually collapse to form stars or disperse',
    starFormation: true,
    fascinatingFact: 'Barnard 68 is so cold (−257°C, just 16 K above absolute zero) and dense that it is on the verge of gravitational collapse — it will likely begin forming a star in the next ~100,000 years. You can watch a future stellar nursery right now.',
    composition: ['Molecular hydrogen (H₂)', 'Carbon monoxide (CO)', 'Complex organics (formaldehyde, methanol)', 'Silicate and carbonaceous dust', 'Temperature: 10–30 K']
  },
  {
    id: 'planetary',
    type: 'Planetary Nebulae',
    icon: '🟣',
    color: '#a855f7',
    howFormed: 'When a low/medium mass star (0.8–8 M☉) ends its life as a red giant, it ejects its outer layers. The remaining hot core (future white dwarf) ionizes the expelled gas shell, making it glow. The name "planetary" is historical — they looked round and disc-like through early telescopes, similar to planets.',
    whatItIs: 'The expanding shell of ionized gas surrounding a dying star\'s remnant core (white dwarf progenitor). They are NOT related to planets despite the name. They are among the most beautiful objects in the sky, showing extraordinary symmetry and structure created by the star\'s final winds.',
    examples: [
      { name: 'Ring Nebula (M57)', distance: '2,300 ly', size: '1 ly diameter', notes: 'Classic ring shape; white dwarf visible at center; summer telescope showpiece in Lyra' },
      { name: 'Helix Nebula (NGC 7293)', distance: '655 ly', size: '3 ly diameter', notes: 'Nearest planetary nebula to Earth; "Eye of God" shape; shows multiple concentric shells' },
      { name: 'Cat\'s Eye Nebula (NGC 6543)', distance: '3,300 ly', size: '1 ly', notes: 'Complex structure of concentric shells and jets; one of first to be spectroscopically studied (1864)' },
      { name: 'Butterfly Nebula (NGC 6302)', distance: '3,800 ly', size: '2 ly wingspan', notes: 'Bipolar nebula with 200,000 K central star; JWST revealed intricate detail in 2022' },
    ],
    observing: 'Most planetary nebulae are small and bright — easily visible in moderate telescopes. The Ring Nebula is a summer classic. The Helix Nebula is large and requires dark skies but is stunning in wide-field photos. [OIII] filter dramatically enhances contrast.',
    lifespan: '~10,000–100,000 years — the shortest-lived of all nebula types before dispersing into space',
    starFormation: false,
    fascinatingFact: 'The carbon, nitrogen, oxygen, and heavier elements blown off by dying stars in planetary nebulae seed the interstellar medium with the raw materials for new stars and planets. The calcium in your bones and the oxygen you breathe were expelled by ancient planetary nebulae.',
    composition: ['Helium, oxygen, neon (stellar interior products)', 'Carbon (from triple-alpha fusion)', 'Nitrogen (CNO cycle products)', 'Iron, calcium, sulfur traces', 'Temperature: 8,000–15,000 K']
  },
  {
    id: 'supernova',
    type: 'Supernova Remnants',
    icon: '💥',
    color: '#f97316',
    howFormed: 'When a massive star (>8 M☉) or white dwarf at the Chandrasekhar limit explodes as a supernova, the explosion ejects material at 10,000–30,000 km/s. This fast-moving ejecta collides with surrounding interstellar medium, creating a shock wave that heats gas to millions of degrees, producing X-ray emission.',
    whatItIs: 'The expanding shell of stellar debris and swept-up interstellar material following a supernova explosion. They emit across the entire electromagnetic spectrum — radio waves, X-rays, and visible light. They can remain visible for thousands of years.',
    examples: [
      { name: 'Crab Nebula (M1)', distance: '6,500 ly', size: '11 ly', notes: 'Remnant of supernova observed in 1054 AD; contains a pulsar spinning 30×/sec; 11 ly across in just 970 years' },
      { name: 'Cassiopeia A', distance: '10,000 ly', size: '10 ly', notes: 'Youngest known remnant in our galaxy (~1680 AD); brightest extragalactic radio source in sky' },
      { name: 'Vela Supernova Remnant', distance: '800 ly', size: '100 ly', notes: 'Exploded ~11,000 years ago; visible to naked eye in antiquity; Vela pulsar at center' },
      { name: 'SN 1987A remnant', distance: '168,000 ly', size: 'Still expanding', notes: 'In the Large Magellanic Cloud; watched in real-time by telescopes; rings lit up by the shock wave' },
    ],
    observing: 'Most supernova remnants require large telescopes or specialized imaging. The Crab Nebula (M1) is accessible in small telescopes as a fuzzy patch in Taurus. Large remnants like Vela require wide-field imaging. X-ray telescopes (Chandra) reveal their full glory.',
    lifespan: '~10,000–100,000 years before merging with ISM',
    starFormation: true,
    fascinatingFact: 'The Crab Nebula is expanding at 1,500 km/s — fast enough to travel from Earth to the Moon in 4 minutes. In the 970 years since the 1054 supernova, it has grown from a point source to 11 light-years across. Astronomers watched it happen across a millennium.',
    composition: ['Oxygen, neon, magnesium, silicon (stellar burning products)', 'Iron, nickel, cobalt (r-process)', 'Gold, uranium, platinum (r-process)', 'Temperature: millions of K in shock-heated regions']
  },
  {
    id: 'protoplanetary',
    type: 'Protoplanetary Nebulae',
    icon: '🌀',
    color: '#22c55e',
    howFormed: 'A short-lived transitional phase between a red giant ejecting mass and a full planetary nebula. The star has expelled its outer layers but is not yet hot enough to fully ionize them. The geometry is often bipolar — fast polar winds break through while the equatorial material is still thick.',
    whatItIs: 'A brief (~1,000–10,000 year) transitional phase in stellar death. The central star is warming (from 2,000 K to 30,000 K) while the ejected shell is still mostly neutral gas. These objects are NOT related to planetary formation — they are old dying stars, not young star-forming systems.',
    examples: [
      { name: 'Egg Nebula (CRL 2688)', distance: '3,000 ly', size: '0.6 ly', notes: 'Concentric shells from pulsations; light beams through gaps in dust toroid; transitioning rapidly' },
      { name: 'Red Rectangle Nebula (HD 44179)', distance: '2,300 ly', size: '1 ly', notes: 'Unique X-shaped geometry from a binary system; polycyclic aromatic hydrocarbon emission' },
      { name: 'Minkowski 92', distance: '6,500 ly', size: '0.5 ly', notes: 'Rapid transition object; will become a planetary nebula within ~1,000 years' },
    ],
    observing: 'Protoplanetary nebulae are generally faint and small, requiring large telescopes. They are more commonly studied by professional astronomers than amateur observers. The Egg Nebula is among the more accessible with large amateur scopes.',
    lifespan: '1,000–10,000 years — the rarest and most ephemeral nebula type',
    starFormation: false,
    fascinatingFact: 'Protoplanetary nebulae are caught in the act of dying — a cosmic "blink" lasting just thousands of years. Of all the nebula types, these are the rarest objects in the sky because they exist for such a tiny fraction of a star\'s 10-billion-year life.',
    composition: ['Carbon dust (C-rich AGB stars)', 'Oxygen silicates (O-rich AGB stars)', 'CO, H₂O, SiO (molecular emission)', 'Complex organics forming on dust grains']
  },
]

export default function NebulaeTypes() {
  const [selected, setSelected] = useState<Nebula>(NEBULAE[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Types of Nebulae</h2>
      <p className="text-gray-400 text-sm mb-5">The universe's most spectacular objects — from star-forming hydrogen clouds to the glowing shells of dying stars</p>

      {/* Type selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {NEBULAE.map(n => (
          <button
            key={n.id}
            onClick={() => setSelected(n)}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
            style={{
              background: selected.id === n.id ? n.color + '20' : 'rgba(30,41,59,0.7)',
              border: `1px solid ${selected.id === n.id ? n.color + '60' : 'rgba(255,255,255,0.05)'}`,
              color: selected.id === n.id ? n.color : '#94a3b8',
            }}
          >
            <span>{n.icon}</span>
            <span>{n.type.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Detail */}
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-xl p-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{selected.icon}</span>
            <div>
              <h3 className="text-xl font-bold text-white">{selected.type}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: selected.starFormation ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)',
                    color: selected.starFormation ? '#86efac' : '#a5b4fc',
                    border: `1px solid ${selected.starFormation ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.3)'}`,
                  }}
                >
                  {selected.starFormation ? '⭐ Star-forming' : '💀 Post-stellar'}
                </span>
                <span className="text-gray-500 text-xs">Lifespan: {selected.lifespan}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-gray-400 text-xs uppercase font-semibold mb-1.5">How It Forms</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.howFormed}</p>
          </div>
        </div>

        {/* What it is */}
        <div className="bg-gray-800/60 rounded-xl p-4">
          <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What It Is</div>
          <p className="text-gray-200 text-sm leading-relaxed">{selected.whatItIs}</p>
          <div className="mt-3">
            <div className="text-gray-500 text-xs mb-1">Composition</div>
            <div className="flex flex-wrap gap-1.5">
              {selected.composition.map(comp => (
                <span key={comp} className="text-xs px-2 py-1 rounded-lg bg-gray-700/60 text-gray-300">{comp}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Examples */}
        <div className="bg-gray-800/60 rounded-xl p-4">
          <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Famous Examples</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {selected.examples.map(ex => (
              <div key={ex.name} className="bg-gray-900/60 rounded-lg p-3">
                <div className="font-semibold text-sm text-white mb-0.5">{ex.name}</div>
                <div className="flex gap-3 text-xs text-gray-500 mb-1">
                  <span>📍 {ex.distance}</span>
                  <span>↔ {ex.size}</span>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed">{ex.notes}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Observing tips */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">How to Observe</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.observing}</p>
          </div>

          {/* Fascinating fact */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}25` }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>Mind-Bending Fact</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.fascinatingFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
