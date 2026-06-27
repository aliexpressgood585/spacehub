import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const r = await fetch(
      'https://lldev.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&format=json',
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!r.ok) throw new Error(`SpaceDevs ${r.status}`)
    const data = await r.json() as unknown
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
    res.json(data)
  } catch (err: unknown) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ error: err instanceof Error ? err.message : 'error', results: [] })
  }
}
