import type { VercelRequest, VercelResponse } from '@vercel/node'

const SOURCES = [
  'https://api.open-notify.org/astros.json',
  'https://corquaid.github.io/people-in-space-poller/assets/people-in-space.json',
]

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      })
      if (!r.ok) continue
      const data = await r.json() as unknown
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
      return res.json(data)
    } catch {
      // try next source
    }
  }
  // All sources failed — return 200 with empty payload so frontend uses its built-in fallback
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ number: 0, people: [], message: 'error' })
}
