import { useState } from 'react'

export default function EmailCapture() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.success) {
        setSubmitted(true)
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div
        className="relative overflow-hidden rounded-3xl p-10 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(99,102,241,0.3)' }}
      >
        <div className="text-6xl mb-5">🚀</div>
        <h3 className="text-2xl font-black text-white mb-2">You're in!</h3>
        <p className="text-gray-400 text-sm max-w-xs mx-auto">You'll receive alerts about ISS passes, meteor showers, and rare astronomical events.</p>
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{ background: 'linear-gradient(135deg, rgba(30,27,75,0.9), rgba(49,46,129,0.6), rgba(30,27,75,0.9))', border: '1px solid rgba(99,102,241,0.25)' }}
    >
      {/* Decorative glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.2) 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="relative p-10">
        <div className="text-center max-w-xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 text-xs px-4 py-1.5 rounded-full mb-5 font-semibold"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
          >
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse inline-block" />
            Free alerts — no credit card required
          </div>

          <h3 className="text-3xl font-black text-white mb-3">
            Get Notified When the ISS<br />Passes Over You 🛸
          </h3>
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">
            Meteor showers · Solar eclipses · Rare events<br />Everything happening in space — straight to your inbox
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-4" aria-label="Subscribe to space alerts">
            <label htmlFor="email-subscribe" className="sr-only">Your email address</label>
            <input
              id="email-subscribe"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              aria-required="true"
              aria-describedby={error ? 'email-error' : undefined}
              className="flex-1 px-5 py-3.5 rounded-xl text-white placeholder-gray-600 focus:outline-none text-sm"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(99,102,241,0.5)' }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-shimmer px-7 py-3.5 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Joining...' : 'Join Free →'}
            </button>
          </form>

          {error && <p id="email-error" role="alert" className="text-red-400 text-xs mb-3">{error}</p>}
          <p className="text-gray-600 text-xs">2,400+ space fans already joined · No spam · Unsubscribe anytime</p>
        </div>
      </div>
    </div>
  )
}
