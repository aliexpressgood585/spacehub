const CACHE = 'spacehub-v6'
const API_CACHE = 'spacehub-api-v1'

// APIs that should be cached with stale-while-revalidate (good for offline)
const API_HOSTS = [
  'wheretheiss.at',
  'open-notify.org',
  'api.spaceflightnewsapi.net',
  'api.spacexdata.com',
  'api.nasa.gov',
  'll.thespacedevs.com',
  'celestrak.org',
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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Space data APIs — stale-while-revalidate (show cached, update in background)
  if (API_HOSTS.some(h => url.hostname.includes(h))) {
    e.respondWith(
      caches.open(API_CACHE).then(async cache => {
        const cached = await cache.match(e.request)
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone())
          return res
        }).catch(() => null)
        return cached || fetchPromise || new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    return
  }

  // HTML pages — network first so new deployments are always picked up
  if (e.request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      }).catch(() => caches.match('/offline.html') || caches.match(e.request))
    )
    return
  }

  // Hashed JS/CSS assets — cache first
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
