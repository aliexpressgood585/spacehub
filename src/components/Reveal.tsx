import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  delay?: 0 | 1 | 2 | 3 | 4
  className?: string
}

export default function Reveal({ children, delay = 0, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
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
  }, [])

  return (
    <div ref={ref} className={`reveal${delay ? ` reveal-d${delay}` : ''} ${className}`}>
      {children}
    </div>
  )
}
