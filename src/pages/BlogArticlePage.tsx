import { useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ARTICLES, ArticleView } from './BlogPage'

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const article = ARTICLES.find(a => a.slug === slug)

  useEffect(() => {
    if (!article) return
    const prev = document.title
    document.title = `${article.title} | SpaceHub`
    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prevDesc = metaDesc?.content ?? ''
    if (metaDesc) metaDesc.content = article.preview.slice(0, 160)
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
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
      </div>
    </div>
  )
}
