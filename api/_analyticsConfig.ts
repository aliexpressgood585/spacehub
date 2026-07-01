// Supabase project used only for the private visit-analytics dashboard.
// The publishable (anon) key is safe to ship: RLS allows insert-only on
// page_views, and reads go through an RPC that requires the dashboard key.
export const SUPABASE_URL = process.env.ANALYTICS_SUPABASE_URL || 'PENDING_SUPABASE_URL'
export const SUPABASE_ANON_KEY = process.env.ANALYTICS_SUPABASE_ANON_KEY || 'PENDING_SUPABASE_ANON_KEY'

export const analyticsConfigured = () =>
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('PENDING')
