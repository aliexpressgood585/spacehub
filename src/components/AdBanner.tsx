// Replace the placeholder divs below with real AdSense <ins> tags once approved.
// Example AdSense tag:
// <ins className="adsbygoogle" style={{display:'block'}} data-ad-client="ca-pub-XXXXX" data-ad-slot="XXXXX" data-ad-format="auto" data-full-width-responsive="true" />

interface AdBannerProps {
  slot?: 'leaderboard' | 'rectangle' | 'sidebar'
}

export default function AdBanner({ slot = 'leaderboard' }: AdBannerProps) {
  const sizes = {
    leaderboard: { w: '100%', h: 90, label: '728×90 Leaderboard' },
    rectangle:   { w: 300,   h: 250, label: '300×250 Rectangle' },
    sidebar:     { w: 160,   h: 600, label: '160×600 Sidebar' },
  }
  const s = sizes[slot]

  // In production, replace this div with your AdSense <ins> tag
  return (
    <div
      style={{ width: s.w, height: s.h, maxWidth: '100%' }}
      className="mx-auto flex items-center justify-center rounded-lg border border-dashed border-space-700/50 bg-space-900/30"
    >
      <div className="text-center">
        <p className="text-gray-700 text-xs">פרסום</p>
        <p className="text-gray-800 text-xs">{s.label}</p>
        {/* ↓ Paste your AdSense <ins> tag here ↓ */}
      </div>
    </div>
  )
}
