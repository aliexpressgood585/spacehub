import { useRef, useCallback, useState } from 'react'

interface Props {
  issLat?: number
  issLng?: number
  issAlt?: number
  city?: string
}

export default function ShareCard({ issLat, issLng, issAlt, city }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)

  const generate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 800, H = 420
    canvas.width = W; canvas.height = H

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#050816')
    bg.addColorStop(0.5, '#0a1128')
    bg.addColorStop(1, '#050816')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Stars
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W, y = Math.random() * H
      const r = Math.random() * 1.5
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`
      ctx.fill()
    }

    // Glow circle
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, 250)
    glow.addColorStop(0, 'rgba(79,70,229,0.15)')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    // Rocket emoji large
    ctx.font = '80px serif'
    ctx.fillText('🚀', 60, 120)

    // SpaceHub brand
    ctx.font = 'bold 22px system-ui'
    ctx.fillStyle = '#818cf8'
    ctx.fillText('SpaceHub', 60, 160)

    // Title
    ctx.font = 'bold 36px system-ui'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('ISS Now — Real-Time', 60, 210)

    // Data
    const data = [
      { icon: '📍', label: 'Position', val: issLat !== undefined ? `${issLat?.toFixed(2)}°, ${issLng?.toFixed(2)}°` : 'N/A' },
      { icon: '📏', label: 'Altitude',  val: issAlt !== undefined ? `${issAlt?.toFixed(0)} km` : 'N/A' },
      { icon: '🌍', label: 'Location', val: city ?? 'Earth' },
    ]
    ctx.font = '18px system-ui'
    data.forEach((d, i) => {
      const x = 60 + i * 240
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillText(d.icon + ' ' + d.label, x, 270)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 20px system-ui'
      ctx.fillText(d.val, x, 300)
      ctx.font = '18px system-ui'
    })

    // URL
    ctx.font = '14px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillText('spacehubapp.com', 60, H - 25)

    // Date
    ctx.textAlign = 'right'
    ctx.fillText(new Date().toLocaleDateString('en-US'), W - 60, H - 25)
    ctx.textAlign = 'left'

    // Border frame
    const border = ctx.createLinearGradient(0, 0, W, H)
    border.addColorStop(0, 'rgba(99,102,241,0.5)')
    border.addColorStop(1, 'rgba(139,92,246,0.5)')
    ctx.strokeStyle = border
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, W - 2, H - 2)

    // Download
    const link = document.createElement('a')
    link.download = 'spacehub-iss.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [issLat, issLng, issAlt, city])

  const shareWA = useCallback(() => {
    const text = `🛸 ISS is now at ${issLat?.toFixed(1)}°N, ${issLng?.toFixed(1)}°E at altitude ${issAlt?.toFixed(0)} km!\nTrack live: https://spacehubapp.com`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }, [issLat, issLng, issAlt])

  const shareX = useCallback(() => {
    const text = `🛸 ISS is now at ${issLat?.toFixed(1)}°N, ${issLng?.toFixed(1)}°E — altitude ${issAlt?.toFixed(0)} km! Track live:`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://spacehubapp.com')}`, '_blank')
  }, [issLat, issLng, issAlt])

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText('https://spacehubapp.com').then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  const nativeShare = useCallback(async () => {
    const text = `🛸 ISS is now at ${issLat?.toFixed(1)}°, ${issLng?.toFixed(1)}° — altitude ${issAlt?.toFixed(0)} km!\nTrack live:`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'SpaceHub — ISS Live', text, url: 'https://spacehubapp.com' })
      } catch { /* user cancelled */ }
    } else {
      copyLink()
    }
  }, [issLat, issLng, issAlt, copyLink])

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="space-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">📸</span>
        <h3 className="text-white font-semibold">Share ISS Position</h3>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex gap-2 flex-wrap">
        {canNativeShare && (
          <button onClick={nativeShare} className="btn-shimmer px-4 py-2.5 text-sm flex items-center gap-2">
            <span>🔗</span> Share
          </button>
        )}
        <button onClick={generate} className={`px-4 py-2.5 text-sm rounded-xl transition flex items-center gap-2 font-semibold ${!canNativeShare ? 'btn-shimmer' : ''}`}
          style={canNativeShare ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' } : {}}>
          <span>⬇️</span> Download
        </button>
        <button onClick={shareWA} className="px-4 py-2.5 text-sm rounded-xl transition flex items-center gap-2 font-semibold"
          style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#4ade80' }}>
          📲 WhatsApp
        </button>
        <button onClick={shareX} className="px-4 py-2.5 text-sm rounded-xl transition flex items-center gap-2 font-semibold"
          style={{ background: 'rgba(29,161,242,0.12)', border: '1px solid rgba(29,161,242,0.3)', color: '#60a5fa' }}>
          𝕏 Tweet
        </button>
        {!canNativeShare && (
          <button onClick={copyLink} className="px-4 py-2.5 text-sm rounded-xl transition flex items-center gap-2 font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: copied ? '#4ade80' : '#9ca3af' }}>
            {copied ? '✓ Copied!' : '🔗 Copy link'}
          </button>
        )}
      </div>
    </div>
  )
}
