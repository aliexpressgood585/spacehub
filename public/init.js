// Service Worker — force-update on every load so new deployments always reach users
if ('serviceWorker' in navigator) {
  // Was this page already under a service worker when it started?
  //
  // This single flag is what separates "a new deployment took over, reload to
  // get the fresh JS" from "the very first service worker just claimed a page
  // that already loaded straight from the network". Only the first case needs a
  // reload. Without the distinction every first-time visitor had the page
  // yanked out from under them the moment the SW activated — and because the
  // reloaded page registers again, that reload could repeat.
  const wasControlled = !!navigator.serviceWorker.controller

  window.addEventListener('load', async function () {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      // Check for a new SW version on every page load (not just every 24h)
      reg.update()

      // When a NEW deployment's SW takes control, reload once so fresh JS is
      // served. Guarded twice over: once per document, and once per tab, so a
      // misbehaving worker can never put the tab in a reload loop.
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!wasControlled || refreshing) return
        try {
          if (sessionStorage.getItem('_sw_reloaded')) return
          sessionStorage.setItem('_sw_reloaded', '1')
        } catch (_) { /* storage blocked — the per-document guard still holds */ }
        refreshing = true
        window.location.reload()
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
