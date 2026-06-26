import { useEffect, useRef } from 'react'

export default function CursorGlow() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if ('ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches) return

    let mx = -200, my = -200
    let rx = -200, ry = -200
    let raf: number
    let isHover = false

    document.body.classList.add('cursor-active')

    const onMove = (e: MouseEvent) => {
      mx = e.clientX
      my = e.clientY
      const el = e.target as Element
      isHover = !!(el.closest('button, a, [role="button"], select, input, textarea, label'))
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      rx += (mx - rx) * 0.14
      ry += (my - ry) * 0.14

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${mx - 3}px, ${my - 3}px)`
        dotRef.current.style.background = isHover ? '#f472b6' : '#a78bfa'
        dotRef.current.style.boxShadow  = isHover
          ? '0 0 8px rgba(244,114,182,1), 0 0 16px rgba(244,114,182,0.5)'
          : '0 0 8px rgba(167,139,250,0.9), 0 0 16px rgba(99,102,241,0.4)'
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${rx - 15}px, ${ry - 15}px) scale(${isHover ? 1.5 : 1})`
        ringRef.current.style.borderColor = isHover
          ? 'rgba(244,114,182,0.6)'
          : 'rgba(167,139,250,0.45)'
        ringRef.current.style.boxShadow = isHover
          ? '0 0 14px rgba(244,114,182,0.3)'
          : '0 0 10px rgba(99,102,241,0.25)'
      }
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    raf = requestAnimationFrame(loop)

    return () => {
      document.body.classList.remove('cursor-active')
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      {/* Inner dot — snaps immediately to cursor */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position: 'fixed', top: 0, left: 0,
          width: 6, height: 6,
          borderRadius: '50%',
          background: '#a78bfa',
          pointerEvents: 'none',
          zIndex: 999997,
          willChange: 'transform',
          transition: 'background 0.15s, box-shadow 0.15s',
        }}
      />
      {/* Outer ring — lags behind with lerp */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{
          position: 'fixed', top: 0, left: 0,
          width: 30, height: 30,
          borderRadius: '50%',
          border: '1px solid rgba(167,139,250,0.45)',
          pointerEvents: 'none',
          zIndex: 999996,
          willChange: 'transform',
          transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.1s',
        }}
      />
    </>
  )
}
