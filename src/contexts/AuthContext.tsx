import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, authConfigured, hasStoredSession, isAuthCallback } from '../lib/supabase'

interface AuthValue {
  user: User | null
  session: Session | null
  loading: boolean
  /** False when the deployment has no Supabase configured — UI hides sign-in. */
  enabled: boolean
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue>({
  user: null,
  session: null,
  loading: false,
  enabled: false,
  signInWithEmail: async () => ({ error: 'auth unavailable' }),
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // Only a browser that already holds a session (or is redeeming a magic link)
  // has anything to restore. For everyone else there is nothing to wait for and
  // no reason to download the auth SDK on this pageview.
  const [restoring] = useState(() => authConfigured && (hasStoredSession() || isAuthCallback()))
  const [loading, setLoading] = useState(restoring)

  useEffect(() => {
    if (!restoring) return
    let alive = true
    let unsubscribe: (() => void) | undefined

    getSupabase().then(sb => {
      if (!alive) return
      if (!sb) { setLoading(false); return }

      sb.auth.getSession().then(({ data }) => {
        if (!alive) return
        setSession(data.session)
        setLoading(false)
      })

      const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
        setSession(s)
        setLoading(false)
      })
      unsubscribe = () => sub.subscription.unsubscribe()
      if (!alive) unsubscribe()
    })

    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [restoring])

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      enabled: authConfigured,
      async signInWithEmail(email: string) {
        const sb = await getSupabase()
        if (!sb) return { error: 'auth unavailable' }
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        return { error: error?.message ?? null }
      },
      async signOut() {
        const sb = await getSupabase()
        await sb?.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
