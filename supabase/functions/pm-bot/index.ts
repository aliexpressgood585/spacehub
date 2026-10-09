// pm-bot — Polymarket PAPER desk (owner 2026-10-09). A separate $1,000 demo account on real Polymarket data.
// PAPER ONLY: it reads public Gamma / CLOB endpoints (unsigned GETs) and writes only pm_* tables. It never places
// an order and never touches the main bot's tables. Rules: shared/pm.ts (chosen by backtest/research/pm_research.py).
// Every cycle (cron, every 2 min):
//   1. settle: an open position whose market has resolved is paid 1 or 0 per share (no fee on redemption);
//   2. mark: other open positions are marked at the real best bid of their token;
//   3. enter: markets ending within PM.windowH hours, volume >= PM.minVolume, outcome ask inside the band ->
//      buy by walking the real ask book, taker fee from the market's own feeSchedule;
//   4. snapshot equity = cash + sum(qty x mark).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PM, takerFee, walkAsks, inBand, type FeeSchedule } from '../../../shared/pm.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const GAMMA = 'https://gamma-api.polymarket.com', CLOB = 'https://clob.polymarket.com'
const j = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0' } }); if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 80)}`); return r.json() }
const arr = (x: unknown): any[] => { try { return Array.isArray(x) ? x : JSON.parse(String(x)) } catch { return [] } }
type Book = { bids: { price: number; size: number }[]; asks: { price: number; size: number }[] }
async function book(token: string): Promise<Book | null> {
  try {
    const b = await j(`${CLOB}/book?token_id=${token}`)
    const m = (l: any[]) => (l ?? []).map((x) => ({ price: +x.price, size: +x.size })).filter((x) => x.price > 0 && x.size > 0)
    return { bids: m(b.bids).sort((a, c) => c.price - a.price), asks: m(b.asks).sort((a, c) => a.price - c.price) }
  } catch { return null }
}
const feeOf = (m: any): FeeSchedule | null => (m.feesEnabled && m.feeSchedule ? { rate: +m.feeSchedule.rate || 0, exponent: +m.feeSchedule.exponent || 1 } : null)

Deno.serve(async () => {
  const note: Record<string, unknown> = { at: new Date().toISOString() }
  try {
    const { data: st } = await db.from('pm_state').select('*').eq('id', 1).single()
    let cash = Number(st.cash)
    const { data: open } = await db.from('pm_trades').select('*').eq('status', 'OPEN')
    let settled = 0, marked = 0, openValue = 0
    // 1-2. settle or mark
    for (const t of open ?? []) {
      try {
        const m = await j(`${GAMMA}/markets/${t.market_id}`)
        const toks = arr(m.clobTokenIds), px = arr(m.outcomePrices).map(Number), k = toks.indexOf(t.token_id)
        if (m.closed && k >= 0 && (px[k] === 1 || px[k] === 0)) {
          const proceeds = t.qty * px[k], pnl = proceeds - Number(t.cost)
          cash += proceeds; settled++
          await db.from('pm_trades').update({ status: 'CLOSED', exit_px: px[k], exit_fee: 0, proceeds, pnl, reason: px[k] === 1 ? 'RESOLVED_WIN' : 'RESOLVED_LOSS', closed_at: new Date().toISOString(), mark_px: px[k], mark_at: new Date().toISOString() }).eq('id', t.id)
          continue
        }
        const b = await book(t.token_id)
        const bid = b?.bids[0]?.price ?? (k >= 0 ? px[k] : Number(t.mark_px ?? t.entry_px))
        await db.from('pm_trades').update({ mark_px: bid, mark_at: new Date().toISOString() }).eq('id', t.id)
        openValue += t.qty * bid; marked++
      } catch { openValue += t.qty * Number(t.mark_px ?? t.entry_px) }
    }
    // 3. entries
    const stillOpen = (open ?? []).length - settled
    const equity0 = cash + openValue
    const now = Date.now(), until = new Date(now + PM.windowH * 3600_000).toISOString()
    const decisions: any[] = []
    let entered = 0
    if (stillOpen < PM.maxOpen) {
      const ms: any[] = await j(`${GAMMA}/markets?closed=false&active=true&limit=200&order=volume&ascending=false&volume_num_min=${PM.minVolume}&end_date_min=${new Date(now).toISOString()}&end_date_max=${until}`)
      const held = new Set((open ?? []).filter((t) => t.status === 'OPEN').map((t) => t.token_id))
      const events = new Map<string, number>()
      for (const t of open ?? []) events.set(t.event_slug ?? '', (events.get(t.event_slug ?? '') ?? 0) + 1)
      let slots = PM.maxOpen - stillOpen
      for (const m of ms) {
        if (slots <= 0) break
        if (!m.acceptingOrders || !m.enableOrderBook) continue
        const toks = arr(m.clobTokenIds), outs = arr(m.outcomes), px = arr(m.outcomePrices).map(Number)
        if (toks.length !== 2) continue
        const ev = m.events?.[0]?.slug ?? m.slug
        if ((events.get(ev) ?? 0) >= PM.maxPerEvent) continue
        for (let k = 0; k < 2 && slots > 0; k++) {
          if (held.has(toks[k]) || !inBand(px[k])) continue
          const b = await book(toks[k]); const ask = b?.asks[0]?.price
          if (!b || !ask || !inBand(ask)) { decisions.push({ market_id: m.id, question: m.question, outcome: outs[k], price: ask ?? px[k], decision: 'skip', reason: 'ask_outside_band' }); continue }
          const stake = Math.min(equity0 * PM.stakeFrac, cash - 1)
          if (stake < PM.minQty * ask) { decisions.push({ market_id: m.id, question: m.question, outcome: outs[k], price: ask, decision: 'skip', reason: 'no_cash' }); continue }
          const fs = feeOf(m)
          const fill = walkAsks(b.asks, stake / (1 + (fs ? fs.rate : 0)), PM.hi)
          if (fill.qty < PM.minQty) { decisions.push({ market_id: m.id, question: m.question, outcome: outs[k], price: ask, decision: 'skip', reason: 'thin_book' }); continue }
          const fee = takerFee(fill.qty, fill.vwap, fs), cost = fill.spent + fee
          const { error } = await db.from('pm_trades').insert({ market_id: m.id, slug: m.slug, event_slug: ev, question: m.question, outcome: outs[k], token_id: toks[k], end_time: m.endDate, qty: fill.qty, entry_px: fill.vwap, entry_fee: fee, cost, best_ask: ask, model_p: px[k], mark_px: b.bids[0]?.price ?? fill.vwap, mark_at: new Date().toISOString(), meta: { fee_schedule: fs, volume: m.volumeNum, spread: m.spread } })
          if (error) continue
          cash -= cost; openValue += fill.qty * (b.bids[0]?.price ?? fill.vwap); slots--; entered++
          events.set(ev, (events.get(ev) ?? 0) + 1); held.add(toks[k])
          decisions.push({ market_id: m.id, question: m.question, outcome: outs[k], price: fill.vwap, decision: 'BUY', reason: `ask ${ask} in band, ${fill.qty.toFixed(1)} sh, fee $${fee.toFixed(2)}` })
          break
        }
      }
      note.scanned = ms.length
    }
    const openCount = stillOpen + entered
    await db.from('pm_state').update({ cash, last_scan: new Date().toISOString(), updated_at: new Date().toISOString(), strategy: PM, last_note: { ...note, settled, marked, entered } }).eq('id', 1)
    await db.from('pm_equity').insert({ equity: cash + openValue, cash, open_value: openValue, open_count: openCount })
    if (decisions.length) await db.from('pm_decisions').insert(decisions.slice(0, 50))
    return new Response(JSON.stringify({ ok: true, cash, equity: cash + openValue, settled, entered, openCount }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await db.from('pm_state').update({ last_note: { ...note, error: String(e) } }).eq('id', 1)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 })
  }
})
