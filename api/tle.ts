import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string
  if (!id || !/^\d{1,9}$/.test(id)) return res.status(400).json({ error: 'Invalid NORAD ID' })

  try {
    const r = await fetch(
      `https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=TLE`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) throw new Error(`Celestrak ${r.status}`)
    const text = await r.text()
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
    res.setHeader('Content-Type', 'text/plain')
    res.send(text)
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).setHeader('Content-Type', 'application/json').json({ error: err instanceof Error ? err.message : 'upstream error' })
  }
}
