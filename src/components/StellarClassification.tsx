import { useState } from 'react'

interface StarClass {
  type: string
  color: string
  cssColor: string
  tempRange: string
  tempMin: number
  tempMax: number
  massRange: string
  luminosityRange: string
  lifetime: string
  fraction: string
  examples: string[]
  characteristics: string[]
  endState: string
  canHaveLife: boolean
  lifeNote: string
  mnemonic: string
  spectrumLines: string
  realityCheck: string
}

const STAR_CLASSES: StarClass[] = [
  {
    type: 'O',
    color: '#9BB0FF',
    cssColor: '#9BB0FF',
    tempRange: '>30,000 K',
    tempMin: 30000,
    tempMax: 100000,
    massRange: '16–150+ M☉',
    luminosityRange: '30,000–1,000,000 L☉',
    lifetime: '1–10 million years',
    fraction: '0.00003%',
    examples: ['Mintaka (δ Ori)', 'Naos (ζ Pup)', 'Zeta Orionis', '10 Lacertae'],
    characteristics: [
      'Ionized helium absorption lines in spectrum',
      'Extremely hot blue-white light — emit enormous UV radiation',
      'Intense stellar winds losing mass at 10⁻⁶ M☉/year',
      'Bright enough to be visible across galaxies',
      'Often found in OB associations (young star clusters)',
    ],
    endState: 'Type II supernova → black hole or neutron star (>25 M☉ → black hole)',
    canHaveLife: false,
    lifeNote: 'Lifespan too short (< 10 Myr) — planets don\'t fully form before the star explodes. Intense UV radiation would strip planetary atmospheres.',
    mnemonic: 'Oh',
    spectrumLines: 'He II, He I, H Balmer (weak), N III, C III, Si IV',
    realityCheck: 'O-type stars are so rare and luminous that a single one can outshine entire star clusters. The Pistol Star may emit 1.7 million times the Sun\'s luminosity in its bolometric output.'
  },
  {
    type: 'B',
    color: '#AABFFF',
    cssColor: '#AABFFF',
    tempRange: '10,000–30,000 K',
    tempMin: 10000,
    tempMax: 30000,
    massRange: '2–16 M☉',
    luminosityRange: '25–30,000 L☉',
    lifetime: '10–400 million years',
    fraction: '0.13%',
    examples: ['Rigel (β Ori)', 'Regulus (α Leo)', 'Spica (α Vir)', 'Achernar'],
    characteristics: [
      'Neutral helium absorption lines dominate',
      'Strong hydrogen lines emerging',
      'Blue-white appearance, extremely luminous',
      'Many are rapid rotators (Be stars — Be stars rotate so fast they eject an equatorial disk)',
      'Produce copious ultraviolet radiation',
    ],
    endState: 'Type II supernova → neutron star (for higher masses) or white dwarf (lower B-types)',
    canHaveLife: false,
    lifeNote: 'Short lifetimes and strong UV radiation make complex life development unlikely. Rigel is only ~8 million years old — not enough time for complex life to evolve.',
    mnemonic: 'Be',
    spectrumLines: 'He I (strong), H Balmer (growing), Mg II, Si II/III',
    realityCheck: 'Rigel, the bottom-right star of Orion, is a B8 supergiant 120,000× more luminous than the Sun. Yet it\'s only ~8 million years old. When it eventually explodes, it will briefly outshine the full Moon.'
  },
  {
    type: 'A',
    color: '#CAD7FF',
    cssColor: '#CAD7FF',
    tempRange: '7,500–10,000 K',
    tempMin: 7500,
    tempMax: 10000,
    massRange: '1.5–2.5 M☉',
    luminosityRange: '5–25 L☉',
    lifetime: '1–3 billion years',
    fraction: '0.6%',
    examples: ['Sirius (α CMa)', 'Vega (α Lyr)', 'Altair (α Aql)', 'Fomalhaut'],
    characteristics: [
      'Strongest hydrogen (Balmer) absorption lines of any class',
      'White to blue-white appearance',
      'Some show metallic lines (Am stars — metals settled or risen by radiation)',
      'Many have prominent debris disks — Vega\'s disk was the first discovered',
      'Sirius, the brightest star in the night sky, is an A1 white star',
    ],
    endState: 'White dwarf (no supernova) — slowly cools over billions of years',
    canHaveLife: false,
    lifeNote: 'Lifetimes of 1–3 billion years may be long enough for life to start, but evolution to intelligence on Earth took ~3.8 billion years. Strong UV output also a challenge.',
    mnemonic: 'A',
    spectrumLines: 'H Balmer (maximum strength), Ca II (growing), metallic lines in Am stars',
    realityCheck: 'Sirius is only 8.6 light-years away — our closest stellar neighbor visible to the naked eye in the northern hemisphere. It\'s 25× more luminous than the Sun. Sirius B (its white dwarf companion) is a teaspoon-of-matter = 1-ton object compressed into Earth\'s size.'
  },
  {
    type: 'F',
    color: '#F8F7FF',
    cssColor: '#F8F7FF',
    tempRange: '6,000–7,500 K',
    tempMin: 6000,
    tempMax: 7500,
    massRange: '1.04–1.5 M☉',
    luminosityRange: '1.5–5 L☉',
    lifetime: '2–7 billion years',
    fraction: '3%',
    examples: ['Procyon (α CMi)', 'Canopus (α Car)', 'Polaris (α UMi, North Star)', 'Eta Cassiopeiae A'],
    characteristics: [
      'Yellow-white appearance — transition between the hot blue stars and cooler orange/red',
      'Weaker Balmer lines, strengthening calcium lines',
      'More metal-line absorption than A and B types',
      'Habitable zones similar to Sun\'s but somewhat wider',
      'Long enough lifetimes for complex life (maybe)',
    ],
    endState: 'White dwarf after red giant phase',
    canHaveLife: true,
    lifeNote: 'Promising for life — long enough lifetimes (~5 Gyr), reasonably stable UV. Eta Cassiopeiae A is an F9 star with at least one known planetary candidate. However, the habitable zone lies closer to the star than Earth\'s, and UV flux is still somewhat elevated.',
    mnemonic: 'Fine',
    spectrumLines: 'Ca II (strengthening), H Balmer (weakening), many metallic lines',
    realityCheck: 'Polaris (the North Star) is an F7 supergiant Cepheid variable — it pulsates every 3.97 days. Canopus, the second brightest star in the sky, is an F0 supergiant 310 light-years away and ~10,000× more luminous than the Sun.'
  },
  {
    type: 'G',
    color: '#FFF4EA',
    cssColor: '#FFF4EA',
    tempRange: '5,200–6,000 K',
    tempMin: 5200,
    tempMax: 6000,
    massRange: '0.8–1.04 M☉',
    luminosityRange: '0.6–1.5 L☉',
    lifetime: '7–15 billion years',
    fraction: '7.6%',
    examples: ['The Sun (G2V)', 'Alpha Centauri A (G2V)', 'Tau Ceti (G8V)', '51 Pegasi (G2IV)'],
    characteristics: [
      'Yellow to yellow-white color (though our eyes see the Sun as white in space)',
      'Balanced UV output — warm but not destructive',
      'Strong Ca II H and K lines, many metallic lines',
      'Typical total lifetimes of 10+ billion years — ample for life',
      'Long period of relative stability on the main sequence',
    ],
    endState: 'Red giant (in ~5 billion years for the Sun) → white dwarf',
    canHaveLife: true,
    lifeNote: 'The best-known example of life-hosting stars. The Sun is G2V — the V means main-sequence dwarf. Alpha Centauri A (our nearest neighbor) is G2V. Tau Ceti is a G8 star with 5 candidate planets including two in its habitable zone.',
    mnemonic: 'Good',
    spectrumLines: 'Ca II (strong), Fe, Mg, Na, many neutral metal lines, CN molecular bands (cooler G)',
    realityCheck: 'G stars are the "Goldilocks" of stellar classes — not too hot, not too cold. But they\'re only 7.6% of stars. If Earth biology is any guide, the ~16 billion G-star planetary systems in the Milky Way are each a candidate for life.'
  },
  {
    type: 'K',
    color: '#FFD2A1',
    cssColor: '#FFD2A1',
    tempRange: '3,700–5,200 K',
    tempMin: 3700,
    tempMax: 5200,
    massRange: '0.45–0.8 M☉',
    luminosityRange: '0.08–0.6 L☉',
    lifetime: '15–50 billion years',
    fraction: '12%',
    examples: ['Epsilon Eridani (K2V)', 'Alpha Centauri B (K1V)', '61 Cygni A (K5V)', 'Arcturus (K1.5III)'],
    characteristics: [
      'Orange color — cooler and dimmer than the Sun',
      'Strong TiO molecular bands starting to appear in cooler K stars',
      'Very long lifetimes — billions of years longer than the universe\'s current age',
      'Less UV radiation — potentially gentler for life',
      'Habitable zones closer to the star but still tidal-lock-free at moderate distances',
    ],
    endState: 'White dwarf after red giant phase (very extended main sequence lifetime)',
    canHaveLife: true,
    lifeNote: 'Increasingly seen as the best bet for life. Long lifetimes, low UV. Epsilon Eridani (10.5 ly, K2V) has a debris disk and suspected planets — one of SETI\'s top targets. K-stars may be the "sweet spot" — stable, long-lived, moderate UV. Some astrobiologists call them the "superhabitable stars."',
    mnemonic: 'Keeps',
    spectrumLines: 'Ca II (very strong), many metals, TiO (in late K), CH G-band',
    realityCheck: 'Arcturus, the brightest star in the northern hemisphere\'s night sky, is a K1.5 red giant — our Sun\'s eventual fate in ~5 billion years. It\'s 170× more luminous than the Sun. Its orange color is clearly visible to the naked eye.'
  },
  {
    type: 'M',
    color: '#FFB56C',
    cssColor: '#FFB56C',
    tempRange: '2,400–3,700 K',
    tempMin: 2400,
    tempMax: 3700,
    massRange: '0.08–0.45 M☉',
    luminosityRange: '0.0001–0.08 L☉',
    lifetime: '1–10 trillion years (red dwarfs)',
    fraction: '76%',
    examples: ['Proxima Centauri (M5Ve)', 'Barnard\'s Star (M4V)', 'TRAPPIST-1 (M8V)', 'Gliese 667C (M1.5V)'],
    characteristics: [
      'Red-orange color, very cool and dim',
      'Strong TiO and VO molecular bands across the spectrum',
      'Most common star type — 3 out of 4 stars are M-type',
      'Longest-lived stars in the universe — will outlast all others',
      'TRAPPIST-1 has 7 rocky planets, 3 in the habitable zone',
    ],
    endState: 'Red dwarfs fade slowly over trillions of years — no red giant phase. They eventually become white dwarfs (or "black dwarfs" after trillions more years). None have died yet — the universe isn\'t old enough.',
    canHaveLife: true,
    lifeNote: 'Controversial for life. Habitable zones are very close — most planets may be tidally locked (one side always facing the star). M stars produce frequent flares that could sterilize atmospheres. But TRAPPIST-1 system shows they can have rocky planets at the right distance. With such long lifetimes, complex life would have trillions of years to develop if the flaring isn\'t too severe.',
    mnemonic: 'Me',
    spectrumLines: 'TiO, VO, CaH molecular bands (dominant), Ca II (weaker), H-alpha emission in active stars',
    realityCheck: 'TRAPPIST-1, 39 light-years away, is barely larger than Jupiter. Its 7 planets orbit closer than Mercury orbits the Sun. Yet 3 are in its habitable zone because TRAPPIST-1 is so dim. This red dwarf will keep burning for ~10 trillion years — 700× longer than the universe has existed.'
  },
]

const MNEMONIC = 'Oh Be A Fine Girl/Guy, Kiss Me'

export default function StellarClassification() {
  const [selected, setSelected] = useState<StarClass>(STAR_CLASSES[4])
  const [showMnemonic, setShowMnemonic] = useState(false)

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Stellar Classification (OBAFGKM)</h2>
      <p className="text-gray-400 text-sm mb-5">Every star in the universe belongs to one of seven spectral classes — from ultra-hot blue O giants to cool red M dwarfs. Explore what makes each unique.</p>

      {/* Spectral bar */}
      <div className="mb-5">
        <div className="flex rounded-xl overflow-hidden h-10 mb-2">
          {STAR_CLASSES.map(sc => (
            <button
              key={sc.type}
              onClick={() => setSelected(sc)}
              className="flex-1 flex items-center justify-center font-black text-sm transition-all relative"
              style={{
                background: sc.cssColor,
                color: ['O','B','A'].includes(sc.type) ? '#1e293b' : ['F'].includes(sc.type) ? '#374151' : '#111827',
                outline: selected.type === sc.type ? '3px solid white' : 'none',
                outlineOffset: selected.type === sc.type ? '-2px' : '0',
                zIndex: selected.type === sc.type ? 10 : 1,
              }}
            >
              {sc.type}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-gray-600 text-xs px-1">
          <span>← Hotter</span>
          <span>Cooler →</span>
        </div>
      </div>

      {/* Mnemonic */}
      <div className="mb-5">
        <button
          onClick={() => setShowMnemonic(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
        >
          💡 {showMnemonic ? 'Hide' : 'Show'} Mnemonic
        </button>
        {showMnemonic && (
          <div className="mt-2 bg-indigo-900/20 rounded-xl p-3 border border-indigo-800/30">
            <div className="text-gray-400 text-xs mb-1">How astronomers remember the sequence:</div>
            <div className="text-white font-semibold text-sm">"{MNEMONIC}"</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {STAR_CLASSES.map((sc, i) => (
                <span key={sc.type} className="font-bold text-sm px-2 py-0.5 rounded" style={{ background: sc.cssColor + '30', color: sc.cssColor }}>
                  <span style={{ color: sc.cssColor }}>{sc.type}</span>
                  <span className="text-gray-500 font-normal text-xs"> = {MNEMONIC.split(' ')[i]}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Class selector */}
        <div className="space-y-2">
          {STAR_CLASSES.map(sc => (
            <button
              key={sc.type}
              onClick={() => setSelected(sc)}
              className="w-full text-left p-3 rounded-xl transition-all"
              style={{
                background: selected.type === sc.type ? sc.cssColor + '15' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${selected.type === sc.type ? sc.cssColor + '55' : 'rgba(255,255,255,0.04)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0"
                  style={{ background: sc.cssColor, color: '#111827' }}>
                  {sc.type}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm" style={{ color: selected.type === sc.type ? sc.cssColor : '#e2e8f0' }}>
                    Class {sc.type}
                  </div>
                  <div className="text-gray-500 text-xs">{sc.tempRange} • {sc.fraction} of stars</div>
                </div>
                {sc.canHaveLife && (
                  <span className="text-emerald-400 text-xs">🌱</span>
                )}
              </div>
            </button>
          ))}
          <div className="text-gray-600 text-xs text-center pt-1">🌱 = Potentially habitable</div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="rounded-xl p-4" style={{ background: selected.cssColor + '10', border: `1px solid ${selected.cssColor}35` }}>
            <div className="flex items-center gap-4 mb-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center font-black text-4xl flex-shrink-0"
                style={{ background: selected.cssColor, color: '#111827', boxShadow: `0 0 30px ${selected.cssColor}60` }}>
                {selected.type}
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">Class {selected.type}</h3>
                <div className="text-sm" style={{ color: selected.cssColor }}>"{selected.mnemonic}" • {selected.tempRange}</div>
                <div className="text-gray-400 text-xs">{selected.fraction} of all stars in the Milky Way</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                { label: 'Temperature', value: selected.tempRange },
                { label: 'Mass', value: selected.massRange },
                { label: 'Luminosity', value: selected.luminosityRange },
                { label: 'Lifespan', value: selected.lifetime },
              ].map(s => (
                <div key={s.label} className="bg-black/20 rounded-lg p-2">
                  <div className="text-gray-500 text-xs">{s.label}</div>
                  <div className="font-semibold text-xs" style={{ color: selected.cssColor }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Characteristics */}
          <div className="bg-gray-800/60 rounded-xl p-4">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Key Characteristics</div>
            <div className="space-y-1.5">
              {selected.characteristics.map((c, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span style={{ color: selected.cssColor }}>▸</span>
                  <span className="text-gray-300">{c}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Examples + spectrum */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Famous Examples</div>
              <div className="space-y-1">
                {selected.examples.map(e => (
                  <div key={e} className="flex gap-2 text-xs">
                    <span style={{ color: selected.cssColor }}>★</span>
                    <span className="text-gray-300">{e}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-3">
              <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Spectral Lines</div>
              <p className="text-gray-400 text-xs font-mono leading-relaxed">{selected.spectrumLines}</p>
              <div className="mt-2 text-gray-400 text-xs uppercase font-semibold">End State</div>
              <p className="text-gray-300 text-xs mt-1 leading-relaxed">{selected.endState}</p>
            </div>
          </div>

          {/* Life potential */}
          <div className="rounded-xl p-4" style={{
            background: selected.canHaveLife ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${selected.canHaveLife ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
          }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: selected.canHaveLife ? '#86efac' : '#fca5a5' }}>
              {selected.canHaveLife ? '🌱 Astrobiological Potential' : '☠️ Challenging for Life'}
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{selected.lifeNote}</p>
          </div>

          {/* Reality check */}
          <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
            <div className="text-gray-400 text-xs uppercase font-semibold mb-2">Reality Check</div>
            <p className="text-gray-400 text-sm leading-relaxed">{selected.realityCheck}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
