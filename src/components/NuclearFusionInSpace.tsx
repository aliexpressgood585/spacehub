import { useState, useEffect, useRef } from 'react'

interface FusionReaction {
  name: string
  fuel: string
  products: string
  energy: string
  tempRequired: string
  crossSection: string
  status: 'stellar' | 'achieved' | 'goal' | 'future'
  description: string
}

interface FusionDevice {
  name: string
  type: string
  location: string
  record: string
  year: number
  status: 'operating' | 'construction' | 'planned' | 'historical'
  achievement: string
}

interface StellarLayer {
  name: string
  temp: string
  process: string
  products: string
  color: string
}

const REACTIONS: FusionReaction[] = [
  {
    name: 'Proton-Proton Chain (pp)',
    fuel: '4 H¹ → He⁴',
    products: 'He-4 + 2 positrons + 2 neutrinos',
    energy: '26.7 MeV per cycle',
    tempRequired: '15 million K (stellar core)',
    crossSection: 'Very low (dominant in Sun)',
    status: 'stellar',
    description: 'The primary fusion process in stars like the Sun. Takes billions of years per proton-proton cycle due to weak nuclear force involvement. Drives Sun\'s luminosity.',
  },
  {
    name: 'CNO Cycle',
    fuel: 'H¹ (catalyzed by C/N/O)',
    products: 'He-4 + neutrinos',
    energy: '26.7 MeV per cycle',
    tempRequired: '20+ million K',
    crossSection: 'Dominant in stars >1.3 M☉',
    status: 'stellar',
    description: 'Carbon-Nitrogen-Oxygen catalytic cycle. Dominates in more massive, hotter stars. Same net reaction as pp chain but faster and temperature-sensitive.',
  },
  {
    name: 'D-T Fusion (Deuterium-Tritium)',
    fuel: 'D² + T³ → He⁴ + n',
    products: 'He-4 (3.5 MeV) + neutron (14.1 MeV)',
    energy: '17.6 MeV',
    tempRequired: '150 million K (10× the Sun)',
    crossSection: 'Highest at achievable temp',
    status: 'achieved',
    description: 'The easiest fusion reaction to achieve on Earth. NIF (National Ignition Facility) achieved ignition in 2022. ITER and future reactors use this fuel.',
  },
  {
    name: 'D-D Fusion',
    fuel: 'D² + D² → T or He-3',
    products: 'T + p OR He-3 + n',
    energy: '3.27 or 4.03 MeV',
    tempRequired: '300+ million K',
    crossSection: 'Lower than D-T',
    status: 'goal',
    description: 'Deuterium-only fuel — extracted from seawater (1 in 6,400 water molecules). Unlimited fuel supply. No tritium breeding needed. Target for 2nd-generation reactors.',
  },
  {
    name: 'p-He-3 (Aneutronic)',
    fuel: 'p + He³ → He⁴ + e⁺',
    products: 'He-4 + positron (no neutrons)',
    energy: '18.4 MeV',
    tempRequired: '1 billion K',
    crossSection: 'Very low',
    status: 'future',
    description: 'Proton-Helium-3 produces no neutrons — perfect for direct electricity generation. He-3 is rare on Earth but abundant on the Moon and gas giants. The "holy grail" of fusion.',
  },
  {
    name: 'Triple Alpha Process',
    fuel: '3 He⁴ → C¹²',
    products: 'Carbon-12',
    energy: '7.27 MeV',
    tempRequired: '100+ million K (giant stars)',
    crossSection: 'Requires dense stellar core',
    status: 'stellar',
    description: 'Carbon formation in red giant stars. Three helium nuclei fuse in two steps through an unstable beryllium-8 intermediate. Discovery by Fred Hoyle predicted the fine-tuning of physical constants.',
  },
]

const FUSION_DEVICES: FusionDevice[] = [
  { name: 'ITER', type: 'Tokamak', location: 'Cadarache, France', record: 'Q=10 (target)', year: 2027, status: 'construction', achievement: 'International megaproject — 10× energy gain target' },
  { name: 'NIF (National Ignition Facility)', type: 'Laser ICF', location: 'Livermore, USA', record: 'Q=1.5 (Dec 2022)', year: 2022, status: 'operating', achievement: 'First fusion ignition — more energy out than laser input' },
  { name: 'JET (Joint European Torus)', type: 'Tokamak', location: 'Culham, UK', record: '59 MJ in 5 seconds (2022)', year: 2022, status: 'historical', achievement: 'World record D-T fusion energy (retired 2024)' },
  { name: 'KSTAR', type: 'Tokamak', location: 'Daejeon, South Korea', record: '48 sec at 100M K (2024)', year: 2024, status: 'operating', achievement: 'World record plasma duration at fusion temperature' },
  { name: 'Commonwealth Fusion (SPARC)', type: 'Tokamak', location: 'Cambridge, USA', record: 'Q>2 (target 2025)', year: 2025, status: 'construction', achievement: 'High-field magnets (20T) — most compact fusion path' },
  { name: 'Helion Energy', type: 'FRC (Field-Reversed)', location: 'Everett, USA', record: '100 million K (2021)', year: 2021, status: 'operating', achievement: 'Microsoft signed 1GW power purchase agreement' },
  { name: 'TAE Technologies', type: 'Field-Reversed', location: 'Foothill Ranch, USA', record: '75 keV plasma (2022)', year: 2022, status: 'operating', achievement: 'p-B11 aneutronic fusion target' },
  { name: 'DEMO', type: 'Tokamak', location: 'TBD', record: 'Net electricity (target)', year: 2040, status: 'planned', achievement: 'First fusion power plant demonstrator' },
]

const STELLAR_LAYERS: StellarLayer[] = [
  { name: 'Core', temp: '15 million K', process: 'Proton-proton chain fusion', products: 'Helium-4, energy', color: '#fbbf24' },
  { name: 'Radiative Zone', temp: '2–15 million K', process: 'Energy transport via photons', products: 'Light takes 100,000 years to escape', color: '#f97316' },
  { name: 'Tachocline', temp: '~2 million K', process: 'Shear layer — magnetic dynamo', products: 'Sun\'s magnetic field generated here', color: '#ef4444' },
  { name: 'Convection Zone', temp: '1,000–2M K', process: 'Hot plasma rises, cools, falls', products: 'Granules visible on surface', color: '#dc2626' },
  { name: 'Photosphere', temp: '5,778 K', process: 'Light finally escapes', products: 'Sunlight (8 min to Earth)', color: '#b45309' },
  { name: 'Chromosphere', temp: '10,000–50,000 K', process: 'Spicules, prominences', products: 'Hα hydrogen emission', color: '#d97706' },
  { name: 'Corona', temp: '1–3 million K', process: 'Magnetic reconnection heating', products: 'Solar wind, X-rays', color: '#92400e' },
]

function StellarFusionSVG() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#02040a'
    ctx.fillRect(0, 0, W, H)

    const layers = [
      { r: 80, color: '#fbbf24', label: 'Core (fusion)' },
      { r: 115, color: '#f97316', label: 'Radiative' },
      { r: 130, color: '#ef4444', label: 'Convective' },
      { r: 138, color: '#b45309', label: 'Photosphere' },
      { r: 150, color: '#d97706aa', label: 'Corona' },
    ]
    layers.slice().reverse().forEach(layer => {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, layer.r)
      grad.addColorStop(0, layer.color)
      grad.addColorStop(1, layer.color + '44')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, layer.r, 0, Math.PI * 2)
      ctx.fill()
    })

    // Fusion arrows in core
    ctx.fillStyle = '#fff'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('p + p', cx, cy - 8)
    ctx.fillText('↓', cx, cy)
    ctx.fillText('He⁴ + γ', cx, cy + 12)

    // Label
    ctx.fillStyle = '#9ca3af'
    ctx.font = '10px sans-serif'
    ctx.fillText('Stellar Cross-Section', cx, H - 8)
    ctx.textAlign = 'left'
  }, [])
  return <canvas ref={canvasRef} width={320} height={260} className="rounded-xl mx-auto block" />
}

const STATUS_COLORS: Record<string, string> = {
  stellar: 'bg-yellow-500/20 text-yellow-400',
  achieved: 'bg-green-500/20 text-green-400',
  goal: 'bg-blue-500/20 text-blue-400',
  future: 'bg-purple-500/20 text-purple-400',
}

const DEV_COLORS: Record<string, string> = {
  operating: 'bg-green-500/20 text-green-400',
  construction: 'bg-blue-500/20 text-blue-400',
  planned: 'bg-gray-500/20 text-gray-400',
  historical: 'bg-yellow-500/20 text-yellow-400',
}

type TabType = 'reactions' | 'devices' | 'stellar'

export default function NuclearFusionInSpace() {
  const [activeTab, setActiveTab] = useState<TabType>('reactions')
  const [selected, setSelected] = useState<FusionReaction>(REACTIONS[2])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">⚛️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Nuclear Fusion</h2>
          <p className="text-gray-400 text-sm">The power source of stars — and humanity's energy future</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['reactions', 'devices', 'stellar'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-yellow-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'reactions' ? 'Fusion Reactions' : t === 'devices' ? 'Fusion Devices' : 'Stellar Fusion'}
          </button>
        ))}
      </div>

      {activeTab === 'reactions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {REACTIONS.map(r => (
              <button
                key={r.name}
                onClick={() => setSelected(r)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected.name === r.name
                    ? 'bg-yellow-600/20 border-yellow-500'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="text-white text-sm font-medium">{r.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  <span className="text-gray-400 text-xs">{r.energy}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <h3 className="text-white text-xl font-bold mb-1">{selected.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>

            <div className="bg-black/30 rounded-lg p-3 font-mono text-center my-4">
              <div className="text-yellow-300 text-sm">{selected.fuel}</div>
              <div className="text-gray-400 text-xs mt-1">→ {selected.products}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Energy Released', value: selected.energy },
                { label: 'Temperature Required', value: selected.tempRequired },
                { label: 'Cross-Section', value: selected.crossSection },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>

            <p className="text-gray-300 text-sm">{selected.description}</p>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FUSION_DEVICES.map(d => (
            <div key={d.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-white font-bold">{d.name}</div>
                  <div className="text-gray-400 text-xs">{d.type} · {d.location}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${DEV_COLORS[d.status]}`}>{d.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-white/5 rounded p-2">
                  <div className="text-gray-400 text-xs">Record / Target</div>
                  <div className="text-yellow-400 text-sm font-bold">{d.record}</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-gray-400 text-xs">Year</div>
                  <div className="text-white text-sm">{d.year}</div>
                </div>
              </div>
              <div className="text-gray-300 text-xs">{d.achievement}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'stellar' && (
        <div className="space-y-4">
          <StellarFusionSVG />

          <div className="space-y-3">
            {STELLAR_LAYERS.map((layer, i) => (
              <div key={i} className="flex items-center gap-4 bg-white/5 rounded-xl p-3 border border-white/10">
                <div className="w-3 h-10 rounded-sm flex-shrink-0" style={{ background: layer.color }} />
                <div className="flex-1">
                  <div className="text-white font-semibold">{layer.name}</div>
                  <div className="text-yellow-400 text-xs">{layer.temp}</div>
                  <div className="text-gray-300 text-sm">{layer.process}</div>
                  <div className="text-gray-500 text-xs">{layer.products}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
            <div className="text-yellow-300 font-bold mb-2">Fusion in Space Propulsion</div>
            <p className="text-gray-300 text-sm">
              Fusion rockets could reach Mars in 30–90 days (vs. 7–9 months chemically) and the outer planets in years vs. decades. Concepts include <strong className="text-yellow-300">Helion's FRC drive</strong>, <strong className="text-yellow-300">Direct Fusion Drive</strong> (Princeton), and <strong className="text-yellow-300">Z-pinch rockets</strong>. Fusion propulsion would open the entire solar system to practical human exploration.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Sun\'s Fusion Rate', value: '620M t/s', desc: 'hydrogen converted per second' },
          { label: 'NIF Achievement', value: '2022', desc: 'first ignition on Earth' },
          { label: 'ITER Target Q', value: '10', desc: '10× more energy out than in' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-yellow-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
