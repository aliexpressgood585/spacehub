import { useState } from 'react'

const C_KMS = 299792.458
const AU_KM = 1.496e8
const LY_KM = 9.461e12
const PC_KM = 3.086e13

interface DistanceObject {
  name: string
  distance_ly: number
  type: string
  emoji: string
  method: string
  fact: string
}

const OBJECTS: DistanceObject[] = [
  { name: 'Moon', distance_ly: 1.28e-8, type: 'Natural satellite', emoji: '🌕', method: 'Radar ranging', fact: 'Light takes 1.28 seconds one-way. NASA measured this with lasers to millimeter precision.' },
  { name: 'Sun', distance_ly: 1.58e-5, type: 'Star', emoji: '☀️', method: 'Radar ranging', fact: '8 minutes 20 seconds for light. This 1 AU was historically measured by the transit of Venus.' },
  { name: 'Mars (closest)', distance_ly: 3.8e-6, type: 'Planet', emoji: '🔴', method: 'Radar ranging', fact: 'Ranges from 3 to 22 light-minutes depending on orbital alignment. Radio commands to rovers are delayed.' },
  { name: 'Jupiter', distance_ly: 4.3e-5, type: 'Planet', emoji: '🪐', method: 'Radar ranging', fact: 'Galileo discovered its moons in 1610, but light delay wasn\'t measured until Ole Rømer in 1676.' },
  { name: 'Voyager 1', distance_ly: 0.00246, type: 'Spacecraft', emoji: '🛸', method: 'Radio Doppler', fact: 'Most distant human-made object. In interstellar space since 2012. Signal takes ~22 hours each way.' },
  { name: 'Proxima Centauri', distance_ly: 4.24, type: 'Star', emoji: '⭐', method: 'Trigonometric parallax', fact: 'Nearest star. At current Voyager speed, would take 75,000 years to reach. Proxima b may be habitable.' },
  { name: 'Sirius', distance_ly: 8.6, type: 'Star', emoji: '✨', method: 'Trigonometric parallax', fact: 'Brightest star in night sky. Ancient Egyptians used its heliacal rising to predict Nile floods.' },
  { name: 'Betelgeuse', distance_ly: 700, type: 'Red supergiant', emoji: '🔶', method: 'Spectroscopic parallax', fact: 'Will explode as a supernova. When it does, visible during day for weeks. The 2019-2020 "Great Dimming" was dust.' },
  { name: 'Pleiades cluster', distance_ly: 444, type: 'Open cluster', emoji: '🌟', method: 'Cepheid variables', fact: 'The "Seven Sisters." Used for navigation worldwide. Part of many indigenous astronomical traditions.' },
  { name: 'Galactic Center', distance_ly: 26700, type: 'Milky Way core', emoji: '🌌', method: 'Cepheid/RR Lyrae stars', fact: 'Sagittarius A* — our supermassive black hole (4 million M☉) — lurks here, 26,700 light-years away.' },
  { name: 'Large Magellanic Cloud', distance_ly: 158000, type: 'Dwarf galaxy', emoji: '🌫️', method: 'Cepheid variables', fact: 'Satellite galaxy of Milky Way. SN1987A was a supernova here — the nearest observed since 1604.' },
  { name: 'Andromeda Galaxy', distance_ly: 2.537e6, type: 'Spiral galaxy', emoji: '🌀', method: 'Cepheid/TRGB', fact: 'Our nearest large galactic neighbor. On collision course with Milky Way in ~4.5 billion years.' },
  { name: 'Virgo Cluster', distance_ly: 54e6, type: 'Galaxy cluster', emoji: '🔮', method: 'Surface brightness', fact: 'Contains ~1300 galaxies including M87 (home of the first imaged black hole). Dominates our local universe.' },
  { name: 'Hubble Ultra Deep Field', distance_ly: 13.2e9, type: 'Ancient galaxies', emoji: '🌌', method: 'Redshift (Hubble\'s Law)', fact: 'Light from 13.2 billion years ago, just 500 million years after the Big Bang. 10,000 galaxies in one image.' },
  { name: 'CMB (edge of observable universe)', distance_ly: 45.7e9, type: 'Cosmic boundary', emoji: '🌐', method: 'Microwave spectroscopy', fact: 'Observable universe radius: 46 billion ly (universe expanded since light was emitted 13.8 Gyr ago).' },
]

const METHODS = [
  { name: 'Radar ranging', range: '< 100 AU', accuracy: '< 1m', desc: 'Bounce radio waves off nearby bodies and measure round-trip time.' },
  { name: 'Trigonometric parallax', range: '< 10,000 ly', accuracy: '< 1%', desc: 'Measure apparent shift of a star against background stars as Earth orbits the Sun.' },
  { name: 'Cepheid variables', range: '< 100 Mly', accuracy: '5-10%', desc: 'Pulsating stars whose period reveals their true luminosity, allowing distance from apparent brightness.' },
  { name: 'Type Ia supernovae', range: '< 10 Gly', accuracy: '5-10%', desc: 'Standard candles — all Ia supernovae peak at the same luminosity, enabling distance measurement.' },
  { name: 'Redshift / Hubble\'s Law', range: '> 1 Gly', accuracy: '5-20%', desc: 'Galaxy recession velocity from redshift × Hubble constant (H₀ ≈ 70 km/s/Mpc) gives distance.' },
]

function formatDistance(ly: number) {
  if (ly < 1e-7) {
    const km = ly * LY_KM
    if (km < 1000) return `${km.toFixed(0)} km`
    return `${(km / 1000).toFixed(0)} thousand km`
  }
  if (ly < 1e-4) {
    const au = ly * LY_KM / AU_KM
    return `${au.toFixed(2)} AU (${(au * 8.317).toFixed(0)} light-minutes)`
  }
  if (ly < 1) return `${(ly * LY_KM / AU_KM).toFixed(0)} AU`
  if (ly < 1000) return `${ly.toFixed(2)} light-years`
  if (ly < 1e6) return `${(ly / 1000).toFixed(1)} kly`
  if (ly < 1e9) return `${(ly / 1e6).toFixed(1)} million ly`
  return `${(ly / 1e9).toFixed(2)} billion ly`
}

function travelTime(ly: number, speedFraction: number) {
  const years = ly / speedFraction
  if (years < 0.001) return `${(years * 365.25 * 24).toFixed(2)} hours`
  if (years < 1) return `${(years * 365.25).toFixed(0)} days`
  if (years < 1000) return `${years.toFixed(1)} years`
  if (years < 1e6) return `${(years / 1000).toFixed(1)}k years`
  if (years < 1e9) return `${(years / 1e6).toFixed(1)}M years`
  return `${(years / 1e9).toFixed(2)}B years`
}

export default function CosmicDistanceCalculator() {
  const [selectedObj, setSelectedObj] = useState<DistanceObject>(OBJECTS[5])
  const [travelSpeed, setTravelSpeed] = useState(0.1)
  const [unit, setUnit] = useState<'ly' | 'au' | 'pc' | 'km'>('ly')
  const [section, setSection] = useState<'ladder' | 'compare' | 'travel'>('ladder')

  const convertDistance = (ly: number) => {
    const km = ly * LY_KM
    switch (unit) {
      case 'au': return `${(km / AU_KM).toExponential(3)} AU`
      case 'pc': return `${(km / PC_KM).toExponential(3)} pc`
      case 'km': return `${km.toExponential(3)} km`
      default: return `${ly.toExponential(3)} ly`
    }
  }

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">📏</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Cosmic Distance Calculator</h2>
          <p className="text-indigo-300 text-sm">The cosmic distance ladder — from Moon to edge of the observable universe</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['ladder', 'compare', 'travel'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${section === s ? 'bg-indigo-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
          >
            {s === 'ladder' ? '🪜 Distance Ladder' : s === 'compare' ? '📐 Converter' : '🚀 Travel Time'}
          </button>
        ))}
      </div>

      {section === 'ladder' && (
        <div>
          <div className="space-y-2 mb-4">
            {OBJECTS.map(obj => {
              const logD = Math.log10(obj.distance_ly + 1e-10)
              const logMin = Math.log10(1e-9)
              const logMax = Math.log10(1e11)
              const pct = ((logD - logMin) / (logMax - logMin)) * 100
              const isSelected = selectedObj.name === obj.name
              return (
                <button
                  key={obj.name}
                  onClick={() => setSelectedObj(obj)}
                  className={`w-full text-left p-2 rounded-lg transition-all group ${isSelected ? 'bg-indigo-900/30 border border-indigo-500/50' : 'hover:bg-white/5'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{obj.emoji}</span>
                      <span className={`text-sm ${isSelected ? 'text-indigo-300 font-semibold' : 'text-gray-300'}`}>{obj.name}</span>
                      <span className="text-xs text-gray-500">{obj.type}</span>
                    </div>
                    <span className="text-xs font-mono text-indigo-200">{formatDistance(obj.distance_ly)}</span>
                  </div>
                  <div className="bg-white/10 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-indigo-500/70 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              )
            })}
          </div>

          {selectedObj && (
            <div className="bg-white/5 rounded-xl p-4 border border-indigo-500/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{selectedObj.emoji}</span>
                <div>
                  <div className="font-bold text-white">{selectedObj.name}</div>
                  <div className="text-xs text-gray-400">{selectedObj.type}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div className="bg-white/5 rounded p-2">
                  <div className="text-gray-500">Distance</div>
                  <div className="text-white font-mono">{formatDistance(selectedObj.distance_ly)}</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-gray-500">Measurement method</div>
                  <div className="text-white">{selectedObj.method}</div>
                </div>
              </div>
              <p className="text-sm text-indigo-200 bg-indigo-900/20 rounded p-2 border border-indigo-500/20">
                💡 {selectedObj.fact}
              </p>
            </div>
          )}
        </div>
      )}

      {section === 'compare' && (
        <div>
          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-2 block">Select object:</label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {OBJECTS.map(obj => (
                <button
                  key={obj.name}
                  onClick={() => setSelectedObj(obj)}
                  className={`p-2 rounded-lg text-center text-xs border transition-all ${selectedObj.name === obj.name ? 'border-indigo-500 bg-indigo-900/30 text-indigo-300' : 'border-white/10 text-gray-400 hover:border-indigo-500/40'}`}
                >
                  <div className="text-lg">{obj.emoji}</div>
                  <div className="leading-tight mt-0.5">{obj.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-2 block">Display unit:</label>
            <div className="flex gap-2">
              {(['ly', 'au', 'pc', 'km'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`px-3 py-1.5 text-xs rounded font-mono ${unit === u ? 'bg-indigo-600 text-white' : 'bg-white/10 text-gray-300'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
            <div className="text-4xl mb-2">{selectedObj.emoji}</div>
            <div className="text-xl font-bold text-white mb-1">{selectedObj.name}</div>
            <div className="text-3xl font-bold font-mono text-indigo-300 mb-1">
              {convertDistance(selectedObj.distance_ly)}
            </div>
            <div className="text-sm text-gray-400">
              = {formatDistance(selectedObj.distance_ly)}
            </div>
          </div>

          {/* All units */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
            {[
              { label: 'Light-years', value: `${selectedObj.distance_ly.toExponential(3)} ly` },
              { label: 'Parsecs', value: `${(selectedObj.distance_ly / 3.2616).toExponential(3)} pc` },
              { label: 'Astronomical Units', value: `${(selectedObj.distance_ly * LY_KM / AU_KM).toExponential(3)} AU` },
              { label: 'Kilometers', value: `${(selectedObj.distance_ly * LY_KM).toExponential(3)} km` },
              { label: 'Light-seconds', value: `${(selectedObj.distance_ly * 31_557_600).toExponential(3)} ls` },
              { label: 'Light-minutes', value: `${(selectedObj.distance_ly * 31_557_600 / 60).toExponential(3)} lm` },
              { label: 'Miles', value: `${(selectedObj.distance_ly * LY_KM * 0.621371).toExponential(3)} mi` },
              { label: 'Meters', value: `${(selectedObj.distance_ly * LY_KM * 1000).toExponential(3)} m` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/5 rounded p-2">
                <div className="text-gray-500">{label}</div>
                <div className="text-indigo-200 font-mono">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-blue-900/20 rounded-xl p-3 border border-blue-500/20 text-xs text-gray-300">
            <span className="text-blue-300 font-semibold">Cosmic distance ladder:</span> Astronomers chain together methods — each valid for a certain range — to measure progressively larger distances. No single method spans from the Moon to the edge of the observable universe.
          </div>
        </div>
      )}

      {section === 'travel' && (
        <div>
          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-2 block">Select destination:</label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {OBJECTS.slice(0, 9).map(obj => (
                <button
                  key={obj.name}
                  onClick={() => setSelectedObj(obj)}
                  className={`p-2 rounded-lg text-xs border transition-all text-left ${selectedObj.name === obj.name ? 'border-green-500 bg-green-900/20 text-green-300' : 'border-white/10 text-gray-300 hover:border-green-500/40'}`}
                >
                  <span className="mr-1">{obj.emoji}</span>{obj.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-300 mb-1 block">
              Travel speed: <span className="font-mono text-green-300">{(travelSpeed * 100).toFixed(2)}% of c</span>
              {' '}= <span className="font-mono text-green-200">{(travelSpeed * C_KMS).toFixed(0)} km/s</span>
            </label>
            <input
              type="range" min={0.0001} max={0.9999} step={0.0001} value={travelSpeed}
              onChange={e => setTravelSpeed(parseFloat(e.target.value))}
              className="w-full accent-green-500"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { label: 'Voyager (17 km/s)', v: 17 / C_KMS },
                { label: 'Parker Probe (192 km/s)', v: 192 / C_KMS },
                { label: '10% c', v: 0.1 },
                { label: '50% c', v: 0.5 },
                { label: '99% c', v: 0.99 },
              ].map(({ label, v }) => (
                <button
                  key={label}
                  onClick={() => setTravelSpeed(v)}
                  className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-gray-300 rounded"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center mb-4">
            <div className="text-lg text-gray-300 mb-1">{selectedObj.emoji} {selectedObj.name}</div>
            <div className="text-sm text-gray-400 mb-3">{formatDistance(selectedObj.distance_ly)}</div>
            <div className="text-3xl font-bold text-green-300 font-mono mb-1">
              {travelTime(selectedObj.distance_ly, travelSpeed)}
            </div>
            <div className="text-sm text-gray-400">travel time at {(travelSpeed * 100).toFixed(3)}% c</div>
            {travelSpeed > 0.3 && (
              <div className="mt-2 text-sm text-purple-300">
                Due to time dilation (γ={`${(1 / Math.sqrt(1 - travelSpeed * travelSpeed)).toFixed(2)}`}×),
                traveler experiences only {travelTime(selectedObj.distance_ly, travelSpeed * (1 / Math.sqrt(1 - travelSpeed * travelSpeed)) * travelSpeed)} onboard
              </div>
            )}
          </div>

          <div className="bg-yellow-900/20 rounded-xl p-3 border border-yellow-500/20 text-xs text-gray-300">
            <span className="text-yellow-300 font-semibold">Breakthrough Starshot concept:</span> A gram-scale laser-propelled sail accelerated to 20% c could reach Proxima Centauri in ~21 years. The nearest star that might host life, in a human lifetime!
          </div>
        </div>
      )}

      {/* Distance measurement methods */}
      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wide">The Cosmic Distance Ladder — Methods</div>
        <div className="space-y-2">
          {METHODS.map(m => (
            <div key={m.name} className="flex gap-3 text-xs">
              <div className="w-36 text-indigo-300 font-semibold flex-shrink-0">{m.name}</div>
              <div className="text-gray-500 w-20 flex-shrink-0">{m.range}</div>
              <div className="text-gray-300">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
