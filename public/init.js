// Service Worker — force-update on every load so new deployments always reach users
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async function () {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      // Check for a new SW version on every page load (not just every 24h)
      reg.update()

      // When a new SW activates and takes control, reload once so fresh JS is served
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })

      // If a new SW is waiting (e.g. from a previous visit), tell it to activate now
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
      reg.addEventListener('updatefound', function () {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed') {
            nw.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    } catch (e) { /* SW registration failed — continue without it */ }
  })
}

// Google Analytics
window.dataLayer = window.dataLayer || []
function gtag() { dataLayer.push(arguments) }
gtag('js', new Date())
gtag('config', 'G-YVDZCEHZGZ')
