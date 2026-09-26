// v95.0 — FAST sleeve runner (see shared/fast.ts for the rule). Every cycle: exits for open FAST rows from a live
// quote; once per 5m bar (first 2 minutes after the close): scan every pair in the dynamic universe (market_cache
// 'universe', pinned 40 as fallback), rank the signals, enter the strongest within the 5-open / 20-per-day limits.
// Books through `fast_commit_cycle` (paper 1x; caps enforced again in SQL). Decisions go to trade_decisions.
import * as S from '../../../shared/strategy.ts'
import { FAST, fastSignal, fastLevels, fastExit, fastLiq } from '../../../shared/fast.ts'
import { labInd, slipFor, type LBar } from '../../../shared/lab.ts'
import { json, pool } from './rota-runner.ts'
type Pair = { sym: string; s: string; k: number }
const g = () => globalThis as any
export function fastConfig() { const x = Number(g().__FAST_SHARE), l = Number(g().__FAST_LEV)
  return { share: Number.isFinite(x) && x > 0 ? Math.min(1, Math.max(0.05, x)) : 1, lev: Number.isFinite(l) && l >= 1 ? Math.min(FAST.levMax, Math.floor(l)) : FAST.levDefault } }
async function universe(db: any): Promise<Pair[]> {
  try {
    const { data } = await db.from('market_cache').select('data').eq('key', 'universe').throwOnError()
    const p = data?.[0]?.data?.pairs
    if (Array.isArray(p) && p.length >= 20) return p.map((x: any) => ({ sym: String(x.sym), s: String(x.s), k: Number(x.k) || 1 }))
  } catch { /* fallback */ }
  return S.CRYPTO_40.map((c) => (c === 'PEPE' ? { sym: 'PEPE', s: '1000PEPEUSDT', k: 1000 } : { sym: c, s: `${c}USDT`, k: 1 }))
}
async function bars5m(p: Pair, now: number): Promise<LBar[]> {
  const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=5m&limit=80`)
  return r.filter((x: any) => Number(x[6]) < now).map((x: any) => ({ t: +x[0], open: +x[1] / p.k, high: +x[2] / p.k, low: +x[3] / p.k, close: +x[4] / p.k, vol: +x[5] * p.k, tb: +x[9] * p.k }))
}
async function quoteP(p: Pair) {
  const d = await json(`https://fapi.binance.com/fapi/v1/depth?symbol=${p.s}&limit=5`)
  const q = { bid: +d.bids[0][0] / p.k, ask: +d.asks[0][0] / p.k, ts: +d.E, source: 'binance-futures' }
  if (!(q.bid > 0 && q.ask >= q.bid) || Math.abs(Date.now() - q.ts) > 15_000) throw new Error(`bad quote ${p.sym}`)
  return q
}
export async function runFast(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('FAST is paper-only; refusing live execution')
  const cfg = fastConfig(), now = Date.now(), params = state.bot_params || {}
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || (t.strategy !== 'FAST' && Number(t.lev) !== 1))) throw new Error('FAST requires a paper-only book (only FAST rows may be leveraged)')
  const mine = open.filter((t: any) => t.strategy === 'FAST')
  const pairs = await universe(db), byS = new Map(pairs.map((p) => [p.sym, p]))
  const pairOf = (sym: string): Pair => byS.get(sym) ?? { sym, s: `${sym}USDT`, k: 1 }
  // exits
  const closes: any[] = [], marks: Record<string, number> = {}
  await pool<any>(mine, 6, async (t) => {
    try {
      const q = await quoteP(pairOf(t.sym)), dir = t.side === 'LONG' ? 1 : -1, m = t.scalp_meta?.fast
      const mark = dir > 0 ? q.bid : q.ask; marks[t.sym] = mark
      const lev = Math.max(1, Number(t.lev) || 1), liq = fastLiq(dir as 1 | -1, Number(t.entry_price), lev)
      const why = m ? fastExit(dir as 1 | -1, Number(m.stop), Number(m.target), mark, now - Date.parse(t.opened_at), liq) : null
      // a liquidation settles at the liquidation price (the exchange takes the whole isolated margin), not at the mark
      if (why) closes.push({ id: t.id, price: why === 'LIQUIDATION' ? liq : mark * (1 - dir * slipFor(t.sym)), reason: why, quote_ts: q.ts })
    } catch { /* no quote: held until the next cycle */ }
  })
  // entries: once per completed 5m bar
  const bar = Math.floor(now / FAST.barMs) * FAST.barMs, done = Number(params.fast_bar) || 0
  const due = bar > done && now - bar <= FAST.entryWindowMs && !state.hard_halt_at
  if (!due && !closes.length) return { changed: false, open: mine.length }
  const entries: any[] = [], decisions: any[] = [], failed: string[] = []
  let scanned = 0
  if (due) {
    const data = new Map<string, LBar[]>()
    await pool(pairs, 10, async (p) => { try { const b = await bars5m(p, now); if (b.length && b[b.length - 1].t + FAST.barMs === bar) data.set(p.sym, b); else failed.push(p.sym) } catch { failed.push(p.sym) } })
    scanned = data.size
    const btc = data.get('BTC'); let btcUp: boolean | null = null
    if (btc) { const bi = labInd(btc), k = btc.length - 1; if (bi.ema20[k] > 0) btcUp = btc[k].close > bi.ema20[k] }
    const sigs: { sym: string; sig: NonNullable<ReturnType<typeof fastSignal>> }[] = []
    for (const [sym, b] of data) { const sg = fastSignal(b, btcUp, sym === 'BTC'); if (sg) sigs.push({ sym, sig: sg }) }
    sigs.sort((a, b) => b.sig.strength - a.sig.strength)
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
    const { count: today } = await db.from('bot_trades').select('id', { count: 'exact', head: true }).eq('strategy', 'FAST').gte('opened_at', dayStart.toISOString())
    let openN = mine.length - closes.length, dayN = Number(today) || 0
    let cash = Number(state.balance)
    const equity = cash + open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1), 0)   // margin, not notional
    const held = new Set(open.filter((t: any) => !closes.some((c) => c.id === t.id)).map((t: any) => String(t.sym)))
    for (const { sym, sig } of sigs) {
      const side = sig.dir > 0 ? 'LONG' : 'SHORT', rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym, side, decision, reason, z: sig.z, volRatio: sig.volRatio, imb: sig.imb, ...extra })
      if (held.has(sym)) { rec('rejected', 'coin_held'); continue }
      if (openN >= FAST.maxOpen) { rec('rejected', 'fast_full'); continue }
      if (dayN >= FAST.maxPerDay) { rec('rejected', 'daily_cap_20'); continue }
      let q: any; try { q = await quoteP(pairOf(sym)) } catch { rec('rejected', 'no_quote'); continue }
      const px = (sig.dir > 0 ? q.ask : q.bid) * (1 + sig.dir * slipFor(sym))
      const lv = fastLevels(sig.dir, px, sig.atr)
      const margin = Math.min(equity * FAST.perTrade * cfg.share, cash / (1 + cfg.lev * 0.0005)), notional = margin * cfg.lev
      if (margin < 5) { rec('rejected', 'no_cash'); continue }
      entries.push({ sym, side, price: px, notional, lev: cfg.lev, quote_ts: q.ts, source: q.source,
        fast: { stop: lv.stop, target: lv.target, r: lv.r, stop_pct: lv.r / px, lev: cfg.lev, margin, liq: fastLiq(sig.dir, px, cfg.lev), hold_min: FAST.holdBars * 5, z: +sig.z.toFixed(2), vol_ratio: +sig.volRatio.toFixed(2), imb: +sig.imb.toFixed(3), btc_up: btcUp, spread_bps: +((q.ask - q.bid) / ((q.ask + q.bid) / 2) * 1e4).toFixed(2), bar: new Date(bar).toISOString() } })
      rec('accepted', 'taken', { notional })
      held.add(sym); openN++; dayN++; cash -= margin + notional * 0.0005
    }
  }
  const note = { bar: new Date(bar).toISOString(), due, scanned, universe: pairs.length, failed: failed.length, signals: decisions.length, opened: entries.length, closed: closes.length }
  const { data: result } = await db.rpc('fast_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_marks: marks, p_share: cfg.share, p_note: note, p_bar: due ? new Date(bar).toISOString() : null }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null, score: +(Math.abs(d.z) * d.volRatio).toFixed(3),
      observed: { z3: d.z, vol_ratio: d.volRatio, taker_imbalance_3: d.imb }, inferred: { sleeve: 'FAST', note: 'owner all-in intraday rule, not validated' } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note }
}
