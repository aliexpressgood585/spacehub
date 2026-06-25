import { useState } from 'react'

interface FoodItem {
  name: string
  type: string
  calories: number
  prep: string
  missions: string[]
  emoji: string
  fact: string
}

const FOOD_ITEMS: FoodItem[] = [
  { name: 'Tortillas', type: 'Bread', calories: 140, prep: 'Ready to eat', missions: ['Space Shuttle', 'ISS'], emoji: '🫓', fact: 'Replaced bread on Shuttle — no crumbs floating into equipment!' },
  { name: 'Freeze-dried Ice Cream', type: 'Dessert', calories: 160, prep: 'Ready to eat', missions: ['Apollo'], emoji: '🍦', fact: 'Actually only flown on one mission (Apollo 7). Museum gift shops made it famous.' },
  { name: 'Shrimp Cocktail', type: 'Main', calories: 90, prep: 'Rehydrate', missions: ['Gemini', 'Apollo', 'Space Shuttle'], emoji: '🍤', fact: 'Most requested item in NASA space food history. Astronauts love the strong flavor.' },
  { name: 'Mac & Cheese', type: 'Main', calories: 240, prep: 'Rehydrate', missions: ['ISS'], emoji: '🧀', fact: 'Chris Hadfield made a famous YouTube video eating mac & cheese on ISS.' },
  { name: 'Fresh Fruit', type: 'Snack', calories: 80, prep: 'Ready to eat', missions: ['ISS (early days only)'], emoji: '🍎', fact: 'Only available during the first few days after resupply — then it\'s gone!' },
  { name: 'Tea / Coffee', type: 'Drink', calories: 5, prep: 'Rehydrate', missions: ['All crewed missions'], emoji: '☕', fact: 'Drunk from sealed pouches with straws. Hot beverages are a major morale booster.' },
  { name: 'Chicken Teriyaki', type: 'Main', calories: 290, prep: 'Thermostabilized', missions: ['ISS'], emoji: '🍗', fact: 'JAXA developed this for Japanese astronauts. Cultural food is important for long missions.' },
  { name: 'Borscht (Beet soup)', type: 'Soup', calories: 120, prep: 'Rehydrate', missions: ['Voskhod', 'Soyuz', 'Mir'], emoji: '🥣', fact: 'Russian cosmonauts have eaten borscht in space since 1964. Comes in a tube.' },
  { name: 'M&Ms', type: 'Snack', calories: 180, prep: 'Ready to eat', missions: ['Space Shuttle', 'ISS'], emoji: '🍫', fact: 'Candy-coated so they don\'t crumble. Astronauts let them float and catch them in their mouths.' },
  { name: 'Dried Beef (Space Sticks)', type: 'Snack', calories: 120, prep: 'Ready to eat', missions: ['Gemini'], emoji: '🥩', fact: 'First real food eaten in space by John Glenn (1962), who ate applesauce from a tube.' },
  { name: 'Rehydrated Scrambled Eggs', type: 'Breakfast', calories: 160, prep: 'Rehydrate', missions: ['Apollo', 'Space Shuttle', 'ISS'], emoji: '🍳', fact: 'Taste is bland due to smell/taste changes in microgravity — congestion from fluid shift to head.' },
  { name: 'Almond Fudge Brownie', type: 'Dessert', calories: 200, prep: 'Ready to eat', missions: ['ISS (holiday meals)'], emoji: '🍪', fact: 'Part of the holiday meal for astronauts — NASA plans special menus for Thanksgiving and Christmas.' },
]

const CHALLENGES = [
  { icon: '👅', title: 'Taste changes', desc: 'Fluid shifts to the head cause nasal congestion — taste is muted. Astronauts prefer spicy and strong-flavored foods.' },
  { icon: '🌀', title: 'No convection', desc: 'In microgravity, hot air doesn\'t rise. No convection means a different cooking physics. Bread would be a fire hazard.' },
  { icon: '💨', title: 'No crumbs allowed', desc: 'Floating crumbs can be inhaled, contaminate equipment, or short-circuit electronics. Hence tortillas.' },
  { icon: '🧂', title: 'Salt & pepper liquid', desc: 'Salt and pepper must be dissolved in liquid (water/oil) to avoid floating. Spice packets need careful handling.' },
  { icon: '🥤', title: 'Liquid behavior', desc: 'Liquids form floating spheres. Drinking from open cups is impossible — sealed pouches with straws only.' },
  { icon: '🏋️', title: 'Muscle & bone loss', desc: 'Requires 2h exercise/day to prevent muscle atrophy and bone density loss of 1%/month. Food must support this.' },
  { icon: '❄️', title: 'Limited refrigeration', desc: 'ISS has limited cold storage. Most food is ambient-stable: freeze-dried, thermostabilized, or irradiated.' },
  { icon: '♻️', title: 'Water recycling', desc: 'ISS recycles ~90% of all water including urine and cabin humidity. Rehydrating food from recycled water.' },
]

const MISSIONS_NUTRITION = [
  { mission: 'Mercury (1961-63)', calories: 1700, protein_g: 70, approach: 'Squeezable tubes and bite-size cubes' },
  { mission: 'Gemini (1961-66)', calories: 2000, protein_g: 80, approach: 'Freeze-dried food in rehydratable packages' },
  { mission: 'Apollo (1969-72)', calories: 2800, protein_g: 105, approach: 'Wetpack foods, hot water available' },
  { mission: 'Space Shuttle (1981-2011)', calories: 3000, protein_g: 115, approach: 'Personal preference menu, fresh food at launch' },
  { mission: 'ISS (1998-present)', calories: 3200, protein_g: 120, approach: 'International menu, 200+ items, fresh food deliveries' },
  { mission: 'Mars Mission (future)', calories: 3100, protein_g: 125, approach: '3-year supply, bioregenerative food production required' },
]

export default function SpaceFoodGuide() {
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [activeSection, setActiveSection] = useState<'food' | 'challenges' | 'history'>('food')

  const types = ['all', ...Array.from(new Set(FOOD_ITEMS.map(f => f.type)))]
  const filtered = filterType === 'all' ? FOOD_ITEMS : FOOD_ITEMS.filter(f => f.type === filterType)

  const typeColors: Record<string, string> = {
    Main: '#f97316', Snack: '#f59e0b', Dessert: '#ec4899', Breakfast: '#facc15',
    Drink: '#60a5fa', Soup: '#34d399', Bread: '#a78bfa',
  }

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🍽️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Food Guide</h2>
          <p className="text-orange-300 text-sm">What astronauts eat, how food works in microgravity</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['food', 'challenges', 'history'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${activeSection === s ? 'bg-orange-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {s === 'food' ? '🍱 Space Menu' : s === 'challenges' ? '⚠️ Challenges' : '📜 History'}
          </button>
        ))}
      </div>

      {activeSection === 'food' && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {types.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2 py-1 text-xs rounded-full border transition-all capitalize ${filterType === t ? 'border-orange-500 text-white' : 'border-white/20 text-gray-400 hover:border-orange-500/50'}`}
                style={filterType === t ? { backgroundColor: (typeColors[t] || '#f97030') + '30' } : {}}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mb-4">
            {filtered.map(food => (
              <button
                key={food.name}
                onClick={() => setSelectedFood(selectedFood?.name === food.name ? null : food)}
                className={`p-3 rounded-xl border text-left transition-all ${selectedFood?.name === food.name ? 'border-orange-500 bg-orange-900/20' : 'border-white/10 bg-white/5 hover:border-orange-500/40'}`}
              >
                <div className="text-2xl mb-1">{food.emoji}</div>
                <div className="text-sm font-medium text-white">{food.name}</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: typeColors[food.type] + '30', color: typeColors[food.type] }}>{food.type}</span>
                  <span className="text-xs text-gray-500">{food.calories} kcal</span>
                </div>
              </button>
            ))}
          </div>

          {selectedFood && (
            <div className="bg-white/5 rounded-xl p-4 border border-orange-500/30">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{selectedFood.emoji}</span>
                <div>
                  <div className="font-bold text-white text-lg">{selectedFood.name}</div>
                  <div className="text-xs text-gray-400">{selectedFood.prep} · {selectedFood.calories} kcal</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="text-xs bg-white/5 rounded p-2">
                  <div className="text-gray-500">Preparation</div>
                  <div className="text-white">{selectedFood.prep}</div>
                </div>
                <div className="text-xs bg-white/5 rounded p-2">
                  <div className="text-gray-500">Flown on</div>
                  <div className="text-white">{selectedFood.missions.join(', ')}</div>
                </div>
              </div>
              <div className="text-sm text-orange-200 bg-orange-900/20 rounded p-2 border border-orange-500/20">
                💡 {selectedFood.fact}
              </div>
            </div>
          )}
        </>
      )}

      {activeSection === 'challenges' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CHALLENGES.map(c => (
            <div key={c.title} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="font-semibold text-white mb-1">{c.title}</div>
              <p className="text-sm text-gray-400">{c.desc}</p>
            </div>
          ))}

          <div className="sm:col-span-2 bg-blue-900/20 rounded-xl p-4 border border-blue-500/20">
            <div className="font-semibold text-blue-300 mb-2">🌱 Future: Bioregenerative Life Support</div>
            <p className="text-sm text-gray-300">
              For Mars missions (3 years), resupply is impossible. NASA is developing <strong className="text-white">bioregenerative food production</strong> — growing plants in space. The ISS VEGGIE experiment has already grown lettuce, radishes, and chili peppers. A 4-person Mars crew would need ~2 hectares of growing area to be fully food self-sufficient.
            </p>
          </div>
        </div>
      )}

      {activeSection === 'history' && (
        <div className="space-y-3">
          {MISSIONS_NUTRITION.map(m => (
            <div key={m.mission} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="font-semibold text-white">{m.mission}</div>
                <div className="flex gap-3 text-xs">
                  <span className="text-orange-300">{m.calories} kcal/day</span>
                  <span className="text-blue-300">{m.protein_g}g protein</span>
                </div>
              </div>
              <div className="text-xs text-gray-400">{m.approach}</div>
              <div className="mt-2 bg-white/5 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-orange-500 to-orange-300 transition-all"
                  style={{ width: `${(m.calories / 3200) * 100}%` }}
                />
              </div>
            </div>
          ))}

          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs font-semibold text-yellow-300 mb-2">Historic first foods in space</div>
            <div className="space-y-1 text-xs text-gray-300">
              {[
                { year: '1961', who: 'Yuri Gagarin', food: 'Pureed meat and chocolate sauce in aluminum tubes' },
                { year: '1962', who: 'John Glenn', food: 'Applesauce from a squeezable tube (first American to eat in orbit)' },
                { year: '1965', who: 'John Young', food: 'Smuggled corned beef sandwich — caused NASA controversy!' },
                { year: '1969', who: 'Apollo 11 crew', food: 'Bacon squares, peaches, and sugar cookie cubes on the Moon mission' },
                { year: '2015', who: 'Scott Kelly / Kjell Lindgren', food: 'First fresh-grown space lettuce (VEGGIE experiment)' },
              ].map(i => (
                <div key={i.year} className="flex gap-2">
                  <span className="text-yellow-400 font-mono w-10 flex-shrink-0">{i.year}</span>
                  <span><span className="text-white">{i.who}:</span> {i.food}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
