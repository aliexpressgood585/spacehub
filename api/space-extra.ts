import type { VercelRequest, VercelResponse } from '@vercel/node'

const ASTROS_SOURCES = [
  'https://api.open-notify.org/astros.json',
  'https://corquaid.github.io/people-in-space-poller/assets/people-in-space.json',
]

async function handleAstros(res: VercelResponse) {
  for (const url of ASTROS_SOURCES) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      })
      if (!r.ok) continue
      const data = await r.json() as unknown
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
      return res.json(data)
    } catch {
      // try next source
    }
  }
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ number: 0, people: [], message: 'error' })
}

async function handleNeo(req: VercelRequest, res: VercelResponse) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = (req.query.type as string) || 'astros'
  if (type === 'neo') return handleNeo(req, res)
  return handleAstros(res)
}
