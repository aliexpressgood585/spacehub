import { useState } from 'react'

interface Ingredient {
  name: string
  percent: number
  color: string
  note: string
}

interface Recipe {
  id: string
  name: string
  icon: string
  color: string
  category: 'planet' | 'star' | 'moon' | 'nebula' | 'object'
  servings: string
  cookTime: string
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Impossible'
  ingredients: Ingredient[]
  method: string[]
  chefNote: string
  funFact: string
}

const RECIPES: Recipe[] = [
  {
    id: 'earth',
    name: 'Planet Earth',
    icon: '🌍',
    color: '#22c55e',
    category: 'planet',
    servings: '8 billion people',
    cookTime: '4.5 billion years',
    difficulty: 'Hard',
    ingredients: [
      { name: 'Iron', percent: 32.1, color: '#b45309', note: 'mostly in core' },
      { name: 'Oxygen', percent: 30.1, color: '#3b82f6', note: 'bound in silicates' },
      { name: 'Silicon', percent: 15.1, color: '#6b7280', note: 'in crust/mantle' },
      { name: 'Magnesium', percent: 13.9, color: '#a3a3a3', note: 'in mantle' },
      { name: 'Sulfur', percent: 2.9, color: '#fbbf24', note: 'in core' },
      { name: 'Nickel', percent: 1.8, color: '#78716c', note: 'in core' },
      { name: 'Calcium', percent: 1.5, color: '#e5e7eb', note: 'in crust' },
      { name: 'Other', percent: 2.6, color: '#4b5563', note: 'Al, Na, K, etc.' },
    ],
    method: [
      'Begin with a swirling disk of gas and dust around a young star.',
      'Allow dust grains to collide and clump under gravity for ~10 million years.',
      'Let protoplanet heat from impacts and radioactive decay — melt everything.',
      'Allow dense iron/nickel to sink to form the core (differentiation).',
      'Cool for ~50M years. Add late-arriving comets for water delivery.',
      'Stir with moon-forming impact to set tilt and seasons.',
      'Wait 3.8 billion years for life to garnish.',
    ],
    chefNote: 'The secret ingredient is plate tectonics — without it, carbon gets stuck and life can\'t emerge. Don\'t skip this step.',
    funFact: 'Earth is the densest planet in the solar system at 5.51 g/cm³. You could fit 1.3 million Earths inside Jupiter, but Jupiter has only 318× Earth\'s mass.'
  },
  {
    id: 'sun',
    name: 'The Sun',
    icon: '☀️',
    color: '#fbbf24',
    category: 'star',
    servings: '1 solar system',
    cookTime: '~50 million years to ignite',
    difficulty: 'Medium',
    ingredients: [
      { name: 'Hydrogen', percent: 73.46, color: '#3b82f6', note: 'the fuel' },
      { name: 'Helium', percent: 24.85, color: '#fbbf24', note: 'the ash' },
      { name: 'Oxygen', percent: 0.77, color: '#06b6d4', note: 'trace' },
      { name: 'Carbon', percent: 0.29, color: '#374151', note: 'trace' },
      { name: 'Iron', percent: 0.16, color: '#b45309', note: 'trace' },
      { name: 'Neon', percent: 0.12, color: '#f97316', note: 'trace' },
      { name: 'Nitrogen', percent: 0.09, color: '#6366f1', note: 'trace' },
      { name: 'Other', percent: 0.26, color: '#4b5563', note: 'Si, Mg, S, etc.' },
    ],
    method: [
      'Collect 1.989 × 10³⁰ kg of primordial gas (mostly hydrogen from Big Bang).',
      'Allow gravity to compress the gas cloud over millions of years.',
      'When core temperature reaches 15 million°C, nuclear fusion begins.',
      'Fuse hydrogen → helium, releasing energy as light and heat.',
      'Let outward radiation pressure balance gravity — stellar equilibrium achieved.',
      'Bake at 5,778K surface temperature for ~5 billion years.',
    ],
    chefNote: 'The Sun converts 600 million tons of hydrogen to helium every second. It\'s been doing this for 4.6 billion years and has fuel for another 5 billion.',
    funFact: 'Every second, the Sun converts 4 million tons of mass to pure energy via E=mc². That energy takes 100,000 years to reach the surface, then 8 minutes to reach you.'
  },
  {
    id: 'mars',
    name: 'Planet Mars',
    icon: '🔴',
    color: '#ef4444',
    category: 'planet',
    servings: '0 (uninhabited)',
    cookTime: '4.5 billion years',
    difficulty: 'Medium',
    ingredients: [
      { name: 'Iron Oxide (Rust)', percent: 18.0, color: '#ef4444', note: 'gives the red color' },
      { name: 'Silicon Dioxide', percent: 21.0, color: '#9ca3af', note: 'sand/glass' },
      { name: 'Iron', percent: 12.0, color: '#b45309', note: 'in core' },
      { name: 'Magnesium Oxide', percent: 8.6, color: '#d1d5db', note: 'in mantle' },
      { name: 'Aluminum Oxide', percent: 8.0, color: '#6b7280', note: 'in crust' },
      { name: 'Calcium Oxide', percent: 6.3, color: '#f9fafb', note: 'in regolith' },
      { name: 'CO₂ Atmosphere', percent: 0.02, color: '#374151', note: '96% CO₂ by composition' },
      { name: 'Other', percent: 26.08, color: '#4b5563', note: 'sulfates, perchlorates' },
    ],
    method: [
      'Start with same recipe as Earth but use only 1/10th the mass.',
      'Lack sufficient gravity — atmosphere bleeds away into space.',
      'Without thick atmosphere, magnetic field collapses ~4B years ago.',
      'Solar wind strips remaining atmosphere. Rivers and oceans evaporate.',
      'Iron oxidizes (rusts) giving planet its red hue.',
      'Freeze everything. Add dust storms lasting months. Serve cold.',
    ],
    chefNote: 'Mars had liquid water for ~1 billion years. It was once Earth-like. The key mistake: too small to retain its atmosphere. Size matters in planet-making.',
    funFact: 'Martian soil (regolith) contains perchlorates — toxic to Earth life but potentially usable as rocket fuel. The red color is from iron(III) oxide — literally rust.'
  },
  {
    id: 'jupiter',
    name: 'Planet Jupiter',
    icon: '🪐',
    color: '#a855f7',
    category: 'planet',
    servings: '95 moons (and counting)',
    cookTime: '~1 million years',
    difficulty: 'Easy',
    ingredients: [
      { name: 'Hydrogen (gas)', percent: 75.0, color: '#3b82f6', note: 'outer atmosphere' },
      { name: 'Helium (gas)', percent: 24.0, color: '#fbbf24', note: 'outer atmosphere' },
      { name: 'Metallic Hydrogen', percent: 0.5, color: '#6366f1', note: 'exotic liquid under pressure' },
      { name: 'Methane', percent: 0.3, color: '#22c55e', note: 'trace' },
      { name: 'Ammonia', percent: 0.026, color: '#fde68a', note: 'forms cloud bands' },
      { name: 'Water Vapor', percent: 0.004, color: '#bfdbfe', note: 'deep atmosphere' },
      { name: 'Rocky/Icy Core?', percent: 0.17, color: '#78716c', note: 'uncertain — possibly no solid core' },
    ],
    method: [
      'Collect 1/1000th of total solar system mass (excluding Sun).',
      'Gas falls so fast it generates heat — Jupiter still radiates more energy than it receives.',
      'No solid surface forms — pressure increases smoothly from gas to liquid to metal.',
      'Allow hydrogen to become electrically conductive under 1 million atm pressure.',
      'Generate massive magnetic field — 14× stronger than Earth\'s.',
      'Stir vigorously. Add Great Red Spot — a storm larger than Earth. Leave running for 350+ years.',
    ],
    chefNote: 'Jupiter failed to become a star — it would need ~80× more mass to trigger fusion. It is, however, the most planet-like thing in the solar system. It grew so fast it destabilized all the inner planets.',
    funFact: 'Jupiter\'s Great Red Spot is shrinking — it was 3× Earth\'s size in 1800s, now it\'s barely Earth-sized. Nobody knows if it will disappear or stabilize.'
  },
  {
    id: 'nebula',
    name: 'Eagle Nebula',
    icon: '🌌',
    color: '#06b6d4',
    category: 'nebula',
    servings: '~6,500 light-years of beauty',
    cookTime: '5.5 million years',
    difficulty: 'Impossible',
    ingredients: [
      { name: 'Hydrogen Gas', percent: 70.0, color: '#3b82f6', note: 'the main medium' },
      { name: 'Helium Gas', percent: 28.0, color: '#fbbf24', note: 'primordial' },
      { name: 'Oxygen (ionized)', percent: 0.8, color: '#06b6d4', note: 'gives blue-green glow' },
      { name: 'Sulfur (ionized)', percent: 0.5, color: '#f97316', note: 'gives orange-red tones' },
      { name: 'Nitrogen (ionized)', percent: 0.4, color: '#8b5cf6', note: 'adds purple hues' },
      { name: 'Dust Grains', percent: 0.3, color: '#78716c', note: 'silicates, carbon' },
    ],
    method: [
      'Begin with giant molecular cloud — thousands of solar masses of gas.',
      'Allow a nearby supernova shockwave to compress the cloud.',
      'Watch gravity collapse individual clumps into star-forming regions.',
      'New stars emit intense UV radiation, ionizing surrounding gas.',
      'Gas glows in characteristic emission lines — each element a different color.',
      'Photograph with Hubble. Post viral image: "Pillars of Creation."',
    ],
    chefNote: 'The Pillars of Creation are likely already destroyed — a supernova probably vaporized them ~6,000 years ago. We\'re still seeing the light from before the explosion.',
    funFact: 'Hubble\'s 1995 "Pillars of Creation" image is one of the most famous photographs ever taken. It shows columns of interstellar gas where stars are actively forming right now.'
  },
  {
    id: 'neutron_star',
    name: 'Neutron Star',
    icon: '💫',
    color: '#f97316',
    category: 'object',
    servings: '20km diameter, 2 solar masses',
    cookTime: 'Seconds (in supernova)',
    difficulty: 'Impossible',
    ingredients: [
      { name: 'Neutrons', percent: 99.0, color: '#94a3b8', note: 'packed impossibly tight' },
      { name: 'Protons/Electrons', percent: 0.5, color: '#3b82f6', note: 'merged under pressure' },
      { name: 'Strange Quarks?', percent: 0.5, color: '#a855f7', note: 'theoretical quark matter core' },
    ],
    method: [
      'Take a massive star (8-20 solar masses) after it runs out of fuel.',
      'Allow core to collapse in 0.1 seconds — from Earth-size to 20km.',
      'Electrons and protons merge: p + e⁻ → n + ν (proton + electron → neutron + neutrino).',
      'Core bounces — shock wave tears star apart in supernova.',
      'Left with 1.4-2 solar masses packed into 20km sphere.',
      'Spin up to 716 rotations per second. Emit radio pulses like a lighthouse.',
    ],
    chefNote: 'A teaspoon of neutron star material weighs ~10 million tons. The density is comparable to squeezing the entire human population into a sugar cube.',
    funFact: 'Pulsars (rotating neutron stars) are the most precise natural clocks in the universe — more accurate than atomic clocks. Astronomers use them to detect gravitational waves.'
  },
]

const CATEGORY_COLORS = {
  planet: '#22c55e',
  star: '#fbbf24',
  moon: '#94a3b8',
  nebula: '#06b6d4',
  object: '#f97316',
}

const DIFFICULTY_COLORS = {
  Easy: '#22c55e',
  Medium: '#fbbf24',
  Hard: '#f97316',
  Impossible: '#ef4444',
}

export default function CosmicRecipeBook() {
  const [selected, setSelected] = useState<Recipe>(RECIPES[0])
  const [showMethod, setShowMethod] = useState(false)

  const total = selected.ingredients.reduce((s, i) => s + i.percent, 0)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Cosmic Recipe Book</h2>
      <p className="text-gray-400 text-sm mb-5">What's everything in the universe made of? Real science, served as recipes.</p>

      {/* Recipe selector */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        {RECIPES.map(r => (
          <button
            key={r.id}
            onClick={() => { setSelected(r); setShowMethod(false) }}
            className="p-3 rounded-xl transition-all text-center"
            style={{
              background: selected.id === r.id ? r.color + '20' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.id === r.id ? r.color + '60' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-2xl mb-1">{r.icon}</div>
            <div className="text-xs font-bold leading-tight" style={{ color: selected.id === r.id ? r.color : '#9ca3af' }}>{r.name}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recipe card */}
        <div className="space-y-4">
          <div className="rounded-xl p-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
            <div className="flex items-start gap-3 mb-4">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: CATEGORY_COLORS[selected.category] + '25', color: CATEGORY_COLORS[selected.category] }}>
                    {selected.category.toUpperCase()}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: DIFFICULTY_COLORS[selected.difficulty] + '25', color: DIFFICULTY_COLORS[selected.difficulty] }}>
                    {selected.difficulty.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div><span className="text-gray-500">⏱ Time:</span> <span className="text-gray-300">{selected.cookTime}</span></div>
              <div><span className="text-gray-500">🍽 Serves:</span> <span className="text-gray-300">{selected.servings}</span></div>
            </div>
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Ingredients</div>
            <div className="space-y-2">
              {selected.ingredients.map(ing => (
                <div key={ing.name}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-300">{ing.name} <span className="text-gray-600">— {ing.note}</span></span>
                    <span className="font-mono font-bold text-gray-400">{ing.percent.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(ing.percent / (total > 100 ? total : 100)) * 100}%`, background: ing.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Method + notes */}
        <div className="space-y-4">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <button
              onClick={() => setShowMethod(v => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="text-gray-400 text-xs uppercase font-semibold">Method</div>
              <span className="text-xs text-indigo-400">{showMethod ? '▲ hide' : '▼ show all steps'}</span>
            </button>
            <ol className="mt-3 space-y-2">
              {(showMethod ? selected.method : selected.method.slice(0, 3)).map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: selected.color + '30', color: selected.color }}>{i + 1}</span>
                  {step}
                </li>
              ))}
              {!showMethod && selected.method.length > 3 && (
                <li className="text-gray-600 text-xs pl-7">+ {selected.method.length - 3} more steps...</li>
              )}
            </ol>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">👨‍🍳 Chef's Note</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.chefNote}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🍴 Fun Fact</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
