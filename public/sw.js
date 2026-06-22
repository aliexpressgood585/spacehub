const CACHE = 'spacehub-v5'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/'])))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // External APIs — network only with cache fallback
  if (!url.hostname.includes('vercel.app') && !url.hostname.includes('localhost')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
    return
  }

  // HTML pages — network first so new deployments are always picked up
  if (e.request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      }).catch(() => caches.match(e.request))
    )
    return
  }

  // Hashed JS/CSS assets — cache first (filenames change with each build so this is safe)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone))
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
