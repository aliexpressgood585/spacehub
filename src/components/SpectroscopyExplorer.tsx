import { useState, useRef, useEffect } from 'react'

interface SpectralLine {
  wavelengthNm: number
  element: string
  type: 'emission' | 'absorption'
  color: string
  transitionName: string
}

interface StarClass {
  class: string
  tempRange: string
  tempK: number
  color: string
  colorHex: string
  massRange: string
  radiusRange: string
  luminosityRange: string
  lifetime: string
  abundance: string
  examples: string[]
  description: string
}

const SPECTRAL_LINES: SpectralLine[] = [
  { wavelengthNm: 393, element: 'Ca II', type: 'absorption', color: '#6000B0', transitionName: 'Ca II K' },
  { wavelengthNm: 397, element: 'Ca II', type: 'absorption', color: '#5500C8', transitionName: 'Ca II H' },
  { wavelengthNm: 410, element: 'H', type: 'absorption', color: '#4040E0', transitionName: 'Hδ (delta)' },
  { wavelengthNm: 434, element: 'H', type: 'absorption', color: '#3060FF', transitionName: 'Hγ (gamma)' },
  { wavelengthNm: 486, element: 'H', type: 'absorption', color: '#00AAFF', transitionName: 'Hβ (beta)' },
  { wavelengthNm: 517, element: 'Mg', type: 'absorption', color: '#00CC60', transitionName: 'Mg b triplet' },
  { wavelengthNm: 589, element: 'Na', type: 'absorption', color: '#FFD000', transitionName: 'Na D doublet' },
  { wavelengthNm: 630, element: 'O', type: 'emission', color: '#FF8800', transitionName: '[O I] forbidden' },
  { wavelengthNm: 656, element: 'H', type: 'absorption', color: '#FF2020', transitionName: 'Hα (alpha)' },
  { wavelengthNm: 686, element: 'O₂', type: 'absorption', color: '#CC0000', transitionName: 'O₂ telluric A-band' },
  { wavelengthNm: 759, element: 'O₂', type: 'absorption', color: '#990000', transitionName: 'O₂ telluric B-band' },
]

const STAR_CLASSES: StarClass[] = [
  {
    class: 'O', tempRange: '>30,000 K', tempK: 40000, color: 'Blue', colorHex: '#9BB0FF',
    massRange: '16–150 M☉', radiusRange: '6.6–100 R☉', luminosityRange: '30,000–1M L☉',
    lifetime: '1–10 million years', abundance: '0.00003%',
    examples: ['Mintaka (δ Ori)', 'Naos (ζ Pup)', 'Zeta Puppis'],
    description: 'Hottest, most massive, shortest-lived stars. Ionize surrounding hydrogen (HII regions). Die as Wolf-Rayet stars then supernovae. So rare that only ~20,000 exist in the Milky Way.',
  },
  {
    class: 'B', tempRange: '10,000–30,000 K', tempK: 20000, color: 'Blue-white', colorHex: '#AAB8FF',
    massRange: '2–16 M☉', radiusRange: '1.8–6.6 R☉', luminosityRange: '25–30,000 L☉',
    lifetime: '10–100 million years', abundance: '0.1%',
    examples: ['Rigel (β Ori)', 'Spica (α Vir)', 'Regulus'],
    description: 'Hot blue-white stars that emit intense UV. Include many of the brightest stars visible to the naked eye. Helium absorption lines visible. The Pleiades cluster is B-type stars.',
  },
  {
    class: 'A', tempRange: '7,500–10,000 K', tempK: 8500, color: 'White', colorHex: '#CAD7FF',
    massRange: '1.4–2.1 M☉', radiusRange: '1.4–1.8 R☉', luminosityRange: '5–25 L☉',
    lifetime: '1–2 billion years', abundance: '0.6%',
    examples: ['Sirius (α CMa)', 'Vega (α Lyr)', 'Deneb (α Cyg)'],
    description: 'White or blue-white with strong hydrogen Balmer absorption. Sirius is the brightest star in our sky. Vega was the reference point for magnitude 0. Fomalhaut has a prominent debris disk.',
  },
  {
    class: 'F', tempRange: '6,000–7,500 K', tempK: 6750, color: 'Yellow-white', colorHex: '#F8F7FF',
    massRange: '1.04–1.4 M☉', radiusRange: '1.15–1.4 R☉', luminosityRange: '1.5–5 L☉',
    lifetime: '2–4 billion years', abundance: '3%',
    examples: ['Procyon (α CMi)', 'Polaris (α UMi)', 'Canopus (α Car)'],
    description: 'Yellow-white stars with calcium K line starting to appear. Include many stars with known planets. Canopus is the second-brightest star in the sky. Procyon will become a red giant in about 1.7 billion years.',
  },
  {
    class: 'G', tempRange: '5,200–6,000 K', tempK: 5600, color: 'Yellow', colorHex: '#FFF4EA',
    massRange: '0.8–1.04 M☉', radiusRange: '0.96–1.15 R☉', luminosityRange: '0.6–1.5 L☉',
    lifetime: '4–10 billion years', abundance: '7.6%',
    examples: ['The Sun (G2V)', 'Alpha Centauri A', 'Tau Ceti'],
    description: 'The Sun is a G-type star. Yellow with strong calcium H&K absorption. The "habitable zone" around G stars is well-studied. Most long-lived of the giant-forming main-sequence stars. The Sun will leave the main sequence in ~5 billion years.',
  },
  {
    class: 'K', tempRange: '3,700–5,200 K', tempK: 4400, color: 'Orange', colorHex: '#FFD2A1',
    massRange: '0.45–0.8 M☉', radiusRange: '0.7–0.96 R☉', luminosityRange: '0.08–0.6 L☉',
    lifetime: '10–30 billion years', abundance: '12.1%',
    examples: ['Arcturus (α Boo)', 'Aldebaran (α Tau)', 'Epsilon Eridani'],
    description: 'Orange stars favored for habitability studies — stable, long-lived, emit less UV than G stars. Epsilon Eridani and Tau Ceti are nearby K-stars targeted by SETI. The "Galactic Habitable Zone" concept was developed partly around K-stars.',
  },
  {
    class: 'M', tempRange: '2,400–3,700 K', tempK: 3000, color: 'Red', colorHex: '#FFB570',
    massRange: '0.08–0.45 M☉', radiusRange: '0.1–0.7 R☉', luminosityRange: '0.0001–0.08 L☉',
    lifetime: '45 billion – 10 trillion years', abundance: '76.5%',
    examples: ['Proxima Centauri', 'Barnard\'s Star', 'Betelgeuse (M red supergiant)'],
    description: 'Most common star type — 3 of every 4 stars are M dwarfs. Very dim individually but hugely outnumber all others. Extremely long-lived — some M dwarfs will still be burning hydrogen when the universe is 1000× its current age. Proxima Centauri b (nearest exoplanet) orbits an M star.',
  },
]

function SpectrumBar({ lines }: { lines: SpectralLine[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height

    // Draw visible spectrum gradient (380-780nm)
    const grad = ctx.createLinearGradient(0, 0, W, 0)
    const specColors = [
      [0, '#7F00FF'], [0.05, '#6000CC'], [0.1, '#0000FF'],
      [0.2, '#0050FF'], [0.3, '#00AAFF'], [0.4, '#00FF80'],
      [0.5, '#80FF00'], [0.6, '#FFFF00'], [0.7, '#FFB000'],
      [0.8, '#FF6000'], [0.9, '#FF2000'], [1, '#990000']
    ]
    specColors.forEach(([stop, color]) => grad.addColorStop(stop as number, color as string))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Draw absorption/emission lines
    lines.forEach(line => {
      const x = ((line.wavelengthNm - 380) / 400) * W
      if (x < 0 || x > W) return
      if (line.type === 'absorption') {
        ctx.fillStyle = 'rgba(0,0,0,0.85)'
        ctx.fillRect(x - 1, 0, 3, H)
      } else {
        ctx.fillStyle = line.color
        ctx.shadowColor = line.color
        ctx.shadowBlur = 6
        ctx.fillRect(x - 1, 0, 3, H)
        ctx.shadowBlur = 0
      }
    })

    // Wavelength labels
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.textAlign = 'center'
    ;[400, 450, 500, 550, 600, 650, 700, 750].forEach(nm => {
      const x = ((nm - 380) / 400) * W
      ctx.fillText(`${nm}`, x, H - 2)
    })
  }, [lines])

  return <canvas ref={canvasRef} width={700} height={60} className="w-full rounded-lg" />
}

export default function SpectroscopyExplorer() {
  const [selectedClass, setSelectedClass] = useState<StarClass>(STAR_CLASSES[4])
  const [showLines, setShowLines] = useState(true)
  const [selectedLine, setSelectedLine] = useState<SpectralLine | null>(null)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Stellar Spectroscopy</h2>
      <p className="text-slate-400 text-sm mb-5">How astronomers decode starlight to reveal composition, temperature, and motion</p>

      {/* Spectrum display */}
      <div className="bg-slate-900 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-semibold text-sm">Visible Spectrum (380–780 nm)</div>
          <label className="flex items-center gap-2 text-slate-400 text-xs cursor-pointer">
            <input type="checkbox" checked={showLines} onChange={e => setShowLines(e.target.checked)} className="accent-indigo-500" />
            Show spectral lines
          </label>
        </div>
        <SpectrumBar lines={showLines ? SPECTRAL_LINES : []} />
        <div className="text-slate-500 text-xs text-center mt-2">Wavelength (nm) — Dark bands = absorption lines · Bright bands = emission lines</div>
      </div>

      {/* Spectral line legend */}
      {showLines && (
        <div className="mb-5">
          <div className="text-slate-400 text-xs mb-2">Key Spectral Lines — click for details</div>
          <div className="flex flex-wrap gap-2">
            {SPECTRAL_LINES.map((line, i) => (
              <button
                key={i}
                onClick={() => setSelectedLine(selectedLine?.transitionName === line.transitionName ? null : line)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all border ${
                  selectedLine?.transitionName === line.transitionName
                    ? 'border-white bg-slate-700'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                }`}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: line.color }} />
                <span className="text-white">{line.element}</span>
                <span className="text-slate-400">{line.wavelengthNm}nm</span>
                <span className={`text-xs ${line.type === 'absorption' ? 'text-slate-400' : 'text-yellow-400'}`}>
                  {line.type === 'absorption' ? '↓' : '↑'}
                </span>
              </button>
            ))}
          </div>
          {selectedLine && (
            <div className="mt-2 bg-slate-800 rounded-lg p-3 text-sm">
              <span className="text-white font-semibold">{selectedLine.transitionName}</span>
              <span className="text-slate-400 ml-2">({selectedLine.wavelengthNm} nm · {selectedLine.element} · {selectedLine.type})</span>
              <p className="text-slate-300 text-xs mt-1">
                {selectedLine.type === 'absorption'
                  ? `Photons at ${selectedLine.wavelengthNm} nm are absorbed by ${selectedLine.element} atoms in the star's atmosphere, removing electrons to higher energy levels.`
                  : `Electrons in ${selectedLine.element} atoms fall to lower energy levels, emitting photons at exactly ${selectedLine.wavelengthNm} nm.`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* HR Diagram color + class selector */}
      <h3 className="text-white font-semibold mb-3">Spectral Classification (OBAFGKM)</h3>
      <div className="flex gap-1 flex-wrap mb-5">
        {STAR_CLASSES.map(sc => (
          <button
            key={sc.class}
            onClick={() => setSelectedClass(sc)}
            className={`w-10 h-10 rounded-lg font-bold text-lg transition-all flex items-center justify-center border-2 ${
              selectedClass.class === sc.class ? 'border-white scale-110' : 'border-transparent hover:border-slate-500'
            }`}
            style={{ backgroundColor: sc.colorHex + '40', color: sc.colorHex }}
            title={sc.class + ' type: ' + sc.tempRange}
          >
            {sc.class}
          </button>
        ))}
      </div>

      {/* Star class detail */}
      <div className="bg-slate-900 rounded-xl p-5">
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-16 h-16 rounded-full flex-shrink-0 shadow-lg"
            style={{ backgroundColor: selectedClass.colorHex, boxShadow: `0 0 30px ${selectedClass.colorHex}80` }}
          />
          <div>
            <h3 className="text-white font-bold text-xl">Type {selectedClass.class} — {selectedClass.color}</h3>
            <div className="text-slate-400 text-sm">{selectedClass.tempRange}</div>
            <div className="text-slate-500 text-xs">Abundance: {selectedClass.abundance} of all stars</div>
          </div>
        </div>

        <p className="text-slate-300 text-sm leading-relaxed mb-4">{selectedClass.description}</p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Temperature', value: `${selectedClass.tempK.toLocaleString()} K` },
            { label: 'Mass', value: selectedClass.massRange },
            { label: 'Radius', value: selectedClass.radiusRange },
            { label: 'Luminosity', value: selectedClass.luminosityRange },
            { label: 'Main-sequence lifetime', value: selectedClass.lifetime },
            { label: 'Abundance in Milky Way', value: selectedClass.abundance },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-2">
              <div className="text-slate-500 text-xs">{s.label}</div>
              <div className="text-white text-sm font-medium">{s.value}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-slate-500 text-xs mb-2">Famous Examples</div>
          <div className="flex flex-wrap gap-2">
            {selectedClass.examples.map((ex, i) => (
              <span key={i} className="bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded-full">⭐ {ex}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Mnemonic */}
      <div className="mt-4 bg-indigo-900/20 border border-indigo-700/30 rounded-lg p-3 text-sm text-center">
        <span className="text-slate-400">Mnemonic: </span>
        <span className="text-white font-semibold">O</span>
        <span className="text-slate-300">h </span>
        <span className="text-white font-semibold">B</span>
        <span className="text-slate-300">e </span>
        <span className="text-white font-semibold">A</span>
        <span className="text-slate-300"> </span>
        <span className="text-white font-semibold">F</span>
        <span className="text-slate-300">ine </span>
        <span className="text-white font-semibold">G</span>
        <span className="text-slate-300">uy/</span>
        <span className="text-white font-semibold">G</span>
        <span className="text-slate-300">al, </span>
        <span className="text-white font-semibold">K</span>
        <span className="text-slate-300">iss </span>
        <span className="text-white font-semibold">M</span>
        <span className="text-slate-300">e — Temperature decreasing left to right (hottest → coolest)</span>
      </div>
    </div>
  )
}
