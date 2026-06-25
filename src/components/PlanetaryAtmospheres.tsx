import { useState } from 'react'

interface PlanetAtmo {
  planet: string
  icon: string
  pressure: string
  pressureBar: number
  temp: string
  composition: { gas: string; pct: string; color: string }[]
  winds: string
  weather: string
  unique: string
  habitability: 'habitable' | 'extreme' | 'toxic' | 'none' | 'potential'
  color: string
}

interface AtmoLayer {
  name: string
  altRange: string
  tempRange: string
  description: string
  phenomena: string[]
}

interface WeatherEvent {
  name: string
  planet: string
  scale: string
  duration: string
  description: string
  windSpeed: string
}

const PLANETS: PlanetAtmo[] = [
  {
    planet: 'Mercury',
    icon: '⚫',
    pressure: '~10⁻¹⁴ bar',
    pressureBar: 0,
    temp: '-180°C to 430°C',
    composition: [
      { gas: 'Oxygen', pct: '42%', color: '#3b82f6' },
      { gas: 'Sodium', pct: '29%', color: '#f59e0b' },
      { gas: 'Hydrogen', pct: '22%', color: '#8b5cf6' },
      { gas: 'Other', pct: '7%', color: '#6b7280' },
    ],
    winds: 'Effectively none',
    weather: 'No weather — no real atmosphere',
    unique: 'Exosphere only — atoms escape to space; replenished by solar wind and micrometeorites',
    habitability: 'none',
    color: '#9ca3af',
  },
  {
    planet: 'Venus',
    icon: '🔥',
    pressure: '93 bar (90× Earth)',
    pressureBar: 93,
    temp: '462°C (surface, day + night)',
    composition: [
      { gas: 'CO₂', pct: '96.5%', color: '#f97316' },
      { gas: 'Nitrogen', pct: '3.5%', color: '#06b6d4' },
      { gas: 'SO₂/H₂SO₄', pct: '<0.1%', color: '#facc15' },
    ],
    winds: '1–3 km/h surface; 360 km/h upper clouds',
    weather: 'Sulfuric acid rain (evaporates before hitting ground)',
    unique: 'Runaway greenhouse effect. CO₂ traps heat from Sun. Surface hot enough to melt lead.',
    habitability: 'toxic',
    color: '#f59e0b',
  },
  {
    planet: 'Earth',
    icon: '🌍',
    pressure: '1.013 bar',
    pressureBar: 1.013,
    temp: '-88°C to 58°C (avg 15°C)',
    composition: [
      { gas: 'Nitrogen', pct: '78.1%', color: '#06b6d4' },
      { gas: 'Oxygen', pct: '20.9%', color: '#3b82f6' },
      { gas: 'Argon', pct: '0.93%', color: '#8b5cf6' },
      { gas: 'CO₂', pct: '0.04%', color: '#f97316' },
    ],
    winds: '0–400 km/h (tornadoes)',
    weather: 'Rain, snow, hurricanes, thunderstorms, auroras',
    unique: 'Liquid water surface. Ozone layer blocks UV. Life regulates atmospheric composition.',
    habitability: 'habitable',
    color: '#3b82f6',
  },
  {
    planet: 'Mars',
    icon: '🔴',
    pressure: '0.006 bar (0.6% Earth)',
    pressureBar: 0.006,
    temp: '-125°C to 20°C (avg -63°C)',
    composition: [
      { gas: 'CO₂', pct: '95.3%', color: '#f97316' },
      { gas: 'Nitrogen', pct: '2.6%', color: '#06b6d4' },
      { gas: 'Argon', pct: '1.9%', color: '#8b5cf6' },
      { gas: 'O₂', pct: '0.16%', color: '#3b82f6' },
    ],
    winds: '0–30 m/s (low density = low force)',
    weather: 'Global dust storms; CO₂ frosts at poles; thin cirrus clouds',
    unique: 'Once had thick atmosphere and liquid water. Lost to solar wind stripping (no magnetosphere).',
    habitability: 'extreme',
    color: '#ef4444',
  },
  {
    planet: 'Jupiter',
    icon: '🟠',
    pressure: 'No surface — increases indefinitely',
    pressureBar: 10000,
    temp: '-145°C (cloud tops)',
    composition: [
      { gas: 'Hydrogen', pct: '89%', color: '#f59e0b' },
      { gas: 'Helium', pct: '10%', color: '#06b6d4' },
      { gas: 'Other', pct: '1%', color: '#6b7280' },
    ],
    winds: 'Up to 620 km/h',
    weather: 'Giant storms, ammonia crystal clouds, auroras at poles',
    unique: 'Great Red Spot: 350-year-old storm larger than Earth. Lightning 3× stronger than Earth\'s.',
    habitability: 'none',
    color: '#f97316',
  },
  {
    planet: 'Saturn',
    icon: '🪐',
    pressure: 'No surface',
    pressureBar: 5000,
    temp: '-178°C (cloud tops)',
    composition: [
      { gas: 'Hydrogen', pct: '96%', color: '#f59e0b' },
      { gas: 'Helium', pct: '3%', color: '#06b6d4' },
      { gas: 'Methane/Other', pct: '1%', color: '#6b7280' },
    ],
    winds: '1,800 km/h (equatorial jet)',
    weather: 'Hexagonal polar vortex, massive lightning storms every 20-30 years',
    unique: 'Saturn\'s hexagonal north pole storm spans 30,000 km. Fastest winds of rocky/gas planets.',
    habitability: 'none',
    color: '#eab308',
  },
  {
    planet: 'Uranus',
    icon: '🔵',
    pressure: 'No surface',
    pressureBar: 1000,
    temp: '-224°C (coldest planet)',
    composition: [
      { gas: 'Hydrogen', pct: '83%', color: '#f59e0b' },
      { gas: 'Helium', pct: '15%', color: '#06b6d4' },
      { gas: 'Methane', pct: '2%', color: '#10b981' },
    ],
    winds: 'Up to 900 km/h',
    weather: 'Diamond rain (deep interior), methane clouds',
    unique: 'Rotates on its side (98° axial tilt) — pole faces the Sun for 42-year seasons.',
    habitability: 'none',
    color: '#06b6d4',
  },
  {
    planet: 'Neptune',
    icon: '🌀',
    pressure: 'No surface',
    pressureBar: 1000,
    temp: '-218°C (cloud tops)',
    composition: [
      { gas: 'Hydrogen', pct: '80%', color: '#f59e0b' },
      { gas: 'Helium', pct: '19%', color: '#06b6d4' },
      { gas: 'Methane', pct: '1%', color: '#10b981' },
    ],
    winds: 'Up to 2,200 km/h (fastest in solar system)',
    weather: 'Great Dark Spot (like Jupiter\'s GRS — but transient), methane ice clouds',
    unique: 'Fastest winds in solar system despite being farthest from Sun. Internal heat source.',
    habitability: 'none',
    color: '#3b82f6',
  },
]

const EARTH_LAYERS: AtmoLayer[] = [
  { name: 'Troposphere', altRange: '0–12 km', tempRange: '15°C → -56°C', description: 'Weather layer. Contains 75% of atmospheric mass. Temperature decreases with altitude.', phenomena: ['Weather', 'Clouds', 'Aviation (lower)'] },
  { name: 'Stratosphere', altRange: '12–50 km', tempRange: '-56°C → 0°C', description: 'Ozone layer resides here. Temperature increases with altitude (ozone absorbs UV). Very stable.', phenomena: ['Ozone layer', 'Stratospheric jet streams', 'Commercial aircraft'] },
  { name: 'Mesosphere', altRange: '50–85 km', tempRange: '0°C → -90°C', description: 'Coldest layer. Burns up most meteors. Temperature decreases with altitude again.', phenomena: ['Meteor ablation', 'Noctilucent clouds', 'Sprites'] },
  { name: 'Thermosphere', altRange: '85–600 km', tempRange: '-90°C → 2000°C', description: 'Very thin — ISS orbit here. Temp very high but density too low to feel heat. Auroras occur here.', phenomena: ['ISS (400 km)', 'Auroras', 'Radio wave reflection'] },
  { name: 'Exosphere', altRange: '600–10,000 km', tempRange: '~2000°C', description: 'Atmospheric atoms escape to space. Merges with interplanetary medium.', phenomena: ['Hydrogen escape', 'Satellites (LEO)', 'Transition to space'] },
]

const WEATHER_EVENTS: WeatherEvent[] = [
  { name: 'Great Red Spot', planet: 'Jupiter', scale: '16,000 × 13,000 km', duration: '350+ years', description: 'Giant anticyclonic storm observed since 1600s. Shrinking — was once 40,000 km wide.', windSpeed: '500 km/h' },
  { name: 'Saturn Hexagon', planet: 'Saturn', scale: '30,000 km diameter', duration: 'Decades+', description: 'Stable hexagonal polar vortex at Saturn\'s north pole. Discovered by Voyager 1 (1981).', windSpeed: '320 km/h' },
  { name: 'Venus Super-Rotation', planet: 'Venus', scale: 'Global', duration: 'Permanent', description: 'Atmosphere rotates 60× faster than the planet surface — winds of 360 km/h at cloud level.', windSpeed: '360 km/h' },
  { name: 'Neptune Great Dark Spot', planet: 'Neptune', scale: 'Earth-sized', duration: 'Months–years', description: 'Cyclonic storm in southern hemisphere. Disappeared by 1994 Hubble observation.', windSpeed: '2,200 km/h' },
  { name: 'Mars Global Dust Storm', planet: 'Mars', scale: 'Planet-wide', duration: 'Months', description: 'Seasonal dust storms sometimes engulf entire planet, reducing sunlight by 99% in affected areas.', windSpeed: '100 km/h' },
]

const HABITABILITY_COLORS: Record<string, string> = {
  habitable: 'bg-green-500/20 text-green-400',
  extreme: 'bg-yellow-500/20 text-yellow-400',
  toxic: 'bg-red-500/20 text-red-400',
  none: 'bg-gray-500/20 text-gray-400',
  potential: 'bg-blue-500/20 text-blue-400',
}

type TabType = 'comparison' | 'earthlayers' | 'weather'

export default function PlanetaryAtmospheres() {
  const [activeTab, setActiveTab] = useState<TabType>('comparison')
  const [selected, setSelected] = useState<PlanetAtmo>(PLANETS[2])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🌬️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Planetary Atmospheres</h2>
          <p className="text-gray-400 text-sm">Gas envelopes, weather systems, and atmospheric composition across the solar system</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['comparison', 'earthlayers', 'weather'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-cyan-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'comparison' ? 'Planet Comparison' : t === 'earthlayers' ? 'Earth\'s Layers' : 'Extreme Weather'}
          </button>
        ))}
      </div>

      {activeTab === 'comparison' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {PLANETS.map(p => (
              <button
                key={p.planet}
                onClick={() => setSelected(p)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected.planet === p.planet
                    ? 'border-cyan-500 bg-cyan-600/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{p.icon}</span>
                  <div>
                    <div className="text-white text-sm font-medium">{p.planet}</div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${HABITABILITY_COLORS[p.habitability]}`}>{p.habitability}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-white text-xl font-bold">{selected.planet}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${HABITABILITY_COLORS[selected.habitability]}`}>{selected.habitability}</span>
              </div>
            </div>

            {/* Composition bars */}
            <div className="mb-4">
              <div className="text-gray-400 text-xs mb-2">Atmospheric Composition</div>
              <div className="flex h-6 rounded-lg overflow-hidden">
                {selected.composition.map(c => (
                  <div
                    key={c.gas}
                    className="flex items-center justify-center text-xs text-white font-bold overflow-hidden"
                    style={{ width: c.pct, background: c.color + 'cc', minWidth: parseFloat(c.pct) > 5 ? 'auto' : '0' }}
                    title={`${c.gas}: ${c.pct}`}
                  >
                    {parseFloat(c.pct) > 15 ? c.gas : ''}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {selected.composition.map(c => (
                  <span key={c.gas} className="flex items-center gap-1 text-xs text-gray-300">
                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    {c.gas} {c.pct}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Surface Pressure', value: selected.pressure },
                { label: 'Temperature Range', value: selected.temp },
                { label: 'Wind Speeds', value: selected.winds },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-3 mb-3">
              <div className="text-cyan-400 text-xs mb-1">Weather</div>
              <div className="text-gray-200 text-sm">{selected.weather}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="text-gray-400 text-xs mb-1">Unique Feature</div>
              <div className="text-gray-200 text-sm">{selected.unique}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'earthlayers' && (
        <div className="space-y-3">
          {EARTH_LAYERS.map((layer, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start gap-4 mb-2">
                <div className="text-right flex-shrink-0 w-20">
                  <div className="text-cyan-400 font-bold text-sm">{layer.altRange}</div>
                  <div className="text-gray-500 text-xs">{layer.tempRange}</div>
                </div>
                <div>
                  <div className="text-white font-bold text-lg">{layer.name}</div>
                  <p className="text-gray-300 text-sm">{layer.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {layer.phenomena.map(p => (
                      <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'weather' && (
        <div className="space-y-4">
          {WEATHER_EVENTS.map((w, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-white font-bold text-lg">{w.name}</span>
                  <span className="ml-2 text-cyan-400 text-sm">— {w.planet}</span>
                </div>
                <span className="text-yellow-400 font-bold text-sm">💨 {w.windSpeed}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
                <div className="bg-white/5 rounded p-2">
                  <div className="text-gray-400">Scale</div>
                  <div className="text-white">{w.scale}</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-gray-400">Duration</div>
                  <div className="text-white">{w.duration}</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-gray-400">Wind Speed</div>
                  <div className="text-white">{w.windSpeed}</div>
                </div>
              </div>
              <p className="text-gray-300 text-sm">{w.description}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Venus Surface', value: '462°C', desc: 'Hottest planet (beats Mercury)' },
          { label: 'Neptune Winds', value: '2,200 km/h', desc: 'Fastest in solar system' },
          { label: 'Earth O₂', value: '20.9%', desc: 'Result of 3.5 Gyr photosynthesis' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-cyan-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
