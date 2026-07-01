import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { rateLimit } from './_rateLimit'

// Price IDs — user sets these in Vercel env vars
const PRICES = {
  monthly:            process.env.STRIPE_PRICE_PRO_MONTHLY!,
  yearly:             process.env.STRIPE_PRICE_PRO_YEARLY!,
  'starter-monthly':  process.env.STRIPE_PRICE_STARTER_MONTHLY!,
  'starter-yearly':   process.env.STRIPE_PRICE_STARTER_YEARLY!,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || '127.0.0.1'
  if (!rateLimit(ip, 10, 60_000)) return res.status(429).json({ error: 'Too many requests' })

  const { plan } = req.body as { plan: string }
  const priceId = PRICES[plan as keyof typeof PRICES]
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return res.status(200).json({ error: 'Payment coming soon — enter your email to be notified at launch!' })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL || 'https://spacehubapp.com'}/success`,
    cancel_url: `${process.env.APP_URL || 'https://spacehubapp.com'}/premium`,
  })
  res.json({ url: session.url })
}
