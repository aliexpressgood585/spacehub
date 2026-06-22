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

export default function PremiumPage() {
  return (
    <div style={{ background: '#020510', minHeight: '100vh' }}>
      <div className="relative" style={{ zIndex: 1 }}>

        {/* Back link */}
        <div className="max-w-4xl mx-auto px-4 pt-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back to SpaceHub
          </Link>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">

          {/* Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-widest uppercase"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
              🚀 SpaceHub Pro
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 leading-tight">
              Upgrade to <span className="gradient-text">Pro</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-md mx-auto">
              Get advanced alerts, ad-free viewing, and deeper space data — for less than a coffee.
            </p>
          </div>

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14">

            {/* Free */}
            <div className="space-card p-8">
              <div className="mb-6">
                <p className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-2">Free Forever</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-white">$0</span>
                  <span className="text-gray-600 text-sm mb-2">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {FEATURES_FREE.map(f => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-400">
                    <span className="text-indigo-500 mt-0.5 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/"
                className="block w-full text-center py-3 rounded-2xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }}
              >
                Current Plan
              </Link>
            </div>

            {/* Pro */}
            <div
              className="p-8 rounded-3xl relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 50%, rgba(8,11,34,0.98) 100%)', border: '1px solid rgba(99,102,241,0.4)' }}
            >
              {/* Glow */}
              <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />

              <div className="mb-6 relative">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-indigo-300 text-sm font-semibold uppercase tracking-wider">Pro</p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}>
                    Most Popular
                  </span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-white">$4.99</span>
                  <span className="text-gray-400 text-sm mb-2">/month</span>
                </div>
                <p className="text-gray-600 text-xs mt-1">or $39.99/year — save 33%</p>
              </div>

              <ul className="space-y-3 mb-8 relative">
                {FEATURES_PRO.map((f, i) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <span className={`mt-0.5 flex-shrink-0 ${i === 0 ? 'text-gray-500' : 'text-indigo-400'}`}>
                      {i === 0 ? '✓' : '⭐'}
                    </span>
                    <span className={i === 0 ? 'text-gray-500' : 'text-gray-200'}>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => alert('Payment coming soon — enter your email below and we\'ll notify you at launch!')}
                className="btn-shimmer w-full py-3.5 text-sm font-bold relative"
              >
                🚀 Get Pro Access
              </button>
              <p className="text-center text-gray-700 text-xs mt-3">Cancel anytime · Secure payment</p>
            </div>
          </div>

          {/* FAQ */}
          <div className="space-card p-8">
            <h2 className="text-white font-black text-lg mb-6">Frequently Asked Questions</h2>
            <div className="space-y-5">
              {[
                ['When does Pro launch?', 'We\'re finishing the payment integration — expected late 2026. Enter your email on the main page to be notified first.'],
                ['Is SpaceHub really free?', 'Yes. All core features — ISS tracker, star map, space weather, 34 guides — are free forever.'],
                ['What payment methods will you accept?', 'Credit card, PayPal, and Apple Pay at launch.'],
                ['Can I cancel anytime?', 'Yes. No contracts, no hidden fees. Cancel with one click from your account.'],
              ].map(([q, a]) => (
                <div key={q}>
                  <p className="text-white font-semibold text-sm mb-1">{q}</p>
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
