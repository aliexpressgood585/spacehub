import { Suspense, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TOOL_BY_SLUG, TOOLS } from './toolsRegistry'
import { useJsonLd, breadcrumbLd, toolLd } from '../lib/jsonLd'
import NotFoundPage from './NotFoundPage'

const SITE = 'https://www.spacehubapp.com'

function useToolSeo(title: string, blurb: string, slug: string) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = `${title} | SpaceHub`

    const setMeta = (selector: string, attr: string, name: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(selector)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, name)
        document.head.appendChild(el)
      }
      const prev = el.getAttribute('content')
      el.setAttribute('content', content)
      return () => {
        if (prev !== null) el!.setAttribute('content', prev)
      }
    }

    const restoreDesc = setMeta('meta[name="description"]', 'name', 'description', blurb)
    const restoreOgTitle = setMeta('meta[property="og:title"]', 'property', 'og:title', title)
    const restoreOgDesc = setMeta('meta[property="og:description"]', 'property', 'og:description', blurb)

    // Canonical keeps the tool page from competing with "/" for the same content.
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const hadLink = Boolean(link)
    const prevHref = link?.getAttribute('href') ?? null
    if (!link) {
      link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      document.head.appendChild(link)
    }
    link.setAttribute('href', `${SITE}/tools/${slug}`)

    return () => {
      document.title = prevTitle
      restoreDesc()
      restoreOgTitle()
      restoreOgDesc()
      if (hadLink && prevHref) link!.setAttribute('href', prevHref)
      else if (!hadLink) link!.remove()
    }
  }, [title, blurb, slug])
}

export default function ToolPage() {
  const { slug = '' } = useParams()
  const tool = TOOL_BY_SLUG.get(slug)
  const shortName = tool ? tool.title.split('—')[0].trim() : ''

  useToolSeo(tool?.title ?? '', tool?.blurb ?? '', slug)

  // Memoised so the effect doesn't re-inject the block on every render.
  const ld = useMemo(
    () =>
      tool
        ? {
            '@context': 'https://schema.org',
            '@graph': [
              toolLd({ slug, name: shortName, description: tool.blurb }),
              breadcrumbLd([
                { name: 'SpaceHub', path: '/' },
                { name: 'Tools', path: '/tools' },
                { name: shortName, path: `/tools/${slug}` },
              ]),
            ],
          }
        : null,
    [tool, slug, shortName],
  )
  useJsonLd(`tool-${slug}`, ld)

  if (!tool) return <NotFoundPage />

  const Tool = tool.component
  const related = TOOLS.filter(t => t.slug !== tool.slug && t.tab === tool.tab).slice(0, 4)

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-5 text-xs text-gray-500">
          <Link to="/" className="hover:text-indigo-400 transition-colors">SpaceHub</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <Link to="/tools" className="hover:text-indigo-400 transition-colors">Tools</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span className="text-gray-400">{tool.title.split('—')[0].trim()}</span>
        </nav>

        <header className="mb-6">
          <h1 className="text-white font-black text-2xl md:text-3xl mb-2">{tool.title}</h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">{tool.blurb}</p>
        </header>

        <Suspense
          fallback={
            <div className="space-card p-6">
              <div className="skeleton-line h-5 w-48 mb-4" />
              <div className="skeleton-line h-64 rounded-2xl" />
            </div>
          }
        >
          <Tool />
        </Suspense>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="text-white font-bold text-base mb-3">Related tools</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {related.map(r => (
                <li key={r.slug}>
                  <Link
                    to={`/tools/${r.slug}`}
                    className="block px-4 py-3 rounded-xl text-sm text-gray-300 hover:text-white transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {r.title.split('—')[0].trim()}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Link
            to={`/${tool.tab}`}
            className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors"
          >
            ← Open the full SpaceHub dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
