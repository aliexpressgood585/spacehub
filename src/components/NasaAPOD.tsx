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
    <div className="neon-border glass rounded-lg p-8 text-center">
      <div className="text-4xl mb-4 animate-pulse">🔭</div>
      <p className="text-gray-400">Loading NASA Astronomy Picture of the Day...</p>
    </div>
  )

  if (error || !apod) return (
    <div className="neon-border glass rounded-lg overflow-hidden">
      <div className="p-6 border-b border-space-700 flex items-center gap-3">
        <span className="text-2xl">🔭</span>
        <h3 className="text-xl font-bold text-white">Astronomy Picture of the Day — NASA APOD</h3>
      </div>
      <div className="relative overflow-hidden" style={{ minHeight: 320 }}>
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/GoldenGateBridge-001.jpg/1280px-GoldenGateBridge-001.jpg"
          alt="Space"
          className="w-full object-cover opacity-40"
          style={{ minHeight: 320 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
          <span className="text-6xl mb-4">🌌</span>
          <p className="text-white font-bold text-lg mb-2">NASA APOD — Loading</p>
          <p className="text-gray-400 text-sm">Today's astronomy image is being fetched from NASA.<br/>Check back in a moment.</p>
          <a href="https://apod.nasa.gov" target="_blank" rel="noopener noreferrer" className="mt-4 text-indigo-400 text-sm hover:underline">
            View on NASA website →
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <div className="neon-border glass rounded-lg overflow-hidden">
      <div className="p-6 border-b border-space-700">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🔭</span>
          <h3 className="text-xl font-bold text-white">Astronomy Picture of the Day — NASA APOD</h3>
          <span className="ml-auto text-xs text-gray-500 bg-space-800 px-2 py-1 rounded">{apod.date}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className="relative overflow-hidden" style={{ minHeight: 320 }}>
          {apod.media_type === 'image' ? (
            <img
              src={apod.url}
              alt={apod.title}
              className="w-full h-full object-cover"
              style={{ minHeight: 320 }}
            />
          ) : (
            <iframe
              src={apod.url}
              className="w-full"
              style={{ height: 320, border: 'none' }}
              allowFullScreen
              title={apod.title}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </div>

        <div className="p-6 flex flex-col justify-between">
          <div>
            <h4 className="text-xl font-bold text-indigo-300 mb-3">{apod.title}</h4>
            <p className="text-gray-300 text-sm leading-relaxed line-clamp-8">
              {apod.explanation}
            </p>
          </div>
          {apod.copyright && (
            <p className="text-xs text-gray-500 mt-4">© {apod.copyright}</p>
          )}
          <div className="mt-4 flex gap-2">
            <span className="text-xs bg-indigo-900/50 text-indigo-300 px-3 py-1 rounded-full border border-indigo-700/50">NASA APOD</span>
            <span className="text-xs bg-space-800 text-gray-400 px-3 py-1 rounded-full border border-space-700">Updated Daily</span>
          </div>
        </div>
      </div>
    </div>
  )
}
