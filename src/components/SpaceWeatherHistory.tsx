import { useState } from 'react'

interface StormEvent {
  year: number
  name: string
  emoji: string
  kp_index: number | string
  x_class?: string
  color: string
  impact: string[]
  desc: string
  aurora_visibility: string
  economic_damage?: string
  recovery_time?: string
}

const EVENTS: StormEvent[] = [
  {
    year: 1859, name: 'The Carrington Event', emoji: '💥', kp_index: '~9+', x_class: 'X45+',
    color: '#dc2626',
    desc: 'The largest geomagnetic storm ever recorded in human history. British astronomer Richard Carrington observed the solar flare directly on September 1, 1859. Within 17.6 hours — record transit time — a massive CME struck Earth. The geomagnetic storm was so powerful that telegraph operators received shocks, paper in offices spontaneously ignited, and aurora were visible in tropical regions including Cuba, Hawaii, and Colombia.',
    impact: [
      'Telegraph networks worldwide failed and caught fire',
      'Sparks flew from telegraph equipment',
      'Some operators disconnected batteries — lines operated on auroral current alone',
      'Aurora visible from Cuba, Hawaii, Colombia (equatorial regions)',
      'Night sky as bright as midday in many areas',
    ],
    aurora_visibility: 'Tropics — Cuba, Hawaii, Colombia, sub-Saharan Africa',
    economic_damage: 'Estimated $4-10 trillion if it hit today',
  },
  {
    year: 1921, name: '1921 New York Railroad Storm', emoji: '🚂', kp_index: '~8+', x_class: 'X-class',
    color: '#ef4444',
    desc: 'A massive geomagnetic storm on May 15, 1921 caused telegraph systems to fail across North America and Europe. The New York Central Railroad signal and switching systems burned out. The Brewster, NY telegraph station caught fire. Aurora were visible as far south as Mexico and Puerto Rico.',
    impact: [
      'New York Central Railroad communications destroyed',
      'Telegraph station fires in NY, Sweden, Britain',
      'Worldwide telegraph disruption',
      'Aurora seen across North America and Europe',
    ],
    aurora_visibility: 'Mexico, Puerto Rico',
    economic_damage: 'Minor (limited infrastructure)',
  },
  {
    year: 1989, name: 'Quebec Blackout', emoji: '⚡', kp_index: '9', x_class: 'X15',
    color: '#f97316',
    desc: 'On March 13, 1989, a powerful geomagnetic storm knocked out the Hydro-Québec power grid in 92 seconds. Six million Canadians lost power for up to 9 hours. The storm was caused by a CME from a solar flare that erupted March 10. Satellites experienced anomalies, and a NASA satellite was temporarily lost. Aurora were visible in Texas and Florida.',
    impact: [
      '6 million Canadians without power for up to 9 hours',
      'Hydro-Québec grid collapsed in 92 seconds',
      'US Northeast grid stressed — near cascade failure',
      'Satellites experienced orientation problems',
      'Microchips in orbit fried',
      'Radio blackout over North America',
    ],
    aurora_visibility: 'Texas, Florida (southern US)',
    economic_damage: '$2 billion (Canada) + global satellite effects',
    recovery_time: '9 hours for most; some systems days',
  },
  {
    year: 2003, name: 'Halloween Storms', emoji: '🎃', kp_index: '9', x_class: 'X28+ (largest measurable)',
    color: '#ea580c',
    desc: 'A series of massive solar flares and CMEs in late October/November 2003. The October 28 X17 flare and November 4 X28+ flare (so large the GOES detector saturated) caused widespread disruptions. The International Space Station crew had to shelter behind extra shielding. 47 satellites reported anomalies. Power outages in Sweden.',
    impact: [
      'X28+ flare — strongest flare ever measured (sensors saturated)',
      'ISS crew sheltered from radiation',
      '47 satellites damaged or disrupted',
      'Power outage in Sweden (50,000 customers)',
      'Aviation rerouted away from polar routes',
      'GPS and communication disrupted globally',
      'Transpolar flights cancelled for days',
    ],
    aurora_visibility: 'All of Europe, US, Mexico, much of Southern Hemisphere',
    economic_damage: '~$500 million (satellite operators)',
    recovery_time: 'Weeks for some systems',
  },
  {
    year: 2012, name: 'Near-Miss CME', emoji: '☄️', kp_index: 'Would have been ~9+', x_class: 'X1.4 (not Earth-directed)',
    color: '#f59e0b',
    desc: 'On July 23, 2012, a massive CME was released from the Sun — comparable to the Carrington Event in strength. It missed Earth by just 9 days (Earth would have been in the path one week earlier). Had it hit, researchers estimate it would have caused widespread damage to power grids, satellites, and electronics for weeks or months. A near-miss that almost reshaped civilization.',
    impact: [
      'STEREO-A spacecraft detected the CME directly',
      'Had it hit Earth, estimated weeks-long blackout',
      'Estimated trillion-dollar damage potential',
      'GPS, internet, power grids all at risk',
    ],
    aurora_visibility: 'Would have been visible worldwide including tropics',
    economic_damage: 'Estimated $1-2 trillion if it had hit',
  },
  {
    year: 2024, name: 'May 2024 Storm (Gannon Storm)', emoji: '🌌', kp_index: '9 (G5 — extreme)', x_class: 'Several X-class flares',
    color: '#8b5cf6',
    desc: 'A cluster of powerful solar flares in May 2024 produced the strongest geomagnetic storm in 20 years — rated G5 (extreme) for the first time since the Halloween storms. Aurora were visible across the continental US, southern Europe, and as far south as Florida, Texas, and southern Spain. Named "Gannon Storm" after physicist Jennifer Gannon.',
    impact: [
      'Aurora visible across most of US and Europe',
      'Some GPS precision disruption (agriculture, surveying)',
      'Minor satellite drag increase',
      'Some power grid warnings issued in US',
      'Widespread social media documentation — most photographed aurora event ever',
    ],
    aurora_visibility: 'Northern US, southern Europe, Florida, Texas',
    economic_damage: 'Minor — better modern infrastructure protection',
  },
]

const SCALE_LEVELS = [
  { level: 'G1 (Minor)', kp: '5', color: '#22c55e', effects: 'Weak power grid fluctuations. Minor satellite orientation effects. Aurora at high latitudes.' },
  { level: 'G2 (Moderate)', kp: '6', color: '#84cc16', effects: 'High-latitude power systems affected. HF radio fade at polar regions. Aurora at 55° latitude.' },
  { level: 'G3 (Strong)', kp: '7', color: '#eab308', effects: 'Voltage corrections required on power systems. Satellite surface charging. Aurora to 50° latitude (UK, Seattle).' },
  { level: 'G4 (Severe)', kp: '8-9', color: '#f97316', effects: 'Widespread voltage control issues. Pipeline current induction. Aurora to 45° latitude (central Europe, northern US).' },
  { level: 'G5 (Extreme)', kp: '9+', color: '#ef4444', effects: 'Grid collapse possible. Complete HF radio blackout for days. Satellite drag increases. Aurora visible to tropics.' },
]

export default function SpaceWeatherHistory() {
  const [selected, setSelected] = useState<StormEvent>(EVENTS[0])
  const [view, setView] = useState<'events' | 'scale' | 'risk'>('events')

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🌩️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Weather History</h2>
          <p className="text-orange-300 text-sm">From the 1859 Carrington Event to modern storms — how solar activity threatens civilization</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['events', 'scale', 'risk'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === v ? 'bg-orange-700 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {v === 'events' ? '📅 Major Events' : v === 'scale' ? '📊 G-Scale' : '⚠️ Modern Risk'}
          </button>
        ))}
      </div>

      {view === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {EVENTS.map(e => (
              <button
                key={e.year}
                onClick={() => setSelected(e)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-3 ${selected.year === e.year ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}
              >
                <span className="text-2xl">{e.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{e.name}</div>
                  <div className="text-xs text-gray-500">{e.year} · Kp {e.kp_index}</div>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: e.color + '30', color: e.color }}>
                  {e.kp_index.toString().replace('+', '').replace('~', '')}
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">{selected.emoji}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: selected.color + '25', color: selected.color }}>
                      Kp {selected.kp_index}
                    </span>
                    {selected.x_class && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/30 text-orange-300">{selected.x_class}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-400">{selected.year}</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed mb-4">{selected.desc}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Aurora visible in</div>
                  <div className="text-xs text-green-300">{selected.aurora_visibility}</div>
                </div>
                {selected.economic_damage && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Economic impact</div>
                    <div className="text-xs text-red-300">{selected.economic_damage}</div>
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-400 font-semibold mb-1.5 uppercase">Impacts</div>
              <ul className="space-y-1">
                {selected.impact.map(imp => (
                  <li key={imp} className="text-xs text-gray-300 flex gap-1.5">
                    <span style={{ color: selected.color }}>▸</span>{imp}
                  </li>
                ))}
              </ul>
            </div>

            {selected.year === 1859 && (
              <div className="bg-red-900/20 rounded-xl p-4 border border-red-500/20 text-sm text-red-200">
                <span className="font-bold">If Carrington hit today: </span>
                The National Academy of Sciences estimates a Carrington-level event would knock out power to 130 million Americans for 4–10 years.
                GPS navigation, internet infrastructure, and financial systems would fail. Estimated cost: $4–10 trillion.
                The US power grid has 2,100 electrical transformers — they take 12-18 months to manufacture, and only ~100 spares exist.
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'scale' && (
        <div className="space-y-3">
          <div className="text-sm text-gray-400 mb-4">
            NOAA uses the G-scale (G1–G5) to rate geomagnetic storms. The scale is logarithmic — each level represents roughly 10× more impact than the previous.
          </div>
          {SCALE_LEVELS.map(level => (
            <div key={level.level} className="bg-white/5 rounded-xl p-4 border border-white/10 flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0"
                style={{ backgroundColor: level.color + '25', color: level.color, border: `2px solid ${level.color}40` }}>
                {level.level.split(' ')[0]}
              </div>
              <div className="flex-1">
                <div className="font-bold text-white mb-0.5">{level.level}</div>
                <div className="text-xs text-gray-500 mb-1">Kp index: {level.kp}</div>
                <p className="text-sm text-gray-300">{level.effects}</p>
              </div>
              <div className="flex-shrink-0">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="w-2 h-8 rounded-sm" style={{
                      backgroundColor: i < parseInt(level.level[1]) ? level.color : 'rgba(255,255,255,0.08)'
                    }} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'risk' && (
        <div className="space-y-4">
          <div className="bg-red-900/20 rounded-xl p-5 border border-red-500/20">
            <h3 className="font-bold text-white text-lg mb-2">Probability of Another Carrington Event</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Scientists estimate a 1-2% chance of a Carrington-level event per decade. Over a century, the cumulative probability
              is 12-21%. We are currently in Solar Cycle 25, which is tracking more active than predictions suggested.
              The solar maximum is expected in 2025-2026. The May 2024 G5 storm was a reminder that extreme events can happen even in average cycles.
            </p>
          </div>

          {[
            {
              risk: 'Power Grid Cascading Failure', severity: 'Critical', icon: '⚡',
              desc: 'Geomagnetically Induced Currents (GICs) flow through power lines and damage high-voltage transformers. A major grid collapse could last 4-10 years. Only ~100 spare transformers exist in the US for 2,100+ in service.',
            },
            {
              risk: 'Satellite Failures', severity: 'High', icon: '🛰️',
              desc: 'Intense radiation damages solar panels, fries electronics, and causes satellite drag from expanded atmosphere. Modern civilization depends on ~7,500 active satellites for GPS, weather, communications, and financial timing signals.',
            },
            {
              risk: 'GPS Disruption', severity: 'High', icon: '📍',
              desc: 'Ionospheric disturbances cause GPS errors of tens of meters to kilometers. Aviation, shipping, military operations, precision agriculture, and financial timestamping all depend on GPS accuracy.',
            },
            {
              risk: 'Radio Blackout', severity: 'Medium-High', icon: '📻',
              desc: 'X-class flares cause HF radio blackouts on the sunlit side of Earth. Aviation over polar routes loses communication for hours. Emergency services and military rely on HF when satellites fail.',
            },
            {
              risk: 'Aviation Radiation', severity: 'Medium', icon: '✈️',
              desc: 'During Solar Energetic Particle events, radiation at cruising altitude exceeds safe levels for pregnant passengers and crew. Airlines reroute away from polar routes during major events, adding cost and fuel.',
            },
          ].map(r => (
            <div key={r.risk} className="bg-white/5 rounded-xl p-4 border border-white/10 flex gap-3">
              <span className="text-3xl flex-shrink-0">{r.icon}</span>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-bold text-white">{r.risk}</div>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${r.severity === 'Critical' ? 'bg-red-900/30 text-red-300 border border-red-500/20' : r.severity === 'High' ? 'bg-orange-900/30 text-orange-300 border border-orange-500/20' : 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/20'}`}>
                    {r.severity}
                  </span>
                </div>
                <p className="text-sm text-gray-300">{r.desc}</p>
              </div>
            </div>
          ))}

          <div className="bg-green-900/20 rounded-xl p-4 border border-green-500/20 text-sm text-green-200">
            <span className="font-bold">Good news: </span>
            NOAA's Space Weather Prediction Center provides 1-3 day warning of major CMEs. FEMA, power utilities, and satellite operators
            increasingly have storm protocols. Some utilities can temporarily disconnect vulnerable transformers. The US 2024 Grid Security Emergency Orders
            specifically addressed space weather resilience.
          </div>
        </div>
      )}
    </div>
  )
}
