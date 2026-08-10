import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

// Passwordless sign-in. The only thing an account buys today is that your
// observation log survives a cleared browser or a new phone — so the copy
// says exactly that rather than promising a "profile".

export default function AccountButton() {
  const { user, enabled, signInWithEmail, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!enabled) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    const { error } = await signInWithEmail(email.trim())
    setBusy(false)
    if (error) setError(error)
    else setSent(true)
  }

  const close = () => {
    setOpen(false)
    setSent(false)
    setError(null)
  }

  return (
    <>
      <button
        onClick={() => (user ? signOut() : setOpen(true))}
        className="text-xs px-3 py-1.5 rounded-xl font-semibold transition"
        style={{
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.35)',
          color: '#a5b4fc',
        }}
        title={user ? `Signed in as ${user.email}` : 'Sign in to sync your observation log'}
      >
        {user ? '👤 Sign out' : '👤 Sign in'}
      </button>

      {open && !user && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to SpaceHub"
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(2,5,16,0.82)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(400px, 100%)',
              background: 'linear-gradient(135deg, rgba(13,16,45,0.98), rgba(8,11,34,0.98))',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: 20,
              padding: 24,
            }}
          >
            {sent ? (
              <div className="text-center">
                <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
                <p className="text-white font-bold text-base mb-1">Check your inbox</p>
                <p className="text-gray-400 text-xs leading-relaxed mb-4">
                  We sent a sign-in link to <span className="text-indigo-300">{email}</span>.
                  Open it on this device and you're in — no password needed.
                </p>
                <button onClick={close} className="btn-shimmer px-5 py-2 text-xs font-bold rounded-xl">
                  Got it
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <p className="text-white font-bold text-base mb-1">Keep your observations safe</p>
                <p className="text-gray-400 text-xs leading-relaxed mb-4">
                  Your observation log currently lives only in this browser. Sign in and it
                  syncs to your account, so it survives a new phone or a cleared cache.
                </p>

                <label htmlFor="account-email" className="sr-only">Email address</label>
                <input
                  id="account-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full mb-3 px-3 py-2.5 rounded-xl text-sm text-white"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    outline: 'none',
                  }}
                />

                {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-shimmer px-4 py-2 text-xs font-bold rounded-xl flex-1 disabled:opacity-60"
                  >
                    {busy ? 'Sending…' : 'Email me a sign-in link'}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="px-4 py-2 text-xs rounded-xl font-semibold"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#6b7280',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
