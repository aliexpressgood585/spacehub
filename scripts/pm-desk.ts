// pm-desk — Polymarket PAPER desk runner for GitHub Actions (the same rules as supabase/functions/pm-bot, which
// cannot run while the Supabase project is restricted for exceeding its egress quota). State lives in one JSON file
// committed to the `pm-desk-data` branch; the dashboard (poly.html) reads it. PAPER ONLY: unsigned public GETs to
// Polymarket Gamma / CLOB, never an order.
// Run: node --experimental-strip-types scripts/pm-desk.ts <state.json>
import fs from 'node:fs'
import { clvMark, clvStudy, markout, markoutStudy } from '../shared/clv.ts'
import { PM, takerFee, walkAsks, walkBids, inBand, heOutcome, namesKept, pmMatch, isCryptoPrice, gateStudy, FADE, fadeEligible, fadeSnap, fadeDue, fadeSignal, isFade, stratStats, fadeKill, type FeeSchedule } from '../shared/pm.ts'

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
async function he(text: string): Promise<string | undefined> {
  if (!text) return text
  if (heCache[text]) return heCache[text]
  const strip = (x: string) => x.replace(/[\u0591-\u05C7]/g, '').trim()
  try {
    const r = await j(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=iw&dt=t&q=${encodeURIComponent(text)}`)
    const out = strip((r?.[0] ?? []).map((x: any) => x?.[0] ?? '').join(''))
    if (/[\u05D0-\u05EA]/.test(out)) { heCache[text] = out; return out }
  } catch (e) { note.tr_err = String(e).slice(0, 80) }
  try {
    const r = await j(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en%7Che`)
    const out = strip(String(r?.responseData?.translatedText ?? ''))
    if (r?.responseStatus == 200 && out && !/MYMEMORY WARNING/i.test(out)) { heCache[text] = out; return out }
  } catch (e) { note.tr_err2 = String(e).slice(0, 80) }
  return undefined   // not cached: retried next cycle
}
// Official settlement price of outcome k, or null while the market is not finally resolved. 1 / 0 = normal result;
// 0.5 = the rules' 50-50 (cancelled / unfinished game), accepted only when every outcome is 0.5 and UMA reports 'resolved'
// (before 2026-10-18 such a market was never settled and stayed OPEN forever, holding a slot and its match room).
export function officialPx(m: any, k: number): number | null {
  if (!m?.closed || !(k >= 0)) return null
  const px = arr(m.outcomePrices).map(Number), p = px[k]
  if (p === 1 || p === 0) return p
  if (p === 0.5 && px.length > 0 && px.every((x) => x === 0.5) && m.umaResolutionStatus === 'resolved') return 0.5
  return null
}
// Display / measurement flag for a position still open after its scheduled end: hours past the end and the UMA status
// from Gamma ('proposed' / 'disputed' / ...). Cleared when the position is no longer past its end. Never read by a rule.
export function pendingFlag(t: { end_time?: string; meta?: any }, m: any, nowMs: number) {
  const end = Date.parse(t.end_time ?? '')
  t.meta = t.meta ?? {}
  if (!Number.isFinite(end) || nowMs < end) { delete t.meta.pending; return }
  const uma = typeof m?.umaResolutionStatus === 'string' ? m.umaResolutionStatus : null
  const disputes = arr(m?.umaResolutionStatuses).filter((x) => x === 'disputed').length
  t.meta.pending = { past_end_h: Math.round(((nowMs - end) / 3600_000) * 10) / 10, uma, disputes, at: new Date(nowMs).toISOString() }
}
const feeOf = (m: any): FeeSchedule | null => (m.feesEnabled && m.feeSchedule ? { rate: +m.feeSchedule.rate || 0, exponent: +m.feeSchedule.exponent || 1 } : null)

interface Trade { id: number; strategy?: 'fav' | 'fade'; market_id: string; slug: string; event_slug: string; question: string; outcome: string; token_id: string; end_time: string; qty: number; entry_px: number; entry_fee: number; cost: number; best_ask: number; opened_at: string; status: 'OPEN' | 'CLOSED'; mark_px: number; mark_at: string; exit_px?: number; exit_fee?: number; proceeds?: number; pnl?: number; reason?: string; closed_at?: string; meta?: any }
interface State { start_cash: number; cash: number; strategy: any; last_scan: string | null; last_note: any; trades: Trade[]; equity: { ts: string; equity: number; cash: number; open_value: number; open_count: number }[]; decisions: any[]; next_id: number }

const st: State = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
  : { start_cash: 1000, cash: 1000, strategy: PM, last_scan: null, last_note: null, trades: [], equity: [], decisions: [], next_id: 1 }
for (const [k, v] of Object.entries((st as any).he ?? {})) if (typeof v === 'string' && /[\u05D0-\u05EA]/.test(v)) heCache[k] = v
const now = () => new Date().toISOString()
const note: any = { at: now() }
let settled = 0, entered = 0, topped = 0, recycled = 0, openValue = 0
const decisions: any[] = []
try {
  // 1-2. settle resolved markets, mark the rest at the real best bid
  for (const t of st.trades.filter((x) => x.status === 'OPEN')) {
    try {
      const m = await j(`${GAMMA}/markets/${t.market_id}`)
      const toks = arr(m.clobTokenIds), px = arr(m.outcomePrices).map(Number), k = toks.indexOf(t.token_id)
      if (officialPx(m, k) != null) {
        // settle at the official Gamma outcomePrices only (1 / 0, or a 50-50 split once UMA says resolved)
        Object.assign(t, { status: 'CLOSED', exit_px: px[k], exit_fee: 0, proceeds: t.qty * px[k], pnl: t.qty * px[k] - t.cost, reason: px[k] === 1 ? 'RESOLVED_WIN' : px[k] === 0 ? 'RESOLVED_LOSS' : 'RESOLVED_SPLIT', closed_at: now(), mark_px: px[k], mark_at: now() })
        st.cash += t.qty * px[k]; settled++; continue
      }
      const b = await book(t.token_id)
      t.mark_px = b?.bids[0]?.price ?? (k >= 0 ? px[k] : t.mark_px); t.mark_at = now()
      clvMark(t, b?.bids[0]?.price, b?.asks[0]?.price, Date.now())
      markout(t, b?.bids[0]?.price, b?.asks[0]?.price, Date.now())   // pre-resolution closing line (shared/clv.ts), measurement only
      // long disputes / late resolutions (2026-10-18, #173 Tesla 0-60: UMA disputed 9x, still open 2.5 days after its end):
      // never settled until Gamma is final (officialPx); flagged for display only, no trading effect
      pendingFlag(t, m, Date.now())
    } catch { /* keep the last mark */ }
    openValue += t.qty * t.mark_px
  }
  // 2b. EARLY EXIT, only on demand (owner 2026-10-13): when a new in-band entry is short of cash, sell positions whose
  // real best bid is already >= PM.exitPx (outcome all but decided), highest bid first, walking the real bid book and
  // paying the taker fee, until the entry is funded. Otherwise every position is held to resolution for the full $1.
  async function freeCash(need: number, forWhat: string) {
    const cands: { t: Trade; b: { bids: Lvl[] } }[] = []
    for (const t of st.trades) {
      if (t.status !== 'OPEN' || t.mark_px < PM.exitPx) continue   // bought this cycle = in band, never >= exitPx
      if (isFade(t)) continue   // fade positions are held to the official result, as backtested
      const b = await book(t.token_id); if (b && (b.bids[0]?.price ?? 0) >= PM.exitPx) cands.push({ t, b })
    }
    cands.sort((a, c) => c.b.bids[0].price - a.b.bids[0].price)
    for (const { t, b } of cands) {
      if (need <= 0) break
      const fill = walkBids(b.bids, t.qty, PM.exitPx); if (!fill) continue
      const fee = takerFee(fill.qty, fill.vwap, t.meta?.fee_schedule ?? null), net = fill.got - fee, was = t.qty * t.mark_px
      Object.assign(t, { status: 'CLOSED', exit_px: fill.vwap, exit_fee: fee, proceeds: fill.got, pnl: net - t.cost, reason: 'EARLY_EXIT', closed_at: now(), mark_px: fill.vwap, mark_at: now() })
      st.cash += net; openValue -= was; need -= net; recycled++
      decisions.push({ ts: now(), market_id: t.market_id, question: t.question, outcome: t.outcome, price: fill.vwap, decision: 'SELL', reason: `מימוש מוקדם ב־${(fill.vwap * 100).toFixed(1)}¢ כדי לממן כניסה חדשה (${forWhat.slice(0, 60)}), עמלה $${fee.toFixed(2)}` })
    }
  }
  // 3. entries
  const open = st.trades.filter((x) => x.status === 'OPEN')
  const equity0 = st.cash + openValue
  if (open.length < PM.maxOpen) {
    const t0 = Date.now()
    const ms: any[] = []
    for (let off = 0; off < 2000; off += 100) {
      const pg: any[] = await j(`${GAMMA}/markets?closed=false&active=true&limit=100&offset=${off}&order=volume&ascending=false&volume_num_min=${PM.minVolume}&end_date_min=${new Date(t0).toISOString()}&end_date_max=${new Date(t0 + PM.windowH * 3600_000).toISOString()}`)
      ms.push(...pg); if (pg.length < 100) break
    }
    note.scanned = ms.length
    const held = new Set(open.map((t) => t.token_id)), events = new Map<string, number>(), matchCost = new Map<string, number>()
    for (const t of open) {
      const mk = pmMatch(t.event_slug)
      events.set(mk, (events.get(mk) ?? 0) + 1); matchCost.set(mk, (matchCost.get(mk) ?? 0) + t.cost)
    }
    let slots = PM.maxOpen - open.length
    for (const m of ms) {
      if (slots <= 0) break
      if (!m.acceptingOrders || !m.enableOrderBook) continue
      const toks = arr(m.clobTokenIds), outs = arr(m.outcomes), px = arr(m.outcomePrices).map(Number)
      if (toks.length !== 2) continue
      const ev = m.events?.[0]?.slug ?? m.slug, mkey = pmMatch(ev)
      if (isCryptoPrice(ev, m.question)) continue           // crypto price markets: Poly Coins' domain (see shared/pm.ts)
      if ((events.get(mkey) ?? 0) >= PM.maxPerEvent) continue
      const matchRoom = equity0 * PM.maxMatchFrac - (matchCost.get(mkey) ?? 0)
      for (let k = 0; k < 2; k++) {
        if (held.has(toks[k]) || !inBand(px[k])) continue
        const b = await book(toks[k]); const ask = b?.asks[0]?.price
        const D = (decision: string, reason: string, price = ask ?? px[k]) => decisions.push({ ts: now(), market_id: m.id, question: m.question, outcome: outs[k], outcomes: outs, price, decision, reason })
        if (!b || !ask || !inBand(ask)) { D('skip', `מחיר ${ask ?? '—'} מחוץ לטווח ${Math.round(PM.lo*100)}-${Math.round(PM.hi*100)}¢`); continue }
        const want = equity0 * PM.stakeFrac
        if (st.cash - 1 < want) await freeCash(want - (st.cash - 1), `${m.question} · ${outs[k]}`)
        if (matchRoom < PM.minQty * ask) { D('skip', `הגנה: כבר ${Math.round(100 * PM.maxMatchFrac)}% מההון על המשחק הזה`); break }
        const stake = Math.min(want, st.cash - 1, matchRoom)
        if (stake < PM.minQty * ask) { D('skip', 'אין מספיק מזומן'); continue }
        const fs_ = feeOf(m)
        const fill = walkAsks(b.asks, stake / (1 + (fs_ ? fs_.rate : 0)), PM.hi)
        if (fill.qty < PM.minQty) { D('skip', 'ספר הזמנות דל מדי'); continue }
        const fee = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + fee, mk = b.bids[0]?.price ?? fill.vwap
        st.trades.push({ id: st.next_id++, strategy: 'fav', market_id: m.id, slug: m.slug, event_slug: ev, question: m.question, outcome: outs[k], token_id: toks[k], end_time: m.endDate, qty: fill.qty, entry_px: fill.vwap, entry_fee: fee, cost, best_ask: ask, opened_at: now(), status: 'OPEN', mark_px: mk, mark_at: now(), meta: { fee_schedule: fs_, volume: m.volumeNum, spread: m.spread, model_p: px[k], outcomes: outs } })
        st.cash -= cost; openValue += fill.qty * mk; slots--; entered++
        events.set(mkey, (events.get(mkey) ?? 0) + 1); matchCost.set(mkey, (matchCost.get(mkey) ?? 0) + cost); held.add(toks[k])
        D('BUY', `מחיר ${ask} בטווח, ${fill.qty.toFixed(1)} מניות, עמלה $${fee.toFixed(2)}`, fill.vwap)
        break
      }
    }
  }
  // 3b. FADE jump-fade (second PAPER sub-strategy, shared/pm.ts FADE; trades tagged strategy 'fade'). Non-sports markets
  // ending >= 24h later: the top FADE.pages x 100 by volume get a price snapshot every 20 min (bounded ring in st.fade_snaps);
  // a >= 15c move vs the ~60-min-old snapshot buys the side that fell at the real ask, only if the walked fill stays within
  // FADE.maxPremium of the observed price. One entry per event ever, no top-ups, held to the result. Kill: fadeKill().
  try {
    const t0 = Date.now(), snaps: Record<string, [number, number][]> = ((st as any).fade_snaps ??= {})
    const kill = fadeKill(st.trades)
    const openAll = st.trades.filter((x) => x.status === 'OPEN')
    const eqF = st.cash + openValue
    let fCost = openAll.filter(isFade).reduce((a, t) => a + t.cost, 0), fn = 0, fScanned = 0
    const fadeEv = new Set(st.trades.filter(isFade).flatMap((t) => [t.event_slug, pmMatch(t.event_slug)]))   // one fade entry per event, ever
    const fadeMk = new Set(st.trades.filter(isFade).map((t) => String(t.market_id)))
    const held = new Set(openAll.map((t) => t.token_id)), matchCost = new Map<string, number>()
    for (const t of openAll) { const k = pmMatch(t.event_slug); matchCost.set(k, (matchCost.get(k) ?? 0) + t.cost) }
    const seen = new Set<string>()
    for (let off = 0; off < FADE.pages * 100; off += 100) {
      const pg: any[] = await j(`${GAMMA}/markets?closed=false&active=true&limit=100&offset=${off}&order=volume&ascending=false&volume_num_min=${FADE.minVolume}&end_date_min=${new Date(t0 + FADE.minEndH * 3600_000).toISOString()}`)
      for (const m of pg) {
        const ev = m.events?.[0]?.slug ?? m.slug, toks = arr(m.clobTokenIds), outs = arr(m.outcomes), px = arr(m.outcomePrices).map(Number)
        if (toks.length !== 2 || !fadeEligible(m, ev) || !m.acceptingOrders || !m.enableOrderBook || !(px[0] >= 0 && px[0] <= 1)) continue
        if (!(Number(m.volumeNum) >= FADE.minVolume) || !(Date.parse(m.endDate) >= t0 + FADE.minEndH * 3600_000)) continue
        fScanned++; seen.add(String(m.id))
        // the signal is checked only when the ring takes a new point (every 20 min), closer to the hourly-point research
        // than firing on the first 15-second cycle in the middle of a move; then the new point is stored
        const ring = snaps[m.id], sig = fadeDue(ring, t0) ? fadeSignal(ring, t0, px[0]) : null
        snaps[m.id] = fadeSnap(ring, t0, px[0])
        if (!sig || fadeMk.has(String(m.id)) || held.has(toks[sig.k])) continue
        const mkey = pmMatch(ev)
        const D = (decision: string, reason: string, price = sig.px) => decisions.push({ ts: now(), market_id: m.id, question: m.question, outcome: outs[sig.k], outcomes: outs, price, decision, reason, strategy: 'fade' })
        if (kill.killed) { D('skip', `fade: עצירה מוסכמת מראש (n ${kill.n}, ממוצע ${((kill.mean_r ?? 0) * 100).toFixed(1)}%, t ${kill.t?.toFixed(2) ?? '—'})`); continue }
        if (fadeEv.has(ev) || fadeEv.has(mkey)) { D('skip', 'fade: כבר נכנסנו לאירוע הזה'); continue }
        if (fn >= FADE.maxPerCycle || openAll.length + fn >= PM.maxOpen) continue
        const room = Math.min(eqF * PM.maxMatchFrac - (matchCost.get(mkey) ?? 0), eqF * FADE.maxTotalFrac - fCost)
        if (room < PM.minQty * sig.px) { D('skip', 'fade: מגבלת 10% לאירוע / 20% להון של fade'); continue }
        const b = await book(toks[sig.k]); const ask = b?.asks[0]?.price
        if (!b || !ask || ask > sig.px + FADE.maxPremium) { D('skip', `fade: ההיצע ${ask ?? '—'} רחוק מהמחיר ${sig.px.toFixed(3)}`); continue }
        const stake = Math.min(eqF * FADE.stakeFrac, eqF * PM.maxPosFrac, st.cash - 1, room)
        if (stake < PM.minQty * ask) { D('skip', 'fade: אין מספיק מזומן'); continue }
        const fs_ = feeOf(m), fill = walkAsks(b.asks, stake / (1 + (fs_ ? fs_.rate : 0)), sig.px + FADE.maxPremium)
        if (fill.qty < PM.minQty) { D('skip', 'fade: ספר הזמנות דל מדי'); continue }
        const fee = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + fee, mk = b.bids[0]?.price ?? fill.vwap
        st.trades.push({ id: st.next_id++, strategy: 'fade', market_id: m.id, slug: m.slug, event_slug: ev, question: m.question, outcome: outs[sig.k], token_id: toks[sig.k], end_time: m.endDate, qty: fill.qty, entry_px: fill.vwap, entry_fee: fee, cost, best_ask: ask, opened_at: now(), status: 'OPEN', mark_px: mk, mark_at: now(),
          meta: { fade: { p0_then: sig.then, then_at: new Date(sig.thenAt).toISOString(), p0_now: px[0], seen_px: sig.px }, fee_schedule: fs_, volume: m.volumeNum, spread: m.spread, outcomes: outs } })
        st.cash -= cost; openValue += fill.qty * mk; fCost += cost; fn++; entered++
        matchCost.set(mkey, (matchCost.get(mkey) ?? 0) + cost); held.add(toks[sig.k]); fadeMk.add(String(m.id)); fadeEv.add(ev); fadeEv.add(mkey)
        D('BUY', `fade: קפיצה ${(100 * (px[0] - sig.then)).toFixed(0)}¢ בשעה, קונים את הצד שירד ב־${fill.vwap.toFixed(3)}, ${fill.qty.toFixed(1)} מניות, עמלה $${fee.toFixed(2)}`, fill.vwap)
      }
      if (pg.length < 100) break
    }
    for (const id of Object.keys(snaps)) if (!seen.has(id) && !(snaps[id] ?? []).some(([t]) => t0 - t <= 2 * 3600_000)) delete snaps[id]
    note.fade = { scanned: fScanned, entered: fn, open_cost: Math.round(fCost * 100) / 100, killed: kill.killed }
  } catch (e) { note.fade_error = String(e).slice(0, 120) }
  // 4. deploy ALL cash (owner 2026-10-09: "use all cash, always"): every open position is topped up to an equal
  // share of equity (capped at PM.maxPosFrac) while its live ask is still inside the band and the market is open.
  // Same fill model as an entry: walk the real ask book now, pay the market's taker fee.
  {
    const openNow = st.trades.filter((x) => x.status === 'OPEN' && !isFade(x))   // fade positions are never topped up
    const eq = st.cash + openValue
    const target = Math.min(eq * PM.maxPosFrac, eq / Math.max(1, openNow.length))
    const mc = new Map<string, number>()
    for (const t of openNow) mc.set(pmMatch(t.event_slug), (mc.get(pmMatch(t.event_slug)) ?? 0) + t.cost)
    const need = openNow.map((t) => ({ t, gap: Math.min(target - t.cost, eq * PM.maxMatchFrac - (mc.get(pmMatch(t.event_slug)) ?? 0)) }))
      .filter((x) => x.gap > 2).sort((a, b) => b.gap - a.gap)
    for (const { t, gap } of need) {
      if (st.cash < 2) break
      if (t.end_time && Date.parse(t.end_time) - Date.now() < 10 * 60_000) continue
      const b = await book(t.token_id); const ask = b?.asks[0]?.price
      if (!b || !ask || !inBand(ask)) continue
      const fs_ = t.meta?.fee_schedule ?? null
      const fill = walkAsks(b.asks, Math.min(gap, st.cash - 1) / (1 + (fs_ ? fs_.rate : 0)), PM.hi)
      if (fill.qty < PM.minQty) continue
      const fee = takerFee(fill.qty, fill.vwap, fs_), cost = fill.spent + fee
      const q0 = t.qty
      t.entry_px = (t.entry_px * q0 + fill.vwap * fill.qty) / (q0 + fill.qty)
      t.qty = q0 + fill.qty; t.entry_fee += fee; t.cost += cost
      t.meta = { ...(t.meta ?? {}), adds: (t.meta?.adds ?? 0) + 1 }
      st.cash -= cost; openValue += fill.qty * (b.bids[0]?.price ?? fill.vwap); topped++
      mc.set(pmMatch(t.event_slug), (mc.get(pmMatch(t.event_slug)) ?? 0) + cost)
      decisions.push({ ts: now(), market_id: t.market_id, question: t.question, outcome: t.outcome, price: fill.vwap, decision: 'ADD', reason: `השלמה לחלק שווה: +${fill.qty.toFixed(1)} מניות, עמלה $${fee.toFixed(2)}` })
    }
  }
} catch (e) { note.error = String(e) }
// Hebrew display text. Outcomes: generic answers from a fixed list, names (teams, players) exactly as listed.
// Questions: machine-translated, but kept only if every name in them survived (else the English question is shown).
const heRow = async (x: any, retry: boolean) => {
  x.outcome_he = heOutcome(x.outcome)
  const names = [x.outcome, ...((x.outcomes ?? x.meta?.outcomes ?? []) as string[])]
  if (retry && (!x.question_he || x.question_he === x.question || x.tr_v !== 2)) { const q = await he(x.question); x.question_he = q; x.tr_v = 2 }
  if (x.question_he && !namesKept(x.question, x.question_he, names)) x.question_he = x.question
}
for (const t of st.trades as any[]) await heRow(t, true)
for (const d of decisions) await heRow(d, true)
for (const d of st.decisions) await heRow(d, d.tr_v !== 2 || !d.question_he || d.question_he === d.question)
;(st as any).he = Object.fromEntries(Object.entries(heCache).slice(-3000))
const openCount = st.trades.filter((x) => x.status === 'OPEN').length
st.strategy = PM; st.last_scan = now(); st.last_note = { ...note, settled, entered, topped, recycled }
st.equity.push({ ts: now(), equity: st.cash + openValue, cash: st.cash, open_value: openValue, open_count: openCount })
if (st.equity.length > 5000) {
  // keep the long curve (max drawdown needs it): points falling off the 5,000-point window survive one per hour in equity_h
  const eh: any[] = ((st as any).equity_h ??= [])
  for (const e of st.equity.slice(0, st.equity.length - 5000)) if (!eh.length || eh[eh.length - 1].ts.slice(0, 13) !== e.ts.slice(0, 13)) eh.push(e)
  if (eh.length > 4000) (st as any).equity_h = eh.slice(-4000)
  st.equity = st.equity.slice(-5000)
}
st.decisions = [...decisions.slice(0, 50), ...st.decisions].slice(0, 200)
fs.mkdirSync(FILE.replace(/\/[^/]*$/, '') || '.', { recursive: true })
// CLV / Brier (docs/POLY_PLAYBOOK.md): all history and since the crypto exclusion (the judged rule, docs/POLY_SUPERVISOR.md)
;(st as any).clv = { all: clvStudy(st.trades), judged: clvStudy(st.trades, '2026-10-15T18:30'), m30: markoutStudy(st.trades),
  note: 'all/judged close_px = last mid before the scheduled end (usually after the result); m30 = pre-resolution markout' }
;(st as any).gates = gateStudy(st.trades.filter((t) => !isFade(t)), '2026-10-15T18:30')   // read-out only, never acted on (docs/POLY_SUPERVISOR.md)
;(st as any).by_strategy = { fav: stratStats(st.trades.filter((t) => !isFade(t))), fade: { ...stratStats(st.trades.filter(isFade)), kill: fadeKill(st.trades) } }   // read-out for display
// atomic write: a cycle killed mid-write (workflow `timeout 240`) must not leave a truncated state that every later cycle
// fails to parse (and that the loop would commit). Write a temp file next to it, then rename over the old one.
fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(st, null, 1)); fs.renameSync(`${FILE}.tmp`, FILE)
console.log(JSON.stringify({ cash: st.cash, equity: st.cash + openValue, open: openCount, settled, entered, note }))
