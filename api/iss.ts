import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) throw new Error(`wheretheiss.at ${r.status}`)
    const data = await r.json() as unknown
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10')
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'upstream error' })
  }
}
