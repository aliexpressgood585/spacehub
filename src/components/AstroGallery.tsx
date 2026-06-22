import { useRef, useState, useEffect, useCallback } from 'react'
import { useLang } from '../i18n/LangContext'

interface GalleryItem {
  title: string
  url: string
  thumb: string
  date: string
  nasa_id: string
}

type NasaApiItem = {
  data: { title: string; date_created: string; nasa_id: string }[]
  links?: { href: string }[]
}

const DEFAULT_QUERIES = ['nebula hubble', 'earth orbit iss', 'galaxy deep space', 'saturn cassini', 'moon apollo', 'mars surface']
const SUGGESTED = ['Black Hole', 'Jupiter', 'Aurora', 'Milky Way', 'Exoplanet', 'Supernova', 'Comet', 'Andromeda']

async function fetchNasaImages(query: string): Promise<GalleryItem[]> {
  const r = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=20`)
  if (!r.ok) throw new Error('')
  const json = await r.json() as { collection: { items: NasaApiItem[] } }
  const items = json.collection.items
  return items
    .filter(i => i.links?.[0]?.href)
    .slice(0, 12)
    .map(i => ({
      title: i.data[0]?.title ?? 'NASA Image',
      date: i.data[0]?.date_created?.slice(0, 10) ?? '',
      url: i.links![0].href,
      thumb: i.links![0].href,
      nasa_id: i.data[0]?.nasa_id ?? '',
    }))
}

export default function AstroGallery() {
  const { t } = useLang()
  const inputRef = useRef<HTMLInputElement>(null)
  const [userPhoto, setUserPhoto] = useState<string | null>(null)
  const [selected, setSelected] = useState<GalleryItem | null>(null)
  const [photos, setPhotos] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')

  const loadImages = useCallback((query: string) => {
    setLoading(true)
    setError(false)
    setSelected(null)
    fetchNasaImages(query)
      .then(photos => {
        if (photos.length === 0) throw new Error('empty')
        setPhotos(photos)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  useEffect(() => {
    const q = DEFAULT_QUERIES[Math.floor(Math.random() * DEFAULT_QUERIES.length)]
    setActiveQuery(q)
    loadImages(q)
  }, [loadImages])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchInput.trim()
    if (!q) return
    setActiveQuery(q)
    loadImages(q)
  }

  const handleSuggestion = (q: string) => {
    setSearchInput(q)
    setActiveQuery(q)
    loadImages(q)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setUserPhoto(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const shareX = (title: string) => {
    const text = `🔭 ${title} — via SpaceHub`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://spacehub-nu.vercel.app')}`, '_blank')
  }

  const shareWA = (title: string) => {
    const text = `🔭 ${title} — SpaceHub https://spacehub-nu.vercel.app`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="space-y-5">
      <div className="space-card p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="icon-box">🔭</div>
          <div>
            <h3 className="text-white font-bold text-lg">{t('gallery.title')}</h3>
            <p className="text-gray-500 text-xs">{t('gallery.subtitle')}</p>
          </div>
        </div>

        <div className="divider-glow my-5" />

        {/* Upload section */}
        <div className="mb-6">
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          {userPhoto ? (
            <div className="rounded-2xl overflow-hidden border border-indigo-500/30 relative group">
              <img src={userPhoto} alt="Your photo" className="w-full max-h-80 object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button onClick={() => shareX(t('gallery.preview'))} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'rgba(29,161,242,0.8)' }}>{t('gallery.shareX')}</button>
                <button onClick={() => shareWA(t('gallery.preview'))} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'rgba(37,211,102,0.8)' }}>{t('gallery.shareWA')}</button>
              </div>
              <button onClick={() => { setUserPhoto(null); if (inputRef.current) inputRef.current.value = '' }} className="absolute top-3 right-3 text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: 'rgba(0,0,0,0.6)', color: '#9ca3af' }}>
                {t('gallery.chooseAnother')}
              </button>
            </div>
          ) : (
            <button onClick={() => inputRef.current?.click()} className="w-full py-10 rounded-2xl border-2 border-dashed border-indigo-500/30 hover:border-indigo-500/60 transition-all flex flex-col items-center gap-2" style={{ background: 'rgba(99,102,241,0.04)' }}>
              <span className="text-4xl">📷</span>
              <span className="text-white font-semibold text-sm">{t('gallery.upload')}</span>
              <span className="text-gray-600 text-xs">JPG, PNG, HEIC</span>
            </button>
          )}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search NASA images... (e.g. Jupiter, Aurora, Nebula)"
              className="flex-1 text-sm px-4 py-2.5 rounded-xl text-white placeholder-gray-600 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button type="submit" className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all" style={{ background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.5)' }}>
              🔍
            </button>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {SUGGESTED.map(s => (
              <button key={s} type="button" onClick={() => handleSuggestion(s)} className="text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-all" style={{ background: activeQuery.toLowerCase() === s.toLowerCase() ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)', border: activeQuery.toLowerCase() === s.toLowerCase() ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.06)', color: activeQuery.toLowerCase() === s.toLowerCase() ? '#c4b5fd' : '#6b7280' }}>
                {s}
              </button>
            ))}
          </div>
        </form>

        {/* NASA gallery header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold">
            {activeQuery ? `Results: ${activeQuery}` : t('gallery.inspire')}
          </p>
          <span className="text-[10px] text-gray-700 flex items-center gap-1">
            <span className="live-dot" style={{ background: '#6366f1', boxShadow: '0 0 6px rgba(99,102,241,0.8)' }} />
            NASA
          </span>
        </div>

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '4/3', background: 'rgba(99,102,241,0.08)' }} />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">🌌</div>
            <p className="text-gray-500 text-sm font-semibold mb-1">Could not reach NASA servers</p>
            <p className="text-gray-700 text-xs">Check your connection and try again</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <button key={i} onClick={() => setSelected(selected?.title === photo.title ? null : photo)} className="relative rounded-xl overflow-hidden group text-left" style={{ aspectRatio: '4/3' }}>
                <img src={photo.thumb} alt={photo.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                  <p className="text-white text-[10px] font-bold leading-tight line-clamp-2">{photo.title}</p>
                  <p className="text-gray-400 text-[9px]">NASA</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-4 p-4 rounded-2xl flex flex-col gap-3" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p className="text-white text-sm font-semibold">{selected.title}</p>
            <p className="text-gray-500 text-xs leading-relaxed">{selected.date}</p>
            <div className="flex gap-2">
              <button onClick={() => shareX(selected.title)} className="text-xs px-3 py-1.5 rounded-xl font-semibold transition" style={{ background: 'rgba(29,161,242,0.15)', border: '1px solid rgba(29,161,242,0.3)', color: '#60a5fa' }}>{t('gallery.shareX')}</button>
              <button onClick={() => shareWA(selected.title)} className="text-xs px-3 py-1.5 rounded-xl font-semibold transition" style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#4ade80' }}>{t('gallery.shareWA')}</button>
              <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-xl font-semibold transition" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}>View ↗</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
