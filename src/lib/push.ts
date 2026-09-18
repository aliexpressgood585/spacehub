// Web Push subscription helper.
//
// Before this existed the app only ever called Notification.requestPermission()
// and constructed `new Notification(...)` from the page — which silently does
// nothing once the tab is closed. That is exactly when an "ISS overhead in 10
// minutes" alert matters, so every alert prompt in the app now routes through
// pushManager.subscribe() and a server that can reach the device later.

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

export interface PushLocation {
  lat: number
  lng: number
  city?: string
}

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

// VAPID public key is served by the API so rotating it never needs a rebuild.
let cachedKey: string | null = null
async function vapidKey(): Promise<string | null> {
  if (cachedKey) return cachedKey
  try {
    const r = await fetch('/api/iss?action=vapid')
    if (!r.ok) return null
    const { key } = (await r.json()) as { key?: string }
    cachedKey = key || null
    return cachedKey
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/**
 * Ask for permission, create a real push subscription and register it with the
 * server together with the location whose ISS passes should be watched.
 * Returns the resulting state so callers can render honest UI.
 */
export async function enablePush(loc?: PushLocation): Promise<PushState> {
  if (!supported()) return 'unsupported'

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'

  const key = await vapidKey()
  if (!key) return 'off' // server not configured — never claim success

  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }))

    const r = await fetch('/api/iss?action=subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        city: loc?.city ?? null,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })
    if (!r.ok) return 'off'
    return 'on'
  } catch {
    return 'off'
  }
}

/** Update the watched location for an existing subscription. */
export async function updatePushLocation(loc: PushLocation): Promise<void> {
  if (!supported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/iss?action=subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        lat: loc.lat,
        lng: loc.lng,
        city: loc.city ?? null,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })
  } catch {
    /* location refresh is best-effort */
  }
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await fetch('/api/iss?action=unsub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
      await sub.unsubscribe()
    }
    return 'off'
  } catch {
    return 'off'
  }
}
