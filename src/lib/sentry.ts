// Lightweight Sentry shim — replace with @sentry/react once npm install is run
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function init(_opts: unknown) {}

export function captureException(err: unknown, _ctx?: unknown) {
  if (DSN) console.error('[Sentry]', err)
}
