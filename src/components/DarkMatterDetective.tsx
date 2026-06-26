import { useState } from 'react'

interface Evidence {
  id: string
  title: string
  icon: string
  color: string
  year: number
  discoveredBy: string
  category: 'motion' | 'lensing' | 'cosmic' | 'structure'
  verdict: 'strong' | 'definitive' | 'circumstantial'
  explanation: string
  whatWeExpected: string
  whatWeObserved: string
  implication: string
  funFact: string
}

const EVIDENCE: Evidence[] = [
  {
    id: 'galaxy_rotation',
    title: 'Galaxy Rotation Curves',
    icon: '🌀',
    color: '#3b82f6',
    year: 1970,
    discoveredBy: 'Vera Rubin & Kent Ford',
    category: 'motion',
    verdict: 'definitive',
    explanation: 'Stars at the outer edges of galaxies orbit much faster than Newtonian gravity predicts. Something unseen is adding gravitational pull.',
    whatWeExpected: 'Stars farther from center should orbit slower (like outer planets in our solar system — Neptune is much slower than Mercury).',
    whatWeObserved: 'Stars at the outer edges orbit at roughly the same speed as inner stars — flat rotation curve instead of declining. This "shouldn\'t" happen without extra mass.',
    implication: 'Galaxies must contain ~5-6× more mass than visible stars and gas. The invisible mass forms a spherical "halo" around the galaxy.',
    funFact: 'Vera Rubin faced enormous resistance — male colleagues dismissed her findings for years. She measured 200 galaxies and found the same result in all of them. She should have won a Nobel Prize but never did.'
  },
  {
    id: 'bullet_cluster',
    title: 'The Bullet Cluster',
    icon: '💥',
    color: '#ef4444',
    year: 2006,
    discoveredBy: 'Chandra X-ray Observatory',
    category: 'lensing',
    verdict: 'definitive',
    explanation: 'Two galaxy clusters collided. The hot gas (most visible matter) slowed down due to electromagnetic forces — but the mass (from lensing) passed through, revealing separate dark matter.',
    whatWeExpected: 'If gravity = visible matter, the mass center should stay with the gas.',
    whatWeObserved: 'Gravitational lensing shows the mass separated from the hot gas. The mass is where the galaxies are, not where the gas is. The two components passed through each other.',
    implication: 'Dark matter must interact only through gravity — it passed through the gas cloud without slowing down (no electromagnetic interaction). This is the most direct evidence yet.',
    funFact: 'The Bullet Cluster is often called "the smoking gun for dark matter." The gas collision created a supersonic bow shock — the "bullet" — visible in X-rays. It\'s the best argument against alternatives like MOND.'
  },
  {
    id: 'cme_background',
    title: 'Cosmic Microwave Background',
    icon: '🌐',
    color: '#fbbf24',
    year: 1992,
    discoveredBy: 'COBE Satellite / Planck Satellite',
    category: 'cosmic',
    verdict: 'definitive',
    explanation: 'The precise pattern of temperature fluctuations in the CMB (the afterglow of the Big Bang) perfectly matches models that include dark matter but not those without it.',
    whatWeExpected: 'Without dark matter, fluctuations would look very different — the acoustic peaks would be in different positions and heights.',
    whatWeObserved: 'CMB acoustic peaks fit the standard model (ΛCDM) with dark matter: 5% ordinary matter, 27% dark matter, 68% dark energy. The fit is extraordinary.',
    implication: 'Dark matter was present in the early universe (380,000 years after Big Bang) and affected how matter clumped together. This is completely independent from galaxy observations.',
    funFact: 'The CMB was discovered accidentally in 1965 by Penzias and Wilson as "unexplained noise" in a radio antenna. They thought pigeons were fouling the equipment. They won the Nobel Prize instead of the theoretical cosmologists who predicted it.'
  },
  {
    id: 'large_scale_structure',
    title: 'Cosmic Web Structure',
    icon: '🕸️',
    color: '#a855f7',
    year: 1986,
    discoveredBy: 'Various (CfA Redshift Survey)',
    category: 'structure',
    verdict: 'strong',
    explanation: 'The filamentary "cosmic web" structure of the universe — galaxies in sheets and filaments separated by voids — can only form with dark matter acting as gravitational scaffolding.',
    whatWeExpected: 'Without dark matter, matter couldn\'t clump fast enough after the Big Bang to form the structures we see.',
    whatWeObserved: 'Galaxies trace web-like filaments with vast empty voids. Simulations with dark matter (Millennium Simulation, IllustrisTNG) reproduce this exactly. Without dark matter, simulations produce uniform, featureless distribution.',
    implication: 'Dark matter was essential for galaxy formation — ordinary matter fell into the gravitational wells that dark matter created first.',
    funFact: 'In 2016, the "Horizon-AGN" simulation using dark matter produced a simulated universe indistinguishable from the real one when examined statistically. Without dark matter, every simulation fails catastrophically.'
  },
  {
    id: 'gravitational_lensing',
    title: 'Gravitational Lensing in Galaxy Clusters',
    icon: '🔭',
    color: '#06b6d4',
    year: 1979,
    discoveredBy: 'Walsh, Carswell & Weymann',
    category: 'lensing',
    verdict: 'strong',
    explanation: 'Galaxy clusters bend light more than their visible mass should allow. The total mass from lensing is consistently 5-10× more than visible matter.',
    whatWeExpected: 'Light bending = mass we can see (stars, gas, dust).',
    whatWeObserved: 'Clusters bend light as if they contain far more mass than visible. Every cluster measured shows the same discrepancy.',
    implication: 'Every galaxy cluster in the universe has ~85% of its mass in an invisible form. The lensing maps the dark matter distribution precisely.',
    funFact: 'The first gravitational lens discovered was Q0957+561 — a quasar appearing doubled because a galaxy cluster bent its light. Now we use these "Einstein rings" to weigh galaxy clusters, revealing their dark matter halos.'
  },
  {
    id: 'dwarf_galaxy_velocity',
    title: 'Dwarf Galaxy Velocity Dispersions',
    icon: '🌌',
    color: '#f97316',
    year: 1933,
    discoveredBy: 'Fritz Zwicky',
    category: 'motion',
    verdict: 'strong',
    explanation: 'The first evidence of dark matter! Zwicky measured galaxy velocities in the Coma Cluster and found they moved way too fast to be held together by visible matter alone.',
    whatWeExpected: 'Velocity dispersion should match the gravitational pull of visible galaxies.',
    whatWeObserved: 'Galaxies in clusters move 10× faster than expected. Without extra mass, the cluster would fly apart. He called the missing mass "dunkle Materie" — dark matter.',
    implication: 'First use of the term "dark matter" in 1933. Ignored for 40 years until Vera Rubin\'s independent galaxy rotation evidence.',
    funFact: 'Fritz Zwicky predicted dark matter in 1933 but wasn\'t believed for decades. He also predicted neutron stars, gravitational lenses, and supernovae — all ignored initially. He called his colleagues "spherical bastards" (because they were bastards from every angle).'
  },
]

const VERDICT_CONFIG = {
  definitive: { label: '🔴 Definitive Evidence', color: '#ef4444' },
  strong: { label: '🟡 Strong Evidence', color: '#fbbf24' },
  circumstantial: { label: '🟢 Circumstantial', color: '#22c55e' },
}

const CATEGORY_LABELS = {
  motion: '🌀 Motion',
  lensing: '🔭 Lensing',
  cosmic: '🌐 Cosmic',
  structure: '🕸️ Structure',
}

export default function DarkMatterDetective() {
  const [selected, setSelected] = useState<Evidence>(EVIDENCE[0])
  const [catFilter, setCatFilter] = useState<Evidence['category'] | 'all'>('all')

  const filtered = catFilter === 'all' ? EVIDENCE : EVIDENCE.filter(e => e.category === catFilter)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Dark Matter Detective</h2>
      <p className="text-gray-400 text-sm mb-5">We can't see it. We can't touch it. But 6 independent lines of evidence prove it's real.</p>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setCatFilter('all')}
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{
            background: catFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: catFilter === 'all' ? 'white' : '#6b7280',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >All Evidence</button>
        {(Object.entries(CATEGORY_LABELS) as [Evidence['category'], string][]).map(([cat, label]) => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
            style={{
              background: catFilter === cat ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
              color: catFilter === cat ? '#a5b4fc' : '#6b7280',
              border: `1px solid ${catFilter === cat ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Evidence list */}
        <div className="space-y-1.5">
          {filtered.map(e => {
            const v = VERDICT_CONFIG[e.verdict]
            return (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: selected.id === e.id ? e.color + '18' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${selected.id === e.id ? e.color + '50' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xl mt-0.5">{e.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: selected.id === e.id ? e.color : '#e2e8f0' }}>{e.title}</div>
                    <div className="text-[10px] text-gray-600">{e.discoveredBy} • {e.year}</div>
                    <div className="text-[9px] mt-0.5 font-bold" style={{ color: v.color }}>{v.label}</div>
                  </div>
                </div>
              </button>
            )
          })}

          {/* Dark matter pie */}
          <div className="bg-gray-800/60 rounded-xl p-3 mt-3">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Universe Composition</div>
            <div className="space-y-1">
              {[
                { label: 'Dark Energy', pct: 68, color: '#a855f7' },
                { label: 'Dark Matter', pct: 27, color: '#3b82f6' },
                { label: 'Ordinary Matter', pct: 5, color: '#22c55e' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 h-2 bg-gray-900 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.color }} />
                  </div>
                  <span style={{ color: item.color }} className="w-3 font-bold">{item.pct}%</span>
                  <span className="text-gray-500 w-24">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-600 text-[10px] mt-2">Everything you can see, touch, measure = 5% of the universe.</p>
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-5" style={{ background: selected.color + '12', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.title}</h3>
                <div className="text-sm text-gray-400">{selected.discoveredBy} ({selected.year})</div>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: VERDICT_CONFIG[selected.verdict].color, background: VERDICT_CONFIG[selected.verdict].color + '20' }}>
                    {VERDICT_CONFIG[selected.verdict].label}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                    {CATEGORY_LABELS[selected.category]}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.explanation}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🤔 What We Expected</div>
              <p className="text-gray-300 text-sm leading-relaxed">{selected.whatWeExpected}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="text-red-400 text-xs uppercase font-semibold mb-2">📊 What We Observed</div>
              <p className="text-gray-300 text-sm leading-relaxed">{selected.whatWeObserved}</p>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">🔍 Implication</div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.implication}</p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-amber-400 text-xs uppercase font-semibold mb-2">🕵️ Behind the Discovery</div>
            <p className="text-amber-100/80 text-sm leading-relaxed">{selected.funFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
