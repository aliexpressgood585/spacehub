import type { SupabaseClient } from '@supabase/supabase-js'

// Auth + per-user cloud storage for the website (observation log today).
// Optional by design: if the env vars are absent the app runs exactly as it
// did before — anonymous, localStorage-only — instead of erroring at boot.

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const authConfigured = Boolean(URL && ANON)

let clientPromise: Promise<SupabaseClient | null> | null = null

/**
 * Loads the Supabase SDK on first use and caches the client.
 *
 * The SDK is ~120 KB of the bundle and only sign-in and the observation-log
 * sync ever touch it, so importing it eagerly made every anonymous visitor pay
 * for a feature they never reach. Callers were already async, so awaiting the
 * import costs them nothing.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!authConfigured) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) =>
        createClient(URL!, ANON!, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }),
      )
      .catch(() => null)
  }
  return clientPromise
}

/**
 * True when this browser already holds a Supabase session, i.e. someone signed
 * in here before. Lets the app decide whether the SDK is worth fetching at all
 * on this pageview — signed-out visitors never load it.
 */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true
    }
  } catch {
    // private mode / storage blocked — treat as signed out
  }
  return false
}

/** True on the magic-link landing, where the SDK must run to redeem the token. */
export function isAuthCallback(): boolean {
  if (typeof window === 'undefined') return false
  const { hash, search } = window.location
  return hash.includes('access_token=') || hash.includes('error_code=') || /[?&]code=/.test(search)
}
