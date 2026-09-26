// v94.0 — LAB sleeve: trades ONLY what the research grid (backtest/lab.ts -> status/lab-latest.json) proved
// out-of-sample, plus small EXPLORE trades when no elite trade qualifies. Same paper book, same lease, 1x-margined.
//  - pool: the committed lab JSON, cached hourly in market_cache 'lab' (a missing/failed fetch = no new entries)
//  - exits every cycle from a live quote with the SAME state machine the backtest used (shared/lab.ts): stop,
//    target, breakeven / trail after +1R, timeout after `hold` bars; stops are ratcheted in the ledger
//  - entries at each bar close of a spec's timeframe (first third of the bar, <= 20 min): signal on the last
//    COMPLETED bar, regime gate, a live cost check (observed spread beyond the modelled slippage is charged
//    against the spec's OOS net expectancy), ranked by tier and OOS evidence, sized by risk at the stop
//  - controlled learning: each spec's own live closes can DEMOTE it (rollback) or promote an explore spec to
//    elite; the rule vocabulary and parameter ranges are fixed in code — nothing rewrites production code.
import * as S from '../../../shared/strategy.ts'
import { type Quote } from '../../../shared/scalp.ts'
import { labInd, labSignal, labGate, labOpen, labManage, labQuoteExit, labSize, labVerdict, slipFor, TF_MIN, type Spec, type LBar, type Pos, type Tf } from '../../../shared/lab.ts'
import { json, pool, quote, BINANCE_SYM } from './rota-runner.ts'
const g = () => globalThis as any
export const LAB_LIVE = { maxOpen: 8, maxSide: 5, maxExplore: 3, entryWindowMaxMs: 20 * 60_000, poolTtlMs: 3600_000, minExploreOosN: 20 }
export function labConfig() {
  const x = Number(g().__LAB_SHARE), lev = Number(g().__LAB_MAX_LEV)
  return { share: Number.isFinite(x) && x > 0 ? Math.min(0.6, Math.max(0.05, x)) : 0.25, maxLev: Number.isFinite(lev) && lev >= 1 ? Math.min(3, lev) : 1 }
}
const LAB_URL = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/main/status/lab-latest.json'
export interface PoolSpec { spec: Spec; tier: 'elite' | 'explore'; oos: { n: number; mean: number; t: number; pf: number } }
export async function labPool(db: any, now: number): Promise<{ specs: PoolSpec[]; ran_at: string | null; note: string }> {
  const { data: rows } = await db.from('market_cache').select('data,ts').eq('key', 'lab').throwOnError()
  const c = rows?.[0]
  if (c && now - Date.parse(c.ts) < LAB_LIVE.poolTtlMs) return c.data
  let out = { specs: [] as PoolSpec[], ran_at: null as string | null, note: 'lab not run yet' }
  try {
    const r = await fetch(LAB_URL, { signal: AbortSignal.timeout(6000) })
    if (r.ok) {
      const j = await r.json()
      const take = (a: any[], tier: 'elite' | 'explore') => (a ?? []).filter((x: any) => x?.spec?.id).map((x: any) => ({ spec: x.spec, tier, oos: { n: x.oos.n, mean: x.oos.mean, t: x.oos.t, pf: x.oos.pf } }))
      out = { specs: [...take(j.elite, 'elite'), ...take(j.explore, 'explore').filter((x: PoolSpec) => x.oos.n >= LAB_LIVE.minExploreOosN)], ran_at: j.ran_at ?? null, note: `lab ${j.ran_at ?? '?'}: elite ${j.elite?.length ?? 0}, explore ${j.explore?.length ?? 0}` }
    } else if (r.status !== 404) throw new Error(`lab HTTP ${r.status}`)
  } catch (e: any) { if (c) return c.data; out.note = `lab fetch failed: ${String(e?.message ?? e).slice(0, 60)}` }
  await db.from('market_cache').upsert({ key: 'lab', data: out, ts: new Date(now).toISOString() }).throwOnError()
  return out
}
const bsym = (sym: string) => BINANCE_SYM[sym] ?? { s: `${sym}USDT`, k: 1 }
const OKX_BAR: Record<Tf, string> = { '5m': '5m', '15m': '15m', '1h': '1H', '2h': '2H', '4h': '4H' }
// completed bars with the taker-buy column (Binance); OKX fallback has no taker data -> flow rules abstain
async function bars(sym: string, tf: Tf, now: number): Promise<LBar[]> {
  try {
    const { s, k } = bsym(sym); const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${tf}&limit=200`)
    const b = r.filter((x: any) => Number(x[6]) < now).map((x: any) => ({ t: +x[0], open: +x[1] / k, high: +x[2] / k, low: +x[3] / k, close: +x[4] / k, vol: +x[5] * k, tb: +x[9] * k }))
    if (b.length >= 150) return b
  } catch { /* fall through */ }
  const r = await json(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=${OKX_BAR[tf]}&limit=200`)
  if (r.code !== '0') throw new Error(`okx ${tf}`)
  return r.data.filter((x: any) => x[8] === '1').reverse().map((x: any) => ({ t: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4], vol: +x[5], tb: NaN }))
}
async function depthUsd(sym: string): Promise<number | null> {
  try { const { s, k } = bsym(sym); const d = await json(`https://fapi.binance.com/fapi/v1/depth?symbol=${s}&limit=20`)
    const mid = (+d.bids[0][0] + +d.asks[0][0]) / 2, lim = mid * 0.001
    const side = (a: any[]) => a.filter((x) => Math.abs(+x[0] - mid) <= lim).reduce((s2, x) => s2 + (+x[0] / k) * (+x[1] * k), 0)
    return Math.min(side(d.bids), side(d.asks)) } catch { return null }
}
const posOf = (t: any): Pos | null => { const m = t.scalp_meta?.lab; if (!m) return null
  return { side: t.side === 'LONG' ? 1 : -1, entry: Number(t.entry_price), stop: Number(m.stop), target: Number(m.target), r: Number(m.r), best: Number(m.best ?? t.entry_price), mg: m.mg, bars: 0, hold: Number(m.hold) } }

export async function runLab(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('LAB is paper-only; refusing live execution')
  const cfg = labConfig(), now = Date.now(), params = state.bot_params || {}
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || Number(t.lev) !== 1)) throw new Error('LAB requires a paper-only 1x book')
  const mine = open.filter((t: any) => t.strategy === 'LAB')
  const lp = await labPool(db, now)
  // ── controlled learning: live verdict per spec from its own closes (last 30 days) ──
  const labState = { demoted: { ...(params.lab_state?.demoted ?? {}) }, promoted: { ...(params.lab_state?.promoted ?? {}) } } as { demoted: Record<string, any>; promoted: Record<string, any> }
  const equity0 = Number(state.balance) + open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size), 0)
  const { data: closed } = await db.from('bot_trades').select('pnl,pnl_pct,scalp_meta,closed_at').eq('strategy', 'LAB').neq('status', 'OPEN').gte('closed_at', new Date(now - 30 * 864e5).toISOString()).order('closed_at').throwOnError()
  const bySpec = new Map<string, { pct: number[]; usd: number[] }>()
  for (const t of closed ?? []) { const id = t.scalp_meta?.lab?.spec; if (!id) continue; const x = bySpec.get(id) ?? bySpec.set(id, { pct: [], usd: [] }).get(id)!; x.pct.push(Number(t.pnl_pct) * 100); x.usd.push(Number(t.pnl)) }
  const learn: string[] = []
  for (const [id, x] of bySpec) {
    const v = labVerdict(x.pct, equity0, x.usd)
    if (v.action === 'demote' && !labState.demoted[id]) { labState.demoted[id] = { ts: new Date(now).toISOString(), why: v.why, n: x.pct.length }; learn.push(`ROLLBACK ${id}: ${v.why}`) }
    if (v.action === 'promote' && !labState.promoted[id] && !labState.demoted[id]) { labState.promoted[id] = { ts: new Date(now).toISOString(), why: v.why, n: x.pct.length }; learn.push(`PROMOTED ${id}: ${v.why}`) }
  }
  const active = lp.specs.filter((p) => !labState.demoted[p.spec.id]).map((p) => (labState.promoted[p.spec.id] && p.tier === 'explore' ? { ...p, tier: 'elite' as const } : p))
  // ── exits ──
  const q = new Map<string, Quote>()
  await pool<string>(mine.map((t: any) => String(t.sym)), 6, async (s) => { try { q.set(s, await quote(s)) } catch { /* no quote -> held */ } })
  const closes: any[] = [], updates: any[] = [], marks: Record<string, number> = {}
  for (const t of mine) {
    const qq = q.get(t.sym), p = posOf(t); if (!qq || !p) continue
    const mark = p.side > 0 ? qq.bid : qq.ask; marks[t.sym] = mark
    const barMs = TF_MIN[t.scalp_meta.lab.tf as Tf] * 60_000
    const why = labQuoteExit(p, mark, now - Date.parse(t.opened_at), barMs)
    if (why) { closes.push({ id: t.id, price: mark * (1 - p.side * slipFor(t.sym)), reason: why, quote_ts: qq.ts }); continue }
    const before = p.stop; labManage(p, mark)
    if (p.stop !== before || p.best !== Number(t.scalp_meta.lab.best ?? t.entry_price)) updates.push({ id: t.id, stop: p.stop, best: p.best })
  }
  // ── entries at bar closes ──
  const done: Record<string, number> = { ...(params.lab_bars ?? {}) }, due: Tf[] = []
  for (const tf of [...new Set(active.map((p) => p.spec.tf))] as Tf[]) {
    const barMs = TF_MIN[tf] * 60_000, bar = Math.floor(now / barMs) * barMs
    if (bar > (Number(done[tf]) || 0) && now - bar <= Math.min(barMs / 3, LAB_LIVE.entryWindowMaxMs) && !state.hard_halt_at) due.push(tf)
  }
  const entries: any[] = [], decisions: any[] = [], failed: string[] = []
  if (due.length) {
    const held = new Set(open.filter((t: any) => !closes.some((c) => c.id === t.id)).map((t: any) => String(t.sym)))
    const cands: { p: PoolSpec; sym: string; atr: number; ap: number; volReg: number }[] = []
    for (const tf of due) {
      const barMs = TF_MIN[tf] * 60_000, bar = Math.floor(now / barMs) * barMs
      const specs = active.filter((p) => p.spec.tf === tf)
      const data = new Map<string, LBar[]>()
      await pool([...S.CRYPTO_40], 8, async (sym) => { try { const b = await bars(sym, tf, now); if (b.length && b[b.length - 1].t + barMs === bar) data.set(sym, b); else failed.push(`${sym}@${tf}`) } catch { failed.push(`${sym}@${tf}`) } })
      const btc = data.get('BTC'); let btcUp: boolean | null = null
      if (btc) { const bi = labInd(btc), k = btc.length - 1; if (bi.ema50[k] > 0) btcUp = btc[k].close > bi.ema50[k] }
      for (const [sym, b] of data) {
        const I = labInd(b), i = b.length - 1
        for (const p of specs) if (labSignal(p.spec.rule, p.spec.side, b, I, i) && labGate(p.spec.gate, I, i, btcUp)) cands.push({ p, sym, atr: I.atr[i], ap: I.atrPct[i], volReg: I.volReg[i] })
      }
      done[tf] = bar
    }
    // rank: elite before explore, then OOS t, then OOS expectancy
    cands.sort((a, b) => (a.p.tier === b.p.tier ? 0 : a.p.tier === 'elite' ? -1 : 1) || b.p.oos.t - a.p.oos.t || b.p.oos.mean - a.p.oos.mean)
    let cash = Number(state.balance)
    const equity = equity0
    let labOpenN = mine.length - closes.length, exploreOpen = mine.filter((t: any) => t.scalp_meta?.lab?.tier === 'explore' && !closes.some((c) => c.id === t.id)).length
    const sideN = { LONG: mine.filter((t: any) => t.side === 'LONG').length, SHORT: mine.filter((t: any) => t.side === 'SHORT').length } as Record<string, number>
    let gross = open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size), 0)
    const eliteTaken = () => entries.some((e) => e.lab.tier === 'elite')
    for (const c of cands) {
      const side = c.p.spec.side > 0 ? 'LONG' : 'SHORT', rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym: c.sym, side, decision, reason, spec: c.p.spec.id, tier: c.p.tier, ...extra })
      if (c.p.tier === 'explore' && eliteTaken()) { rec('rejected', 'explore_elite_present'); continue }
      if (held.has(c.sym) || entries.some((e) => e.sym === c.sym)) { rec('rejected', 'coin_held'); continue }
      if (labOpenN >= LAB_LIVE.maxOpen) { rec('rejected', 'lab_full'); continue }
      if (sideN[side] >= LAB_LIVE.maxSide) { rec('rejected', 'side_cap'); continue }
      if (c.p.tier === 'explore' && exploreOpen >= LAB_LIVE.maxExplore) { rec('rejected', 'explore_cap'); continue }
      let qq: Quote; try { qq = await quote(c.sym) } catch { rec('rejected', 'no_quote'); continue }
      const mid = (qq.bid + qq.ask) / 2, halfSpreadBps = (qq.ask - qq.bid) / 2 / mid * 1e4, slipBps = slipFor(c.sym) * 1e4
      const expNetBps = c.p.oos.mean * 100, extraBps = Math.max(0, halfSpreadBps - slipBps) * 2, netBps = expNetBps - extraBps
      if (!(netBps > 0)) { rec('rejected', 'costs_exceed_edge', { gross_bps: expNetBps, cost_bps: extraBps, net_bps: netBps }); continue }
      const dir = c.p.spec.side, px = (dir > 0 ? qq.ask : qq.bid) * (1 + dir * slipFor(c.sym))
      const stopPct = c.p.spec.exit.sl * c.atr / px
      const dep = await depthUsd(c.sym)
      const sameSide = open.filter((t: any) => t.side === side).length + entries.filter((e) => e.side === side).length
      const sz = labSize({ equity, cash, tier: c.p.tier, stopPct, oosT: c.p.oos.t, volReg: c.volReg, depthUsd: dep, corrLoad: sameSide / 4, grossUsed: gross, slots: LAB_LIVE.maxOpen, maxLev: cfg.maxLev })
      if (sz.notional < 20) { rec('rejected', `size_${sz.why}`, { notional: sz.notional }); continue }
      const p = labOpen(dir, px, c.atr, c.p.spec.exit)
      entries.push({ sym: c.sym, side, price: px, notional: sz.notional, quote_ts: qq.ts, source: qq.source,
        lab: { spec: c.p.spec.id, version: c.p.spec.version, tier: c.p.tier, tf: c.p.spec.tf, stop: p.stop, target: p.target, r: p.r, best: px, mg: p.mg, hold: p.hold,
          risk_usd: sz.risk, lev_eff: +sz.lev.toFixed(2), size_why: sz.why, exp_net_bps: +netBps.toFixed(2), oos: c.p.oos, spread_bps: +(halfSpreadBps * 2).toFixed(2), depth_usd_10bps: dep, corr_load_inferred: sameSide / 4 } })
      rec('accepted', 'taken', { gross_bps: expNetBps, cost_bps: extraBps, net_bps: netBps, notional: sz.notional })
      cash -= sz.notional * 1.0005; gross += sz.notional; labOpenN++; sideN[side]++; if (c.p.tier === 'explore') exploreOpen++
    }
  }
  if (!closes.length && !entries.length && !updates.length && !due.length && !learn.length) return { changed: false, open: mine.length, pool: lp.note }
  const note = { pool: lp.note, active: active.length, elite: active.filter((p) => p.tier === 'elite').length, due, failed: failed.slice(0, 20), learn, candidates: decisions.length }
  const { data: result } = await db.rpc('lab_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_updates: updates, p_marks: marks, p_share: cfg.share, p_note: note, p_bars: done, p_state: labState }).throwOnError()
  if (decisions.length) {
    const rows = decisions.slice(0, 200).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, gross_bps: d.gross_bps ?? null, cost_bps: d.cost_bps ?? null, net_bps: d.net_bps ?? null, notional: d.notional ?? null,
      inferred: { sleeve: 'LAB', spec: d.spec, tier: d.tier, note: 'gross = the spec OOS net expectancy; cost = observed spread beyond the modelled slippage' } }))
    try { await db.from('trade_decisions').insert(rows) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note }
}
