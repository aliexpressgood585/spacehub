import { useState } from 'react'

interface LifeEvent {
  time: string
  bya: number
  event: string
  category: 'cosmic' | 'earth' | 'life' | 'complex' | 'human'
  detail: string
  significance: string
}

interface HabitableWorld {
  name: string
  type: string
  distance: string
  potential: 'high' | 'medium' | 'low'
  liquid: string
  energy: string
  biosignatures: string
  notes: string
}

interface LifeSignature {
  molecule: string
  detected: boolean
  location: string
  significance: string
  icon: string
}

const TIMELINE: LifeEvent[] = [
  { time: '13.8 Gya', bya: 13.8, event: 'Big Bang', category: 'cosmic', detail: 'Universe begins. Only hydrogen, helium, and lithium exist.', significance: 'Origin of all matter and energy' },
  { time: '13.6 Gya', bya: 13.6, event: 'First Stars (Pop III)', category: 'cosmic', detail: 'Massive first stars forge carbon, oxygen, and heavier elements — prerequisites for life.', significance: 'Birth of elements needed for biology' },
  { time: '13.0 Gya', bya: 13.0, event: 'First Supernovae', category: 'cosmic', detail: 'Dying massive stars seed the galaxy with heavy elements including carbon, iron, phosphorus.', significance: 'CHNOPS elements dispersed through galaxy' },
  { time: '9.0 Gya', bya: 9.0, event: 'Milky Way forms spiral arms', category: 'cosmic', detail: 'Galaxy settles into habitable zone — not too close to galactic center (radiation), not too far (few metals).', significance: 'Galactic Habitable Zone established' },
  { time: '4.6 Gya', bya: 4.6, event: 'Solar System forms', category: 'earth', detail: 'Solar nebula collapses. Sun ignites. Planets accrete from disk of dust and gas.', significance: 'Our planetary system born' },
  { time: '4.5 Gya', bya: 4.5, event: 'Moon-forming impact', category: 'earth', detail: 'Theia (Mars-sized body) strikes proto-Earth. Debris forms the Moon. Moon stabilizes Earth\'s axial tilt.', significance: 'Climate stabilized — key for life' },
  { time: '4.1 Gya', bya: 4.1, event: 'Late Heavy Bombardment', category: 'earth', detail: 'Asteroid barrage delivers water and organic molecules. May have seeded life\'s building blocks.', significance: 'Water and organics delivered to Earth' },
  { time: '3.8 Gya', bya: 3.8, event: 'First microbial life', category: 'life', detail: 'Earliest chemical signatures of life in Greenland rocks. Single-celled microbes in hot-spring environments.', significance: 'Life begins within 800 Myr of Earth\'s formation' },
  { time: '3.5 Gya', bya: 3.5, event: 'Stromatolites', category: 'life', detail: 'Cyanobacteria form mats (stromatolites) — first photosynthesizers. Still exist in Shark Bay, Australia.', significance: 'Photosynthesis evolves' },
  { time: '2.4 Gya', bya: 2.4, event: 'Great Oxidation Event', category: 'life', detail: 'Cyanobacteria flood atmosphere with oxygen. 99% of life goes extinct — oxygen was toxic to early anaerobes.', significance: 'Atmosphere transformed; complex life enabled' },
  { time: '2.1 Gya', bya: 2.1, event: 'First eukaryotes', category: 'complex', detail: 'Cells with a nucleus evolve via endosymbiosis. Mitochondria were once free-living bacteria.', significance: 'Complexity threshold crossed' },
  { time: '0.7 Gya', bya: 0.7, event: 'Snowball Earth', category: 'earth', detail: 'Earth completely frozen for millions of years. Life survives in volcanic vent refugia.', significance: 'Life\'s resilience proven' },
  { time: '0.54 Gya', bya: 0.54, event: 'Cambrian Explosion', category: 'complex', detail: 'Nearly all major animal phyla appear within 20 million years. Eyes, limbs, exoskeletons evolve.', significance: 'Animal complexity emerges' },
  { time: '0.252 Gya', bya: 0.252, event: 'Permian Mass Extinction', category: 'life', detail: '96% of species wiped out by Siberian Traps volcanism. Life recovers in 10 million years.', significance: 'Near-total extinction event — life rebounds' },
  { time: '0.065 Gya', bya: 0.065, event: 'K-Pg Extinction (Dinosaurs)', category: 'life', detail: 'Asteroid impact eliminates dinosaurs; mammals diversify to fill niches.', significance: 'Reset that enabled mammal evolution' },
  { time: '0.003 Gya', bya: 0.003, event: 'Homo sapiens appears', category: 'human', detail: 'Modern humans evolve in Africa ~300,000 years ago. Last 0.002% of Earth\'s history.', significance: 'Technological species emerges' },
  { time: 'Now', bya: 0, event: 'Technological civilization', category: 'human', detail: 'Humans develop radio technology, space travel, and the ability to detect biosignatures on other worlds.', significance: 'Species capable of interstellar communication' },
]

const HABITABLE_WORLDS: HabitableWorld[] = [
  { name: 'TRAPPIST-1e', type: 'Rocky, Earth-sized', distance: '39 ly', potential: 'high', liquid: 'Liquid water (possible)', energy: 'Red dwarf star', biosignatures: 'O₂, H₂O (JWST target)', notes: 'In habitable zone. Tidally locked likely.' },
  { name: 'Proxima Centauri b', type: 'Rocky, ~Earth-sized', distance: '4.2 ly', potential: 'medium', liquid: 'Water (if atmosphere)', energy: 'Red dwarf (flares)', biosignatures: 'Not yet detected', notes: 'Nearest potentially habitable exoplanet.' },
  { name: 'K2-18b', type: 'Mini-Neptune / Hycean', distance: '124 ly', potential: 'medium', liquid: 'Water ocean (sub-surface)', energy: 'Red dwarf', biosignatures: 'DMS detected? (tentative)', notes: 'JWST detected possible biosignature dimethyl sulfide.' },
  { name: 'Mars', type: 'Rocky, cold', distance: '1.5 AU', potential: 'low', liquid: 'Subsurface brine', energy: 'Sun', biosignatures: 'Methane (seasonal)', notes: 'Had liquid water 3.5 Gya. Perseverance samples.' },
  { name: 'Europa', type: 'Ice moon', distance: '5.2 AU', potential: 'high', liquid: 'Global subsurface ocean', energy: 'Tidal heating (Jupiter)', biosignatures: 'Oxygen detected in plumes', notes: 'Europa Clipper launched 2024.' },
  { name: 'Enceladus', type: 'Ice moon', distance: '9.5 AU', potential: 'high', liquid: 'Active water plumes', energy: 'Tidal heating (Saturn)', biosignatures: 'H₂, CH₄, organics in plumes', notes: 'Cassini flew through plumes. Complex organics found.' },
  { name: 'Titan', type: 'Haze moon', distance: '9.5 AU', potential: 'medium', liquid: 'Liquid methane lakes', energy: 'Tidal heating + UV', biosignatures: 'Vinyl cyanide (possible membranes)', notes: 'Dragonfly rotorcraft lander launching 2028.' },
  { name: 'TOI-700d', type: 'Rocky, Earth-sized', distance: '101.4 ly', potential: 'medium', liquid: 'Water (possible)', energy: 'Red dwarf', biosignatures: 'TESS discovered, JWST target', notes: 'Confirmed in habitable zone. High priority.' },
]

const BIOSIGNATURES: LifeSignature[] = [
  { molecule: 'Oxygen (O₂)', detected: false, location: 'Not yet confirmed exoplanet', significance: 'Produced by photosynthesis; rapidly destroyed without biology', icon: '💨' },
  { molecule: 'Methane (CH₄)', detected: true, location: 'Mars (seasonal), Enceladus', significance: 'Biological or geological — combined with O₂ would be compelling', icon: '⛽' },
  { molecule: 'Ozone (O₃)', detected: false, location: 'Target in JWST observations', significance: 'Proxy for O₂; easier to detect spectroscopically', icon: '🌐' },
  { molecule: 'Phosphine (PH₃)', detected: false, location: 'Venus claim (2020) retracted', significance: 'No known abiotic source at low temperatures', icon: '🧪' },
  { molecule: 'Water (H₂O)', detected: true, location: 'Multiple exoplanet atmospheres', significance: 'Necessary for life as we know it', icon: '💧' },
  { molecule: 'Dimethyl Sulfide', detected: false, location: 'K2-18b (tentative, JWST)', significance: 'On Earth, produced only by marine life', icon: '🌊' },
  { molecule: 'Nitrous Oxide (N₂O)', detected: false, location: 'Theoretical target', significance: 'Strong biosignature — biological sources dominate', icon: '💫' },
]

const CAT_COLORS: Record<string, string> = {
  cosmic: 'bg-purple-500/20 text-purple-300',
  earth: 'bg-blue-500/20 text-blue-300',
  life: 'bg-green-500/20 text-green-300',
  complex: 'bg-yellow-500/20 text-yellow-300',
  human: 'bg-red-500/20 text-red-300',
}

const POTENTIAL_COLORS: Record<string, string> = {
  high: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-red-500/20 text-red-400',
}

type TabType = 'timeline' | 'worlds' | 'biosignatures'

export default function AstrobiologyTimeline() {
  const [activeTab, setActiveTab] = useState<TabType>('timeline')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [selected, setSelected] = useState<HabitableWorld>(HABITABLE_WORLDS[0])

  const categories = ['all', 'cosmic', 'earth', 'life', 'complex', 'human']
  const filtered = catFilter === 'all' ? TIMELINE : TIMELINE.filter(e => e.category === catFilter)

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🧬</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Astrobiology Explorer</h2>
          <p className="text-gray-400 text-sm">The cosmic history of life and the search for it elsewhere</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['timeline', 'worlds', 'biosignatures'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'timeline' ? 'Life Timeline' : t === 'worlds' ? 'Habitable Worlds' : 'Biosignatures'}
          </button>
        ))}
      </div>

      {activeTab === 'timeline' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-5">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1 rounded-full text-xs capitalize transition-all ${
                  catFilter === cat ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative border-l-2 border-green-500/30 ml-4 space-y-0">
            {filtered.map((e, i) => (
              <div key={i} className="relative pl-6 pb-4">
                <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-green-700 border-2 border-green-500" />
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-white font-bold">{e.event}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CAT_COLORS[e.category]}`}>{e.category}</span>
                      <span className="text-green-300 font-mono text-sm">{e.time}</span>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{e.detail}</p>
                  <div className="text-yellow-300 text-xs">★ {e.significance}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'worlds' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {HABITABLE_WORLDS.map(w => (
              <button
                key={w.name}
                onClick={() => setSelected(w)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected.name === w.name
                    ? 'bg-green-600/30 border-green-500'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="text-white text-sm font-medium">{w.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${POTENTIAL_COLORS[w.potential]}`}>{w.potential}</span>
                  <span className="text-gray-400 text-xs">{w.distance}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <h3 className="text-white text-xl font-bold mb-1">{selected.name}</h3>
            <p className="text-gray-400 text-sm mb-4">{selected.type} · {selected.distance}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Habitability', value: selected.potential.toUpperCase() },
                { label: 'Liquid Solvent', value: selected.liquid },
                { label: 'Energy Source', value: selected.energy },
                { label: 'Biosignatures', value: selected.biosignatures },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3">
              <div className="text-green-400 text-xs font-semibold mb-1">Mission Notes</div>
              <div className="text-gray-200 text-sm">{selected.notes}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'biosignatures' && (
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Biosignatures are chemical, physical, or spectral signs that life may exist — or may have existed — on a world. The most compelling would be a combination of multiple signatures.</p>

          {BIOSIGNATURES.map((b, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10 flex items-start gap-4">
              <span className="text-3xl">{b.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-white font-bold">{b.molecule}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.detected ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {b.detected ? 'Detected' : 'Not yet confirmed'}
                  </span>
                </div>
                <div className="text-blue-400 text-xs mb-1">📍 {b.location}</div>
                <div className="text-gray-300 text-sm">{b.significance}</div>
              </div>
            </div>
          ))}

          <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 border border-green-500/30 rounded-xl p-4 mt-4">
            <div className="text-green-300 font-bold mb-2">The Challenge of False Positives</div>
            <p className="text-gray-300 text-sm">
              Every potential biosignature has an abiotic explanation: methane from volcanoes, oxygen from UV photolysis of water. True confirmation requires detecting multiple co-existing signatures that cannot be explained geologically — a "biosignature ensemble." JWST is beginning to accumulate such data from nearby rocky exoplanets.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Age of Universe', value: '13.8 Gya', desc: 'Big Bang to now' },
          { label: 'Life on Earth', value: '3.8 Gya', desc: 'first microbes' },
          { label: 'JWST Targets', value: '50+', desc: 'habitable zone planets' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-green-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
