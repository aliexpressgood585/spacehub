import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SUPABASE_URL, SUPABASE_ANON_KEY, analyticsConfigured } from './_analyticsConfig'

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|lighthouse|pingdom|uptime/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
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

    await fetch(`${SUPABASE_URL}/rest/v1/page_views`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ path, country, ref, device }),
    })
  } catch {
    // never surface tracking errors
  }
}
