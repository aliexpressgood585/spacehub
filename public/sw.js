const CACHE = 'spacehub-v2'
const DATA_CACHE = 'spacehub-user-data'
const STATIC = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== DATA_CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('api.')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      }))
    )
  }
})

// Save user location from the app
self.addEventListener('message', e => {
  if (e.data?.type === 'SET_LOCATION') {
    caches.open(DATA_CACHE).then(cache =>
      cache.put('/user-location', new Response(JSON.stringify(e.data.location), {
        headers: { 'Content-Type': 'application/json' }
      }))
    )
  }
})

// Push notification (server-sent)
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.title ?? '🚀 SpaceHub', {
      body: data.body ?? 'Space update!',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'spacehub',
      renotify: true,
      data: { url: data.url ?? '/' },
    })
  )
})

// Periodic Background Sync — checks ISS every ~15 min even when browser is closed
self.addEventListener('periodicsync', e => {
  if (e.tag === 'iss-check') {
    e.waitUntil(checkISSAndNotify())
  }
})

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function calcElevation(groundDist, issAlt) {
  const R = 6371
  const rho = groundDist / R
  return Math.atan2(Math.cos(rho) - R/(R+issAlt), Math.sin(rho)) * 180 / Math.PI
}

async function checkISSAndNotify() {
  try {
    const cache = await caches.open(DATA_CACHE)
    const locRes = await cache.match('/user-location')
    if (!locRes) return

    const loc = await locRes.json()
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544')
    const iss = await res.json()

    const dist = haversineKm(loc.lat, loc.lng, iss.latitude, iss.longitude)
    const elev = calcElevation(dist, iss.altitude)

    if (elev > 10) {
      await self.registration.showNotification('🚀 ISS is passing over you!', {
        body: `The International Space Station is ${elev.toFixed(0)}° above the horizon over ${loc.city}! Go outside and look up! 👀`,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'iss-pass',
        renotify: true,
        data: { url: '/' },
      })
    } else if (dist < 3000) {
      // Approaching — warn 30+ min early
      const minsAway = Math.round((dist - 1500) / (iss.velocity / 60))
      if (minsAway > 0 && minsAway < 45) {
        await self.registration.showNotification('🛸 ISS approaching your area', {
          body: `The ISS will pass over ${loc.city} in ~${minsAway} minutes. Get ready to look up!`,
          icon: '/favicon.svg',
          tag: 'iss-approaching',
          data: { url: '/' },
        })
      }
    }
  } catch (_) {}
}

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? '/'))
})
