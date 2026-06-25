import { useState } from 'react'

interface HabitableWorld {
  name: string
  type: string
  distance_ly: number
  radius_earth: number
  mass_earth: number
  esi: number
  zone: string
  star: string
  star_type: string
  discovered: number
  status: string
  highlights: string[]
  emoji: string
}

const WORLDS: HabitableWorld[] = [
  { name: 'Earth', type: 'Rocky', distance_ly: 0, radius_earth: 1, mass_earth: 1, esi: 1.00, zone: 'HZ', star: 'Sun', star_type: 'G2V', discovered: 0, status: 'Life confirmed ✓', highlights: ['Only confirmed life-bearing planet', 'Liquid water oceans', 'Protective magnetic field', 'Active plate tectonics'], emoji: '🌍' },
  { name: 'Proxima Centauri b', type: 'Rocky (probable)', distance_ly: 4.24, radius_earth: 1.07, mass_earth: 1.17, esi: 0.87, zone: 'HZ', star: 'Proxima Cen', star_type: 'M5.5', discovered: 2016, status: 'Candidate', highlights: ['Nearest potentially habitable exoplanet', 'Tidally locked (one face always in sunlight)', 'Intense stellar flares could strip atmosphere', 'Target for Breakthrough Starshot'], emoji: '🔴' },
  { name: 'TRAPPIST-1e', type: 'Rocky', distance_ly: 39.5, radius_earth: 0.92, mass_earth: 0.69, esi: 0.85, zone: 'HZ', star: 'TRAPPIST-1', star_type: 'M8', discovered: 2017, status: 'Priority target', highlights: ['Best Earth-twin candidate', '3 planets in HZ of one star (d, e, f)', 'Rocky composition confirmed by density', 'JWST studying atmosphere now'], emoji: '🟣' },
  { name: 'TRAPPIST-1d', type: 'Rocky', distance_ly: 39.5, radius_earth: 0.77, mass_earth: 0.37, esi: 0.78, zone: 'Inner HZ', star: 'TRAPPIST-1', star_type: 'M8', discovered: 2017, status: 'Candidate', highlights: ['May be too warm (inner HZ edge)', 'Low mass — potential for thin atmosphere', 'Synchronous rotation', 'CO₂ atmosphere possible (Venus-like)'], emoji: '🟠' },
  { name: 'Kepler-442b', type: 'Rocky (super-Earth)', distance_ly: 1200, radius_earth: 1.34, mass_earth: 2.3, esi: 0.84, zone: 'HZ', star: 'Kepler-442', star_type: 'K type', discovered: 2015, status: 'Good candidate', highlights: ['90% probability of being rocky', 'Receives similar light as Earth', 'More stable star than red dwarfs', 'Slightly larger than Earth'], emoji: '🟤' },
  { name: 'Kepler-62f', type: 'Super-Earth', distance_ly: 1200, radius_earth: 1.41, mass_earth: 2.8, esi: 0.67, zone: 'HZ', star: 'Kepler-62', star_type: 'K2', discovered: 2013, status: 'Candidate', highlights: ['One of first super-Earths in HZ', 'Likely ocean world if large enough', 'Low instellation — may need greenhouse gases', 'Kepler-62 system has 5 planets'], emoji: '🔵' },
  { name: 'Tau Ceti e', type: 'Super-Earth', distance_ly: 11.9, radius_earth: 1.6, mass_earth: 3.9, esi: 0.78, zone: 'Inner HZ', star: 'Tau Ceti', star_type: 'G8', discovered: 2012, status: 'Disputed', highlights: ['One of nearest potentially HZ worlds', 'Sun-like host star (G-type)', 'High dust disk may mean many impacts', 'Cannot transit (not detectable by transit)'], emoji: '🟡' },
  { name: 'K2-18b', type: 'Hycean (sub-Neptune)', distance_ly: 124, radius_earth: 2.6, mass_earth: 8.6, esi: 0.55, zone: 'HZ', star: 'K2-18', star_type: 'M2.5', discovered: 2015, status: 'Hycean candidate', highlights: ['JWST detected CH₄ and CO₂', 'Potential dimethyl sulfide (possible biosignature)', 'May have water ocean under H₂ atmosphere', 'First exoplanet with potential biosignature hint'], emoji: '🩵' },
  { name: 'TOI-700d', type: 'Rocky', distance_ly: 101.4, radius_earth: 1.19, mass_earth: 1.72, esi: 0.57, zone: 'HZ', star: 'TOI-700', star_type: 'M2', discovered: 2020, status: 'TESS discovery', highlights: ['First Earth-sized HZ planet from TESS', 'Stable M-dwarf host with low flare activity', 'TOI-700e also confirmed in 2023', 'Good target for future atmosphere study'], emoji: '🔷' },
  { name: 'LHS 1140b', type: 'Rocky (super-Earth)', distance_ly: 49, radius_earth: 1.73, mass_earth: 5.6, esi: 0.71, zone: 'HZ', star: 'LHS 1140', star_type: 'M4.5', discovered: 2017, status: 'Priority JWST target', highlights: ['High density confirms rocky composition', 'Quiet M-dwarf host (low flare rate)', 'JWST atmospheric study underway', 'May retain water despite stellar age'], emoji: '⚪' },
]

const EXTREMOPHILES = [
  { name: 'Tardigrade (Water Bear)', limits: 'Survives -272°C, 150°C, vacuum, radiation 1000× lethal to humans', habitat: 'Anywhere with water', note: 'Most radiation-resistant animal known. Can survive 30 years desiccated.', emoji: '🐻' },
  { name: 'Deinococcus radiodurans', limits: 'Survives 15,000 Gy radiation (humans die at 5 Gy)', habitat: 'Nuclear waste sites', note: 'Repairs DNA from thousands of fragments. Used for bioremediation of nuclear sites.', emoji: '🦠' },
  { name: 'Acidithiobacillus thiooxidans', limits: 'Thrives at pH 0 (pure sulfuric acid)', habitat: 'Volcanic vents, mine drainage', note: 'No cell membrane damage in extremely acidic environments, similar to Venus cloud conditions.', emoji: '🌋' },
  { name: 'Pyrolobus fumarii', limits: 'Grows at 113°C (boiling point at depth)', habitat: 'Deep-sea hydrothermal vents', note: 'Archaea that grows best at 106°C. Stops growing below 90°C. Ocean floor habitats.', emoji: '🌊' },
  { name: 'Halobacterium', limits: 'Thrives in 5M NaCl (saturated salt)', habitat: 'Salt flats, Dead Sea, salterns', note: 'Found in places like the Dead Sea. Relevant to Europa\'s salty ocean.', emoji: '🧂' },
  { name: 'Desulforudis audaxviator', limits: 'Lives 2.8 km underground, no oxygen, no sunlight', habitat: 'Deep mines (South Africa)', note: 'Entire ecosystem — one species, feeds on hydrogen from water-rock reaction. No photosynthesis in lineage.', emoji: '⛏️' },
]

const BIOSIGNATURES = [
  { name: 'Oxygen (O₂)', method: 'Spectroscopy', significance: 'High — but can be produced abiotically (UV photolysis of water)', color: '#3b82f6' },
  { name: 'Methane (CH₄)', method: 'IR spectroscopy', significance: 'High if with O₂ — they react and shouldn\'t coexist without replenishment', color: '#10b981' },
  { name: 'Ozone (O₃)', method: 'UV spectroscopy', significance: 'Medium — proxy for O₂. Harder to produce abiotically', color: '#8b5cf6' },
  { name: 'Dimethyl Sulfide', method: 'Mid-IR (JWST)', significance: 'Very high — known only to be produced by marine life on Earth', color: '#f97316' },
  { name: 'Nitrous Oxide (N₂O)', method: 'IR spectroscopy', significance: 'High — produced by denitrifying bacteria, no major abiotic source', color: '#ef4444' },
  { name: 'Phosphine (PH₃)', method: 'Radio/mm waves', significance: 'Disputed — claimed in Venus clouds 2020, controversial explanation', color: '#f59e0b' },
  { name: 'Vegetation red-edge', method: 'Visible/NIR', significance: 'High if confirmed — chlorophyll reflection signature unique to photosynthetic plants', color: '#22c55e' },
]

export default function AstrobioExplorer() {
  const [section, setSection] = useState<'worlds' | 'extremophiles' | 'biosignatures' | 'habzone'>('worlds')
  const [selected, setSelected] = useState<HabitableWorld>(WORLDS[0])

  const esiColor = (esi: number) => esi > 0.8 ? '#22c55e' : esi > 0.6 ? '#f59e0b' : '#ef4444'

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🔬</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Astrobiology Explorer</h2>
          <p className="text-green-300 text-sm">The search for life — habitable worlds, extremophiles & biosignatures</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['worlds', 'extremophiles', 'biosignatures', 'habzone'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${section === s ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {s === 'worlds' ? '🌍 Habitable Worlds' : s === 'extremophiles' ? '🦠 Extremophiles' : s === 'biosignatures' ? '🔭 Biosignatures' : '🌡️ Habitable Zone'}
          </button>
        ))}
      </div>

      {section === 'worlds' && (
        <div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 mb-4">
            {WORLDS.map(w => (
              <button
                key={w.name}
                onClick={() => setSelected(w)}
                className={`p-3 rounded-xl border text-left transition-all ${selected.name === w.name ? 'border-green-500 bg-green-900/20' : 'border-white/10 bg-white/5 hover:border-green-500/40'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{w.emoji}</span>
                    <span className="font-medium text-white text-sm">{w.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold" style={{ color: esiColor(w.esi) }}>ESI {w.esi.toFixed(2)}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">{w.distance_ly > 0 ? `${w.distance_ly} ly · ` : ''}{w.type}</div>
                <div className="mt-1 bg-white/10 rounded-full h-1">
                  <div className="h-1 rounded-full" style={{ width: `${w.esi * 100}%`, backgroundColor: esiColor(w.esi) }} />
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-green-500/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl">{selected.emoji}</span>
              <div>
                <div className="font-bold text-white text-lg">{selected.name}</div>
                <div className="text-xs text-gray-400">{selected.type} · {selected.star} ({selected.star_type})</div>
                <div className="text-xs font-semibold mt-0.5" style={{ color: esiColor(selected.esi) }}>{selected.status}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4 text-xs">
              {[
                { label: 'ESI', value: selected.esi.toFixed(2), note: 'Earth Similarity Index' },
                { label: 'Radius', value: `${selected.radius_earth} R⊕` },
                { label: 'Mass', value: `${selected.mass_earth} M⊕` },
                { label: 'Distance', value: selected.distance_ly > 0 ? `${selected.distance_ly} ly` : '1 AU' },
              ].map(({ label, value, note }) => (
                <div key={label} className="bg-white/5 rounded p-2">
                  <div className="text-gray-500">{label}</div>
                  <div className="text-white font-mono">{value}</div>
                  {note && <div className="text-gray-600 text-xs">{note}</div>}
                </div>
              ))}
            </div>
            <ul className="space-y-1">
              {selected.highlights.map(h => (
                <li key={h} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-green-400">•</span>{h}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {section === 'extremophiles' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-300 mb-4">Life on Earth thrives in conditions once thought impossible — expanding the possible niches for life across the cosmos.</p>
          {EXTREMOPHILES.map(ex => (
            <div key={ex.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start gap-3">
                <span className="text-3xl">{ex.emoji}</span>
                <div>
                  <div className="font-bold text-white">{ex.name}</div>
                  <div className="text-xs text-green-400 mb-1">{ex.limits}</div>
                  <div className="text-xs text-gray-400 mb-1">Habitat: {ex.habitat}</div>
                  <p className="text-sm text-gray-300">{ex.note}</p>
                </div>
              </div>
            </div>
          ))}

          <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-500/20">
            <div className="font-semibold text-blue-300 mb-2">Implications for solar system life</div>
            <div className="text-sm text-gray-300 space-y-1">
              <p>• <strong className="text-white">Europa</strong> — liquid water under ice, hydrothermal vents like deep-sea life on Earth</p>
              <p>• <strong className="text-white">Enceladus</strong> — active plumes contain H₂, CO₂, organic molecules; sampled by Cassini</p>
              <p>• <strong className="text-white">Titan</strong> — hydrocarbon lakes; exotic biochemistry not based on water</p>
              <p>• <strong className="text-white">Venus clouds</strong> — 48-60 km altitude: 0-60°C, 1 atm — but extremely acidic (H₂SO₄)</p>
              <p>• <strong className="text-white">Mars subsurface</strong> — liquid brine detected by radar; possible past habitable conditions</p>
            </div>
          </div>
        </div>
      )}

      {section === 'biosignatures' && (
        <div>
          <p className="text-sm text-gray-300 mb-4">How would we detect life from a distance? These spectral signatures in exoplanet atmospheres could be our first clue:</p>
          <div className="space-y-3 mb-4">
            {BIOSIGNATURES.map(b => (
              <div key={b.name} className="bg-white/5 rounded-xl p-3 border border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">{b.name}</div>
                    <div className="text-xs text-gray-400">Detection: {b.method}</div>
                  </div>
                  <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: b.color }} />
                </div>
                <p className="text-xs text-gray-300 mt-1">{b.significance}</p>
              </div>
            ))}
          </div>

          <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-500/20">
            <div className="font-semibold text-yellow-300 mb-2">⚠️ False Positives</div>
            <p className="text-sm text-gray-300">Many biosignatures can be produced abiotically (without life). Finding one chemical is not enough — we look for <strong className="text-white">disequilibrium</strong>: combinations of chemicals that shouldn't coexist without active replenishment (e.g., O₂ + CH₄ simultaneously).</p>
          </div>
        </div>
      )}

      {section === 'habzone' && (
        <div>
          <p className="text-sm text-gray-300 mb-4">The Habitable Zone (HZ) is the orbital range where liquid water could exist on a rocky planet's surface. But it depends on many factors:</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
            {[
              { icon: '⭐', factor: 'Star luminosity', desc: 'More luminous stars have wider HZs, but evolve faster and may sterilize planets.' },
              { icon: '🌡️', factor: 'Greenhouse gases', desc: 'CO₂ and H₂O extend the HZ outward. Without them, Earth would be frozen.' },
              { icon: '🌀', factor: 'Orbital eccentricity', desc: 'High eccentricity can cause extreme temperature swings, even in the "HZ".' },
              { icon: '🌍', factor: 'Planet mass', desc: 'Larger planets retain more atmosphere. Smaller ones may lose volatiles to space.' },
              { icon: '🧲', factor: 'Magnetic field', desc: 'Protects atmosphere from stellar wind erosion. Mars lost its field and most atmosphere.' },
              { icon: '🌊', factor: 'Plate tectonics', desc: 'Recycles CO₂ via carbon-silicate cycle, stabilizing temperature over billions of years.' },
              { icon: '🌙', factor: 'Moon (stabilizer)', desc: 'Earth\'s Moon stabilizes axial tilt. Without it, Earth might flip — extreme climate swings.' },
              { icon: '⚡', factor: 'Stellar flares', desc: 'Red dwarf HZ planets face intense flares that could strip atmospheres and damage DNA.' },
            ].map(item => (
              <div key={item.factor} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="text-lg mb-1">{item.icon}</div>
                <div className="text-sm font-semibold text-white">{item.factor}</div>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-xs font-semibold text-green-300 mb-2">The Galactic Habitable Zone</div>
            <p className="text-sm text-gray-300">There may also be a <strong className="text-white">Galactic Habitable Zone</strong> — a ring at 6–10 kpc from the galactic center where there are enough heavy elements for rocky planets, but not so many supernovae as to sterilize them. We are conveniently located within it.</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-center">
            {[
              { star: 'M-dwarf (red)', hz: '0.1–0.4 AU', pct: '75%', pros: 'Numerous, long-lived', cons: 'Flares, tidal locking' },
              { star: 'G-type (Sun)', hz: '0.9–1.7 AU', pct: '7%', pros: 'Moderate flares, stable', cons: 'HZ planets rare' },
              { star: 'K-dwarf (orange)', hz: '0.5–1.2 AU', pct: '12%', pros: 'Goldilocks: stable & common', cons: 'Less studied' },
            ].map(item => (
              <div key={item.star} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="font-bold text-white">{item.star}</div>
                <div className="text-green-300 font-mono">{item.hz}</div>
                <div className="text-gray-400">{item.pct} of stars</div>
                <div className="text-green-400 mt-1">+ {item.pros}</div>
                <div className="text-red-400">− {item.cons}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
