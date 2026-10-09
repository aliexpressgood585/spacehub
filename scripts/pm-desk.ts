// pm-desk — Polymarket PAPER desk runner for GitHub Actions (the same rules as supabase/functions/pm-bot, which
// cannot run while the Supabase project is restricted for exceeding its egress quota). State lives in one JSON file
// committed to the `pm-desk-data` branch; the dashboard (poly.html) reads it. PAPER ONLY: unsigned public GETs to
// Polymarket Gamma / CLOB, never an order.
// Run: node --experimental-strip-types scripts/pm-desk.ts <state.json>
import fs from 'node:fs'
import { PM, takerFee, walkAsks, inBand, type FeeSchedule } from '../shared/pm.ts'

const FILE = process.argv[2] ?? 'pm/state.json'
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
// Hebrew display text (owner: questions in Hebrew). Public Google translate endpoint, cached in the state; a failure keeps English.
const heCache: Record<string, string> = {}
async function he(text: string): Promise<string> {
  if (!text) return text
  if (heCache[text]) return heCache[text]
  try {
    const r = await j(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=iw&dt=t&q=${encodeURIComponent(text)}`)
    const out = (r?.[0] ?? []).map((x: any) => x?.[0] ?? '').join('').replace(/[\u0591-\u05C7]/g, '').trim()
    if (out) heCache[text] = out
    return out || text
  } catch { return text }
}
const feeOf = (m: any): FeeSchedule | null => (m.feesEnabled && m.feeSchedule ? { rate: +m.feeSchedule.rate || 0, exponent: +m.feeSchedule.exponent || 1 } : null)

interface Trade { id: number; market_id: string; slug: string; event_slug: string; question: string; outcome: string; token_id: string; end_time: string; qty: number; entry_px: number; entry_fee: number; cost: number; best_ask: number; opened_at: string; status: 'OPEN' | 'CLOSED'; mark_px: number; mark_at: string; exit_px?: number; exit_fee?: number; proceeds?: number; pnl?: number; reason?: string; closed_at?: string; meta?: any }
interface State { start_cash: number; cash: number; strategy: any; last_scan: string | null; last_note: any; trades: Trade[]; equity: { ts: string; equity: number; cash: number; open_value: number; open_count: number }[]; decisions: any[]; next_id: number }

const st: State = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
  : { start_cash: 1000, cash: 1000, strategy: PM, last_scan: null, last_note: null, trades: [], equity: [], decisions: [], next_id: 1 }
Object.assign(heCache, (st as any).he ?? {})
const now = () => new Date().toISOString()
const note: any = { at: now() }
let settled = 0, entered = 0, openValue = 0
const decisions: any[] = []
try {
  // 1-2. settle resolved markets, mark the rest at the real best bid
  for (const t of st.trades.filter((x) => x.status === 'OPEN')) {
    try {
      const m = await j(`${GAMMA}/markets/${t.market_id}`)
      const toks = arr(m.clobTokenIds), px = arr(m.outcomePrices).map(Number), k = toks.indexOf(t.token_id)
      if (m.closed && k >= 0 && (px[k] === 1 || px[k] === 0)) {
        Object.assign(t, { status: 'CLOSED', exit_px: px[k], exit_fee: 0, proceeds: t.qty * px[k], pnl: t.qty * px[k] - t.cost, reason: px[k] === 1 ? 'RESOLVED_WIN' : 'RESOLVED_LOSS', closed_at: now(), mark_px: px[k], mark_at: now() })
        st.cash += t.qty * px[k]; settled++; continue
      }
      const b = await book(t.token_id)
      t.mark_px = b?.bids[0]?.price ?? (k >= 0 ? px[k] : t.mark_px); t.mark_at = now()
    } catch { /* keep the last mark */ }
    openValue += t.qty * t.mark_px
  }
  // 3. entries
  const open = st.trades.filter((x) => x.status === 'OPEN')
  const equity0 = st.cash + openValue
  if (open.length < PM.maxOpen) {
    const t0 = Date.now()
    const ms: any[] = []
    for (let off = 0; off < 1000; off += 100) {
      const pg: any[] = await j(`${GAMMA}/markets?closed=false&active=true&limit=100&offset=${off}&order=volume&ascending=false&volume_num_min=${PM.minVolume}&end_date_min=${new Date(t0).toISOString()}&end_date_max=${new Date(t0 + PM.windowH * 3600_000).toISOString()}`)
      ms.push(...pg); if (pg.length < 100) break
    }
    note.scanned = ms.length
    const held = new Set(open.map((t) => t.token_id)), events = new Map<string, number>()
    for (const t of open) events.set(t.event_slug, (events.get(t.event_slug) ?? 0) + 1)
    let slots = PM.maxOpen - open.length
    for (const m of ms) {
      if (slots <= 0) break
      if (!m.acceptingOrders || !m.enableOrderBook) continue
      const toks = arr(m.clobTokenIds), outs = arr(m.outcomes), px = arr(m.outcomePrices).map(Number)
      if (toks.length !== 2) continue
      const ev = m.events?.[0]?.slug ?? m.slug
      if ((events.get(ev) ?? 0) >= PM.maxPerEvent) continue
      for (let k = 0; k < 2; k++) {
        if (held.has(toks[k]) || !inBand(px[k])) continue
        const b = await book(toks[k]); const ask = b?.asks[0]?.price
        const D = (decision: string, reason: string, price = ask ?? px[k]) => decisions.push({ ts: now(), market_id: m.id, question: m.question, outcome: outs[k], price, decision, reason })
        if (!b || !ask || !inBand(ask)) { D('skip', `מחיר ${ask ?? '—'} מחוץ לטווח 15-30¢`); continue }
        const stake = Math.min(equity0 * PM.stakeFrac, st.cash - 1)
        if (stake < PM.minQty * ask) { D('skip', 'אין מספיק מזומן'); continue }
        const fs_ = feeOf(m)
        const fill = walkAsks(b.asks, stake / (1 + (fs_ ? fs_.rate : 0)), PM.hi)
        if (fill.qty < PM.minQty) { D('skip', 'ספר הזמנות דל מדי'); continue }
        const fee = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + fee, mk = b.bids[0]?.price ?? fill.vwap
        st.trades.push({ id: st.next_id++, market_id: m.id, slug: m.slug, event_slug: ev, question: m.question, outcome: outs[k], token_id: toks[k], end_time: m.endDate, qty: fill.qty, entry_px: fill.vwap, entry_fee: fee, cost, best_ask: ask, opened_at: now(), status: 'OPEN', mark_px: mk, mark_at: now(), meta: { fee_schedule: fs_, volume: m.volumeNum, spread: m.spread, model_p: px[k] } })
        st.cash -= cost; openValue += fill.qty * mk; slots--; entered++
        events.set(ev, (events.get(ev) ?? 0) + 1); held.add(toks[k])
        D('BUY', `מחיר ${ask} בטווח, ${fill.qty.toFixed(1)} מניות, עמלה $${fee.toFixed(2)}`, fill.vwap)
        break
      }
    }
  }
} catch (e) { note.error = String(e) }
for (const t of st.trades as any[]) { if (!t.question_he) t.question_he = await he(t.question); if (!t.outcome_he) t.outcome_he = await he(t.outcome) }
for (const d of decisions) { d.question_he = await he(d.question); d.outcome_he = await he(d.outcome) }
for (const d of st.decisions) { if (!d.question_he) d.question_he = await he(d.question); if (!d.outcome_he) d.outcome_he = await he(d.outcome) }
;(st as any).he = Object.fromEntries(Object.entries(heCache).slice(-3000))
const openCount = st.trades.filter((x) => x.status === 'OPEN').length
st.strategy = PM; st.last_scan = now(); st.last_note = { ...note, settled, entered }
st.equity.push({ ts: now(), equity: st.cash + openValue, cash: st.cash, open_value: openValue, open_count: openCount })
if (st.equity.length > 5000) st.equity = st.equity.slice(-5000)
st.decisions = [...decisions.slice(0, 50), ...st.decisions].slice(0, 200)
fs.mkdirSync(FILE.replace(/\/[^/]*$/, '') || '.', { recursive: true })
fs.writeFileSync(FILE, JSON.stringify(st, null, 1))
console.log(JSON.stringify({ cash: st.cash, equity: st.cash + openValue, open: openCount, settled, entered, note }))
