// Supabase project used only for the private visit-analytics dashboard.
// The publishable (anon) key is safe to ship: RLS allows insert-only on
// page_views, and reads go through an RPC that requires the dashboard key.
export const SUPABASE_URL = process.env.ANALYTICS_SUPABASE_URL || 'https://sxlofntrumabnbxrjzsw.supabase.co'
export const SUPABASE_ANON_KEY = process.env.ANALYTICS_SUPABASE_ANON_KEY || 'sb_publishable_SdTxyYa4Pt0SHP2cbeu40Q_6fApVE06'

export const analyticsConfigured = () =>
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('PENDING')
