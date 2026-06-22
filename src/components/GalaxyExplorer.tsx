import { useState } from 'react'

const GALAXIES = [
  {
    id: 'milkyway', name: 'Milky Way', type: 'Spiral (SBbc)', emoji: '🌌',
    diameter: 100000, stars: 400e9, distance: 0, age: 13.6,
    mass: 1.5e12, color: '#818cf8',
    description: 'Our home galaxy. Contains 400 billion stars, 8 known spiral arms, and a supermassive black hole (Sagittarius A*) at its center with 4 million solar masses.',
    blackHole: 'Sagittarius A* — 4 million solar masses',
  },
  {
    id: 'andromeda', name: 'Andromeda (M31)', type: 'Spiral (SA)', emoji: '🔭',
    diameter: 220000, stars: 1000e9, distance: 2.537e6, age: 10,
    mass: 1.5e12, color: '#60a5fa',
    description: 'The closest large galaxy to us. Approaching at 110 km/s — it will collide with the Milky Way in ~4.5 billion years to form "Milkdromeda".',
    blackHole: 'M31* — 100–200 million solar masses',
  },
  {
    id: 'triangulum', name: 'Triangulum (M33)', type: 'Spiral (SA)', emoji: '🌀',
    diameter: 60000, stars: 40e9, distance: 2.73e6, age: 10,
    mass: 5e10, color: '#34d399',
    description: 'Third-largest in the Local Group. One of the most distant objects visible to the naked eye on a clear night.',
    blackHole: 'No confirmed central SMBH',
  },
  {
    id: 'ic1101', name: 'IC 1101', type: 'Elliptical (cD)', emoji: '🟡',
    diameter: 6000000, stars: 100e12, distance: 1.045e9, age: 12,
    mass: 100e12, color: '#f59e0b',
    description: 'The largest known galaxy in the observable universe — 6 MILLION light-years across, 100 trillion stars. Its central black hole may have up to 40 billion solar masses.',
    blackHole: 'Estimated 40 billion solar masses',
  },
  {
    id: 'magellanic', name: 'Large Magellanic Cloud', type: 'Irregular (Irr)', emoji: '✨',
    diameter: 14000, stars: 30e9, distance: 163000, age: 13.5,
    mass: 1e10, color: '#f472b6',
    description: 'A satellite galaxy of the Milky Way, visible from the southern hemisphere. Contains the Tarantula Nebula, one of the most active star-forming regions known.',
    blackHole: 'No confirmed SMBH',
  },
  {
    id: 'ton618', name: 'TON 618 host galaxy', type: 'Quasar host', emoji: '⚫',
    diameter: 500000, stars: 1000e9, distance: 10.4e9, age: 3.4,
    mass: 10e12, color: '#a78bfa',
    description: 'Hosts one of the most massive known black holes in the universe. 66 BILLION solar masses — so large that our entire solar system would fit inside the event horizon 11 times over.',
    blackHole: 'TON 618 — 66 billion solar masses (one of largest known)',
  },
]

const BLANETS_INFO = {
  title: 'Blanets — Planets Around Black Holes',
  description: 'A "blanet" (black hole planet) is a theoretical planet orbiting a supermassive black hole instead of a star. A 2019 paper by Wada et al. showed that planets could form in the massive dust disk surrounding black holes.',
  examples: [
    { name: 'TON 618 blanet (theoretical)', size: '3,000× Jupiter', context: 'Around a 66B solar mass black hole', note: 'So massive it dwarfs any planet in our galaxy' },
    { name: 'Sagittarius A* blanet', size: 'Up to 100× Jupiter', context: 'Our own galactic center black hole', note: 'Radiation environment would be extreme' },
  ],
  facts: [
    'Blanets could be 3,000× more massive than Jupiter',
    'They orbit at >100 AU from the black hole to avoid tidal disruption',
    'Some could have "warmth" from the accretion disk rather than a star',
    'The concept was formally proposed in 2019 by Japanese astrophysicists',
  ],
}

function formatStars(n: number) {
  if (n >= 1e12) return `${(n/1e12).toFixed(0)} trillion`
  if (n >= 1e9) return `${(n/1e9).toFixed(0)} billion`
  return n.toLocaleString()
}

function formatDist(ly: number) {
  if (ly === 0) return 'Home!'
  if (ly < 1000) return `${Math.round(ly).toLocaleString()} ly`
  if (ly < 1e6) return `${(ly/1000).toFixed(1)}K ly`
  if (ly < 1e9) return `${(ly/1e6).toFixed(2)}M ly`
  return `${(ly/1e9).toFixed(2)}B ly`
}

export default function GalaxyExplorer() {
  const [selId, setSelId] = useState('milkyway')
  const [showBlanets, setShowBlanets] = useState(false)

  const g = GALAXIES.find(x => x.id === selId)!
  const maxDiam = 6000000

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box">🌌</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Galaxy Explorer</h3>
          <p className="text-gray-500 text-xs">Size, mass & black holes of the universe's galaxies</p>
        </div>
        <button
          onClick={() => setShowBlanets(!showBlanets)}
          className="text-[10px] px-2.5 py-1 rounded-full font-bold transition-all"
          style={showBlanets
            ? { background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.5)', color: '#a78bfa' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }}
        >
          ⚫ Blanets
        </button>
      </div>

      {!showBlanets ? (
        <>
          {/* Galaxy selector */}
          <div className="flex flex-wrap gap-2 mb-5">
            {GALAXIES.map(gal => (
              <button
                key={gal.id}
                onClick={() => setSelId(gal.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={selId === gal.id
                  ? { background: `${gal.color}20`, border: `1px solid ${gal.color}50`, color: gal.color }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
              >
                {gal.emoji} {gal.name}
              </button>
            ))}
          </div>

          {/* Selected galaxy */}
          <div className="rounded-2xl p-5 mb-4" style={{ background: `${g.color}08`, border: `1px solid ${g.color}30` }}>
            <div className="flex items-start gap-4 mb-4">
              <div className="text-4xl">{g.emoji}</div>
              <div className="flex-1">
                <h4 className="text-white font-black text-lg">{g.name}</h4>
                <p className="text-xs font-semibold" style={{ color: g.color }}>{g.type}</p>
                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{g.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Diameter', val: `${g.diameter.toLocaleString()} ly` },
                { label: 'Stars', val: formatStars(g.stars) },
                { label: 'Distance', val: formatDist(g.distance) },
                { label: 'Age', val: `${g.age}B yrs` },
              ].map(s => (
                <div key={s.label} className="text-center rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-white font-bold text-sm">{s.val}</p>
                  <p className="text-gray-600 text-[9px] uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Size bar vs Milky Way */}
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Size vs Milky Way</p>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-[9px] text-gray-500 mb-1">
                    <span>{g.name}</span><span>{g.diameter.toLocaleString()} ly</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(1, (g.diameter / maxDiam) * 100)}%`, background: g.color }} />
                  </div>
                </div>
                {g.id !== 'milkyway' && (
                  <div>
                    <div className="flex justify-between text-[9px] text-gray-500 mb-1">
                      <span>Milky Way</span><span>100,000 ly</span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(100000 / maxDiam) * 100}%`, background: '#818cf8' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Black hole info */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <p className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold mb-1">⚫ Central Black Hole</p>
            <p className="text-white text-sm font-semibold">{g.blackHole}</p>
          </div>
        </>
      ) : (
        /* Blanets mode */
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.3)' }}>
            <h4 className="text-white font-black text-base mb-2">⚫ {BLANETS_INFO.title}</h4>
            <p className="text-gray-400 text-xs leading-relaxed">{BLANETS_INFO.description}</p>
          </div>

          <div className="space-y-3">
            {BLANETS_INFO.examples.map(b => (
              <div key={b.name} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(167,139,250,0.2)' }}>
                <p className="text-purple-300 font-bold text-sm">{b.name}</p>
                <p className="text-white font-black text-xl mt-1">{b.size}</p>
                <p className="text-gray-500 text-xs mt-1">{b.context}</p>
                <p className="text-gray-600 text-xs mt-0.5 italic">{b.note}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Key Facts</p>
            {BLANETS_INFO.facts.map(f => (
              <div key={f} className="flex items-start gap-2 py-1">
                <span className="text-purple-500 mt-0.5 flex-shrink-0">◆</span>
                <p className="text-gray-400 text-xs leading-relaxed">{f}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
