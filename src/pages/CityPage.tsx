import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, lazy, Suspense } from 'react'
// Lazy so this shares the same chunk the homepage already loads on demand —
// a static import here would pull ISSAlertSystem into the city chunk as well.
const ISSAlertSystem = lazy(() => import('../components/ISSAlertSystem'))

import { CITY_DATA } from '../data/cities'


// The tools that are genuinely useful from a specific place, phrased for it.
const CITY_TOOL_LINKS: { slug: string; label: string; hint: (city: string) => string }[] = [
  { slug: 'iss-pass-predictor', label: '🛰️ ISS Pass Predictor', hint: c => `Exact times the station crosses ${c}` },
  { slug: 'tonights-sky',       label: "🌌 Tonight's Sky",       hint: c => `Planets and stars visible from ${c} tonight` },
  { slug: 'star-map',           label: '🗺️ Interactive Star Map', hint: c => `Live map of the sky above ${c}` },
  { slug: 'moon-phase',         label: '🌙 Moon Phase Tonight',   hint: c => `Illumination, moonrise and moonset in ${c}` },
  { slug: 'light-pollution',    label: '💡 Light Pollution Map',  hint: c => `How dark the sky really is around ${c}` },
  { slug: 'seeing-forecast',    label: '🔭 Seeing Forecast',      hint: c => `The best nights to observe from ${c}` },
]

export default function CityPage() {
  const { city } = useParams<{ city: string }>()
  const data = city ? CITY_DATA[city] : null
  const [issPos, setIssPos] = useState<{ lat: number; lng: number; alt: number } | null>(null)

  useEffect(() => {
    if (!data) return
    document.title = `ISS over ${data.name} — Live Tracker | SpaceHub`
    const desc = document.querySelector('meta[name="description"]')
    if (desc) desc.setAttribute('content', `Track the International Space Station live over ${data.name}. See real-time ISS position, distance, altitude and get notified when it passes overhead.`)
  }, [data])

  useEffect(() => {
    if (!data) return
    fetch('/api/iss')
      .then(r => r.json())
      .then(d => setIssPos({ lat: d.latitude, lng: d.longitude, alt: d.altitude }))
      .catch(() => {})
  }, [data])

  if (!data) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-4xl mb-4">🌍</p>
      <h2 className="text-2xl font-bold text-white mb-4">City Not Found</h2>
      <Link to="/" className="text-indigo-400 hover:text-indigo-300">Back to SpaceHub</Link>
    </div>
  )

  const dist = issPos ? (() => {
    const R = 6371
    const dLat = (issPos.lat - data.lat) * Math.PI / 180
    const dLng = (issPos.lng - data.lng) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(data.lat*Math.PI/180)*Math.cos(issPos.lat*Math.PI/180)*Math.sin(dLng/2)**2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
  })() : null

  return (
    <div className="min-h-screen" style={{ background: '#050816' }}>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/" className="text-indigo-400 text-sm mb-8 hover:text-indigo-300 flex items-center gap-1">← Back to SpaceHub</Link>

        <div className="text-center mb-10">
          <span className="section-label mb-4 inline-flex">🛸 ISS</span>
          <h1 className="text-4xl font-black text-white mt-3">
            ISS over <span className="gradient-text">{data.name}</span>
          </h1>
          <p className="text-gray-500 mt-2">{data.desc}</p>
        </div>

        {/* Live stats */}
        {issPos && dist !== null && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{dist.toLocaleString()}</p>
              <p className="text-xs text-gray-600">km from ISS</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{issPos.alt.toFixed(0)}</p>
              <p className="text-xs text-gray-600">ISS Altitude (km)</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">92</p>
              <p className="text-xs text-gray-600">mins per orbit</p>
            </div>
          </div>
        )}

        <Suspense fallback={null}><ISSAlertSystem /></Suspense>

        {/* SEO content */}
        <div className="space-card p-6 mt-6">
          <h2 className="text-lg font-bold text-white mb-3">When to See the ISS from {data.name}?</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">
            The International Space Station (ISS) passes over {data.name} (lat {data.lat.toFixed(1)}°, lon {data.lng.toFixed(1)}°) several times each day.
            It is visible to the naked eye as a bright moving white dot in the sky, typically 30–45 minutes before sunrise or after sunset.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            Use SpaceHub's ISS Live system to know exactly when the ISS passes over {data.name} and get an alert in advance.
          </p>
        </div>

        {/* Tools — these 183 city pages are the site's widest crawl surface, so
            linking the tool pages from here is what gets them discovered. */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">
            Stargazing Tools for {data.name}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {CITY_TOOL_LINKS.map(tool => (
              <Link
                key={tool.slug}
                to={`/tools/${tool.slug}`}
                className="block px-4 py-3 rounded-xl text-sm text-gray-300 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span className="font-semibold">{tool.label}</span>
                <span className="block text-gray-500 text-xs mt-0.5">{tool.hint(data.name)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Other cities */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">More Cities</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CITY_DATA).filter(([slug]) => slug !== city).map(([slug, c]) => (
              <Link key={slug} to={`/iss/${slug}`} className="text-xs px-3 py-1.5 glass rounded-lg border border-white/5 text-gray-500 hover:text-indigo-400 hover:border-indigo-500/30 transition">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
