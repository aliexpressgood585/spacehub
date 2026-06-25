import { useState, useEffect, useRef } from 'react'

interface Comet {
  name: string
  period: string
  perihelion: string
  aphelion: string
  discovered: string
  nucleus: string
  tailLength: string
  type: 'short' | 'long' | 'hyperbolic' | 'sungrazer'
  lastVisible: string
  nextVisible: string
  description: string
  mission: string
  icon: string
}

interface CometPart {
  name: string
  size: string
  composition: string
  description: string
  color: string
}

interface CometMission {
  name: string
  agency: string
  comet: string
  year: number
  achievement: string
  discovery: string
  status: 'active' | 'completed' | 'planned'
}

const COMETS: Comet[] = [
  {
    name: 'Halley\'s Comet',
    period: '75–76 years',
    perihelion: '0.586 AU',
    aphelion: '35.08 AU (beyond Neptune)',
    discovered: 'Ancient (240 BC records)',
    nucleus: '15 × 8 km, coal-black',
    tailLength: '100 million km',
    type: 'short',
    lastVisible: '1986',
    nextVisible: '2061',
    description: 'The most famous comet. Recorded by Babylonians in 240 BC, Chinese in 87 BC, depicted in the Bayeux Tapestry (1066). Halley deduced it was the same comet returning. ESA\'s Giotto spacecraft flew through its coma in 1986.',
    mission: 'ESA Giotto (1986)',
    icon: '☄️',
  },
  {
    name: 'Comet 67P / Churyumov–Gerasimenko',
    period: '6.44 years',
    perihelion: '1.24 AU',
    aphelion: '5.68 AU',
    discovered: '1969',
    nucleus: '4.3 × 4.1 km, rubber duck shape',
    tailLength: '200,000 km',
    type: 'short',
    lastVisible: '2021',
    nextVisible: '2028',
    description: 'ESA\'s Rosetta mission orbited it for 2 years (2014–2016) and deployed the Philae lander — first ever comet landing. Detected 16 organic molecules including glycine (an amino acid).',
    mission: 'ESA Rosetta + Philae (2014)',
    icon: '🛸',
  },
  {
    name: 'Hale-Bopp',
    period: '~2,530 years',
    perihelion: '0.914 AU',
    aphelion: '370 AU',
    discovered: '1995 (Alan Hale & Thomas Bopp)',
    nucleus: '~60 km',
    tailLength: '400 million km',
    type: 'long',
    lastVisible: '1997',
    nextVisible: '4380 AD',
    description: 'The "Great Comet of 1997" — visible to the naked eye for 18 months. Brightest comet in 40 years. Discovered simultaneously by two amateur astronomers. Had three distinct tails (dust, ion, and sodium).',
    mission: 'No dedicated mission',
    icon: '✨',
  },
  {
    name: '\'Oumuamua',
    period: 'Hyperbolic (interstellar)',
    perihelion: '0.255 AU',
    aphelion: 'Escape trajectory',
    discovered: '2017',
    nucleus: '~400 m long, elongated',
    tailLength: 'None detected',
    type: 'hyperbolic',
    lastVisible: '2017',
    nextVisible: 'Never again',
    description: 'First detected interstellar object. Unusual non-gravitational acceleration without visible outgassing. Harvard\'s Loeb suggested it might be artificial, though most scientists believe it was a nitrogen iceberg fragment or hydrogen comet from another stellar system.',
    mission: 'No mission (too fast to intercept)',
    icon: '🔵',
  },
  {
    name: 'Comet NEOWISE (C/2020 F3)',
    period: '~6,800 years',
    perihelion: '0.295 AU',
    aphelion: '~630 AU',
    discovered: 'March 2020 (WISE telescope)',
    nucleus: '~5 km',
    tailLength: '15 million km',
    type: 'long',
    lastVisible: '2020',
    nextVisible: '8786 AD',
    description: 'Brightest comet visible from Northern Hemisphere since 1997. Visible to naked eye July 2020. First captured by ISS astronauts. Survived its close solar approach nearly intact.',
    mission: 'NEOWISE (discovery spacecraft)',
    icon: '🌠',
  },
  {
    name: 'Lovejoy (C/2014 Q2)',
    period: '~11,500 years',
    perihelion: '1.29 AU',
    aphelion: '~830 AU',
    discovered: '2014',
    nucleus: '~2 km',
    tailLength: 'Millions of km',
    type: 'long',
    lastVisible: '2015',
    nextVisible: '13,500 AD',
    description: 'Surprise naked-eye comet. Scientists detected ethyl alcohol and glycolaldehyde (a simple sugar) — organic molecules relevant to life\'s chemistry. Second brightest naked-eye comet since Hale-Bopp.',
    mission: 'No dedicated mission',
    icon: '💚',
  },
  {
    name: 'Encke\'s Comet',
    period: '3.3 years (shortest known)',
    perihelion: '0.336 AU',
    aphelion: '4.1 AU',
    discovered: '1786',
    nucleus: '4.8 km',
    tailLength: 'Variable',
    type: 'short',
    lastVisible: '2023',
    nextVisible: '2027',
    description: 'Shortest orbital period of any known comet — returns every 3.3 years. Has been observed 65+ times. Source of Taurid meteor shower. Nucleus is abnormally dark — possibly covered in organic crust.',
    mission: 'Various flybys',
    icon: '🔄',
  },
]

const COMET_PARTS: CometPart[] = [
  { name: 'Nucleus', size: '0.1–50 km', composition: 'Ice, dust, organics', description: 'The solid core — "dirty snowball" of water ice, CO₂, ammonia, and complex organics. Extremely dark (albedo 2–4%). Jets of gas erupt from sunlit patches.', color: '#6b7280' },
  { name: 'Coma', size: '100,000–1 million km', composition: 'Water vapor, CO₂, CO, H, OH radicals', description: 'Atmosphere of gas sublimated from the nucleus. Visible green glow from excited diatomic carbon (C₂). Can be larger than the Sun.', color: '#06b6d4' },
  { name: 'Dust Tail', size: 'Up to 100 million km', composition: 'Silicate and organic dust grains', description: 'Pushed by radiation pressure — always curved behind the comet\'s orbit. Yellowish-white, reflecting sunlight. Visible to naked eye in bright comets.', color: '#fcd34d' },
  { name: 'Ion Tail (Plasma tail)', size: 'Up to 500 million km', composition: 'Ionized gas (CO⁺, H₂O⁺)', description: 'Blown straight away from the Sun by solar wind. Always points directly away from Sun, regardless of comet direction. Blue color from CO⁺ fluorescence.', color: '#60a5fa' },
  { name: 'Hydrogen Envelope', size: '10–20 million km', composition: 'Neutral hydrogen atoms', description: 'Vast invisible cloud of hydrogen from water dissociation. Detected in UV. Often larger than the Sun but invisible to the naked eye.', color: '#a78bfa' },
]

const MISSIONS: CometMission[] = [
  { name: 'Giotto', agency: 'ESA', comet: 'Halley (1P)', year: 1986, achievement: 'First close flyby at 596 km', discovery: 'Dark, irregular nucleus; jets of gas', status: 'completed' },
  { name: 'Deep Impact', agency: 'NASA', comet: 'Tempel 1 (9P)', year: 2005, achievement: 'Impacted 370 kg copper mass into comet', discovery: 'Comet softer/fluffier than expected; organics detected', status: 'completed' },
  { name: 'Stardust', agency: 'NASA', comet: 'Wild 2 (81P)', year: 2004, achievement: 'Returned comet samples to Earth (2006)', discovery: 'Glycine (amino acid) found in samples', status: 'completed' },
  { name: 'Rosetta + Philae', agency: 'ESA', comet: '67P / C-G', year: 2014, achievement: 'First orbit + first landing on comet', discovery: '16 organic molecules, glycine, phosphorus; rubber-duck nucleus', status: 'completed' },
  { name: 'CONTOUR', agency: 'NASA', comet: 'Multiple targets', year: 2002, achievement: 'Mission failed — spacecraft lost', discovery: 'No data returned', status: 'completed' },
  { name: 'Comet Interceptor', agency: 'ESA/JAXA', comet: 'TBD (dynamically new comet)', year: 2029, achievement: 'First mission to an unmodified primitive comet', discovery: 'Pending launch', status: 'planned' },
]

function CometSVG() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#020408'
    ctx.fillRect(0, 0, W, H)

    // Stars
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`
      ctx.beginPath()
      ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Sun (off-left)
    const sunGrad = ctx.createRadialGradient(30, H / 2, 0, 30, H / 2, 60)
    sunGrad.addColorStop(0, '#fff8dc')
    sunGrad.addColorStop(0.5, '#ffd700')
    sunGrad.addColorStop(1, 'rgba(255,140,0,0)')
    ctx.fillStyle = sunGrad
    ctx.beginPath()
    ctx.arc(30, H / 2, 60, 0, Math.PI * 2)
    ctx.fill()

    // Comet nucleus
    const nx = W * 0.55, ny = H * 0.5
    ctx.fillStyle = '#4a4a4a'
    ctx.beginPath()
    ctx.ellipse(nx, ny, 14, 10, -0.3, 0, Math.PI * 2)
    ctx.fill()

    // Coma (green glow)
    const comaGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, 80)
    comaGrad.addColorStop(0, 'rgba(120,255,120,0.25)')
    comaGrad.addColorStop(0.5, 'rgba(100,220,100,0.1)')
    comaGrad.addColorStop(1, 'rgba(0,200,0,0)')
    ctx.fillStyle = comaGrad
    ctx.beginPath()
    ctx.arc(nx, ny, 80, 0, Math.PI * 2)
    ctx.fill()

    // Dust tail (curves back)
    const dustGrad = ctx.createLinearGradient(nx, ny, nx + 200, ny - 30)
    dustGrad.addColorStop(0, 'rgba(255,240,180,0.6)')
    dustGrad.addColorStop(1, 'rgba(255,240,180,0)')
    ctx.fillStyle = dustGrad
    ctx.beginPath()
    ctx.moveTo(nx + 10, ny)
    ctx.quadraticCurveTo(nx + 120, ny - 20, nx + 220, ny - 50)
    ctx.quadraticCurveTo(nx + 120, ny + 25, nx + 10, ny + 15)
    ctx.closePath()
    ctx.fill()

    // Ion tail (straight away from sun)
    const ionGrad = ctx.createLinearGradient(nx, ny, nx + 230, ny)
    ionGrad.addColorStop(0, 'rgba(100,160,255,0.5)')
    ionGrad.addColorStop(1, 'rgba(100,160,255,0)')
    ctx.fillStyle = ionGrad
    ctx.beginPath()
    ctx.moveTo(nx + 5, ny - 5)
    ctx.lineTo(nx + 230, ny - 10)
    ctx.lineTo(nx + 230, ny + 10)
    ctx.lineTo(nx + 5, ny + 5)
    ctx.closePath()
    ctx.fill()

    // Labels
    ctx.fillStyle = '#fcd34d'
    ctx.font = '9px sans-serif'
    ctx.fillText('Dust tail', nx + 130, ny - 45)
    ctx.fillStyle = '#60a5fa'
    ctx.fillText('Ion tail → Sun', nx + 130, ny + 18)
    ctx.fillStyle = '#86efac'
    ctx.fillText('Coma', nx + 20, ny - 65)
  }, [])
  return <canvas ref={canvasRef} width={520} height={240} className="w-full rounded-xl" />
}

type TabType = 'comets' | 'structure' | 'missions'

export default function CometExplorer() {
  const [activeTab, setActiveTab] = useState<TabType>('comets')
  const [selected, setSelected] = useState<Comet>(COMETS[0])

  const TYPE_LABELS: Record<string, string> = {
    short: 'Short-period (<200yr)',
    long: 'Long-period (>200yr)',
    hyperbolic: 'Interstellar',
    sungrazer: 'Sungrazer',
  }

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">☄️</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Comet Explorer</h2>
          <p className="text-gray-400 text-sm">Frozen time capsules from the birth of the solar system</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['comets', 'structure', 'missions'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t ? 'bg-cyan-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {t === 'comets' ? 'Famous Comets' : t === 'structure' ? 'Anatomy' : 'Space Missions'}
          </button>
        ))}
      </div>

      {activeTab === 'comets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {COMETS.map(c => (
              <button
                key={c.name}
                onClick={() => setSelected(c)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected.name === c.name
                    ? 'border-cyan-500 bg-cyan-600/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{c.icon}</span>
                  <div>
                    <div className="text-white text-sm font-medium truncate">{c.name}</div>
                    <div className="text-gray-400 text-xs">{TYPE_LABELS[c.type]}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 bg-white/5 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-4xl">{selected.icon}</span>
              <div>
                <h3 className="text-white text-xl font-bold">{selected.name}</h3>
                <p className="text-gray-400 text-sm">{TYPE_LABELS[selected.type]} · Discovered: {selected.discovered}</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Orbital Period', value: selected.period },
                { label: 'Perihelion', value: selected.perihelion },
                { label: 'Nucleus Size', value: selected.nucleus },
                { label: 'Max Tail', value: selected.tailLength },
                { label: 'Last Seen', value: selected.lastVisible },
                { label: 'Next Perihelion', value: selected.nextVisible },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{s.label}</div>
                  <div className="text-white text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>
            {selected.mission !== 'No dedicated mission' && (
              <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-3">
                <div className="text-cyan-400 text-xs mb-1">Space Mission</div>
                <div className="text-gray-200 text-sm">{selected.mission}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'structure' && (
        <div className="space-y-4">
          <CometSVG />
          <div className="space-y-3">
            {COMET_PARTS.map(part => (
              <div key={part.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-4 h-4 rounded-full" style={{ background: part.color }} />
                  <div>
                    <span className="text-white font-bold">{part.name}</span>
                    <span className="text-gray-400 text-xs ml-3">{part.size}</span>
                  </div>
                </div>
                <div className="text-blue-400 text-xs mb-1">Composition: {part.composition}</div>
                <p className="text-gray-300 text-sm">{part.description}</p>
              </div>
            ))}
          </div>
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
            <div className="text-yellow-300 font-bold mb-2">Why Comets Matter for Life</div>
            <p className="text-gray-300 text-sm">
              Comets contain complex organic molecules — glycine (an amino acid), ethanol, sugars, and phosphorus — the very building blocks of life. The Late Heavy Bombardment (~4.1 Gya) may have delivered comet material to early Earth, providing key ingredients. Studying comets is studying the chemistry of life's origin.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'missions' && (
        <div className="space-y-4">
          {MISSIONS.map((m, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-white font-bold text-lg">{m.name}</div>
                  <div className="text-gray-400 text-xs">{m.agency} · {m.comet} · {m.year}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                  m.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  m.status === 'planned' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>{m.status}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">Achievement</div>
                  <div className="text-white text-sm">{m.achievement}</div>
                </div>
                <div className="bg-cyan-900/20 rounded-lg p-3">
                  <div className="text-cyan-400 text-xs mb-1">Key Discovery</div>
                  <div className="text-gray-200 text-sm">{m.discovery}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        {[
          { label: 'Known Comets', value: '4,000+', desc: 'catalogued; millions estimated in Oort Cloud' },
          { label: 'Rosetta Landing', value: '2014', desc: 'First comet landing (Philae)' },
          { label: 'Oort Cloud Extent', value: '100,000 AU', desc: '2 light-years from Sun' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-cyan-400 font-bold text-lg">{s.value}</div>
            <div className="text-gray-400 text-xs">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
