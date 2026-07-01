import type { VercelRequest, VercelResponse } from '@vercel/node'

// Supabase project used only for the private visit-analytics dashboard.
// The publishable key is safe to ship: RLS allows insert-only on
// page_views, and reads go through an RPC that requires the dashboard key.
const SUPABASE_URL = process.env.ANALYTICS_SUPABASE_URL || 'https://sxlofntrumabnbxrjzsw.supabase.co'
const SUPABASE_ANON_KEY = process.env.ANALYTICS_SUPABASE_ANON_KEY || 'sb_publishable_SdTxyYa4Pt0SHP2cbeu40Q_6fApVE06'
const analyticsConfigured = () => SUPABASE_URL.startsWith('https://')

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|lighthouse|pingdom|uptime/i

const sb = (path: string, init: RequestInit) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

// POST = record a pageview beacon; GET = key-protected dashboard stats
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    // Always answer fast — tracking must never slow or break the site
    res.status(204).end()
    if (!analyticsConfigured()) return
    try {
      const ua = String(req.headers['user-agent'] || '')
      if (BOT_RE.test(ua)) return
      let body: { path?: string; ref?: string } = {}
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) } catch {}
      const path = String(body.path || '/').slice(0, 200)
      if (!path.startsWith('/')) return
      const country = String(req.headers['x-vercel-ip-country'] || '').slice(0, 2) || null
      const device = /mobile|iphone|android/i.test(ua) ? 'mobile' : 'desktop'
      let ref: string | null = null
      try { if (body.ref) ref = new URL(String(body.ref)).hostname.slice(0, 100) } catch {}
      await sb('/rest/v1/page_views', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ path, country, ref, device }),
      })
    } catch { /* never surface tracking errors */ }
    return
  }

  if (req.method === 'GET') {
    if (!analyticsConfigured()) return res.status(503).json({ error: 'Analytics not configured yet' })
    const key = String(req.query.key || '')
    const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365)
    if (!key) return res.status(401).json({ error: 'Missing key' })
    try {
      const r = await sb('/rest/v1/rpc/analytics_stats', {
        method: 'POST',
        body: JSON.stringify({ p_key: key, p_days: days }),
      })
      if (!r.ok) return res.status(401).json({ error: 'Unauthorized' })
      const data = await r.json()
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(data)
    } catch {
      return res.status(500).json({ error: 'Stats unavailable' })
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
