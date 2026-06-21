import { useEffect, useRef } from 'react'

interface Props {
  lang: 'he' | 'en'
  onPremium: () => void
  onScrollToISS: () => void
}

export default function Hero({ lang, onScrollToISS }: Props) {
  const he = lang === 'he'
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const stars: { x: number; y: number; r: number; o: number; speed: number }[] = []
    for (let i = 0; i < 180; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.4 + 0.3,
        o: Math.random(),
        speed: Math.random() * 0.008 + 0.003,
      })
    }

    let raf: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      stars.forEach(s => {
        s.o += s.speed
        if (s.o > 1) s.speed = -s.speed
        if (s.o < 0) s.speed = -s.speed
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${s.r > 1 ? '200,190,255' : '255,255,255'},${Math.abs(s.o).toFixed(2)})`
        ctx.fill()
      })
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="hero-bg relative overflow-hidden" style={{ minHeight: '520px' }}>
      {/* Animated star canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60 pointer-events-none" />

      {/* Nebula orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'nebula-drift 12s ease-in-out infinite' }} />
      <div className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'nebula-drift 16s ease-in-out infinite reverse' }} />
      <div className="absolute top-1/2 left-10 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <div className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center relative" style={{ zIndex: 1 }}>

        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-3 mb-8">
          <div className="live-badge">
            <span className="live-dot" />
            {he ? 'נתונים חיים מהחלל' : 'Live data from space'}
          </div>
        </div>

        {/* Main title */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white mb-6 leading-[1.05] tracking-tight">
          {he ? (
            <>
              עקוב אחרי{' '}
              <span className="gradient-text">תחנת החלל</span>
              <br />
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>בזמן אמת</span>
            </>
          ) : (
            <>
              Track the{' '}
              <span className="gradient-text">ISS Live</span>
              <br />
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>from Anywhere on Earth</span>
            </>
          )}
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed font-light">
          {he
            ? 'קבל התראה כשה-ISS עובר מעליך, ראה מי בחלל עכשיו, עקוב אחרי ירח, שיגורים ומזג אוויר חלל — הכל חינם'
            : "Get notified when ISS passes overhead. Track moon phases, solar storms, rocket launches, and 40,000+ satellites — all free."}
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3 justify-center mb-14">
          <button
            onClick={onScrollToISS}
            className="btn-shimmer px-8 py-4 text-sm flex items-center gap-2.5"
          >
            <span className="text-lg">🛸</span>
            <span>{he ? 'איפה ISS עכשיו?' : 'Where is ISS now?'}</span>
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent('SpaceHub — Real-time Space Tracker 🚀 https://spacehub-nu.vercel.app')}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-ghost flex items-center gap-2.5 px-8 py-4 text-sm"
          >
            <span className="text-lg">📲</span>
            <span>{he ? 'שתף עם חבר' : 'Share with a friend'}</span>
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
          {[
            { n: '7+',    label: he ? 'אסטרונאוטים בחלל' : 'Astronauts in space', icon: '👨‍🚀' },
            { n: '408',   label: he ? 'ק"מ מעל כדור הארץ' : 'km above Earth',      icon: '🌍' },
            { n: '92',    label: he ? 'דקות להקפה'         : 'Minutes per orbit',    icon: '⏱️' },
            { n: '24/7',  label: he ? 'בזמן אמת'           : 'Real-time tracking',   icon: '📡' },
          ].map(s => (
            <div key={s.n} className="stat-card">
              <div className="text-xl mb-1">{s.icon}</div>
              <p className="text-2xl sm:text-3xl font-black gradient-text mb-1">{s.n}</p>
              <p className="text-xs text-gray-600 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Scroll hint */}
        <div className="mt-10 flex flex-col items-center gap-2 opacity-40">
          <div className="text-xs text-gray-500 tracking-widest uppercase">Scroll to explore</div>
          <div style={{ width: 1, height: 32, background: 'linear-gradient(180deg, rgba(99,102,241,0.6), transparent)' }} />
        </div>
      </div>
    </div>
  )
}
