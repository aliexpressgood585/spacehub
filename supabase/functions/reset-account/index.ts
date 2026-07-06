import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_BOT_PARAMS = {
  rsi_oversold: 35,
  rsi_overbought: 65,
  bb_proximity: 1.02,
  tp_r: 2.5,
  min_confluence_score: 65,
}

const RESET_LOG = []

function log(msg: string) {
  const timestamp = new Date().toISOString()
  const entry = `[${timestamp}] ${msg}`
  RESET_LOG.push(entry)
  console.log(entry)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    log('Starting complete trading bot account reset...')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Step 1: Delete trade snapshots FIRST (FK references bot_trades)
    log('Step 1: Deleting all trade snapshots from bot_trade_snapshots...')
    const deleteSnapshots = await supabase.from('bot_trade_snapshots').delete().neq('id', -1)
    if (deleteSnapshots.error) {
      throw new Error(`Failed to delete snapshots: ${deleteSnapshots.error.message}`)
    }
    log(`✓ Deleted all snapshots (${deleteSnapshots.count || 0} rows affected)`)

    // Step 2: Delete all trades (now safe, no FK references)
    log('Step 2: Deleting all trades from bot_trades...')
    const deleteTrades = await supabase.from('bot_trades').delete().neq('id', -1)
    if (deleteTrades.error) {
      throw new Error(`Failed to delete trades: ${deleteTrades.error.message}`)
    }
    log(`✓ Deleted all trades (${deleteTrades.count || 0} rows affected)`)

    // Step 3: Delete trades log
    log('Step 3: Deleting all trade logs from bot_trades_log...')
    const deleteLogs = await supabase.from('bot_trades_log').delete().neq('id', -1)
    if (deleteLogs.error) {
      throw new Error(`Failed to delete logs: ${deleteLogs.error.message}`)
    }
    log(`✓ Deleted all trade logs (${deleteLogs.count || 0} rows affected)`)

    // Step 4: Delete market memory
    log('Step 4: Deleting all market memory from bot_market_memory...')
    const deleteMemory = await supabase.from('bot_market_memory').delete().neq('id', -1)
    if (deleteMemory.error) {
      throw new Error(`Failed to delete market memory: ${deleteMemory.error.message}`)
    }
    log(`✓ Deleted all market memory (${deleteMemory.count || 0} rows affected)`)

    // Step 5: Delete params history
    log('Step 5: Deleting bot_params_history...')
    const deleteParams = await supabase.from('bot_params_history').delete().neq('id', -1)
    if (deleteParams.error) log(`⚠ bot_params_history: ${deleteParams.error.message}`)
    else log(`✓ Deleted params history (${deleteParams.count || 0} rows)`)

    // Step 6: Delete market regime history
    log('Step 6: Deleting market_regime history...')
    const deleteRegime = await supabase.from('market_regime').delete().neq('id', -1)
    if (deleteRegime.error) log(`⚠ market_regime: ${deleteRegime.error.message}`)
    else log(`✓ Deleted regime history (${deleteRegime.count || 0} rows)`)

    // Step 7: Delete rebalance history
    log('Step 7: Deleting rebalance_history...')
    const deleteRebalance = await supabase.from('rebalance_history').delete().neq('id', -1)
    if (deleteRebalance.error) log(`⚠ rebalance_history: ${deleteRebalance.error.message}`)
    else log(`✓ Deleted rebalance history (${deleteRebalance.count || 0} rows)`)

    // Step 8: Reset bot_state
    log('Step 5: Resetting bot_state to default values...')
    const resetState = await supabase.from('bot_state').update({
      balance: 10000,
      peak_balance: 10000,
      streak: 0,
      trade_count: 0,
      overall_wr: 0,
      overall_pf: 1.0,
      risk: 'medium',
      bot_params: DEFAULT_BOT_PARAMS,
      coin_weights: {},
      market_regime: 'RANGING',
      regime_confidence: 0.5,
      regime_updated_at: new Date().toISOString(),
      last_optimized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', 1)

    if (resetState.error) {
      throw new Error(`Failed to reset bot_state: ${resetState.error.message}`)
    }

    log('✓ Reset bot_state successfully')
    log(`  - Balance: $10000`)
    log(`  - Peak Balance: $10000`)
    log(`  - Streak: 0`)
    log(`  - Trade Count: 0`)
    log(`  - Win Rate: 0%`)
    log(`  - Profit Factor: 1.0`)
    log(`  - Market Regime: RANGING`)
    log(`  - Bot Params: ${JSON.stringify(DEFAULT_BOT_PARAMS)}`)
    log(`  - Coin Weights: cleared`)

    log('✓ Trading bot account reset completed successfully')
    log(`Total records cleaned: ${(deleteTrades.count || 0) + (deleteSnapshots.count || 0) + (deleteLogs.count || 0) + (deleteMemory.count || 0)}`)

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Trading bot account reset completed',
        reset_at: new Date().toISOString(),
        records_deleted: {
          trades: deleteTrades.count || 0,
          snapshots: deleteSnapshots.count || 0,
          logs: deleteLogs.count || 0,
          market_memory: deleteMemory.count || 0,
          params_history: deleteParams.count || 0,
          regime_history: deleteRegime.count || 0,
          rebalance_history: deleteRebalance.count || 0,
        },
        bot_state_reset: {
          balance: 10000,
          peak_balance: 10000,
          streak: 0,
          trade_count: 0,
          overall_wr: 0,
          overall_pf: 1.0,
          bot_params: DEFAULT_BOT_PARAMS,
          market_regime: 'RANGING',
        },
        logs: RESET_LOG,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      }
    )
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log(`❌ Reset failed: ${errorMsg}`)

    return new Response(
      JSON.stringify({
        ok: false,
        error: errorMsg,
        failed_at: new Date().toISOString(),
        logs: RESET_LOG,
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      }
    )
  }
})
