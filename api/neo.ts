import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY || 'DEMO_KEY'
  const { start_date, end_date } = req.query
  if (!start_date || !end_date) { res.status(400).json({ error: 'start_date and end_date required' }); return }

  const r = await fetch(
    `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start_date}&end_date=${end_date}&api_key=${key}`,
    { signal: AbortSignal.timeout(12000) }
  )
  if (!r.ok) { res.status(r.status).end(); return }
  const data = await r.json() as unknown
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  res.json(data)
}
