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

export default function SpaceNewsFeed() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch(`https://api.spaceflightnewsapi.net/v4/articles/?limit=6&offset=${page * 6}&ordering=-published_at`)
      .then(r => r.json())
      .then(data => {
        setArticles(data.results || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [page])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="icon-box">📰</div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-base">Space News — Live</h3>
          <p className="text-gray-500 text-xs">Spaceflight News API · Latest articles</p>
        </div>
        <div className="live-badge">
          <span className="live-dot" /> LIVE
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="h-40" style={{ background: 'rgba(255,255,255,0.05)' }} />
              <div className="p-4 space-y-2">
                <div className="h-4 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', width: '75%' }} />
                <div className="h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
                <div className="h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.03)', width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map(article => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl overflow-hidden transition-all hover:-translate-y-1 block group"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' }}
              >
                <div className="relative overflow-hidden" style={{ height: 160 }}>
                  {article.image_url ? (
                    <img
                      src={article.image_url}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))' }}
                    >
                      <span className="text-5xl">🚀</span>
                    </div>
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(2,5,16,0.85) 0%, transparent 50%)' }} />
                  <span
                    className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#9ca3af', backdropFilter: 'blur(4px)' }}
                  >
                    {article.news_site}
                  </span>
                </div>
                <div className="p-4">
                  <h4 className="text-sm font-bold text-white mb-2 line-clamp-2 leading-snug group-hover:text-indigo-300 transition-colors">
                    {article.title}
                  </h4>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{article.summary}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-700">{formatDate(article.published_at)}</p>
                    <span className="text-xs text-indigo-500 group-hover:text-indigo-400 transition-colors">Read →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>

          <div className="flex justify-center items-center gap-4 mt-6">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 text-sm rounded-xl transition disabled:opacity-30"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
            >
              ← Previous
            </button>
            <span
              className="px-4 py-2 text-sm rounded-xl font-semibold"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}
            >
              Page {page + 1}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 text-sm rounded-xl transition"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
