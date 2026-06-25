import { useState, useRef, useEffect } from 'react'

interface Detector {
  name: string
  location: string
  depth: number
  target: string
  mass: number
  massUnit: string
  sensitivity: string
  status: 'operating' | 'planned' | 'completed'
  type: 'direct' | 'indirect' | 'collider'
  description: string
  institution: string
}

interface EvidenceItem {
  title: string
  detail: string
  scale: string
  icon: string
}

interface CandidateParticle {
  name: string
  mass: string
  interaction: string
  likelihood: number
  description: string
  color: string
}

const detectors: Detector[] = [
  { name: 'LUX-ZEPLIN (LZ)', location: 'SURF, South Dakota, USA', depth: 1478, target: 'Liquid xenon', mass: 10, massUnit: 'tonnes', sensitivity: '1.4×10⁻⁴⁸ cm²', status: 'operating', type: 'direct', description: 'World\'s most sensitive WIMP detector using 10 tonnes of liquid xenon in a double-phase time projection chamber, 1.5 km underground.', institution: 'Lawrence Berkeley National Lab' },
  { name: 'XENONnT', location: 'Gran Sasso, Italy', depth: 1400, target: 'Liquid xenon', mass: 8.3, massUnit: 'tonnes', sensitivity: '1.4×10⁻⁴⁸ cm²', status: 'operating', type: 'direct', description: 'Third generation xenon experiment at Italy\'s Gran Sasso underground laboratory with 8.3 tonne active xenon target.', institution: 'XENON Collaboration (24 institutions)' },
  { name: 'PandaX-4T', location: 'CJPL, Sichuan, China', depth: 2400, target: 'Liquid xenon', mass: 4, massUnit: 'tonnes', sensitivity: '3×10⁻⁴⁷ cm²', status: 'operating', type: 'direct', description: 'China\'s flagship dark matter experiment at 2,400 m depth in the Jinping Underground Laboratory, deepest in the world.', institution: 'Shanghai Jiao Tong University' },
  { name: 'CDEX-300ν', location: 'CJPL, Sichuan, China', depth: 2400, target: 'Germanium crystal', mass: 300, massUnit: 'kg', sensitivity: 'Low-mass WIMP', status: 'planned', type: 'direct', description: 'Next-generation germanium detector for low-mass WIMPs and neutrinoless double-beta decay search.', institution: 'Tsinghua University' },
  { name: 'ADMX', location: 'University of Washington, USA', depth: 0, target: 'Microwave cavity', mass: 0, massUnit: '', sensitivity: '10⁻²³ eV', status: 'operating', type: 'direct', description: 'Axion Dark Matter eXperiment uses resonant microwave cavities in strong magnetic fields to detect axion-photon conversion.', institution: 'University of Washington' },
  { name: 'DARWIN', location: 'Gran Sasso, Italy (proposed)', depth: 1400, target: 'Liquid xenon', mass: 50, massUnit: 'tonnes', sensitivity: 'Neutrino floor', status: 'planned', type: 'direct', description: '50-tonne ultimate liquid xenon observatory that would reach the neutrino floor — the theoretical detection limit for WIMP dark matter.', institution: 'European Consortium' },
  { name: 'Fermi-LAT', location: 'Low Earth Orbit', depth: 0, target: 'Gamma rays', mass: 0, massUnit: '', sensitivity: '0.1–300 GeV', status: 'operating', type: 'indirect', description: 'Space telescope detecting gamma rays from dark matter annihilation in galactic center and dwarf spheroidal galaxies.', institution: 'NASA/SLAC' },
  { name: 'ATLAS/CMS @ LHC', location: 'CERN, Geneva', depth: 0, target: 'Proton collisions', mass: 0, massUnit: '', sensitivity: 'TeV scale', status: 'operating', type: 'collider', description: 'Search for dark matter production in proton-proton collisions via missing transverse energy signatures at 13–14 TeV.', institution: 'CERN' },
]

const evidence: EvidenceItem[] = [
  { title: 'Galaxy Rotation Curves', detail: 'Stars in spiral galaxies orbit at constant speed far from center — they should slow down like planets. Dark matter halo explains the "flat" rotation curves first measured by Vera Rubin in 1970s.', scale: 'Galactic (kpc)', icon: '🌀' },
  { title: 'Gravitational Lensing', detail: 'Bullet Cluster (1E 0657-558) shows two galaxy clusters that collided: hot gas (X-ray) slowed by drag, but gravitational lensing maps show most mass passed through — invisible dark matter.', scale: 'Cluster (Mpc)', icon: '🔭' },
  { title: 'Cosmic Microwave Background', detail: 'CMB acoustic peak heights reveal that ~27% of the universe is cold non-baryonic matter. Dark matter seeds structure formation by providing gravitational wells.', scale: 'Cosmological (Gpc)', icon: '📡' },
  { title: 'Large-Scale Structure', detail: 'N-body simulations with dark matter (ΛCDM model) precisely reproduce observed filaments, voids, and galaxy clusters. Baryonic-only simulations fail completely.', scale: 'Cosmic web (Gpc)', icon: '🕸️' },
  { title: 'Big Bang Nucleosynthesis', detail: 'Measured abundances of H, He, Li from the first 3 minutes constrain baryonic density to ~5% of total. The remaining ~27% must be non-baryonic.', scale: 'Primordial', icon: '💥' },
]

const candidates: CandidateParticle[] = [
  { name: 'WIMP', mass: '10 GeV – 10 TeV', interaction: 'Weak force + gravity', likelihood: 85, description: 'Weakly Interacting Massive Particle. Produced thermally in early universe. Top target for underground detectors.', color: '#60a5fa' },
  { name: 'Axion', mass: '10⁻⁶ – 10⁻³ eV', interaction: 'Electromagnetic (very weak)', likelihood: 70, description: 'Originally proposed to solve CP violation in QCD. Ultra-light boson that converts to photons in magnetic fields.', color: '#a78bfa' },
  { name: 'Sterile Neutrino', mass: 'keV – GeV', interaction: 'Gravity only', likelihood: 55, description: 'Right-handed neutrino that mixes weakly with active neutrinos. "Warm" dark matter candidate.', color: '#34d399' },
  { name: 'Primordial Black Holes', mass: '10⁻¹⁶ – 10² M☉', interaction: 'Gravity only', likelihood: 30, description: 'Formed during early universe density fluctuations. LIGO detections sparked renewed interest. Constrained by microlensing surveys.', color: '#f9a8d4' },
  { name: 'Fuzzy Dark Matter', mass: '~10⁻²² eV', interaction: 'Gravity only', likelihood: 40, description: 'Ultra-light axion-like particle with de Broglie wavelength ~1 kpc. Quantum effects suppress small-scale structure.', color: '#fde68a' },
]

function DensityCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#03061a'
    ctx.fillRect(0, 0, W, H)

    // Draw dark matter halo
    for (let r = 180; r > 0; r -= 4) {
      const alpha = (1 - r / 180) * 0.15
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(139,92,246,${alpha})`
      ctx.fill()
    }

    // Draw galaxy disk
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, 0.3)
    const diskGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 90)
    diskGrad.addColorStop(0, 'rgba(255,200,100,0.9)')
    diskGrad.addColorStop(0.3, 'rgba(200,160,80,0.6)')
    diskGrad.addColorStop(1, 'rgba(100,80,40,0)')
    ctx.beginPath()
    ctx.arc(0, 0, 90, 0, Math.PI * 2)
    ctx.fillStyle = diskGrad
    ctx.fill()
    ctx.restore()

    // Stars
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = Math.random() * 85
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r * 0.3
      ctx.beginPath()
      ctx.arc(x, y, 0.8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,230,180,0.8)'
      ctx.fill()
    }

    // Labels
    ctx.font = '11px sans-serif'
    ctx.fillStyle = 'rgba(139,92,246,0.9)'
    ctx.fillText('Dark Matter Halo', cx - 55, cy - 100)
    ctx.fillStyle = 'rgba(255,200,100,0.9)'
    ctx.fillText('Baryonic Disk', cx - 40, cy + 5)

    // Arrow showing rotation curve expected vs actual
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Rotation curve: flat (dark matter)', cx + 80, cy - 60)

  }, [])
  return <canvas ref={ref} width={500} height={260} className="w-full rounded-lg" />
}

type Tab = 'detectors' | 'evidence' | 'candidates'

export default function DarkMatterDetectors() {
  const [tab, setTab] = useState<Tab>('detectors')
  const [selected, setSelected] = useState<Detector>(detectors[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'detectors', label: 'Detectors' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'candidates', label: 'Candidates' },
  ]

  const statusColor = { operating: 'text-green-400 bg-green-900/30', planned: 'text-yellow-400 bg-yellow-900/30', completed: 'text-gray-400 bg-gray-800' }
  const typeColor = { direct: 'text-blue-400', indirect: 'text-purple-400', collider: 'text-orange-400' }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Dark Matter Detectors</h2>
      <p className="text-gray-400 text-sm mb-5">Hunting the invisible — experiments searching for the universe's missing 27%</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'detectors' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {detectors.map(d => (
              <button key={d.name} onClick={() => setSelected(d)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === d.name ? 'bg-purple-900/40 border border-purple-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white text-sm truncate">{d.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${statusColor[d.status]}`}>{d.status}</span>
                </div>
                <div className={`text-xs capitalize ${typeColor[d.type]}`}>{d.type} detection</div>
                <div className="text-gray-500 text-xs mt-0.5 truncate">{d.location}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-gray-800/60 rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <p className="text-gray-400 text-sm">{selected.institution}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusColor[selected.status]}`}>{selected.status}</span>
            </div>
            <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Detection Method', value: `${selected.type} detection` },
                { label: 'Location', value: selected.location },
                { label: 'Depth', value: selected.depth > 0 ? `${selected.depth.toLocaleString()} m underground` : 'Surface / orbit' },
                { label: 'Target Material', value: selected.target },
                { label: 'Active Mass', value: selected.mass > 0 ? `${selected.mass} ${selected.massUnit}` : 'N/A' },
                { label: 'Sensitivity', value: selected.sensitivity },
              ].map(item => (
                <div key={item.label} className="bg-gray-900/50 rounded p-2">
                  <div className="text-gray-500 text-xs">{item.label}</div>
                  <div className="text-white text-sm font-medium mt-1 capitalize">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-6">
          <DensityCanvas />
          <div className="space-y-4">
            {evidence.map(e => (
              <div key={e.title} className="bg-gray-800/60 rounded-lg p-4 flex gap-4">
                <div className="text-3xl flex-shrink-0">{e.icon}</div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-white font-semibold">{e.title}</h4>
                    <span className="text-xs text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">{e.scale}</span>
                  </div>
                  <p className="text-gray-400 text-sm">{e.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'candidates' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-purple-900/20 rounded-lg p-4 border border-purple-800/40">
            Dark matter must be non-baryonic, cold (non-relativistic at decoupling), collision-less, and interact only via gravity and possibly weak force. Despite decades of searching, no confirmed detection exists — the hunt continues with increasingly sensitive experiments.
          </p>
          {candidates.map(c => (
            <div key={c.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-white font-bold">{c.name}</h4>
                  <div className="text-gray-400 text-xs mt-0.5">Mass: {c.mass} | Interaction: {c.interaction}</div>
                </div>
                <div className="text-sm font-semibold" style={{ color: c.color }}>{c.likelihood}%</div>
              </div>
              <p className="text-gray-400 text-sm mb-3">{c.description}</p>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Detection likelihood / community interest</span>
                  <span>{c.likelihood}%</span>
                </div>
                <div className="bg-gray-700 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${c.likelihood}%`, backgroundColor: c.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
