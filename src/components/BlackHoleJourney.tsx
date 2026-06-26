import { useState } from 'react'

interface Phase {
  name: string
  distance: string
  icon: string
  color: string
  duration: string
  experience: string
  physics: string
  seenFromEarth: string
}

interface BlackHole {
  id: string
  name: string
  icon: string
  color: string
  massSolar: number
  massLabel: string
  schwarzschildKm: number
  type: 'stellar' | 'intermediate' | 'supermassive' | 'ultramassive'
  location: string
  realFact: string
  phases: Phase[]
}

const BLACK_HOLES: BlackHole[] = [
  {
    id: 'stellar',
    name: 'Stellar Black Hole',
    icon: '⚫',
    color: '#6366f1',
    massSolar: 10,
    massLabel: '10 solar masses',
    schwarzschildKm: 30,
    type: 'stellar',
    location: 'Cygnus X-1 (nearest at 7,200 ly)',
    realFact: 'Cygnus X-1 was the first confirmed black hole (1972). It\'s 21 solar masses and actively feeding from a companion star — the X-rays are visible from Earth.',
    phases: [
      {
        name: 'Safe Distance',
        distance: '10,000+ km',
        icon: '🛸',
        color: '#22c55e',
        duration: 'Normal time',
        experience: 'No effects noticeable. You could orbit safely here.',
        physics: 'Gravitational influence negligible at this distance.',
        seenFromEarth: 'You appear normal, moving normally.'
      },
      {
        name: 'Accretion Disk',
        distance: '300 km',
        icon: '🌀',
        color: '#fbbf24',
        duration: 'Hours of subjective time',
        experience: 'Intense radiation and X-rays. Extremely hot plasma swirls around you at near-light speed. Magnetic fields stronger than any on Earth.',
        physics: 'Tidal forces start stretching you radially. Infalling matter heats to millions of degrees. Relativistic jets above/below the poles.',
        seenFromEarth: 'You appear to slow down slightly. Colors shift toward red.'
      },
      {
        name: 'Photon Sphere',
        distance: '45 km (1.5× event horizon)',
        icon: '💡',
        color: '#f97316',
        duration: 'Minutes',
        experience: 'Light orbits around you in a circle. You can see the back of your own head! The universe appears distorted into an eerie ring.',
        physics: 'At 1.5× Schwarzschild radius, photons orbit in circles. Extreme light bending creates Einstein rings and multiple images of every object.',
        seenFromEarth: 'You move noticeably slower. Your image is strongly redshifted.'
      },
      {
        name: 'Event Horizon',
        distance: '30 km (event horizon)',
        icon: '🔴',
        color: '#ef4444',
        duration: 'Instantaneous (for you)',
        experience: 'Spaghettification begins — tidal forces stretch you along the radial direction. For a stellar black hole, you\'d be torn apart BEFORE crossing the event horizon.',
        physics: 'Tidal force: ~10^14 g/cm. Schwarzschild radius crossed. Time dilation becomes infinite as seen from outside.',
        seenFromEarth: 'You freeze at the event horizon, redshifting to invisibility. You never appear to cross.'
      },
      {
        name: 'Inside (Hypothetical)',
        distance: '< 30 km',
        icon: '♾️',
        color: '#a855f7',
        duration: 'Microseconds',
        experience: 'Spacetime is so warped that "future" now points toward the singularity. Nothing can stop you. The entire future history of the universe is compressed into a ring of light above you.',
        physics: 'Inside a Kerr (rotating) black hole, timelike curves can loop. Cauchy horizon may exist. General relativity breaks down at the singularity.',
        seenFromEarth: 'You remain frozen at the horizon, fading forever.'
      },
    ]
  },
  {
    id: 'sagittarius',
    name: 'Sagittarius A* (Milky Way Center)',
    icon: '🌀',
    color: '#a855f7',
    massSolar: 4000000,
    massLabel: '4 million solar masses',
    schwarzschildKm: 11600000,
    type: 'supermassive',
    location: 'Center of our galaxy, 26,000 light-years away',
    realFact: 'The Event Horizon Telescope photographed Sgr A*\'s shadow in 2022. Stars orbit it at 2.5% the speed of light. First image published alongside M87*.',
    phases: [
      {
        name: 'Safe Distance',
        distance: '100 light-years',
        icon: '🛸',
        color: '#22c55e',
        duration: 'Normal time',
        experience: 'You could orbit the galactic center comfortably here. Intense star density — thousands of stars nearby.',
        physics: 'Stars orbit Sgr A* at enormous velocities. S2 orbit the black hole at 7,650 km/s.',
        seenFromEarth: 'You look normal. We\'d observe you with our best telescopes.'
      },
      {
        name: 'Stellar Ring',
        distance: '0.1 light-years',
        icon: '⭐',
        color: '#fbbf24',
        duration: 'Years',
        experience: 'Surrounded by stars orbiting the black hole at thousands of km/s. Intense X-ray and radio emission from the region. Magnetic fields millions of times Earth\'s.',
        physics: 'This is where stars like S2 orbit. Tidal forces negligible at this scale from the black hole.',
        seenFromEarth: 'You\'re detectable but light is slightly redshifted.'
      },
      {
        name: 'Event Horizon',
        distance: '11,600,000 km (event horizon)',
        icon: '🔴',
        color: '#ef4444',
        duration: 'Hours of proper time',
        experience: 'Remarkably: no spaghettification! Sgr A*\'s tidal forces at the event horizon are weak — spread over 11.6M km. You cross smoothly. The universe above you collapses into an Einstein ring.',
        physics: 'Tidal force at horizon: only ~0.0001g — less than Earth\'s gravity. You cross the event horizon without feeling it.',
        seenFromEarth: 'You appear to freeze and redshift to invisibility at the horizon.'
      },
      {
        name: 'Inside Sgr A*',
        distance: 'Inside event horizon',
        icon: '♾️',
        color: '#a855f7',
        duration: '~7 hours before singularity',
        experience: 'You have ~7 hours of proper time until you reach the singularity. The entire future light cone of the universe is compressed into a ring above you, brightening as you fall.',
        physics: 'Inside a rotating (Kerr) black hole, geodesics allow 7 hours of proper time. Hawking radiation is ~0.000000001 Kelvin — negligible. Classical GR predicts a singularity.',
        seenFromEarth: 'You\'re frozen at the horizon forever in our reference frame.'
      },
    ]
  },
  {
    id: 'ton618',
    name: 'TON 618 (Ultramassive)',
    icon: '👁️',
    color: '#ec4899',
    massSolar: 66000000000,
    massLabel: '66 billion solar masses',
    schwarzschildKm: 194700000000,
    type: 'ultramassive',
    location: '10.4 billion light-years away in Leo',
    realFact: 'TON 618 powers a quasar 140 trillion times brighter than our Sun. Its event horizon diameter is 1,300 AU — larger than our solar system.',
    phases: [
      {
        name: 'Event Horizon Approach',
        distance: '194 billion km',
        icon: '🌌',
        color: '#ec4899',
        duration: 'Days of proper time',
        experience: 'The black hole\'s event horizon is so vast — 1,300 AU across — that you\'d see it as a sphere covering most of your sky. No tidal forces yet.',
        physics: 'Schwarzschild radius: 194.7 billion km (1,300 AU). Tidal force at event horizon: 4 × 10⁻¹⁵ g/cm — essentially zero.',
        seenFromEarth: 'At 10.4 billion light-years, we couldn\'t observe you even with JWST.'
      },
      {
        name: 'Crossing Event Horizon',
        distance: '194,700,000,000 km',
        icon: '⭕',
        color: '#f97316',
        duration: 'Normal — no sensation',
        experience: 'You cross the largest event horizon in the known universe and feel absolutely nothing. It takes days to cross. The quasar\'s accretion disk was the real danger — you\'d need to avoid it entirely.',
        physics: 'At this mass, the event horizon is so large that space curvature there is gentle. Classical spacetime just... curves.',
        seenFromEarth: 'Utterly invisible from Earth even with future technology.'
      },
      {
        name: 'Deep Inside',
        distance: 'Far inside',
        icon: '♾️',
        color: '#a855f7',
        duration: 'Years of proper time!',
        experience: 'With 66 billion solar masses, you have YEARS of proper time before reaching the singularity. Hawking radiation is coldest possible — 10⁻²¹ Kelvin. The interior is vast, dark, and silent.',
        physics: 'Proper time to singularity scales with mass. For TON 618: ~7,800 years of subjective time to reach the singularity from the horizon.',
        seenFromEarth: 'Entirely outside our observable universe by the time this mattered.'
      },
    ]
  },
]

export default function BlackHoleJourney() {
  const [selected, setSelected] = useState<BlackHole>(BLACK_HOLES[1])
  const [activePhase, setActivePhase] = useState<number>(0)

  const phase = selected.phases[activePhase]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Black Hole Journey</h2>
      <p className="text-gray-400 text-sm mb-5">What would you actually experience falling into a black hole? Real physics, step by step.</p>

      {/* Black hole selector */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {BLACK_HOLES.map(bh => (
          <button
            key={bh.id}
            onClick={() => { setSelected(bh); setActivePhase(0) }}
            className="p-3 rounded-xl transition-all text-center"
            style={{
              background: selected.id === bh.id ? bh.color + '20' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${selected.id === bh.id ? bh.color + '60' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-3xl mb-1">{bh.icon}</div>
            <div className="text-xs font-bold" style={{ color: selected.id === bh.id ? bh.color : '#9ca3af' }}>{bh.name}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">{bh.massLabel}</div>
          </button>
        ))}
      </div>

      {/* Black hole stats */}
      <div className="rounded-xl p-4 mb-5" style={{ background: selected.color + '10', border: `1px solid ${selected.color}30` }}>
        <div className="flex flex-wrap gap-4 text-sm">
          <div><span className="text-gray-500">📍 Location:</span> <span className="text-gray-300"> {selected.location}</span></div>
          <div><span className="text-gray-500">⚖️ Mass:</span> <span style={{ color: selected.color }}> {selected.massLabel}</span></div>
          <div><span className="text-gray-500">📏 Event Horizon:</span> <span className="text-gray-300"> {selected.schwarzschildKm.toLocaleString()} km</span></div>
        </div>
        <p className="text-gray-400 text-xs mt-2">{selected.realFact}</p>
      </div>

      {/* Phase journey */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {selected.phases.map((p, i) => (
          <button
            key={i}
            onClick={() => setActivePhase(i)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: activePhase === i ? p.color + '25' : 'rgba(255,255,255,0.04)',
              color: activePhase === i ? p.color : '#6b7280',
              border: `1px solid ${activePhase === i ? p.color + '50' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {p.icon} {p.name}
          </button>
        ))}
      </div>

      {/* Active phase detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: phase.color + '12', border: `1px solid ${phase.color}35` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{phase.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{phase.name}</h3>
              <div className="text-xs text-gray-500">Distance: {phase.distance}</div>
              <div className="text-xs text-gray-500">Duration: {phase.duration}</div>
            </div>
          </div>
          <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What You Experience</div>
          <p className="text-gray-200 text-sm leading-relaxed">{phase.experience}</p>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">⚛️ The Physics</div>
            <p className="text-gray-300 text-sm leading-relaxed">{phase.physics}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="text-indigo-400 text-xs uppercase font-semibold mb-2">🔭 Seen From Earth</div>
            <p className="text-gray-300 text-sm leading-relaxed">{phase.seenFromEarth}</p>
          </div>
          {/* Navigation */}
          <div className="flex gap-2">
            <button
              onClick={() => setActivePhase(Math.max(0, activePhase - 1))}
              disabled={activePhase === 0}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-30"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >← Previous</button>
            <button
              onClick={() => setActivePhase(Math.min(selected.phases.length - 1, activePhase + 1))}
              disabled={activePhase === selected.phases.length - 1}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-30"
              style={{ background: selected.color + '25', color: selected.color }}
            >Next →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
