import { useEffect, useMemo } from 'react'
import { Link, useParams, useNavigate, Navigate } from 'react-router-dom'
import { ARTICLES, ArticleView } from './BlogPage'
import { TOOLS } from './toolsRegistry'
import { useJsonLd, breadcrumbLd } from '../lib/jsonLd'

// Pick tools that genuinely relate to what the article is about, by matching
// the article's slug and title against each tool's own words. Beats a fixed
// list: a piece about meteor showers should not lead with a telescope advisor.
function relatedTools(haystack: string) {
  const words = haystack.toLowerCase()
  const scored = TOOLS.map(t => {
    const terms = `${t.slug.replace(/-/g, ' ')} ${t.title}`.toLowerCase().split(/[^a-z]+/)
    const score = new Set(terms.filter(w => w.length > 3 && words.includes(w))).size
    return { tool: t, score }
  })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(x => x.tool)

  // Always give the reader somewhere to go, even on an unmatched article.
  if (scored.length) return scored
  return TOOLS.filter(t => ['tonights-sky', 'star-map', 'iss-pass-predictor'].includes(t.slug))
}

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const article = ARTICLES.find(a => a.slug === slug)

  const tools = useMemo(
    () => (article ? relatedTools(`${article.slug} ${article.title}`) : []),
    [article],
  )

  const ld = useMemo(
    () =>
      article
        ? {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'BlogPosting',
                headline: article.title,
                description: article.preview.slice(0, 200),
                datePublished: new Date(article.date).toISOString().slice(0, 10),
                url: `https://www.spacehubapp.com/blog/${article.slug}`,
                mainEntityOfPage: `https://www.spacehubapp.com/blog/${article.slug}`,
                author: { '@type': 'Organization', name: 'SpaceHub' },
                publisher: { '@type': 'Organization', name: 'SpaceHub', url: 'https://www.spacehubapp.com' },
              },
              breadcrumbLd([
                { name: 'SpaceHub', path: '/' },
                { name: 'Blog', path: '/blog' },
                { name: article.title, path: `/blog/${article.slug}` },
              ]),
            ],
          }
        : null,
    [article],
  )
  useJsonLd(`blog-${slug}`, ld)

  useEffect(() => {
    if (!article) return
    const prev = document.title
    document.title = `${article.title} | SpaceHub`
    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prevDesc = metaDesc?.content ?? ''
    if (metaDesc) metaDesc.content = article.preview.slice(0, 160)
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const prevCanonical = canonical?.href ?? ''
    if (canonical) canonical.href = `https://www.spacehubapp.com/blog/${article.slug}`
    return () => {
      document.title = prev
      if (metaDesc) metaDesc.content = prevDesc
      if (canonical) canonical.href = prevCanonical
    }
  }, [article])

  if (!article) return <Navigate to="/blog" replace />

  return (
    <div style={{ background: '#020510', minHeight: '100vh' }}>
      <div className="relative" style={{ zIndex: 1 }}>
        <ArticleView
          article={article}
          onBack={() => navigate('/blog')}
          onSelect={s => navigate(`/blog/${s}`)}
        />

        <div className="max-w-3xl mx-auto px-4 pb-12">
          <h2 className="text-white font-bold text-base mb-3">Try it yourself</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tools.map(t => (
              <li key={t.slug}>
                <Link
                  to={`/tools/${t.slug}`}
                  className="block px-4 py-3 rounded-xl text-sm text-gray-300 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <span className="font-semibold">{t.title.split('—')[0].trim()}</span>
                  <span className="block text-gray-500 text-xs mt-0.5">{t.blurb.slice(0, 90)}…</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
