import { useEffect, useRef } from 'react'
import { useLang } from '../i18n/LangContext'
import { useISS } from '../contexts/ISSContext'

interface Props {
  onPremium: () => void
  onScrollToISS: () => void
}

export default function Hero({ onScrollToISS }: Props) {
  const { t } = useLang()
  const { iss, astros } = useISS()
  const issAlt = iss ? Math.round(iss.altitude) : null
  const crewCount = astros
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf: number

    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const resize = () => {
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width || window.innerWidth
        canvas.height = rect.height || 520
      }
      resize()
      window.addEventListener('resize', resize)

      const stars: { x: number; y: number; r: number; o: number; spd: number }[] = []
      for (let i = 0; i < 160; i++) {
        stars.push({
          x: Math.random() * (canvas.width || 1400),
          y: Math.random() * (canvas.height || 520),
          r: Math.random() * 1.3 + 0.2,
          o: Math.random(),
          spd: Math.random() * 0.007 + 0.002,
        })
      }

      const draw = () => {
        raf = requestAnimationFrame(draw)
        if (!canvas.width || !canvas.height) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        for (const s of stars) {
          s.o += s.spd
          if (s.o > 1 || s.o < 0) s.spd = -s.spd
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          const alpha = Math.max(0, Math.min(1, Math.abs(s.o)))
          ctx.fillStyle = s.r > 1
            ? `rgba(200,185,255,${alpha.toFixed(2)})`
            : `rgba(255,255,255,${alpha.toFixed(2)})`
          ctx.fill()
        }
      }
      draw()

      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', resize)
      }
    } catch {
      // canvas not supported — graceful fallback, site still renders
      return () => cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="hero-bg relative overflow-hidden" style={{ minHeight: 580 }}>
      {/* Aurora line */}
      <div aria-hidden="true" className="hero-aurora" />
      <div aria-hidden="true" className="hero-aurora-2" />

      {/* Shooting stars */}
      <div aria-hidden="true" className="shooting-star" style={{ top: '18%', left: '82%', animationDelay: '1.2s', animationDuration: '5s' }} />
      <div aria-hidden="true" className="shooting-star" style={{ top: '42%', left: '65%', animationDelay: '3.8s', animationDuration: '4s' }} />
      <div aria-hidden="true" className="shooting-star" style={{ top: '10%', left: '45%', animationDelay: '7s', animationDuration: '6s' }} />

      {/* Star canvas — decorative only */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.6 }}
      />

      {/* Decorative orbit rings — purely visual */}
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '-10%' }}>
        <svg width="720" height="300" viewBox="0 0 720 300" style={{ opacity: 0.07 }}>
          <ellipse cx="360" cy="150" rx="340" ry="110" fill="none" stroke="#a78bfa" strokeWidth="1" strokeDasharray="3 9" style={{ animation: 'orbit 60s linear infinite' }} />
          <ellipse cx="360" cy="150" rx="240" ry="76" fill="none" stroke="#6366f1" strokeWidth="0.5" strokeDasharray="2 7" style={{ animation: 'orbit 40s linear infinite reverse' }} />
        </svg>
      </div>

      {/* Nebula — CSS gradients, no filter:blur (performance) */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
        background: `
          radial-gradient(ellipse 65% 60% at 30% 20%, rgba(99,102,241,0.18) 0%, transparent 70%),
          radial-gradient(ellipse 50% 55% at 75% 80%, rgba(139,92,246,0.15) 0%, transparent 65%),
          radial-gradient(ellipse 35% 40% at 85% 15%, rgba(56,189,248,0.10) 0%, transparent 60%),
          radial-gradient(ellipse 30% 35% at 10% 70%, rgba(244,114,182,0.09) 0%, transparent 60%)
        `
      }} />

      <div className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center relative" style={{ zIndex: 1 }}>
        <div className="inline-flex items-center gap-3 mb-8" style={{ animation: 'word-up 0.5s ease forwards' }}>
          <div className="live-badge">
            <span className="live-dot" />
            {t('hero.live')}
          </div>
        </div>

        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 leading-[1.08]"
          style={{ fontFamily: "'Orbitron', 'Space Grotesk', sans-serif", letterSpacing: '-0.01em' }}
        >
          <span className="word-anim word-anim-1 text-white">{t('hero.title1')}</span>{' '}
          <span className="gradient-text-aurora word-anim word-anim-2">{t('hero.title2')}</span><br />
          <span
            className="word-anim word-anim-3"
            style={{
              fontWeight: 700,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(167,139,250,0.85) 50%, rgba(255,255,255,0.55) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 18px rgba(139,92,246,0.4))',
            }}
          >{t('hero.title3')}</span>
        </h1>

        {/* Glow line under title */}
        <div aria-hidden="true" className="mx-auto mb-8" style={{ width: 220, height: 1.5, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(167,139,250,1), rgba(34,211,238,0.6), transparent)', boxShadow: '0 0 16px rgba(139,92,246,0.7), 0 0 32px rgba(99,102,241,0.3)', animation: 'hero-glow-sweep 4s ease-in-out infinite', borderRadius: 999 }} />

        <p className="text-base sm:text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed"
          style={{ animation: 'word-up 0.7s 0.4s cubic-bezier(0.22,1,0.36,1) both', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
          {t('hero.subtitle')}
        </p>

        <div className="flex flex-wrap gap-3 justify-center mb-14"
          style={{ animation: 'word-up 0.7s 0.55s cubic-bezier(0.22,1,0.36,1) both' }}>
          <button onClick={onScrollToISS} className="btn-shimmer px-8 py-4 text-sm flex items-center gap-2.5">
            <span className="text-lg">🛸</span>
            <span>{t('hero.cta1')}</span>
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent('SpaceHub — Real-time Space Tracker 🚀 https://spacehub-nu.vercel.app')}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-ghost flex items-center gap-2.5 px-8 py-4 text-sm"
          >
            <span className="text-lg">📲</span>
            <span>{t('hero.cta2')}</span>
          </a>
        </div>

        <div className="flex justify-center mb-10">
          <form action="https://www.paypal.com/donate" method="post" target="_blank">
            <input type="hidden" name="business" value="Yakov104@gmail.com" />
            <input type="hidden" name="currency_code" value="USD" />
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-sm transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #003087, #009cde)',
                color: '#fff',
                border: '1px solid rgba(0,156,222,0.5)',
                boxShadow: '0 0 18px rgba(0,156,222,0.35)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.067 8.478c.492.315.844.825.983 1.39C21.6 12.258 20.38 14 18.04 14H16.5l-.5 3H13l2-11h4.067c.844 0 1.508.478 1.508 1.478h-.508zM7.5 6h5.567c2.34 0 3.56 1.742 3.01 4.132-.14.565-.49 1.075-.983 1.39C14.602 12.522 13.938 13 13.094 13H10.5L9.5 17H7L9 6H7.5zM10.5 11h2.594c.468 0 .844-.34.938-.8.094-.46-.188-.8-.656-.8H10.5l-.438 1.6z"/>
              </svg>
              Support SpaceHub via PayPal
            </button>
          </form>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto"
          style={{ animation: 'word-up 0.7s 0.7s cubic-bezier(0.22,1,0.36,1) both' }}>
          {(() => {
            const alt = issAlt ?? 408
            const orbitMin = Math.round(2 * Math.PI * Math.sqrt(Math.pow(6371 + alt, 3) / 398600.4418) / 60)
            return [
              { n: crewCount !== null ? String(crewCount) : '7+', tKey: 'hero.stat.astronauts', icon: '👨‍🚀' },
              { n: `${alt}`,                                        tKey: 'hero.stat.altitude',   icon: '🌍' },
              { n: `${orbitMin}`,                                   tKey: 'hero.stat.orbit',      icon: '⏱️' },
              { n: '24/7',                                          tKey: 'hero.stat.tracking',   icon: '📡' },
            ]
          })().map(s => (
            <div key={s.tKey} className="stat-card group elevation-2">
              <div className="text-2xl mb-2 transition-transform duration-300 group-hover:scale-115 group-hover:drop-shadow-lg">{s.icon}</div>
              <p key={s.n} className="text-2xl sm:text-3xl font-black gradient-text-aurora mb-1 count-reveal">{s.n}</p>
              <p className="text-xs text-gray-500 leading-tight tracking-wide">{t(s.tKey)}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-2" style={{ opacity: 0.3 }}>
          <div className="text-[10px] text-gray-500 tracking-widest uppercase">{t('hero.scroll')}</div>
          <div style={{ width: 1, height: 32, background: 'linear-gradient(180deg,rgba(99,102,241,0.8),transparent)' }} />
        </div>
      </div>
    </div>
  )
}
