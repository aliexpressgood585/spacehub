import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY || process.env.VITE_NASA_API_KEY || 'DEMO_KEY'

  try {
    const r = await fetch(
      `https://api.nasa.gov/planetary/apod?api_key=${key}&count=16`,
      { headers: { 'Accept': 'application/json' } }
    )
    if (!r.ok) throw new Error(`NASA API ${r.status}`)
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.json(data)
  } catch (err: unknown) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'NASA API error' })
  }
}
