import { useState, useEffect } from 'react'

interface Article {
  id: number
  title: string
  url: string
  image_url: string
  news_site: string
  summary: string
  published_at: string
}

const TOPICS = ['SpaceX', 'Starship', 'Falcon 9', 'Starlink', 'All']

export default function SpaceXNewsFeed() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [topic, setTopic] = useState('SpaceX')

  useEffect(() => {
    setLoading(true)
    setError(false)
    const q = topic === 'All' ? 'space' : encodeURIComponent(topic)
    fetch(`https://api.spaceflightnewsapi.net/v4/articles/?search=${q}&limit=8&ordering=-published_at`)
      .then(r => { if (!r.ok) throw new Error(''); return r.json() })
      .then(data => {
        setArticles(data.results || [])
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [topic])

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3.6e6)
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-box">🚀</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">SpaceX Live Feed</h3>
          <p className="text-gray-500 text-xs">Latest news & mission updates</p>
        </div>
        <div className="live-badge"><span className="live-dot" /> LIVE</div>
      </div>

      {/* Topic filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TOPICS.map(t => (
          <button
            key={t}
            onClick={() => setTopic(t)}
            className="text-[10px] px-3 py-1 rounded-lg font-semibold transition-all"
            style={topic === t
              ? { background: 'rgba(248,113,113,0.2)', border: '1px solid rgba(248,113,113,0.5)', color: '#f87171' }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="w-14 h-14 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', width: '80%' }} />
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">Could not load news feed</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {articles.map(a => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-3 rounded-xl transition-all group"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)')}
            >
              {a.image_url && (
                <img
                  src={a.image_url}
                  alt=""
                  className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold leading-snug line-clamp-2 group-hover:text-red-300 transition-colors">{a.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                    {a.news_site}
                  </span>
                  <span className="text-[10px] text-gray-700">{timeAgo(a.published_at)}</span>
                </div>
              </div>
              <span className="text-gray-700 group-hover:text-gray-400 transition-colors flex-shrink-0 self-center">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
