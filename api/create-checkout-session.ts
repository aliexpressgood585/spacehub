import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
})

const PRICES = {
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID!,
  yearly:  process.env.STRIPE_YEARLY_PRICE_ID!,
}

const BASE_URL = process.env.VITE_BASE_URL || 'https://spacehub-nu.vercel.app'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { plan } = req.body as { plan: 'monthly' | 'yearly' }
  if (!plan || !PRICES[plan]) return res.status(400).json({ error: 'Invalid plan' })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/?canceled=1`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { plan },
      },
    })
    res.json({ url: session.url })
  } catch (err: any) {
    console.error('Stripe error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
