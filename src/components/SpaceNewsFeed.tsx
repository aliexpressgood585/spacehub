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
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="neon-border glass rounded-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">📰</span>
        <h3 className="text-xl font-bold text-white">חדשות חלל — בזמן אמת</h3>
        <span className="ml-auto flex items-center gap-2 text-xs text-blue-400">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
          Spaceflight News API
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass rounded-lg overflow-hidden animate-pulse">
              <div className="bg-space-700 h-40" />
              <div className="p-4 space-y-2">
                <div className="bg-space-700 h-4 rounded w-3/4" />
                <div className="bg-space-700 h-3 rounded w-full" />
                <div className="bg-space-700 h-3 rounded w-2/3" />
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
                className="glass rounded-lg overflow-hidden border border-space-700 hover:border-indigo-500/50 transition-all hover:-translate-y-1 block"
              >
                <div className="relative overflow-hidden" style={{ height: 160 }}>
                  {article.image_url ? (
                    <img
                      src={article.image_url}
                      alt={article.title}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-space-800 to-indigo-900 flex items-center justify-center">
                      <span className="text-4xl">🚀</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-2 left-2 text-xs bg-black/60 text-gray-300 px-2 py-0.5 rounded">
                    {article.news_site}
                  </span>
                </div>
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2 leading-snug">{article.title}</h4>
                  <p className="text-xs text-gray-400 line-clamp-2 mb-3">{article.summary}</p>
                  <p className="text-xs text-gray-600">{formatDate(article.published_at)}</p>
                </div>
              </a>
            ))}
          </div>

          <div className="flex justify-center gap-4 mt-6">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 text-sm glass rounded-lg border border-space-700 text-gray-300 hover:border-indigo-500 disabled:opacity-30 transition"
            >
              ← קודם
            </button>
            <span className="px-4 py-2 text-sm text-gray-500">עמוד {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 text-sm glass rounded-lg border border-space-700 text-gray-300 hover:border-indigo-500 transition"
            >
              הבא →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
