import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.NASA_API_KEY || 'DEMO_KEY'
  const { start_date, end_date } = req.query
  if (!start_date || !end_date) { res.status(400).json({ error: 'start_date and end_date required' }); return }

  try {
    const r = await fetch(
      `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start_date}&end_date=${end_date}&api_key=${key}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) throw new Error(`NASA NEO ${r.status}`)
    const data = await r.json() as unknown
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.json(data)
  } catch (err: unknown) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ error: err instanceof Error ? err.message : 'error', near_earth_objects: {} })
  }
}
