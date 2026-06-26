import { useState } from 'react'

interface LifecycleStage {
  name: string
  icon: string
  color: string
  duration: string
  tempK: number
  luminosity: string
  description: string
  size: number   // relative display size 1-10
}

interface StarPath {
  massLabel: string
  massSolar: number
  color: string
  icon: string
  description: string
  lifespan: string
  stages: LifecycleStage[]
  endState: string
  endIcon: string
  endColor: string
  funFact: string
}

const STAR_PATHS: StarPath[] = [
  {
    massLabel: '< 0.08 M☉',
    massSolar: 0.05,
    color: '#94a3b8',
    icon: '🟤',
    description: 'Brown Dwarf — failed star',
    lifespan: 'Indefinite (never fuses H)',
    endState: 'Stays a brown dwarf forever',
    endIcon: '🟤',
    endColor: '#78716c',
    funFact: 'Brown dwarfs are "failed stars" — too massive to be planets, too light to ignite. They glow dimly from residual heat for trillions of years. They outnumber regular stars.',
    stages: [
      { name: 'Protostar', icon: '☁️', color: '#78716c', duration: '~1M years', tempK: 2000, luminosity: 'Dim', description: 'Gas cloud collapses but never reaches fusion temperature.', size: 3 },
      { name: 'Brown Dwarf', icon: '🟤', color: '#92400e', duration: 'Trillions of years', tempK: 1000, luminosity: 'Very dim', description: 'Glows from gravitational contraction heat. No hydrogen fusion.', size: 4 },
    ]
  },
  {
    massLabel: '0.08 – 0.5 M☉',
    massSolar: 0.3,
    color: '#ef4444',
    icon: '🔴',
    description: 'Red Dwarf — most common star type',
    lifespan: '1 – 10+ trillion years',
    endState: 'White Dwarf (black dwarf in theory)',
    endIcon: '⚪',
    endColor: '#e2e8f0',
    funFact: 'Red dwarfs are the most abundant stars — making up ~75% of all stars in the Milky Way. They burn so slowly they will outlive the universe\'s current age many times over. TRAPPIST-1 is a red dwarf.',
    stages: [
      { name: 'Nebula/Protostar', icon: '☁️', color: '#7c3aed', duration: '~1M years', tempK: 3000, luminosity: 'Dim', description: 'Gas cloud collapses under gravity, heats up.', size: 3 },
      { name: 'Main Sequence (Red Dwarf)', icon: '🔴', color: '#ef4444', duration: '1-10 trillion years', tempK: 3000, luminosity: '0.001 – 0.1 L☉', description: 'Fuses hydrogen to helium slowly and steadily. No red giant phase — convects fully.', size: 4 },
      { name: 'White Dwarf', icon: '⚪', color: '#e2e8f0', duration: 'Trillions of years', tempK: 25000, luminosity: 'Very dim', description: 'Core contracts to degenerate matter after hydrogen runs out.', size: 2 },
    ]
  },
  {
    massLabel: '0.5 – 2 M☉',
    massSolar: 1.0,
    color: '#fbbf24',
    icon: '⭐',
    description: 'Sun-like Star — our Sun\'s fate',
    lifespan: '~10 billion years',
    endState: 'Planetary Nebula → White Dwarf',
    endIcon: '🌀',
    endColor: '#a855f7',
    funFact: 'Our Sun will swell into a red giant in ~5 billion years, engulfing Mercury and Venus. Earth may survive, but will be scorched. The Sun will then become a beautiful planetary nebula before settling as a white dwarf.',
    stages: [
      { name: 'Nebula', icon: '🌌', color: '#4f46e5', duration: '~50M years', tempK: 100, luminosity: 'None (star)', description: 'Molecular cloud collapses, spins up, forms protoplanetary disk.', size: 2 },
      { name: 'Protostar', icon: '🌟', color: '#f97316', duration: '~10M years', tempK: 4000, luminosity: 'Flickering', description: 'Core heats. T Tauri phase — variable, active, strong stellar winds.', size: 4 },
      { name: 'Main Sequence', icon: '☀️', color: '#fbbf24', duration: '~10 billion years', tempK: 5778, luminosity: '1 L☉', description: 'Hydrogen fusion in core. Stable for billions of years.', size: 5 },
      { name: 'Red Giant', icon: '🔴', color: '#ef4444', duration: '~1 billion years', tempK: 3500, luminosity: '~100-1000 L☉', description: 'Hydrogen shell burning causes outer layers to expand massively.', size: 9 },
      { name: 'Planetary Nebula', icon: '🌀', color: '#a855f7', duration: '~50,000 years', tempK: 25000, luminosity: 'Variable', description: 'Outer layers expelled, creating glowing nebula. Core exposed.', size: 7 },
      { name: 'White Dwarf', icon: '💎', color: '#bfdbfe', duration: 'Billions of years', tempK: 100000, luminosity: 'Declining', description: 'Earth-sized dense core, no fusion. Cools over billions of years.', size: 2 },
    ]
  },
  {
    massLabel: '2 – 8 M☉',
    massSolar: 5.0,
    color: '#3b82f6',
    icon: '💙',
    description: 'Intermediate Mass Star',
    lifespan: '50M – 2 billion years',
    endState: 'Planetary Nebula → White Dwarf',
    endIcon: '💎',
    endColor: '#bfdbfe',
    funFact: 'These stars burn much hotter and faster than our Sun. Sirius A (2× Sun) will last only 1-2 billion years total — its main sequence is nearly done. Rigel A (21 M☉) will explode in just a few million years.',
    stages: [
      { name: 'Nebula/Protostar', icon: '☁️', color: '#4f46e5', duration: '~1M years', tempK: 5000, luminosity: 'Dim', description: 'More massive collapse, forms faster.', size: 3 },
      { name: 'Main Sequence', icon: '💙', color: '#3b82f6', duration: '50M – 2B years', tempK: 10000, luminosity: '10-100 L☉', description: 'Blue-white star fusing hydrogen faster than the Sun.', size: 6 },
      { name: 'Red Giant / AGB', icon: '🔴', color: '#ef4444', duration: '~100M years', tempK: 3500, luminosity: '1000-10000 L☉', description: 'Expands dramatically, fuses heavier elements.', size: 9 },
      { name: 'Planetary Nebula', icon: '🌀', color: '#a855f7', duration: '~50,000 years', tempK: 50000, luminosity: 'High UV', description: 'More luminous and complex nebula than Sun-like stars produce.', size: 7 },
      { name: 'White Dwarf', icon: '💎', color: '#bfdbfe', duration: 'Billions of years', tempK: 100000, luminosity: 'Declining', description: 'Hot dense core cools over billions of years.', size: 2 },
    ]
  },
  {
    massLabel: '8 – 20 M☉',
    massSolar: 12.0,
    color: '#a855f7',
    icon: '🟣',
    description: 'High Mass Star → Supernova',
    lifespan: '10 – 100 million years',
    endState: 'Core Collapse Supernova → Neutron Star',
    endIcon: '💫',
    endColor: '#a855f7',
    funFact: 'High-mass stars are the universe\'s element factories. They forge carbon, oxygen, silicon, iron — everything in your body — then scatter it across the galaxy in a supernova explosion visible billions of light-years away.',
    stages: [
      { name: 'Protostar', icon: '🌟', color: '#f97316', duration: '~0.1M years', tempK: 10000, luminosity: 'High', description: 'Fast collapse, immediate ignition. May ionize surrounding gas.', size: 4 },
      { name: 'O/B Main Sequence', icon: '🟣', color: '#a855f7', duration: '10-100M years', tempK: 25000, luminosity: '1000-500000 L☉', description: 'Blazing blue-white star, burning fast. Ionizes surrounding nebula.', size: 7 },
      { name: 'Red / Blue Supergiant', icon: '🔴', color: '#ef4444', duration: '~1M years', tempK: 3500, luminosity: '100000 L☉', description: 'Fuses carbon, neon, oxygen, silicon in layers like an onion.', size: 10 },
      { name: 'Supernova', icon: '💥', color: '#fbbf24', duration: 'Seconds → weeks', tempK: 100000000000, luminosity: '~10¹⁰ L☉', description: 'Core collapses in 0.1s. Shock wave tears star apart. Visible across galaxies.', size: 10 },
      { name: 'Neutron Star', icon: '💫', color: '#a855f7', duration: 'Billions of years', tempK: 600000, luminosity: 'X-ray emissions', description: '20 km wide, 1.4 M☉. May pulse as a pulsar 716 times/second.', size: 1 },
    ]
  },
  {
    massLabel: '> 20 M☉',
    massSolar: 50.0,
    color: '#ec4899',
    icon: '🔥',
    description: 'Hypermassive Star → Black Hole',
    lifespan: '< 10 million years',
    endState: 'Hypernova / GRB → Black Hole',
    endIcon: '⚫',
    endColor: '#1e1b4b',
    funFact: 'The most massive stars die in hypernovae — explosions 10-100× more energetic than regular supernovae. If oriented toward Earth, they emit gamma-ray bursts — the most energetic events in the universe since the Big Bang.',
    stages: [
      { name: 'Protostar', icon: '🌟', color: '#f97316', duration: 'Thousands of years', tempK: 15000, luminosity: 'Extreme', description: 'Ignites almost immediately. Wolf-Rayet winds begin.', size: 5 },
      { name: 'Main Sequence (O type)', icon: '🔥', color: '#ec4899', duration: '2-10M years', tempK: 50000, luminosity: '10⁶ L☉', description: 'The most luminous stars in the universe. May lose mass faster than they fuse it.', size: 8 },
      { name: 'Wolf-Rayet / LBV', icon: '🌀', color: '#f97316', duration: '~1M years', tempK: 25000, luminosity: 'Erupting', description: 'Luminous Blue Variable phase — eruptions expel outer layers. Exposes naked core.', size: 9 },
      { name: 'Hypernova / GRB', icon: '💥', color: '#fbbf24', duration: 'Seconds', tempK: 10000000000000, luminosity: 'All stars in universe', description: 'Direct collapse or failed supernova → gamma-ray burst + hypernova. Outshines entire galaxies.', size: 10 },
      { name: 'Black Hole', icon: '⚫', color: '#1e1b4b', duration: '∞ (until Hawking radiation)', tempK: 0, luminosity: 'None (or Hawking)', description: 'Stellar mass black hole of 3-100 M☉. Devours nearby matter, may form accretion disk.', size: 3 },
    ]
  },
]

export default function StellarLifecycle() {
  const [selected, setSelected] = useState<StarPath>(STAR_PATHS[2])
  const [activeStage, setActiveStage] = useState<number | null>(null)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Stellar Lifecycle</h2>
      <p className="text-gray-400 text-sm mb-5">How stars live and die — from birth in a nebula to a black hole, neutron star, or white dwarf.</p>

      {/* Mass selector */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
        {STAR_PATHS.map((path, i) => (
          <button
            key={i}
            onClick={() => { setSelected(path); setActiveStage(null) }}
            className="p-3 rounded-xl transition-all text-center"
            style={{
              background: selected.massLabel === path.massLabel ? path.color + '20' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.massLabel === path.massLabel ? path.color + '60' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-2xl mb-1">{path.icon}</div>
            <div className="text-[10px] font-bold leading-tight" style={{ color: selected.massLabel === path.massLabel ? path.color : '#6b7280' }}>
              {path.massLabel}
            </div>
          </button>
        ))}
      </div>

      {/* Selected star info */}
      <div className="rounded-xl p-4 mb-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{selected.icon}</span>
          <div>
            <h3 className="text-lg font-bold text-white">{selected.description}</h3>
            <div className="text-gray-400 text-sm">Lifespan: <span style={{ color: selected.color }}>{selected.lifespan}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Final fate:</span>
          <span className="text-xl">{selected.endIcon}</span>
          <span style={{ color: selected.endColor }}>{selected.endState}</span>
        </div>
      </div>

      {/* Lifecycle stages */}
      <div className="mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Lifecycle Stages — click to explore</div>
        <div className="flex items-end gap-3 flex-wrap">
          {selected.stages.map((stage, i) => (
            <button
              key={i}
              onClick={() => setActiveStage(activeStage === i ? null : i)}
              className="flex flex-col items-center gap-1 transition-all"
            >
              <div
                className="rounded-full flex items-center justify-center text-base transition-all border-2"
                style={{
                  width: `${stage.size * 6 + 20}px`,
                  height: `${stage.size * 6 + 20}px`,
                  background: activeStage === i ? stage.color + '30' : stage.color + '15',
                  borderColor: activeStage === i ? stage.color : stage.color + '40',
                  fontSize: `${Math.max(14, stage.size * 2 + 8)}px`,
                }}
              >{stage.icon}</div>
              <div className="text-[9px] text-gray-500 text-center max-w-[70px] leading-tight">{stage.name}</div>
              {i < selected.stages.length - 1 && (
                <div className="absolute" style={{ left: '100%', top: '50%' }}>→</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stage detail */}
      {activeStage !== null && (
        <div className="rounded-xl p-4 mb-4" style={{
          background: selected.stages[activeStage].color + '12',
          border: `1px solid ${selected.stages[activeStage].color}35`
        }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl">{selected.stages[activeStage].icon}</span>
            <div>
              <h4 className="text-base font-bold text-white">{selected.stages[activeStage].name}</h4>
              <div className="text-xs text-gray-500">Duration: {selected.stages[activeStage].duration}</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-2">{selected.stages[activeStage].description}</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-gray-500">Temperature</div>
              <div className="font-bold text-white">
                {selected.stages[activeStage].tempK > 1e9
                  ? `${(selected.stages[activeStage].tempK / 1e9).toFixed(0)}B K`
                  : selected.stages[activeStage].tempK > 1e6
                  ? `${(selected.stages[activeStage].tempK / 1e6).toFixed(0)}M K`
                  : `${selected.stages[activeStage].tempK.toLocaleString()} K`}
              </div>
            </div>
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-gray-500">Luminosity</div>
              <div className="font-bold text-white">{selected.stages[activeStage].luminosity}</div>
            </div>
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-gray-500">Relative Size</div>
              <div className="font-bold text-white">{'█'.repeat(selected.stages[activeStage].size)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
        <div className="text-amber-400 text-xs uppercase font-semibold mb-2">⭐ Key Fact</div>
        <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
      </div>
    </div>
  )
}
