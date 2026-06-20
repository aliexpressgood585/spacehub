import { useState } from 'react'

export default function EmailCapture() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    // Store in localStorage for now — replace with Mailchimp/ConvertKit API
    const existing = JSON.parse(localStorage.getItem('spacehub_emails') || '[]')
    existing.push({ email, date: new Date().toISOString() })
    localStorage.setItem('spacehub_emails', JSON.stringify(existing))
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="relative overflow-hidden rounded-2xl p-8 text-center bg-gradient-to-r from-indigo-900/60 via-purple-900/60 to-indigo-900/60 border border-indigo-500/30">
        <div className="text-5xl mb-4">🚀</div>
        <h3 className="text-xl font-bold text-white mb-2">נרשמת בהצלחה!</h3>
        <p className="text-gray-400">תקבל/י התראות על ISS, גשמי מטאורים ואירועים אסטרונומיים נדירים.</p>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl p-8 bg-gradient-to-r from-indigo-900/40 via-purple-900/40 to-indigo-900/40 border border-indigo-500/20">
      {/* Background stars effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full opacity-30"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
          />
        ))}
      </div>

      <div className="relative text-center max-w-xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full border border-indigo-500/30 mb-4">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          התראות חינם — ללא כרטיס אשראי
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">
          קבל התראה כשה-ISS עובר מעליך 🛸
        </h3>
        <p className="text-gray-400 mb-6 text-sm">
          גשמי מטאורים • ליקויי חמה • אירועים נדירים • כל מה שקורה בחלל — ישר למייל שלך
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="האימייל שלך"
            required
            className="flex-1 px-4 py-3 rounded-lg bg-space-900/80 border border-space-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm"
            dir="ltr"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white font-medium transition whitespace-nowrap text-sm"
          >
            {loading ? '...' : 'הצטרף חינם →'}
          </button>
        </form>
        <p className="text-gray-600 text-xs mt-3">מצטרפים כבר 2,400+ חובבי חלל • ללא ספאם • ביטול בכל עת</p>
      </div>
    </div>
  )
}
