// v99.5 — EVT sleeve runner: Binance listing / delisting announcements traded in the paper book (owner 2026-10-01:
// "I want it in the account too, with high exposure"). Same rules as the virtual H7L240 / H7D240 forward test
// (shared/events.ts, quant/PREREGISTRATION_H7.md): an announcement at most 10 minutes old -> LONG the perp on a spot
// listing, SHORT the perps on a spot delisting, out after 240 minutes at the touch with the funding actually settled.
// No stop. Size: __EVT_PER_TRADE of equity per position (default 25%), <= __EVT_MAX_OPEN open (default 4), paper 1x.
// Limits re-checked in `evt_commit_cycle`. NOT VALIDATED (27 months of history: ~24 listings, win rate 54%).
import { SCALP, type Quote } from '../../../shared/scalp.ts'
import { EV_CATALOGS, eventEntries, type Article } from '../../../shared/events.ts'
import { json, pool, quote } from './rota-runner.ts'
import { sleeveOff } from '../../../shared/sleeves.ts'

const g = () => globalThis as any
export function evtConfig() {
  const pt = Number(g().__EVT_PER_TRADE), mo = Number(g().__EVT_MAX_OPEN)
  return { perTrade: Number.isFinite(pt) && pt > 0 ? Math.min(0.34, pt) : 0.25, maxOpen: Number.isFinite(mo) && mo >= 1 ? Math.min(8, Math.floor(mo)) : 4,
    holdMs: 240 * 60e3, pollMs: 20_000 }
}
// bot symbol for a perp: PEPE keeps its legacy unit (1000PEPEUSDT / 1000, see BINANCE_SYM); other 1000x contracts
// trade as listed ('1000SATS'), so quote() prices exactly the contract the announcement maps to
export const symOf = (perp: string) => (perp === '1000PEPEUSDT' ? 'PEPE' : perp.slice(0, -4))

export async function runEvt(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('EVT is paper-only; refusing live execution')
  const cfg = evtConfig(), now = Date.now(), params = state.bot_params || {}
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || Number(t.lev) !== 1 || !['LIST', 'FUND', 'FAST', 'EVT'].includes(t.strategy)))
    throw new Error('EVT requires a paper-only 1x book of LIST/FUND/FAST/EVT rows')
  const mine = open.filter((t: any) => t.strategy === 'EVT')
  // v99.6: sleeves_off.EVT (the supervisor's brake) stops polling for entries; open rows still exit on time
  const pollDue = now - (Number(params.evt_poll) || 0) >= cfg.pollMs && !state.hard_halt_at && !sleeveOff(params, 'EVT')
  const due = mine.filter((t: any) => now >= Date.parse(t.scalp_meta?.exit_due ?? t.opened_at))
  if (!due.length && !pollDue) {
    if (mine.length) { const marks: Record<string, number> = {}
      await pool<any>(mine, 4, async t => { try { const q = await quote(String(t.sym)); marks[t.sym] = t.side === 'LONG' ? q.bid : q.ask } catch { /* next cycle */ } })
      if (Object.keys(marks).length) try { await db.rpc('sleeve_marks', { p_lease: lease, p_key: 'evt_marks', p_marks: marks }).throwOnError() } catch { /* display only */ } }
    return { changed: false, open: mine.length }
  }
  // exits: at the touch after 240 min, with the funding settled over the hold
  const closes: any[] = []
  await pool<any>(due, 4, async t => {
    const m = t.scalp_meta || {}, dir = t.side === 'LONG' ? 1 : -1
    let fsum: number | null = null
    try { const f = await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${m.symbol}&startTime=${Date.parse(t.opened_at)}&endTime=${now}&limit=100`)
      if (Array.isArray(f)) fsum = f.reduce((s: number, x: any) => s + Number(x.fundingRate || 0), 0) } catch { /* retry */ }
    if (fsum === null && now < Date.parse(m.exit_due) + 30 * 60e3) return
    let q: Quote; try { q = await quote(String(t.sym)) } catch { return }
    const px = dir === 1 ? q.bid * (1 - SCALP.slip) : q.ask * (1 + SCALP.slip), notional = Number(t.entry_price) * Number(t.size)
    closes.push({ id: t.id, price: px, quote_ts: q.ts, reason: 'HOLD_END', funding: fsum === null ? 0 : dir * fsum * notional, funding_sum: fsum, funding_missing: fsum === null })
  })
  // entries: fresh announcements
  const entries: any[] = [], seen: any[] = []; let pollErr: string | null = null
  if (pollDue) {
    try {
      const arts: Article[] = []
      for (const cat of EV_CATALOGS) {
        const r = await fetch(`https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=${cat}&pageNo=1&pageSize=10`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) })
        if (!r.ok) throw new Error(`cms ${cat} HTTP ${r.status}`)
        const d = await r.json()
        for (const c of d?.data?.catalogs ?? []) for (const a of c.articles ?? []) arts.push({ releaseDate: Number(a.releaseDate), title: String(a.title) })
      }
      const prem = await json('https://fapi.binance.com/fapi/v1/premiumIndex')
      const marks = new Map<string, number>(prem.map((p: any) => [String(p.symbol), Number(p.markPrice)]))
      // the 240-min rules only (H7L240 / H7D240); one position per coin per announcement
      const rows = eventEntries(arts, marks, now, new Set()).filter(r => r.hyp.endsWith('240'))
      const { data: past } = await db.from('bot_trades').select('sym,scalp_meta').eq('strategy', 'EVT').gte('opened_at', new Date(now - 24 * 3600e3).toISOString()).throwOnError()
      const done = new Set<string>((past ?? []).map((t: any) => `${t.sym}:${t.scalp_meta?.announced_at}`))
      const held = new Set<string>(open.map((t: any) => String(t.sym)))
      let cash = Number(state.balance), room = cfg.maxOpen - (mine.length - closes.length)
      const equity = cash + open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size), 0)
      for (const r of rows) {
        const sym = symOf(r.symbol), side = r.side > 0 ? 'LONG' : 'SHORT'
        seen.push({ sym, side, announced_at: r.settle_at, note: r.note })
        if (done.has(`${sym}:${r.settle_at}`) || held.has(sym) || room <= 0) continue
        const n = Math.min(equity * cfg.perTrade, cash / (1 + SCALP.fee)); if (n < 20) break
        let q: Quote; try { q = await quote(sym) } catch { continue }
        entries.push({ sym, side, price: r.side > 0 ? q.ask * (1 + SCALP.slip) : q.bid * (1 - SCALP.slip), notional: n, quote_ts: q.ts, source: q.source,
          symbol: r.symbol, announced_at: r.settle_at, exit_due: new Date(now + cfg.holdMs).toISOString(), note: r.note })
        held.add(sym); room--; cash -= n * (1 + SCALP.fee)
      }
    } catch (e: any) { pollErr = String(e?.message ?? e) }
  }
  if (!closes.length && !entries.length && !pollDue) return { changed: false, open: mine.length, waiting: due.length }
  const note = { poll_due: pollDue, seen: seen.slice(0, 10), poll_error: pollErr, open: mine.length }
  const { data: result } = await db.rpc('evt_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_note: note,
    p_poll: pollDue && !pollErr ? now : null, p_per_trade: cfg.perTrade, p_max_open: cfg.maxOpen }).throwOnError()
  return { changed: closes.length > 0 || entries.length > 0, ...result, ...note }
}
