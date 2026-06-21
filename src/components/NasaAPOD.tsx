import { useState, useEffect } from 'react'

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

  useEffect(() => {
    const key = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY'
    fetch(`https://api.nasa.gov/planetary/apod?api_key=${key}`)
      .then(r => r.json())
      .then(data => {
        if (data.error || data.code === 'API_KEY_INVALID' || !data.url) {
          setError(true)
        } else {
          setApod(data)
        }
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
        <div>
          <h3 className="text-white font-bold text-base">NASA — Astronomy Picture of the Day</h3>
          <p className="text-gray-500 text-xs">Updated daily by NASA</p>
        </div>
      </div>
      <div className="relative overflow-hidden" style={{ minHeight: 280 }}>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-8"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))' }}
        >
          <span className="text-6xl mb-4">🌌</span>
          <p className="text-white font-bold text-lg mb-2">NASA APOD</p>
          <p className="text-gray-500 text-sm mb-4">Today's astronomy image is loading from NASA.</p>
          <a
            href="https://apod.nasa.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 text-sm hover:text-indigo-300 transition"
          >
            View on NASA website →
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
