import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY || process.env.VITE_NASA_API_KEY || 'DEMO_KEY'
  const count = parseInt(req.query.count as string) || 1

  try {
    const url = count > 1
      ? `https://api.nasa.gov/planetary/apod?api_key=${key}&count=${count}`
      : `https://api.nasa.gov/planetary/apod?api_key=${key}`

    const r = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!r.ok) throw new Error(`NASA APOD ${r.status}`)
    const data = await r.json() as unknown

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.json(data)
  } catch (err: unknown) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'error' })
  }
}
