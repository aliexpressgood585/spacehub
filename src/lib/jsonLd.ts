import { useEffect } from 'react'

// Per-page structured data.
//
// index.html carries site-level WebApplication + FAQPage markup, and because
// this is an SPA every route is served that same file — so a tool page would
// otherwise describe itself as "SpaceHub, the whole platform" and nothing
// more. These helpers add markup for the specific page and clean it up on
// unmount so it never leaks onto the next route.

const SITE = 'https://www.spacehubapp.com'

/** Inject a JSON-LD block for the lifetime of the component. */
export function useJsonLd(id: string, data: object | null) {
  useEffect(() => {
    if (!data) return
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.dataset.spacehubJsonld = id
    el.textContent = JSON.stringify(data)
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [id, data])
}

/** Breadcrumbs still render in Google results and lift click-through. */
export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${SITE}${t.path}`,
    })),
  }
}

/** A single free tool, described as the thing it actually is. */
export function toolLd(opts: { slug: string; name: string; description: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: opts.name,
    url: `${SITE}/tools/${opts.slug}`,
    description: opts.description,
    applicationCategory: 'Science',
    operatingSystem: 'Web',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isPartOf: {
      '@type': 'WebSite',
      name: 'SpaceHub',
      url: SITE,
    },
  }
}

/** Collection page listing every tool, so crawlers see the set as a set. */
export function toolListLd(tools: { slug: string; name: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Free Astronomy Tools',
    numberOfItems: tools.length,
    itemListElement: tools.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      url: `${SITE}/tools/${t.slug}`,
    })),
  }
}
