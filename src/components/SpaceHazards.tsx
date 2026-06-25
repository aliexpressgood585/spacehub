import { useState } from 'react'

interface Hazard {
  name: string
  type: string
  icon: string
  color: string
  realRisk: string
  probability: string
  safeDistance: string
  killRadius: string
  energyRelease: string
  earthEffects: { distance: string; effect: string; severity: 'catastrophic' | 'severe' | 'moderate' | 'minor' }[]
  history: string
  detection: string
  protection: string
  fascinatingFact: string
}

const HAZARDS: Hazard[] = [
  {
    name: 'Gamma-Ray Burst',
    type: 'Cosmological Explosion',
    icon: '💥',
    color: '#ef4444',
    realRisk: 'Extremely low — nearest long GRB would need to be within ~8,000 light-years AND aimed at Earth. Probability: ~1 per billion years.',
    probability: '~1 per billion years for a lethal hit',
    safeDistance: '>8,000 light-years (roughly)',
    killRadius: '~6,000 light-years (long GRBs)',
    energyRelease: '10⁴⁴–10⁴⁷ J — more energy than the Sun emits over its entire 10 billion year lifetime, in seconds',
    earthEffects: [
      { distance: '6,000 ly', effect: 'Ozone layer destroyed by gamma rays. Extreme UV floods surface. Mass extinction. End of multicellular life.', severity: 'catastrophic' },
      { distance: '10,000 ly', effect: 'Partial ozone depletion. Significant UV increase. Crop failures. Mass marine extinctions. Civilizational collapse.', severity: 'severe' },
      { distance: '25,000 ly', effect: 'Marginal ozone depletion. Elevated radiation. Increased cancer rates. Agricultural disruption in affected hemisphere.', severity: 'moderate' },
      { distance: '>50,000 ly', effect: 'Observable as a brief bright flash. No significant biological effect. Life continues normally.', severity: 'minor' },
    ],
    history: 'A GRB may have caused the Ordovician mass extinction ~450 million years ago, which killed ~85% of marine species. WR 104 (8,000 ly away) is a "candidate" GRB progenitor, though current data suggest it\'s not aimed at Earth.',
    detection: 'Swift and Fermi satellites detect ~1 GRB per day in the observable universe. None in our galaxy in recorded history.',
    protection: 'None practical. Magnetic field provides no protection against gamma rays. Underground shelter might offer minor protection.',
    fascinatingFact: 'In just 2 seconds, a short GRB releases as much energy as the entire Milky Way emits in light over 10 years — focused into a jet narrower than 10 degrees.'
  },
  {
    name: 'Neutron Star Merger',
    type: 'Compact Object Collision',
    icon: '⭐',
    color: '#a855f7',
    realRisk: 'Very low. Mergers produce both GRBs and gravitational waves. GW170817 was 130 million light-years away — safe.',
    probability: '~1 per million years in any given galaxy',
    safeDistance: '>3,000 light-years',
    killRadius: '~1,000 light-years (from the GRB jet component)',
    energyRelease: '~5 × 10⁴⁴ J total; ~3% emitted in gravitational waves alone',
    earthEffects: [
      { distance: '500 ly', effect: 'Catastrophic: gamma-ray burst + cosmic ray flood + gravitational wave pulse. Total sterilization. All complex life ends.', severity: 'catastrophic' },
      { distance: '2,000 ly', effect: 'Severe ozone depletion, major radiation pulse. Collapse of ocean food chain. Mass extinction event comparable to K-Pg boundary.', severity: 'severe' },
      { distance: '10,000 ly', effect: 'Detectable gravitational waves. Elevated cosmic ray flux for years. Moderate radiation increase.', severity: 'moderate' },
      { distance: '>50,000 ly', effect: 'Detected by LIGO as gravitational waves and gamma-ray satellites. No biological effect on Earth. Scientifically exciting.', severity: 'minor' },
    ],
    history: 'GW170817 (2017) was 130 million ly away — detected in gravitational waves AND light for the first time. Produced ~200 Earth masses of gold, 500 Earth masses of platinum.',
    detection: 'LIGO, Virgo, KAGRA gravitational wave detectors; Fermi/Swift for gamma rays. Multi-messenger astronomy.',
    protection: 'None. The gravitational wave component is harmless — it literally passes through Earth (and us) without interaction.',
    fascinatingFact: 'The gold in your wedding ring was almost certainly forged in a neutron star merger that occurred billions of years ago in our galaxy.'
  },
  {
    name: 'Supernovae',
    type: 'Stellar Explosion',
    icon: '🌟',
    color: '#f97316',
    realRisk: 'Low but not negligible. Betelgeuse (700 ly) will explode within ~100,000 years. It will be spectacular — but harmless.',
    probability: '~1–2 per century in the Milky Way; harmful distance (<100 ly) roughly 1 per billion years',
    safeDistance: '>100 light-years',
    killRadius: '~25–50 light-years (for a typical supernova)',
    energyRelease: '~10⁴⁴ J (1% of total energy; rest is neutrinos)',
    earthEffects: [
      { distance: '25 ly', effect: 'Devastating: ozone destroyed, intense X-ray/UV flood, ground-level cosmic ray increase 100×. Mass extinction.', severity: 'catastrophic' },
      { distance: '100 ly', effect: 'Significant ozone depletion (~40%). Elevated UV for decades. Marine ecosystem collapse. Possible civilization disruption.', severity: 'severe' },
      { distance: '300 ly', effect: 'Minor ozone effects. Naked-eye visible for months. Cosmic ray increase ~10%. Elevated cancer risk. Detectable geological record.', severity: 'moderate' },
      { distance: '>1,000 ly', effect: 'Visible to naked eye briefly. Betelgeuse-level event: spectacular sight, no biological effect.', severity: 'minor' },
    ],
    history: 'SN 1006 (7,200 ly) was the brightest stellar event in recorded history — visible in daylight. The Ordovician extinction may have been triggered by a supernova at ~6,000 ly. No star within 50 ly is currently a supernova candidate.',
    detection: 'Neutrinos arrive hours before light — we\'d get advance warning. SN 1987A neutrinos were detected 3 hours before the optical brightening.',
    protection: 'Magnetic field provides modest protection from cosmic rays. Earth\'s atmosphere absorbs most radiation.',
    fascinatingFact: 'A supernova 150 light-years away would shine 1/10 as bright as the full Moon — for months. You could read by its light at night. And you\'d have no idea it was killing the ozone layer for the next 1,000 years.'
  },
  {
    name: 'Coronal Mass Ejection',
    type: 'Solar Weather Event',
    icon: '☀️',
    color: '#fbbf24',
    realRisk: 'High and real. A Carrington-level event could happen any solar cycle. Economic damage estimated at $0.6–2.6 trillion in the first year.',
    probability: '~1 Carrington-level event per century; moderate CME several times per solar cycle',
    safeDistance: 'N/A — we are inside the Sun\'s heliosphere',
    killRadius: 'Cannot kill humans directly; but could collapse modern civilization indirectly',
    energyRelease: 'Carrington (1859): ~10²⁵ J — equivalent to 10 billion Hiroshima bombs',
    earthEffects: [
      { distance: 'Direct hit (Carrington-scale)', effect: 'Global power grid collapse. All unshielded electronics destroyed. GPS, internet, communications offline. Months or years to restore. 1 billion people without power.', severity: 'catastrophic' },
      { distance: 'Direct hit (X-class flare only)', effect: 'Radio blackouts. Satellite drag increases. GPS degraded. Airline rerouting near poles. Aurora visible at low latitudes.', severity: 'moderate' },
      { distance: 'Glancing blow', effect: 'Enhanced aurora. Minor satellite disruptions. Some power grid fluctuations.', severity: 'minor' },
      { distance: 'Miss', effect: 'Aurora for observers at higher latitudes. No practical effect.', severity: 'minor' },
    ],
    history: 'Carrington Event (1859): Telegraph operators got electric shocks; some could send messages with systems unplugged. March 1989: CME caused a 9-hour Quebec power blackout. July 2012: A Carrington-class CME missed Earth by 9 days.',
    detection: 'SOHO, ACE, DSCOVR spacecraft monitor the Sun and solar wind. We get 15–60 minutes of warning for Earth-directed CMEs.',
    protection: 'Faraday cages, grid hardening, satellite safe modes. Insufficient protection currently exists globally.',
    fascinatingFact: 'The July 2012 CME (which missed Earth) was more powerful than the 1859 Carrington Event. If it had hit, insurance company Lloyd\'s estimated damage at $2.6 trillion — more than any hurricane or earthquake in history.'
  },
  {
    name: 'Large Asteroid Impact',
    type: 'Impact Event',
    icon: '☄️',
    color: '#64748b',
    realRisk: 'Real but being actively addressed by planetary defense. Apophis (375 m) has near-zero probability of 2068 impact after radar refinements.',
    probability: 'Kilometer-scale impact: ~1 per million years; city-killer (50 m): ~1 per 1,000 years',
    safeDistance: 'N/A — depends entirely on impactor size and Earth distance',
    killRadius: '1-km asteroid: 100,000 km² blast zone; 10-km: global catastrophe',
    energyRelease: '1-km asteroid: ~100,000 Mt TNT; 10-km (Chicxulub-scale): 100 billion Mt TNT',
    earthEffects: [
      { distance: '1-km diameter impact', effect: 'Regional: 100,000 km² devastated. Ejecta blanket hemispheric. "Impact winter" from dust. 25–35% crop failure globally. Civilizational stress.', severity: 'severe' },
      { distance: '10-km diameter (Chicxulub scale)', effect: 'Mass extinction. Impact winter for years. >75% of species lost. Collapse of food chain. End of human civilization.', severity: 'catastrophic' },
      { distance: '50 m (Chelyabinsk/Tunguska scale)', effect: 'Regional: city-block to city-scale devastation. No crater; airburst. 1,500 injuries (Chelyabinsk). Forest destroyed (Tunguska).', severity: 'moderate' },
      { distance: '140 m (potentially hazardous)', effect: 'Country-scale devastation if land impact. Tsunami if ocean impact. UN classifies 140 m+ as Potentially Hazardous Asteroid.', severity: 'severe' },
    ],
    history: 'Chicxulub (66 Mya): 10-km impactor ended the age of dinosaurs. Tunguska (1908): 50-m object flattened 2,150 km² of Siberia. Chelyabinsk (2013): 20-m meteor injured 1,500 people.',
    detection: 'NASA catalogs 95%+ of km-scale NEOs. 140+ m objects: 40% cataloged. DART proved we can deflect them.',
    protection: 'Planetary defense: early detection + kinetic impactor + gravity tractor. With 10+ years warning, diversion is possible.',
    fascinatingFact: 'If the Chicxulub asteroid had hit 30 minutes earlier or later, it would have landed in shallower water and produced a far less severe impact — and dinosaurs might still dominate Earth today.'
  },
]

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    catastrophic: '#ef4444',
    severe: '#f97316',
    moderate: '#f59e0b',
    minor: '#22c55e',
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: colors[severity] + '20', color: colors[severity], border: `1px solid ${colors[severity]}40` }}>
      {severity}
    </span>
  )
}

export default function SpaceHazards() {
  const [selected, setSelected] = useState(HAZARDS[0])

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Space Hazards Explorer</h2>
      <p className="text-gray-400 text-sm mb-5">From gamma-ray bursts to solar storms — understanding the real dangers of the cosmos and Earth's vulnerability</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hazard list */}
        <div className="space-y-2">
          {HAZARDS.map(h => (
            <button key={h.name} onClick={() => setSelected(h)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.name === h.name ? h.color + '15' : 'rgba(30,41,59,0.5)',
                border: `1px solid ${selected.name === h.name ? h.color + '50' : 'rgba(255,255,255,0.04)'}`,
              }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{h.icon}</span>
                <div>
                  <div className="text-white text-sm font-semibold">{h.name}</div>
                  <div className="text-gray-500 text-xs">{h.type}</div>
                </div>
              </div>
              <div className="text-xs ml-7" style={{ color: h.color }}>Kill radius: {h.killRadius}</div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '10', border: `1px solid ${selected.color}35` }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="text-sm" style={{ color: selected.color }}>{selected.type}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mt-3">
              {[
                ['Energy', selected.energyRelease.split(' ')[0] + ' J'],
                ['Kill radius', selected.killRadius],
                ['Probability', selected.probability.split(';')[0]],
              ].map(([k, v]) => (
                <div key={k} className="bg-black/20 rounded-lg p-2">
                  <div className="text-gray-500">{k}</div>
                  <div className="text-gray-200 font-medium text-xs">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Earth effects table */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-3">Effect on Earth by Distance / Scenario</div>
            <div className="space-y-2">
              {selected.earthEffects.map((ef, i) => (
                <div key={i} className="bg-gray-900/60 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-xs font-medium">{ef.distance}</span>
                    <SeverityBadge severity={ef.severity} />
                  </div>
                  <p className="text-gray-300 text-xs leading-relaxed">{ef.effect}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reality check */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Real Risk Assessment</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.realRisk}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* History */}
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Historical Record</div>
              <p className="text-gray-300 text-sm">{selected.history}</p>
            </div>
            {/* Detection */}
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Detection &amp; Warning</div>
              <p className="text-gray-300 text-sm">{selected.detection}</p>
            </div>
          </div>

          {/* Fascinating fact */}
          <div className="rounded-xl p-4" style={{ background: selected.color + '08', border: `1px solid ${selected.color}25` }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.color }}>Mind-Bending Fact</div>
            <p className="text-gray-200 text-sm leading-relaxed">{selected.fascinatingFact}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
