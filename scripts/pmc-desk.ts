// pmc-desk — "פולי מטבעות": Polymarket PAPER desk for the short crypto Up/Down markets (5m / 15m / 4h). Runs on GitHub
// Actions (.github/workflows/pmc-desk.yml) every ~10 s; state = one JSON file on the `pm-desk-data` branch (pmc/state.json),
// read by trading-app polycoins.html. PAPER ONLY: unsigned public GETs to Polymarket Gamma / CLOB, never an order.
// Run: node --experimental-strip-types scripts/pmc-desk.ts <state.json>
import fs from 'node:fs'
import { takerFee, walkAsks, heOutcome, type FeeSchedule } from '../shared/pm.ts'
import { PMC, TF_SEC, windowOf, slugOf, inWindow, inBandR, questionHe } from '../shared/pmc.ts'

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
  const res: Record<string, any> = {}
  if (open0.length) for (const m of await j(`${GAMMA}/markets?closed=true&limit=50&${open0.map((t: any) => `id=${t.market_id}`).join('&')}`)) res[m.id] = m
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
    openValue += t.qty * t.mark_px
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
    for (const x of want) {
      const m = bySlug.get(x.slug)
      if (!m || held.has(x.slug) || m.closed || !m.acceptingOrders) continue
      if (st.trades.filter((t: any) => t.status === 'OPEN').length >= PMC.maxOpen) break
      const toks = arr(m.clobTokenIds), outs = arr(m.outcomes)
      for (let k = 0; k < 2; k++) {
        const b = await book(toks[k]); const ask = b?.asks[0]?.price
        if (!b || !ask || !inBandR(x.r, ask)) continue
        const D = (decision: string, reason: string, price = ask) => decisions.push({ ts: now(), market_id: m.id, question: m.question, question_he: questionHe(x.coin, x.r.tf, x.start), outcome: outs[k], outcome_he: heOutcome(outs[k]), price, decision, reason })
        const stake = Math.min(equity0 * PMC.stakeFrac, st.cash - 1)
        if (stake < PMC.minQty * ask) { D('skip', 'אין מספיק מזומן'); break }
        const fs_ = feeOf(m)
        const fill = walkAsks(b.asks, stake / (1 + (fs_ ? fs_.rate * (1 - ask) : 0)), x.r.hi + PMC.slipCap)   // fee / notional = rate x (1 - p)
        if (fill.qty < PMC.minQty) { D('skip', 'ספר הזמנות דל מדי'); break }
        const fee = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + fee, mk = b.bids[0]?.price ?? fill.vwap
        const left = x.start + TF_SEC[x.r.tf as keyof typeof TF_SEC] - nowS
        st.trades.push({ id: st.next_id++, market_id: m.id, slug: m.slug, event_slug: m.slug, question: m.question, question_he: questionHe(x.coin, x.r.tf, x.start), outcome: outs[k], outcome_he: heOutcome(outs[k]), token_id: toks[k], end_time: m.endDate, qty: fill.qty, entry_px: fill.vwap, entry_fee: fee, cost, best_ask: ask, opened_at: now(), status: 'OPEN', mark_px: mk, mark_at: now(), meta: { fee_schedule: fs_, volume: m.volumeNum, coin: x.coin, tf: x.r.tf, window_s: TF_SEC[x.r.tf as keyof typeof TF_SEC], left_s: left, band: [x.r.lo, x.r.hi], outcomes: outs } })
        st.cash -= cost; openValue += fill.qty * mk; entered++; held.add(x.slug)
        D('BUY', `${left} שנ׳ לסיום, מחיר ${ask} בטווח ${Math.round(x.r.lo * 100)}-${Math.round(x.r.hi * 100)}¢, ${fill.qty.toFixed(1)} מניות, עמלה $${fee.toFixed(2)}`, fill.vwap)
        break
      }
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
fs.mkdirSync(FILE.replace(/\/[^/]*$/, '') || '.', { recursive: true })
fs.writeFileSync(FILE, JSON.stringify(st, null, 1))
console.log(JSON.stringify({ cash: st.cash, equity: st.cash + openValue, open: openCount, settled, entered, note }))
