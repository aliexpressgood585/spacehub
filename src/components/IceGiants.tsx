import { useState } from 'react'

interface AtmosphereLayer {
  name: string
  altitude: string
  tempK: number
  pressureBar: number
  composition: string
  color: string
}

interface Moon {
  name: string
  diameterKm: number
  orbitalPeriodDays: number
  distanceKm: number
  surfaceDesc: string
  interesting: string
}

interface IceGiant {
  name: string
  emoji: string
  color: string
  bgGradient: string
  distanceAU: number
  radiusKm: number
  massEarths: number
  dayHours: number
  yearEarthYears: number
  tiltDeg: number
  magneticTiltDeg: number
  windSpeedKmh: number
  internalHeat: boolean
  discoveryYear: number
  discoveredBy: string
  atmosphere: AtmosphereLayer[]
  moons: Moon[]
  missions: { name: string; year: number; type: string; status: string }[]
  uniqueFacts: string[]
}

const PLANETS: IceGiant[] = [
  {
    name: 'Uranus',
    emoji: '🔵',
    color: '#7FC8E0',
    bgGradient: 'from-cyan-900 to-teal-800',
    distanceAU: 19.19,
    radiusKm: 25362,
    massEarths: 14.5,
    dayHours: 17.24,
    yearEarthYears: 84.0,
    tiltDeg: 97.77,
    magneticTiltDeg: 59,
    windSpeedKmh: 900,
    internalHeat: false,
    discoveryYear: 1781,
    discoveredBy: 'William Herschel',
    uniqueFacts: [
      'Rotates on its side — axial tilt of 97.77° means poles face the Sun',
      'Coldest planetary atmosphere in the solar system: −224°C',
      'Emits virtually no internal heat (unlike Neptune)',
      'Has 13 known rings and 27 known moons',
      'Magnetic field is offset 59° from rotation axis and displaced from center',
      'Each pole experiences 42 years of continuous sunlight then 42 years of darkness',
      'May have a "superionic" water interior where water is both solid and conducting',
      'Appears featureless compared to Neptune — fewer visible storms',
    ],
    atmosphere: [
      { name: 'Exosphere', altitude: '>4,000 km', tempK: 1000, pressureBar: 0, composition: 'H, H₂, He', color: '#E8F8FF' },
      { name: 'Thermosphere', altitude: '2,000–4,000 km', tempK: 800, pressureBar: 0.00001, composition: 'H₂, He, hydrocarbons', color: '#B0E8F8' },
      { name: 'Stratosphere', altitude: '100–2,000 km', tempK: 160, pressureBar: 0.1, composition: 'CH₄, C₂H₂, C₂H₆, CO', color: '#7FC8E0' },
      { name: 'Troposphere', altitude: '0–100 km', tempK: 53, pressureBar: 100, composition: 'H₂ (83%), He (15%), CH₄ (2.3%)', color: '#5AB8D0' },
      { name: 'Water-Ice Layer', altitude: '−1,000 km', tempK: 5000, pressureBar: 10000, composition: 'H₂O, NH₃, CH₄ ices', color: '#3A88A0' },
      { name: 'Rock Core', altitude: 'Center', tempK: 7000, pressureBar: 800000, composition: 'Silicates, iron-nickel', color: '#204050' },
    ],
    moons: [
      { name: 'Miranda', diameterKm: 471, orbitalPeriodDays: 1.41, distanceKm: 129900, surfaceDesc: 'Largest cliffs in solar system (Verona Rupes: 20 km)', interesting: 'May have been destroyed and reassembled by an ancient impact' },
      { name: 'Ariel', diameterKm: 1157, orbitalPeriodDays: 2.52, distanceKm: 191000, surfaceDesc: 'Canyons and smooth plains, relatively young surface', interesting: 'Youngest-looking surface of major Uranian moons' },
      { name: 'Umbriel', diameterKm: 1169, orbitalPeriodDays: 4.14, distanceKm: 266000, surfaceDesc: 'Darkest major moon, heavily cratered', interesting: 'Mysterious bright ring (Wunda) near its south pole' },
      { name: 'Titania', diameterKm: 1578, orbitalPeriodDays: 8.71, distanceKm: 436000, surfaceDesc: 'Largest Uranian moon; canyons and scarps', interesting: 'May have a liquid water ocean beneath its surface' },
      { name: 'Oberon', diameterKm: 1522, orbitalPeriodDays: 13.46, distanceKm: 584000, surfaceDesc: 'Heavily cratered; dark terrain', interesting: 'Outermost large moon; dark material may be carbon-rich' },
    ],
    missions: [
      { name: 'Voyager 2', year: 1986, type: 'Flyby', status: 'Completed — only spacecraft to visit' },
      { name: 'Uranus Orbiter & Probe (UOP)', year: 2031, type: 'Orbiter + Atmospheric probe', status: 'Recommended by Planetary Science Decadal Survey 2023–2032' },
    ],
  },
  {
    name: 'Neptune',
    emoji: '🔷',
    color: '#4B6CB7',
    bgGradient: 'from-blue-900 to-indigo-800',
    distanceAU: 30.07,
    radiusKm: 24622,
    massEarths: 17.1,
    dayHours: 16.11,
    yearEarthYears: 164.8,
    tiltDeg: 28.32,
    magneticTiltDeg: 47,
    windSpeedKmh: 2100,
    internalHeat: true,
    discoveryYear: 1846,
    discoveredBy: 'Le Verrier / Adams / Galle',
    uniqueFacts: [
      'Fastest winds in the solar system: up to 2,100 km/h (supersonic!)',
      'Radiates 2.6× more heat than it receives from the Sun',
      'The Great Dark Spot (1989) disappeared by 1994 — weather is dynamic',
      'Predicted mathematically before being observed (1846)',
      'Triton orbits in the wrong direction — likely a captured Kuiper Belt object',
      'Magnetic axis is tilted 47° and offset from center like Uranus',
      'Has 16 known moons and 5 rings',
      '165 Earth-years per orbit — only completed one orbit since discovery in 1846',
    ],
    atmosphere: [
      { name: 'Exosphere', altitude: '>1,000 km', tempK: 750, pressureBar: 0, composition: 'H, He, hydrocarbons', color: '#E0E8FF' },
      { name: 'Thermosphere', altitude: '500–1,000 km', tempK: 600, pressureBar: 0.00001, composition: 'H₂, He, CH₄ products', color: '#A0C0F0' },
      { name: 'Stratosphere', altitude: '100–500 km', tempK: 150, pressureBar: 0.1, composition: 'CH₄, C₂H₆, CO, HCN', color: '#6090D8' },
      { name: 'Troposphere', altitude: '0–100 km', tempK: 72, pressureBar: 100, composition: 'H₂ (80%), He (19%), CH₄ (1.5%)', color: '#4B6CB7' },
      { name: 'Ionic Layer', altitude: '−2,000 km', tempK: 7000, pressureBar: 50000, composition: 'H₂O, NH₃, CH₄ (superionic)', color: '#2A4080' },
      { name: 'Rock Core', altitude: 'Center', tempK: 7000, pressureBar: 800000, composition: 'Silicates, iron-nickel', color: '#101828' },
    ],
    moons: [
      { name: 'Triton', diameterKm: 2707, orbitalPeriodDays: -5.88, distanceKm: 354800, surfaceDesc: 'Nitrogen geysers, cantaloupe terrain, thin N₂ atmosphere', interesting: 'Only large moon with retrograde orbit; slowly spiraling inward toward Roche limit' },
      { name: 'Proteus', diameterKm: 420, orbitalPeriodDays: 1.12, distanceKm: 117647, surfaceDesc: 'Irregular, heavily cratered', interesting: 'One of the darkest objects in the solar system' },
      { name: 'Nereid', diameterKm: 340, orbitalPeriodDays: 360.1, distanceKm: 5513800, surfaceDesc: 'Very distant, eccentric orbit', interesting: 'Most eccentric moon orbit in the solar system' },
      { name: 'Larissa', diameterKm: 194, orbitalPeriodDays: 0.55, distanceKm: 73548, surfaceDesc: 'Small, close inner moon', interesting: 'Inside Roche limit — will eventually be torn apart to form rings' },
      { name: 'Hippocamp', diameterKm: 34, orbitalPeriodDays: 0.95, distanceKm: 105300, surfaceDesc: 'Tiny inner moon', interesting: 'Discovered 2013 by Hubble; may be a fragment of Proteus' },
    ],
    missions: [
      { name: 'Voyager 2', year: 1989, type: 'Flyby', status: 'Completed — only spacecraft to visit' },
      { name: 'Neptune Odyssey', year: 2040, type: 'Orbiter + Triton lander', status: 'Proposed mission concept under study' },
    ],
  },
]

export default function IceGiants() {
  const [selectedPlanet, setSelectedPlanet] = useState<IceGiant>(PLANETS[0])
  const [activeTab, setActiveTab] = useState<'overview' | 'atmosphere' | 'moons' | 'missions'>('overview')

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Ice Giants Explorer</h2>
      <p className="text-slate-400 text-sm mb-5">Deep dive into the mysterious ice giants — Uranus and Neptune</p>

      {/* Planet selector */}
      <div className="flex gap-3 mb-6">
        {PLANETS.map(p => (
          <button
            key={p.name}
            onClick={() => setSelectedPlanet(p)}
            className={`flex-1 flex items-center gap-3 p-4 rounded-xl transition-all ${
              selectedPlanet.name === p.name
                ? `bg-gradient-to-r ${p.bgGradient} text-white`
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="text-3xl">{p.emoji}</span>
            <div className="text-left">
              <div className="font-bold">{p.name}</div>
              <div className="text-xs opacity-70">{p.distanceAU} AU from Sun</div>
            </div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {(['overview', 'atmosphere', 'moons', 'missions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t === 'overview' ? '📊 Overview' : t === 'atmosphere' ? '🌫️ Atmosphere' : t === 'moons' ? '🌙 Moons' : '🚀 Missions'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Radius', value: `${selectedPlanet.radiusKm.toLocaleString()} km`, sub: `${(selectedPlanet.radiusKm / 6371).toFixed(1)}× Earth` },
              { label: 'Mass', value: `${selectedPlanet.massEarths}×`, sub: 'Earth masses' },
              { label: 'Day', value: `${selectedPlanet.dayHours}h`, sub: 'rotation period' },
              { label: 'Year', value: `${selectedPlanet.yearEarthYears}`, sub: 'Earth years' },
              { label: 'Axial Tilt', value: `${selectedPlanet.tiltDeg}°`, sub: selectedPlanet.tiltDeg > 90 ? 'Retrograde!' : 'Significant tilt' },
              { label: 'Mag. Tilt', value: `${selectedPlanet.magneticTiltDeg}°`, sub: 'vs rotation axis' },
              { label: 'Max Wind', value: `${selectedPlanet.windSpeedKmh.toLocaleString()}`, sub: 'km/h' },
              { label: 'Internal Heat', value: selectedPlanet.internalHeat ? 'Yes ✅' : 'Minimal ❌', sub: selectedPlanet.internalHeat ? '2.6× solar input' : 'Near equilibrium' },
            ].map((stat, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-3">
                <div className="text-slate-400 text-xs">{stat.label}</div>
                <div className="text-white font-bold text-sm mt-0.5">{stat.value}</div>
                <div className="text-slate-500 text-xs">{stat.sub}</div>
              </div>
            ))}
          </div>

          <div className="text-slate-300 text-xs mb-2">Discovered {selectedPlanet.discoveryYear} by {selectedPlanet.discoveredBy}</div>

          <h4 className="text-white font-semibold mb-3">Unique Facts</h4>
          <div className="space-y-2">
            {selectedPlanet.uniqueFacts.map((fact, i) => (
              <div key={i} className="flex gap-3 items-start bg-slate-800/50 rounded-lg p-3">
                <span className="text-yellow-400 font-bold text-xs mt-0.5 flex-shrink-0">{i + 1}</span>
                <span className="text-slate-200 text-sm">{fact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'atmosphere' && (
        <div className="space-y-2">
          <p className="text-slate-400 text-sm mb-4">
            Ice giants are misnamed — their interiors contain hot, pressurized "ices" of water, methane, and ammonia in liquid or superionic states rather than frozen solids.
          </p>
          {selectedPlanet.atmosphere.map((layer, i) => (
            <div key={i} className="flex items-start gap-4 p-3 rounded-lg bg-slate-800/50">
              <div className="w-4 h-full rounded flex-shrink-0 min-h-[40px]" style={{ backgroundColor: layer.color, opacity: 0.8 }} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold text-sm">{layer.name}</span>
                  <span className="text-slate-400 text-xs">{layer.altitude}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Temp: </span>
                    <span className="text-orange-300">{layer.tempK.toLocaleString()} K ({(layer.tempK - 273).toLocaleString()} °C)</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Pressure: </span>
                    <span className="text-cyan-300">{layer.pressureBar > 0 ? `${layer.pressureBar.toLocaleString()} bar` : 'Near vacuum'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Composition: </span>
                    <span className="text-slate-300">{layer.composition}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'moons' && (
        <div className="space-y-3">
          {selectedPlanet.moons.map((moon, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-white font-bold">🌙 {moon.name}</span>
                  <span className="text-slate-400 text-xs ml-2">{moon.diameterKm} km diameter</span>
                </div>
                <div className="text-slate-400 text-xs text-right">
                  <div>{Math.abs(moon.orbitalPeriodDays).toFixed(2)} days</div>
                  <div>{moon.orbitalPeriodDays < 0 ? 'retrograde' : 'orbital period'}</div>
                </div>
              </div>
              <div className="text-slate-300 text-sm mb-2">{moon.surfaceDesc}</div>
              <div className="bg-slate-900/60 rounded-lg p-2 text-xs text-indigo-300">
                ✨ {moon.interesting}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'missions' && (
        <div className="space-y-4">
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 text-sm text-amber-200">
            ⚠️ Both ice giants have only been visited by <strong>one spacecraft</strong> (Voyager 2 in 1986 and 1989). They are the least-explored planets in our solar system.
          </div>
          {selectedPlanet.missions.map((m, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="font-bold text-white">{m.name}</div>
                <span className="text-slate-400 text-sm">{m.year}</span>
              </div>
              <div className="text-slate-300 text-sm mb-2">{m.type}</div>
              <div className={`text-xs px-2 py-1 rounded inline-block ${
                m.status.includes('Completed') ? 'bg-green-900/50 text-green-300' : 'bg-blue-900/50 text-blue-300'
              }`}>
                {m.status}
              </div>
            </div>
          ))}
          <div className="bg-slate-800 rounded-xl p-4">
            <h4 className="text-white font-semibold mb-2">Why are ice giants a priority?</h4>
            <ul className="space-y-1 text-slate-300 text-sm">
              <li>• Ice giants are the most common planet type in our galaxy</li>
              <li>• Understanding them helps us study exoplanets around other stars</li>
              <li>• Triton (Neptune's moon) may be a captured Kuiper Belt Object — a key to solar system origin</li>
              <li>• Internal heat anomaly of Uranus is unexplained</li>
              <li>• Voyager 2 data is nearly 40 years old — modern instruments needed</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
