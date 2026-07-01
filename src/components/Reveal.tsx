import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  delay?: 0 | 1 | 2 | 3 | 4
  className?: string
}

// Defers mounting children until the section approaches the viewport
// (1200px ahead), so a fast scroll mounts sections progressively instead
// of loading every chunk/canvas at once — which crashed mobile tabs.
export default function Reveal({ children, delay = 0, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el || mounted) return
    const mountObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true)
          mountObs.disconnect()
        }
      },
      { rootMargin: '1200px 0px' }
    )
    mountObs.observe(el)
    return () => mountObs.disconnect()
  }, [mounted])

  useEffect(() => {
    const el = ref.current
    if (!el || !mounted) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          obs.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [mounted])

  return (
    <div ref={ref} className={`reveal${delay ? ` reveal-d${delay}` : ''} ${className}`} style={mounted ? undefined : { minHeight: 140 }}>
      {mounted ? children : null}
    </div>
  )
}
