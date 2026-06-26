const CACHE = 'spacehub-v11'
const API_CACHE = 'spacehub-api-v6'

// Allow page to force-activate this SW immediately
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

const OWN_API_PATHS = ['/api/iss', '/api/astros', '/api/apod', '/api/neo']

const EXT_API_HOSTS = [
  'api.spaceflightnewsapi.net',
  'api.spacexdata.com',
  'll.thespacedevs.com',
  'celestrak.org',
  'services.swpc.noaa.gov',
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/offline.html'])))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== API_CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

const swrResponse = (cache, request) =>
  cache.match(request).then(cached => {
    const fetchPromise = fetch(request).then(res => {
      if (res.ok) cache.put(request, res.clone())
      return res
    }).catch(() => null)
    return cached || fetchPromise || new Response(JSON.stringify({ error: 'offline' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  })

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Only intercept same-origin requests and known external APIs
  // Let the browser handle all other cross-origin requests (images, fonts, etc.) natively
  if (url.origin !== self.location.origin &&
      !OWN_API_PATHS.some(p => url.pathname.startsWith(p)) &&
      !EXT_API_HOSTS.some(h => url.hostname.includes(h))) {
    return
  }

  // Own API proxy routes — stale-while-revalidate
  if (OWN_API_PATHS.some(p => url.pathname.startsWith(p))) {
    e.respondWith(caches.open(API_CACHE).then(cache => swrResponse(cache, e.request)))
    return
  }

  // External space data APIs — stale-while-revalidate
  if (EXT_API_HOSTS.some(h => url.hostname.includes(h))) {
    e.respondWith(caches.open(API_CACHE).then(cache => swrResponse(cache, e.request)))
    return
  }

  // HTML pages — always network, never cache (prevents stale chunk hash errors after deploys)
  if (e.request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/offline.html'))
    )
    return
  }

  // Star catalog data files — cache first, offline-safe
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          return res
        }).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
      })
    )
    return
  }

  // Same-origin JS/CSS/assets — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
      }
      return res
    }))
  )
})

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {}
  e.waitUntil(
    self.registration.showNotification(data.title || '🚀 SpaceHub', {
      body: data.body || 'Space update!',
      icon: '/favicon.svg',
      tag: 'spacehub',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data ? e.notification.data.url : '/'))
})
