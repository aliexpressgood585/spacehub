import { useState } from 'react'

interface Element {
  Z: number
  symbol: string
  name: string
  origin: string
  color: string
  detail: string
}

const ORIGIN_COLORS: Record<string, string> = {
  'Big Bang': '#6366f1',
  'Dying Low-Mass Stars': '#10b981',
  'Exploding Massive Stars': '#ef4444',
  'Neutron Star Mergers': '#8b5cf6',
  'Cosmic Ray Spallation': '#f59e0b',
  'Human-Made': '#6b7280',
  'Multiple Sources': '#f97316',
}

const ELEMENTS: Element[] = [
  { Z: 1, symbol: 'H', name: 'Hydrogen', origin: 'Big Bang', color: ORIGIN_COLORS['Big Bang'], detail: '75% of all ordinary matter. Made in the first 3 minutes after the Big Bang during nucleosynthesis.' },
  { Z: 2, symbol: 'He', name: 'Helium', origin: 'Big Bang', color: ORIGIN_COLORS['Big Bang'], detail: '24% of ordinary matter. Made in Big Bang nucleosynthesis. Also produced in stars via hydrogen fusion.' },
  { Z: 3, symbol: 'Li', name: 'Lithium', origin: 'Big Bang', color: ORIGIN_COLORS['Big Bang'], detail: 'Primordial lithium-7 made in Big Bang. Most modern lithium comes from cosmic ray spallation and AGB stars.' },
  { Z: 4, symbol: 'Be', name: 'Beryllium', origin: 'Cosmic Ray Spallation', color: ORIGIN_COLORS['Cosmic Ray Spallation'], detail: 'Made when high-energy cosmic rays smash into heavier nuclei in the interstellar medium, breaking them apart.' },
  { Z: 5, symbol: 'B', name: 'Boron', origin: 'Cosmic Ray Spallation', color: ORIGIN_COLORS['Cosmic Ray Spallation'], detail: 'Like beryllium, formed by cosmic ray spallation. Not made in stellar interiors.' },
  { Z: 6, symbol: 'C', name: 'Carbon', origin: 'Dying Low-Mass Stars', color: ORIGIN_COLORS['Dying Low-Mass Stars'], detail: 'Made in the triple-alpha process in red giant stars. Carbon is the 4th most abundant element in the universe by mass.' },
  { Z: 7, symbol: 'N', name: 'Nitrogen', origin: 'Dying Low-Mass Stars', color: ORIGIN_COLORS['Dying Low-Mass Stars'], detail: 'Made in CNO cycle in intermediate-mass stars and ejected in planetary nebulae.' },
  { Z: 8, symbol: 'O', name: 'Oxygen', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'The most abundant element in Earth\'s crust. Made in massive stars and scattered by supernovae. Most abundant metal in the universe.' },
  { Z: 9, symbol: 'F', name: 'Fluorine', origin: 'Multiple Sources', color: ORIGIN_COLORS['Multiple Sources'], detail: 'Rare element with complex origins: neutrino spallation in supernovae, AGB stars, and Wolf-Rayet star winds.' },
  { Z: 10, symbol: 'Ne', name: 'Neon', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Made in carbon-burning phase of massive stars (> 8 solar masses) and ejected in core-collapse supernovae.' },
  { Z: 11, symbol: 'Na', name: 'Sodium', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Produced in the carbon and neon burning layers of massive pre-supernova stars.' },
  { Z: 12, symbol: 'Mg', name: 'Magnesium', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Synthesized in the neon and oxygen burning shells of massive stars before supernova explosion.' },
  { Z: 13, symbol: 'Al', name: 'Aluminum', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Core-collapse supernovae are the primary source. Aluminum-26 from supernovae was first solid material in the solar system.' },
  { Z: 14, symbol: 'Si', name: 'Silicon', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Made in oxygen and silicon burning in the final stages of massive stellar evolution. The main constituent of rocky planets.' },
  { Z: 15, symbol: 'P', name: 'Phosphorus', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Essential for DNA and ATP. Produced in oxygen and neon burning shells of pre-supernova massive stars.' },
  { Z: 16, symbol: 'S', name: 'Sulfur', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Made in explosive oxygen burning during the supernova explosion itself.' },
  { Z: 17, symbol: 'Cl', name: 'Chlorine', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Produced in oxygen and neon burning and in Type Ia supernovae (white dwarf explosions).' },
  { Z: 18, symbol: 'Ar', name: 'Argon', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Made in silicon burning in massive stars. Earth\'s third most abundant atmospheric gas.' },
  { Z: 19, symbol: 'K', name: 'Potassium', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Produced in oxygen burning and by Type Ia supernovae. K-40 radioactive isotope heats Earth\'s interior.' },
  { Z: 20, symbol: 'Ca', name: 'Calcium', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Silicon and oxygen burning product. Makes up your bones and teeth — forged in massive star explosions.' },
  { Z: 26, symbol: 'Fe', name: 'Iron', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Iron-56 is the most tightly bound nucleus. Stars cannot fuse beyond iron — it\'s the endpoint of stellar nucleosynthesis. Iron accumulation causes core collapse.' },
  { Z: 27, symbol: 'Co', name: 'Cobalt', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Made in the iron-peak element burning and also in the r-process of core-collapse supernovae.' },
  { Z: 28, symbol: 'Ni', name: 'Nickel', origin: 'Exploding Massive Stars', color: ORIGIN_COLORS['Exploding Massive Stars'], detail: 'Nickel-56 (radioactive) is the main product of supernova explosive silicon burning. Its decay powers supernova light curves.' },
  { Z: 29, symbol: 'Cu', name: 'Copper', origin: 'Multiple Sources', color: ORIGIN_COLORS['Multiple Sources'], detail: 'Made in massive stars via the weak s-process and in neutron star mergers via the r-process.' },
  { Z: 30, symbol: 'Zn', name: 'Zinc', origin: 'Multiple Sources', color: ORIGIN_COLORS['Multiple Sources'], detail: 'Produced in core-collapse supernovae, Type Ia supernovae, and neutron star merger r-process.' },
  { Z: 47, symbol: 'Ag', name: 'Silver', origin: 'Neutron Star Mergers', color: ORIGIN_COLORS['Neutron Star Mergers'], detail: 'Silver is primarily made in neutron star mergers via rapid neutron capture (r-process). Confirmed by GW170817 kilonova observation.' },
  { Z: 56, symbol: 'Ba', name: 'Barium', origin: 'Dying Low-Mass Stars', color: ORIGIN_COLORS['Dying Low-Mass Stars'], detail: 'Made by the slow neutron capture (s-process) in AGB stars. AGB stars are the main factory for barium in the universe.' },
  { Z: 79, symbol: 'Au', name: 'Gold', origin: 'Neutron Star Mergers', color: ORIGIN_COLORS['Neutron Star Mergers'], detail: 'Gold is forged in neutron star mergers (kilonovae) via the r-process. The 2017 GW170817 event produced gold estimated at 10× Earth\'s mass.' },
  { Z: 90, symbol: 'Th', name: 'Thorium', origin: 'Neutron Star Mergers', color: ORIGIN_COLORS['Neutron Star Mergers'], detail: 'R-process element from neutron star mergers. Thorium-232 radioactive decay heats planetary interiors.' },
  { Z: 92, symbol: 'U', name: 'Uranium', origin: 'Neutron Star Mergers', color: ORIGIN_COLORS['Neutron Star Mergers'], detail: 'The heaviest naturally occurring element. Made exclusively in neutron star mergers and rare supernova r-process events.' },
]

const PROCESSES = [
  {
    name: 'Big Bang Nucleosynthesis', emoji: '💥', time: '3-20 minutes after the Big Bang',
    elements: 'H, He, Li, trace D, ³He',
    desc: 'In the first minutes after the Big Bang, the universe was hot and dense enough for nuclear fusion. Protons and neutrons combined to form hydrogen (75%), helium-4 (24%), and trace amounts of deuterium, helium-3, and lithium-7. Everything heavier had to wait for stars.',
  },
  {
    name: 'Stellar Nucleosynthesis (Low Mass)', emoji: '⭐', time: 'Over billions of years',
    elements: 'C, N, s-process elements (Sr, Ba, Pb)',
    desc: 'Stars like our Sun fuse hydrogen into helium over billions of years. In later stages, they become red giants and fuse helium into carbon via the triple-alpha process. The "slow neutron capture" (s-process) in AGB stars creates heavier elements like barium and lead.',
  },
  {
    name: 'Core-Collapse Supernovae', emoji: '💫', time: 'Milliseconds during explosion',
    elements: 'O, Ne, Mg, Si, S, Fe, and r-process elements',
    desc: 'Massive stars (> 8 M☉) die in core-collapse supernovae. The explosive burning in the outer shells fuses carbon through silicon to iron-peak elements. The rapid neutron capture (r-process) in the shocked ejecta creates many heavy elements. The explosion seeds surrounding space with these elements.',
  },
  {
    name: 'Type Ia Supernovae', emoji: '🔴', time: 'Milliseconds during explosion',
    elements: 'Fe, Ni, Cr, Mn, Ti',
    desc: 'White dwarf stars in binary systems can accrete enough mass to exceed the Chandrasekhar limit (~1.4 M☉) and undergo thermonuclear explosion. These produce enormous amounts of iron-56 via explosive burning — they\'re the main iron factory in the universe.',
  },
  {
    name: 'Neutron Star Mergers', emoji: '🌀', time: 'During and after merger',
    elements: 'Au, Ag, Pt, Eu, U, Th (r-process heavy elements)',
    desc: 'When two neutron stars spiral together and merge, they create a "kilonova" — an explosion of neutron-rich material. The extreme neutron flux drives rapid neutron capture (r-process), creating the heaviest elements: gold, silver, platinum, uranium, and rare earth elements like europium. Confirmed by GW170817 in 2017.',
  },
  {
    name: 'Cosmic Ray Spallation', emoji: '☄️', time: 'Ongoing in interstellar medium',
    elements: 'Li, Be, B (lithium, beryllium, boron)',
    desc: 'High-energy cosmic rays (mostly protons accelerated by supernovae) travel through space and collide with heavier atoms like carbon and oxygen in the interstellar medium. The collision fragments ("spallation") produce lighter elements: lithium, beryllium, and boron — elements too fragile to survive inside stars.',
  },
]

const BODY_ELEMENTS = [
  { element: 'Oxygen (O)', pct: 65, origin: 'Supernovae', color: '#ef4444' },
  { element: 'Carbon (C)', pct: 18, origin: 'Red Giants', color: '#10b981' },
  { element: 'Hydrogen (H)', pct: 10, origin: 'Big Bang', color: '#6366f1' },
  { element: 'Nitrogen (N)', pct: 3, origin: 'Red Giants', color: '#10b981' },
  { element: 'Calcium (Ca)', pct: 1.5, origin: 'Supernovae', color: '#ef4444' },
  { element: 'Phosphorus (P)', pct: 1, origin: 'Supernovae', color: '#ef4444' },
  { element: 'Other', pct: 1.5, origin: 'Various', color: '#6b7280' },
]

export default function StellarNucleosynthesis() {
  const [view, setView] = useState<'origins' | 'processes' | 'you'>('origins')
  const [selectedEl, setSelectedEl] = useState<Element | null>(null)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">⚛️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Stellar Nucleosynthesis</h2>
          <p className="text-yellow-300 text-sm">Where did every atom in the universe come from? You are made of stardust.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['origins', 'processes', 'you'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === v ? 'bg-yellow-700 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {v === 'origins' ? '🗺️ Origin Map' : v === 'processes' ? '⚡ Processes' : '🧑 You Are Stardust'}
          </button>
        ))}
      </div>

      {view === 'origins' && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(ORIGIN_COLORS).map(([origin, color]) => (
              <div key={origin} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-300">{origin}</span>
              </div>
            ))}
          </div>

          {/* Periodic table subset */}
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 mb-4">
            {ELEMENTS.map(el => (
              <button
                key={el.Z}
                onClick={() => setSelectedEl(selectedEl?.Z === el.Z ? null : el)}
                className={`rounded-lg p-1.5 text-center transition-all border ${selectedEl?.Z === el.Z ? 'border-white/50 scale-105' : 'border-white/10 hover:border-white/30'}`}
                style={{ backgroundColor: el.color + '25' }}
                title={el.name}
              >
                <div className="text-[9px] text-gray-500">{el.Z}</div>
                <div className="text-sm font-bold" style={{ color: el.color }}>{el.symbol}</div>
                <div className="text-[8px] text-gray-500 truncate">{el.name}</div>
              </button>
            ))}
          </div>

          {selectedEl && (
            <div className="bg-white/5 rounded-xl p-4 border mb-4 animate-fade-up" style={{ borderColor: selectedEl.color + '50' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold"
                  style={{ backgroundColor: selectedEl.color + '25', color: selectedEl.color }}>
                  {selectedEl.symbol}
                </div>
                <div>
                  <div className="font-bold text-white">{selectedEl.name} (Z={selectedEl.Z})</div>
                  <div className="text-xs px-2 py-0.5 rounded-full inline-block mt-0.5"
                    style={{ backgroundColor: selectedEl.color + '30', color: selectedEl.color }}>
                    {selectedEl.origin}
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{selectedEl.detail}</p>
            </div>
          )}

          <div className="text-xs text-gray-500 text-center">
            Click any element to learn its cosmic origin. Showing {ELEMENTS.length} key elements.
          </div>
        </>
      )}

      {view === 'processes' && (
        <div className="space-y-4">
          {PROCESSES.map(proc => (
            <div key={proc.name} className="bg-white/5 rounded-xl p-4 border border-white/10 flex gap-3">
              <span className="text-3xl flex-shrink-0 mt-0.5">{proc.emoji}</span>
              <div>
                <div className="font-bold text-white mb-0.5">{proc.name}</div>
                <div className="text-xs text-yellow-400 mb-1">{proc.time}</div>
                <div className="text-xs text-cyan-300 mb-2">Elements: {proc.elements}</div>
                <p className="text-sm text-gray-300 leading-relaxed">{proc.desc}</p>
              </div>
            </div>
          ))}

          <div className="bg-indigo-900/30 rounded-xl p-4 border border-indigo-500/20">
            <div className="font-bold text-white mb-2">The Mass Fraction of Elements Today</div>
            <div className="space-y-1.5">
              {[
                { name: 'Hydrogen', pct: 73.9, color: '#6366f1' },
                { name: 'Helium', pct: 24.0, color: '#a78bfa' },
                { name: 'Oxygen', pct: 1.04, color: '#ef4444' },
                { name: 'Carbon', pct: 0.46, color: '#10b981' },
                { name: 'Neon', pct: 0.13, color: '#f97316' },
                { name: 'All others', pct: 0.47, color: '#6b7280' },
              ].map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16">{item.name}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${Math.max(0.5, item.pct)}%`, backgroundColor: item.color }} />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-10 text-right">{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'you' && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl p-5 border border-yellow-500/20">
            <div className="text-white font-bold text-lg mb-2">What are you made of?</div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">
              Your body contains approximately 7 × 10²⁷ atoms. Almost none of them were on Earth when it formed.
              They were forged in stars that lived and died before our Sun was born — and scattered by supernova explosions
              across billions of light-years of space over billions of years, before gravity gathered them into a molecular cloud
              that collapsed into our Solar System. Every atom in your body has a cosmic history.
            </p>
            <div className="space-y-2">
              {BODY_ELEMENTS.map(el => (
                <div key={el.element} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-32">{el.element}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-3">
                    <div className="h-3 rounded-full" style={{ width: `${el.pct}%`, backgroundColor: el.color }} />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-10 text-right">{el.pct}%</span>
                  <span className="text-xs text-gray-500 w-24">{el.origin}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl mb-2">🌟</div>
              <div className="font-bold text-white mb-1">You are a child of dead stars</div>
              <p className="text-sm text-gray-300">Every carbon atom in your DNA was fused in a red giant star that lived and died before the Solar System formed. That star then became a planetary nebula, scattering its contents into space.</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl mb-2">💥</div>
              <div className="font-bold text-white mb-1">Gold in your jewelry: neutron star collision</div>
              <p className="text-sm text-gray-300">The gold in any jewelry you wear was created when two neutron stars smashed together at a fraction of the speed of light, releasing more energy in milliseconds than our Sun will in its entire lifetime.</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl mb-2">💥</div>
              <div className="font-bold text-white mb-1">Your iron: Type Ia supernova</div>
              <p className="text-sm text-gray-300">The iron in your hemoglobin was likely made in a Type Ia supernova — a white dwarf that accreted too much mass and detonated in a thermonuclear explosion. The iron was scattered across interstellar space, then gathered into our solar system.</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl mb-2">🌌</div>
              <div className="font-bold text-white mb-1">The universe made you to observe itself</div>
              <p className="text-sm text-gray-300">"The cosmos is within us. We are made of star-stuff. We are a way for the universe to know itself." — Carl Sagan. Through us, the universe becomes aware of its own history and structure.</p>
            </div>
          </div>

          {/* Timeline of your atoms */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-sm font-semibold text-white mb-3">The Journey of Your Atoms</div>
            <div className="space-y-2 text-xs">
              {[
                { time: '13.8 Gyr ago', event: 'Big Bang: Your hydrogen and helium atoms were created', color: '#6366f1' },
                { time: '12-8 Gyr ago', event: 'First stars lived and died, making carbon, oxygen, iron in their cores', color: '#ef4444' },
                { time: '8-5 Gyr ago', event: 'Two neutron stars collided, forging the gold atoms in your jewelry', color: '#8b5cf6' },
                { time: '4.6 Gyr ago', event: 'A molecular cloud (enriched by supernovae) collapsed to form our Sun and planets', color: '#fbbf24' },
                { time: '4.5 Gyr ago', event: 'Your atoms became part of Earth\'s rocks, oceans, and eventually life', color: '#10b981' },
                { time: 'Billions of years', event: 'Your atoms cycled through countless living things across geological time', color: '#34d399' },
                { time: 'Now', event: 'Your atoms are temporarily arranged as "you" — reading this sentence', color: '#60a5fa' },
              ].map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: step.color }} />
                  <div>
                    <span className="font-mono" style={{ color: step.color }}>{step.time}:</span>
                    <span className="text-gray-300 ml-1">{step.event}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
