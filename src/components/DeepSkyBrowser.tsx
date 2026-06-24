import { useState, useMemo } from 'react'

interface DSO {
  m: number | null
  ngc: number | null
  name: string
  type: 'galaxy' | 'nebula' | 'cluster-open' | 'cluster-globular' | 'supernova-remnant' | 'planetary-nebula'
  constellation: string
  mag: number
  size: string
  distance: string
  season: 'spring' | 'summer' | 'autumn' | 'winter' | 'year-round'
  ra: string
  dec: string
  description: string
  icon: string
}

const OBJECTS: DSO[] = [
  { m: 1, ngc: 1952, name: 'Crab Nebula', type: 'supernova-remnant', constellation: 'Taurus', mag: 8.4, size: '7′×5′', distance: '6,500 ly', season: 'winter', ra: '05h 34m', dec: '+22°01′', description: 'Remnant of a supernova observed in 1054 AD by Chinese astronomers. A pulsar at its center spins 30 times per second.', icon: '💥' },
  { m: 13, ngc: 6205, name: 'Hercules Cluster', type: 'cluster-globular', constellation: 'Hercules', mag: 5.8, size: '20′', distance: '25,100 ly', season: 'summer', ra: '16h 41m', dec: '+36°28′', description: 'The Great Globular Cluster — one of the brightest in the northern sky, containing ~300,000 stars. Naked eye under dark skies.', icon: '✨' },
  { m: 31, ngc: 224, name: 'Andromeda Galaxy', type: 'galaxy', constellation: 'Andromeda', mag: 3.4, size: '3°×1°', distance: '2.54M ly', season: 'autumn', ra: '00h 42m', dec: '+41°16′', description: 'The nearest large spiral galaxy to the Milky Way. Visible to naked eye on dark nights. Contains ~1 trillion stars and is approaching us at 110 km/s.', icon: '🌌' },
  { m: 42, ngc: 1976, name: 'Orion Nebula', type: 'nebula', constellation: 'Orion', mag: 4.0, size: '65′×60′', distance: '1,344 ly', season: 'winter', ra: '05h 35m', dec: '−05°23′', description: 'The closest region of massive star formation to Earth. The Trapezium cluster inside is only a million years old. Visible to naked eye as a fuzzy star in Orion\'s sword.', icon: '🌫️' },
  { m: 45, ngc: null, name: 'Pleiades', type: 'cluster-open', constellation: 'Taurus', mag: 1.2, size: '110′', distance: '444 ly', season: 'winter', ra: '03h 47m', dec: '+24°07′', description: 'The Seven Sisters — the most famous open cluster. The blue reflection nebula around the stars is not related; it\'s a chance encounter with an interstellar dust cloud.', icon: '💎' },
  { m: 51, ngc: 5194, name: 'Whirlpool Galaxy', type: 'galaxy', constellation: 'Canes Venatici', mag: 8.4, size: '11′×7′', distance: '23M ly', season: 'spring', ra: '13h 29m', dec: '+47°12′', description: 'First galaxy in which spiral structure was noted (1845). Interacting with NGC 5195, which tugs gravitational tidal streams from its arms.', icon: '🌀' },
  { m: 57, ngc: 6720, name: 'Ring Nebula', type: 'planetary-nebula', constellation: 'Lyra', mag: 8.8, size: '1.4′×1′', distance: '2,280 ly', season: 'summer', ra: '18h 53m', dec: '+33°02′', description: 'A textbook planetary nebula — a dying star\'s expelled gas shell glowing around a white dwarf. The ring is actually a barrel shape seen end-on.', icon: '💍' },
  { m: 64, ngc: 4826, name: 'Black Eye Galaxy', type: 'galaxy', constellation: 'Coma Berenices', mag: 8.5, size: '10′×5′', distance: '17M ly', season: 'spring', ra: '12h 56m', dec: '+21°41′', description: 'Named for the striking dark band of dust in front of its bright nucleus. Inner and outer regions rotate in opposite directions — possibly the result of a merger.', icon: '🌑' },
  { m: 82, ngc: 3034, name: 'Cigar Galaxy', type: 'galaxy', constellation: 'Ursa Major', mag: 8.4, size: '11′×4.3′', distance: '12M ly', season: 'spring', ra: '09h 55m', dec: '+69°41′', description: 'An edge-on starburst galaxy with a superwind blowing filaments of hydrogen 10,000 ly above and below the plane. Companion to M81.', icon: '🚬' },
  { m: 104, ngc: 4594, name: 'Sombrero Galaxy', type: 'galaxy', constellation: 'Virgo', mag: 8.0, size: '8.7′×3.5′', distance: '29.3M ly', season: 'spring', ra: '12h 40m', dec: '−11°37′', description: 'One of the most photogenic galaxies — nearly edge-on with a prominent dust lane and a large central bulge making it look like a sombrero hat.', icon: '🎩' },
  { m: 8, ngc: 6523, name: 'Lagoon Nebula', type: 'nebula', constellation: 'Sagittarius', mag: 5.0, size: '90′×40′', distance: '4,100 ly', season: 'summer', ra: '18h 03m', dec: '−24°23′', description: 'A large HII region with active star formation. The central hourglass region was shaped by a hot young star. Naked eye from dark sites.', icon: '🌊' },
  { m: 27, ngc: 6853, name: 'Dumbbell Nebula', type: 'planetary-nebula', constellation: 'Vulpecula', mag: 7.5, size: '8′×5.6′', distance: '1,360 ly', season: 'summer', ra: '19h 59m', dec: '+22°43′', description: 'The first planetary nebula ever discovered (1764). Its apple-core shape is actually two lobes expanding at 31 km/s from a 13th-magnitude white dwarf.', icon: '🏋️' },
  { m: 33, ngc: 598, name: 'Triangulum Galaxy', type: 'galaxy', constellation: 'Triangulum', mag: 5.7, size: '73′×45′', distance: '2.73M ly', season: 'autumn', ra: '01h 33m', dec: '+30°39′', description: 'Third-largest galaxy in the Local Group after Andromeda and the Milky Way. Face-on orientation reveals beautiful spiral arms. Marginally naked eye under perfect conditions.', icon: '🔺' },
  { m: 3, ngc: 5272, name: 'Globular Cluster M3', type: 'cluster-globular', constellation: 'Canes Venatici', mag: 6.2, size: '18′', distance: '33,900 ly', season: 'spring', ra: '13h 42m', dec: '+28°22′', description: 'Contains ~500,000 stars and is one of the largest and brightest globular clusters. Home to 274 known variable stars — more than any other known globular cluster.', icon: '⚾' },
  { m: 20, ngc: 6514, name: 'Trifid Nebula', type: 'nebula', constellation: 'Sagittarius', mag: 9.0, size: '28′', distance: '5,200 ly', season: 'summer', ra: '18h 02m', dec: '−23°02′', description: 'Named for three lanes of dark nebula that divide it into three lobes. Three types of nebulae in one: emission (pink), reflection (blue), and dark (black bands).', icon: '☘️' },
  { m: 101, ngc: 5457, name: 'Pinwheel Galaxy', type: 'galaxy', constellation: 'Ursa Major', mag: 7.9, size: '28.8′×26.9′', distance: '20.9M ly', season: 'spring', ra: '14h 03m', dec: '+54°21′', description: 'A nearly face-on spiral galaxy about 170,000 ly across — larger than the Milky Way. Its asymmetric appearance is due to tidal interactions with companion galaxies.', icon: '🌀' },
  { m: 11, ngc: 6705, name: 'Wild Duck Cluster', type: 'cluster-open', constellation: 'Scutum', mag: 5.8, size: '14′', distance: '6,200 ly', season: 'summer', ra: '18h 51m', dec: '−06°16′', description: 'One of the richest open clusters, containing ~2,900 stars in a small area. Its triangular shape reminded Admiral Smyth of a flock of wild ducks in flight.', icon: '🦆' },
  { m: 16, ngc: 6611, name: 'Eagle Nebula', type: 'nebula', constellation: 'Serpens', mag: 6.4, size: '7′×7′', distance: '7,000 ly', season: 'summer', ra: '18h 18m', dec: '−13°47′', description: 'Famous for the "Pillars of Creation" — towering columns of gas and dust imaged by Hubble. Active star formation occurs within these pillars.', icon: '🦅' },
  { m: 97, ngc: 3587, name: 'Owl Nebula', type: 'planetary-nebula', constellation: 'Ursa Major', mag: 9.9, size: '3.4′', distance: '2,030 ly', season: 'spring', ra: '11h 14m', dec: '+55°01′', description: 'Named for two dark circular patches resembling owl eyes visible in large telescopes. A dying star\'s expelled outer layers illuminate the owl-shaped shell.', icon: '🦉' },
  { m: 44, ngc: 2632, name: 'Beehive Cluster', type: 'cluster-open', constellation: 'Cancer', mag: 3.7, size: '95′', distance: '610 ly', season: 'spring', ra: '08h 40m', dec: '+19°59′', description: 'Praesepe (the Manger) — one of the nearest open clusters. Contains ~1,000 confirmed members. Naked-eye under dark skies. Ancient cultures used it to forecast rain when it disappeared.', icon: '🐝' },
]

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  'galaxy':            { label: 'Galaxy',          color: '#6366f1', icon: '🌌' },
  'nebula':            { label: 'Nebula',           color: '#4ade80', icon: '🌫️' },
  'cluster-open':      { label: 'Open Cluster',     color: '#fbbf24', icon: '✨' },
  'cluster-globular':  { label: 'Globular Cluster', color: '#f97316', icon: '⚾' },
  'supernova-remnant': { label: 'SNR',              color: '#ef4444', icon: '💥' },
  'planetary-nebula':  { label: 'Planetary Nebula', color: '#a78bfa', icon: '💍' },
}

const SEASONS = [
  { id: 'all', label: '🌌 All' },
  { id: 'winter', label: '❄️ Winter' },
  { id: 'spring', label: '🌸 Spring' },
  { id: 'summer', label: '☀️ Summer' },
  { id: 'autumn', label: '🍂 Autumn' },
]

const TYPES_FILTER = [
  { id: 'all', label: 'All Types' },
  { id: 'galaxy', label: '🌌 Galaxies' },
  { id: 'nebula', label: '🌫️ Nebulae' },
  { id: 'cluster-open', label: '✨ Open Clusters' },
  { id: 'cluster-globular', label: '⚾ Globular' },
  { id: 'planetary-nebula', label: '💍 Planetary Neb' },
]

export default function DeepSkyBrowser() {
  const [season, setSeason] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DSO | null>(null)
  const [sort, setSort] = useState<'mag' | 'messier' | 'name'>('messier')

  const filtered = useMemo(() => {
    let items = [...OBJECTS]
    if (season !== 'all') items = items.filter(o => o.season === season || o.season === 'year-round')
    if (typeFilter !== 'all') items = items.filter(o => o.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(o =>
        o.name.toLowerCase().includes(q) ||
        o.constellation.toLowerCase().includes(q) ||
        (o.m && `m${o.m}`.includes(q)) ||
        (o.ngc && `ngc${o.ngc}`.includes(q))
      )
    }
    if (sort === 'mag') items.sort((a, b) => a.mag - b.mag)
    else if (sort === 'messier') items.sort((a, b) => (a.m ?? 999) - (b.m ?? 999))
    else items.sort((a, b) => a.name.localeCompare(b.name))
    return items
  }, [season, typeFilter, search, sort])

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-box text-xl">🔭</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg">Deep Sky Browser</h3>
          <p className="text-gray-500 text-xs">Messier catalog — galaxies, nebulae, star clusters</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-bold"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
          {filtered.length} objects
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, constellation, M#, NGC#…"
          className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 text-xs">✕</button>
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
        {TYPES_FILTER.map(t => (
          <button key={t.id} onClick={() => setTypeFilter(t.id)}
            className="text-[10px] px-2.5 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all shrink-0"
            style={typeFilter === t.id
              ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Season filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
        {SEASONS.map(s => (
          <button key={s.id} onClick={() => setSeason(s.id)}
            className="text-[10px] px-2.5 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all shrink-0"
            style={season === s.id
              ? { background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.5)', color: '#fde68a' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
            {s.label}
          </button>
        ))}
        <div className="shrink-0 flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-gray-600">Sort:</span>
          {(['messier', 'mag', 'name'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="text-[9px] px-2 py-1 rounded-lg transition-all"
              style={sort === s
                ? { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }
                : { color: '#4b5563' }}>
              {s === 'messier' ? 'M#' : s === 'mag' ? 'Mag' : 'A-Z'}
            </button>
          ))}
        </div>
      </div>

      {/* Object list */}
      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.3) transparent' }}>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm">No objects match your filters</div>
        )}
        {filtered.map(obj => {
          const meta = TYPE_META[obj.type]
          const isSelected = selected?.name === obj.name
          return (
            <button key={obj.name} onClick={() => setSelected(isSelected ? null : obj)}
              className="w-full text-left rounded-xl p-3 transition-all"
              style={{
                background: isSelected ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`
              }}>
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                  style={{ background: meta.color + '22', border: `1px solid ${meta.color}33` }}>
                  {obj.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {obj.m && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}>M{obj.m}</span>}
                    {obj.ngc && <span className="text-[9px] text-gray-700">NGC {obj.ngc}</span>}
                    <span className="text-sm font-bold text-white">{obj.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: meta.color + '22', color: meta.color }}>{meta.label}</span>
                    <span className="text-[9px] text-gray-600">{obj.constellation}</span>
                    <span className="text-[9px] text-gray-600">{obj.distance}</span>
                  </div>
                  {isSelected && (
                    <div className="mt-2 pt-2 border-t border-white/5">
                      <p className="text-xs text-gray-400 leading-relaxed mb-2">{obj.description}</p>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div><span className="text-gray-600">RA: </span><span className="text-gray-300">{obj.ra}</span></div>
                        <div><span className="text-gray-600">Dec: </span><span className="text-gray-300">{obj.dec}</span></div>
                        <div><span className="text-gray-600">Size: </span><span className="text-gray-300">{obj.size}</span></div>
                        <div><span className="text-gray-600">Best: </span><span className="text-gray-300 capitalize">{obj.season}</span></div>
                        <div><span className="text-gray-600">Dist: </span><span className="text-gray-300">{obj.distance}</span></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold" style={{ color: obj.mag < 4 ? '#fbbf24' : obj.mag < 7 ? '#60a5fa' : '#6b7280' }}>
                    {obj.mag}
                  </div>
                  <div className="text-[9px] text-gray-700">mag</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-[10px] text-gray-700 mt-4 text-center">Data: Messier Catalog · NGC / IC Catalogs · SEDS</p>
    </div>
  )
}
