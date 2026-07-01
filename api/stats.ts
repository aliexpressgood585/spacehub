import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SUPABASE_URL, SUPABASE_ANON_KEY, analyticsConfigured } from './_analyticsConfig'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!analyticsConfigured()) return res.status(503).json({ error: 'Analytics not configured yet' })

  const key = String(req.query.key || '')
  const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365)
  if (!key) return res.status(401).json({ error: 'Missing key' })

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/analytics_stats`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_key: key, p_days: days }),
    })
    if (!r.ok) return res.status(401).json({ error: 'Unauthorized' })
    const data = await r.json()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(data)
  } catch {
    res.status(500).json({ error: 'Stats unavailable' })
  }
}
