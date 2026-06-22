import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n/LangContext'

interface Props {
  onPremium: () => void
  onScrollToISS: () => void
}

export default function Hero({ onScrollToISS }: Props) {
  const { t } = useLang()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [issAlt, setIssAlt] = useState<number | null>(null)
  const [crewCount, setCrewCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/iss')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setIssAlt(Math.round(d.altitude)))
      .catch(() => {})
    fetch('/api/astros')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setCrewCount(d.number))
      .catch(() => {})
  }, [])

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
    <div className="hero-bg relative overflow-hidden" style={{ minHeight: 500 }}>
      {/* Star canvas — decorative only */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.55 }}
      />

      {/* Nebula orbs */}
      <div aria-hidden="true" className="absolute top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 70%)', filter: 'blur(70px)' }} />
      <div aria-hidden="true" className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.11) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div aria-hidden="true" className="absolute top-1/3 right-10 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)', filter: 'blur(50px)' }} />

      <div className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center relative" style={{ zIndex: 1 }}>
        <div className="inline-flex items-center gap-3 mb-8">
          <div className="live-badge">
            <span className="live-dot" />
            {t('hero.live')}
          </div>
        </div>
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white mb-6 leading-[1.05] tracking-tight">
          {t('hero.title1')} <span className="gradient-text">{t('hero.title2')}</span><br />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('hero.title3')}</span>
        </h1>
        <p className="text-base sm:text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed font-light">
          {t('hero.subtitle')}
        </p>
        <div className="flex flex-wrap gap-3 justify-center mb-14">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
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
            <div key={s.tKey} className="stat-card">
              <div className="text-xl mb-1">{s.icon}</div>
              <p className="text-2xl sm:text-3xl font-black gradient-text mb-1">{s.n}</p>
              <p className="text-xs text-gray-600 leading-tight">{t(s.tKey)}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-2" style={{ opacity: 0.35 }}>
          <div className="text-[10px] text-gray-500 tracking-widest uppercase">{t('hero.scroll')}</div>
          <div style={{ width: 1, height: 28, background: 'linear-gradient(180deg,rgba(99,102,241,0.7),transparent)' }} />
        </div>
      </div>
    </div>
  )
}
