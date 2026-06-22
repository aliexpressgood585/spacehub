import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const r = await fetch('https://api.open-notify.org/astros.json', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) throw new Error(`open-notify ${r.status}`)
    const data = await r.json() as unknown
    // Crew count changes rarely — cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'upstream error' })
  }
}
