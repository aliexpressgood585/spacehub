import { useState, useEffect } from 'react'

const WARP_LINES = Array.from({ length: 28 }, (_, i) => ({
  angle: i * (360 / 28),
  color: i % 3 === 0 ? '99,102,241' : i % 3 === 1 ? '139,92,246' : '56,189,248',
  delay: (i * 0.035).toFixed(2),
  duration: (0.9 + (i % 5) * 0.08).toFixed(2),
}))

export default function LoadingScreen() {
  const [phase, setPhase] = useState<'in' | 'exiting' | 'done'>(() => {
    try { return sessionStorage.getItem('sh_boot') ? 'done' : 'in' } catch { return 'done' }
  })

  useEffect(() => {
    if (phase !== 'in') return
    const t1 = setTimeout(() => setPhase('exiting'), 1700)
    const t2 = setTimeout(() => {
      setPhase('done')
      try { sessionStorage.setItem('sh_boot', '1') } catch {}
    }, 2300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [phase])

  if (phase === 'done') return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{
        zIndex: 999999,
        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(20,8,55,1) 0%, #020510 70%)',
        animation: phase === 'exiting' ? 'loading-exit 0.62s ease-in both' : undefined,
        // Pass clicks through immediately once the exit animation begins — CSS can't animate pointer-events
        pointerEvents: phase === 'exiting' ? 'none' : undefined,
      }}
    >
      {/* Warp speed lines — radiate from center */}
      {WARP_LINES.map((l, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="absolute"
          style={{
            left: '50%',
            top: '50%',
            width: '1.5px',
            height: '0%',
            transformOrigin: 'top center',
            transform: `rotate(${l.angle}deg) translateX(-50%)`,
            background: `linear-gradient(to bottom, transparent 0%, rgba(${l.color},0.9) 40%, rgba(${l.color},0.5) 80%, transparent 100%)`,
            animation: `warp-extend ${l.duration}s ${l.delay}s ease-out infinite`,
          }}
        />
      ))}

      {/* Expanding rings */}
      {[0, 0.4, 0.8].map((delay, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 220 + i * 80,
            height: 220 + i * 80,
            border: `1px solid rgba(99,102,241,${0.4 - i * 0.1})`,
            boxShadow: `0 0 20px rgba(99,102,241,0.15)`,
            animation: `loading-ring 2s ${delay}s ease-out infinite`,
          }}
        />
      ))}

      {/* Central glow blob */}
      <div
        aria-hidden="true"
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 280,
          height: 280,
          background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(139,92,246,0.15) 50%, transparent 75%)',
          filter: 'blur(24px)',
          animation: 'inner-nebula 2s ease-in-out infinite',
        }}
      />

      {/* Logo content */}
      <div className="relative text-center" style={{ zIndex: 1 }}>
        <div
          className="text-7xl mb-5"
          style={{ animation: 'float 2s ease-in-out infinite', display: 'inline-block', filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.8))' }}
        >
          🚀
        </div>

        <div
          className="font-display gradient-text-aurora mb-2"
          style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '0.18em' }}
        >
          SPACEHUB
        </div>

        <div className="text-gray-500 text-[10px] tracking-[0.4em] uppercase mb-5">
          Initializing Space Data
        </div>

        {/* Scanning bar */}
        <div
          className="mx-auto rounded-full overflow-hidden"
          style={{ width: 160, height: 2, background: 'rgba(99,102,241,0.15)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #6366f1, #a78bfa, #22d3ee)',
              animation: 'shimmer 1.5s linear infinite',
              backgroundSize: '200% auto',
            }}
          />
        </div>

        {/* Progress dots */}
        <div className="flex gap-2 justify-center mt-4">
          {[0, 0.2, 0.4].map((d, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: 5, height: 5,
                background: '#6366f1',
                animation: `pulse-dot 1.2s ${d}s ease-in-out infinite`,
                boxShadow: '0 0 6px rgba(99,102,241,0.8)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
