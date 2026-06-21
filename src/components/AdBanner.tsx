import { useEffect } from 'react'

interface AdBannerProps {
  slot?: 'leaderboard' | 'rectangle' | 'sidebar'
}

declare global {
  interface Window { adsbygoogle: unknown[] }
}

export default function AdBanner({ slot = 'leaderboard' }: AdBannerProps) {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {}
  }, [])

  const style = slot === 'leaderboard'
    ? { display: 'block', minHeight: 90 }
    : { display: 'block', minHeight: 250 }

  return (
    <div className="mx-auto overflow-hidden" style={{ maxWidth: '100%' }}>
      <ins
        className="adsbygoogle"
        style={style}
        data-ad-client="ca-pub-7392124652698131"
        data-ad-slot="auto"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
