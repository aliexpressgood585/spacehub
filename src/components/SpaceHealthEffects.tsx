import { useState } from 'react'

interface Effect {
  system: string
  icon: string
  effect: string
  timeline: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  detail: string
  recovery: string
  color: string
}

interface Mission {
  name: string
  duration_days: number
  emoji: string
  key_findings: string[]
}

const EFFECTS: Effect[] = [
  {
    system: 'Bones', icon: '🦴', color: '#f59e0b',
    effect: 'Bone density loss 1-2% per month',
    timeline: 'Begins day 1, worsens over months',
    severity: 'high',
    detail: 'In microgravity, bones no longer bear weight. Osteoclasts (bone-destroying cells) outpace osteoblasts (bone-building cells). Astronauts can lose 10-15% of bone mass on a 6-month ISS mission — equivalent to 10 years of osteoporosis. The lower spine, hips, and femoral necks are most affected.',
    recovery: 'Bone density partially recovers over 2-3 years post-flight. Full recovery is uncertain for long missions.',
  },
  {
    system: 'Muscles', icon: '💪', color: '#ef4444',
    effect: 'Muscle atrophy, especially leg and back muscles',
    timeline: '~20% loss in 2 weeks without countermeasures',
    severity: 'high',
    detail: 'Without gravity, muscles used for posture and locomotion rapidly atrophy. The soleus and gastrocnemius (calf muscles) can lose 20-30% of mass. Even with 2+ hours of daily exercise, some loss is unavoidable. Astronauts have trouble walking after returning from long missions.',
    recovery: 'Muscle mass generally returns within weeks to months of return with exercise.',
  },
  {
    system: 'Cardiovascular', icon: '❤️', color: '#dc2626',
    effect: 'Heart muscle weakens, cardiac output drops',
    timeline: 'Progressive over weeks/months',
    severity: 'high',
    detail: 'On Earth, the heart works against gravity to pump blood upward. In space, the heart becomes more spherical and pumps less forcefully. Blood volume decreases by 10-15%. Orthostatic intolerance (fainting upon standing) is common post-flight because the cardiovascular system has "forgotten" how to fight gravity.',
    recovery: 'Cardiovascular function recovers in weeks to months, but some long-term effects on heart shape may persist.',
  },
  {
    system: 'Vision (VIIP)', icon: '👁️', color: '#8b5cf6',
    effect: 'Intracranial pressure causes visual impairment',
    timeline: 'Starts weeks into mission',
    severity: 'critical',
    detail: 'Fluid shifts toward the head in microgravity, increasing intracranial pressure. This pushes on the optic nerve and flattens the eyeball (hyperopic shift). The syndrome is called VIIP — Visual Impairment and Intracranial Pressure. About 70% of ISS astronauts experience visual changes. Scott Kelly needed reading glasses after 1 year in space.',
    recovery: 'Partial recovery, but some astronauts have permanent vision changes. No complete solution yet — a major concern for Mars missions.',
  },
  {
    system: 'Fluid Shifts', icon: '💧', color: '#38bdf8',
    effect: 'Body fluids shift headward (puffy face, nasal congestion)',
    timeline: 'Within hours of reaching microgravity',
    severity: 'medium',
    detail: 'On Earth, gravity pools about 2 liters of blood in the lower body. In space, those fluids distribute evenly — resulting in a puffy face and stuffy nose (space congestion). Astronauts feel like they\'re hanging upside down. The body compensates by shedding excess fluid through increased urine output.',
    recovery: 'Reverses within days of return to Earth.',
  },
  {
    system: 'Immune System', icon: '🛡️', color: '#10b981',
    effect: 'Immune dysregulation, viral reactivation',
    timeline: 'Begins within first week',
    severity: 'medium',
    detail: 'Space stress and radiation cause immune system changes. Latent viruses (chickenpox/shingles, herpes, Epstein-Barr) reactivate in ~53% of astronauts. T-cell proliferation is reduced. The immune system is less able to recognize and respond to pathogens — critical for isolated missions far from medical care.',
    recovery: 'Partially recovers post-flight, but monitoring is required.',
  },
  {
    system: 'Radiation', icon: '☢️', color: '#f97316',
    effect: 'DNA damage, elevated cancer risk',
    timeline: 'Cumulative — every day in space',
    severity: 'critical',
    detail: 'Earth\'s magnetic field shields us from cosmic radiation. In LEO, astronauts receive 10× more radiation than on the ground (~150 mSv/year on ISS). Beyond Earth\'s field, on a Mars mission, exposure could reach 1,000 mSv — increasing lifetime cancer risk by ~5%. Solar particle events (solar flares/CMEs) can deliver lethal doses without shielding.',
    recovery: 'Radiation effects are cumulative and irreversible. DNA damage can persist for life.',
  },
  {
    system: 'Sleep & Circadian', icon: '😴', color: '#6366f1',
    effect: 'Sleep disruption, circadian rhythm desynchronization',
    timeline: 'Ongoing throughout mission',
    severity: 'medium',
    detail: 'The ISS experiences 16 sunrises per day — the circadian system has no natural cues. Astronauts often sleep poorly, logging only 6 hours when 8 are recommended. Sleep deprivation compounds cognitive and physical effects. NASA uses melatonin, blue-light filtering, and structured light schedules as countermeasures.',
    recovery: 'Sleep normalizes within days of return.',
  },
  {
    system: 'Spine', icon: '🦾', color: '#84cc16',
    effect: 'Spine elongates 3-5 cm in microgravity',
    timeline: 'Within first 2 weeks',
    severity: 'low',
    detail: 'Spinal discs decompress without gravity, allowing astronauts to grow 3-5 cm taller in space. This sounds fun but can cause back pain, and the sudden return to gravity upon landing can pinch nerves. Herniated discs are a risk. Russian cosmonauts experienced this extensively during Mir operations.',
    recovery: 'Spine returns to normal height within days. Herniated discs may require medical treatment.',
  },
  {
    system: 'Cognition', icon: '🧠', color: '#a78bfa',
    effect: 'Brain structural changes, cognitive shifts',
    timeline: 'Progressive, months-years',
    severity: 'medium',
    detail: 'MRI studies of returning astronauts show structural brain changes: the cerebellum compresses, cerebrospinal fluid redistributes, and white matter changes occur. Cognitive tests show some degradation in spatial orientation and working memory. Twins Study (Scott vs Mark Kelly) found epigenetic changes in 7% of Scott\'s genes — most returned to baseline, some did not.',
    recovery: 'Most structural changes reverse over months. Some lasting epigenetic changes observed.',
  },
  {
    system: 'Gut Microbiome', icon: '🦠', color: '#fbbf24',
    effect: 'Microbiome diversity decreases',
    timeline: 'Over weeks to months',
    severity: 'medium',
    detail: 'The gut microbiome changes significantly in space — diversity drops, certain harmful bacteria proliferate. This affects digestion, immune function, and even mood (gut-brain axis). Limited food variety and high-dose radiation alter the microbial landscape. Pre- and probiotics are being studied as countermeasures.',
    recovery: 'Microbiome partially recovers with normal diet and environment post-flight.',
  },
  {
    system: 'Kidney Stones', icon: '🪨', color: '#94a3b8',
    effect: 'Elevated kidney stone risk from bone calcium',
    timeline: 'Ongoing due to bone loss',
    severity: 'medium',
    detail: 'As bones demineralize, calcium is released into the bloodstream. The kidneys filter excess calcium into urine — but fluid intake is often lower in space (astronauts don\'t feel thirsty as often). This creates supersaturated urine and elevated kidney stone risk — a medical emergency if it occurs during a mission.',
    recovery: 'Risk normalizes after return when bone rebuilding ceases.',
  },
]

const MISSIONS: Mission[] = [
  {
    name: 'Scott Kelly — 1 Year Mission', duration_days: 340, emoji: '👨‍🚀',
    key_findings: [
      'Epigenetic changes in 7% of genes (most reversed)',
      'Telomere elongation in space (shortened after return)',
      'VIIP: needed reading glasses post-flight',
      'Compared vs twin Mark Kelly — landmark study',
    ],
  },
  {
    name: 'Valeri Polyakov — 437 Days', duration_days: 437, emoji: '🚀',
    key_findings: [
      'Longest single spaceflight record (1994-1995)',
      'Extreme muscle and bone loss',
      'Demonstrated human physiological resilience',
      'Walked off Soyuz unaided after landing',
    ],
  },
  {
    name: 'Mars Mission (projected)', duration_days: 900, emoji: '🔴',
    key_findings: [
      '~900 mSv radiation dose (near career limit)',
      'No resupply or medical evacuation possible',
      'Bone loss could exceed 20% without countermeasures',
      'Psychological isolation unprecedented in history',
    ],
  },
]

const SEVERITY_COLOR: Record<string, string> = {
  low: 'text-green-400 bg-green-900/20 border-green-500/30',
  medium: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30',
  high: 'text-orange-400 bg-orange-900/20 border-orange-500/30',
  critical: 'text-red-400 bg-red-900/20 border-red-500/30',
}

export default function SpaceHealthEffects() {
  const [selected, setSelected] = useState<Effect>(EFFECTS[3])
  const [view, setView] = useState<'systems' | 'missions' | 'timeline'>('systems')

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🧬</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Space Health Effects</h2>
          <p className="text-green-300 text-sm">How the human body changes in microgravity, radiation, and isolation</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['systems', 'missions', 'timeline'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${view === v ? 'bg-green-700 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
            {v === 'systems' ? '🫀 Body Systems' : v === 'missions' ? '🚀 Missions' : '⏱️ Timeline'}
          </button>
        ))}
      </div>

      {view === 'systems' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Effect list */}
          <div className="md:col-span-1 space-y-1.5 max-h-[600px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {EFFECTS.map(e => (
              <button
                key={e.system}
                onClick={() => setSelected(e)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center gap-3 ${selected.system === e.system ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}
              >
                <span className="text-xl">{e.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{e.system}</div>
                  <div className="text-xs text-gray-500 truncate">{e.effect.substring(0, 40)}...</div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase ${SEVERITY_COLOR[e.severity]}`}>
                  {e.severity}
                </span>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="md:col-span-2 bg-white/5 rounded-xl p-5 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.system}</h3>
                <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${SEVERITY_COLOR[selected.severity]}`}>
                  {selected.severity} severity
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Primary Effect</div>
                <div className="text-sm text-white">{selected.effect}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Timeline</div>
                <div className="text-sm text-yellow-300">{selected.timeline}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Scientific Detail</div>
                <div className="text-sm text-gray-300 leading-relaxed">{selected.detail}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Recovery</div>
                <div className="text-sm text-green-300">{selected.recovery}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'missions' && (
        <div className="space-y-4">
          {MISSIONS.map(m => (
            <div key={m.name} className="bg-white/5 rounded-xl p-5 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{m.emoji}</span>
                <div>
                  <div className="font-bold text-white">{m.name}</div>
                  <div className="text-xs text-gray-500">{m.duration_days} days in space</div>
                </div>
                <div className="ml-auto">
                  <div className="w-16 bg-white/10 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${Math.min(100, (m.duration_days / 900) * 100)}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 text-right mt-0.5">{m.duration_days}d</div>
                </div>
              </div>
              <ul className="space-y-1.5">
                {m.key_findings.map(f => (
                  <li key={f} className="text-sm text-gray-300 flex gap-2 items-start">
                    <span className="text-green-400 mt-0.5">▸</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {view === 'timeline' && (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500/50 to-red-500/30" />
          <div className="space-y-3 pl-12">
            {[
              { time: 'Minutes', icon: '⚡', events: ['Fluid shifts toward head begin', 'Space sickness (50-80% of astronauts)', 'Heart rate changes'] },
              { time: 'Hours', icon: '🕐', events: ['Puffy face fully apparent', 'Nasal congestion develops', 'Body sheds excess fluid', 'Spine begins elongating'] },
              { time: 'Days', icon: '📅', events: ['Blood volume decreases 10-15%', 'Bone loss begins', 'Sleep disruption from 16 sunrises/day', 'Immune system changes start'] },
              { time: 'Weeks', icon: '📆', events: ['Muscle loss 5-10% without exercise', 'VIIP symptoms may begin', 'Viral reactivation (herpes, Epstein-Barr)', 'Radiation DNA damage accumulates'] },
              { time: 'Months', icon: '🌙', events: ['Bone density 1-2% loss per month', 'Heart becomes more spherical', 'Brain structural changes visible on MRI', 'Significant muscle atrophy without countermeasures'] },
              { time: 'Year+', icon: '🌍', events: ['10-15% total bone density loss', 'Telomere changes', 'Epigenetic modifications', 'Career radiation limit approached in LEO'] },
            ].map((phase, i) => (
              <div key={phase.time} className="relative">
                <div className="absolute -left-8 w-4 h-4 rounded-full border-2 border-black flex items-center justify-center text-xs"
                  style={{ backgroundColor: `hsl(${120 - i * 20}, 70%, 50%)`, top: 8 }}>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{phase.icon}</span>
                    <span className="font-bold text-white">{phase.time}</span>
                  </div>
                  <ul className="space-y-1">
                    {phase.events.map(ev => (
                      <li key={ev} className="text-xs text-gray-300 flex gap-1.5">
                        <span className="text-green-400">•</span>{ev}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-center">
        {[
          { label: 'Bone loss/month', value: '1-2%', icon: '🦴' },
          { label: 'Radiation (ISS/yr)', value: '150 mSv', icon: '☢️' },
          { label: 'Blood volume loss', value: '~15%', icon: '🩸' },
          { label: 'Height gain in space', value: '+3-5 cm', icon: '📏' },
        ].map(f => (
          <div key={f.label} className="bg-white/5 rounded-lg p-2 border border-white/10">
            <div className="text-xl">{f.icon}</div>
            <div className="font-bold text-white font-mono">{f.value}</div>
            <div className="text-gray-500">{f.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
