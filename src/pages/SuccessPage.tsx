import { useSearchParams } from 'react-router-dom'

export default function SuccessPage() {
  const [params] = useSearchParams()

  const sessionId = params.get('session_id')

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#050816' }}>
      {/* Stars background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() > 0.8 ? 2 : 1,
              height: Math.random() > 0.8 ? 2 : 1,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.7 + 0.1,
            }}
          />
        ))}
      </div>

      <div className="relative text-center max-w-md w-full">
        {/* Success card */}
        <div className="glass rounded-2xl border border-indigo-500/30 p-10 shadow-2xl shadow-indigo-900/40">
          {/* Rocket animation */}
          <div className="text-7xl mb-6 animate-bounce">🚀</div>

          <h1 className="text-3xl font-black text-white mb-2">
            Welcome to <span className="gradient-text">Premium</span>!
          </h1>
          <p className="text-gray-400 mb-2 text-sm leading-relaxed">
            Your subscription is now active. Enjoy the full SpaceHub experience — ad-free, with all premium features unlocked.
          </p>

          {sessionId && (
            <p className="text-gray-600 text-xs mb-6 font-mono">
              Ref: {sessionId.slice(-12)}
            </p>
          )}

          {/* Feature highlights */}
          <div className="grid grid-cols-2 gap-2 mb-8 text-left">
            {[
              '⭐ ISS overhead alerts',
              '🌍 7-day city forecast',
              '🛰️ Live 500+ satellites',
              '🚫 No ads ever',
              '📡 Solar radiation chart',
              '📬 Weekly newsletter',
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-yellow-300 bg-yellow-900/10 rounded-lg px-3 py-2">
                {f}
              </div>
            ))}
          </div>

          <a
            href="/"
            className="block w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl text-white font-bold text-base transition shadow-lg shadow-indigo-900/30"
          >
            Go to SpaceHub →
          </a>

          <p className="text-gray-700 text-xs mt-4">
            A confirmation email is on its way. You can cancel anytime from your billing portal.
          </p>
        </div>
      </div>
    </div>
  )
}
