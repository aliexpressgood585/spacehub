import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Fires a lightweight beacon to /api/track on load and on every SPA
// navigation. No cookies, no identifiers — just path + referrer.
export default function PageviewTracker() {
  const { pathname } = useLocation()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (lastPath.current === pathname) return
    const isFirst = lastPath.current === null
    lastPath.current = pathname
    if (location.hostname === 'localhost' || pathname === '/analytics') return
    const payload = JSON.stringify({ path: pathname, ref: isFirst ? document.referrer : '' })
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics', new Blob([payload], { type: 'application/json' }))
      } else {
        fetch('/api/analytics', { method: 'POST', body: payload, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {})
      }
    } catch { /* tracking must never break the app */ }
  }, [pathname])

  return null
}
