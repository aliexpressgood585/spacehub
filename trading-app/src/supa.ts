/// <reference types="vite/client" />
// Public read-only connection to the bot's database (anon key; RLS allows SELECT only).
export const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://adxgadwghgkwmntsnrar.supabase.co'
export const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkeGdhZHdnaGdrd21udHNucmFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NzY3OTksImV4cCI6MjEwNTI1Mjc5OX0.08xmuV7Wf49I8rp_RffeiIQVqWNilE7QRfNxpmrU_j4'
