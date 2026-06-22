import { useState, useEffect, useMemo } from 'react'

const CURATED = [
  {
    title: 'Pillars of Creation — Eagle Nebula',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg/800px-Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg',
    explanation: 'The iconic Pillars of Creation, captured by the Hubble Space Telescope in 2014. These towering columns of gas and dust in the Eagle Nebula (M16) are stellar nurseries where new stars are being born from collapsing clouds of hydrogen.',
    date: 'Hubble Space Telescope · M16 Eagle Nebula',
  },
  {
    title: 'Saturn During Equinox — Cassini',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/800px-Saturn_during_Equinox.jpg',
    explanation: 'Saturn photographed by NASA\'s Cassini spacecraft during equinox, when the Sun illuminates the rings edge-on, revealing their true razor-thin profile. The rings are up to 282,000 km wide but only about 10 metres thick.',
    date: 'NASA Cassini · Saturn System',
  },
  {
    title: 'Andromeda Galaxy — M31',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Andromeda_Galaxy_560mm_FL.jpg/800px-Andromeda_Galaxy_560mm_FL.jpg',
    explanation: 'The Andromeda Galaxy (M31), our nearest major galactic neighbor, photographed from Earth. Located 2.5 million light-years away, it contains over a trillion stars. In about 4.5 billion years it will collide and merge with our Milky Way.',
    date: 'Ground-based Astrophotography · M31',
  },
  {
    title: 'Jupiter — Great Red Spot',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/800px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg',
    explanation: 'Jupiter and its Great Red Spot — a storm larger than Earth that has raged for at least 350 years. Jupiter is the largest planet in our solar system, with a mass 318 times that of Earth and 67 known moons.',
    date: 'Hubble Space Telescope · Jupiter',
  },
  {
    title: 'Aurora Borealis — Northern Lights',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Polarlicht_2.jpg/800px-Polarlicht_2.jpg',
    explanation: 'The Northern Lights (Aurora Borealis) paint the sky in shades of green, blue, and red. Auroras are caused by solar wind particles exciting oxygen and nitrogen atoms in Earth\'s upper atmosphere, creating light at altitudes of 100–300 km.',
    date: 'High-latitude Observation · Earth Atmosphere',
  },
]

interface APODData {
  title: string
  explanation: string
  url: string
  media_type: string
  date: string
  copyright?: string
}

export default function NasaAPOD() {
  const [apod, setApod] = useState<APODData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const fallback = useMemo(() => CURATED[Math.floor(Date.now() / 86400000) % CURATED.length], [])

  useEffect(() => {
    fetch('/api/apod')
      .then(r => { if (!r.ok) throw new Error(''); return r.json() })
      .then(data => {
        if (data.error || !data.url) throw new Error('')
        setApod(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div className="space-card p-8 text-center">
      <div className="text-5xl mb-4 animate-pulse">🔭</div>
      <p className="text-gray-400 text-sm">Loading NASA Astronomy Picture of the Day...</p>
    </div>
  )

  if (error || !apod) return (
    <div className="space-card overflow-hidden">
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="icon-box">🔭</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-base">NASA — Astronomy Picture of the Day</h3>
          <p className="text-gray-500 text-xs">Curated space imagery</p>
        </div>
        <span
          className="flex-shrink-0 text-xs px-3 py-1 rounded-full font-semibold"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
        >
          Space Gallery
        </span>
      </div>
      <div className="relative overflow-hidden" style={{ maxHeight: 400 }}>
        <img
          src={fallback.url}
          alt={fallback.title}
          className="w-full object-cover"
          style={{ maxHeight: 400 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(2,5,16,0.8) 0%, transparent 50%)' }} />
      </div>
      <div className="p-5">
        <h4 className="text-indigo-300 font-black text-lg mb-3">{fallback.title}</h4>
        <p className="text-gray-400 text-sm leading-relaxed line-clamp-4 mb-4">{fallback.explanation}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs px-3 py-1 rounded-full font-semibold"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}
          >
            NASA APOD
          </span>
          <a
            href="https://apod.nasa.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 hover:text-indigo-400 transition ml-auto"
          >
            View full archive →
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-card overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="icon-box">🔭</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-base">NASA — Astronomy Picture of the Day</h3>
          <p className="text-gray-500 text-xs">Updated daily</p>
        </div>
        <span
          className="flex-shrink-0 text-xs px-3 py-1 rounded-full font-semibold"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
        >
          {apod.date}
        </span>
      </div>

      {/* Image / video */}
      <div className="relative overflow-hidden" style={{ maxHeight: 400 }}>
        {apod.media_type === 'image' ? (
          <img
            src={apod.url}
            alt={apod.title}
            className="w-full object-cover"
            style={{ maxHeight: 400 }}
          />
        ) : (
          <iframe
            src={apod.url}
            className="w-full"
            style={{ height: 360, border: 'none' }}
            allowFullScreen
            title={apod.title}
          />
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(2,5,16,0.7) 0%, transparent 50%)' }} />
      </div>

      {/* Content */}
      <div className="p-5">
        <h4 className="text-indigo-300 font-black text-lg mb-3">{apod.title}</h4>
        <p className="text-gray-400 text-sm leading-relaxed line-clamp-5 mb-4">{apod.explanation}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs px-3 py-1 rounded-full font-semibold"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}
          >
            NASA APOD
          </span>
          <span
            className="text-xs px-3 py-1 rounded-full font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
          >
            Updated Daily
          </span>
          {apod.copyright && (
            <span className="text-xs text-gray-600 ml-auto">© {apod.copyright}</span>
          )}
        </div>
      </div>
    </div>
  )
}
