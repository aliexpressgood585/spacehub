import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPA_URL = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Trade { sym: string; pnl: number; pnl_pct: number; status: string }

function calcSharpe(pnls: number[]): number {
  if (pnls.length < 3) return 0
  const avg = pnls.reduce((a,b) => a+b, 0) / pnls.length
  const std = Math.sqrt(pnls.reduce((a,b) => a+(b-avg)**2, 0) / pnls.length) || 1e-9
  return avg / std
}

Deno.serve(async () => {
  try {
    const supa = createClient(SUPA_URL, SUPA_KEY)

    // Fetch last 14 days of closed trades
    const since = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString()
    const { data: trades, error } = await supa
      .from('bot_trades')
      .select('sym, pnl, pnl_pct, status')
      .neq('status', 'OPEN')
      .gte('opened_at', since)

    if (error) throw new Error(error.message)
    if (!trades || trades.length < 15) {
      return new Response(JSON.stringify({ skipped: 'not enough data', count: trades?.length ?? 0 }))
    }

    // Group by symbol
    const coins: Record<string, { wins: number; total: number; pnl: number; pnls: number[] }> = {}
    for (const t of trades as Trade[]) {
      if (!coins[t.sym]) coins[t.sym] = { wins: 0, total: 0, pnl: 0, pnls: [] }
      coins[t.sym].total++
      coins[t.sym].pnl  += t.pnl ?? 0
      coins[t.sym].pnls.push(t.pnl_pct ?? 0)
      if ((t.pnl ?? 0) > 0) coins[t.sym].wins++
    }

    // Score each coin (min 3 trades)
    const scores: Record<string, number> = {}
    for (const [sym, d] of Object.entries(coins)) {
      if (d.total < 3) continue
      const wr      = d.wins / d.total                     // 0–1
      const sharpe  = Math.max(0, calcSharpe(d.pnls))      // 0+
      const pnlSign = d.pnl > 0 ? 1 : 0                    // profitable overall?
      scores[sym] = wr * 0.5 + Math.min(sharpe, 2) * 0.3 / 2 + pnlSign * 0.2
    }

    if (Object.keys(scores).length === 0) {
      return new Response(JSON.stringify({ skipped: 'no coins with enough trades' }))
    }

    // Normalize to weights: worst → 0.3x, best → 2.0x
    const vals = Object.values(scores)
    const minS = Math.min(...vals)
    const maxS = Math.max(...vals)
    const weights: Record<string, number> = {}
    for (const [sym, score] of Object.entries(scores)) {
      const norm = maxS > minS ? (score - minS) / (maxS - minS) : 0.5
      weights[sym] = parseFloat((0.3 + norm * 1.7).toFixed(2))  // 0.30 → 2.00
    }

    // ═══ v58.0: READ-ONLY. This function no longer writes bot_state. ═══════
    // It used to set { coin_weights, rebalanced_at } every hour, and BOTH were
    // live corruption of state that trading-bot owns:
    //
    //  * `rebalanced_at` is ROTA's 48-hour rotation clock. The bot asks "has it
    //    been 48h since rebalanced_at?" — so an hourly reset means the answer is
    //    permanently no. ROTA would stop rotating, forever, with no error and a
    //    perfectly healthy-looking heartbeat. It has not fired yet only because
    //    of the `trades.length < 15` early return above; the moment 15 trades
    //    close inside 14 days, the rotation sleeve dies silently.
    //
    //  * `coin_weights` is not a weight map to trading-bot at all — it stores
    //    per-coin suspension metadata ({sym: {suspended_until}}). Overwriting it
    //    with numbers (0.3-2.0) both destroyed live suspensions and fed the bot
    //    a shape it cannot read, so `coinWeights[c].suspended_until` on a number
    //    silently became undefined and every suspension quietly lapsed.
    //
    // Nothing reads this scoring, and its per-coin weighting was never part of a
    // walk-forward. It stays as a measurement that writes only to its own history
    // table. trading-bot is the single owner of bot_state.
    const upErr = null as { message?: string } | null
    if (upErr) throw new Error(upErr.message)

    // Log to rebalance_history
    await supa.from('rebalance_history').insert({
      trade_count: trades.length,
      weights_after: weights,
      scores
    })

    return new Response(JSON.stringify({ read_only: true, weights, coins_scored: Object.keys(weights).length }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
