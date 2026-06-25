import { useState, useRef, useEffect } from 'react'

interface Star {
  name?: string
  x: number
  y: number
  mag: number
}

interface Constellation {
  id: string
  name: string
  latin: string
  abbreviation: string
  hemisphere: 'N' | 'S' | 'Both'
  family: string
  area: number
  stars: number
  brightestStar: string
  bestMonth: string
  mythology: string
  description: string
  pattern: Star[]
  lines: [number, number][]
  season: 'Spring' | 'Summer' | 'Autumn' | 'Winter' | 'Year-round'
}

const CONSTELLATIONS: Constellation[] = [
  {
    id: 'orion', name: 'Orion', latin: 'Orion', abbreviation: 'Ori',
    hemisphere: 'Both', family: 'Orion', area: 594, stars: 7, brightestStar: 'Rigel (β Ori)',
    bestMonth: 'January', season: 'Winter',
    mythology: 'The Great Hunter of Greek mythology, placed in the sky by Zeus. Son of Poseidon, he was a giant hunter who was killed by a scorpion (Scorpius). The two constellations are placed on opposite sides of the sky so they never meet.',
    description: 'One of the most recognizable constellations, featuring the famous three-star belt. Contains two first-magnitude stars and the Orion Nebula (M42).',
    pattern: [
      { name: 'Betelgeuse', x: 30, y: 25, mag: 0.5 },
      { name: 'Bellatrix', x: 70, y: 25, mag: 1.6 },
      { name: 'Mintaka', x: 40, y: 50, mag: 2.2 },
      { name: 'Alnilam', x: 50, y: 52, mag: 1.7 },
      { name: 'Alnitak', x: 62, y: 54, mag: 1.8 },
      { name: 'Saiph', x: 30, y: 80, mag: 2.1 },
      { name: 'Rigel', x: 72, y: 78, mag: 0.1 },
    ],
    lines: [[0,2],[0,1],[1,4],[2,3],[3,4],[2,5],[4,6],[5,6]]
  },
  {
    id: 'ursamajor', name: 'Ursa Major', latin: 'Ursa Major', abbreviation: 'UMa',
    hemisphere: 'N', family: 'Ursa Major', area: 1280, stars: 7, brightestStar: 'Alioth (ε UMa)',
    bestMonth: 'April', season: 'Spring',
    mythology: 'Callisto was transformed into a bear by Zeus (or Hera) and placed in the sky. Contains the famous Big Dipper asterism, which has been used for navigation for thousands of years across many cultures.',
    description: 'Third largest constellation containing the Big Dipper (Plough). The two pointer stars of the Dipper point to Polaris, the North Star.',
    pattern: [
      { name: 'Dubhe', x: 25, y: 35, mag: 1.8 },
      { name: 'Merak', x: 35, y: 50, mag: 2.4 },
      { name: 'Phecda', x: 55, y: 55, mag: 2.4 },
      { name: 'Megrez', x: 50, y: 40, mag: 3.3 },
      { name: 'Alioth', x: 65, y: 38, mag: 1.8 },
      { name: 'Mizar', x: 78, y: 32, mag: 2.1 },
      { name: 'Alkaid', x: 88, y: 22, mag: 1.9 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]]
  },
  {
    id: 'scorpius', name: 'Scorpius', latin: 'Scorpius', abbreviation: 'Sco',
    hemisphere: 'S', family: 'Zodiac', area: 497, stars: 18, brightestStar: 'Antares (α Sco)',
    bestMonth: 'July', season: 'Summer',
    mythology: 'The scorpion sent by Gaia (or Artemis) to kill Orion. Zeus placed both in the sky but on opposite sides so they never meet. In Polynesian tradition, the curved tail represents the fishhook of the demigod Maui.',
    description: 'A stunning zodiac constellation with a distinctive curved tail. Antares (meaning "rival of Mars") is a red supergiant 700× the size of the Sun.',
    pattern: [
      { name: 'Antares', x: 45, y: 30, mag: 1.1 },
      { name: 'Graffias', x: 30, y: 20, mag: 2.6 },
      { name: 'Dschubba', x: 45, y: 20, mag: 2.3 },
      { name: 'Pi Sco', x: 60, y: 22, mag: 2.9 },
      { name: 'Sargas', x: 55, y: 60, mag: 1.9 },
      { name: 'Girtab', x: 65, y: 70, mag: 2.4 },
      { name: 'Shaula', x: 75, y: 80, mag: 1.6 },
      { name: 'Lesath', x: 80, y: 75, mag: 2.7 },
    ],
    lines: [[1,2],[2,3],[1,0],[0,4],[4,5],[5,6],[6,7]]
  },
  {
    id: 'cassiopeia', name: 'Cassiopeia', latin: 'Cassiopeia', abbreviation: 'Cas',
    hemisphere: 'N', family: 'Perseus', area: 598, stars: 5, brightestStar: 'Schedar (α Cas)',
    bestMonth: 'November', season: 'Autumn',
    mythology: 'Queen of Ethiopia, wife of Cepheus, and mother of Andromeda. Boasted her daughter was more beautiful than the sea nymphs, angering Poseidon who sent the sea monster Cetus. Her vanity caused her to be placed in the sky spinning around the pole.',
    description: 'Distinctive W or M shape depending on orientation. Circumpolar from mid-northern latitudes, never setting below the horizon. Contains two Messier open clusters.',
    pattern: [
      { name: 'Caph', x: 15, y: 60, mag: 2.3 },
      { name: 'Schedar', x: 30, y: 35, mag: 2.2 },
      { name: 'Gamma Cas', x: 50, y: 55, mag: 2.5 },
      { name: 'Ruchbah', x: 68, y: 30, mag: 2.7 },
      { name: 'Segin', x: 84, y: 55, mag: 3.4 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4]]
  },
  {
    id: 'leo', name: 'Leo', latin: 'Leo', abbreviation: 'Leo',
    hemisphere: 'N', family: 'Zodiac', area: 947, stars: 9, brightestStar: 'Regulus (α Leo)',
    bestMonth: 'April', season: 'Spring',
    mythology: 'The Nemean Lion, whose hide was impervious to weapons. Heracles (Hercules) strangled it with his bare hands as his first labor. Zeus honored the lion by placing it in the sky.',
    description: 'One of the oldest recognized constellations. The "Sickle" asterism forms the lion\'s head and mane. Regulus sits almost exactly on the ecliptic.',
    pattern: [
      { name: 'Regulus', x: 22, y: 65, mag: 1.4 },
      { name: 'Eta Leo', x: 28, y: 50, mag: 3.5 },
      { name: 'Gamma Leo', x: 38, y: 35, mag: 2.0 },
      { name: 'Zeta Leo', x: 42, y: 22, mag: 3.4 },
      { name: 'Mu Leo', x: 55, y: 28, mag: 3.9 },
      { name: 'Epsilon Leo', x: 60, y: 40, mag: 3.0 },
      { name: 'Denebola', x: 80, y: 55, mag: 2.1 },
      { name: 'Delta Leo', x: 72, y: 45, mag: 2.6 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,2],[5,7],[7,6]]
  },
  {
    id: 'cygnus', name: 'Cygnus', latin: 'Cygnus', abbreviation: 'Cyg',
    hemisphere: 'N', family: 'Hercules', area: 804, stars: 9, brightestStar: 'Deneb (α Cyg)',
    bestMonth: 'September', season: 'Summer',
    mythology: 'Various myths: Zeus disguised as a swan to seduce Leda; or Orpheus transformed into a swan after death; or Phaethon\'s friend Cycnus mourning his death. The distinctive cross shape is also called the Northern Cross.',
    description: 'Features Deneb, one of the most luminous stars visible to the naked eye (~200,000× solar luminosity). Part of the Summer Triangle with Vega and Altair. Contains Cygnus X-1 black hole.',
    pattern: [
      { name: 'Deneb', x: 50, y: 15, mag: 1.3 },
      { name: 'Sadr', x: 50, y: 50, mag: 2.2 },
      { name: 'Gienah', x: 22, y: 50, mag: 2.5 },
      { name: 'Delta Cyg', x: 78, y: 50, mag: 2.9 },
      { name: 'Albireo', x: 50, y: 85, mag: 3.1 },
    ],
    lines: [[0,1],[1,2],[1,3],[1,4]]
  },
  {
    id: 'crux', name: 'Crux (Southern Cross)', latin: 'Crux', abbreviation: 'Cru',
    hemisphere: 'S', family: 'Hercules', area: 68, stars: 4, brightestStar: 'Acrux (α Cru)',
    bestMonth: 'May', season: 'Autumn',
    mythology: 'In ancient times, visible from the Mediterranean. First catalogued by Portuguese navigators in the 15th century. Used for navigation in the Southern Hemisphere as the Southern Cross points toward the south celestial pole.',
    description: 'Smallest constellation by area but one of the most recognizable. Has been on the flags of Australia, New Zealand, Brazil, and Papua New Guinea. Contains the Jewel Box cluster and Coal Sack nebula.',
    pattern: [
      { name: 'Acrux', x: 50, y: 80, mag: 0.8 },
      { name: 'Mimosa', x: 80, y: 50, mag: 1.3 },
      { name: 'Gacrux', x: 50, y: 20, mag: 1.6 },
      { name: 'Delta Cru', x: 20, y: 50, mag: 2.8 },
    ],
    lines: [[0,2],[3,1]]
  },
  {
    id: 'lyra', name: 'Lyra', latin: 'Lyra', abbreviation: 'Lyr',
    hemisphere: 'N', family: 'Hercules', area: 286, stars: 5, brightestStar: 'Vega (α Lyr)',
    bestMonth: 'August', season: 'Summer',
    mythology: 'The lyre of Orpheus, the legendary musician who charmed rocks, trees, and rivers with his music. After Orpheus was killed by the Maenads, the Muses placed his lyre in the sky. Vega was the North Star 14,000 years ago.',
    description: 'Small but prominent constellation. Vega is the 5th brightest star in the sky and will be the North Star again in ~13,700 years due to precession. Contains the Ring Nebula (M57).',
    pattern: [
      { name: 'Vega', x: 50, y: 20, mag: 0.0 },
      { name: 'Sheliak', x: 30, y: 55, mag: 3.5 },
      { name: 'Sulafat', x: 70, y: 55, mag: 3.3 },
      { name: 'Delta Lyr', x: 25, y: 75, mag: 4.2 },
      { name: 'Epsilon Lyr', x: 75, y: 75, mag: 4.7 },
    ],
    lines: [[0,1],[0,2],[1,2],[1,3],[2,4],[3,4]]
  },
]

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter', 'Year-round'] as const

function StarCanvas({ constellation }: { constellation: Constellation }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = '#050a18'
    ctx.fillRect(0, 0, W, H)

    // Background stars
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const r = Math.random() * 0.8
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.4})`
      ctx.fill()
    }

    const pts = constellation.pattern.map(s => ({
      x: (s.x / 100) * W,
      y: (s.y / 100) * H,
      mag: s.mag,
      name: s.name,
    }))

    // Draw lines
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.35)'
    ctx.lineWidth = 1
    constellation.lines.forEach(([a, b]) => {
      ctx.beginPath()
      ctx.moveTo(pts[a].x, pts[a].y)
      ctx.lineTo(pts[b].x, pts[b].y)
      ctx.stroke()
    })

    // Draw stars
    pts.forEach(pt => {
      const r = Math.max(1.5, 5 - pt.mag)
      const gradient = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2.5)
      gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
      gradient.addColorStop(0.4, 'rgba(180,210,255,0.7)')
      gradient.addColorStop(1, 'rgba(100,160,255,0)')
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r * 0.6, 0, Math.PI * 2)
      ctx.fillStyle = 'white'
      ctx.fill()
      if (pt.name) {
        ctx.font = '9px sans-serif'
        ctx.fillStyle = 'rgba(180,210,255,0.8)'
        ctx.fillText(pt.name, pt.x + r * 1.5 + 2, pt.y - 2)
      }
    })
  }, [constellation])

  return <canvas ref={canvasRef} width={300} height={200} className="w-full rounded-lg" />
}

export default function ConstellationGuide() {
  const [search, setSearch] = useState('')
  const [filterSeason, setFilterSeason] = useState<string>('All')
  const [filterHemi, setFilterHemi] = useState<string>('All')
  const [selected, setSelected] = useState<Constellation>(CONSTELLATIONS[0])
  const [viewMode, setViewMode] = useState<'grid' | 'detail'>('detail')

  const filtered = CONSTELLATIONS.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.abbreviation.toLowerCase().includes(search.toLowerCase())
    const matchSeason = filterSeason === 'All' || c.season === filterSeason
    const matchHemi = filterHemi === 'All' || c.hemisphere === filterHemi || c.hemisphere === 'Both'
    return matchSearch && matchSeason && matchHemi
  })

  const hemiLabel = (h: 'N' | 'S' | 'Both') =>
    h === 'N' ? '🌍 Northern' : h === 'S' ? '🌎 Southern' : '🌐 Both'

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Constellation Guide</h2>
      <p className="text-slate-400 text-sm mb-5">Explore mythology, star patterns, and viewing guides for major constellations</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search constellations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm border border-slate-700 focus:outline-none focus:border-indigo-500 flex-1 min-w-40"
        />
        <select
          value={filterSeason}
          onChange={e => setFilterSeason(e.target.value)}
          className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm border border-slate-700 focus:outline-none"
        >
          <option value="All">All seasons</option>
          {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterHemi}
          onChange={e => setFilterHemi(e.target.value)}
          className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm border border-slate-700 focus:outline-none"
        >
          <option value="All">Both hemispheres</option>
          <option value="N">Northern</option>
          <option value="S">Southern</option>
        </select>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-5">
        <button onClick={() => setViewMode('detail')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'detail' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          🔭 Detail View
        </button>
        <button onClick={() => setViewMode('grid')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          ⊞ Grid View
        </button>
      </div>

      <div className={viewMode === 'detail' ? 'grid grid-cols-1 lg:grid-cols-3 gap-5' : ''}>
        {/* Constellation list */}
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3' : 'space-y-2'}>
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                selected.id === c.id && viewMode === 'detail'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{c.name}</span>
                <span className="text-xs opacity-60">{c.abbreviation}</span>
              </div>
              <div className="flex gap-2 mt-1 text-xs opacity-60">
                <span>{hemiLabel(c.hemisphere)}</span>
                <span>· {c.season}</span>
              </div>
              {viewMode === 'grid' && (
                <div className="mt-2 text-xs opacity-50">{c.brightestStar}</div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-6">No constellations match your filters</div>
          )}
        </div>

        {/* Detail panel */}
        {viewMode === 'detail' && (
          <div className="lg:col-span-2 bg-slate-900 rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="text-slate-400 text-sm italic">{selected.latin} · {selected.abbreviation}</div>
              </div>
              <div className="text-right text-sm">
                <div className="text-slate-300">{hemiLabel(selected.hemisphere)}</div>
                <div className="text-slate-400">Best: {selected.bestMonth}</div>
              </div>
            </div>

            <StarCanvas constellation={selected} />

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-indigo-400 text-xs">Area</div>
                <div className="text-white font-mono text-sm">{selected.area} deg²</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-indigo-400 text-xs">Main Stars</div>
                <div className="text-white font-mono text-sm">{selected.stars}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-indigo-400 text-xs">Season</div>
                <div className="text-white text-sm">{selected.season}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-indigo-400 text-xs">Family</div>
                <div className="text-white text-sm">{selected.family}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-slate-400 text-xs mb-1">Brightest Star</div>
              <div className="text-yellow-300 text-sm font-semibold">⭐ {selected.brightestStar}</div>
            </div>

            <div className="mt-4">
              <div className="text-slate-400 text-xs mb-2">Mythology</div>
              <p className="text-slate-300 text-sm leading-relaxed">{selected.mythology}</p>
            </div>

            <div className="mt-3">
              <div className="text-slate-400 text-xs mb-2">Description</div>
              <p className="text-slate-300 text-sm leading-relaxed">{selected.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-2xl font-bold text-indigo-400">88</div>
          <div className="text-slate-400 text-xs">IAU Official Constellations</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-2xl font-bold text-yellow-400">5,000+</div>
          <div className="text-slate-400 text-xs">Years of constellation lore</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-2xl font-bold text-green-400">1930</div>
          <div className="text-slate-400 text-xs">IAU standardization year</div>
        </div>
      </div>
    </div>
  )
}
