// pmc-desk — "פולי מטבעות": Polymarket PAPER desk for the short crypto Up/Down markets (5m / 15m / 4h). Runs on GitHub
// Actions (.github/workflows/pmc-desk.yml) every ~10 s; state = one JSON file on the `pm-desk-data` branch (pmc/state.json),
// read by trading-app polycoins.html. PAPER ONLY: unsigned public GETs to Polymarket Gamma / CLOB, never an order.
// Run: node --experimental-strip-types scripts/pmc-desk.ts <state.json>
import fs from 'node:fs'
import { takerFee, walkAsks, heOutcome, type FeeSchedule } from '../shared/pm.ts'
import { clvMark, clvStudy } from '../shared/clv.ts'
import { PMC, pmcStake, pmcPxCap, pmcZ, sigmaOf, TF_SEC, windowOf, slugOf, inWindow, inBandR, questionHe, zMinOf } from '../shared/pmc.ts'

const FILE = process.argv[2] ?? 'pmc/state.json'
const GAMMA = 'https://gamma-api.polymarket.com', CLOB = 'https://clob.polymarket.com'
const j = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0' } }); if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 90)}`); return r.json() }
const arr = (x: unknown): any[] => { try { return Array.isArray(x) ? x : JSON.parse(String(x)) } catch { return [] } }
type Lvl = { price: number; size: number }
async function book(token: string): Promise<{ bids: Lvl[]; asks: Lvl[] } | null> {
  try {
    const b = await j(`${CLOB}/book?token_id=${token}`)
    const m = (l: any[]) => (l ?? []).map((x) => ({ price: +x.price, size: +x.size })).filter((x) => x.price > 0 && x.size > 0)
    return { bids: m(b.bids).sort((a, c) => c.price - a.price), asks: m(b.asks).sort((a, c) => a.price - c.price) }
  } catch { return null }
}
// Binance spot 1 s klines (public market-data host, reachable from the runners). Open at the window start, last close, and
// the last hour of closes for sigma -> z (PMC.zMin). Any failure -> null -> no entry (never trade blind).
const BIN = 'https://data-api.binance.vision/api/v3/klines'
async function spotZ(coin: string, start: number, nowS: number, leftS: number) {
  try {
    const sym = coin.toUpperCase() + 'USDT', end = nowS * 1000
    const pages = await Promise.all([3, 2, 1, 0].map((k) => j(`${BIN}?symbol=${sym}&interval=1s&endTime=${end - k * 1000_000}&limit=1000`)))
    const ks = new Map<number, number>()
    for (const pg of pages) for (const k of pg as any[]) ks.set(Math.floor(k[0] / 1000), +k[4])
    const ts = [...ks.keys()].sort((a, b) => a - b).filter((t) => t > nowS - 3601)
    const closes = ts.map((t) => ks.get(t)!)
    const o = await j(`${BIN}?symbol=${sym}&interval=1s&startTime=${start * 1000}&limit=1`)
    const open = +(o?.[0]?.[1] ?? 0), last = closes[closes.length - 1], sigma = sigmaOf(closes)
    const z = pmcZ(open, last, sigma, leftS)
    return Number.isFinite(z) ? { z, open, last, sigma } : null
  } catch { return null }
}
const feeOf = (m: any): FeeSchedule | null => (m.feesEnabled && m.feeSchedule ? { rate: +m.feeSchedule.rate || 0, exponent: +m.feeSchedule.exponent || 1 } : null)

const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
  : { start_cash: 1000, cash: 1000, strategy: PMC, last_scan: null, last_note: null, trades: [], equity: [], decisions: [], next_id: 1 }
const now = () => new Date().toISOString()
const note: any = { at: now() }
let settled = 0, entered = 0, openValue = 0
const decisions: any[] = []
try {
  // 1. settle resolved markets (Gamma outcomePrices 1/0), mark the rest at the real best bid
  const open0 = st.trades.filter((t: any) => t.status === 'OPEN')
  st.shadow ??= []
  const sh0 = st.shadow.filter((x: any) => x.status !== 'DONE' && Date.parse(x.end_time) <= Date.now())
  const res: Record<string, any> = {}
  const ids = [...new Set([...open0.map((t: any) => t.market_id), ...sh0.map((x: any) => x.market_id)])]
  if (ids.length) for (const m of await j(`${GAMMA}/markets?closed=true&limit=50&${ids.map((id) => `id=${id}`).join('&')}`)) res[m.id] = m
  // 1b. SHADOW MAKER (observation only, never touches cash): a virtual post-only BID at the real best bid, placed at the same
  // moment the live rule buys at the ask. It counts as filled once the real best ask comes down to our price before the end
  // (someone sold through it); maker pays no fee on these markets (takerOnly). Settled at the official result per $1 staked.
  for (const x of sh0) {
    const m = res[x.market_id]; if (!m) continue
    const toks = arr(m.clobTokenIds), px = arr(m.outcomePrices).map(Number), k = toks.indexOf(x.token_id)
    if (k < 0 || !(px[k] === 1 || px[k] === 0)) continue
    x.won = px[k] === 1; x.status = 'DONE'
    x.ret = x.filled ? (px[k] - x.limit) / x.limit : null
  }
  for (const x of st.shadow.filter((x: any) => x.status === 'WORKING' && !x.filled && Date.parse(x.end_time) > Date.now())) {
    const b = await book(x.token_id); const a = b?.asks[0]?.price
    if (a != null && a <= x.limit) { x.filled = true; x.filled_at = now(); x.left_at_fill = Math.round((Date.parse(x.end_time) - Date.now()) / 1000) }
  }
  for (const t of open0) {
    const m = res[t.market_id]
    if (m) {
      const toks = arr(m.clobTokenIds), px = arr(m.outcomePrices).map(Number), k = toks.indexOf(t.token_id)
      if (k >= 0 && (px[k] === 1 || px[k] === 0)) {
        Object.assign(t, { status: 'CLOSED', exit_px: px[k], exit_fee: 0, proceeds: t.qty * px[k], pnl: t.qty * px[k] - t.cost, reason: px[k] === 1 ? 'RESOLVED_WIN' : 'RESOLVED_LOSS', closed_at: now(), mark_px: px[k], mark_at: now() })
        st.cash += t.qty * px[k]; settled++; continue
      }
    }
    const b = await book(t.token_id)
    if (b?.bids[0]) { t.mark_px = b.bids[0].price; t.mark_at = now() }
    clvMark(t, b?.bids[0]?.price, b?.asks[0]?.price, Date.now())
    openValue += t.qty * t.mark_px
    // SHADOW LATE EXIT (owner 2026-10-14: "cut the loss in the last 15-30 s?"). Observation only, never touches cash: once at
    // <= 30 s and once at <= 15 s before the end, what would selling the WHOLE position into the real bid book have paid
    // (book walk, taker fee; shares the book cannot absorb count as $0), and where was spot vs the window's open (z)?
    // Settled trades compare the actual result with each exit rule in st.study.late_exit.
    const leftS = Math.round((Date.parse(t.end_time) - Date.now()) / 1000)
    for (const [key, lim] of [['x30', 30], ['x15', 15]] as const) {
      if (leftS > lim || leftS <= 0 || t.meta?.[key] || !b) continue
      let need = t.qty, got = 0
      for (const l of b.bids) { if (need <= 1e-9) break; const q = Math.min(l.size, need); got += q * l.price; need -= q }
      const sold = t.qty - need, vw = sold > 0 ? got / sold : 0
      const fee = takerFee(sold, vw, t.meta?.fee_schedule ?? null)
      const start = Date.parse(t.end_time) / 1000 - (t.meta?.window_s ?? 300)
      const sz = t.meta?.coin ? await spotZ(t.meta.coin, start, Math.floor(Date.now() / 1000), leftS) : null
      t.meta = { ...t.meta, [key]: { at: now(), left_s: leftS, bid: b.bids[0]?.price ?? 0, proceeds: got - fee, unfilled: need,
        z: sz ? (t.outcome === 'Up' ? 1 : -1) * sz.z : null } }
    }
  }
  // 2. entries: for every rule, the current window of each coin; inside the entry window, buy the side whose real ask is in band
  const equity0 = st.cash + openValue
  const nowS = Math.floor(Date.now() / 1000)
  const want: { r: any; coin: string; slug: string; start: number }[] = []
  for (const r of PMC.rules) {
    const w = windowOf(r.tf, nowS)
    if (!inWindow(r, w.left)) continue
    for (const coin of r.coins) want.push({ r, coin, slug: slugOf(coin, r.tf, w.start), start: w.start })
  }
  note.windows = want.length
  if (want.length) {
    const ms: any[] = await j(`${GAMMA}/markets?limit=50&${want.map((x) => `slug=${x.slug}`).join('&')}`)
    const bySlug = new Map(ms.map((m) => [m.slug, m]))
    const held = new Set(st.trades.map((t: any) => t.slug))   // one entry per market, ever
    // find every in-band side this cycle first (rule order = coin priority), then apply the v2 protection below.
    const cands: { x: any; m: any; k: number; b: { bids: Lvl[]; asks: Lvl[] }; ask: number }[] = []
    for (const x of want) {
      const m = bySlug.get(x.slug)
      if (!m || held.has(x.slug) || m.closed || !m.acceptingOrders) continue
      const toks = arr(m.clobTokenIds)
      for (let k = 0; k < 2; k++) {
        const b = await book(toks[k]); const ask = b?.asks[0]?.price
        if (b && ask && inBandR(x.r, ask)) {
          cands.push({ x, m, k, b, ask })
          const bid = b.bids[0]?.price
          if (bid && bid >= x.r.lo && !st.shadow.some((y: any) => y.slug === x.slug))
            st.shadow.push({ slug: x.slug, market_id: m.id, token_id: toks[k], coin: x.coin, outcome: arr(m.outcomes)[k], end_time: m.endDate, placed_at: now(), limit: bid, taker_ask: ask, status: 'WORKING', filled: false })
          break
        }
      }
    }
    // v2 PROTECTION: one position per window (the coins move together), stake = min(3% equity, (equity - floor) / 3).
    st.peak = Math.max(st.peak ?? st.start_cash, equity0)
    const { stake: stake0, floor } = pmcStake(equity0, st.peak, st.start_cash)
    st.floor = floor
    for (const { x, m, k, b, ask } of cands) {
      const toks = arr(m.clobTokenIds), outs = arr(m.outcomes)
      const D = (decision: string, reason: string, price = ask) => decisions.push({ ts: now(), market_id: m.id, question: m.question, question_he: questionHe(x.coin, x.r.tf, x.start), outcome: outs[k], outcome_he: heOutcome(outs[k]), price, decision, reason })
      if (st.trades.filter((t: any) => t.status === 'OPEN').length >= PMC.maxOpen) { D('skip', 'מקסימום פוזיציות פתוחות'); break }
      const inWin = st.trades.filter((t: any) => t.end_time === m.endDate).length
      if (inWin >= PMC.maxPerWindow) { D('skip', 'הגנה: כבר יש פוזיציה בחלון הזה (המטבעות זזים יחד)'); continue }
      const leftNow = x.start + TF_SEC[x.r.tf as keyof typeof TF_SEC] - nowS
      const sz = await spotZ(x.coin, x.start, nowS, leftNow)
      if (!sz) { D('skip', 'אין נתוני מחיר מבינאנס — לא נכנסים בעיוורון'); continue }
      const zFav = (outs[k] === 'Up' ? 1 : -1) * sz.z
      const zMin = zMinOf(x.r)
      if (zFav < zMin) { D('skip', `מסנן מרחק: ${zFav.toFixed(2)} < ${zMin}${x.r.zMin ? ' (הסתכלות שנייה)' : ''} (המחיר קרוב מדי לקו הפתיחה)`); continue }
      const stake = Math.min(stake0, st.cash - 1)
      if (stake < PMC.minQty * ask) { D('skip', stake0 < PMC.minQty * ask ? `הגנה: החשבון ברצפה המוגנת ($${floor.toFixed(0)})` : 'אין מספיק מזומן'); continue }
      const fs_ = feeOf(m)
      let ref: number | null = null   // the research assumed: last traded price + 1c. Enforced as a price cap (pmcPxCap).
      try { ref = +(await j(`${CLOB}/last-trade-price?token_id=${toks[k]}`)).price || null } catch { /* unknown */ }
      const cap = pmcPxCap(x.r.hi, ref)
      if (ask > cap) { D('skip', `יקר מדי: המחיר ${ask} מעל העסקה האחרונה ${ref} + 1¢ (ספר דל)`); continue }
      const fill = walkAsks(b.asks, stake / (1 + (fs_ ? fs_.rate * (1 - ask) : 0)), cap)   // fee / notional = rate x (1 - p)
      if (fill.qty < PMC.minQty) { D('skip', 'ספר הזמנות דל מדי'); continue }
      const fee = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + fee, mk = b.bids[0]?.price ?? fill.vwap
      const left = x.start + TF_SEC[x.r.tf as keyof typeof TF_SEC] - nowS
      st.trades.push({ id: st.next_id++, market_id: m.id, slug: m.slug, event_slug: m.slug, question: m.question, question_he: questionHe(x.coin, x.r.tf, x.start), outcome: outs[k], outcome_he: heOutcome(outs[k]), token_id: toks[k], end_time: m.endDate, qty: fill.qty, entry_px: fill.vwap, entry_fee: fee, cost, best_ask: ask, opened_at: now(), status: 'OPEN', mark_px: mk, mark_at: now(), meta: { fee_schedule: fs_, volume: m.volumeNum, coin: x.coin, tf: x.r.tf, window_s: TF_SEC[x.r.tf as keyof typeof TF_SEC], left_s: left, band: [x.r.lo, x.r.hi], z_min: zMin, look: PMC.rules.indexOf(x.r) + 1, outcomes: outs, wanted: stake, ref_px: ref, bid_px: b.bids[0]?.price ?? null, z: zFav, spot_open: sz.open, spot: sz.last, sigma1s: sz.sigma } })
      st.cash -= cost; openValue += fill.qty * mk; entered++; held.add(x.slug)
      D('BUY', `${left} שנ׳ לסיום, מחיר ${ask} בטווח ${Math.round(x.r.lo * 100)}-${Math.round(x.r.hi * 100)}¢, ${fill.qty.toFixed(1)} מניות ($${cost.toFixed(0)}${cost < stake * 0.9 ? `, הספר הספיק רק ל־$${cost.toFixed(0)} מתוך $${stake.toFixed(0)}` : ''}), עמלה $${fee.toFixed(2)}`, fill.vwap)
    }
  }
} catch (e) { note.error = String(e).slice(0, 200) }
const openCount = st.trades.filter((t: any) => t.status === 'OPEN').length
st.strategy = PMC; st.last_scan = now(); st.last_note = { ...note, settled, entered }
const last = st.equity[st.equity.length - 1]
if (!last || Date.now() - Date.parse(last.ts) > 55_000 || settled || entered)
  st.equity.push({ ts: now(), equity: st.cash + openValue, cash: st.cash, open_value: openValue, open_count: openCount })
if (st.equity.length > 5000) st.equity = st.equity.slice(-5000)
if (st.trades.length > 3000) st.trades = [...st.trades.filter((t: any) => t.status === 'OPEN'), ...st.trades.filter((t: any) => t.status !== 'OPEN').slice(-2500)].sort((a: any, b: any) => a.id - b.id)
st.decisions = [...decisions, ...st.decisions].slice(0, 200)
if (st.shadow.length > 3000) st.shadow = st.shadow.slice(-3000)
{
  // fill quality: what the live desk actually paid vs what the research assumed (last trade + 1c)
  const f = st.trades.filter((t: any) => t.meta?.ref_px > 0)
  const done = st.shadow.filter((x: any) => x.status === 'DONE'), filled = done.filter((x: any) => x.filled)
  const tk = st.trades.filter((t: any) => t.status === 'CLOSED')
  st.study = {
    fills: { n: f.length, avg_vs_ref_c: f.length ? 100 * f.reduce((a: number, t: any) => a + t.entry_px - t.meta.ref_px, 0) / f.length : null,
      avg_vs_research_c: f.length ? 100 * f.reduce((a: number, t: any) => a + t.entry_px - (t.meta.ref_px + 0.01), 0) / f.length : null,
      avg_fee_c: f.length ? 100 * f.reduce((a: number, t: any) => a + t.entry_fee / t.qty, 0) / f.length : null },
    maker: { placed: st.shadow.length, resolved: done.length, filled: filled.length,
      fill_rate: done.length ? filled.length / done.length : null,
      wr: filled.length ? filled.filter((x: any) => x.won).length / filled.length : null,
      ret: filled.length ? filled.reduce((a: number, x: any) => a + x.ret, 0) / filled.length : null,
      missed_wins: done.filter((x: any) => !x.filled && x.won).length, missed_losses: done.filter((x: any) => !x.filled && !x.won).length },
    late_exit: lateExit(tk),
    taker: { n: tk.length, wr: tk.length ? tk.filter((t: any) => t.pnl > 0).length / tk.length : null, ret: tk.length ? tk.reduce((a: number, t: any) => a + t.pnl / t.cost, 0) / tk.length : null },
  }
}
// SHADOW LATE EXIT summary: for each rule, the actual result of the trades it would have sold vs what selling would have paid.
function lateExit(tk: any[]) {
  const rules: [string, (x: any) => boolean][] = [
    ['always', () => true], ['bid<0.90', (x) => x.bid < 0.9], ['bid<0.80', (x) => x.bid < 0.8], ['bid<0.70', (x) => x.bid < 0.7],
    ['bid<0.50', (x) => x.bid < 0.5], ['z<0', (x) => x.z != null && x.z < 0], ['z<0.5', (x) => x.z != null && x.z < 0.5]]
  const out: any = {}
  for (const key of ['x30', 'x15']) {
    const ts = tk.filter((t) => t.meta?.[key])
    out[key] = { n: ts.length, rules: rules.map(([name, f]) => {
      const sel = ts.filter((t) => f(t.meta[key]))
      const actual = sel.reduce((a, t) => a + t.pnl, 0), shadow = sel.reduce((a, t) => a + t.meta[key].proceeds - t.cost, 0)
      return { rule: name, sold: sel.length, wins_cut: sel.filter((t) => t.pnl > 0).length, losses_cut: sel.filter((t) => t.pnl <= 0).length,
        actual_usd: actual, if_sold_usd: shadow, gain_usd: shadow - actual }
    }) }
  }
  return out
}
fs.mkdirSync(FILE.replace(/\/[^/]*$/, '') || '.', { recursive: true })
// CLV / Brier (docs/POLY_PLAYBOOK.md): all history and since first look zMin 2.0 (docs/POLY_SUPERVISOR.md)
st.clv = { all: clvStudy(st.trades), judged: clvStudy(st.trades, '2026-10-15T19:00') }
fs.writeFileSync(FILE, JSON.stringify(st, null, 1))
console.log(JSON.stringify({ cash: st.cash, equity: st.cash + openValue, open: openCount, settled, entered, note }))
