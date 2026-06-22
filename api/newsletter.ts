import type { VercelRequest, VercelResponse } from '@vercel/node'
import { rateLimit } from './_rateLimit'

const RESEND_KEY = process.env.RESEND_API_KEY!
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID!
const CRON_SECRET = process.env.CRON_SECRET!
const NASA_KEY = process.env.NASA_API_KEY || 'DEMO_KEY'

async function getAPOD() {
  try {
    const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_KEY}`)
    return await r.json() as { title: string; explanation: string; url: string; date: string }
  } catch {
    return null
  }
}

function buildHtml(apod: { title: string; explanation: string; url: string } | null) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#020510;color:#e5e7eb;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px;padding:12px 20px">
        <span style="font-size:24px">🚀</span>
        <span style="color:#fff;font-weight:900;font-size:20px;margin-left:8px">SpaceHub</span>
      </div>
      <h1 style="color:#fff;font-size:22px;font-weight:900;margin:16px 0 4px">Your Weekly Space Update</h1>
      <p style="color:#6b7280;font-size:13px;margin:0">Real-time space data, delivered every Monday</p>
    </div>

    ${apod ? `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;margin-bottom:24px">
      <div style="background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.15));padding:16px 20px">
        <p style="color:#a5b4fc;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px">NASA Astronomy Photo of the Day</p>
        <h2 style="color:#fff;font-size:18px;font-weight:900;margin:0">${apod.title}</h2>
      </div>
      <img src="${apod.url}" alt="${apod.title}" style="width:100%;max-height:300px;object-fit:cover;display:block" onerror="this.style.display='none'">
      <div style="padding:16px 20px">
        <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0">${apod.explanation.slice(0, 300)}...</p>
      </div>
    </div>
    ` : ''}

    <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:16px;padding:20px;margin-bottom:24px">
      <h3 style="color:#c4b5fd;font-size:14px;font-weight:700;margin:0 0 12px">🛸 This Week in Space</h3>
      <ul style="margin:0;padding:0;list-style:none">
        <li style="color:#9ca3af;font-size:13px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">🌍 ISS is orbiting at ~408 km, completing 15.5 orbits per day</li>
        <li style="color:#9ca3af;font-size:13px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">🚀 Track live ISS passes from your city at SpaceHub</li>
        <li style="color:#9ca3af;font-size:13px;padding:6px 0">⭐ Check tonight's star map — new stars rise each season</li>
      </ul>
    </div>

    <div style="text-align:center;margin-bottom:24px">
      <a href="https://spacehub-nu.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:14px">
        🚀 Open SpaceHub →
      </a>
    </div>

    <p style="text-align:center;color:#374151;font-size:11px">
      You're receiving this because you subscribed at spacehub-nu.vercel.app<br>
      <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#4b5563">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || '127.0.0.1'
  if (!rateLimit(ip, 5, 60_000)) return res.status(429).json({ error: 'Too many requests' })

  const auth = req.headers.authorization
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const apod = await getAPOD()
    const html = buildHtml(apod)

    const bcRes = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audience_id: AUDIENCE_ID,
        from: 'SpaceHub <weekly@spacehub-nu.vercel.app>',
        subject: `🚀 SpaceHub Weekly — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
        html,
        name: `Weekly ${new Date().toISOString().slice(0, 10)}`,
      }),
    })
    const bc = await bcRes.json() as { id?: string; message?: string }
    if (!bc.id) return res.status(400).json({ error: bc.message })

    await fetch(`https://api.resend.com/broadcasts/${bc.id}/send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    })

    res.json({ success: true, broadcastId: bc.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}
