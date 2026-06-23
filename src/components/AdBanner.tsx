import { useEffect, useRef } from 'react'

declare global {
  interface Window { adsbygoogle: unknown[] }
}

const PUB = 'ca-pub-7392124652698131'
const ENV_SLOT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined

interface Props {
  slot?: string
  format?: 'auto' | 'rectangle' | 'horizontal'
  style?: React.CSSProperties
}

export default function AdBanner({ slot = ENV_SLOT, format = 'auto', style }: Props) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!slot || pushed.current) return
    pushed.current = true
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {}
  }, [slot])

  if (!slot) return null

  return (
    <div style={{
      background: 'rgba(255,255,255,0.015)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 14,
      padding: '10px 12px 6px',
      overflow: 'hidden',
      ...style,
    }}>
      <p style={{
        fontSize: 9,
        color: 'rgba(255,255,255,0.1)',
        textAlign: 'center',
        marginBottom: 4,
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        fontWeight: 600,
        fontFamily: 'system-ui',
      }}>
        Advertisement
      </p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', colorScheme: 'dark' } as React.CSSProperties}
        data-ad-client={PUB}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
        data-color-background="020510"
        data-color-border="1e2040"
        data-color-link="6366f1"
        data-color-text="9ca3af"
        data-color-url="4f46e5"
      />
    </div>
  )
}
