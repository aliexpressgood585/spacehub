import { useState, useEffect, useRef } from 'react'

interface SNType {
  type: string
  progenitor: string
  mechanism: string
  peakLuminosity: string
  duration: string
  remnant: string
  rate: string
  description: string
  example: string
  color: string
}

interface SNRemnant {
  name: string
  distance: string
  age: string
  type: string
  diameter: string
  expansion: string
  features: string[]
  discovery: string
  icon: string
}

interface HistoricSN {
  year: string
  name: string
  constellation: string
  peak: string
  visibility: string
  remnant: string
  notes: string
}

const SN_TYPES: SNType[] = [
  {
    type: 'Type Ia',
    progenitor: 'White dwarf in binary',
    mechanism: 'Thermonuclear runaway at Chandrasekhar limit (~1.4 M☉)',
    peakLuminosity: '~5 billion L☉',
    duration: '2–3 weeks (rise), months (decline)',
    remnant: 'No compact object — pure ejecta',
    rate: '~1 per 100 years per galaxy',
    description: 'A white dwarf accretes mass from a companion until it reaches 1.4 solar masses and detonates entirely. No neutron star or black hole left. Uniform brightness makes them "standard candles" for measuring cosmic distances.',
    example: 'SN 1572 (Tycho), SN 2011fe (M101)',
    color: '#ef4444',
  },
  {
    type: 'Type II (Core Collapse)',
    progenitor: 'Massive star (>8 M☉)',
    mechanism: 'Iron core collapses to neutron star; neutrino explosion',
    peakLuminosity: '~100 million L☉ (but 99% neutrinos)',
    duration: 'Days to months',
    remnant: 'Neutron star or black hole + nebula',
    rate: '~2 per 100 years per galaxy',
    description: 'A massive star\'s iron core collapses in 0.25 seconds. Neutrinos carry away 99% of energy. Shock wave blows off outer layers. Leaves either neutron star (pulsar) or black hole at center.',
    example: 'SN 1987A (LMC), Cassiopeia A',
    color: '#3b82f6',
  },
  {
    type: 'Type Ib/Ic (Stripped Core)',
    progenitor: 'Wolf-Rayet star (lost envelope)',
    mechanism: 'Core collapse — no hydrogen (Ib) or helium (Ic) in spectrum',
    peakLuminosity: '~50 million L☉',
    duration: 'Weeks to months',
    remnant: 'Neutron star or black hole',
    rate: '~25% of core collapse SNe',
    description: 'Core collapse in stars that lost their outer hydrogen (or helium) layers via stellar winds or binary mass transfer. Type Ic are likely progenitors of long gamma-ray bursts.',
    example: 'SN 1994I, SN 2002ap (Monkey Face Galaxy)',
    color: '#8b5cf6',
  },
  {
    type: 'Hypernova / Collapsar',
    progenitor: 'Very massive, rapidly rotating star',
    mechanism: 'Core collapse into black hole + relativistic jet',
    peakLuminosity: '>10 billion L☉',
    duration: 'Hours to weeks',
    remnant: 'Black hole + GRB + kilonova',
    rate: '~1% of core collapse SNe',
    description: 'Extreme version of core collapse where a rapidly-spinning stellar core collapses directly to a black hole. Jets punching through the star create long gamma-ray bursts (GRBs). Brightest events in the universe.',
    example: 'GRB 030329 / SN 2003dh',
    color: '#f59e0b',
  },
  {
    type: 'Superluminous SN (SLSN)',
    progenitor: 'Massive star or magnetar engine',
    mechanism: 'Magnetar spin-down or pair-instability',
    peakLuminosity: '>1 trillion L☉ (100× brighter)',
    duration: 'Months to years',
    remnant: 'Magnetar or dispersed ejecta',
    rate: '~0.01% of all SNe',
    description: 'Newly discovered class — 10–100× brighter than standard supernovae. Powered by a rapidly spinning magnetar or pair-instability in very massive stars (>130 M☉). Visible across billions of light-years.',
    example: 'ASASSN-15lh, PTF10hgi',
    color: '#06b6d4',
  },
  {
    type: 'Kilonova',
    progenitor: 'Neutron star merger',
    mechanism: 'r-process nucleosynthesis in neutron-rich ejecta',
    peakLuminosity: '~1,000 times a nova',
    duration: 'Days',
    remnant: 'Heavy elements (gold, platinum)',
    rate: '~1 per 10,000 years per galaxy',
    description: 'Two neutron stars merge, ejecting neutron-rich matter at 30% of light-speed. r-process creates gold, platinum, uranium. GW170817 (LIGO 2017) was the first kilonova with gravitational wave + light detection.',
    example: 'GW170817 / AT2017gfo',
    color: '#10b981',
  },
]

const REMNANTS: SNRemnant[] = [
  {
    name: 'Crab Nebula (M1)',
    distance: '6,500 ly',
    age: '~970 years',
    type: 'Type II (SN 1054)',
    diameter: '11 ly',
    expansion: '1,500 km/s',
    features: ['Pulsar at center (33ms period)', 'Synchrotron radiation', 'Filaments of enriched gas', 'Observed by Chinese astronomers in 1054'],
    discovery: 'SN 1054 — visible in daytime for 23 days',
    icon: '🦀',
  },
  {
    name: 'Cassiopeia A',
    distance: '11,000 ly',
    age: '~350 years',
    type: 'Type IIb (SN ~1680)',
    diameter: '10 ly',
    expansion: '6,000 km/s',
    features: ['Brightest radio source beyond solar system', 'Neutron star detected', 'X-ray jets from JWST', 'Silicon, sulfur, calcium layers visible'],
    discovery: 'No historical record — possibly seen briefly by Flamsteed',
    icon: '💫',
  },
  {
    name: 'SN 1987A Remnant',
    distance: '168,000 ly (LMC)',
    age: '~38 years',
    type: 'Type II (blue supergiant progenitor)',
    diameter: '0.5 ly',
    expansion: '2,000 km/s',
    features: ['Three ring structure', 'First supernova neutrinos detected (24 signals)', 'JWST shows compact object forming', 'Ejecta growing and brightening'],
    discovery: 'First naked-eye supernova since 1604; observed Feb 24, 1987',
    icon: '⭐',
  },
  {
    name: 'Tycho\'s Remnant',
    distance: '8,000 ly',
    age: '~450 years',
    type: 'Type Ia (SN 1572)',
    diameter: '20 ly',
    expansion: '5,000 km/s',
    features: ['No compact remnant (Type Ia)', 'Shock-heated gas at 20M K', 'Kepler observed it (pre-natal)', 'Chandra X-ray reveals silicon layers'],
    discovery: 'Tycho Brahe observed it — brighter than Venus for 2 weeks',
    icon: '🔵',
  },
  {
    name: 'Vela SNR',
    distance: '800 ly (nearest)',
    age: '~11,000 years',
    type: 'Type II',
    diameter: '100 ly',
    expansion: '350 km/s (slowed)',
    features: ['Pulsar spinning 11 times/second', 'Nearest supernova remnant', 'Visible in radio and X-ray', 'Oxygen-rich filaments'],
    discovery: 'Explosion ~9000 BC — would have outshone the Moon',
    icon: '🌊',
  },
]

const HISTORIC: HistoricSN[] = [
  { year: '185 AD', name: 'SN 185', constellation: 'Centaurus', peak: 'Magnitude -8?', visibility: '20 months', remnant: 'RCW 86', notes: 'Recorded by Chinese astronomers — possibly first recorded supernova' },
  { year: '1006 AD', name: 'SN 1006', constellation: 'Lupus', peak: 'Magnitude -7.5', visibility: '2-3 years', remnant: 'SNR 1006', notes: 'Brightest stellar event in recorded history' },
  { year: '1054 AD', name: 'SN 1054 (Crab)', constellation: 'Taurus', peak: 'Magnitude -6', visibility: '2 years', remnant: 'Crab Nebula (M1)', notes: 'Visible in daytime. Chinese records. Now has Crab Pulsar.' },
  { year: '1181 AD', name: 'SN 1181', constellation: 'Cassiopeia', peak: 'Magnitude -1?', visibility: '185 days', remnant: 'Pa 30 (recently identified)', notes: 'Produced a unique hybrid remnant: a carbon-oxygen white dwarf + nebula' },
  { year: '1572 AD', name: 'Tycho\'s SN', constellation: 'Cassiopeia', peak: 'Magnitude -4', visibility: '18 months', remnant: 'Tycho\'s SNR', notes: 'Challenged Aristotle\'s celestial immutability. Brighter than Venus.' },
  { year: '1604 AD', name: 'Kepler\'s SN', constellation: 'Ophiuchus', peak: 'Magnitude -2.5', visibility: '12 months', remnant: 'Kepler\'s SNR', notes: 'Last naked-eye supernova in Milky Way. Brighter than all stars.' },
  { year: '1987 AD', name: 'SN 1987A', constellation: 'Dorado (LMC)', peak: 'Magnitude +2.9', visibility: 'Months', remnant: 'SN 1987A ring system', notes: 'First with neutrino detection. In LMC at 168,000 ly.' },
]

function SupernovaCanvas({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#020408'
    ctx.fillRect(0, 0, W, H)

    if (type === 'Type Ia') {
      // White dwarf accreting
      const wdGrad = ctx.createRadialGradient(cx - 40, cy, 0, cx - 40, cy, 20)
      wdGrad.addColorStop(0, '#e0e8ff')
      wdGrad.addColorStop(1, 'rgba(200,220,255,0)')
      ctx.fillStyle = wdGrad
      ctx.beginPath()
      ctx.arc(cx - 40, cy, 20, 0, Math.PI * 2)
      ctx.fill()

      // Companion red giant
      const rgGrad = ctx.createRadialGradient(cx + 50, cy, 0, cx + 50, cy, 30)
      rgGrad.addColorStop(0, '#ff6b00')
      rgGrad.addColorStop(1, 'rgba(255,50,0,0)')
      ctx.fillStyle = rgGrad
      ctx.beginPath()
      ctx.arc(cx + 50, cy, 30, 0, Math.PI * 2)
      ctx.fill()

      // Accretion stream
      ctx.strokeStyle = 'rgba(200,200,255,0.4)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx + 20, cy - 10)
      ctx.quadraticCurveTo(cx, cy - 30, cx - 20, cy)
      ctx.stroke()

      ctx.fillStyle = '#9ca3af'
      ctx.font = '9px sans-serif'
      ctx.fillText('WD accretion → detonation', 8, H - 8)
    } else {
      // Core collapse
      // Pre-explosion star
      const starGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60)
      starGrad.addColorStop(0, '#ffd700')
      starGrad.addColorStop(0.4, '#ff6600')
      starGrad.addColorStop(0.7, '#aa2200')
      starGrad.addColorStop(1, 'rgba(100,0,0,0)')
      ctx.fillStyle = starGrad
      ctx.beginPath()
      ctx.arc(cx, cy, 60, 0, Math.PI * 2)
      ctx.fill()

      // Shockwave rings
      for (let r = 70; r < 130; r += 15) {
        const op = (1 - (r - 70) / 60) * 0.5
        ctx.strokeStyle = `rgba(255,150,0,${op})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Iron core
      ctx.fillStyle = '#aaa'
      ctx.beginPath()
      ctx.arc(cx, cy, 10, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#9ca3af'
      ctx.font = '9px sans-serif'
      ctx.fillText('Core collapse + shockwave', 8, H - 8)
    }
  }, [type])
  return <canvas ref={canvasRef} width={280} height={180} className="rounded-xl mx-auto block" />
}

type TabType = 'types' | 'remnants' | 'historic'

export default function SupernovaExplosions() {
  const [activeTab, setActiveTab] = useState<TabType>('types')
  const [selected, setSelected] = useState<SNType>(SN_TYPES[0])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">💥</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Supernova Explosions</h2>
          <p className="text-gray-400 text-sm">Stellar death, cosmic forges of heavy elements, and standard candles of cosmology</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['types', 'remnants', 'historic'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-red-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'types' ? 'Types & Mechanisms' : t === 'remnants' ? 'Famous Remnants' : 'Historical SNe'}
          </button>
        ))}
      </div>

      {activeTab === 'types' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {SN_TYPES.map(s => (
              <button
                key={s.type}
                onClick={() => setSelected(s)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected.type === s.type
                    ? 'border-red-500 bg-red-600/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                  <div>
                    <div className="text-white text-sm font-bold">{s.type}</div>
                    <div className="text-gray-400 text-xs">{s.progenitor}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <SupernovaCanvas type={selected.type} />
            <h3 className="text-white text-xl font-bold mt-4 mb-1">{selected.type}</h3>
            <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Mechanism', value: selected.mechanism },
                { label: 'Peak Luminosity', value: selected.peakLuminosity },
                { label: 'Duration', value: selected.duration },
                { label: 'Remnant', value: selected.remnant },
                { label: 'Galactic Rate', value: selected.rate },
                { label: 'Example', value: selected.example },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'remnants' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REMNANTS.map(r => (
            <div key={r.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl">{r.icon}</span>
                <div>
                  <div className="text-white font-bold text-lg">{r.name}</div>
                  <div className="text-gray-400 text-xs">{r.type} · {r.age}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                {[
                  { label: 'Distance', value: r.distance },
                  { label: 'Diameter', value: r.diameter },
                  { label: 'Expansion', value: r.expansion },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded p-2">
                    <div className="text-gray-400">{s.label}</div>
                    <div className="text-white font-medium">{s.value}</div>
                  </div>
                ))}
              </div>
              <div className="text-blue-400 text-xs mb-2">📖 {r.discovery}</div>
              <div className="flex flex-wrap gap-1">
                {r.features.map(f => (
                  <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">{f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'historic' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">Historical supernovae bright enough to be seen by ancient astronomers — some changed humanity's understanding of the universe.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-white/10">
                  <th className="text-left py-2 pr-3">Year</th>
                  <th className="text-left py-2 pr-3">Name</th>
                  <th className="text-left py-2 pr-3">Peak Mag</th>
                  <th className="text-left py-2 pr-3">Visible</th>
                  <th className="text-left py-2">Remnant</th>
                </tr>
              </thead>
              <tbody>
                {HISTORIC.map(h => (
                  <tr key={h.year} className="border-b border-white/5">
                    <td className="py-3 pr-3 text-yellow-400 font-bold">{h.year}</td>
                    <td className="py-3 pr-3">
                      <div className="text-white font-medium">{h.name}</div>
                      <div className="text-gray-500 text-xs">{h.constellation}</div>
                    </td>
                    <td className="py-3 pr-3 text-orange-400 font-mono">{h.peak}</td>
                    <td className="py-3 pr-3 text-gray-300">{h.visibility}</td>
                    <td className="py-3 text-blue-400 text-xs">{h.remnant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 mt-4">
            {HISTORIC.map(h => (
              <div key={h.year} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-yellow-400 font-bold">{h.year}</span>
                  <span className="text-white font-medium">{h.name}</span>
                </div>
                <div className="text-gray-300 text-sm">{h.notes}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Last Galactic SN', value: '1604', desc: 'Kepler\'s Supernova — overdue for another' },
          { label: 'Peak Brightness', value: 'SN 1006', desc: 'Mag -7.5 — visible in daylight' },
          { label: 'Elements Created', value: 'O, Fe, Ni, Zn...', desc: 'Most heavy elements forged in SNe' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-red-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
