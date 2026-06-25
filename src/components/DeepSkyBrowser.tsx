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

interface ObsLogEntry {
  id: string
  date: string
  object: string
  telescope: string
  eyepiece: string
  magnification: number
  seeing: number
  transparency: number
  darkness: number
  notes: string
  createdAt: string
}

const OBJECTS: DSO[] = [
  { m: 1,   ngc: 1952,  name: 'Crab Nebula',          type: 'supernova-remnant',  constellation: 'Taurus',           mag: 8.4,  size: '7′×5′',      distance: '6,500 ly',   season: 'winter',     ra: '05h 34m', dec: '+22°01′', description: 'Remnant of a supernova observed in 1054 AD by Chinese astronomers. A pulsar at its center spins 30 times per second.', icon: '💥' },
  { m: 3,   ngc: 5272,  name: 'Globular Cluster M3',  type: 'cluster-globular',   constellation: 'Canes Venatici',   mag: 6.2,  size: '18′',         distance: '33,900 ly',  season: 'spring',     ra: '13h 42m', dec: '+28°22′', description: 'Contains ~500,000 stars and is one of the largest and brightest globular clusters. Home to 274 known variable stars.', icon: '⚾' },
  { m: 8,   ngc: 6523,  name: 'Lagoon Nebula',        type: 'nebula',             constellation: 'Sagittarius',      mag: 5.0,  size: '90′×40′',     distance: '4,100 ly',   season: 'summer',     ra: '18h 03m', dec: '−24°23′', description: 'A large HII region with active star formation. The central hourglass region was shaped by a hot young star. Naked eye from dark sites.', icon: '🌊' },
  { m: 11,  ngc: 6705,  name: 'Wild Duck Cluster',    type: 'cluster-open',       constellation: 'Scutum',           mag: 5.8,  size: '14′',         distance: '6,200 ly',   season: 'summer',     ra: '18h 51m', dec: '−06°16′', description: 'One of the richest open clusters, containing ~2,900 stars in a small area. Its triangular shape reminded Admiral Smyth of a flock of wild ducks in flight.', icon: '🦆' },
  { m: 13,  ngc: 6205,  name: 'Hercules Cluster',     type: 'cluster-globular',   constellation: 'Hercules',         mag: 5.8,  size: '20′',         distance: '25,100 ly',  season: 'summer',     ra: '16h 41m', dec: '+36°28′', description: 'The Great Globular Cluster — one of the brightest in the northern sky, containing ~300,000 stars. Naked eye under dark skies.', icon: '✨' },
  { m: 16,  ngc: 6611,  name: 'Eagle Nebula',         type: 'nebula',             constellation: 'Serpens',          mag: 6.4,  size: '7′×7′',       distance: '7,000 ly',   season: 'summer',     ra: '18h 18m', dec: '−13°47′', description: 'Famous for the "Pillars of Creation" — towering columns of gas and dust imaged by Hubble. Active star formation occurs within these pillars.', icon: '🦅' },
  { m: 20,  ngc: 6514,  name: 'Trifid Nebula',        type: 'nebula',             constellation: 'Sagittarius',      mag: 9.0,  size: '28′',         distance: '5,200 ly',   season: 'summer',     ra: '18h 02m', dec: '−23°02′', description: 'Named for three lanes of dark nebula that divide it into three lobes. Three types of nebulae in one: emission, reflection, and dark.', icon: '☘️' },
  { m: 27,  ngc: 6853,  name: 'Dumbbell Nebula',      type: 'planetary-nebula',   constellation: 'Vulpecula',        mag: 7.5,  size: '8′×5.6′',     distance: '1,360 ly',   season: 'summer',     ra: '19h 59m', dec: '+22°43′', description: 'The first planetary nebula ever discovered (1764). Its apple-core shape is actually two lobes expanding from a white dwarf.', icon: '🏋️' },
  { m: 31,  ngc: 224,   name: 'Andromeda Galaxy',     type: 'galaxy',             constellation: 'Andromeda',        mag: 3.4,  size: '3°×1°',       distance: '2.54M ly',   season: 'autumn',     ra: '00h 42m', dec: '+41°16′', description: 'The nearest large spiral galaxy to the Milky Way. Visible to naked eye on dark nights. Contains ~1 trillion stars.', icon: '🌌' },
  { m: 33,  ngc: 598,   name: 'Triangulum Galaxy',    type: 'galaxy',             constellation: 'Triangulum',       mag: 5.7,  size: '73′×45′',     distance: '2.73M ly',   season: 'autumn',     ra: '01h 33m', dec: '+30°39′', description: 'Third-largest galaxy in the Local Group. Face-on orientation reveals beautiful spiral arms. Marginally naked eye under perfect conditions.', icon: '🔺' },
  { m: 42,  ngc: 1976,  name: 'Orion Nebula',         type: 'nebula',             constellation: 'Orion',            mag: 4.0,  size: '65′×60′',     distance: '1,344 ly',   season: 'winter',     ra: '05h 35m', dec: '−05°23′', description: 'The closest region of massive star formation to Earth. The Trapezium cluster inside is only a million years old.', icon: '🌫️' },
  { m: 44,  ngc: 2632,  name: 'Beehive Cluster',      type: 'cluster-open',       constellation: 'Cancer',           mag: 3.7,  size: '95′',         distance: '610 ly',     season: 'spring',     ra: '08h 40m', dec: '+19°59′', description: 'Praesepe (the Manger) — one of the nearest open clusters. Contains ~1,000 confirmed members. Naked-eye under dark skies.', icon: '🐝' },
  { m: 45,  ngc: null,  name: 'Pleiades',             type: 'cluster-open',       constellation: 'Taurus',           mag: 1.2,  size: '110′',        distance: '444 ly',     season: 'winter',     ra: '03h 47m', dec: '+24°07′', description: 'The Seven Sisters — the most famous open cluster. The blue reflection nebula is a chance encounter with an interstellar dust cloud.', icon: '💎' },
  { m: 51,  ngc: 5194,  name: 'Whirlpool Galaxy',     type: 'galaxy',             constellation: 'Canes Venatici',   mag: 8.4,  size: '11′×7′',      distance: '23M ly',     season: 'spring',     ra: '13h 29m', dec: '+47°12′', description: 'First galaxy in which spiral structure was noted (1845). Interacting with NGC 5195, which tugs gravitational tidal streams from its arms.', icon: '🌀' },
  { m: 57,  ngc: 6720,  name: 'Ring Nebula',          type: 'planetary-nebula',   constellation: 'Lyra',             mag: 8.8,  size: '1.4′×1′',     distance: '2,280 ly',   season: 'summer',     ra: '18h 53m', dec: '+33°02′', description: 'A textbook planetary nebula — a dying star\'s expelled gas shell glowing around a white dwarf. The ring is actually a barrel shape seen end-on.', icon: '💍' },
  { m: 64,  ngc: 4826,  name: 'Black Eye Galaxy',     type: 'galaxy',             constellation: 'Coma Berenices',   mag: 8.5,  size: '10′×5′',      distance: '17M ly',     season: 'spring',     ra: '12h 56m', dec: '+21°41′', description: 'Named for the striking dark band of dust in front of its bright nucleus. Inner and outer regions rotate in opposite directions.', icon: '🌑' },
  { m: 82,  ngc: 3034,  name: 'Cigar Galaxy',         type: 'galaxy',             constellation: 'Ursa Major',       mag: 8.4,  size: '11′×4.3′',    distance: '12M ly',     season: 'spring',     ra: '09h 55m', dec: '+69°41′', description: 'An edge-on starburst galaxy with a superwind blowing filaments of hydrogen 10,000 ly above and below the plane.', icon: '🚬' },
  { m: 97,  ngc: 3587,  name: 'Owl Nebula',           type: 'planetary-nebula',   constellation: 'Ursa Major',       mag: 9.9,  size: '3.4′',        distance: '2,030 ly',   season: 'spring',     ra: '11h 14m', dec: '+55°01′', description: 'Named for two dark circular patches resembling owl eyes. A dying star\'s expelled outer layers illuminate the owl-shaped shell.', icon: '🦉' },
  { m: 101, ngc: 5457,  name: 'Pinwheel Galaxy',      type: 'galaxy',             constellation: 'Ursa Major',       mag: 7.9,  size: '28.8′×26.9′', distance: '20.9M ly',   season: 'spring',     ra: '14h 03m', dec: '+54°21′', description: 'A nearly face-on spiral galaxy about 170,000 ly across — larger than the Milky Way. Asymmetric due to tidal interactions.', icon: '🌀' },
  { m: 104, ngc: 4594,  name: 'Sombrero Galaxy',      type: 'galaxy',             constellation: 'Virgo',            mag: 8.0,  size: '8.7′×3.5′',   distance: '29.3M ly',   season: 'spring',     ra: '12h 40m', dec: '−11°37′', description: 'One of the most photogenic galaxies — nearly edge-on with a prominent dust lane and a large central bulge.', icon: '🎩' },
  // Additional objects to reach 30+
  { m: 5,   ngc: 5904,  name: 'Globular Cluster M5',  type: 'cluster-globular',   constellation: 'Serpens',          mag: 5.6,  size: '23′',         distance: '24,500 ly',  season: 'spring',     ra: '15h 18m', dec: '+02°05′', description: 'One of the oldest globular clusters at ~13 billion years. In good seeing it shows resolution to the core in a 4" telescope.', icon: '⭐' },
  { m: 17,  ngc: 6618,  name: 'Omega Nebula',         type: 'nebula',             constellation: 'Sagittarius',      mag: 6.0,  size: '11′',         distance: '5,000 ly',   season: 'summer',     ra: '18h 20m', dec: '−16°11′', description: 'Also known as the Swan Nebula or Horseshoe Nebula. One of the brightest and most massive star-forming regions of the Milky Way.', icon: '🦢' },
  { m: 22,  ngc: 6656,  name: 'Sagittarius Cluster',  type: 'cluster-globular',   constellation: 'Sagittarius',      mag: 5.1,  size: '32′',         distance: '10,600 ly',  season: 'summer',     ra: '18h 36m', dec: '−23°54′', description: 'One of the nearest globular clusters and among the brightest. Contains a few dozen eclipsing binary stars.', icon: '⚾' },
  { m: 35,  ngc: 2168,  name: 'Open Cluster M35',     type: 'cluster-open',       constellation: 'Gemini',           mag: 5.1,  size: '28′',         distance: '2,800 ly',   season: 'winter',     ra: '06h 08m', dec: '+24°20′', description: 'A rich open cluster with ~200 stars spread over an area the size of the full Moon. Background cluster NGC 2158 is visible nearby.', icon: '✨' },
  { m: 36,  ngc: 1960,  name: 'Open Cluster M36',     type: 'cluster-open',       constellation: 'Auriga',           mag: 6.0,  size: '12′',         distance: '4,100 ly',   season: 'winter',     ra: '05h 36m', dec: '+34°08′', description: 'One of three Messier open clusters in Auriga. About 60 confirmed members, many bright and hot blue-white stars.', icon: '✨' },
  { m: 37,  ngc: 2099,  name: 'Open Cluster M37',     type: 'cluster-open',       constellation: 'Auriga',           mag: 5.6,  size: '24′',         distance: '4,511 ly',   season: 'winter',     ra: '05h 52m', dec: '+32°33′', description: 'The richest and largest of the three Messier clusters in Auriga with ~500 stars including a dozen red giants.', icon: '💫' },
  { m: 41,  ngc: 2287,  name: 'Little Beehive',       type: 'cluster-open',       constellation: 'Canis Major',      mag: 4.5,  size: '38′',         distance: '2,300 ly',   season: 'winter',     ra: '06h 46m', dec: '−20°44′', description: 'Mentioned by Aristotle around 325 BC, possibly the oldest recorded deep sky object. Contains several red giant stars.', icon: '🌟' },
  { m: 47,  ngc: 2422,  name: 'Open Cluster M47',     type: 'cluster-open',       constellation: 'Puppis',           mag: 4.4,  size: '30′',         distance: '1,600 ly',   season: 'winter',     ra: '07h 36m', dec: '−14°30′', description: 'A bright open cluster containing about 50 stars. Its brightest star is a yellow giant of magnitude 5.7.', icon: '✨' },
  { m: 63,  ngc: 5055,  name: 'Sunflower Galaxy',     type: 'galaxy',             constellation: 'Canes Venatici',   mag: 8.6,  size: '12.6′×7.2′',  distance: '29M ly',     season: 'spring',     ra: '13h 15m', dec: '+42°02′', description: 'A flocculent spiral galaxy — patchy, fluffy arms without clear large-scale structure — resembling a sunflower\'s petals.', icon: '🌻' },
  { m: 74,  ngc: 628,   name: 'Phantom Galaxy',       type: 'galaxy',             constellation: 'Pisces',           mag: 9.4,  size: '10.5′×9.5′',  distance: '32M ly',     season: 'autumn',     ra: '01h 36m', dec: '+15°47′', description: 'A nearly face-on grand design spiral, famous for its symmetric arms. Low surface brightness makes it challenging but rewarding.', icon: '👻' },
  { m: 78,  ngc: 2068,  name: 'Reflection Nebula M78', type: 'nebula',            constellation: 'Orion',            mag: 8.3,  size: '8′×6′',       distance: '1,350 ly',   season: 'winter',     ra: '05h 46m', dec: '+00°03′', description: 'The brightest diffuse reflection nebula in the sky. Two hot stars illuminate the cloud from within, reflecting blue light.', icon: '🔵' },
  { m: 81,  ngc: 3031,  name: 'Bode\'s Galaxy',       type: 'galaxy',             constellation: 'Ursa Major',       mag: 6.9,  size: '26.9′×14.1′', distance: '11.8M ly',   season: 'spring',     ra: '09h 55m', dec: '+69°04′', description: 'A grand design spiral galaxy, one of the brightest in the sky. Gravitationally interacting with M82 (Cigar Galaxy).', icon: '🌀' },
  { m: 92,  ngc: 6341,  name: 'Globular Cluster M92', type: 'cluster-globular',   constellation: 'Hercules',         mag: 6.4,  size: '14′',         distance: '26,700 ly',  season: 'summer',     ra: '17h 17m', dec: '+43°08′', description: 'Often overshadowed by nearby M13, M92 is itself a spectacular globular containing some of the oldest stars in the Milky Way.', icon: '⚾' },
  { m: 110, ngc: 205,   name: 'Andromeda Satellite',  type: 'galaxy',             constellation: 'Andromeda',        mag: 8.1,  size: '21.9′×11′',   distance: '2.69M ly',   season: 'autumn',     ra: '00h 40m', dec: '+41°41′', description: 'A satellite dwarf elliptical galaxy of M31. Unlike other Local Group dwarf ellipticals, it shows dust patches and young blue star clusters.', icon: '🌌' },
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
  { id: 'all',    label: '🌌 All' },
  { id: 'winter', label: '❄️ Winter' },
  { id: 'spring', label: '🌸 Spring' },
  { id: 'summer', label: '☀️ Summer' },
  { id: 'autumn', label: '🍂 Autumn' },
]

const TYPES_FILTER = [
  { id: 'all',              label: 'All Types' },
  { id: 'galaxy',           label: '🌌 Galaxies' },
  { id: 'nebula',           label: '🌫️ Nebulae' },
  { id: 'cluster-open',     label: '✨ Open Clusters' },
  { id: 'cluster-globular', label: '⚾ Globular' },
  { id: 'planetary-nebula', label: '💍 Planetary Neb' },
  { id: 'supernova-remnant',label: '💥 SNR' },
]

const OBS_LOG_KEY = 'spacehub_obslog'

function loadLog(): ObsLogEntry[] {
  try { return JSON.parse(localStorage.getItem(OBS_LOG_KEY) ?? '[]') } catch { return [] }
}
function saveLog(entries: ObsLogEntry[]) {
  localStorage.setItem(OBS_LOG_KEY, JSON.stringify(entries))
}

interface MiniLogFormProps {
  obj: DSO
  onClose: () => void
}
function MiniLogForm({ obj, onClose }: MiniLogFormProps) {
  const [notes, setNotes] = useState('')
  const [telescope, setTelescope] = useState('')
  const [eyepiece, setEyepiece] = useState('')
  const [seeing, setSeeing] = useState(3)
  const [saved, setSaved] = useState(false)

  const submit = () => {
    const entry: ObsLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: new Date().toISOString().slice(0, 10),
      object: obj.name,
      telescope,
      eyepiece,
      magnification: 0,
      seeing,
      transparency: 3,
      darkness: 3,
      notes,
      createdAt: new Date().toISOString(),
    }
    const existing = loadLog()
    saveLog([...existing, entry])
    setSaved(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)' }}
      onClick={e => e.stopPropagation()}>
      <p className="text-xs font-bold text-indigo-300 mb-2">📓 Log Observation — {obj.name}</p>
      {saved ? (
        <p className="text-xs text-green-400 font-semibold py-2 text-center">✓ Saved to observation log!</p>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Telescope (e.g. 8″ Dobsonian)"
            value={telescope}
            onChange={e => setTelescope(e.target.value)}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <input
            type="text"
            placeholder="Eyepiece (e.g. 25mm)"
            value={eyepiece}
            onChange={e => setEyepiece(e.target.value)}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 shrink-0">Seeing (1-5):</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setSeeing(n)}
                className="w-6 h-6 rounded-md text-[10px] font-bold transition-all"
                style={{ background: seeing === n ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)', color: seeing === n ? '#c4b5fd' : '#6b7280' }}>
                {n}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <div className="flex gap-2">
            <button onClick={submit}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
              style={{ background: 'rgba(99,102,241,0.4)', border: '1px solid rgba(99,102,241,0.5)' }}>
              Save
            </button>
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-gray-500 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DeepSkyBrowser() {
  const [season, setSeason]         = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState<DSO | null>(null)
  const [sort, setSort]             = useState<'mag' | 'messier' | 'name'>('messier')
  const [magLimit, setMagLimit]     = useState(14)
  const [groupByConst, setGroupByConst] = useState(false)
  const [loggingObj, setLoggingObj] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let items = [...OBJECTS]
    if (season !== 'all') items = items.filter(o => o.season === season || o.season === 'year-round')
    if (typeFilter !== 'all') items = items.filter(o => o.type === typeFilter)
    items = items.filter(o => o.mag <= magLimit)
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
  }, [season, typeFilter, search, sort, magLimit])

  // Group by constellation if enabled
  const grouped = useMemo(() => {
    if (!groupByConst) return null
    const map = new Map<string, DSO[]>()
    for (const obj of filtered) {
      const key = obj.constellation
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(obj)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered, groupByConst])

  const renderObj = (obj: DSO) => {
    const meta = TYPE_META[obj.type]
    const isSelected = selected?.name === obj.name
    const isLogging = loggingObj === obj.name
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
                  <div><span className="text-gray-600">Mag: </span><span className="text-gray-300">{obj.mag}</span></div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setLoggingObj(isLogging ? null : obj.name) }}
                  className="mt-2 px-3 py-1 rounded-lg text-[10px] font-semibold transition-all"
                  style={{
                    background: isLogging ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    color: '#a5b4fc',
                  }}>
                  📓 Add to Log
                </button>
                {isLogging && (
                  <MiniLogForm obj={obj} onClose={() => setLoggingObj(null)} />
                )}
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
  }

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

      {/* Magnitude slider */}
      <div className="mb-3 px-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Magnitude Limit</span>
          <span className="text-[10px] font-bold" style={{ color: magLimit < 7 ? '#fbbf24' : magLimit < 10 ? '#60a5fa' : '#9ca3af' }}>
            ≤ {magLimit.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={6}
          max={14}
          step={0.5}
          value={magLimit}
          onChange={e => setMagLimit(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: '#6366f1', background: `linear-gradient(to right, #6366f1 ${((magLimit - 6) / 8) * 100}%, rgba(255,255,255,0.1) 0%)` }}
        />
        <div className="flex justify-between mt-0.5">
          <span className="text-[8px] text-gray-700">6 (easy)</span>
          <span className="text-[8px] text-gray-700">14 (faint)</span>
        </div>
      </div>

      {/* Group by constellation toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setGroupByConst(g => !g)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold transition-all"
          style={groupByConst
            ? { background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#fde68a' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
          ✦ Group by Constellation
        </button>
      </div>

      {/* Object list */}
      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.3) transparent' }}>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm">No objects match your filters</div>
        )}

        {groupByConst && grouped ? (
          grouped.map(([constellation, objs]) => (
            <div key={constellation}>
              <div className="sticky top-0 px-2 py-1 mb-1 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                style={{ background: 'rgba(15,18,35,0.95)', color: '#4b5563', backdropFilter: 'blur(4px)' }}>
                ✦ {constellation} <span className="font-normal text-gray-700 normal-case">({objs.length})</span>
              </div>
              <div className="space-y-2">
                {objs.map(renderObj)}
              </div>
            </div>
          ))
        ) : (
          filtered.map(renderObj)
        )}
      </div>

      <p className="text-[10px] text-gray-700 mt-4 text-center">Data: Messier Catalog · NGC / IC Catalogs · SEDS</p>
    </div>
  )
}
