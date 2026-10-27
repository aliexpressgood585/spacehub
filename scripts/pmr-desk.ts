// pmr-desk — "פולי תגמולים": Polymarket LIQUIDITY-REWARDS PAPER desk ($1,000 demo on real books, rewards and trades).
// Every cycle (~15 s, .github/workflows/pmr-desk.yml): for each selected market, (1) fill our virtual resting quotes from the real
// trade tape since they went up (queue ahead of us at our price is eaten first; cancels ahead move us up), (2) score one reward
// sample per minute = the market's daily pool / 1440 x our share of the REAL book, held PENDING and paid at 00:00 UTC (a market's
// day below $1 is not paid), (3) re-quote at the best bid / best ask with inventory limits; open orders across all markets can
// lock at most the cash (as on the exchange). Exits sell through the real book with the taker fee.
// Markets are re-selected every PMR.rescanMin minutes by expected reward per $ of capital. State: pmr/state.json on the
// pmr-data branch, read by trading-app polyrewards.html. PAPER ONLY: public GETs, never an order.
// Run: node --experimental-strip-types scripts/pmr-desk.ts <state.json>
import fs from 'node:fs'
import { PMR, midOf, midAdj, share, quotePx, sizeAt, yesTrade, fillQuote, onBidFill, onAskFill, eligible, sizeFor, pickMarkets, daysTo, lockOf, clampQueue,
  walkSell, noBids, samplesBetween, dayOf, payout, SHADOW, CONS, shareCons, markout, diffQuote, dayBrake, gapBrake, type Book, type Quote, type Fee, type Intent } from '../shared/pmr.ts'

const FILE = process.argv[2] ?? 'pmr/state.json'
// PMR_SHADOW=1: the $100 shadow account (SHADOW in shared/pmr.ts) — same engine, sized like the real test, journals every intent
// a real account would send (st.intents) and applies the day-loss and disconnect brakes. Still sends nothing.
const SH = process.env.PMR_SHADOW === '1'
if (SH) Object.assign(PMR, { startCash: SHADOW.startCash, maxMarkets: SHADOW.maxMarkets })
const GAMMA = 'https://gamma-api.polymarket.com', CLOB = 'https://clob.polymarket.com', DATA = 'https://data-api.polymarket.com'
const H = { 'User-Agent': 'spacehub-paper/1.0' }
const j = async (u: string, body?: unknown) => {
  const r = await fetch(u, body ? { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: H })
  if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 80)}`); return r.json()
}
const arr = (x: unknown): any[] => { try { return Array.isArray(x) ? x : JSON.parse(String(x)) } catch { return [] } }
async function books(tokens: string[]): Promise<Record<string, Book>> {
  const out: Record<string, Book> = {}
  for (let i = 0; i < tokens.length; i += 100) {
    for (const b of await j(`${CLOB}/books`, tokens.slice(i, i + 100).map((t) => ({ token_id: t })))) {
      const m = (l: any[]) => (l ?? []).map((x) => ({ price: +x.price, size: +x.size })).filter((x) => x.price > 0 && x.size > 0)
      out[b.asset_id] = { bids: m(b.bids).sort((a, c) => c.price - a.price), asks: m(b.asks).sort((a, c) => a.price - c.price), tick: +b.tick_size || 0.01 }
    }
  }
  return out
}

const NOW = Date.now(), iso = () => new Date().toISOString()
const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
  : { start_cash: PMR.startCash, cash: PMR.startCash, rules: PMR, markets: {}, closed: [], fills: [], decisions: [], equity: [], rewards: 0, started: iso(), last_scan: null, candidates: [] }
st.rules = PMR
if (SH) { st.shadow = SHADOW; st.intents ??= []; st.brake ??= {} }
if (!st.pending) {
  // state written before the realism update credited rewards straight to cash; today's are not paid until 00:00 UTC
  st.pending = {}; let k = 0
  for (const [cid, m] of Object.entries<any>(st.markets)) { st.pending[cid] = m.rewards; k += m.rewards }
  if (st.rewards - k > 0) st.pending.closed_markets = st.rewards - k
  st.cash -= st.rewards
}
st.cons ??= { since: iso(), eq0: null, trade0: null, rewards: 0 }
st.pending_day ??= dayOf(NOW); st.paid ??= 0; st.dropped ??= 0; st.payouts ??= []
const feeOf = (m: any): Fee => (m.fee_rate > 0 ? { rate: m.fee_rate, exponent: m.fee_exp || 1 } : null)
const dec = (d: any) => st.decisions.unshift({ ts: iso(), ...d })
const note: any = { at: iso() }
const say = (m: any, why: string, l: Intent[]) => {
  if (SH) for (const x of l) st.intents.unshift({ ts: iso(), q: m.q, cid: m.cid, token_id: x.token === 'YES' ? m.yes : m.no, ...x, why })
}

// ---- 1. market selection (every PMR.rescanMin minutes) ----
async function scan() {
  const all: any[] = []; let cur = ''
  for (let k = 0; k < 40; k++) {
    const d = await j(`${CLOB}/rewards/markets/current${cur ? `?next_cursor=${cur}` : ''}`)
    all.push(...d.data); cur = d.next_cursor
    if (!cur || cur === 'LTE=' || !d.data.length) break
  }
  st.pool_total = Math.round(all.reduce((s, m) => s + (+m.total_daily_rate || 0), 0)); st.pool_markets = all.length
  const top = all.sort((a, b) => (+b.total_daily_rate || 0) - (+a.total_daily_rate || 0)).slice(0, 400)
  const meta: any[] = []
  for (let i = 0; i < top.length; i += 40) meta.push(...await j(`${GAMMA}/markets?limit=100&${top.slice(i, i + 40).map((m) => `condition_ids=${m.condition_id}`).join('&')}`))
  const rw = new Map(top.map((m) => [m.condition_id, m]))
  const live = meta.filter((g) => !g.closed && g.active && g.acceptingOrders !== false && arr(g.clobTokenIds).length === 2 && !g.gameStartTime)
  const bk = await books(live.map((g) => arr(g.clobTokenIds)[0]))
  const budget = (equity() / PMR.maxMarkets)
  const cands: any[] = []
  for (const g of live) {
    const r = rw.get(g.conditionId), b = bk[arr(g.clobTokenIds)[0]]
    if (!r || !b?.bids[0] || !b.asks[0]) continue
    const v = +r.rewards_max_spread, min = +r.rewards_min_size, rate = +r.total_daily_rate, mid = midAdj(b, min)
    const why = eligible({ mid, end: g.endDate, spreadC: (b.asks[0].price - b.bids[0].price) * 100, v }, NOW)
    if (why) continue
    const q = quotePx(b, v, min), size = sizeFor(budget, q.bid, q.ask)
    if (size < min) continue
    const bidQ = { px: q.bid, size, queue: 0, at: 0 }, askQ = { px: q.ask, size, queue: 0, at: 0 }
    const sh = share(b, v, min, bidQ, askQ), cap = size * (q.bid + 1 - q.ask)
    cands.push({ cid: g.conditionId, id: g.id, q: g.question, slug: g.events?.[0]?.slug ?? g.slug, end: g.endDate, yes: arr(g.clobTokenIds)[0], no: arr(g.clobTokenIds)[1],
      rate, v, min, mid: +mid.toFixed(4), share: +sh.toFixed(4), exp_day: +(rate * sh).toFixed(2), yld: +(rate * sh / cap).toFixed(4), vol24: Math.round(+g.volume24hr || 0),
      fee_rate: g.feesEnabled && g.feeSchedule ? +g.feeSchedule.rate || 0 : 0, fee_exp: g.feeSchedule ? +g.feeSchedule.exponent || 1 : 1 })
  }
  cands.sort((a, b) => b.yld - a.yld)
  st.candidates = cands.slice(0, 30); st.last_scan = iso()
  for (const c of cands) if (st.markets[c.cid]) Object.assign(st.markets[c.cid], { fee_rate: c.fee_rate, fee_exp: c.fee_exp })
  const on = Object.entries<any>(st.markets).filter(([, m]) => m.state === 'ON').map(([cid]) => cid)
  const pick = pickMarkets(cands, on), byId = new Map(cands.map((c) => [c.cid, c]))
  for (const cid of pick.drop) { const m = st.markets[cid]; m.state = 'EXIT'; dec({ action: 'DESELECT', q: m.q, why: byId.has(cid) ? `תשואה ירדה ל-${(byId.get(cid).yld * 100).toFixed(2)}% ליום` : 'לא עבר את תנאי הסריקה' }) }
  for (const cid of pick.select) {
    if (st.markets[cid]) continue                                          // still unwinding from an earlier exit
    const c = byId.get(cid)
    st.markets[cid] = { ...c, state: 'ON', yesSh: 0, noSh: 0, cashFlow: 0, rewards: 0, fills: 0, bid: null, ask: null, last_ts: 0, seen: [], opened: iso() }
    dec({ action: 'SELECT', q: c.q, why: `צפי ${(c.yld * 100).toFixed(2)}% ליום (${c.exp_day}$ מתוך מאגר ${c.rate}$)` })
  }
}
function markOf(m: any, b?: Book) { const mid = b ? midOf(b) : m.mid; return Number.isFinite(mid) ? m.yesSh * mid + m.noSh * (1 - mid) : 0 }
// equity = cash + inventory at the midpoint + rewards earned but not yet paid (shown separately on the page)
function equity() { return st.cash + pendingSum() + Object.values<any>(st.markets).reduce((s, m) => s + markOf(m), 0) }
function pendingSum() { return Object.values<number>(st.pending ?? {}).reduce((s, v) => s + v, 0) }

try {
  // daily payout at 00:00 UTC: yesterday's pending rewards per market, each paid only if >= $1
  if (dayOf(NOW) !== st.pending_day) {
    const p = payout(st.pending)
    st.cash += p.paid; st.paid += p.paid; st.dropped += p.dropped
    st.payouts.unshift({ day: st.pending_day, paid: +p.paid.toFixed(2), dropped: +p.dropped.toFixed(2) }); st.payouts = st.payouts.slice(0, 60)
    if (p.paid || p.dropped) dec({ action: 'PAYOUT', q: `תגמולי ${st.pending_day}`, why: `שולם ${p.paid.toFixed(2)}$, לא שולם (מתחת ל-$1 לשוק) ${p.dropped.toFixed(2)}$` })
    st.pending = {}; st.pending_day = dayOf(NOW)
  }
  if (!st.last_scan || NOW - Date.parse(st.last_scan) > PMR.rescanMin * 60_000) { await scan(); note.scan = true }
  const act = Object.entries<any>(st.markets)
  // resolution check (Gamma closed + outcome 1/0)
  if (act.length && (!st.last_res || NOW - Date.parse(st.last_res) > 5 * 60_000)) {
    const ids = act.map(([, m]) => m.id)
    for (const g of await j(`${GAMMA}/markets?closed=true&limit=50&${ids.map((id) => `id=${id}`).join('&')}`)) {
      const e = act.find(([, m]) => m.id === g.id); if (!e) continue
      const px = arr(g.outcomePrices).map(Number); if (!(px[0] === 0 || px[0] === 1 || px[0] === 0.5)) continue
      const m = e[1]; const pay = m.yesSh * px[0] + m.noSh * px[1]
      st.cash += pay; m.cashFlow += pay; m.yesSh = 0; m.noSh = 0; m.state = 'DONE'; m.resolved = px[0]
    }
    st.last_res = iso()
  }
  const live = Object.entries<any>(st.markets).filter(([, m]) => m.state === 'ON' || m.state === 'EXIT')
  if (SH) {
    // disconnect: a long gap means a real venue would have cancelled our quotes (cancel-on-disconnect); nothing rested meanwhile
    if (gapBrake(st.last_cycle ? Date.parse(st.last_cycle) : 0, NOW)) {
      for (const [, m] of live) for (const side of ['bid', 'ask'] as const) if (m[side]) { say(m, 'ניתוק: הפקודות בוטלו', diffQuote(m[side], null, side, m.yesSh)); m[side] = null }
      note.gap_s = Math.round((NOW - Date.parse(st.last_cycle)) / 1000)
    }
    const e0 = equity()
    if (st.brake.day !== dayOf(NOW)) st.brake = { day: dayOf(NOW), start_eq: +e0.toFixed(2), halted: false }
    if (!st.brake.halted && dayBrake(e0, st.brake.start_eq)) {
      st.brake.halted = true; st.brake.at = iso(); st.brake.eq = +e0.toFixed(2)
      dec({ action: 'BRAKE', q: 'בלם הפסד יומי', why: `הון ${e0.toFixed(2)}$ < ${(st.brake.start_eq * (1 - SHADOW.dayLossPct)).toFixed(2)}$ — כל הפקודות בוטלו עד היום הבא (UTC)` })
    }
  }
  const bk = live.length ? await books(live.map(([, m]) => m.yes)) : {}
  const samples = samplesBetween(st.last_cycle ? Date.parse(st.last_cycle) : 0, NOW)
  // cash not locked by open orders; every quote placed below takes its collateral out of this, across all markets
  let free = st.cash
  const budget = equity() / PMR.maxMarkets
  let rewardNow = 0
  for (const [cid, m] of live) {
    const b = bk[m.yes]; if (!b?.bids[0] || !b.asks[0]) { m.note = 'אין ספר'; continue }
    // (1) fills from the real tape since our quotes went up
    const raw = await j(`${DATA}/trades?market=${cid}&limit=200&takerOnly=true`).catch(() => [])
    const fresh = (raw as any[]).filter((t) => t.timestamp >= m.last_ts && !m.seen.includes(t.transactionHash + t.asset + t.size))
    const trs = fresh.map(yesTrade).sort((a, c) => a.ts - c.ts)
    const inv = { yes: m.yesSh, no: m.noSh, cash: 0 }
    for (const side of ['bid', 'ask'] as const) {
      const q = m[side]; if (!q) continue
      const f = fillQuote({ ...q, at: q.at }, side, trs)
      if (f.filled > 0) {
        side === 'bid' ? onBidFill(inv, q.px, f.filled) : onAskFill(inv, q.px, f.filled)
        st.fills.unshift({ ts: iso(), q: m.q, cid, side, px: q.px, size: f.filled, mid: +midOf(b).toFixed(4) }); m.fills++
        q.size = +(q.size - f.filled).toFixed(4)
      }
      q.queue = clampQueue(f.queue, sizeAt(side === 'bid' ? b.bids : b.asks, q.px))
    }
    m.yesSh = +inv.yes.toFixed(4); m.noSh = +inv.no.toFixed(4); st.cash += inv.cash; m.cashFlow += inv.cash
    if (raw.length) { m.last_ts = Math.max(m.last_ts, ...raw.map((t: any) => t.timestamp)); m.seen = raw.filter((t: any) => t.timestamp === m.last_ts).map((t: any) => t.transactionHash + t.asset + t.size) }
    // (2) rewards for the time our quotes rested (scored against the real book now)
    const mid = midAdj(b, m.min); m.mid = +mid.toFixed(4)
    const sh = m.state === 'ON' ? share(b, m.v, m.min, m.bid, m.ask) : 0
    const earn = m.rate * sh * samples / 1440
    st.cons.rewards += m.state === 'ON' ? m.rate * shareCons(b, m.v, m.min, m.bid, m.ask) * samples / 1440 : 0
    m.rewards += earn; st.rewards += earn; st.pending[cid] = (st.pending[cid] ?? 0) + earn; m.share = +sh.toFixed(4); rewardNow += m.rate * sh
    // (3) re-quote, or unwind
    const exitNow = m.state === 'EXIT' || daysTo(m.end, NOW) * 24 < PMR.exitHours || mid < 0.05 || mid > 0.95
    if (exitNow) {
      // taker unwind through the real book with the taker fee: YES into the YES bids, NO into the NO bids (= 1 - YES asks)
      const y = walkSell(b.bids, m.yesSh, feeOf(m)), n = walkSell(noBids(b), m.noSh, feeOf(m)), got = y.proceeds + n.proceeds
      for (const side of ['bid', 'ask'] as const) if (m[side]) say(m, 'יציאה מהשוק', diffQuote(m[side], null, side, m.yesSh))
      if (m.yesSh > 0) say(m, 'יציאה: מכירה לקונים', [{ action: 'TAKER_SELL', token: 'YES', side: 'SELL', px: b.bids[0]?.price ?? 0, size: m.yesSh }])
      if (m.noSh > 0) say(m, 'יציאה: מכירה לקונים', [{ action: 'TAKER_SELL', token: 'NO', side: 'SELL', px: noBids(b)[0]?.price ?? 0, size: m.noSh }])
      if (m.yesSh || m.noSh) dec({ action: 'UNWIND', q: m.q, why: `יציאה ${got.toFixed(2)}$ (עמלה ${(y.fee + n.fee).toFixed(2)}$${y.unfilled + n.unfilled > 0 ? `, ${(y.unfilled + n.unfilled).toFixed(0)} מניות בלי קונה = $0` : ''})` })
      st.cash += got; m.cashFlow += got; m.yesSh = 0; m.noSh = 0; m.bid = m.ask = null; m.state = 'DONE'; m.closed_at = iso()
      continue
    }
    const px = quotePx(b, m.v, m.min), size = sizeFor(budget, px.bid, px.ask), net = m.yesSh - m.noSh
    const halted = SH && st.brake.halted
    const put = (old: Quote, p: number, lv: typeof b.bids, allow: boolean): Quote => {
      if (!allow || halted || size < m.min) return null
      if (old && Math.abs(old.px - p) < 1e-9 && old.size >= m.min) return old            // keep our queue place
      return { px: p, size, queue: sizeAt(lv, p), at: Math.floor(NOW / 1000) }
    }
    // a resting order locks its collateral (lockOf) out of the cash left free by the orders already placed in this cycle
    const oldBid = m.bid, oldAsk = m.ask
    m.bid = put(m.bid, px.bid, b.bids, net < PMR.invCap * size && free >= lockOf('bid', px.bid, size, m.yesSh))
    if (m.bid) free -= lockOf('bid', m.bid.px, m.bid.size, m.yesSh)
    m.ask = put(m.ask, px.ask, b.asks, -net < PMR.invCap * size && free >= lockOf('ask', px.ask, size, m.yesSh))
    if (m.ask) free -= lockOf('ask', m.ask.px, m.ask.size, m.yesSh)
    const why = halted ? 'בלם הפסד יומי' : 'עדכון ציטוט'
    say(m, why, diffQuote(oldBid, m.bid, 'bid', m.yesSh)); say(m, why, diffQuote(oldAsk, m.ask, 'ask', m.yesSh))
    m.note = size < m.min ? 'גודל קטן מהמינימום' : (!m.bid || !m.ask) && free < size ? 'אין מספיק מזומן פנוי לשני הצדדים' : null
  }
  // 5-minute markout of each fill against the real midpoint (fills of markets no longer quoted get none)
  for (const f of st.fills) {
    if (f.mo !== undefined || !f.cid) continue
    const age = NOW - Date.parse(f.ts), m = st.markets[f.cid], b = m && bk[m.yes]
    if (age < CONS.markoutMin * 60_000) continue
    const mid = b ? midOf(b) : NaN
    f.mo = Number.isFinite(mid) && age < 30 * 60_000 ? +markout(f.side, f.px, f.size, mid).toFixed(4) : null
  }
  // drop finished markets into the closed list
  for (const [cid, m] of Object.entries<any>(st.markets)) if (m.state === 'DONE') {
    st.closed.unshift({ q: m.q, slug: m.slug, opened: m.opened, closed_at: m.closed_at ?? iso(), rewards: +m.rewards.toFixed(2), trading: +m.cashFlow.toFixed(2) - 0, fills: m.fills, resolved: m.resolved ?? null })
    delete st.markets[cid]
  }
  st.reward_rate_now = +rewardNow.toFixed(2); st.locked = +(st.cash - free).toFixed(2)
} catch (e: any) { note.error = String(e?.message ?? e) }

const eq = equity()
st.last_cycle = iso(); st.note = note
// conservative equity since st.cons.since: start equity + haircut rewards + trading P&L x CONS.tradeMult
const trade = eq - st.start_cash - st.rewards
if (st.cons.eq0 == null) { st.cons.eq0 = +eq.toFixed(2); st.cons.trade0 = +trade.toFixed(2) }
const eqCons = st.cons.eq0 + st.cons.rewards + (trade - st.cons.trade0) * CONS.tradeMult
const mo = st.fills.filter((f: any) => typeof f.mo === 'number')
st.markout = { n: mo.length, usd: +mo.reduce((a: number, f: any) => a + f.mo, 0).toFixed(2),
  c_per_share: mo.length ? +(100 * mo.reduce((a: number, f: any) => a + f.mo, 0) / mo.reduce((a: number, f: any) => a + f.size, 0)).toFixed(3) : null }
st.cons.eq = +eqCons.toFixed(2); st.cons.rules = CONS
st.equity.push({ t: iso(), eq: +eq.toFixed(2), rw: +st.rewards.toFixed(2), pend: +pendingSum().toFixed(2), ec: +eqCons.toFixed(2) })
if (st.equity.length > 6000) st.equity = st.equity.filter((_: any, i: number) => i % 2 === 0)
if (SH) st.intents = st.intents.slice(0, 1000)
st.fills = st.fills.slice(0, 300); st.decisions = st.decisions.slice(0, 200); st.closed = st.closed.slice(0, 200)
fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(st)); fs.renameSync(`${FILE}.tmp`, FILE)
console.log(`eq ${eq.toFixed(2)} rewards ${st.rewards.toFixed(2)} rate/day ${st.reward_rate_now} markets ${Object.keys(st.markets).length}${note.error ? ' ERR ' + note.error : ''}`)
