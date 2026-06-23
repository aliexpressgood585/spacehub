import { useState, useEffect, useMemo, useCallback } from 'react'

function ImageWithSkeleton({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const fallbackSrc = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Andromeda_Galaxy_560mm_FL.jpg/800px-Andromeda_Galaxy_560mm_FL.jpg'

  const handleError = useCallback(() => {
    if (!errored) { setErrored(true); setLoaded(true) }
  }, [errored])

  return (
    <>
      {!loaded && (
        <div className="skeleton-line w-full" style={{ height: 400 }} />
      )}
      <img
        src={errored ? fallbackSrc : src}
        alt={alt}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className="w-full object-cover transition-opacity duration-500"
        style={{ maxHeight: 400, opacity: loaded ? 1 : 0, position: loaded ? 'relative' : 'absolute' }}
      />
    </>
  )
}

const CURATED = [
  { title: 'Pillars of Creation — Eagle Nebula', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg/800px-Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg', explanation: 'The iconic Pillars of Creation, captured by the Hubble Space Telescope in 2014. These towering columns of gas and dust in the Eagle Nebula are stellar nurseries where new stars are being born.', date: 'Hubble Space Telescope · M16 Eagle Nebula' },
  { title: 'Saturn During Equinox — Cassini', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/800px-Saturn_during_Equinox.jpg', explanation: "Saturn photographed by NASA's Cassini spacecraft during equinox. The rings are up to 282,000 km wide but only about 10 metres thick.", date: 'NASA Cassini · Saturn System' },
  { title: 'Andromeda Galaxy — M31', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Andromeda_Galaxy_560mm_FL.jpg/800px-Andromeda_Galaxy_560mm_FL.jpg', explanation: 'The Andromeda Galaxy, our nearest major galactic neighbor at 2.5 million light-years away. In about 4.5 billion years it will collide with the Milky Way.', date: 'Ground-based Astrophotography · M31' },
]

interface APODData {
  title: string
  explanation: string
  url: string
  hdurl?: string
  media_type: string
  date: string
  copyright?: string
}

export default function NasaAPOD() {
  const [apods, setApods] = useState<APODData[]>([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const fallback = useMemo(() => CURATED[Math.floor(Date.now() / 86400000) % CURATED.length], [])

  useEffect(() => {
    const parseApods = (data: unknown) => {
      const arr: APODData[] = Array.isArray(data) ? data : [data as APODData]
      return arr.filter(d => d.url && d.media_type === 'image').reverse()
    }

    fetch('/api/apod?count=7')
      .then(r => { if (!r.ok) throw new Error(''); return r.json() })
      .then(data => {
        const images = parseApods(data)
        if (images.length === 0) throw new Error('')
        setApods(images)
        setLoading(false)
      })
      .catch(() =>
        fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=7')
          .then(r => { if (!r.ok) throw new Error(''); return r.json() })
          .then(data => {
            const images = parseApods(data)
            if (images.length === 0) throw new Error('')
            setApods(images)
            setLoading(false)
          })
          .catch(() => { setError(true); setLoading(false) })
      )
  }, [])

  if (loading) return (
    <div className="space-card p-8 text-center">
      <div className="text-5xl mb-4 animate-pulse">🔭</div>
      <p className="text-gray-400 text-sm">Loading NASA Astronomy Picture of the Day...</p>
    </div>
  )

  if (error || apods.length === 0) return (
    <div className="space-card overflow-hidden">
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="icon-box">🔭</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">NASA — Astronomy Picture of the Day</h3>
          <p className="text-gray-500 text-xs">Curated space imagery</p>
        </div>
      </div>
      <div className="relative overflow-hidden" style={{ maxHeight: 400 }}>
        <img src={fallback.url} alt={fallback.title} loading="lazy" className="w-full object-cover" style={{ maxHeight: 400 }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(2,5,16,0.8) 0%, transparent 50%)' }} />
      </div>
      <div className="p-5">
        <h4 className="text-indigo-300 font-black text-lg mb-3">{fallback.title}</h4>
        <p className="text-gray-400 text-sm leading-relaxed line-clamp-4 mb-4">{fallback.explanation}</p>
        <a href="https://apod.nasa.gov" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-indigo-400 transition">View full archive →</a>
      </div>
    </div>
  )

  const apod = apods[current]

  return (
    <div className="space-card overflow-hidden">
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="icon-box">🔭</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">NASA — Astronomy Picture of the Day</h3>
          <p className="text-gray-500 text-xs">Last {apods.length} days</p>
        </div>
        <span className="flex-shrink-0 text-xs px-3 py-1 rounded-full font-semibold" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
          {apod.date}
        </span>
      </div>

      {/* Day selector */}
      {apods.length > 1 && (
        <div className="flex gap-1.5 px-5 pt-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {apods.map((a, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
              style={i === current ? {
                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd',
              } : {
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#6b7280',
              }}
            >
              {i === 0 ? 'Today' : a.date.slice(5)}
            </button>
          ))}
        </div>
      )}

      <div className="relative overflow-hidden mt-4" style={{ maxHeight: 400, background: 'rgba(8,11,34,0.8)' }}>
        {apod.media_type === 'image' ? (
          <ImageWithSkeleton src={apod.url} alt={apod.title} />
        ) : (
          <iframe src={apod.url} className="w-full" style={{ height: 360, border: 'none' }} allowFullScreen title={apod.title} />
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(2,5,16,0.7) 0%, transparent 50%)' }} />

        {/* Prev/Next arrows */}
        {apods.length > 1 && (
          <>
            <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-20" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>‹</button>
            <button onClick={() => setCurrent(c => Math.min(apods.length - 1, c + 1))} disabled={current === apods.length - 1} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-20" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>›</button>
          </>
        )}
      </div>

      <div className="p-5">
        <h4 className="text-indigo-300 font-black text-lg mb-3">{apod.title}</h4>
        <p className="text-gray-400 text-sm leading-relaxed line-clamp-5 mb-4">{apod.explanation}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>NASA APOD</span>
          {apod.copyright && <span className="text-xs text-gray-600">© {apod.copyright}</span>}
          {apod.hdurl && (
            <a href={apod.hdurl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-indigo-400 transition ml-auto">HD ↗</a>
          )}
        </div>
      </div>
    </div>
  )
}
