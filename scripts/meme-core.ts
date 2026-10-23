// meme-core — one cycle of the "ממים חיים" PAPER desk, shared by the GitHub-Actions runner (scripts/meme-desk.ts) and the
// always-on server (server/meme-live/server.ts). PAPER ONLY: unsigned public GETs (pump.fun frontend API, DexScreener).
// Fill realism: every fill re-reads the coin `fillDelayMs` after the decision and fills against those reserves.
// Two data sources with one shape (pump.fun's coin object): `pumpSource` (pump.fun REST) and `feedSource` (the free
// PumpPortal + Solana RPC feed written by scripts/meme-feed.ts — used where pump.fun answers 403, e.g. GitHub runners).
import fs from 'node:fs'
import { MEME, buyTokens, sellSol, dexSellSol, entryCheck, runnerExit, progressOf, type Coin, type Curve } from '../shared/meme.ts'
import { bondingCurveOf, getCurves } from '../shared/solana.ts'

const PF = 'https://frontend-api-v3.pump.fun'
const j = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }); if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 80)}`); return r.json() }
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()
const SOLMINT = '11111111111111111111111111111111'

const valid = (x: any) => x && x.program === 'pump' && (x.quote_mint ?? SOLMINT) === SOLMINT && !x.is_banned && !x.nsfw && (x.transfer_fee_bps ?? 0) === 0
// the per-coin endpoint (coins-v2) omits `program` / `quote_mint`, so at fill time a missing field is not a failure:
// the coin already passed `valid` on the listing; only a field that is present and wrong rejects the fill
const validFill = (x: any) => !x.is_banned && !x.nsfw && (x.program == null || x.program === 'pump')
  && (x.quote_mint == null || x.quote_mint === SOLMINT) && (x.transfer_fee_bps ?? 0) === 0
const toCoin = (x: any): Coin => ({ mint: x.mint, symbol: x.symbol, created: x.created_timestamp, lastTrade: x.last_trade_timestamp ?? 0,
  mc: +x.market_cap, realSol: (+x.real_sol_reserves || 0) / 1e9, social: !!(x.twitter || x.telegram || x.website), ok: valid(x) && !x.complete })
const curveOf = (x: any): Curve => ({ vS: +x.virtual_sol_reserves, vT: +x.virtual_token_reserves, rT: +x.real_token_reserves })
const hasCurve = (x: any) => { const c = curveOf(x); return c.vS > 0 && c.vT > 0 && c.rT > 0 }
// coins-v2 (the per-coin read) carries no reserves, only market_cap in SOL (= vS * 1e6 / vT for 6-decimal tokens).
// The curve is constant product, so with k = vS * vT and rtOff = vT - rT taken from a full read (the listing) the
// reserves at any later market cap are exact: vS = sqrt(k * mc / 1e6), vT = sqrt(k * 1e6 / mc), rT = vT - rtOff.
const curveFromMc = (mc: number, k: number, rtOff: number): Curve | null => {
  if (!(mc > 0) || !(k > 0)) return null
  const vS = Math.sqrt(k * mc / 1e6), vT = Math.sqrt(k * 1e6 / mc)
  return { vS, vT, rT: Math.max(0, vT - rtOff) }
}
const readCurve = (x: any, k?: number, rtOff?: number): Curve | null =>
  hasCurve(x) ? curveOf(x) : (k && rtOff != null ? curveFromMc(+x.market_cap, k, rtOff) : null)
const solUsdOf = (x: any) => (+x.usd_market_cap > 0 && +x.market_cap > 0 ? +x.usd_market_cap / +x.market_cap : NaN)

export type Source = { name: string; list: () => Promise<{ coins: any[]; err: string[] }>; one: (mint: string) => Promise<any | null>; prefetch?: (mints: string[]) => Promise<void> }

export const pumpSource: Source = {
  name: 'pump.fun',
  async list() {
    const err: string[] = []
    const get = (u: string) => j(u).catch((e) => { err.push(String(e).slice(0, 90)); return [] })
    const [a, b] = await Promise.all([
      get(`${PF}/coins?offset=0&limit=100&sort=last_trade_timestamp&order=DESC&includeNsfw=false`),
      get(`${PF}/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false`),
    ])
    return { coins: [...a, ...b], err: err.length === 2 ? err : [] }
  },
  async one(mint) { try { return await j(`${PF}/coins-v2/${mint}`) } catch { return null } },
}

// the feed's coin -> pump.fun's coin shape (reserves in raw units, market cap in SOL = vS * 1e6 / vT)
function pumpShape(c: any, solUsd: number) {
  const mc = c.vT > 0 ? c.vS * 1e6 / c.vT : 0
  return { mint: c.mint, symbol: c.symbol, name: c.name, image_uri: c.image, created_timestamp: c.created, last_trade_timestamp: c.lastTrade,
    market_cap: mc, usd_market_cap: solUsd > 0 ? mc * solUsd : 0, virtual_sol_reserves: c.vS, virtual_token_reserves: c.vT,
    real_token_reserves: c.rT, real_sol_reserves: c.rS, program: c.pool === 'pump' ? 'pump' : c.pool, complete: !!c.complete,
    twitter: c.social ? 'yes' : null, creator: c.creator, dev_pct: c.dev ?? null, dev_init_pct: c.devInit ?? null }
}
export function feedSource(file: string, maxAgeMs = 20_000): Source {
  let last: any = null
  const cache = new Map<string, { at: number; x: any }>()
  const read = () => { try { last = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { last = null } return last }
  const meta = (mint: string) => last?.coins?.find((c: any) => c.mint === mint)
  async function curves(mints: string[]) {
    const res = await getCurves(mints.map(bondingCurveOf)), T = Date.now(), sol = last?.sol_usd ?? 0
    mints.forEach((m, i) => { const a = res[i]; if (!a) return; const f = meta(m) ?? {}
      cache.set(m, { at: T, x: pumpShape({ ...f, mint: m, pool: f.pool ?? 'pump', vS: a.vS, vT: a.vT, rT: a.rT, rS: a.rS, complete: a.complete }, sol) }) })
  }
  return {
    name: 'pumpportal+rpc',
    async list() {
      const f = read()
      if (!f) return { coins: [], err: ['feed file missing'] }
      if (Date.now() - f.at > maxAgeMs) return { coins: [], err: [`feed stale ${Math.round((Date.now() - f.at) / 1000)} s`] }
      const T = Date.now()
      return { coins: f.coins.filter((c: any) => T - c.lastTrade <= MEME.snapMaxS * 1000).map((c: any) => pumpShape(c, f.sol_usd)), err: [] }
    },
    async prefetch(mints) { if (mints.length) { read(); try { await curves(mints) } catch {} } },
    async one(mint) {
      const c = cache.get(mint); if (c && Date.now() - c.at < 1000) return c.x       // the decision read; fills re-read fresh
      try { read(); await curves([mint]); return cache.get(mint)?.x ?? null } catch { return null }
    },
  }
}
async function dex(mint: string) {
  try {
    const d: any = await j(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
    const p = (d.pairs ?? []).filter((p: any) => p.chainId === 'solana' && p.quoteToken?.symbol === 'SOL').sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    return p ? { px: +p.priceNative / 10 ** 6, quote: +p.liquidity?.quote || 0, dexId: p.dexId } : null   // per RAW token (6 decimals)
  } catch { return null }
}


export function freshState(): any {
  return { era: MEME.era, era_started: now(), start_cash: MEME.startCash, cash: MEME.startCash, rules: MEME, trades: [], equity: [], decisions: [], snaps: {}, next_id: 1, sol_usd: null }
}

// one cycle; `appendPaths(day, lines)` receives finished research paths
export async function cycle(st: any, appendPaths: (day: string, lines: string[]) => void, fillDelayMs = 2000, src: Source = pumpSource) {
const one = src.one
st.rules = MEME
const decisions: any[] = []
const note: any = { at: now() }

// value of an open position now (SOL), from the curve or, once graduated, from the DEX pool
async function markSol(t: any, tokens = t.tokens): Promise<{ sol: number; px: number; src: string; x?: any } | null> {
  const x = await one(t.mint); if (!x) return null
  if (+x.usd_market_cap > 0) st.sol_usd = solUsdOf(x) || st.sol_usd
  if (!x.complete) { const c = readCurve(x, t.k, t.rt_off); if (!c) return null; return { sol: Math.max(0, sellSol(c, tokens) - MEME.txFeeSol), px: c.vS / c.vT, src: 'curve', x } }
  const d = await dex(t.mint); if (!d) return { sol: 0, px: 0, src: 'graduated-no-pool', x }
  return { sol: Math.max(0, dexSellSol(d.px, d.quote, tokens) - MEME.txFeeSol), px: d.px, src: d.dexId, x }
}

try {
  // 1. manage open positions: decide on the current read, fill on a read ~2 s later
  const open = st.trades.filter((t: any) => t.status === 'OPEN')
  await src.prefetch?.(open.map((t: any) => t.mint))
  let openUsd = 0
  for (const t of open) {
    const m = await markSol(t); if (!m) { openUsd += (t.last_sol ?? 0) * (st.sol_usd ?? 0); continue }
    // v2 runner: rem = return of the tokens still held vs their share of the cost (part = 1, or 0.5 after the half sale)
    const part = t.part ?? 1, banked = t.banked_sol ?? 0, held = (Date.now() - Date.parse(t.opened_at)) / 60_000
    const rem = m.sol / (t.cost_sol * part) - 1
    t.peak = Math.max(t.peak ?? rem, rem)
    t.last_sol = m.sol; t.last_px = m.px; t.src = m.src; t.pnl_pct = (m.sol + banked) / t.cost_sol - 1; t.marked_at = now()
    if (m.x && (m.x.complete || +m.x.real_sol_reserves > 0)) t.progress = m.x.complete ? 1 : progressOf(+m.x.real_sol_reserves / 1e9)
    const why = runnerExit(rem, t.peak, held, part < 1)
    if (!why) { openUsd += m.sol * (st.sol_usd ?? 0); continue }
    await sleep(fillDelayMs)
    if (why === 'HALF') {                       // sell half into the curve/pool as it is now; the stake comes back
      const h = (await markSol(t, t.tokens / 2)) ?? null
      if (!h) { openUsd += m.sol * (st.sol_usd ?? 0); continue }
      const usd = h.sol * (st.sol_usd ?? 0)
      Object.assign(t, { tokens: t.tokens / 2, part: part / 2, banked_sol: banked + h.sol, banked_usd: (t.banked_usd ?? 0) + usd,
        half_at: now(), half_px: h.px, half_rem: h.sol / (t.cost_sol * part / 2) - 1, peak: 0 })
      st.cash += usd
      decisions.push({ ts: now(), mint: t.mint, symbol: t.symbol, decision: 'SELL', reason: 'HALF', usd })
      openUsd += Math.max(0, m.sol - h.sol) * (st.sol_usd ?? 0)
      continue
    }
    const f = (await markSol(t)) ?? m
    const usd = f.sol * (st.sol_usd ?? 0)
    Object.assign(t, { status: 'CLOSED', closed_at: now(), exit_sol: f.sol, exit_px: f.px, exit_src: f.src, exit_reason: why,
      exit_usd: usd, pnl: usd + (t.banked_usd ?? 0) - t.cost_usd, pnl_pct: (f.sol + banked) / t.cost_sol - 1, decided_pnl_pct: t.pnl_pct })
    st.cash += usd
    decisions.push({ ts: now(), mint: t.mint, symbol: t.symbol, decision: 'SELL', reason: why, pnl: t.pnl })
  }

  // 2. scan: coins traded in the last minutes (both new and active), keep a market-cap snapshot ring per mint
  // a failed listing is never silent: both down -> last_error says why (from 19:43 UTC 10-22 the runner got 0 coins
  // for hours while every cycle looked healthy, and open positions could not be marked either)
  const { coins: listed, err: feedErr } = await src.list()
  note.source = src.name
  if (feedErr.length) note.feed_error = feedErr
  const seen = new Map<string, any>(); for (const x of listed) if (x?.mint) seen.set(x.mint, x)
  const T = Date.now()
  for (const x of seen.values()) { const s = (st.snaps[x.mint] ??= []); s.push([T, +x.market_cap]); if (+x.usd_market_cap > 0) st.sol_usd = solUsdOf(x) || st.sol_usd }
  for (const [k, s] of Object.entries<any>(st.snaps)) { const f = s.filter((p: any) => T - p[0] <= MEME.snapMaxS * 1000); if (f.length) st.snaps[k] = f.slice(-30); else delete st.snaps[k] }
  note.scanned = seen.size

  // 2b. RESEARCH RECORDER (observation only): the market-cap path of every coin in its first PATH_MIN minutes, one point per
  // change (seconds since creation, mc in SOL, real SOL in the curve, graduated flag, creator's % of supply when the feed
  // knows it). Finished paths (coin older than
  // PATH_MIN) are appended to meme/paths-YYYY-MM-DD.jsonl for offline rule research. Coins absent from the listings had no
  // trade, so their price did not move.
  const PATH_MIN = 65, rec = (st.paths ??= {})
  for (const x of seen.values()) {
    if (!x?.created_timestamp || x.program !== 'pump') continue
    const age = (T - x.created_timestamp) / 1000; if (age > PATH_MIN * 60) continue
    const r = (rec[x.mint] ??= { m: x.mint, s: x.symbol, c: x.created_timestamp, cr: x.creator, so: !!(x.twitter || x.telegram || x.website), di: x.dev_init_pct ?? null, p: [] })
    const pt: any[] = [Math.round(age), +(+x.market_cap).toFixed(2), +((+x.real_sol_reserves || 0) / 1e9).toFixed(2), x.complete ? 1 : 0]
    if (x.dev_pct != null) pt.push(+(+x.dev_pct).toFixed(1))
    const last = r.p[r.p.length - 1]
    if (r.p.length < 400 && (!last || last[1] !== pt[1] || last[3] !== pt[3] || last[4] !== pt[4])) r.p.push(pt)
  }
  const done: string[] = []
  for (const [k, r] of Object.entries<any>(rec)) if (T - r.c > PATH_MIN * 60_000) { done.push(JSON.stringify(r)); delete rec[k] }
  if (done.length) appendPaths(new Date(T).toISOString().slice(0, 10), done)
  note.recording = Object.keys(rec).length; note.paths_done = done.length

  // 3. entries
  const held = new Set(st.trades.filter((t: any) => t.status === 'OPEN' || Date.now() - Date.parse(t.opened_at) < 6 * 3600_000).map((t: any) => t.mint))
  const equity0 = st.cash + openUsd
  const cands: any[] = []
  for (const x of seen.values()) {
    const c = toCoin(x)
    const past = (st.snaps[c.mint] ?? []).find((p: any) => T - p[0] >= MEME.snapMinS * 1000)?.[1]
    const chk = entryCheck(c, past, T)
    if (chk.ok && !held.has(c.mint)) cands.push({ c, chk })
    else if (chk.checks.filter((k) => k.ok).length >= 5 && !held.has(c.mint)) decisions.push({ ts: now(), mint: c.mint, symbol: c.symbol, decision: 'skip', reason: chk.checks.find((k) => !k.ok)!.k, checks: chk.checks })
  }
  cands.sort((p, q) => q.chk.rise - p.chk.rise)
  let room = MEME.maxOpen - st.trades.filter((t: any) => t.status === 'OPEN').length
  for (const { c, chk } of cands.slice(0, MEME.maxEntriesPerCycle)) {
    if (room <= 0) { decisions.push({ ts: now(), mint: c.mint, symbol: c.symbol, decision: 'skip', reason: `כבר ${MEME.maxOpen} פתוחות` }); continue }
    const usd = Math.min(equity0 * MEME.stakeFrac, st.cash); const solUsd = st.sol_usd
    if (!(solUsd > 0) || usd < 5) { decisions.push({ ts: now(), mint: c.mint, symbol: c.symbol, decision: 'skip', reason: 'אין מזומן / מחיר SOL' }); continue }
    await sleep(fillDelayMs)
    const x = await one(c.mint)
    if (!x || x.complete || !validFill(x)) { decisions.push({ ts: now(), mint: c.mint, symbol: c.symbol, decision: 'skip', reason: 'השתנה לפני המילוי' }); continue }
    // fill on the curve as it is AFTER the delay: the re-read's market cap applied to the listing's k (see curveFromMc)
    const ref = seen.get(c.mint), rc = ref && hasCurve(ref) ? curveOf(ref) : null
    const k = rc ? rc.vS * rc.vT : 0, rtOff = rc ? rc.vT - rc.rT : 0
    const curve = readCurve(x, k, rtOff)
    if (!curve) { decisions.push({ ts: now(), mint: c.mint, symbol: c.symbol, decision: 'skip', reason: 'אין נתוני עקומה למילוי' }); continue }
    const fillSrc = hasCurve(x) ? 'reread' : 'reread-mc'
    const sol = usd / solUsd, tokens = buyTokens(curve, sol - MEME.txFeeSol)
    if (!(tokens > 0)) { decisions.push({ ts: now(), mint: c.mint, symbol: c.symbol, decision: 'skip', reason: 'מילוי לא אפשרי בעקומה' }); continue }
    const seenPx = c.mc, fillMc = +x.market_cap > 0 ? +x.market_cap : c.mc
    const t = { id: st.next_id++, mint: c.mint, symbol: c.symbol, name: x.name, image: x.image_uri, status: 'OPEN', opened_at: now(),
      cost_usd: usd, cost_sol: sol, tokens, entry_px: (sol - MEME.txFeeSol) * 1e9 * (1 - MEME.curveFee) / tokens, entry_mc: fillMc, seen_mc: seenPx,
      delay_cost: fillMc / seenPx - 1, fill_src: fillSrc, k, rt_off: rtOff, progress: progressOf((+x.real_sol_reserves || +ref?.real_sol_reserves || 0) / 1e9), checks: chk.checks, sol_usd: solUsd }
    st.cash -= usd; st.trades.push(t); room--
    decisions.push({ ts: now(), mint: c.mint, symbol: c.symbol, decision: 'BUY', reason: `עלייה ${(chk.rise * 100).toFixed(0)}%`, usd })
  }

  // 4. equity
  const openNow = st.trades.filter((t: any) => t.status === 'OPEN')
  const ov = openNow.reduce((s: number, t: any) => s + (t.last_sol ?? t.cost_sol) * (st.sol_usd ?? t.sol_usd), 0)
  st.equity.push({ ts: now(), equity: st.cash + ov, cash: st.cash, open_value: ov, open_count: openNow.length })
  if (st.equity.length > 5000) st.equity = st.equity.filter((_: any, i: number) => i % 2 === 0)
  note.entries = decisions.filter((d) => d.decision === 'BUY').length; note.exits = decisions.filter((d) => d.decision === 'SELL').length
  st.last_error = feedErr.length ? `${src.name} feed down: ${feedErr[0]}` : null
} catch (e) { st.last_error = String(e).slice(0, 200) }
st.decisions = [...decisions, ...st.decisions].slice(0, 300)
st.last_note = note; st.cycle = now()
return note
}
