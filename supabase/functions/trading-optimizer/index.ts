// ════════════════════════════════════════════════════════════
// Trading Optimizer Agent v2
//
// Runs every minute via Supabase cron.
// Fast path (every tick): evaluates current performance,
//   updates lightweight adaptive state, detects degradation.
// Slow path (Claude AI): called only when:
//   a) 10+ new trades since last Claude run, OR
//   b) recent WR dropped >15% from baseline, OR
//   c) 2+ hours since last Claude optimization
// Stores results in bot_state.bot_params (JSONB).
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const CLAUDE_API   = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

const MIN_TRADES_FOR_CLAUDE = 50   // total trades before ever calling Claude
const NEW_TRADES_THRESHOLD  = 10   // call Claude when this many new trades arrived
const WR_DEGRADATION        = 0.15 // call Claude if WR drops by this much
const CLAUDE_COOLDOWN_MS    = 2 * 60 * 60_000  // 2 hours min between Claude calls
const MAX_CHANGE            = 0.25 // max 25% change per param per Claude call

// ─── defaults ────────────────────────────────────────────────────────────────
const DEFAULTS = {
  vol_params: {
    LOW:    { slMult: 2.0, tpR: 2.2, trailBeR: 0.8, trailAtr: 0.6 },
    MEDIUM: { slMult: 1.5, tpR: 2.2, trailBeR: 0.8, trailAtr: 0.7 },
    HIGH:   { slMult: 1.2, tpR: 2.5, trailBeR: 1.0, trailAtr: 0.8 },
  },
  session_params: {
    ASIAN: { sizeMult: 0.7, minScoreBonus: 1 },
    EU:    { sizeMult: 1.0, minScoreBonus: 0 },
    US:    { sizeMult: 1.0, minScoreBonus: 0 },
    DEAD:  { sizeMult: 0.8, minScoreBonus: 0 },
  },
  partial_tp_by_vol: { LOW: 0.8, MEDIUM: 1.2, HIGH: 1.5 },
  max_hold_min: 360,
  // optimizer state (not sent to trading bot)
  _meta: {
    trade_count_at_last_claude: 0,
    last_claude_ts: 0,
    baseline_wr: 0,
  },
}

// ─── bounds ───────────────────────────────────────────────────────────────────
const BOUNDS = {
  slMult:        { min: 0.8, max: 3.5 },
  tpR:           { min: 1.5, max: 4.5 },
  trailBeR:      { min: 0.4, max: 1.8 },
  trailAtr:      { min: 0.3, max: 1.5 },
  sizeMult:      { min: 0.3, max: 1.5 },
  minScoreBonus: { min: 0,   max: 2   },
  partial_r:     { min: 0.4, max: 2.5 },
  max_hold_min:  { min: 60,  max: 720 },
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }
function limitChange(nv: number, ov: number, mc: number) {
  const r = nv / ov
  if (r > 1 + mc) return ov * (1 + mc)
  if (r < 1 - mc) return ov * (1 - mc)
  return nv
}
function round2(v: number) { return Math.round(v * 100) / 100 }

function sessionFromHour(h: number): 'ASIAN' | 'EU' | 'US' | 'DEAD' {
  if (h < 8)  return 'ASIAN'
  if (h < 13) return 'EU'
  if (h < 21) return 'US'
  return 'DEAD'
}

// ─── Telegram ─────────────────────────────────────────────────────────────────
async function sendTelegram(msg: string) {
  const token  = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
    })
  } catch {}
}

// ─── stats ────────────────────────────────────────────────────────────────────
interface Seg { count: number; wins: number; totalPnl: number; winPnl: number; lossPnl: number }
function emptySeg(): Seg { return { count: 0, wins: 0, totalPnl: 0, winPnl: 0, lossPnl: 0 } }
function addToSeg(s: Seg, pnl: number) {
  s.count++
  if (pnl > 0) { s.wins++; s.winPnl += pnl } else s.lossPnl += pnl
  s.totalPnl += pnl
}
function segResult(s: Seg) {
  const wr   = s.count ? s.wins / s.count : 0
  const avgW = s.wins               ? s.winPnl / s.wins               : 0
  const avgL = (s.count - s.wins)   ? Math.abs(s.lossPnl) / (s.count - s.wins) : 1
  return {
    count: s.count,
    wr:     round2(wr),
    avgPnl: round2(s.count ? s.totalPnl / s.count : 0),
    pf:     round2(avgL > 0 ? avgW / avgL : 1),
  }
}

function buildStats(trades: any[]) {
  const overall = emptySeg()
  const bySession:  Record<string, Seg> = { ASIAN: emptySeg(), EU: emptySeg(), US: emptySeg(), DEAD: emptySeg() }
  const byMode:     Record<string, Seg> = { SWEEP: emptySeg(), RANGE: emptySeg() }
  const bySide:     Record<string, Seg> = { LONG: emptySeg(), SHORT: emptySeg() }
  const byScore:    Record<string, Seg> = { low: emptySeg(), med: emptySeg(), high: emptySeg() }
  const holdWin: number[] = [], holdLoss: number[] = []

  for (const t of trades) {
    const pnl  = Number(t.pnl ?? 0)
    const sess = t.closed_at ? sessionFromHour(new Date(t.closed_at).getUTCHours()) : 'US'
    const mode = t.mtf ? 'SWEEP' : 'RANGE'
    const sc   = Number(t.score ?? 0)
    const sb   = sc <= 2 ? 'low' : sc <= 4 ? 'med' : 'high'

    addToSeg(overall, pnl)
    addToSeg(bySession[sess], pnl)
    addToSeg(byMode[mode], pnl)
    addToSeg(bySide[t.side ?? 'LONG'], pnl)
    addToSeg(byScore[sb], pnl)

    if (t.opened_at && t.closed_at) {
      const m = (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 60000
      if (m > 0 && m < 2000) pnl > 0 ? holdWin.push(m) : holdLoss.push(m)
    }
  }

  const avgHoldWin  = holdWin.length  ? Math.round(holdWin.reduce((a, b)  => a + b, 0)  / holdWin.length)  : 0
  const avgHoldLoss = holdLoss.length ? Math.round(holdLoss.reduce((a, b) => a + b, 0) / holdLoss.length) : 0

  return { overall, bySession, byMode, bySide, byScore, avgHoldWin, avgHoldLoss }
}

// ─── Claude call ──────────────────────────────────────────────────────────────
async function callClaude(system: string, user: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}`)
  const d: any = await res.json()
  return d.content?.[0]?.text ?? ''
}

// ─── apply Claude suggestions ─────────────────────────────────────────────────
function applyProposed(proposed: any, current: any): any {
  const safe = JSON.parse(JSON.stringify(current))

  for (const r of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    if (!proposed.vol_params?.[r]) continue
    const p = proposed.vol_params[r], c = current.vol_params[r]
    safe.vol_params[r] = {
      slMult:   round2(clamp(limitChange(+p.slMult,   c.slMult,   MAX_CHANGE), BOUNDS.slMult.min,   BOUNDS.slMult.max)),
      tpR:      round2(clamp(limitChange(+p.tpR,      c.tpR,      MAX_CHANGE), BOUNDS.tpR.min,      BOUNDS.tpR.max)),
      trailBeR: round2(clamp(limitChange(+p.trailBeR, c.trailBeR, MAX_CHANGE), BOUNDS.trailBeR.min, BOUNDS.trailBeR.max)),
      trailAtr: round2(clamp(limitChange(+p.trailAtr, c.trailAtr, MAX_CHANGE), BOUNDS.trailAtr.min, BOUNDS.trailAtr.max)),
    }
  }
  for (const s of ['ASIAN', 'EU', 'US', 'DEAD'] as const) {
    if (!proposed.session_params?.[s]) continue
    const p = proposed.session_params[s], c = current.session_params[s]
    safe.session_params[s] = {
      sizeMult:      round2(clamp(limitChange(+p.sizeMult, c.sizeMult, MAX_CHANGE), BOUNDS.sizeMult.min, BOUNDS.sizeMult.max)),
      minScoreBonus: Math.round(clamp(+p.minScoreBonus, BOUNDS.minScoreBonus.min, BOUNDS.minScoreBonus.max)),
    }
  }
  for (const r of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    if (proposed.partial_tp_by_vol?.[r] == null) continue
    safe.partial_tp_by_vol[r] = round2(clamp(limitChange(+proposed.partial_tp_by_vol[r], current.partial_tp_by_vol[r], MAX_CHANGE), BOUNDS.partial_r.min, BOUNDS.partial_r.max))
  }
  if (proposed.max_hold_min) {
    safe.max_hold_min = Math.round(clamp(limitChange(+proposed.max_hold_min, current.max_hold_min, MAX_CHANGE), BOUNDS.max_hold_min.min, BOUNDS.max_hold_min.max))
  }
  return safe
}

// ─── main ─────────────────────────────────────────────────────────────────────
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!,
  )

  // load state
  const { data: stateRow } = await supabase.from('bot_state').select('bot_params, balance').eq('id', 1).single()
  const params = { ...DEFAULTS, ...(stateRow?.bot_params ?? {}) }
  const meta   = { ...DEFAULTS._meta, ...(params._meta ?? {}) }

  // fetch recent trades
  const { data: trades } = await supabase
    .from('bot_trades')
    .select('sym,side,pnl,status,opened_at,closed_at,mtf,score')
    .neq('status', 'OPEN')
    .order('closed_at', { ascending: false })
    .limit(300)

  const tradeCount = trades?.length ?? 0
  const now        = Date.now()

  // ── fast path: compute current WR ─────────────────────────────────────────
  if (tradeCount < MIN_TRADES_FOR_CLAUDE) {
    return new Response(JSON.stringify({ ok: true, skip: 'not enough trades', count: tradeCount }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const stats     = buildStats(trades!)
  const currentWR = segStats_wr(stats.overall)
  const recent20WR = trades
    ? trades.slice(0, 20).filter((t: any) => Number(t.pnl ?? 0) > 0).length / Math.min(20, trades.length)
    : 0

  // set baseline WR on first run
  if (meta.baseline_wr === 0) meta.baseline_wr = currentWR

  // ── decide if we should call Claude ───────────────────────────────────────
  const newTradesSinceLast = tradeCount - meta.trade_count_at_last_claude
  const timeSinceLast      = now - (meta.last_claude_ts || 0)
  const wrDrop             = meta.baseline_wr - recent20WR

  const shouldCallClaude =
    (newTradesSinceLast >= NEW_TRADES_THRESHOLD && timeSinceLast >= 30 * 60_000) ||
    (wrDrop >= WR_DEGRADATION && timeSinceLast >= 30 * 60_000) ||
    (timeSinceLast >= CLAUDE_COOLDOWN_MS && newTradesSinceLast >= 5)

  if (!shouldCallClaude) {
    // fast path — update meta only
    await supabase.from('bot_state').update({
      bot_params: { ...params, _meta: meta },
    }).eq('id', 1)
    return new Response(JSON.stringify({
      ok: true,
      skip: 'no Claude needed',
      currentWR, recent20WR, newTrades: newTradesSinceLast, timeSinceLast: Math.round(timeSinceLast / 60000) + 'm',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ── slow path: call Claude ─────────────────────────────────────────────────
  const { overall, bySession, byMode, bySide, byScore, avgHoldWin, avgHoldLoss } = stats

  const analysisSummary = `
OVERALL (${tradeCount} trades): WR=${segResult(overall).wr} avgPnl=$${segResult(overall).avgPnl} PF=${segResult(overall).pf}
RECENT 20 WR: ${round2(recent20WR)} (baseline: ${round2(meta.baseline_wr)})
HOLD TIME: winners avg ${avgHoldWin}m | losers avg ${avgHoldLoss}m | max_hold currently ${params.max_hold_min}m

BY SESSION:
  ASIAN: ${JSON.stringify(segResult(bySession.ASIAN))}
  EU:    ${JSON.stringify(segResult(bySession.EU))}
  US:    ${JSON.stringify(segResult(bySession.US))}
  DEAD:  ${JSON.stringify(segResult(bySession.DEAD))}

BY MODE:
  SWEEP: ${JSON.stringify(segResult(byMode.SWEEP))}
  RANGE: ${JSON.stringify(segResult(byMode.RANGE))}

BY SIDE:
  LONG:  ${JSON.stringify(segResult(bySide.LONG))}
  SHORT: ${JSON.stringify(segResult(bySide.SHORT))}

BY SCORE:
  0-2: ${JSON.stringify(segResult(byScore.low))}
  3-4: ${JSON.stringify(segResult(byScore.med))}
  5+:  ${JSON.stringify(segResult(byScore.high))}

CURRENT PARAMS (excluding _meta):
${JSON.stringify({ vol_params: params.vol_params, session_params: params.session_params, partial_tp_by_vol: params.partial_tp_by_vol, max_hold_min: params.max_hold_min }, null, 2)}`

  const systemPrompt = `You are an expert crypto trading parameter optimizer.
Analyze the performance data and return ONLY a JSON object with optimized parameters.
Rules:
- Make small conservative adjustments (max 25% per param)
- Sessions with WR < 0.35: reduce sizeMult, raise minScoreBonus
- If winners hold much shorter than losers, reduce max_hold_min
- Bounds: slMult[0.8-3.5], tpR[1.5-4.5], trailBeR[0.4-1.8], trailAtr[0.3-1.5], sizeMult[0.3-1.5], minScoreBonus[0-2 int], partial_r[0.4-2.5], max_hold_min[60-720]
- Return ONLY valid JSON, reasoning inside the JSON.

{
  "vol_params": {
    "LOW":    {"slMult":X,"tpR":X,"trailBeR":X,"trailAtr":X},
    "MEDIUM": {"slMult":X,"tpR":X,"trailBeR":X,"trailAtr":X},
    "HIGH":   {"slMult":X,"tpR":X,"trailBeR":X,"trailAtr":X}
  },
  "session_params": {
    "ASIAN": {"sizeMult":X,"minScoreBonus":X},
    "EU":    {"sizeMult":X,"minScoreBonus":X},
    "US":    {"sizeMult":X,"minScoreBonus":X},
    "DEAD":  {"sizeMult":X,"minScoreBonus":X}
  },
  "partial_tp_by_vol": {"LOW":X,"MEDIUM":X,"HIGH":X},
  "max_hold_min": X,
  "reasoning": "one line"
}`

  let proposed: any
  let reasoning = ''
  try {
    const raw   = await callClaude(systemPrompt, analysisSummary)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no JSON')
    proposed  = JSON.parse(match[0])
    reasoning = proposed.reasoning ?? ''
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const paramsBefore = JSON.parse(JSON.stringify(params))
  const safe = applyProposed(proposed, params)

  // update meta
  meta.trade_count_at_last_claude = tradeCount
  meta.last_claude_ts             = now
  meta.baseline_wr                = currentWR

  safe._meta = meta

  const ov = segResult(overall)

  // save to bot_state and history log in parallel
  await Promise.all([
    supabase.from('bot_state').update({
      bot_params: safe,
      last_optimized_at: new Date().toISOString(),
    }).eq('id', 1),
    supabase.from('bot_params_history').insert({
      trade_count:   tradeCount,
      overall_wr:    ov.wr,
      overall_pf:    ov.pf,
      params_before: { vol_params: paramsBefore.vol_params, session_params: paramsBefore.session_params, partial_tp_by_vol: paramsBefore.partial_tp_by_vol, max_hold_min: paramsBefore.max_hold_min },
      params_after:  { vol_params: safe.vol_params,          session_params: safe.session_params,          partial_tp_by_vol: safe.partial_tp_by_vol,          max_hold_min: safe.max_hold_min },
      reasoning,
    }),
  ])

  const msg = (
    `🤖 <b>Optimizer — ${tradeCount} trades | ${newTradesSinceLast} new</b>\n` +
    `📊 WR: ${(ov.wr * 100).toFixed(0)}% | PF: ${ov.pf} | avgPnl: $${ov.avgPnl}\n` +
    `🕐 Sessions ×: AS=${safe.session_params.ASIAN.sizeMult} EU=${safe.session_params.EU.sizeMult} US=${safe.session_params.US.sizeMult}\n` +
    `📈 tpR: L=${safe.vol_params.LOW.tpR} M=${safe.vol_params.MEDIUM.tpR} H=${safe.vol_params.HIGH.tpR}\n` +
    `⏱ maxHold: ${safe.max_hold_min}m\n` +
    `💡 ${reasoning}`
  )
  await sendTelegram(msg)

  return new Response(JSON.stringify({ ok: true, claudeCalled: true, reasoning, params: safe }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ─── helper needed outside buildStats ─────────────────────────────────────────
function segStats_wr(s: Seg) { return s.count ? s.wins / s.count : 0 }
function segResult(s: Seg) {
  const wr   = s.count ? s.wins / s.count : 0
  const avgW = s.wins             ? s.winPnl / s.wins             : 0
  const avgL = s.count - s.wins   ? Math.abs(s.lossPnl) / (s.count - s.wins) : 1
  return { count: s.count, wr: round2(wr), avgPnl: round2(s.count ? s.totalPnl / s.count : 0), pf: round2(avgL > 0 ? avgW / avgL : 1) }
}
