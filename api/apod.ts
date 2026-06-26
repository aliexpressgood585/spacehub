import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY || process.env.VITE_NASA_API_KEY || 'DEMO_KEY'
  const usingDemo = key === 'DEMO_KEY'
  const count = parseInt(req.query.count as string) || 1

  try {
    // When using DEMO_KEY, avoid `count` param — request today's APOD only to preserve rate limit
    const url = (!usingDemo && count > 1)
      ? `https://api.nasa.gov/planetary/apod?api_key=${key}&count=${count}`
      : `https://api.nasa.gov/planetary/apod?api_key=${key}`

    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    })

    if (r.status === 429) {
      // Rate limited — return 200 so frontend can show a placeholder instead of crashing
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({
        error: 'rate_limited',
        message: 'NASA API rate limit reached. Set the NASA_API_KEY environment variable in Vercel for unlimited access.',
      })
    }

    if (!r.ok) throw new Error(`NASA APOD ${r.status}`)
    const data = await r.json() as unknown

    // Cache longer when using DEMO_KEY to minimise API calls
    const maxAge = usingDemo ? 7200 : 3600
    res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=86400`)
    res.json(data)
  } catch (err: unknown) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ error: err instanceof Error ? err.message : 'error' })
  }
}
