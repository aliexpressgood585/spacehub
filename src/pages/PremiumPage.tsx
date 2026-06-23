import { useState } from 'react'
import { Link } from 'react-router-dom'

const FEATURES_FREE = [
  'ISS live tracker & 3D globe',
  'Real-time ISS overhead alerts',
  'Pass predictor (next 5 passes)',
  'NASA Astronomy Photo of the Day',
  'Space weather dashboard',
  'Launch countdown & events calendar',
  'Star map & solar system 3D',
  'Space news feed',
  'Moon phase tracker',
  '34 astronomy guides',
]

const FEATURES_STARTER = [
  'Everything in Free',
  'Ad-free experience',
  'ISS overhead alerts (push notifications)',
  'Pass predictor — 3 days ahead',
  'Exclusive monthly space digest email',
]

const FEATURES_PRO = [
  'Everything in Free',
  'Custom location alerts (push + email)',
  'ISS pass predictions — 7 days ahead',
  'Ad-free experience',
  'Satellite conjunction alerts',
  'Solar flare & CME early warnings',
  'Meteor shower intensity forecasts',
  'Planet opposition & conjunction alerts',
  'Exclusive astrophotography guides',
  'Priority support',
]

const TESTIMONIALS = [
  { name: 'Sarah K.', role: 'Amateur Astronomer', text: 'The ISS pass predictor is insanely accurate. Caught it with my telescope on the first try!', stars: 5 },
  { name: 'Mateo R.', role: 'Science Teacher', text: 'I use SpaceHub in class every week. Kids love the live tracker. Worth every penny.', stars: 5 },
  { name: 'James L.', role: 'Space Enthusiast', text: 'Switched from three different apps to just SpaceHub. Everything is here in one place.', stars: 5 },
]

const STATS = [
  { n: '25K+', label: 'Active Users' },
  { n: '4.9★', label: 'Avg Rating' },
  { n: '99.8%', label: 'Uptime' },
  { n: 'Free', label: 'Core Features' },
]

export default function PremiumPage() {
  const [loading, setLoading] = useState<'monthly' | 'yearly' | 'starter-m' | 'starter-y' | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly')

  const checkout = async (p: 'monthly' | 'yearly' | 'starter-m' | 'starter-y') => {
    setLoading(p)
    const planName = p === 'starter-m' ? 'starter-monthly' : p === 'starter-y' ? 'starter-yearly' : p
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planName }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) { window.location.href = data.url; return }
      alert(data.error || 'Payment setup coming soon — enter your email on the main page to be notified!')
    } catch {
      alert('Payment coming soon — enter your email on the main page to be notified at launch!')
    } finally {
      setLoading(null)
    }
  }

  const proPrice = billingCycle === 'yearly' ? '$3.33' : '$4.99'
  const proTotal = billingCycle === 'yearly' ? '$39.99/yr' : '$4.99/mo'
  const starterPrice = billingCycle === 'yearly' ? '$1.25' : '$1.99'
  const starterTotal = billingCycle === 'yearly' ? '$14.99/yr' : '$1.99/mo'

  return (
    <div style={{ background: '#020510', minHeight: '100vh' }}>
      {/* Background orbs */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '30%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>

        {/* Back link */}
        <div className="max-w-5xl mx-auto px-4 pt-8">
          <Link to="/" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back to SpaceHub
          </Link>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-12">

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-widest uppercase"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
              ⭐ SpaceHub Pro
            </div>
            <h1 className="text-4xl sm:text-6xl font-black text-white mb-5 leading-tight tracking-tight">
              Unlock the full <span className="gradient-text">universe</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-lg mx-auto mb-10 leading-relaxed">
              Advanced alerts, ad-free viewing, and deeper space data — for less than a coffee a month.
            </p>

            {/* Stats row */}
            <div className="flex flex-wrap justify-center gap-8 mb-10">
              {STATS.map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-2xl font-black gradient-text">{s.n}</div>
                  <div className="text-gray-600 text-xs font-semibold tracking-wide mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => setBillingCycle('monthly')}
                className="px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                style={billingCycle === 'monthly'
                  ? { background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd' }
                  : { color: '#6b7280' }}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
                style={billingCycle === 'yearly'
                  ? { background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: '#c4b5fd' }
                  : { color: '#6b7280' }}
              >
                Yearly
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}>−33%</span>
              </button>
            </div>
          </div>

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">

            {/* Free */}
            <div className="space-card p-7 flex flex-col">
              <div className="mb-6">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Free Forever</p>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-5xl font-black text-white">$0</span>
                  <span className="text-gray-600 text-sm mb-2">/month</span>
                </div>
                <p className="text-gray-600 text-xs">No credit card needed</p>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {FEATURES_FREE.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-400">
                    <span className="text-indigo-600 mt-0.5 flex-shrink-0 text-xs">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/" className="block w-full text-center py-3 rounded-2xl text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#4b5563' }}>
                Current Plan
              </Link>
            </div>

            {/* Starter */}
            <div className="space-card p-7 flex flex-col" style={{ borderColor: 'rgba(52,211,153,0.25)' }}>
              <div className="mb-6">
                <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">Starter</p>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-5xl font-black text-white">{starterPrice}</span>
                  <span className="text-gray-400 text-sm mb-2">/month</span>
                </div>
                <p className="text-gray-600 text-xs">Billed as {starterTotal}</p>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {FEATURES_STARTER.map((f, i) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-0.5 flex-shrink-0 text-xs ${i === 0 ? 'text-gray-600' : 'text-emerald-400'}`}>
                      {i === 0 ? '✓' : '✨'}
                    </span>
                    <span className={i === 0 ? 'text-gray-500' : 'text-gray-300'}>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => checkout(billingCycle === 'yearly' ? 'starter-y' : 'starter-m')}
                disabled={loading !== null}
                className="w-full py-3.5 text-sm font-bold rounded-2xl transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.25), rgba(16,185,129,0.15))', border: '1px solid rgba(52,211,153,0.4)', color: '#6ee7b7' }}
              >
                {loading ? '⏳ Redirecting...' : `✨ Get Starter — ${starterTotal}`}
              </button>
              <p className="text-center text-gray-700 text-xs mt-3">Cancel anytime · Stripe</p>
            </div>

            {/* Pro — highlighted */}
            <div className="p-7 rounded-3xl flex flex-col relative overflow-hidden"
              style={{ background: 'linear-gradient(145deg, rgba(99,102,241,0.22) 0%, rgba(139,92,246,0.16) 50%, rgba(8,11,34,0.98) 100%)', border: '1px solid rgba(99,102,241,0.45)', boxShadow: '0 0 60px rgba(99,102,241,0.15)' }}>
              {/* Aurora top bar */}
              <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa, #8b5cf6, #6366f1)', backgroundSize: '200% auto', animation: 'shimmer 3s linear infinite' }} />
              <div aria-hidden="true" className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)' }} />

              <div className="mb-6 relative">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest">Pro</p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}>
                    Most Popular
                  </span>
                </div>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-5xl font-black text-white">{proPrice}</span>
                  <span className="text-gray-400 text-sm mb-2">/month</span>
                </div>
                <p className="text-gray-500 text-xs">Billed as {proTotal}</p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1 relative">
                {FEATURES_PRO.map((f, i) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-0.5 flex-shrink-0 text-xs ${i === 0 ? 'text-gray-500' : 'text-indigo-400'}`}>
                      {i === 0 ? '✓' : '⭐'}
                    </span>
                    <span className={i === 0 ? 'text-gray-500' : 'text-gray-200'}>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => checkout(billingCycle === 'yearly' ? 'yearly' : 'monthly')}
                disabled={loading !== null}
                className="btn-shimmer w-full py-3.5 text-sm font-bold relative disabled:opacity-60"
              >
                {loading ? '⏳ Redirecting...' : `🚀 Get Pro — ${proTotal}`}
              </button>
              <p className="text-center text-gray-700 text-xs mt-3">Cancel anytime · Stripe · SSL encrypted</p>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-6 mb-16">
            {[
              { icon: '🔒', label: 'SSL Encrypted', sub: 'Stripe secure checkout' },
              { icon: '↩️', label: '30-Day Guarantee', sub: 'Full refund, no questions' },
              { icon: '❌', label: 'Cancel Anytime', sub: 'No lock-in contracts' },
              { icon: '🛡️', label: 'Privacy First', sub: 'Zero data selling' },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-xl">{b.icon}</span>
                <div>
                  <div className="text-white text-xs font-bold">{b.label}</div>
                  <div className="text-gray-600 text-xs">{b.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div className="mb-16">
            <h2 className="text-white font-black text-2xl text-center mb-8">What users say</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {TESTIMONIALS.map(t => (
                <div key={t.name} className="space-card p-6">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <span key={i} className="text-yellow-400 text-sm">★</span>
                    ))}
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed mb-4">"{t.text}"</p>
                  <div>
                    <div className="text-white text-xs font-bold">{t.name}</div>
                    <div className="text-gray-600 text-xs">{t.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="space-card p-8">
            <h2 className="text-white font-black text-xl mb-7">Frequently Asked Questions</h2>
            <div className="space-y-6">
              {[
                ['When does Pro launch?', 'We\'re finalizing the payment integration — expected late 2026. Add your email on the main page to be first in line.'],
                ['Is SpaceHub really free?', 'Yes, forever. All core features — ISS tracker, star map, space weather, 34 guides — stay free. Pro adds premium extras.'],
                ['What payment methods?', 'Credit card, PayPal, and Apple Pay at launch, all powered by Stripe.'],
                ['Can I cancel anytime?', 'Yes. One click from your account page. No hidden fees, no fine print.'],
                ['What\'s the 30-day guarantee?', 'If Pro doesn\'t meet your expectations, email us within 30 days for a full refund — no questions asked.'],
              ].map(([q, a]) => (
                <div key={q} className="pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-white font-bold text-sm mb-2">{q}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
