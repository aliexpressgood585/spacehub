import type { VercelRequest, VercelResponse } from '@vercel/node'

interface NasaItem {
  data: { title: string; date_created: string; nasa_id: string }[]
  links?: { href: string; rel: string }[]
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const queries = ['nebula hubble', 'earth orbit iss', 'galaxy deep space', 'saturn cassini', 'moon apollo', 'mars surface']
  const q = queries[Math.floor(Math.random() * queries.length)]

  try {
    const r = await fetch(
      `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=20`,
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(7000) }
    )
    if (!r.ok) throw new Error(`NASA search ${r.status}`)
    const json = await r.json() as { collection: { items: NasaItem[] } }
    const items = json.collection.items

    const photos = items
      .filter(i => i.links?.[0]?.href)
      .slice(0, 12)
      .map(i => ({
        title: i.data[0]?.title ?? 'NASA Image',
        date: i.data[0]?.date_created?.slice(0, 10) ?? '',
        url: i.links![0].href.replace('thumb', 'medium'),
        thumb: i.links![0].href,
        nasa_id: i.data[0]?.nasa_id ?? '',
      }))

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.json(photos)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json([])
  }
}
