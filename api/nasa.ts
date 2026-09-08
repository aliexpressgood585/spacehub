import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy for the NASA endpoints the browser needs directly.
//
// Those calls used to go straight from the visitor's browser to api.nasa.gov
// with the literal string DEMO_KEY, which NASA rate-limits to 30 requests per
// hour per IP. On a shared or mobile IP the JWST gallery and the Mars rover
// dashboard simply failed. Routing through here spends the deployment's real
// key (when configured) and, more importantly, lets Vercel's CDN serve one
// upstream response to every visitor.

/** Only these NASA paths may be requested — the proxy is never an open relay. */
const ALLOWED: { pattern: RegExp; maxAge: number }[] = [
  // Astronomy Picture of the Day, including fixed historical ranges.
  { pattern: /^\/planetary\/apod$/, maxAge: 3600 },
]

/** Query parameters forwarded upstream. `api_key` is deliberately not one. */
const FORWARDED = new Set(['start_date', 'end_date', 'date', 'sol', 'earth_date', 'camera', 'page', 'count'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = typeof req.query.path === 'string' ? req.query.path : ''
  const rule = ALLOWED.find(a => a.pattern.test(path))
  if (!rule) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(400).json({ error: 'unsupported_path' })
  }

  const key = process.env.NASA_API_KEY || process.env.VITE_NASA_API_KEY || 'DEMO_KEY'
  const url = new URL('https://api.nasa.gov' + path)
  url.searchParams.set('api_key', key)
  for (const [k, v] of Object.entries(req.query)) {
    if (FORWARDED.has(k) && typeof v === 'string') url.searchParams.set(k, v)
  }

  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

    // Answer 200 with an error body so the component can fall back to its
    // curated content instead of rendering a failure.
    if (r.status === 429) {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ error: 'rate_limited' })
    }
    if (!r.ok) throw new Error(`NASA ${r.status}`)

    const data = await r.json() as unknown
    res.setHeader('Cache-Control', `s-maxage=${rule.maxAge}, stale-while-revalidate=86400`)
    res.json(data)
  } catch (err: unknown) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ error: err instanceof Error ? err.message : 'error' })
  }
}
