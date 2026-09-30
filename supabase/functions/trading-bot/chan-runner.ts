// v97.x CHAN sleeve runner — the quant/ regime router traded live on PAPER (see shared/chan.ts for the rules and the
// NO-GO status).
// Every cycle (~5 s):
//   - stops resolved on the Binance aggTrades tape since the last check (exchange-side stop semantics, FAST's fill model)
//   - time exits, marks, and the risk state machine: (v97.7: no daily / streak pause, no open cap); -10% from peak ->
//     close everything + hard halt
// Once per CLOSED 5m bar, over the whole dynamic universe (~100 liquid USDT perps), in batches across the cycles of
// the first 3 minutes (v97.2):
//   - per bar only the last 320 candles per coin; the slow statistics (Hurst, half-life, vol percentile, regime,
//     momentum t) once per UTC day per coin from 4,300 candles, as the Python code re-estimates them daily, persisted
//     in market_cache 'chan_daily'; the daily vol history in 'chan_vols'
//   - regime + both strategies at the last closed bar; mean-reversion signal exits
//   - paper entries keep the same signal gates/stops, but run an aggressive 1-2% stop-risk allocation at fixed 50x isolated
// Binance request weight is metered from the X-MBX-USED-WEIGHT-1M header and new downloads stop near the budget.
// Books through chan_commit_cycle, which re-checks every limit in SQL.
import { CHAN, DAY_MS, RECENT_BARS, barView, canOpen, chanSize, dailyStats, dayVols, fundingCharge, kellyRisk, riskStep, type Bar, type Daily, type RiskState } from '../../../shared/chan.ts'
import { fastLiq, liqCap, walkBook } from '../../../shared/fast.ts'
import { slipFor } from '../../../shared/lab.ts'
import { UNIV, buildUniverse } from '../../../shared/universe.ts'
import { aggTrades, book, type Pair } from './fast-runner.ts'
import { json, pool } from './rota-runner.ts'

import { trendPullback } from '../../../shared/trend-pullback.ts'
import { loadChanIntel } from './chan-intel.ts'
import { chanOpportunityMeta } from '../../../shared/chan-opportunity.ts'
import { initialStopV2, liquidationStopLimitV2, manageStopV2, stalledExitV2, strategySizeMultV2, targetRV2 } from '../../../shared/chan-stop-v2.ts'
import { challengerLab, clusterMultiplier, executionMultiplier, exitPolicyFromHistory, forensicSummary, strategyGovernor } from '../../../shared/chan-autonomy.ts'
import { eliteBreadthCandidates, marketBurstMode, patternMemory, portfolioBrainRank, profitCaptureDirective, promotedExitPolicy, shadowSwarm, strategyAuction, portfolioProfitabilityGovernor, strategyProfitabilityGate } from '../../../shared/chan-x.ts'

const sleeveOf = (comp: string) => ['RG_TREND_PULLBACK','RG_LIQ_SQUEEZE','RG_BREADTH_MOMENTUM','RG_VOL_BREAKOUT'].includes(comp) ? '2' : '1'
// Paper leverage for NEW entries. Shim `__CHAN_LEV` (1..50), default 50. Open rows keep their own `lev`.
// v98.1 (owner, 2026-09-30): 20x so wider stops pass the liquidation-buffer gate. Risk per trade is set by the stop, not by this.
const PAPER_LEVERAGE = Math.max(1, Math.min(50, Math.round(Number((globalThis as any).__CHAN_LEV ?? 50)) || 50))
const PAPER_RISK_MIN = 0.01
const PAPER_RISK_MAX = 0.02
const PAPER_RISK_MULT = 4
// Portfolio crowding guard: it never halts scanning/trading. Once one direction owns
// most of the live book, additional same-side entries need a materially stronger signal;
// opposite-side candidates remain unrestricted and are prioritised.
const CROWD_MIN_POSITIONS = 7
const CROWD_NOTIONAL_SHARE = 0.80
const LIQ_STOP_MAX_SHARE = 0.75          // relaxed PAPER profile: stop may use up to 75% of entry->liquidation distance
const MIN_NET_REWARD_RISK = 1.20         // still positive after taker fees + modeled entry/exit slippage
const SYMBOL_COOLDOWN_BARS = 2           // shorter PAPER cooldown after two consecutive losses
const BREADTH_MIN_SHARE = 0.42           // ordinary directional entry; BTC/ETH agreement can still override
const PAPER_MIN_STOP_TO_COST = 2.0       // default CHAN remains 3x; PAPER runner accepts a wider opportunity set
const BREADTH_IMPULSE_SHARE = 0.72
const SOFT_QUALITY_MIN = 50
// Owner override 2026-09-30 (council bypassed for this one change): shim `__CHAN_AGGRESSIVE='1'`.
// Fixed 2% risk per trade, up to 8 open, quality floor 50, no DEFENSE, no SHADOW/Kelly veto.
// Hard gates (book, stop side, liquidation buffer, costs, net R/R, re-entry) stay. PAPER ONLY.
const AGGRESSIVE = (globalThis as any).__CHAN_AGGRESSIVE === '1'
const AGGRESSIVE_MAX_OPEN = 8
const MICRO_MAX_CHECKS = 10
const SNIPER_MAX_CHECKS = 10
const REGIME = ['NEUTRAL', 'MEAN_REVERT', 'TREND', 'HIGH_VOL']
const AUTO_COMPS = ['RG_MR','RG_MOM','RG_TREND_PULLBACK','RG_LIQ_SQUEEZE','RG_BREADTH_MOMENTUM','RG_VOL_BREAKOUT']
let usedWeight = 0, weightAt = 0

async function kl(p: Pair, limit: number, endTime?: number): Promise<any[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=5m&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
  const w = Number(r.headers?.get?.('x-mbx-used-weight-1m'))
  if (Number.isFinite(w)) { usedWeight = w; weightAt = Date.now() }
  if (!r.ok) throw new Error(`klines HTTP ${r.status}`)
  return r.json()
}
async function microExecution(p:Pair, side:1|-1, now:number) {
  const one=async(tf:'1m'|'3m')=>{
    const u=`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=${tf}&limit=12`
    const r=await fetch(u,{signal:AbortSignal.timeout(4500)})
    const w=Number(r.headers?.get?.('x-mbx-used-weight-1m'))
    if(Number.isFinite(w)){usedWeight=w;weightAt=Date.now()}
    if(!r.ok) throw new Error('micro '+tf+' HTTP '+r.status)
    const xs=(await r.json()).filter((x:any)=>Number(x[6])<now)
    if(xs.length<4) return {ret:0,taker:1}
    const a=Number(xs[xs.length-4][4]), z=Number(xs[xs.length-1][4])
    let buy=0,vol=0
    for(const x of xs.slice(-4)){ buy+=Number(x[9]??0); vol+=Number(x[5]??0) }
    return {ret:a>0?z/a-1:0,taker:vol>buy&&vol>0?buy/(vol-buy):1}
  }
  const [m1,m3]=await Promise.all([one('1m'),one('3m')])
  let score=50
  const aligned=(x:number)=>side*x
  score += aligned(m1.ret)>0?10:aligned(m1.ret)<0?-8:0
  score += aligned(m3.ret)>0?12:aligned(m3.ret)<0?-10:0
  const flow=side>0?m1.taker-1:1-m1.taker
  const flow3=side>0?m3.taker-1:1-m3.taker
  score += Math.max(-10,Math.min(10,flow*10))
  score += Math.max(-8,Math.min(8,flow3*8))
  // Small pullback in the 1m tape while 3m remains aligned is a better entry than chasing.
  const pullback=aligned(m1.ret)<0 && aligned(m3.ret)>0
  if(pullback) score+=6
  return {score:Math.max(0,Math.min(100,score)),ret1m:m1.ret,ret3m:m3.ret,taker1m:m1.taker,taker3m:m3.taker,pullback}
}
async function entrySniper(p:Pair,side:1|-1,bk:any,now:number){
  try{
    const r=await fetch(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${p.s}&limit=220`,{signal:AbortSignal.timeout(3500)})
    const w=Number(r.headers?.get?.('x-mbx-used-weight-1m'))
    if(Number.isFinite(w)){usedWeight=w;weightAt=Date.now()}
    if(!r.ok) throw new Error('sniper aggTrades HTTP '+r.status)
    const rows=(await r.json()).filter((x:any)=>now-Number(x.T??0)<=90_000)
    let buy=0,sell=0
    for(const x of rows){
      const q=Math.max(0,Number(x.q??0))
      if(x.m===true) sell+=q
      else if(x.m===false) buy+=q
    }
    const vol=buy+sell,cvd=vol>0?(buy-sell)/vol:0
    const bn=(bk?.bids??[]).slice(0,12).reduce((s:number,x:any)=>s+Number(x[0])*Number(x[1]),0)
    const an=(bk?.asks??[]).slice(0,12).reduce((s:number,x:any)=>s+Number(x[0])*Number(x[1]),0)
    const imbalance=bn+an>0?(bn-an)/(bn+an):0
    const p0=rows.length?Number(rows[0].p):NaN,p1=rows.length?Number(rows[rows.length-1].p):NaN
    const tapeRet=Number.isFinite(p0)&&p0>0&&Number.isFinite(p1)?p1/p0-1:0
    const alignedCvd=side*cvd,alignedImb=side*imbalance,alignedRet=side*tapeRet
    let score=50+alignedCvd*24+alignedImb*20+Math.max(-12,Math.min(12,alignedRet*5000))
    const velocity=rows.length/90
    if(velocity>=1.2&&alignedRet>0) score+=4
    return {score:Math.max(0,Math.min(100,score)),cvd,imbalance,tape_ret:tapeRet,trades:rows.length,velocity,source:'Binance aggTrades + depth'}
  }catch(e:any){
    return {score:50,cvd:0,imbalance:0,tape_ret:0,trades:0,velocity:0,source:'neutral-fallback',error:String(e?.message??e).slice(0,80)}
  }
}
const weightLeft = () => (Date.now() - weightAt > 60_000 ? CHAN.scan.weightBudget : CHAN.scan.weightBudget - usedWeight)
const toBar = (p: Pair) => (x: any): Bar => ({ t: +x[0], o: +x[1] / p.k, h: +x[2] / p.k, l: +x[3] / p.k, c: +x[4] / p.k })

// v97.6: the exchange's own funding settlements for a held position (null = could not be read -> flagged, not guessed)
async function fundingRows(p: Pair, from: number, to: number): Promise<any[] | null> {
  try { const r = await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${p.s}&startTime=${from}&endTime=${to}&limit=1000`); return Array.isArray(r) ? r : null } catch { return null }
}
async function fundingFor(t: any, P: Pair, closedAt: number) {
  const f = fundingCharge(t.side, Number(t.size), P.k, Number(t.entry_price), Date.parse(t.opened_at), closedAt, await fundingRows(P, Date.parse(t.opened_at), closedAt))
  return { amount: f.amount, source: 'binance_fundingRate', complete: f.complete, missing_mark: f.missingMark, events: f.events.length,
    ...(f.complete ? {} : { missing: 'funding history unavailable or mark price missing — flagged, see ledger' }) }
}

export async function closedBars(p: Pair, now: number, n: number = CHAN.bars): Promise<Bar[]> {
  const out = new Map<number, Bar>()
  let end = now
  for (let page = 0; page < Math.ceil(n / 1500) + 1 && out.size < n; page++) {
    const r = await kl(p, 1500, end)
    if (!Array.isArray(r) || !r.length) break
    for (const x of r) if (Number(x[6]) < now) out.set(+x[0], toBar(p)(x))   // CLOSED candles only
    end = Number(r[0][0]) - 1
    if (r.length < 1500) break
  }
  return [...out.values()].sort((a, b) => a.t - b.t).slice(-n)
}
async function recentBars(p: Pair, now: number): Promise<Bar[]> {
  const r = await kl(p, RECENT_BARS + 2)
  return r.filter((x: any) => Number(x[6]) < now).map(toBar(p)).slice(-RECENT_BARS)   // CLOSED candles only
}

async function loadUniverse(db: any, now: number): Promise<{ pairs: Pair[]; note: string }> {
  let note = ''
  const { data: c } = await db.from('market_cache').select('data,ts').eq('key', 'universe').throwOnError()
  let u = c?.[0]?.data, ts = c?.[0]?.ts ?? ''
  if (!u || now - Date.parse(ts) >= UNIV.refreshMs) {
    try {
      const [ex, tk, books] = await Promise.all([json('https://fapi.binance.com/fapi/v1/exchangeInfo'), json('https://fapi.binance.com/fapi/v1/ticker/24hr'), json('https://fapi.binance.com/fapi/v1/ticker/bookTicker')])
      const r = buildUniverse(ex, tk, books, now)
      if (r.pairs.length < 20) throw new Error(`only ${r.pairs.length} pairs`)
      u = r; ts = new Date(now).toISOString()
      await db.from('market_cache').upsert({ key: 'universe', data: u, ts }).throwOnError()
    } catch (e: any) { note = 'universe refresh failed: ' + String(e?.message ?? e).slice(0, 60) }
  }
  const pairs: Pair[] = u?.pairs?.length ? u.pairs.map((x: any) => ({ sym: String(x.sym), s: String(x.s), k: Number(x.k) || 1 }))
    : CHAN.universe.map(s => ({ sym: s, s: `${s}USDT`, k: 1 }))
  return { pairs, note: u?.pairs?.length ? note : note + ' · 10-coin fallback' }
}

function initRisk(st: any, equity: number): RiskState {
  return { peak: Number(st?.peak) || equity, day: Number.isFinite(st?.day) ? st.day : -1, dayOpen: Number(st?.dayOpen) || equity,
    pausedUntilDay: Number.isFinite(st?.pausedUntilDay) ? st.pausedUntilDay : -1, streakFrom: Number(st?.streakFrom) || 0,
    halted: !!st?.halted, haltReason: String(st?.haltReason ?? '') }
}

export async function runChan(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('CHAN is paper-only; refusing live execution')
  const now = Date.now(), params = state.bot_params || {}
  const wallets = params.chan_split?.wallets
  if (!wallets?.['1'] || !wallets?.['2']) throw new Error('CHAN split wallets missing')
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || t.strategy !== 'CHAN')) throw new Error('CHAN requires a paper book with CHAN rows only')
  const { data: hist } = await db.from('bot_trades').select('sym,side,pnl,risk_usd,closed_at,status,scalp_meta').eq('strategy', 'CHAN').neq('status', 'OPEN')
    .order('closed_at', { ascending: false }).limit(1000).throwOnError()
  const closedAll = (hist ?? []).filter((x:any)=>x.status !== 'RESET').map((x: any) => ({
    sym: String(x.sym ?? ''), side: String(x.side ?? ''), pnl: Number(x.pnl), closedAt: Date.parse(x.closed_at),
    r: Number(x.risk_usd) > 0 ? Number(x.pnl) / Number(x.risk_usd) : 0,
    comp: x.scalp_meta?.chan?.comp, regime: x.scalp_meta?.chan?.regime,
    exitReason: x.scalp_meta?.exit_reason ?? null,
    mfeR: Number(x.scalp_meta?.chan?.mfe_r ?? NaN),
    maeR: Number(x.scalp_meta?.chan?.mae_r ?? NaN),
    entryImpactBps: Number(x.scalp_meta?.chan?.entry_fill?.impact_bps ?? NaN),
    exitImpactBps: Number(x.scalp_meta?.fill?.impact_bps ?? x.scalp_meta?.chan?.quality_gates?.exit_impact_bps ?? NaN),
    quality: Number(x.scalp_meta?.chan?.quality_gates?.quality_score ?? NaN),
    volPct: Number(x.scalp_meta?.chan?.vol_pct ?? NaN),
    mtfSide: Number(x.scalp_meta?.chan?.quality_gates?.mtf?.side ?? NaN),
    microScore: Number(x.scalp_meta?.chan?.quality_gates?.micro_execution?.score ?? NaN),
    breadthShare: Number(x.scalp_meta?.chan?.quality_gates?.breadth_share ?? NaN)
  }))
  const resetTs = Date.parse(String(params.chan_reset_at ?? ''))
  const learningRows = Number.isFinite(resetTs) ? closedAll.filter((x:any)=>x.closedAt>=resetTs) : closedAll
  const archiveRows = Number.isFinite(resetTs) ? closedAll.filter((x:any)=>x.closedAt<resetTs) : []
  // Live adaptation is ERA-ONLY. The archive remains queryable for research/forensics,
  // but it cannot lower Kelly, quality thresholds, weights, cooldowns or strategy allocation in the new evaluation.
  const autonomyGovernor = strategyGovernor(learningRows,AUTO_COMPS)
  const autonomyForensics = forensicSummary(learningRows)
  const autonomyChallengers = challengerLab(learningRows,autonomyGovernor)
  const auctionWeights = strategyAuction(autonomyGovernor)
  const shadowLabs = Object.fromEntries(AUTO_COMPS.map(comp=>[comp,shadowSwarm(learningRows,comp)]))
  const baseExitPolicies = Object.fromEntries(AUTO_COMPS.map(comp=>[comp,exitPolicyFromHistory(learningRows,comp)]))
  const exitPolicies = Object.fromEntries(AUTO_COMPS.map(comp=>[comp,promotedExitPolicy(baseExitPolicies[comp],shadowLabs[comp])]))
  const baseGovernor = portfolioProfitabilityGovernor(learningRows)
  const profitabilityGovernor:any = AGGRESSIVE
    ? { ...baseGovernor, mode: 'AGGRESSIVE', base_mode: baseGovernor.mode, min_quality: SOFT_QUALITY_MIN, entry_cap: AGGRESSIVE_MAX_OPEN, risk_mult: 1, allow_burst: false }
    : baseGovernor
  const strategyProfitability = Object.fromEntries(AUTO_COMPS.map(comp=>{
    const g:any = strategyProfitabilityGate(learningRows,comp,now)
    return [comp, AGGRESSIVE
      ? { ...g, mode: g.mode === 'SHADOW' ? 'PROBE' : g.mode, base_mode: g.mode, size_mult: 1, min_quality: SOFT_QUALITY_MIN, reason: g.reason + '|aggressive_override' }
      : g]
  }))
  const uni = await loadUniverse(db, now)
  const bySym = new Map(uni.pairs.map(p => [p.sym, p]))
  const pairOf = (sym: string): Pair => bySym.get(sym) ?? (sym === 'PEPE' ? { sym, s: '1000PEPEUSDT', k: 1000 } : { sym, s: `${sym}USDT`, k: 1 })

  // Continuous light market sweep: every bot cycle rotates across the entire Futures universe.
  // Entry signals still use CLOSED 5m bars; this sweep never invents entries and never stops between bars.
  let liveScan: any = { status: 'continuous', ts: new Date(now).toISOString(), total: uni.pairs.length, checked: [] }
  let intelState: any = params.chan_cycle?.liquidity_intel ?? { ts: 0, news_risk: 0, top_pressure: [], headlines: [], sources: [], failed: [], by_sym: {} }
  try {
    const rows = await json('https://fapi.binance.com/fapi/v1/ticker/bookTicker')
    const tick = new Map<string, any>((Array.isArray(rows) ? rows : []).map((x: any) => [String(x.symbol), x]))
    const total = Math.max(1, uni.pairs.length), prev = params.chan_cycle?.live_scan ?? {}
    const cursor = Math.max(0, Number(prev.cursor) || 0) % total
    const batchSize = Math.min(24, total)
    const checked = Array.from({ length: batchSize }, (_, i) => uni.pairs[(cursor + i) % total]).map(P => {
      const x: any = tick.get(P.s), bid = Number(x?.bidPrice) / P.k, ask = Number(x?.askPrice) / P.k
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : NaN
      return { sym: P.sym, bid, ask, spread_bps: Number.isFinite(mid) && mid > 0 ? +((ask - bid) / mid * 1e4).toFixed(2) : null }
    })
    const rawNext = cursor + batchSize
    liveScan = {
      status: 'continuous', ts: new Date(now).toISOString(), total, checked,
      cursor: rawNext % total, batch_size: batchSize,
      loop: (Number(prev.loop) || 0) + (rawNext >= total ? 1 : 0)
    }
  } catch (e: any) {
    liveScan = { ...liveScan, error: String(e?.message ?? e).slice(0, 100) }
  }

  const closes: any[] = [], partials:any[] = [], marks: Record<string, number> = {}, openLive: Record<string, any> = {}, updates: any[] = [], closing = new Set<number>()
  const bookClose = async (t: any, reason: string, extra: any = {}) => {
    const fu = await fundingFor(t, pairOf(t.sym), Date.now())   // before the book, so the quote stays fresh for the ledger
    const dir = t.side === 'LONG' ? 1 : -1, bk = await book(pairOf(t.sym))
    const top = dir > 0 ? bk.bids[0][0] : bk.asks[0][0], w = walkBook(dir > 0 ? bk.bids : bk.asks, Number(t.entry_price) * Number(t.size))
    const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
    marks[t.sym] = top
    const management=extra?.management??null
    const fillExtra={...extra}; delete fillExtra.management
    closes.push({ id: t.id, price: top * (1 - dir * imp), reason, quote_ts: bk.E, funding: fu, management,
      fill: { model: 'book_walk', impact_bps: +(imp * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond, ...fillExtra } })
    closing.add(t.id)
  }
  // 1. exchange-side stop, replayed on the real trade tape since the last check; time exits
  await pool<any>(open, 5, async (t) => {
    try {
      const m = t.scalp_meta?.chan, dir = (t.side === 'LONG' ? 1 : -1) as 1 | -1
      if (!m) return
      const entry = Number(t.entry_price), P = pairOf(t.sym)
      const from = Math.max(Date.parse(t.opened_at), Number(m.chk) || 0, now - 3_500_000) + 1
      const tr = await aggTrades(P, from, now)
      const r0 = Math.max(1e-12,Number(m.r))
      const target0 = m.target == null ? null : Number(m.target)
      const entryImpact0 = Number(m.entry_fill?.impact_bps ?? 0)
      const exitImpact0 = Number(m.quality_gates?.exit_impact_bps ?? 0)
      const costFrac = 2*CHAN.costs.taker + (Math.max(0,entryImpact0)+Math.max(0,exitImpact0))/1e4
      const exitPolicy=exitPolicies[String(m.comp)] ?? exitPolicyFromHistory(learningRows,String(m.comp))
      const managed = manageStopV2({
        comp:String(m.comp),dir,entry,r:r0,stop:Number(m.stop),target:target0,
        liq:fastLiq(dir,entry,Number(t.lev)||1),best:Number(m.best??entry),worst:Number(m.worst??entry),
        mfeR:Number(m.mfe_r??0),maeR:Number(m.mae_r??0),costFrac,
        policy:{be:exitPolicy.be,trail:exitPolicy.trail,gap:exitPolicy.gap,lock1:exitPolicy.lock1,lock2:exitPolicy.lock2}
      },tr.trades)
      const management:any = {
        stop:managed.stop,best:managed.best,worst:managed.worst,mfe_r:managed.mfeR,mae_r:managed.maeR,
        be_armed:managed.beArmed,trail_active:managed.trailActive,stop_phase:managed.phase,stop_engine:'V2',
        exit_policy:exitPolicy
      }
      if (managed.why) {
        const fu = await fundingFor(t, P, Number(managed.T))
        const bk = await book(P), w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * Number(t.size))
        const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
        const triggerPx=Number(managed.px)
        const price = (managed.why === 'STOP' || managed.why === 'TARGET') ? triggerPx * (1 - dir * imp) : triggerPx
        closes.push({ id: t.id, price, reason: managed.why, quote_ts: Date.now(), funding: fu, management,
          fill: { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: managed.T, trigger_px: triggerPx, lag_ms: now - Number(managed.T), impact_bps: +(imp * 1e4).toFixed(2) } })
        closing.add(t.id); marks[t.sym] = price
        return
      }
      if (now - Date.parse(t.opened_at) >= Number(m.max_hold_bars) * CHAN.barMs) {
        await bookClose(t, 'TIMEOUT', { management }); return
      }
      const bk = await book(P)
      const mark = dir > 0 ? bk.bids[0][0] : bk.asks[0][0]
      marks[t.sym] = mark
      const size = Number(t.size), lev = Math.max(1, Number(t.lev) || 1), notional = entry * size
      const w = walkBook(dir > 0 ? bk.bids : bk.asks, notional)
      const impact = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
      const estExit = mark * (1 - dir * impact)
      const grossMark = dir * (mark - entry) * size
      const grossExec = dir * (estExit - entry) * size
      const entryFee = Number(t.scalp_meta?.entry_fee ?? t.fee ?? notional * CHAN.costs.taker)
      const exitFee = estExit * size * CHAN.costs.taker
      const exitSlipUsd = Math.abs(mark - estExit) * size
      const entryImpactBps = Number(m.entry_fill?.impact_bps ?? 0)
      const entrySlipUsd = Number.isFinite(entryImpactBps) ? notional * Math.max(0, entryImpactBps) / 1e4 : 0
      const mg = notional / lev
      const netToClose = grossExec - entryFee - exitFee
      const ageBars=Math.floor((now-Date.parse(t.opened_at))/CHAN.barMs)
      const currentR=dir*(estExit-entry)/r0
      const captureAI=profitCaptureDirective({mfeR:managed.mfeR,currentR,partialDone:!!m.partial_1_done})
      if(captureAI.tightenR!=null){
        const aiStop=entry+dir*Number(captureAI.tightenR)*r0
        management.stop=dir>0?Math.max(Number(management.stop),aiStop):Math.min(Number(management.stop),aiStop)
        management.stop_phase='profit_capture_ai'
        management.capture_ai={...captureAI,current_r:currentR}
        if(dir*(mark-Number(management.stop))<=0){
          await bookClose(t,'PROFIT_CAPTURE',{management})
          return
        }
      }

      // Autonomous partial-profit capture. One partial only; the remainder keeps the learned Stop V2 runner.
      if(!m.partial_1_done && (managed.mfeR>=Number(exitPolicy.partialAt) || captureAI.partialNow) && currentR>=Math.max(.35,Number(exitPolicy.partialAt)*.50) && netToClose>0){
        const partFrac=Math.max(.15,Math.min(.45,Number(exitPolicy.partialFraction)||.30))
        const partQty=size*partFrac
        if(partQty>0 && partQty<size*.50){
          const fuPart=await fundingFor({...t,size:partQty},P,now)
          partials.push({
            id:t.id,qty:partQty,price:estExit,quote_ts:bk.E,funding:fuPart,reason:'AUTONOMOUS_PARTIAL',
            policy:{partial_at_r:exitPolicy.partialAt,fraction:partFrac,current_r:currentR,mfe_r:managed.mfeR}
          })
          management.partial_planned=true
          management.partial_fraction=partFrac
        }
      }

      if(stalledExitV2({comp:String(m.comp),ageBars,mfeR:managed.mfeR,currentR})){
        await bookClose(t,'STALLED',{management:{...management,stall_age_bars:ageBars,stall_current_r:currentR}})
        return
      }
      openLive[String(t.id)] = {
        id: t.id, sym: t.sym, side: t.side, comp: m.comp, opened_at: t.opened_at,
        leverage: lev, size, notional, margin: mg, entry, mark, est_exit: estExit,
        stop: managed.stop, target: target0,
        liq: fastLiq(dir, entry, lev), regime: m.regime, z: m.z, t_sig: m.t_sig,
        mfe_r:managed.mfeR,mae_r:managed.maeR,stop_phase:managed.phase,be_armed:managed.beArmed,trail_active:managed.trailActive,
        target_r:m.target_r??null,age_bars:ageBars,
        gross_mark_pnl: grossMark, gross_exec_pnl: grossExec, net_pnl_to_close: netToClose,
        roe_net: mg > 0 ? netToClose / mg : null,
        entry_fee: entryFee, exit_fee_est: exitFee,
        entry_slippage_usd: entrySlipUsd, exit_slippage_usd: exitSlipUsd,
        entry_impact_bps: entryImpactBps, exit_impact_bps: +(impact * 1e4).toFixed(2),
        fee_rate_taker: CHAN.costs.taker, quote_ts: bk.E, depth_usd: Math.round(w.depthUsd),
        kelly_f: m.kelly_f, risk_usd: m.risk_usd, kelly_why: m.kelly_why
      }
      if ((managed.lastT && managed.lastT > (Number(m.chk) || 0)) || managed.stop!==Number(m.stop) || managed.mfeR!==Number(m.mfe_r??0) || managed.maeR!==Number(m.mae_r??0)) {
        updates.push({ id:t.id, chk:managed.lastT ?? (Number(m.chk)||0), ...management })
      }
    } catch { /* no data this cycle: the next one re-reads every trade since the last check */ }
  })
  // 2. equity (cash + margin + unrealised at the marks) and the risk state machine
  const stillOpen = open.filter((t: any) => !closing.has(t.id))
  const unreal = (t: any) => (t.side === 'LONG' ? 1 : -1) * ((marks[t.sym] ?? Number(t.entry_price)) - Number(t.entry_price)) * Number(t.size)
  const margin = (t: any) => Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1)
  const closedMargin = closes.reduce((s, c) => { const t = open.find((x: any) => x.id === c.id); return s + (t ? margin(t) + (t.side === 'LONG' ? 1 : -1) * (c.price - Number(t.entry_price)) * Number(t.size) : 0) }, 0)
  const equity = Number(state.balance) + closedMargin + stillOpen.reduce((s: number, t: any) => s + margin(t) + unreal(t), 0)
  const riskSeed = params.chan_risk_era === params.chan_era_id ? params.chan_risk : null
  const { st, ev } = riskStep(initRisk(riskSeed, equity), now, equity, learningRows)
  let halt: string | null = null
  if (ev === 'KILL') {
    for (const t of stillOpen) { try { await bookClose(t, 'KILL') } catch { /* the ledger halts entries regardless */ } }
    halt = st.haltReason
  }
  // 3. the bar scan, in batches over the cycles of the first CHAN.scan.windowMs after each 5m close
  const bar = Math.floor(now / CHAN.barMs) * CHAN.barMs
  const lastBar = Number(params.chan_bar) || 0
  const scan0 = params.chan_scan?.bar === bar ? params.chan_scan : { bar, done: [] as string[], skipped: 0, fetched: 0 }
  const inWindow = bar > lastBar && now - bar <= CHAN.scan.windowMs && !st.halted && !state.hard_halt_at
  const entries: any[] = [], decisions: any[] = [], views: Record<string, any> = {}, failed: string[] = []
  const done = new Set<string>(scan0.done), heldSyms = stillOpen.map((t: any) => String(t.sym))

  // Public leverage/news heartbeat keeps collecting even between 5m decision windows.
  if (now-Number(intelState?.ts ?? 0) >= 60_000) {
    try {
      const freshIntel = await loadChanIntel(db,now,uni.pairs,[...new Set([...heldSyms,'BTC','ETH'])],{})
      intelState = {
        ts:freshIntel.ts, bar:Number(intelState?.bar ?? 0), news_risk:freshIntel.news_risk,
        top_pressure:freshIntel.top_pressure, headlines:freshIntel.news.slice(0,8),
        sources:freshIntel.sources, failed:freshIntel.failed, bykaranteli:freshIntel.bykaranteli, by_sym:freshIntel.by_sym
      }
    } catch (e:any) {
      intelState = { ...intelState, error:String(e?.message ?? e).slice(0,100) }
    }
  }

  let heavy = 0, deep = 0, finished = false, volsChanged = false, dailyChanged = false, staleDaily = 0
  let vols: Record<string, { d: number; v: number }[]> = {}, daily: Record<string, Daily & { day: number }> = {}
  let breadth: any = { n:0, up_share:0.5, down_share:0.5, btc_ret5:null, eth_ret5:null }
  let burst:any = marketBurstMode(breadth,intelState)
  let breadthCandsRaw:any[] = [], breadthCands:any[] = [], cands:any[] = [], sniperChecks=0
  const directionBook: Record<'LONG'|'SHORT', { count:number; notional:number }> = {
    LONG: { count: 0, notional: 0 }, SHORT: { count: 0, notional: 0 }
  }
  for (const t of stillOpen.filter((t:any)=>!closing.has(t.id))) {
    const s = t.side === 'LONG' ? 'LONG' : 'SHORT'
    directionBook[s].count++
    directionBook[s].notional += Number(t.entry_price) * Number(t.size)
  }
  if (inWindow) {
    const { data: vc } = await db.from('market_cache').select('key,data').in('key', ['chan_vols', 'chan_daily']).throwOnError()
    vols = (vc ?? []).find((x: any) => x.key === 'chan_vols')?.data ?? {}
    daily = (vc ?? []).find((x: any) => x.key === 'chan_daily')?.data ?? {}
    const today = Math.floor(bar / DAY_MS)          // the slow stats are anchored at today's 00:00 UTC close
    const universe = [...new Set([...heldSyms, ...uni.pairs.map(p => p.sym)])]
    const todo = universe.filter(s => !done.has(s)).slice(0, CHAN.scan.perCycle)
    await pool(todo, 10, async (sym) => {
      const P = pairOf(sym)
      try {
        let d = daily[sym]
        if ((!d || d.day < today) && heavy < CHAN.scan.heavyPerCycle && weightLeft() > 80) {
          heavy++
          const hb = await closedBars(P, today * DAY_MS)            // the window ending at today's midnight close
          let h = vols[sym] ?? []
          const known = new Set(h.map(x => x.d))
          for (const x of dayVols(hb)) if (!known.has(x.d)) h.push(x)
          if (h.filter(x => x.d > 0).length < CHAN.regime.minHist + 1 && deep < CHAN.scan.deepPerCycle && !h.some(x => x.d < 0) && weightLeft() > 120) {
            deep++                                   // one-time deeper history so the high-volatility filter works from day one
            const d9 = await closedBars(P, today * DAY_MS, CHAN.scan.deepBars)
            const k2 = new Set(h.map(x => x.d))
            for (const x of dayVols(d9)) if (!k2.has(x.d)) h.push(x)
            if (h.filter(x => x.d > 0).length < CHAN.regime.minHist + 1) h.push({ d: -1, v: NaN })   // young listing: tried
          }
          h = h.sort((a, b) => a.d - b.d).slice(-(CHAN.regime.maxHist + 3))
          vols[sym] = h; volsChanged = true
          const ds = hb.length && hb[hb.length - 1].t + CHAN.barMs === today * DAY_MS
            ? dailyStats(hb, h.filter(x => x.d > 0 && x.d < today && Number.isFinite(x.v)).map(x => x.v)) : null
          if (ds) { d = { ...ds, day: today }; daily[sym] = d; dailyChanged = true }
        }
        if (!d) { if (heavy >= CHAN.scan.heavyPerCycle || weightLeft() <= 80) return; done.add(sym); return }   // no stats yet: retry / too young
        if (d.day < today) staleDaily++              // yesterday's stats until today's are computed (<= a few minutes)
        const bars = await recentBars(P, now)
        if (!bars.length || bars[bars.length - 1].t + CHAN.barMs !== bar) { failed.push(sym); done.add(sym); return }   // stale feed: never trade on it
        const v = barView(bars, d)
        if (v) {
          const last = bars[bars.length - 1]?.c, prev = bars[bars.length - 2]?.c
          views[sym] = { ...v,
            last_close: Number(last),
            ret5: Number.isFinite(last) && Number.isFinite(prev) && prev > 0 ? last / prev - 1 : NaN,
            pullback: Number.isFinite(d.volPct) && d.volPct <= CHAN.regime.volPctHigh ? trendPullback(bars) : null,
            opp: chanOpportunityMeta(bars,Number(v.mom?.atr))
          }
        }
        done.add(sym)
      } catch { failed.push(sym) }
    })
    finished = universe.every(s => done.has(s))
    // mean-reversion signal exits for the positions scanned in this batch
    for (const t of stillOpen) {
      if (closing.has(t.id)) continue
      const v = views[t.sym], m = t.scalp_meta?.chan
      if (v && m?.comp === 'RG_MR' && ((t.side === 'LONG' && v.mr.exitLong) || (t.side === 'SHORT' && v.mr.exitShort))) {
        try { await bookClose(t, 'SIGNAL', { z: v.mr.z }) } catch { /* retried next bar */ }
      }
    }
    // entries: this batch's candidates, strongest first
    let openN = stillOpen.filter((t: any) => !closing.has(t.id)).length
    let openNotional = stillOpen.filter((t: any) => !closing.has(t.id)).reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size), 0)
    let cash = Number(state.balance)
    const held = new Set(stillOpen.filter((t: any) => !closing.has(t.id)).map((t: any) => sleeveOf(t.scalp_meta?.chan?.comp) + ':' + t.sym))
    const budgets = Object.fromEntries(['1','2'].map(bucket => {
      const positions = stillOpen.filter((t: any) => sleeveOf(t.scalp_meta?.chan?.comp) === bucket)
      const walletCash = Number(wallets[bucket].cash)
      return [bucket, { cash: walletCash, equity: walletCash + positions.reduce((s: number,t: any)=>s+margin(t)+unreal(t),0),
        notional: positions.reduce((s: number,t: any)=>s+Number(t.entry_price)*Number(t.size),0) }]
    }))
    const rsOf = (comp: string) => learningRows.filter((x: any) => x.comp === comp).map((x: any) => x.r).reverse()

    const perfGroup = (rows:any[]) => {
      const good = rows.filter(x=>Number.isFinite(x.r)), n = good.length
      if (!n) return { n:0, avgR:0, win:0.5, signal:0 }
      const avgR = good.reduce((s,x)=>s+x.r,0)/n
      const win = good.filter(x=>x.pnl>0).length/n
      const shrink = n/(n+8)
      return { n, avgR, win, signal: shrink * (0.65*Math.tanh(avgR) + 0.35*(2*win-1)) }
    }
    const learnedQuality = (cand:any, sym:string, side:'LONG'|'SHORT') => {
      const regime = REGIME[cand.v.regime]
      const groups = [
        [0.30, learningRows.filter((x:any)=>x.comp===cand.comp)],
        [0.20, learningRows.filter((x:any)=>x.comp===cand.comp && x.side===side)],
        [0.20, learningRows.filter((x:any)=>x.comp===cand.comp && x.regime===regime)],
        [0.15, learningRows.filter((x:any)=>x.sym===sym)],
        [0.15, learningRows.filter((x:any)=>x.comp===cand.comp && x.side===side && x.regime===regime && x.sym===sym)]
      ] as const
      let signal=0, samples=0
      for (const [w,rows] of groups) { const g=perfGroup(rows as any[]); signal += w*g.signal; samples += g.n }
      return { weight: Math.max(0.72,Math.min(1.18,1+signal*0.35)), samples, regime }
    }
    const strongSignal = (cand:any, strict=false) => {
      const v=cand.v, z=Math.abs(Number(v.mr.z)), t=Math.abs(Number(v.mom.t)), h=Number(v.hurst)
      if (cand.comp==='RG_LIQ_SQUEEZE') return Number(cand.intelScore) >= (strict ? 80 : 70)
      if (cand.comp==='RG_BREADTH_MOMENTUM') return Number(cand.breadthScore) >= (strict ? 88 : 78)
      if (cand.comp==='RG_VOL_BREAKOUT') return Number(cand.breakoutScore) >= (strict ? 2.4 : 1.8)
      if (cand.comp==='RG_MR') return z >= (strict ? 3.2 : 3.0)
      if (cand.comp==='RG_MOM') return t >= (strict ? 2.6 : 2.25)
      return h >= (strict ? 0.53 : 0.50) && (t >= (strict ? 1.25 : 0.9) || z >= (strict ? 2.5 : 2.0))
    }
    const cooldownState = (sym:string) => {
      const rows = learningRows.filter((x:any)=>x.sym===sym)
      if (rows.length < 2 || !(rows[0].pnl < 0 && rows[1].pnl < 0)) return { active:false, bars:Infinity, losses:0 }
      const bars = Math.floor((now - rows[0].closedAt)/CHAN.barMs)
      return { active: bars < SYMBOL_COOLDOWN_BARS, bars, losses:2 }
    }

    const breadthRows = Object.values(views).filter((v:any)=>Number.isFinite(v.ret5)) as any[]
    const up = breadthRows.filter((v:any)=>v.ret5>0).length, down = breadthRows.filter((v:any)=>v.ret5<0).length
    breadth = {
      n: breadthRows.length,
      up_share: breadthRows.length ? up/breadthRows.length : 0.5,
      down_share: breadthRows.length ? down/breadthRows.length : 0.5,
      btc_ret5: Number.isFinite(Number((views as any).BTC?.ret5)) ? Number((views as any).BTC?.ret5) : null,
      eth_ret5: Number.isFinite(Number((views as any).ETH?.ret5)) ? Number((views as any).ETH?.ret5) : null
    }
    const marketConfirm = (cand:any) => {
      if (breadth.n < 20) return { ok:true, share:0.5, majors:0, n:breadth.n }
      const wantLong = cand.side > 0
      const share = wantLong ? breadth.up_share : breadth.down_share
      const majors = [breadth.btc_ret5,breadth.eth_ret5].filter(Number.isFinite)
      const majorAgree = majors.filter((r:number)=>wantLong ? r>0 : r<0).length
      return { ok: share >= BREADTH_MIN_SHARE || (majors.length===2 && majorAgree===2), share, majors:majorAgree, n:breadth.n }
    }

    const crowdState = (side:'LONG'|'SHORT') => {
      const gross = directionBook.LONG.notional + directionBook.SHORT.notional
      const row = directionBook[side]
      const share = gross > 0 ? row.notional / gross : 0
      return { active: row.count >= CROWD_MIN_POSITIONS && share >= CROWD_NOTIONAL_SHARE, count: row.count, share, gross }
    }
    const strongEnoughWhenCrowded = (cand:any) => {
      const v = cand.v, regime = REGIME[v.regime]
      if (cand.comp === 'RG_LIQ_SQUEEZE') return Number(cand.intelScore) >= 80
      if (cand.comp === 'RG_BREADTH_MOMENTUM') return Number(cand.breadthScore) >= 86
      if (cand.comp === 'RG_VOL_BREAKOUT') return Number(cand.breakoutScore) >= 2.2
      if (cand.comp === 'RG_MR') return Math.abs(Number(v.mr.z)) >= 2.8
      if (cand.comp === 'RG_MOM') return Math.abs(Number(v.mom.t)) >= 1.8
      // Trend-pullback: require actual persistence when the portfolio is already crowded.
      // A TREND regime with Hurst >= .50, or a strong persistent NEUTRAL regime, is accepted.
      const h = Number(v.hurst)
      return (regime === 'TREND' && h >= .48) || (regime === 'NEUTRAL' && h >= .53)
    }

    const initialGross = directionBook.LONG.notional + directionBook.SHORT.notional
    const initialDominant: 'LONG'|'SHORT'|null = initialGross <= 0 ? null :
      directionBook.LONG.notional >= directionBook.SHORT.notional ? 'LONG' : 'SHORT'
    const initialDomShare = initialDominant ? directionBook[initialDominant].notional / initialGross : 0
    const prioritiseOpposite = !!initialDominant &&
      directionBook[initialDominant].count >= CROWD_MIN_POSITIONS && initialDomShare >= CROWD_NOTIONAL_SHARE

    const technicalCands = Object.entries(views).flatMap(([sym, v]: [string, any]) => {
      const c = v.mr.side ? { comp: 'RG_MR', side: v.mr.side, stop: v.mr.side > 0 ? v.mr.stopLong : v.mr.stopShort, maxHold: v.mr.maxHold, strength: Math.abs(v.mr.z) }
        : v.mom.side ? { comp: 'RG_MOM', side: v.mom.side, stop: v.mom.side > 0 ? v.mom.stopLong : v.mom.stopShort, maxHold: CHAN.params.RG_MOM.hold, strength: v.mom.t } : null
      const extra = v.pullback ? { comp: 'RG_TREND_PULLBACK', side: v.pullback.side, stop: v.pullback.stop,
        maxHold: 48, strength: 1 + Math.min(2,Math.abs(Number(v.mom?.t)||0)/2), level: v.pullback.level, breakoutAt: v.pullback.breakoutAt } : null
      return [c,extra].filter(Boolean).map(c => ({sym,v,...c}))
    }).filter(Boolean) as any[]

    const breadthSide:1|-1|0 =
      breadth.n>=40 && breadth.up_share>=BREADTH_IMPULSE_SHARE && Number(breadth.btc_ret5)>0 && Number(breadth.eth_ret5)>0 ? 1 :
      breadth.n>=40 && breadth.down_share>=BREADTH_IMPULSE_SHARE && Number(breadth.btc_ret5)<0 && Number(breadth.eth_ret5)<0 ? -1 : 0
    const alignedReturns = Object.values(views).map((v:any)=>breadthSide*Number(v.ret5)).filter((x:number)=>Number.isFinite(x)&&x>0).sort((a:number,b:number)=>a-b)
    const relThreshold = alignedReturns.length ? alignedReturns[Math.max(0,Math.floor(alignedReturns.length*.70)-1)] : Infinity
    breadthCandsRaw = breadthSide ? Object.entries(views).flatMap(([sym,v]:any)=>{
      const rel=breadthSide*Number(v.ret5), close=Number(v.last_close), atr=Number(v.mom?.atr), mtf=Number(v.opp?.mtf_side??0)
      if(!(rel>0) || rel<relThreshold || !(close>0) || mtf===-breadthSide) return []
      const frac=Math.max(0.0025,Math.min(0.0085,Number.isFinite(atr)&&atr>0?0.65*atr/close:0.004))
      const breadthPct=100*(breadthSide>0?breadth.up_share:breadth.down_share)
      const score=Math.min(100,breadthPct + Math.min(12,rel*2500) + (mtf===breadthSide?5:0))
      return [{sym,v,comp:'RG_BREADTH_MOMENTUM',side:breadthSide,stop:close*(1-breadthSide*frac),
        maxHold:18,strength:1.5+Math.min(2,rel*300),breadthScore:score}]
    }) : []

    const breakoutCands = Object.entries(views).flatMap(([sym,v]:any)=>{
      const side=Number(v.opp?.breakout_side??0) as 1|-1|0
      if(!side || Number(v.opp?.mtf_side??0)===-side) return []
      const stop=side>0?Number(v.opp?.breakout_stop_long):Number(v.opp?.breakout_stop_short)
      if(!(stop>0)) return []
      return [{sym,v,comp:'RG_VOL_BREAKOUT',side,stop,maxHold:24,
        strength:Number(v.opp?.breakout_strength??0),breakoutScore:Number(v.opp?.breakout_strength??0),
        compression:v.opp?.compression??null}]
    })

    const ret5Map = Object.fromEntries(Object.entries(views).map(([s,v]:any)=>[s,Number.isFinite(Number(v.ret5))?Number(v.ret5):null]))
    const intelRequested = [...new Set<string>([
      ...technicalCands.map((x:any)=>String(x.sym)),
      ...breadthCandsRaw.map((x:any)=>String(x.sym)),
      ...breakoutCands.map((x:any)=>String(x.sym)),
      ...heldSyms,
      'BTC','ETH'
    ])]
    const intelDue = now-Number(intelState?.ts ?? 0) >= 60_000 || Number(intelState?.bar ?? 0) !== bar
    if (intelDue) {
      try {
        const freshIntel = await loadChanIntel(db,now,uni.pairs,intelRequested,ret5Map)
        intelState = {
          ts:freshIntel.ts, bar, news_risk:freshIntel.news_risk,
          top_pressure:freshIntel.top_pressure,
          headlines:freshIntel.news.slice(0,8),
          sources:freshIntel.sources, failed:freshIntel.failed,
          bykaranteli:freshIntel.bykaranteli,
          by_sym:freshIntel.by_sym
        }
      } catch (e:any) {
        intelState = { ...intelState, bar, error:String(e?.message ?? e).slice(0,100) }
      }
    }

    burst = marketBurstMode(breadth,intelState)
    breadthCands = eliteBreadthCandidates(breadthCandsRaw,Number(burst.breadth_cap??3))

    const squeezeCands = Object.entries(views).flatMap(([sym,v]:any)=>{
      const x=intelState?.by_sym?.[sym]
      if(!x || Number(x.confidence)<66) return []
      const longScore=Number(x.short_squeeze), shortScore=Number(x.long_squeeze)
      let side:1|-1|0=0, score=0
      if(longScore>=70 && longScore-shortScore>=12){side=1;score=longScore}
      if(shortScore>=70 && shortScore-longScore>=12 && shortScore>score){side=-1;score=shortScore}
      if(!side) return []
      const close=Number(v.last_close), atr=Number(v.mom?.atr)
      if(!(close>0)) return []
      const frac=Math.max(0.0025,Math.min(0.006,Number.isFinite(atr)&&atr>0?0.8*atr/close:0.004))
      const stop=close*(1-side*frac)
      return [{sym,v,comp:'RG_LIQ_SQUEEZE',side,stop,maxHold:12,strength:score/25,intelScore:score}]
    })

    const intelWeight=(cand:any)=>{
      const x=intelState?.by_sym?.[cand.sym]
      if(!x) return 1
      const aligned=cand.side>0?Number(x.short_squeeze):Number(x.long_squeeze)
      const against=cand.side>0?Number(x.long_squeeze):Number(x.short_squeeze)
      return Math.max(0.75,Math.min(1.25,1+(aligned-against)/400))
    }

    let microChecks=0; sniperChecks=0
    const microCache=new Map<string,any>(), sniperCache=new Map<string,any>()
    cands = [...technicalCands,...squeezeCands,...breadthCands,...breakoutCands].sort((a: any, b: any) => {
      if (prioritiseOpposite && initialDominant) {
        const ao = (a.side > 0 ? 'LONG' : 'SHORT') !== initialDominant ? 1 : 0
        const bo = (b.side > 0 ? 'LONG' : 'SHORT') !== initialDominant ? 1 : 0
        if (ao !== bo) return bo - ao
      }
      const al = learnedQuality(a, a.sym, a.side > 0 ? 'LONG' : 'SHORT').weight, bl = learnedQuality(b, b.sym, b.side > 0 ? 'LONG' : 'SHORT').weight
      const as=portfolioBrainRank(a,{learned:al,intel:intelWeight(a),auction:Number(auctionWeights[a.comp]??1),pattern:0,burst})
      const bs=portfolioBrainRank(b,{learned:bl,intel:intelWeight(b),auction:Number(auctionWeights[b.comp]??1),pattern:0,burst})
      return bs-as
    }) as any[]
    for (const cand of cands) {
      const liveEntryCap=AGGRESSIVE?AGGRESSIVE_MAX_OPEN:Math.max(1,Math.min(Number(burst.entry_cap??5),Number(profitabilityGovernor.entry_cap??4)))
      if(entries.length>=liveEntryCap) break
      const { sym, v } = cand
      cand.stop = initialStopV2({
        comp:String(cand.comp),side:cand.side>0?1:-1,close:Number(v.last_close),atr:Number(v.mom?.atr),proposed:Number(cand.stop),
        swingLow:v.opp?.swing_low??null,swingHigh:v.opp?.swing_high??null
      })
      const side = cand.side > 0 ? 'LONG' : 'SHORT'
      const rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym, comp: cand.comp, side, decision, reason, regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, z: v.mr.z, hl: v.mr.hl, t_sig: v.mom.t, ...extra })
      const bucket = sleeveOf(cand.comp), budget = budgets[bucket]
      if (held.has(bucket + ':' + sym)) { rec('rejected', 'coin_held'); continue }
      const profitGate:any = strategyProfitability[String(cand.comp)] ?? {mode:'PROBE',size_mult:.25,min_quality:70,reason:'unknown_edge'}
      if(profitGate.mode==='SHADOW'){
        rec('shadow','negative_expectancy_quarantine',{
          profitability_mode:profitabilityGovernor.mode,
          strategy_profit_mode:profitGate.mode,
          strategy_avg_r:profitGate.avgR,strategy_recent_avg_r:profitGate.recentAvgR,
          strategy_win:profitGate.win,strategy_samples:profitGate.n
        })
        continue
      }

      // Soft quality stack: regime, breadth, learning, crowding and public leverage/news
      // contribute to one score instead of any single secondary filter vetoing a trade.
      const cd = cooldownState(sym)
      const learned = learnedQuality(cand,sym,side)
      const mc = marketConfirm(cand)
      const ix = intelState?.by_sym?.[sym]
      const crowd = crowdState(side)
      const softReasons:string[]=[]
      let qualityScore = 50 + Math.min(10,Math.max(0,Number(cand.strength))*2)

      if (cand.comp === 'RG_TREND_PULLBACK' && REGIME[v.regime] === 'MEAN_REVERT') {
        const z=Number(v.mr.z), t=Math.abs(Number(v.mom.t))
        const locationSupports=Number.isFinite(z)&&(-cand.side*z)>=1.15
        if(!(t>=1.25&&locationSupports)){qualityScore-=12;softReasons.push('regime_mismatch')}
        else qualityScore+=4
      }
      if(cd.active){qualityScore-=7;softReasons.push('cooldown')}
      if(learned.samples>=8){
        const adj=Math.max(-10,Math.min(8,(learned.weight-1)*40))
        qualityScore+=adj
        if(adj<0)softReasons.push('adaptive')
      }
      if(mc.ok) qualityScore+=6
      else {qualityScore-=11;softReasons.push('breadth_against')}
      const mtf=Number(v.opp?.mtf_side??0)
      if(mtf===cand.side) qualityScore+=9
      else if(mtf===-cand.side){qualityScore-=7;softReasons.push('mtf_against')}
      if(ix){
        const aligned=cand.side>0?Number(ix.short_squeeze):Number(ix.long_squeeze)
        const against=cand.side>0?Number(ix.long_squeeze):Number(ix.short_squeeze)
        if(Number(ix.confidence)>=66&&against>=82&&against-aligned>=22){qualityScore-=12;softReasons.push('leverage_against')}
        else if(Number(ix.confidence)>=66&&aligned-against>=15) qualityScore+=6
        const symbolNewsRisk=Number(ix.news_risk??0)
        if(symbolNewsRisk>=65){qualityScore-=9;softReasons.push('news_risk')}
      }
      if(crowd.active&&!strongEnoughWhenCrowded(cand)){qualityScore-=9;softReasons.push('crowding')}
      if(cand.comp==='RG_BREADTH_MOMENTUM') qualityScore+=8
      if(cand.comp==='RG_VOL_BREAKOUT') qualityScore+=8
      if(cand.comp==='RG_LIQ_SQUEEZE') qualityScore+=6

      let micro:any=null
      const mk=sym+':'+side
      if(microCache.has(mk)) micro=microCache.get(mk)
      else if(microChecks<MICRO_MAX_CHECKS){
        microChecks++
        try{micro=await microExecution(pairOf(sym),cand.side,now);microCache.set(mk,micro)}
        catch{micro={score:50,error:true};microCache.set(mk,micro)}
      }
      if(micro){
        qualityScore += Math.max(-9,Math.min(9,(Number(micro.score)-50)*0.18))
        if(Number(micro.score)<40)softReasons.push('micro_against')
      }
      const pattern=patternMemory(learningRows,{
        comp:String(cand.comp),regime:String(REGIME[v.regime]),side,
        volPct:Number(v.volPct),mtfSide:Number(v.opp?.mtf_side??0),microScore:Number(micro?.score??50)
      })
      qualityScore += Number(pattern.penalty||0)
      if(Number(pattern.penalty)<0) softReasons.push('pattern_memory')
      if(burst.active&&Number(cand.side)===Number(burst.side)) qualityScore += Number(burst.quality_relief||0)
      qualityScore=Math.max(0,Math.min(100,qualityScore))
      const requiredQuality=Math.max(SOFT_QUALITY_MIN,Number(profitabilityGovernor.min_quality??56),Number(profitGate.min_quality??56))
      if(qualityScore<requiredQuality){
        rec('rejected','profitability_quality_gate',{
          quality_score:qualityScore,quality_min:requiredQuality,soft_reasons:softReasons,
          profitability_mode:profitabilityGovernor.mode,strategy_profit_mode:profitGate.mode,
          strategy_avg_r:profitGate.avgR,strategy_recent_avg_r:profitGate.recentAvgR,
          learning_weight:learned.weight,learning_samples:learned.samples,breadth_share:mc.share,breadth_n:mc.n,
          micro_score:micro?.score??null,mtf_side:mtf,pattern_state:pattern.state,pattern_n:pattern.n,pattern_avg_r:pattern.avgR
        })
        continue
      }

      // Controlled re-entry: never jump straight back in after a stopped/liq loss.
      // One full 5m reset bar is mandatory; the next bar needs stronger quality + micro confirmation.
      const priorLoss=learningRows.find((x:any)=>x.sym===sym&&x.comp===cand.comp&&x.pnl<0&&['STOP','LIQUIDATION'].includes(String(x.exitReason)))
      if(priorLoss){
        const barsSince=Math.floor((now-priorLoss.closedAt)/CHAN.barMs)
        if(barsSince<1 || (barsSince<2 && !(qualityScore>=65&&Number(micro?.score??50)>=55))){
          rec('rejected','reentry_reset_wait',{reentry_bars_since:barsSince,quality_score:qualityScore,micro_score:micro?.score??null})
          continue
        }
      }

      const co = canOpen(st, openN)
      if (!co.ok) { rec('rejected', co.why); continue }
      if (AGGRESSIVE && openN >= AGGRESSIVE_MAX_OPEN) { rec('rejected', 'aggressive_max_open', { open: openN, max_open: AGGRESSIVE_MAX_OPEN }); continue }
      const eraRs = rsOf(cand.comp)
      const estimatedKelly = kellyRisk(eraRs)
      const discoveryBootstrap = eraRs.length < 8 && profitGate.mode === 'PROBE'
      const k = AGGRESSIVE
        ? { f: PAPER_RISK_MAX, why: `owner aggressive override: fixed ${PAPER_RISK_MAX*100}% risk; Kelly ${estimatedKelly.f} (${estimatedKelly.why}) not used` }
        : discoveryBootstrap && !(Number.isFinite(estimatedKelly.f) && estimatedKelly.f > 0)
        ? { f: 0.010, why: `new-era discovery bootstrap; n=${eraRs.length}; meaningful PAPER sizing; quality gates still required` }
        : estimatedKelly
      // Once an engine has enough new-era observations, Kelly must be genuinely positive.
      if (!(Number.isFinite(k.f) && k.f > 0)) {
        rec('rejected','kelly_no_positive_edge',{kelly_f:k.f,kelly_why:k.why,kelly_n:eraRs.length,profitability_mode:profitabilityGovernor.mode,strategy_profit_mode:profitGate.mode})
        continue
      }
      let bk: Awaited<ReturnType<typeof book>>
      try { bk = await book(pairOf(sym)) } catch { rec('rejected', 'no_book'); continue }
      const touch = cand.side > 0 ? bk.asks[0][0] : bk.bids[0][0]
      if (!(cand.side * (touch - cand.stop) > 0)) { rec('rejected', 'stop_on_wrong_side_of_market'); continue }
      const sk=sym+':'+side
      let sniper:any=sniperCache.get(sk)
      if(!sniper&&sniperChecks<SNIPER_MAX_CHECKS){sniperChecks++;sniper=await entrySniper(pairOf(sym),cand.side,bk,now);sniperCache.set(sk,sniper)}
      if(!sniper) sniper={score:50,source:'budget-neutral'}
      if(Number(sniper.score)<30 && qualityScore<72){
        rec('rejected','sniper_flow_against',{sniper_score:sniper.score,sniper_cvd:sniper.cvd,sniper_imbalance:sniper.imbalance})
        continue
      }
      qualityScore=Math.max(0,Math.min(100,qualityScore+Math.max(-6,Math.min(8,(Number(sniper.score)-50)*.16))))
      if(qualityScore<requiredQuality){
        rec('rejected','sniper_dropped_below_profitability_gate',{quality_score:qualityScore,quality_min:requiredQuality,sniper_score:sniper.score})
        continue
      }
      const baseAggressiveRisk = AGGRESSIVE
        ? PAPER_RISK_MAX
        : discoveryBootstrap
        ? Math.max(0.0075,Math.min(0.010,Number(k.f)))
        : Math.min(PAPER_RISK_MAX, Math.max(PAPER_RISK_MIN, k.f * PAPER_RISK_MULT))
      const aggressiveRisk = Math.max(0.001,Math.min(PAPER_RISK_MAX,baseAggressiveRisk*Number(profitabilityGovernor.risk_mult??1)))
      const sz = chanSize(aggressiveRisk, budget.equity, touch, cand.stop, budget.notional, PAPER_LEVERAGE, PAPER_MIN_STOP_TO_COST)
      if (!(sz.notional > 0)) { rec('rejected', sz.why); continue }
      const compPerf=perfGroup(learningRows.filter((x:any)=>x.comp===cand.comp))
      const legacyMult=strategySizeMultV2(String(cand.comp),compPerf)
      const gov=autonomyGovernor[String(cand.comp)] ?? {sizeMult:1,banditWeight:1,mode:'ACTIVE'}
      const peers=stillOpen.filter((x:any)=>!closing.has(x.id)).map((x:any)=>{
        const pv=views[String(x.sym)]
        return {side:(x.side==='LONG'?1:-1) as 1|-1,ret5:Number(pv?.ret5),ret15:Number(pv?.opp?.ret15),ret60:Number(pv?.opp?.ret60),notional:Number(x.entry_price)*Number(x.size)}
      })
      const cluster=clusterMultiplier({side:cand.side>0?1:-1,candidate:{ret5:Number(v.ret5),ret15:Number(v.opp?.ret15),ret60:Number(v.opp?.ret60)},peers})
      const auctionMult=Number(auctionWeights[String(cand.comp)]??1)
      const burstMult=profitabilityGovernor.allow_burst&&profitGate.mode==='LIVE'&&burst.active&&Number(cand.side)===Number(burst.side)&&qualityScore>=requiredQuality+3?Number(burst.risk_mult??1):1
      const sniperMult=Number(sniper.score)>=68?1.08:Number(sniper.score)<40?.82:1
      const strategySizeCap=profitGate.reason==='breadth_positive_edge_boost'?1.35:1.25
      const strategySizeMult=AGGRESSIVE?1:Math.max(.05,Math.min(strategySizeCap,
        Math.min(legacyMult,Number(gov.sizeMult))*Number(gov.banditWeight)*cluster.mult*auctionMult*Number(pattern.size_mult??1)*burstMult*sniperMult*Number(profitGate.size_mult??1)
      ))
      const desiredNotional=sz.notional*strategySizeMult
      const dist = Math.abs(touch - cand.stop) / touch
      const cap = liqCap(cand.side > 0 ? bk.asks : bk.bids, cand.side > 0 ? bk.bids : bk.asks, 0.25 * dist)
      let notional = Math.min(desiredNotional, cap, Math.max(0, equity * PAPER_LEVERAGE - openNotional), Math.max(0, Math.min(cash, budget.cash)) * PAPER_LEVERAGE / (1 + PAPER_LEVERAGE * CHAN.costs.taker))
      if (notional / PAPER_LEVERAGE < 5) { rec('rejected', 'too_small_or_book_too_thin', { want: sz.notional, liq_cap: cap }); continue }
      let w = walkBook(cand.side > 0 ? bk.asks : bk.bids, notional)
      let floorPx = touch * (1 + cand.side * slipFor(sym)), px = cand.side > 0 ? Math.max(w.vwap, floorPx) : Math.min(w.vwap, floorPx)
      if (!(cand.side * (px - cand.stop) > 0)) { rec('rejected', 'fill_beyond_stop'); continue }
      let r = Math.abs(px - cand.stop)

      // Execution optimizer scales expensive fills instead of blindly paying a large part of R in fees/impact.
      const exitProbe=walkBook(cand.side > 0 ? bk.bids : bk.asks,notional)
      const probeExitImpact=Math.max(Number.isFinite(exitProbe.impact)?exitProbe.impact:0,slipFor(sym))
      const probeEntryImpact=Math.max(Number.isFinite(w.impact)?w.impact:0,slipFor(sym))
      const costR=(2*CHAN.costs.taker+probeEntryImpact+probeExitImpact)/Math.max(1e-9,r/px)
      const execOpt=executionMultiplier(costR,Math.max(probeEntryImpact,probeExitImpact)*1e4)
      if(execOpt.mult<1){
        notional*=execOpt.mult
        if(notional/PAPER_LEVERAGE<5){rec('rejected','execution_cost_too_high',{cost_r:costR,execution_state:execOpt.state});continue}
        w=walkBook(cand.side>0?bk.asks:bk.bids,notional)
        floorPx=touch*(1+cand.side*slipFor(sym)); px=cand.side>0?Math.max(w.vwap,floorPx):Math.min(w.vwap,floorPx)
        r=Math.abs(px-cand.stop)
      }

      // 2) At 50x a stop too near liquidation is not a meaningful stop. Keep a hard buffer.
      const liqPx = fastLiq(cand.side > 0 ? 1 : -1, px, PAPER_LEVERAGE)
      const liqDist = Math.abs(liqPx-px), stopDist = Math.abs(cand.stop-px)
      const liqStopShare = liqDist > 0 ? stopDist/liqDist : Infinity
      const dynamicLiqStopMax=liquidationStopLimitV2(Number(v.volPct),qualityScore)
      const liqStopMax=cand.comp==='RG_MR'?Math.max(LIQ_STOP_MAX_SHARE,dynamicLiqStopMax):dynamicLiqStopMax
      if (!(Number.isFinite(liqStopShare) && liqStopShare <= liqStopMax)) {
        rec('rejected','stop_too_close_to_liquidation',{ liq_px:liqPx, stop_liq_share:liqStopShare, max_share:liqStopMax })
        continue
      }

      // 3) Profit gate uses the actual fill, fees and current opposite-side book impact.
      // MR uses its Z=0 mean, trend-pullback its real 2R target; momentum uses 2R only as an entry viability reference.
      const intelAligned=ix ? ((cand.side>0?Number(ix.short_squeeze):Number(ix.long_squeeze))-(cand.side>0?Number(ix.long_squeeze):Number(ix.short_squeeze))>=10) : false
      const targetR=targetRV2({comp:String(cand.comp),quality:qualityScore,mtfAligned:Number(v.opp?.mtf_side??0)===cand.side,intelAligned})
      const referenceTarget = cand.comp === 'RG_MR' && Number.isFinite(Number(v.mr.mean))
        ? Math.exp(Number(v.mr.mean))
        : px + cand.side * targetR * r
      const exitWalk = walkBook(cand.side > 0 ? bk.bids : bk.asks, notional)
      const exitImpact = Math.max(Number.isFinite(exitWalk.impact) ? exitWalk.impact : 0, slipFor(sym))
      const qty = notional/px
      const targetFill = referenceTarget * (1 - cand.side*exitImpact)
      const stopFill = cand.stop * (1 - cand.side*exitImpact)
      const entryFee = notional*CHAN.costs.taker
      const targetFee = targetFill*qty*CHAN.costs.taker
      const stopFee = stopFill*qty*CHAN.costs.taker
      const rewardNet = cand.side*(targetFill-px)*qty - entryFee - targetFee
      const stopNet = cand.side*(stopFill-px)*qty - entryFee - stopFee
      const lossNet = Math.abs(Math.min(0,stopNet))
      const netRR = lossNet > 0 ? rewardNet/lossNet : -Infinity
      if (!(cand.side*(referenceTarget-px) > 0 && rewardNet > 0 && netRR >= MIN_NET_REWARD_RISK)) {
        rec('rejected','net_reward_risk_too_low',{ net_rr:netRR, min_net_rr:MIN_NET_REWARD_RISK, reward_net:rewardNet, loss_net:lossNet, reference_target:referenceTarget })
        continue
      }

      entries.push({ sym, side, price: px, notional, lev: PAPER_LEVERAGE, quote_ts: bk.E, source: 'binance-futures',
        chan: { comp: cand.comp, sleeve: bucket, era_id: params.chan_era_id ?? null, reset_at: params.chan_reset_at ?? null,
          level: cand.level ?? null, breakout_at: cand.breakoutAt ?? null,
          target: cand.comp === 'RG_MR' ? null : px + cand.side * targetR * r, target_r:Number.isFinite(targetR)?targetR:null,
          stop: cand.stop, initial_stop:cand.stop, r, best:px, worst:px, mfe_r:0, mae_r:0, be_armed:false, trail_active:false, stop_phase:'initial', stop_engine:'V2',
          chk: bk.E, max_hold_bars: cand.maxHold, bar: new Date(bar).toISOString(),
          regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, halflife: v.mr.hl, z: v.mr.z, mr_mean: v.mr.mean, mr_std: v.mr.std,
          t_sig: v.mom.t, atr: v.mom.atr, hh: v.mom.hh, ll: v.mom.ll, kelly_f: aggressiveRisk, kelly_why: `aggressive paper 50x; base=${k.f}; ${k.why}`, kelly_n: eraRs.length,
          risk_usd: notional * r / px, risk_frac: notional * r / px / budget.equity, equity: budget.equity, backtested_coin: (CHAN.universe as readonly string[]).includes(sym),
          direction_crowding: { active: crowd.active, same_side_count: crowd.count, same_side_share: crowd.share },
          quality_gates: {
            learning_weight: learned.weight, learning_samples: learned.samples,
            cooldown_active: cd.active, breadth_share: mc.share, breadth_n: mc.n,
            quality_score: qualityScore, quality_min: requiredQuality, soft_reasons: softReasons,
            profitability_mode:profitabilityGovernor.mode, profitability_risk_mult:profitabilityGovernor.risk_mult,
            strategy_profit_mode:profitGate.mode, strategy_profit_reason:profitGate.reason,
            strategy_avg_r:profitGate.avgR, strategy_recent_avg_r:profitGate.recentAvgR, strategy_profit_size_mult:profitGate.size_mult,
            strategy_size_cap:strategySizeCap,
            mtf: v.opp ? { side:v.opp.mtf_side, trend15:v.opp.mtf15, trend60:v.opp.mtf60, ret15:v.opp.ret15, ret60:v.opp.ret60 } : null,
            micro_execution: micro,
            opportunity: { breadth_score:cand.breadthScore??null, breakout_score:cand.breakoutScore??null, compression:cand.compression??null },
            liq_stop_share: liqStopShare, liq_stop_max:liqStopMax, net_rr: netRR, reward_net: rewardNet, stop_loss_net: lossNet,
            strategy_size_mult:strategySizeMult, governor_mode:gov.mode, governor_size_mult:gov.sizeMult, bandit_weight:gov.banditWeight,
            cluster_mult:cluster.mult, cluster_similar:cluster.similar, cluster_share:cluster.share,
            auction_mult:auctionMult, burst_mult:burstMult, burst_active:burst.active, pattern_memory:pattern,
            sniper, sniper_mult:sniperMult,
            execution_mult:execOpt.mult, execution_state:execOpt.state, execution_cost_r:costR,
            target_r:Number.isFinite(targetR)?targetR:null,
            reference_target: referenceTarget, exit_impact_bps: +(exitImpact*1e4).toFixed(2),
            public_intel: ix ? {
              funding:ix.funding, premium:ix.premium, oi_delta:ix.oi_delta, oi_value_delta:ix.oi_value_delta,
              top_ratio:ix.top_ratio, global_ratio:ix.global_ratio, taker_ratio:ix.taker_ratio,
              long_squeeze:ix.long_squeeze, short_squeeze:ix.short_squeeze, flow_bias:ix.flow_bias,
              confidence:ix.confidence, long_liq_count:ix.long_liq_count, short_liq_count:ix.short_liq_count,
              liqmap:ix.liqmap ?? null
            } : null
          },
          entry_fill: { model: 'book_walk', touch, vwap: w.vwap, impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), want: Math.round(desiredNotional), raw_want:Math.round(sz.notional), liq_cap: Math.round(cap) } } })
      rec('accepted', 'taken', { notional, kelly_f: aggressiveRisk, leverage: PAPER_LEVERAGE,
        crowd_side: side, crowd_count: crowd.count, crowd_share: crowd.share,
        learning_weight: learned.weight, learning_samples: learned.samples, breadth_share: mc.share,
        quality_score:qualityScore, quality_min:requiredQuality, soft_reasons:softReasons,
        profitability_mode:profitabilityGovernor.mode, strategy_profit_mode:profitGate.mode,
        strategy_avg_r:profitGate.avgR, strategy_recent_avg_r:profitGate.recentAvgR, strategy_profit_size_mult:profitGate.size_mult,
        micro_score:micro?.score??null, mtf_side:Number(v.opp?.mtf_side??0),
        liq_stop_share: liqStopShare, liq_stop_max:liqStopMax, net_rr: netRR, target_r:Number.isFinite(targetR)?targetR:null,
        strategy_size_mult:strategySizeMult, governor_mode:gov.mode, governor_size_mult:gov.sizeMult, bandit_weight:gov.banditWeight,
        cluster_mult:cluster.mult, auction_mult:auctionMult, burst_mult:burstMult, burst_active:burst.active,
        pattern_state:pattern.state, pattern_n:pattern.n, pattern_avg_r:pattern.avgR,
        sniper_score:sniper.score, sniper_cvd:sniper.cvd, sniper_imbalance:sniper.imbalance,
        execution_mult:execOpt.mult, execution_state:execOpt.state, execution_cost_r:costR,
        intel_confidence: ix?.confidence ?? null, funding: ix?.funding ?? null, oi_delta: ix?.oi_delta ?? null,
        taker_ratio: ix?.taker_ratio ?? null, long_squeeze: ix?.long_squeeze ?? null, short_squeeze: ix?.short_squeeze ?? null })
      held.add(bucket + ':' + sym); openN++; openNotional += notional;
      directionBook[side].count++; directionBook[side].notional += notional;
      const debit = notional / PAPER_LEVERAGE + notional * CHAN.costs.taker
      cash -= debit; budget.cash -= debit; budget.notional += notional; budget.equity -= notional * CHAN.costs.taker
    }
    if (volsChanged || dailyChanged) {
      try { await db.from('market_cache').upsert([{ key: 'chan_vols', data: vols, ts: new Date(now).toISOString() }, { key: 'chan_daily', data: daily, ts: new Date(now).toISOString() }]).throwOnError() } catch { /* rebuilt next cycle */ }
    }
  }
  const closeBar = bar > lastBar && (finished || now - bar > CHAN.scan.windowMs)   // done, or out of time for this bar
  const regimes = Object.fromEntries(Object.entries(views).map(([s, v]: any) => [s, REGIME[v.regime]]))
  const note = { strategy: 'regime_router', validated: false, phase1: 'NO-GO',
    era_id: params.chan_era_id ?? null, reset_at: params.chan_reset_at ?? null,
    universe: uni.pairs.length, universe_note: uni.note || undefined, bar: new Date(bar).toISOString(),
    in_window: inWindow, batch: Object.keys(views).length, scanned: done.size, complete: finished, failed: failed.length, daily_refresh: heavy, deep_fetches: deep, stale_daily: staleDaily,
    weight_1m: usedWeight, regime_counts: Object.values(regimes).reduce((a: any, r: any) => ({ ...a, [r]: (a[r] ?? 0) + 1 }), {}),
    equity, event: ev, opened: entries.length, closed: closes.length, risk_state: st,
    risk_era: params.chan_era_id ?? null,
    marks, marks_ts: new Date(now).toISOString(),
    open_live: openLive,
    live_scan: liveScan,
    direction_exposure: {
      long_count: directionBook.LONG.count, short_count: directionBook.SHORT.count,
      long_notional: directionBook.LONG.notional, short_notional: directionBook.SHORT.notional,
      crowd_min_positions: CROWD_MIN_POSITIONS, crowd_share: CROWD_NOTIONAL_SHARE
    },
    market_breadth: breadth,
    autonomous_lab: {
      status:'ACTIVE', version:'CHAN-X',
      learning_scope:'ERA_ONLY',
      era_id:params.chan_era_id ?? null,
      era_closed:learningRows.length,
      archived_closed:archiveRows.length,
      discovery_mode:learningRows.length<8?'CONTROLLED_DISCOVERY':'EVIDENCE_DRIVEN',
      archive_influences_live:false,
      governor:autonomyGovernor,
      auction:auctionWeights,
      exit_policies:exitPolicies,
      forensics:autonomyForensics.slice(0,10),
      challengers:autonomyChallengers,
      shadow_swarm:shadowLabs,
      burst,
      breadth_elite:{raw:breadthCandsRaw.length,selected:breadthCands.length,cap:Number(burst.breadth_cap??3)},
      sniper:{checks:sniperChecks,max:SNIPER_MAX_CHECKS},
      pattern_memory:true,
      portfolio_brain:{entry_cap:Math.max(1,Math.min(Number(burst.entry_cap??5),Number(profitabilityGovernor.entry_cap??4))),ranked:cands.length},
      profitability_governor:profitabilityGovernor,
      strategy_profitability:strategyProfitability,
      partials_planned:partials.length,
      agents:['Strategy Governor','Exit Intelligence','Partial Profit','Post-Trade Forensics','Execution Optimizer','Correlation Cluster','Contextual Bandit','Champion/Challenger','Entry Sniper','Portfolio Brain','Pattern Memory','Strategy Auction','Shadow Swarm','Burst Controller','Profit Capture AI']
    },
    liquidity_intel: {
      ts: Number(intelState?.ts ?? 0), bar: Number(intelState?.bar ?? 0),
      news_risk: Number(intelState?.news_risk ?? 0),
      top_pressure: Array.isArray(intelState?.top_pressure) ? intelState.top_pressure.slice(0,8) : [],
      headlines: Array.isArray(intelState?.headlines) ? intelState.headlines.slice(0,6) : [],
      sources: intelState?.sources ?? [], failed: intelState?.failed ?? [],
      bykaranteli: intelState?.bykaranteli ?? { status:'needs_key' },
      watched: Object.keys(intelState?.by_sym ?? {}).length,
      by_sym: Object.fromEntries(Object.entries(intelState?.by_sym ?? {}).filter(([,x]:any)=>now-Number(x?.ts ?? 0)<10*60_000).slice(0,30)),
      error: intelState?.error ?? null
    },
    quality_gates: {
      liq_stop_max_share: LIQ_STOP_MAX_SHARE, min_net_rr: MIN_NET_REWARD_RISK,
      symbol_cooldown_bars: SYMBOL_COOLDOWN_BARS, breadth_min_share: BREADTH_MIN_SHARE, paper_min_stop_to_cost: PAPER_MIN_STOP_TO_COST,
      soft_quality_min: SOFT_QUALITY_MIN, breadth_impulse_share: BREADTH_IMPULSE_SHARE,
      stop_engine:'V2', break_even_r:'adaptive', profit_lock:true, partial_profit:true, mfe_mae_learning:true, controlled_reentry:true, dynamic_targets:'1.6R-3.0R',
      autonomous_governor:true, contextual_bandit:true, execution_optimizer:true, correlation_cluster:true,
      entry_sniper:true, portfolio_brain:true, pattern_memory:true, strategy_auction:true, shadow_swarm:true, dynamic_burst:true, breadth_elite_top5:true, profit_capture_ai:true,
      profitability_first:true, no_forced_trading:true, negative_expectancy_quarantine:true,
      learning_scope:'ERA_ONLY', discovery_bootstrap_max_n:8, discovery_risk:'0.75%-1.0% before portfolio multiplier',
      opportunity_engines: ['RG_MR','RG_MOM','RG_TREND_PULLBACK','RG_LIQ_SQUEEZE','RG_BREADTH_MOMENTUM','RG_VOL_BREAKOUT'],
      profile: 'profitability_first_paper'
    },
    cost_model: { taker: CHAN.costs.taker, maker: CHAN.costs.maker, slippage: 'live order-book walk + symbol floor' },
    scan: { bar, done: [...done], skipped: scan0.skipped ?? 0, fetched: (scan0.fetched ?? 0) + heavy } }
  // Quotes are validated by the SQL ledger at commit time. Exit management runs before the
  // full market scan, so refresh "close-now" fills and partials here; tape-triggered STOP/TARGET/LIQ
  // keeps its historical trigger price, with trigger_ts retained in fill telemetry.
  const triggerReasons=new Set(['STOP','TARGET','LIQUIDATION'])
  await pool<any>(closes,5,async(x:any)=>{
    if(triggerReasons.has(String(x.reason))){x.quote_ts=Date.now();return}
    const t=open.find((z:any)=>z.id===x.id)
    if(!t)return
    try{
      const dir=t.side==='LONG'?1:-1,P=pairOf(t.sym),bk=await book(P)
      const top=dir>0?bk.bids[0][0]:bk.asks[0][0]
      const w=walkBook(dir>0?bk.bids:bk.asks,Number(t.entry_price)*Number(t.size))
      const imp=Math.max(Number.isFinite(w.impact)?w.impact:0,slipFor(t.sym))
      x.price=top*(1-dir*imp);x.quote_ts=bk.E
      x.fill={...(x.fill??{}),model:'book_walk_refresh',impact_bps:+(imp*1e4).toFixed(2),depth_usd:Math.round(w.depthUsd),beyond_book:w.beyond}
    }catch{x.quote_ts=Date.now()}
  })
  await pool<any>(partials,5,async(x:any)=>{
    const t=open.find((z:any)=>z.id===x.id)
    if(!t)return
    try{
      const dir=t.side==='LONG'?1:-1,P=pairOf(t.sym),bk=await book(P)
      const top=dir>0?bk.bids[0][0]:bk.asks[0][0]
      const w=walkBook(dir>0?bk.bids:bk.asks,Number(t.entry_price)*Number(x.qty))
      const imp=Math.max(Number.isFinite(w.impact)?w.impact:0,slipFor(t.sym))
      x.price=top*(1-dir*imp);x.quote_ts=bk.E
    }catch{x.quote_ts=Date.now()}
  })

  let partialResult:any=null
  if(partials.length){
    try {
      const {data}=await db.rpc('chan_apply_partials',{p_lease:lease,p_partials:partials}).throwOnError()
      partialResult=data
      ;(note as any).autonomous_lab.partials_applied=Number(data?.applied??0)
    } catch(e:any) {
      ;(note as any).autonomous_lab.partial_error=String(e?.message??e).slice(0,120)
    }
  }
  const { data: result } = await db.rpc('chan_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_marks: marks, p_updates: updates,
    p_note: note, p_bar: closeBar ? new Date(bar).toISOString() : null, p_halt: halt }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null,
      observed: { regime: d.regime, hurst: d.hurst, vol_pct: d.vol_pct, z: d.z, halflife: d.hl, t_sig: d.t_sig },
      inferred: {
        sleeve: 'CHAN',
        comp: d.comp,
        kelly_f: d.kelly_f ?? null,
        leverage: d.leverage ?? null,
        direction_crowding: d.crowd_side ? {
          side: d.crowd_side, count: d.crowd_count ?? null, share: d.crowd_share ?? null, rule: d.crowd_rule ?? null
        } : null,
        quality_gates: {
          learning_weight: d.learning_weight ?? null, learning_samples: d.learning_samples ?? null,
          breadth_share: d.breadth_share ?? null, breadth_n: d.breadth_n ?? null, majors_agree: d.majors_agree ?? null,
          cooldown_bars_left: d.cooldown_bars_left ?? null, recent_symbol_losses: d.recent_symbol_losses ?? null,
          liq_px: d.liq_px ?? null, stop_liq_share: d.stop_liq_share ?? d.liq_stop_share ?? null,
          net_rr: d.net_rr ?? null, min_net_rr: d.min_net_rr ?? null,
          reward_net: d.reward_net ?? null, loss_net: d.loss_net ?? null,
          gate_t: d.gate_t ?? null, gate_z: d.gate_z ?? null,
          intel_confidence: d.intel_confidence ?? null, funding: d.funding ?? null, oi_delta: d.oi_delta ?? null,
          taker_ratio: d.taker_ratio ?? null, long_squeeze: d.long_squeeze ?? null, short_squeeze: d.short_squeeze ?? null,
          leverage_against: d.leverage_against ?? null, leverage_aligned: d.leverage_aligned ?? null,
          news_risk: d.news_risk ?? null,
          quality_score: d.quality_score ?? null, quality_min: d.quality_min ?? null,
          soft_reasons: d.soft_reasons ?? null, micro_score: d.micro_score ?? null, mtf_side: d.mtf_side ?? null,
          target_r:d.target_r??null, strategy_size_mult:d.strategy_size_mult??null, liq_stop_max:d.liq_stop_max??null,
          reentry_bars_since:d.reentry_bars_since??null,
          governor_mode:d.governor_mode??null, governor_size_mult:d.governor_size_mult??null, bandit_weight:d.bandit_weight??null,
          cluster_mult:d.cluster_mult??null, auction_mult:d.auction_mult??null, burst_mult:d.burst_mult??null, burst_active:d.burst_active??null,
          pattern_state:d.pattern_state??null, pattern_n:d.pattern_n??null, pattern_avg_r:d.pattern_avg_r??null,
          profitability_mode:d.profitability_mode??null, strategy_profit_mode:d.strategy_profit_mode??null,
          strategy_avg_r:d.strategy_avg_r??null, strategy_recent_avg_r:d.strategy_recent_avg_r??null,
          sniper_score:d.sniper_score??null, sniper_cvd:d.sniper_cvd??null, sniper_imbalance:d.sniper_imbalance??null,
          execution_mult:d.execution_mult??null, execution_state:d.execution_state??null, execution_cost_r:d.execution_cost_r??null
        },
        committed: d.decision === 'accepted',
        approved_at: d.decision === 'accepted' ? new Date(now).toISOString() : null,
        approval_chain: d.decision === 'accepted' ? [
          { id: 'strategy', by: d.comp === 'RG_MR' ? 'Mean Reversion' : d.comp === 'RG_MOM' ? 'Momentum' : d.comp === 'RG_LIQ_SQUEEZE' ? 'Leverage / Liquidation Squeeze' : d.comp === 'RG_BREADTH_MOMENTUM' ? 'Breadth Momentum' : d.comp === 'RG_VOL_BREAKOUT' ? 'Volatility Breakout' : 'Trend Pullback', ok: true },
          { id: 'regime', by: 'Regime Router', ok: true, value: d.regime },
          { id: 'risk', by: 'Risk Engine', ok: true, risk_f: d.kelly_f ?? null, leverage: d.leverage ?? PAPER_LEVERAGE },
          { id: 'execution', by: 'Binance Book Check', ok: true },
          { id: 'ledger', by: 'CHAN SQL Ledger', ok: true }
        ] : [],
        note: 'Chan regime router, Phase-1 NO-GO, demo on the owner\'s instruction'
      } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note, risk_state: undefined, scan: undefined }
}
