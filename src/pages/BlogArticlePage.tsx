import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ARTICLES, ArticleView } from './BlogPage'

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const article = ARTICLES.find(a => a.slug === slug)

  if (!article) return <Navigate to="/blog" replace />

  return (
    <div style={{ background: '#020510', minHeight: '100vh' }}>
      <div className="relative" style={{ zIndex: 1 }}>
        <ArticleView article={article} onBack={() => navigate('/blog')} />
      </div>
    </div>
  )
}
