import type { VercelRequest, VercelResponse } from '@vercel/node'

const RESEND_KEY = process.env.RESEND_API_KEY!
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID!

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email } = req.body as { email: string }
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' })

  try {
    const r = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    })
    const data = await r.json() as { id?: string; message?: string }
    if (data.id) {
      res.json({ success: true })
    } else {
      res.status(400).json({ error: data.message || 'Failed to subscribe' })
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
