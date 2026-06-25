import { useState } from 'react'

interface DebrisEvent {
  id: string
  year: number
  title: string
  icon: string
  color: string
  type: 'launch' | 'collision' | 'test' | 'milestone' | 'policy' | 'alarm'
  objectsAdded: number
  description: string
  impact: string
  still_in_orbit: boolean
}

interface DebrisStat {
  label: string
  value: string
  icon: string
  color: string
  detail: string
}

const EVENTS: DebrisEvent[] = [
  {
    id: 'sputnik',
    year: 1957,
    title: 'Sputnik 1 — First Object in Orbit',
    icon: '🛸',
    color: '#fbbf24',
    type: 'launch',
    objectsAdded: 2,
    description: 'Sputnik 1 and its rocket upper stage become the first human objects in Earth orbit. The satellite itself re-entered in January 1958; the rocket stage in April 1958.',
    impact: 'The first debris — though it deorbited naturally within months due to atmospheric drag. But it began the era that would eventually produce 35,000+ tracked objects.',
    still_in_orbit: false
  },
  {
    id: 'vanguard',
    year: 1958,
    title: 'Vanguard 1 — Still in Orbit (the oldest debris)',
    icon: '⚽',
    color: '#3b82f6',
    type: 'milestone',
    objectsAdded: 1,
    description: 'Launched March 17, 1958. Vanguard 1 is the oldest human-made object still in Earth orbit. It\'s a 1.47 kg grapefruit-sized sphere, 16.5 cm in diameter. Its transmitters died in 1964.',
    impact: 'Demonstrates the persistence of high-altitude debris. Vanguard 1 orbits at ~650 km altitude and is expected to stay in orbit for another 240 years. It has now outlasted its creators.',
    still_in_orbit: true
  },
  {
    id: 'ferret_d',
    year: 1961,
    title: 'Project West Ford — 480 Million Copper Needles Released',
    icon: '📡',
    color: '#94a3b8',
    type: 'launch',
    objectsAdded: 480000000,
    description: 'The US military released 480 million copper dipole antennas (needles) into a belt orbit at 3,700 km altitude to create a "communication belt" around Earth — a belt of artificial signal reflectors. The experiment failed but the needles remain.',
    impact: 'Caused international outrage. Astronomers feared the needles would ruin radio astronomy forever. Most gradually dispersed, but hundreds of clusters are still tracked by radar. The incident led to early international discussions about space environmental responsibility.',
    still_in_orbit: true
  },
  {
    id: 'china_asat',
    year: 2007,
    title: 'China\'s ASAT Test — Single Worst Debris Event in History',
    icon: '💥',
    color: '#ef4444',
    type: 'test',
    objectsAdded: 3500,
    description: 'China destroyed its own aging weather satellite Fengyun-1C with a ground-based missile. Created at least 3,500 trackable debris fragments and an estimated 35,000+ pieces >1 cm — in a busy orbit at 850 km altitude.',
    impact: 'The single largest debris-generating event in history. Fengyun-1C was at 850 km — high enough that the debris will remain in orbit for decades to centuries. The ISS still performs avoidance maneuvers to dodge Fengyun-1C fragments 17 years later. Provoked international condemnation.',
    still_in_orbit: true
  },
  {
    id: 'cosmos_iridium',
    year: 2009,
    title: 'Iridium 33 × Cosmos 2251 — First Major Accidental Collision',
    icon: '💥',
    color: '#ef4444',
    type: 'collision',
    objectsAdded: 2000,
    description: 'February 10, 2009: Iridium 33 (US commercial satellite) collided with Cosmos 2251 (defunct Russian military satellite). First major accidental collision in orbit. Both vehicles destroyed at 789 km altitude.',
    impact: 'Created 2,000 tracked fragments and an estimated 100,000+ fragments >1 cm. The event validated growing concerns about the "Kessler Syndrome." The Iridium constellation had to be redesigned around the collision zone.',
    still_in_orbit: true
  },
  {
    id: 'us_asat',
    year: 2022,
    title: 'Russia\'s ASAT Test (2021) — Endangers ISS',
    icon: '🇷🇺',
    color: '#ef4444',
    type: 'test',
    objectsAdded: 1500,
    description: 'November 15, 2021: Russia destroyed Kosmos-1408 with a direct-ascent anti-satellite missile. Created 1,500+ tracked fragments at 480 km altitude — dangerously close to the ISS (at 400 km). ISS crew sheltered in their Soyuz/Dragon vehicles for hours.',
    impact: 'The 7 ISS crew members had to shelter as the station passed through the debris cloud multiple times per orbit. US State Department called it "dangerous and irresponsible." US, UK, Canada, Japan, France, Germany, Australia all condemned the test. Biden administration then announced a US unilateral moratorium on ASAT tests.',
    still_in_orbit: true
  },
  {
    id: 'starlink',
    year: 2023,
    title: 'Mega-Constellations — SpaceX Starlink Surpasses 5,000 Satellites',
    icon: '🌐',
    color: '#22c55e',
    type: 'alarm',
    objectsAdded: 5000,
    description: 'By 2023, SpaceX had launched over 5,000 Starlink satellites — more than half of all active satellites in orbit. Amazon Kuiper, OneWeb, and others plan to launch tens of thousands more.',
    impact: 'Mega-constellations provide internet coverage but dramatically increase collision risk and conjunction events (close approaches requiring maneuvers). SpaceX has already been responsible for hundreds of conjunctions with other satellites. Astronomers complain Starlink satellites disrupt observations. ESA and other agencies report an exponential rise in collision avoidance maneuvers.',
    still_in_orbit: true
  },
  {
    id: 'kessler_concern',
    year: 2024,
    title: 'Kessler Syndrome — Scientists Warn of Cascade Point',
    icon: '⚠️',
    color: '#f97316',
    type: 'alarm',
    objectsAdded: 0,
    description: 'Multiple studies in 2023-2024 warned that certain orbital shells (especially 500-1000 km) may already be approaching or past the point where debris generation exceeds natural removal — potentially triggering a cascade.',
    impact: 'If Kessler Syndrome begins, collisions generate debris that causes more collisions exponentially. A runaway cascade could render certain orbital shells unusable for centuries and potentially blockade access to space entirely. ESA\'s Space Debris Report (2023) counted 36,500 trackable objects >10 cm.',
    still_in_orbit: true
  },
]

const STATS: DebrisStat[] = [
  {
    label: 'Tracked objects (>10 cm)',
    value: '36,500+',
    icon: '📡',
    color: '#ef4444',
    detail: 'Actively tracked by US Space Surveillance Network radar'
  },
  {
    label: 'Untracked objects (1-10 cm)',
    value: '~1 million',
    icon: '🔴',
    color: '#f97316',
    detail: 'Too small to track but large enough to destroy a satellite'
  },
  {
    label: 'Sub-centimeter fragments',
    value: '~130 million',
    icon: '💥',
    color: '#fbbf24',
    detail: 'Paint flakes, oxidized aluminum — can still damage spacecraft'
  },
  {
    label: 'Average debris speed',
    value: '~7.5 km/s',
    icon: '⚡',
    color: '#3b82f6',
    detail: 'A 1 cm fragment at this speed has impact energy of a grenade'
  },
]

const EVENT_TYPES: { id: DebrisEvent['type']; label: string; color: string }[] = [
  { id: 'launch', label: 'Launch', color: '#3b82f6' },
  { id: 'collision', label: 'Collision', color: '#ef4444' },
  { id: 'test', label: 'ASAT Test', color: '#f97316' },
  { id: 'milestone', label: 'Milestone', color: '#22c55e' },
  { id: 'alarm', label: 'Alarm', color: '#fbbf24' },
  { id: 'policy', label: 'Policy', color: '#a855f7' },
]

export default function SpaceDebrisTimeline() {
  const [selected, setSelected] = useState<DebrisEvent>(EVENTS[3])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Debris Crisis</h2>
      <p className="text-gray-400 text-sm mb-5">From Sputnik's single rocket stage to 130 million fragments — how humanity turned Earth orbit into a junkyard, and what's at stake</p>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATS.map(s => (
          <div key={s.label} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/30">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="font-black text-lg mb-0.5" style={{ color: s.color }}>{s.value}</div>
            <div className="text-gray-500 text-xs font-semibold mb-1">{s.label}</div>
            <div className="text-gray-600 text-xs">{s.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Timeline list */}
        <div className="relative">
          <div className="absolute left-3.5 top-3 bottom-3 w-0.5 bg-gray-700/60" />
          <div className="space-y-2">
            {EVENTS.map(event => {
              const typeInfo = EVENT_TYPES.find(t => t.id === event.type)!
              return (
                <button
                  key={event.id}
                  onClick={() => setSelected(event)}
                  className="w-full text-left pl-8 pr-3 py-2.5 rounded-xl transition-all relative"
                  style={{
                    background: selected.id === event.id ? event.color + '18' : 'transparent',
                    border: `1px solid ${selected.id === event.id ? event.color + '45' : 'transparent'}`,
                  }}
                >
                  <div className="absolute left-2 top-3.5 text-base">{event.icon}</div>
                  <div className="font-mono text-xs mb-0.5" style={{ color: event.color }}>{event.year}</div>
                  <div className="text-sm font-semibold" style={{ color: selected.id === event.id ? event.color : '#e2e8f0' }}>{event.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: typeInfo.color + '20', color: typeInfo.color }}>
                      {typeInfo.label}
                    </span>
                    {event.objectsAdded > 0 && (
                      <span className="text-gray-600 text-xs">+{event.objectsAdded.toLocaleString()} objects</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-4" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3">
              <span className="text-4xl flex-shrink-0">{selected.icon}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-sm font-bold" style={{ color: selected.color }}>{selected.year}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full text-white font-semibold"
                    style={{ background: EVENT_TYPES.find(t => t.id === selected.type)?.color + '40' }}>
                    {EVENT_TYPES.find(t => t.id === selected.type)?.label}
                  </span>
                  {selected.still_in_orbit && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-orange-300" style={{ background: 'rgba(249,115,22,0.2)' }}>
                      Still in orbit
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white">{selected.title}</h3>
                {selected.objectsAdded > 0 && (
                  <div className="text-sm mt-0.5" style={{ color: selected.color }}>
                    +{selected.objectsAdded.toLocaleString()} debris objects added
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">What Happened</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.description}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-red-400 text-xs uppercase font-semibold mb-2">Impact & Consequences</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.impact}</p>
          </div>
        </div>
      </div>

      {/* Kessler syndrome explainer */}
      <div className="mt-6 rounded-xl p-5 border" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
        <div className="flex items-start gap-3">
          <span className="text-3xl">⚠️</span>
          <div>
            <h3 className="text-white font-bold text-base mb-2">The Kessler Syndrome — Earth's Most Dangerous Space Threat</h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-3">
              In 1978, NASA scientist Donald Kessler predicted that once debris density reaches a critical threshold, a cascade becomes self-sustaining: each collision creates fragments that cause more collisions, exponentially increasing debris density until certain orbits become completely unusable — potentially for centuries.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {[
                { label: 'Critical shells', value: '500–1000 km LEO', icon: '🎯', sub: 'Most concern: heavily used altitude' },
                { label: 'ISS maneuvers/year', value: '~30', icon: '🛸', sub: 'Avoidance maneuvers increasing' },
                { label: 'Active deorbit proposals', value: 'ClearSpace-1 (ESA, 2026)', icon: '🤖', sub: 'First debris removal spacecraft' },
              ].map(s => (
                <div key={s.label} className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-xl mb-1">{s.icon}</div>
                  <div className="font-bold text-sm text-white">{s.value}</div>
                  <div className="text-gray-500 text-xs">{s.label}</div>
                  <div className="text-gray-600 text-xs mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
