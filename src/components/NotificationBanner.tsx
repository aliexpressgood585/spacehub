import { useState, useEffect } from 'react'
import { enablePush } from '../lib/push'

export default function NotificationBanner() {
  const [show, setShow] = useState(false)
  const [granted, setGranted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('PushManager' in window)) return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem('notif_dismissed')) return
    const t = setTimeout(() => setShow(true), 25000)
    return () => clearTimeout(t)
  }, [])

  // Alerts are only useful with a location to compute passes for. Ask the
  // browser, but never block enabling on it — the server falls back to a
  // digest for whatever location we do have.
  const currentLocation = () =>
    new Promise<{ lat: number; lng: number } | undefined>(resolve => {
      if (!navigator.geolocation) return resolve(undefined)
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(undefined),
        { timeout: 8000, maximumAge: 600_000 },
      )
    })

  const request = async () => {
    setBusy(true)
    setFailed(false)
    const loc = await currentLocation()
    const state = await enablePush(loc)
    setBusy(false)

    if (state === 'on') {
      setGranted(true)
      setTimeout(() => setShow(false), 3000)
    } else if (state === 'denied') {
      dismiss()
    } else {
      // Permission may have been granted but the subscription failed — say so
      // rather than showing a success message for alerts that will never come.
      setFailed(true)
    }
  }

  const dismiss = () => {
    setShow(false)
    localStorage.setItem('notif_dismissed', '1')
  }

  if (!show) return null

  return (
    <div
      role="alertdialog"
      aria-label="Enable space notifications"
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        width: 'min(420px, calc(100vw - 32px))',
        background: 'linear-gradient(135deg, rgba(13,16,45,0.97) 0%, rgba(8,11,34,0.97) 100%)',
        border: '1px solid rgba(99,102,241,0.4)',
        borderRadius: 20,
        padding: '16px 20px',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1) inset',
        animation: 'fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) forwards',
      }}
    >
      {granted ? (
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 28 }}>✅</span>
          <div>
            <p className="text-white font-bold text-sm">Alerts are on!</p>
            <p className="text-gray-400 text-xs">We'll ping you before the ISS passes overhead.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
            border: '1px solid rgba(99,102,241,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>🔔</div>

          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm mb-0.5">Get ISS pass-over alerts</p>
            <p className="text-gray-400 text-xs leading-relaxed mb-3">
              {failed
                ? "Couldn't turn on alerts just now — please try again in a moment."
                : "We'll notify you before the ISS flies over your location — even when SpaceHub is closed."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={request}
                disabled={busy}
                className="btn-shimmer px-4 py-2 text-xs font-bold rounded-xl flex-1 disabled:opacity-60"
              >
                {busy ? 'Enabling…' : failed ? '↻ Try again' : '🚀 Enable Alerts'}
              </button>
              <button
                onClick={dismiss}
                className="px-4 py-2 text-xs rounded-xl font-semibold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}
              >
                Not now
              </button>
            </div>
          </div>

          <button
            onClick={dismiss}
            aria-label="Dismiss notification prompt"
            style={{ color: '#4b5563', fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: -2 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
