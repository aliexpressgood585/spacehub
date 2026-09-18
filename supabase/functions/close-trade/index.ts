import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // v56.8 — OWNER-ONLY. This function is deployed --no-verify-jwt (the every-minute
  // cron needs to reach the bot without a session), and `verify_jwt` would not help
  // anyway: the anon key IS a valid JWT, and it ships inside the public dashboard
  // bundle. So until now anyone on the internet could POST a trade_id here and close
  // the bot's positions. Gate on the service-role key, which Supabase injects into
  // the function environment and which never leaves the server: the public page
  // cannot present it, the owner and the agent can.
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const bearer  = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!SERVICE || bearer !== SERVICE) {
    return new Response(JSON.stringify({ error: 'forbidden: owner credentials required' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  try {
    const { trade_id, exit_price, pnl, pnl_pct } = await req.json()
    if (!trade_id) return new Response(JSON.stringify({ error: 'missing trade_id' }), { status: 400, headers: CORS })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await supabase.from('bot_trades').update({
      status:      'MANUAL',
      exit_price,
      pnl,
      pnl_pct,
      closed_at:   new Date().toISOString(),
    }).eq('id', trade_id).eq('status', 'OPEN')

    if (error) throw error

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
