import { useState, useMemo } from 'react'

interface Asteroid {
  id: string
  name: string
  icon: string
  diameter: number
  diameterUnit: string
  mass: string
  realExample: string
  color: string
  description: string
}

interface ImpactResult {
  craterDiameter: number
  craterDepth: number
  fireball: number
  blast: number
  seismic: number
  tsunami: number | null
  deadlyRadius: number
  devastationRadius: number
  windowsBreak: number
  energyMegatons: number
  energyComparison: string
  survivalTip: string
  whatYouSee: string[]
  timeline: { time: string; event: string; color: string }[]
}

const ASTEROIDS: Asteroid[] = [
  {
    id: 'car',
    name: 'Car-Sized',
    icon: '🚗',
    diameter: 2,
    diameterUnit: '2 meters',
    mass: '~10 tons',
    realExample: 'Chelyabinsk-type (smaller)',
    color: '#22c55e',
    description: 'Burns up mostly in atmosphere. Mostly harmless.'
  },
  {
    id: 'chelyabinsk',
    name: 'Chelyabinsk (2013)',
    icon: '💫',
    diameter: 20,
    diameterUnit: '20 meters',
    mass: '~12,000 tons',
    realExample: 'The 2013 Chelyabinsk event — real',
    color: '#f97316',
    description: 'Exploded 30 km up. Shockwave injured 1,500 people, shattered windows across a city.'
  },
  {
    id: 'tunguska',
    name: 'Tunguska (1908)',
    icon: '🔥',
    diameter: 60,
    diameterUnit: '60 meters',
    mass: '~1 million tons',
    realExample: 'The 1908 Tunguska event — real',
    color: '#ef4444',
    description: 'Flattened 2,000 km² of Siberian forest. Exploded in mid-air, no crater.'
  },
  {
    id: 'city',
    name: 'City-Killer',
    icon: '☄️',
    diameter: 300,
    diameterUnit: '300 meters',
    mass: '~80 million tons',
    realExample: 'Apophis class',
    color: '#dc2626',
    description: 'Would obliterate a major city and surrounding region entirely.'
  },
  {
    id: 'dinosaur',
    name: 'Chicxulub (Dinosaur Killer)',
    icon: '🦕',
    diameter: 10000,
    diameterUnit: '10 km',
    mass: '~1 trillion tons',
    realExample: 'The actual asteroid that killed dinosaurs 66M years ago',
    color: '#7f1d1d',
    description: 'Mass extinction event. Ended the Cretaceous period. Killed 75% of all species.'
  },
]

const TARGETS = [
  { id: 'land', name: 'Land (City)', icon: '🏙️', hasTsunami: false },
  { id: 'ocean', name: 'Ocean', icon: '🌊', hasTsunami: true },
  { id: 'desert', name: 'Desert', icon: '🏜️', hasTsunami: false },
]

function calcImpact(asteroid: Asteroid, targetHasOcean: boolean): ImpactResult {
  const d = asteroid.diameter
  const energyMegatons = Math.pow(d / 20, 3) * 0.5

  const craterDiameter = d * 15
  const craterDepth = craterDiameter * 0.15
  const fireball = d * 8
  const blast = d * 25
  const seismic = d * 80
  const deadlyRadius = d * 12
  const devastationRadius = d * 40
  const windowsBreak = d * 100

  let energyComparison = ''
  if (energyMegatons < 0.001) energyComparison = 'a large bomb'
  else if (energyMegatons < 0.1) energyComparison = 'a nuclear weapon'
  else if (energyMegatons < 10) energyComparison = `${Math.round(energyMegatons * 67)} Hiroshima bombs`
  else if (energyMegatons < 1000) energyComparison = `${Math.round(energyMegatons)} megatons — the largest nuclear weapon ever tested`
  else energyComparison = `${(energyMegatons / 1000).toFixed(0)} gigatons — ${Math.round(energyMegatons / 58)} times all nuclear weapons on Earth combined`

  const timeline = [
    { time: 'T-0', event: 'Impact / Airburst — blinding flash visible for hundreds of km', color: '#fbbf24' },
    { time: 'T+5s', event: 'Fireball expands — temperatures reach 10,000°C at ground zero', color: '#f97316' },
    { time: 'T+30s', event: 'Shockwave arrives at 1 km distance — supersonic wall of air', color: '#ef4444' },
    { time: 'T+2min', event: 'Ejecta rains down — superheated rocks fall within blast radius', color: '#dc2626' },
    { time: 'T+10min', event: 'Fires ignite across devastation zone from thermal pulse', color: '#b91c1c' },
    { time: 'T+1hr', event: d >= 1000 ? 'Global dust cloud begins blocking sunlight' : 'Regional fires merge, debris cloud visible from space', color: '#7f1d1d' },
  ]

  const whatYouSee: string[] = []
  whatYouSee.push(`A flash brighter than the Sun — do NOT look at it`)
  whatYouSee.push(`${fireball.toFixed(0)} km fireball visible on the horizon`)
  if (d >= 20) whatYouSee.push(`Shockwave arrives seconds later — shatters glass, collapses buildings`)
  if (d >= 60) whatYouSee.push(`Mushroom cloud rises to the stratosphere`)
  if (d >= 300) whatYouSee.push(`Ground shakes like a magnitude ${Math.min(9.5, 6 + Math.log10(d / 10)).toFixed(1)} earthquake`)
  if (d >= 1000) whatYouSee.push(`Sky turns dark within hours as ejecta enters orbit`)
  if (d >= 10000) whatYouSee.push(`Global firestorm. Acid rain for years. 5-year nuclear winter.`)

  return {
    craterDiameter, craterDepth, fireball, blast, seismic,
    tsunami: targetHasOcean ? d * 50 : null,
    deadlyRadius, devastationRadius, windowsBreak,
    energyMegatons,
    energyComparison,
    survivalTip: d < 60
      ? 'Stay indoors away from windows. The real danger is the shockwave, not the fireball.'
      : d < 300
      ? 'Evacuate the region immediately. Do not try to watch it.'
      : 'There is no surviving inside the devastation zone. Evacuate the continent.',
    whatYouSee,
    timeline,
  }
}

function RadiusBar({ label, value, max, color, unit = 'km' }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono font-bold" style={{ color }}>{value < 1 ? `${(value * 1000).toFixed(0)}m` : `${value.toFixed(0)} ${unit}`}</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function AsteroidImpactSimulator() {
  const [selectedAsteroid, setSelectedAsteroid] = useState<Asteroid>(ASTEROIDS[1])
  const [selectedTarget, setSelectedTarget] = useState(TARGETS[0])
  const [showTimeline, setShowTimeline] = useState(false)

  const result = useMemo(
    () => calcImpact(selectedAsteroid, selectedTarget.hasTsunami),
    [selectedAsteroid, selectedTarget]
  )

  const maxRadius = Math.max(result.devastationRadius, result.windowsBreak, result.seismic)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Asteroid Impact Simulator</h2>
      <p className="text-gray-400 text-sm mb-5">Select an asteroid and a target — see exactly what would happen, in numbers</p>

      {/* Asteroid selector */}
      <div className="mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Choose Asteroid</div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {ASTEROIDS.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAsteroid(a)}
              className="text-left p-3 rounded-xl transition-all"
              style={{
                background: selectedAsteroid.id === a.id ? a.color + '20' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selectedAsteroid.id === a.id ? a.color + '60' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="text-2xl mb-1">{a.icon}</div>
              <div className="text-xs font-bold" style={{ color: selectedAsteroid.id === a.id ? a.color : '#e2e8f0' }}>{a.name}</div>
              <div className="text-gray-600 text-[10px] mt-0.5">{a.diameterUnit}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Target selector */}
      <div className="mb-5">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Choose Target</div>
        <div className="flex gap-2">
          {TARGETS.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTarget(t)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-semibold"
              style={{
                background: selectedTarget.id === t.id ? 'rgba(99,102,241,0.2)' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selectedTarget.id === t.id ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`,
                color: selectedTarget.id === t.id ? '#a5b4fc' : '#9ca3af',
              }}
            >
              <span>{t.icon}</span> {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Asteroid info */}
      <div className="rounded-xl p-4 mb-5" style={{ background: selectedAsteroid.color + '12', border: `1px solid ${selectedAsteroid.color}35` }}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">{selectedAsteroid.icon}</span>
          <div>
            <div className="font-bold text-white text-lg">{selectedAsteroid.name}</div>
            <div className="text-xs" style={{ color: selectedAsteroid.color }}>{selectedAsteroid.realExample}</div>
          </div>
        </div>
        <p className="text-gray-300 text-sm">{selectedAsteroid.description}</p>
        <div className="mt-2 flex gap-4 text-xs text-gray-500">
          <span>Diameter: <span className="text-white font-semibold">{selectedAsteroid.diameterUnit}</span></span>
          <span>Mass: <span className="text-white font-semibold">{selectedAsteroid.mass}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Impact radii */}
        <div className="bg-gray-800/60 rounded-xl p-4">
          <div className="text-gray-400 text-xs uppercase font-semibold mb-4">Impact Radii</div>
          <RadiusBar label="Fireball radius" value={result.fireball} max={maxRadius} color="#fbbf24" />
          <RadiusBar label="Deadly blast zone" value={result.deadlyRadius} max={maxRadius} color="#f97316" />
          <RadiusBar label="Total devastation" value={result.devastationRadius} max={maxRadius} color="#ef4444" />
          <RadiusBar label="Seismic effects" value={result.seismic} max={maxRadius} color="#a855f7" />
          <RadiusBar label="Windows shatter" value={result.windowsBreak} max={maxRadius} color="#3b82f6" />
          {result.tsunami && (
            <RadiusBar label="Tsunami reach" value={result.tsunami} max={maxRadius} color="#06b6d4" />
          )}

          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Crater (if ground impact)</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-900/50 rounded-lg p-2">
                <div className="text-gray-500">Diameter</div>
                <div className="font-bold text-white">{result.craterDiameter.toFixed(0)} km</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-2">
                <div className="text-gray-500">Depth</div>
                <div className="font-bold text-white">{result.craterDepth.toFixed(1)} km</div>
              </div>
            </div>
          </div>
        </div>

        {/* Energy & effects */}
        <div className="space-y-3">
          <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-red-400 text-xs uppercase font-semibold mb-2">Energy Released</div>
            <div className="font-black text-2xl text-white mb-1">
              {result.energyMegatons < 0.001
                ? `${(result.energyMegatons * 1000).toFixed(2)} kilotons`
                : result.energyMegatons < 1000
                ? `${result.energyMegatons.toFixed(1)} megatons`
                : `${(result.energyMegatons / 1000).toFixed(0)} gigatons`}
            </div>
            <div className="text-gray-400 text-xs">≈ {result.energyComparison}</div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What You Would See</div>
            <ul className="space-y-1.5">
              {result.whatYouSee.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="text-orange-400 mt-0.5 flex-shrink-0">▸</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="text-green-400 text-xs uppercase font-semibold mb-1">💡 Survival Tip</div>
            <p className="text-gray-300 text-xs leading-relaxed">{result.survivalTip}</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-5">
        <button
          onClick={() => setShowTimeline(v => !v)}
          className="w-full text-left p-3 rounded-xl transition-all"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-indigo-400 font-semibold text-sm">⏱ Impact Timeline — Second by Second</span>
            <span className="text-gray-500 text-xs">{showTimeline ? '▲ hide' : '▼ show'}</span>
          </div>
        </button>
        {showTimeline && (
          <div className="mt-3 space-y-2">
            {result.timeline.map((t, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="font-mono text-xs px-2 py-1 rounded flex-shrink-0 font-bold" style={{ background: t.color + '20', color: t.color }}>{t.time}</span>
                <p className="text-gray-300 text-xs leading-relaxed pt-1">{t.event}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real events footer */}
      <div className="mt-5 bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
        <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Real Events for Reference</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            { icon: '💫', name: 'Chelyabinsk 2013', detail: '20m asteroid, 500 kilotons, 1,500 injured, windows shattered across a city' },
            { icon: '🔥', name: 'Tunguska 1908', detail: '60m asteroid, 10-15 megatons, flattened 2,000 km² of forest' },
            { icon: '🦕', name: 'Chicxulub 66M years ago', detail: '10 km asteroid, ~100 million megatons, ended the dinosaurs' },
          ].map(e => (
            <div key={e.name} className="bg-gray-900/50 rounded-lg p-3">
              <div className="text-xl mb-1">{e.icon}</div>
              <div className="font-bold text-white mb-1">{e.name}</div>
              <div className="text-gray-500">{e.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
