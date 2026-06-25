import { useState } from 'react'

interface DefenseMethod {
  name: string
  type: string
  trl: number
  timeRequired: string
  warningNeeded: string
  pros: string[]
  cons: string[]
  realExample: string
  color: string
  icon: string
}

interface TorinoLevel {
  level: number
  label: string
  color: string
  desc: string
  examples: string
}

interface NearMiss {
  date: string
  object: string
  distance: string
  size: string
  note: string
}

const METHODS: DefenseMethod[] = [
  {
    name: 'Kinetic Impactor',
    type: 'Proven Technique',
    trl: 9,
    timeRequired: 'Years to decades',
    warningNeeded: '10+ years',
    pros: ['Proven by DART mission (2022)', 'No nuclear material', 'Relatively simple technology', 'Can be demonstrated safely'],
    cons: ['Only effective for smaller objects', 'Requires early warning', 'May fragment rather than deflect', 'Ejecta must be accounted for'],
    realExample: 'NASA\'s DART spacecraft impacted Dimorphos (160 m moon of Didymos) on Sep 26, 2022. It changed the orbit by 33 minutes — far exceeding the 73-second goal.',
    color: '#f97316',
    icon: '🚀'
  },
  {
    name: 'Gravity Tractor',
    type: 'Gentle Nudge',
    trl: 5,
    timeRequired: 'Decades',
    warningNeeded: '20+ years',
    pros: ['No physical contact needed', 'No fragmentation risk', 'Precise and controllable', 'Works on any composition'],
    cons: ['Very slow — requires decades of lead time', 'High fuel consumption (must hover)', 'Only practical for smaller objects', 'Technology not yet flight-tested'],
    realExample: 'Proposed but never flown. A spacecraft hovers near the asteroid, using its own gravity to gradually pull it. Combined with kinetic impactor, the pair would have complementary strengths.',
    color: '#22c55e',
    icon: '🛸'
  },
  {
    name: 'Nuclear Standoff Explosion',
    type: 'Last Resort',
    trl: 6,
    timeRequired: 'Months to years',
    warningNeeded: '2+ years',
    pros: ['Works with short warning time', 'Massive energy delivery', 'Can handle very large objects', 'Only option if warning is short'],
    cons: ['Requires special treaty waivers (Outer Space Treaty)', 'Risk of fragmentation into multiple impactors', 'Political and international challenges', 'Must be calibrated precisely'],
    realExample: 'Studied extensively in theory. A nuclear device detonated nearby vaporizes the surface, creating a thrust that deflects the asteroid without shattering it. The US and Russia have both studied this.',
    color: '#ef4444',
    icon: '☢️'
  },
  {
    name: 'Laser Ablation / Ion Beam Shepherd',
    type: 'Advanced Concept',
    trl: 3,
    timeRequired: 'Decades',
    warningNeeded: '20+ years',
    pros: ['Very precise and controllable', 'No risk of fragmentation', 'Can be applied continuously', 'Could work on very small objects'],
    cons: ['Technology immature (TRL 3)', 'Enormous power requirements', 'Distance limitations for laser systems', 'Long deployment time'],
    realExample: 'ESA has studied the Ion Beam Shepherd (IBS) concept — a spacecraft pointing an ion engine at the asteroid transfers momentum via the ion beam without touching it.',
    color: '#818cf8',
    icon: '⚡'
  },
]

const TORINO: TorinoLevel[] = [
  { level: 0, label: 'No Hazard', color: '#22c55e', desc: 'Likelihood of collision is zero, or so low it is effectively zero. Also applies to small objects too small to reach Earth\'s surface intact.', examples: 'Most known NEOs' },
  { level: 1, label: 'Normal', color: '#84cc16', desc: 'A routine discovery in which a pass near Earth is predicted that poses no unusual level of danger.', examples: 'Apophis (2004, initially)' },
  { level: 2, label: 'Meriting attention', color: '#eab308', desc: 'A discovery of an object making a somewhat close but not highly unusual pass near Earth.', examples: '2011 AG5 (briefly)' },
  { level: 4, label: 'Meriting concern', color: '#f97316', desc: 'A close encounter, with 1% or greater chance of impact capable of regional devastation.', examples: 'Apophis reached 4 briefly (2004)' },
  { level: 5, label: 'Threatening', color: '#ef4444', desc: 'A close encounter posing serious but uncertain threat — impact capable of regional to global devastation.', examples: 'None currently known' },
  { level: 10, label: 'Certain Collision', color: '#dc2626', desc: 'A collision is certain. Global catastrophe for large objects; regional disaster for smaller ones.', examples: 'Chicxulub impactor (66 Mya)' },
]

const NEAR_MISSES: NearMiss[] = [
  { date: 'Feb 15, 2013', object: 'Chelyabinsk meteor', distance: 'Entered atmosphere (23 km altitude)', size: '~20 m', note: 'Airburst over Russia — 1500 people injured by shockwave. No prior detection.' },
  { date: 'Jan 26, 2023', object: '2023 BU', distance: '3,600 km from Earth surface', size: '~4 m', note: 'Closer than many satellites — passed between Earth and geostationary orbit altitude.' },
  { date: 'Apr 13, 2029', object: 'Apophis (99942)', distance: '31,600 km (closer than TV satellites)', size: '~375 m', note: 'Visible to naked eye! Probability of 2068 impact now essentially zero (1 in 100,000+).' },
  { date: 'Sep 26, 2022', object: 'Dimorphos (DART impact)', distance: '11 million km from Earth', size: '160 m', note: 'DART spacecraft intentionally impacted to test planetary defense. Orbit changed by 33 minutes.' },
  { date: 'Aug 10, 1972', object: 'Great Daylight Fireball', distance: 'Skimmed atmosphere (57 km)', size: '~80 m', note: 'Passed through Earth\'s atmosphere and came back out without exploding. Witnessed across western US.' },
  { date: 'Jun 30, 1908', object: 'Tunguska impactor', distance: 'Exploded at 8–10 km altitude', size: '~50 m', note: 'Flattened 2,150 sq km of Siberian forest — equivalent to ~185 Hiroshima bombs. No crater formed.' },
]

export default function PlanetaryDefense() {
  const [view, setView] = useState<'dart' | 'methods' | 'torino' | 'history'>('dart')

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Planetary Defense</h2>
      <p className="text-gray-400 text-sm mb-5">How humanity protects Earth from asteroid impacts — from detection to deflection</p>

      {/* Alert bar */}
      <div className="rounded-xl p-3 mb-5 flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
        <div className="text-green-400 text-xl">🛡️</div>
        <div>
          <span className="text-green-400 font-semibold text-sm">Earth is safe</span>
          <span className="text-gray-400 text-sm"> — No known asteroid poses a significant threat for the next 100 years. NASA tracks 2,300+ Potentially Hazardous Asteroids.</span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex gap-1 mb-6 bg-gray-800/50 rounded-xl p-1">
        {[
          { id: 'dart', label: '🎯 DART Mission' },
          { id: 'methods', label: '⚙️ Deflection Methods' },
          { id: 'torino', label: '📊 Torino Scale' },
          { id: 'history', label: '☄️ Near Misses' },
        ].map(b => (
          <button key={b.id} onClick={() => setView(b.id as typeof view)}
            className="flex-1 py-2 px-2 text-xs font-medium rounded-lg transition-all"
            style={{ background: view === b.id ? 'rgba(99,102,241,0.3)' : 'transparent', color: view === b.id ? '#a5b4fc' : '#64748b' }}>
            {b.label}
          </button>
        ))}
      </div>

      {view === 'dart' && (
        <div className="space-y-4">
          <div className="rounded-xl p-5" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">🎯</div>
              <div>
                <div className="text-white text-xl font-bold">DART Mission — History Made</div>
                <div className="text-orange-400 text-sm">September 26, 2022 — Humanity's first planetary defense test</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2 text-sm">
                <div className="text-gray-400 font-semibold text-xs uppercase mb-2">Mission Profile</div>
                {[
                  ['Target', 'Dimorphos (moon of Didymos binary asteroid)'],
                  ['Dimorphos size', '~160 m diameter'],
                  ['DART spacecraft mass', '610 kg (at impact)'],
                  ['Impact speed', '6.1 km/s (22,000 km/h)'],
                  ['Impact date', 'Sep 26, 2022 23:14 UTC'],
                  ['Distance from Earth', '~11 million km'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-500 w-36 flex-shrink-0">{k}:</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <div className="text-gray-400 font-semibold text-xs uppercase mb-2">Results</div>
                {[
                  ['Required change', '73 seconds orbital period change'],
                  ['Actual change', '33 minutes (27× more than required!)'],
                  ['Ejecta factor', 'Ejecta plume amplified the effect'],
                  ['Pre-impact period', '11 hours 55 minutes'],
                  ['Post-impact period', '11 hours 23 minutes'],
                  ['Observer', 'LICIACube (Italian CubeSat) confirmed'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-500 w-36 flex-shrink-0">{k}:</span>
                    <span className="text-green-400">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-gray-300 text-sm">DART proved that a kinetic impactor can meaningfully change an asteroid's orbit. The 33-minute change is far larger than needed to deflect a real threat — meaning even a smaller spacecraft could protect Earth from a 160 m impactor, provided we have enough warning time.</p>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-5">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">What comes next?</div>
            <div className="space-y-3">
              {[
                { name: 'HERA (ESA)', launch: '2024 →', desc: 'European follow-up mission arrives at Didymos in 2026 to study the DART impact crater and Dimorphos\'s new orbit in detail' },
                { name: 'NEO Surveyor (NASA)', launch: '2027 →', desc: 'Infrared space telescope designed to find and characterize 90%+ of NEOs larger than 140 m — the size capable of regional devastation' },
                { name: 'Rubin Observatory (LSST)', launch: '2025 →', desc: 'Ground-based survey will catalog millions of asteroids, dramatically improving our census of potential threats' },
              ].map(m => (
                <div key={m.name} className="flex gap-3">
                  <div className="text-white font-semibold text-sm w-36 flex-shrink-0">{m.name}</div>
                  <div>
                    <span className="text-indigo-400 text-xs mr-2">{m.launch}</span>
                    <span className="text-gray-400 text-sm">{m.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'methods' && (
        <div className="space-y-4">
          {METHODS.map(m => (
            <div key={m.name} className="bg-gray-800/60 rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 p-4" style={{ borderLeft: `4px solid ${m.color}` }}>
                <div className="text-3xl">{m.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="text-white font-bold">{m.name}</div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: m.color + '22', color: m.color, border: `1px solid ${m.color}44` }}>{m.type}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                    <span>⏱ Warning needed: <strong className="text-gray-300">{m.warningNeeded}</strong></span>
                    <span>📅 Lead time: <strong className="text-gray-300">{m.timeRequired}</strong></span>
                    <span>🔬 TRL: <strong className="text-gray-300">{m.trl}/9</strong></span>
                  </div>
                </div>
              </div>
              <div className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-green-400 text-xs font-semibold mb-1">PROS</div>
                    <ul className="space-y-1">
                      {m.pros.map(p => <li key={p} className="text-gray-300 text-xs flex gap-1"><span className="text-green-500">✓</span>{p}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-red-400 text-xs font-semibold mb-1">CONS</div>
                    <ul className="space-y-1">
                      {m.cons.map(c => <li key={c} className="text-gray-300 text-xs flex gap-1"><span className="text-red-400">✗</span>{c}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Real-World Status</div>
                  <p className="text-gray-300 text-xs">{m.realExample}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'torino' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">The Torino Scale rates asteroid impact threat from 0 (no hazard) to 10 (certain catastrophic impact). It combines probability with energy of impact.</p>
          {TORINO.map(t => (
            <div key={t.level} className="flex gap-4 bg-gray-800/50 rounded-xl p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0" style={{ background: t.color + '20', color: t.color, border: `1px solid ${t.color}40` }}>
                {t.level}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm" style={{ color: t.color }}>{t.label}</span>
                </div>
                <p className="text-gray-300 text-sm mb-1">{t.desc}</p>
                <p className="text-gray-500 text-xs">Examples: {t.examples}</p>
              </div>
            </div>
          ))}
          <div className="bg-gray-800/60 rounded-xl p-4 mt-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Current Status</div>
            <p className="text-gray-300 text-sm">No asteroid currently rates above Torino 0. <strong className="text-white">Apophis</strong> famously reached Torino 4 in December 2004 before radar refinements dropped it back to 0. A 2068 impact possibility was also ruled out in 2021 after Arecibo radar data was analyzed.</p>
          </div>
        </div>
      )}

      {view === 'history' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">Earth has had many close encounters — and several direct hits. Here are the most notable.</p>
          {NEAR_MISSES.map((n, i) => (
            <div key={i} className="bg-gray-800/60 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">☄️</div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-white font-bold">{n.object}</span>
                    <span className="text-gray-500 text-xs">{n.date}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-800/40">Size: {n.size}</span>
                  </div>
                  <div className="text-indigo-400 text-sm mb-1">📏 {n.distance}</div>
                  <p className="text-gray-300 text-sm">{n.note}</p>
                </div>
              </div>
            </div>
          ))}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Scale of Known Impacts</div>
            <div className="space-y-2">
              {[
                { name: 'Chelyabinsk (2013)', energy: '500 kt', note: 'Regional', bar: 5 },
                { name: 'Tunguska (1908)', energy: '10–15 Mt', note: 'Regional devastation', bar: 15 },
                { name: 'Chicxulub (66 Ma)', energy: '100 billion Mt', note: 'Mass extinction', bar: 100 },
              ].map(item => (
                <div key={item.name} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-300">{item.name}</span>
                    <span className="text-gray-500">{item.energy} TNT equivalent</span>
                  </div>
                  <div className="bg-gray-700 rounded-full h-2">
                    <div className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-red-500" style={{ width: `${item.bar}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
