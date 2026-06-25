import { useState } from 'react'

interface Challenge {
  name: string
  category: string
  severity: 'Critical' | 'High' | 'Moderate'
  description: string
  mitigation: string
  data: string
  icon: string
  color: string
}

interface HealthEffect {
  system: string
  effect: string
  detail: string
  recovery: string
}

interface HabitatModule {
  name: string
  station: string
  purpose: string
  volume: string
  notes: string
}

const challenges: Challenge[] = [
  {
    name: 'Galactic Cosmic Rays',
    category: 'Radiation',
    severity: 'Critical',
    description: 'High-energy particles (protons, heavy ions) from outside the solar system. Cannot be fully shielded — polyethylene reduces but never eliminates. Penetrate spacecraft walls.',
    mitigation: 'Hydrogen-rich shielding, medication (potassium iodide for thyroid), storm shelters. MISSE experiments test new materials.',
    data: 'ISS crew: ~150 mSv/year (vs 6 mSv on Earth). Mars mission: ~1,000 mSv total.',
    icon: '☢️',
    color: '#ef4444'
  },
  {
    name: 'Solar Particle Events',
    category: 'Radiation',
    severity: 'Critical',
    description: 'X-class solar flares + coronal mass ejections produce sudden bursts of energetic protons. Can deliver a lethal dose in hours without shelter.',
    mitigation: 'Real-time NOAA monitoring. Immediate retreat to shielded storm shelter (water-wall modules or behind equipment racks). Dosimeters on all crew.',
    data: 'Aug 1972 event between Apollo 16 & 17: would have been fatal outside magnetosphere.',
    icon: '🌞',
    color: '#f97316'
  },
  {
    name: 'Microgravity Bone Loss',
    category: 'Physiology',
    severity: 'High',
    description: 'Without gravitational loading, osteoclast activity dominates. Trabecular bone microarchitecture deteriorates even with exercise countermeasures.',
    mitigation: 'Advanced Resistive Exercise Device (ARED) — 2+ hours/day mandatory exercise. Bisphosphonate drugs in trials. Vibration therapy.',
    data: '~1% bone density loss per month in spine and hip. Some recovery after return, but not complete.',
    icon: '🦴',
    color: '#a78bfa'
  },
  {
    name: 'Cardiovascular Deconditioning',
    category: 'Physiology',
    severity: 'High',
    description: 'Fluid shifts headward, heart remodels to smaller size, orthostatic intolerance on return. VO₂max decreases ~10% per month without countermeasures.',
    mitigation: 'Combined aerobic + resistive exercise. Russian "penguin suit" lower-body negative pressure. Fluid loading before return.',
    data: 'Post-flight orthostatic intolerance: 80% of long-duration crew affected. Resolves in weeks.',
    icon: '❤️',
    color: '#f43f5e'
  },
  {
    name: 'Intracranial Pressure / SANS',
    category: 'Physiology',
    severity: 'High',
    description: 'Spaceflight-Associated Neuro-ocular Syndrome (SANS). Fluid shifts increase intracranial pressure, flattening the optic globe and causing vision impairment.',
    mitigation: 'Active research area. Lower-body negative pressure suits to pull fluid down. Dietary sodium reduction. Mission planning limitations.',
    data: '~29% of ISS astronauts report vision changes. Some permanent. Identified as top long-duration risk.',
    icon: '👁️',
    color: '#06b6d4'
  },
  {
    name: 'Psychological Isolation',
    category: 'Psychology',
    severity: 'High',
    description: 'Confinement, monotony, separation from family, crew conflicts, and communication delays (up to 24 min one-way to Mars) cause significant psychological stress.',
    mitigation: 'Crew selection, psychology support teams, private family video calls, autonomy in scheduling, personal space, diversified workload.',
    data: 'Third-quarter phenomenon: morale dip 75% into mission. Most crew conflicts over food, hygiene, shared space.',
    icon: '🧠',
    color: '#8b5cf6'
  },
  {
    name: 'Microbiome Dysbiosis',
    category: 'Biology',
    severity: 'Moderate',
    description: 'The gut microbiome shifts significantly in space. Pathogenic bacteria can become more virulent in microgravity. Immune function can change.',
    mitigation: 'Probiotic supplementation. Strict hygiene protocols. Monitoring of crew microbiome on long missions.',
    data: 'Staphylococcus aureus aboard ISS more resistant to antibiotics. Crew immune markers change after 6 months.',
    icon: '🦠',
    color: '#10b981'
  },
  {
    name: 'Muscle Atrophy',
    category: 'Physiology',
    severity: 'High',
    description: 'Without gravitational loading, type II (fast-twitch) muscle fibers atrophy. Anti-gravity muscles (calf, thigh, lower back) lose mass fastest.',
    mitigation: 'ARED (Advanced Resistive Exercise Device) provides up to 272 kg simulated resistance. Flywheel devices like COLBERT treadmill. Protein intake optimization.',
    data: '~3% muscle mass loss per month without countermeasures. Legs affected 3× more than arms.',
    icon: '💪',
    color: '#f59e0b'
  },
]

const healthEffects: HealthEffect[] = [
  { system: 'Skeletal', effect: 'Osteoporosis acceleration', detail: 'Trabecular (spongy) bone in hip and spine loses density fastest. After 6 months, equivalent to 10 years of Earth aging.', recovery: 'Partial — may never fully recover; hip fracture risk elevated' },
  { system: 'Cardiovascular', effect: 'Cardiac atrophy + orthostatic intolerance', detail: 'Heart becomes more spherical. Blood volume reduces ~10–15%. On return, pooling in legs causes fainting.', recovery: 'Good — full recovery within weeks to months' },
  { system: 'Visual/Neurological', effect: 'SANS — globe flattening, optic disc edema', detail: 'Elevated ICP flattens the back of the eyeball. Choroidal folds in retina. Impaired near vision.', recovery: 'Variable — some changes persist long-term; active research' },
  { system: 'Immune', effect: 'Latent virus reactivation', detail: 'Herpes viruses (CMV, EBV, VZV) reactivate in ~89% of astronauts. T-cell function reduced.', recovery: 'Resolves after return; vaccines and antiviral monitoring used' },
  { system: 'Sensory', effect: 'Space motion sickness (SMS)', detail: 'First 72 hours in 0g and on return: nausea, vomiting, disorientation as vestibular system adapts.', recovery: 'Full — adapts within 2–3 days; recurs briefly on return' },
  { system: 'Circadian', effect: 'Sleep disruption (16 sunrises/day on ISS)', detail: 'ISS crew experience 16 sunrises per day, disrupting melatonin cycles. Sleep quality reduced.', recovery: 'Full — resolves on return. Blue-light control and melatonin used on orbit' },
]

const habitatModules: HabitatModule[] = [
  { name: 'Unity (Node 1)', station: 'ISS', purpose: 'Primary docking hub connecting all segments', volume: '75 m³', notes: 'Six docking ports; first US-built module launched 1998' },
  { name: 'Zvezda (Service Module)', station: 'ISS', purpose: 'Core life support, propulsion, crew quarters', volume: '72 m³', notes: 'Russian segment; provides orbital reboost capability' },
  { name: 'Bigelow B330 (proposed)', station: 'Future LEO station', purpose: 'Inflatable expandable habitat', volume: '330 m³ inflated', notes: 'Expandable module technology demonstrated on BEAM (ISS)' },
  { name: 'Gateway HALO', station: 'Lunar Gateway', purpose: 'Crew habitation + communication relay for Artemis', volume: '125 m³', notes: 'Launch 2027; 30-day crew stay capability' },
  { name: 'CHAPEA Habitat', station: 'Earth analog (JSC)', purpose: 'Mars mission simulation — 378-day isolation study', volume: '158 m³', notes: 'Crew of 4; simulates communication delays, resource constraints' },
  { name: 'Mars Surface Habitat', station: 'Conceptual', purpose: 'In-situ resource utilization + radiation shielding', volume: '500+ m³ (buried)', notes: 'Regolith covering provides radiation shielding (~3 meters needed)' },
]

type Tab = 'challenges' | 'health' | 'habitats'

export default function SpaceHabitation() {
  const [tab, setTab] = useState<Tab>('challenges')
  const [selected, setSelected] = useState<Challenge>(challenges[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'challenges', label: 'Survival Challenges' },
    { id: 'health', label: 'Health Effects' },
    { id: 'habitats', label: 'Habitat Design' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Living in Space</h2>
      <p className="text-gray-400 text-sm mb-5">The science and engineering of keeping humans alive and healthy beyond Earth</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'challenges' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {challenges.map(c => (
              <button key={c.name} onClick={() => setSelected(c)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === c.name ? 'border border-current bg-gray-800' : 'bg-gray-800/50 hover:bg-gray-700/50'}`} style={selected.name === c.name ? { borderColor: c.color } : {}}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{c.icon}</span>
                  <span className="font-semibold text-white text-sm">{c.name}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{c.category}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${c.severity === 'Critical' ? 'bg-red-900/40 text-red-400' : c.severity === 'High' ? 'bg-orange-900/40 text-orange-400' : 'bg-yellow-900/40 text-yellow-400'}`}>{c.severity}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">{selected.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{selected.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${selected.severity === 'Critical' ? 'bg-red-900/40 text-red-400' : selected.severity === 'High' ? 'bg-orange-900/40 text-orange-400' : 'bg-yellow-900/40 text-yellow-400'}`}>{selected.severity} Risk</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase font-semibold mb-1">The Problem</div>
                  <p className="text-gray-300 text-sm">{selected.description}</p>
                </div>
                <div className="bg-green-900/20 rounded-lg p-3 border border-green-800/30">
                  <div className="text-green-400 text-xs uppercase font-semibold mb-1">Countermeasures</div>
                  <p className="text-gray-300 text-sm">{selected.mitigation}</p>
                </div>
                <div className="bg-cyan-900/20 rounded-lg p-3 border border-cyan-800/30">
                  <div className="text-cyan-400 text-xs uppercase font-semibold mb-1">Key Data</div>
                  <p className="text-gray-300 text-sm">{selected.data}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/60 rounded-xl p-4">
              <h4 className="text-white font-bold text-sm mb-3">Risk Summary</h4>
              <div className="grid grid-cols-3 gap-2">
                {[['Critical', '#ef4444'], ['High', '#f97316'], ['Moderate', '#eab308']].map(([sev, color]) => {
                  const count = challenges.filter(c => c.severity === sev).length
                  return (
                    <div key={sev} className="text-center">
                      <div className="text-2xl font-bold font-mono" style={{ color }}>{count}</div>
                      <div className="text-gray-500 text-xs">{sev}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'health' && (
        <div className="space-y-4">
          <div className="bg-cyan-900/20 rounded-xl p-4 border border-cyan-800/40">
            <p className="text-gray-300 text-sm">The human body evolved in a 1g gravitational field over billions of years. Removing gravity disrupts virtually every physiological system. Understanding these effects is critical for missions to Mars (6+ months transit each way).</p>
          </div>
          <div className="space-y-3">
            {healthEffects.map(h => (
              <div key={h.system} className="bg-gray-800/60 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-white font-bold">{h.system}</h4>
                    <div className="text-cyan-400 text-sm">{h.effect}</div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-2">{h.detail}</p>
                <div className="bg-green-900/20 rounded p-2 border border-green-800/30">
                  <span className="text-green-400 text-xs font-semibold">Recovery: </span>
                  <span className="text-gray-300 text-xs">{h.recovery}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'habitats' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-gray-800/60 rounded-xl p-4">
            Human space habitats must provide: 101.3 kPa pressure, 21% O₂, CO₂ removal, water recovery (~90% ECLSS on ISS), temperature 18–27°C, radiation shielding, micrometeorite protection, and psychological comfort — all with minimal resupply.
          </p>
          {habitatModules.map(m => (
            <div key={m.name} className="bg-gray-800/60 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-white font-bold">{m.name}</h4>
                  <div className="text-cyan-400 text-sm">{m.station}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-mono">{m.volume}</div>
                  <div className="text-gray-500 text-xs">pressurized volume</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-2">{m.purpose}</p>
              <div className="text-gray-600 text-xs">{m.notes}</div>
            </div>
          ))}

          <div className="bg-gray-800/60 rounded-xl p-4">
            <h4 className="text-white font-bold mb-3 text-sm">ECLSS — Environmental Control and Life Support</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
              {[
                { metric: '93%', label: 'Water recovered (ISS USOS)', color: '#38bdf8' },
                { metric: '50%', label: 'O₂ from electrolysis of recovered water', color: '#34d399' },
                { metric: '2 hrs/day', label: 'Mandatory crew exercise', color: '#f59e0b' },
                { metric: '1 kg/day', label: 'CO₂ absorbed by LiOH/CDRA', color: '#a78bfa' },
              ].map(item => (
                <div key={item.label} className="bg-gray-900/50 rounded-lg p-3">
                  <div className="text-xl font-bold font-mono" style={{ color: item.color }}>{item.metric}</div>
                  <div className="text-gray-400 mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
