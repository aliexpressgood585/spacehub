import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Auth + per-user cloud storage for the website (observation log today).
// Optional by design: if the env vars are absent the app runs exactly as it
// did before — anonymous, localStorage-only — instead of erroring at boot.

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const authConfigured = Boolean(URL && ANON)

export const supabase: SupabaseClient | null = authConfigured
  ? createClient(URL!, ANON!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
