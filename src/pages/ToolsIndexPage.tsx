import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TOOLS } from './toolsRegistry'

// Hub page: gives crawlers (and people) one place that links to every tool
// page, so the individual routes are discoverable without a sitemap fetch.

const GROUPS: { tab: string; label: string }[] = [
  { tab: '#starmap', label: 'Night Sky' },
  { tab: '#tracker', label: 'Tracking' },
  { tab: '#solar', label: 'Solar System' },
  { tab: '#observe', label: 'Observing' },
  { tab: '#events', label: 'Events' },
  { tab: '#weather', label: 'Space Weather' },
  { tab: '#gallery', label: 'Images' },
  { tab: '#science', label: 'Science' },
  { tab: '#quiz', label: 'Fun' },
]

export default function ToolsIndexPage() {
  useEffect(() => {
    const prev = document.title
    document.title = 'Free Astronomy Tools — Star Map, ISS Tracker & More | SpaceHub'
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content') ?? null
    meta?.setAttribute(
      'content',
      'Every SpaceHub tool in one place: live star map, ISS tracker and pass predictor, moon phase, meteor showers, aurora forecast, light pollution map and more. All free.',
    )
    return () => {
      document.title = prev
      if (prevDesc !== null) meta?.setAttribute('content', prevDesc)
    }
  }, [])

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-5 text-xs text-gray-500">
          <Link to="/" className="hover:text-indigo-400 transition-colors">SpaceHub</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span className="text-gray-400">Tools</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-white font-black text-2xl md:text-3xl mb-2">Free Astronomy Tools</h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">
            {TOOLS.length} live tools for stargazers — every one free, no account and no app required.
            Each works from your own location.
          </p>
        </header>

        {GROUPS.map(group => {
          const items = TOOLS.filter(t => t.tab === group.tab)
          if (!items.length) return null
          return (
            <section key={group.tab} className="mb-8">
              <h2 className="text-white font-bold text-lg mb-3">{group.label}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map(t => (
                  <li key={t.slug}>
                    <Link
                      to={`/tools/${t.slug}`}
                      className="block p-4 rounded-2xl h-full transition-colors"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <span className="block text-white font-bold text-sm mb-1">
                        {t.title.split('—')[0].trim()}
                      </span>
                      <span className="block text-gray-500 text-xs leading-relaxed">{t.blurb}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
