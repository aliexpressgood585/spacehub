// BLADE + DONCH4H runners (quant/PREREGISTRATION_BLADE.md). Paper only. One paper book holding only BLADE and DONCH4H
// rows; each runner commits through `blade_commit_cycle` with its own p_sleeve, so neither can touch the other's rows.
//  runBlade: every cycle — (1) exits of paper BLADE rows and of open SHADOW virtual rows, resolved on Binance aggTrades in
//    time order (bladeStep); (2) polls the Binance CMS (catalogs 48 / 161), remembers when each article was FIRST seen
//    (detect_lag_ms), and for a fresh listing / delisting runs the pre-registered gates. The level in use is
//    min(earned, __BLADE_MAX_LEVEL); SHADOW journals a virtual fill in blade_events, PROBE / ATTACK book a paper trade.
//  runDonch: every cycle — ladder exits of DONCH4H rows on aggTrades (shared/strategy.ts ladderStep, prints in order);
//    once per 4h bar (first 15 min after the close) — Donchian-15 / ADX>22 entries on the pinned 40, 1.25% base risk x ADX
//    tier, 1x, taker at the walked book; a virtual post-only limit at the touch is recorded and judged after 90 s.
import * as S from '../../../shared/strategy.ts'
import { BLADE, bladeCandidates, bladeGate, bladeSize, bladeOpen, bladeStep, fillNet, earnedLevel, effectiveLevel, haltReason, lossStreak, makerFilled, type BladeLevel, type BladePos, type BladeEvt } from '../../../shared/blade.ts'
import { EV_CATALOGS, perpOf, detectLag } from '../../../shared/events.ts'
import { walkBook } from '../../../shared/fast.ts'
import { json, pool } from './rota-runner.ts'
import { aggTrades, book, type Pair } from './fast-runner.ts'
import { sleeveOff } from '../../../shared/sleeves.ts'

const g = () => globalThis as any
export const BLADE_SLEEVES = ['BLADE', 'DONCH4H']
const pairOf = (sym: string): Pair => (sym === 'PEPE' ? { sym, s: '1000PEPEUSDT', k: 1000 } : { sym, s: `${sym}USDT`, k: 1 })
// bot symbol for a perp: PEPE keeps its legacy unit; other 1000x contracts trade as listed (same as EVT)
const symOfPerp = (perp: string) => (perp === '1000PEPEUSDT' ? 'PEPE' : perp.slice(0, -4))
const pairOfPerp = (perp: string): Pair => (perp === '1000PEPEUSDT' ? { sym: 'PEPE', s: perp, k: 1000 } : { sym: perp.slice(0, -4), s: perp, k: 1 })
export function bladeShimMax(): string { return String(g().__BLADE_MAX_LEVEL ?? 'SHADOW').toUpperCase() }

async function openBook(db: any) {
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || !BLADE_SLEEVES.includes(t.strategy)))
    throw new Error('BLADE/DONCH4H require a paper-only book of BLADE and DONCH4H rows (close other sleeves first)')
  return open as any[]
}
const marginOf = (t: any) => Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1)
async function fundingSum(s: string, from: number, to: number): Promise<number | null> {
  try { const f = await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${s}&startTime=${from}&endTime=${to}&limit=1000`)
    return Array.isArray(f) ? f.reduce((a: number, x: any) => a + Number(x.fundingRate || 0), 0) : null } catch { return null }
}

// ───────────────────────────────────────────── BLADE ─────────────────────────────────────────────
// v101.1 (owner: "scan every second"): the CMS is read about once a second. The 5 s cron cycle polls once itself, then
// cmsWatch() keeps polling every ~1 s until just before the next cron call, holding the lease, with NO database write per
// poll. A key the bot has not seen yet ends the watch and index.ts re-runs runBlade at once, so a fresh announcement is
// acted on within ~1 s of Binance publishing it to the CMS (the CMS itself remains the bound on detection).
export const BLADE_SCAN = { pollGapMs: 900, watchGapMs: 1000, watchUntilMs: 4300, beatMs: 10_000 } as const
export async function cmsArticles(): Promise<{ rel: number; key: string; title: string }[]> {
  const out: { rel: number; key: string; title: string }[] = []
  const res = await Promise.all(EV_CATALOGS.map(async cat => {
    const r = await fetch(`https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=${cat}&pageNo=1&pageSize=10`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(2500) })
    if (!r.ok) throw new Error(`cms ${cat} HTTP ${r.status}`)
    return r.json()
  }))
  for (const d of res) for (const c of d?.data?.catalogs ?? []) for (const a of c.articles ?? []) {
    const rel = Number(a.releaseDate)
    out.push({ rel, key: `${rel}:${String(a.code ?? a.title).slice(0, 40)}`, title: String(a.title) })
  }
  return out
}
// stats of the last watch in this isolate; the next runBlade reports them (warm isolates at a 5 s cadence)
let lastWatch: { polls: number; errors: number; lastOk: number; err: string | null; at: number } | null = null
export async function cmsWatch(seenKeys: Set<string>, untilMs: number, fetcher = cmsArticles, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))) {
  let polls = 0, errors = 0, lastOk = 0, err: string | null = null, hit = false
  while (Date.now() + BLADE_SCAN.watchGapMs <= untilMs) {
    await sleep(BLADE_SCAN.watchGapMs)
    polls++
    try { const arts = await fetcher(); lastOk = Date.now(); err = null; if (arts.some(a => !seenKeys.has(a.key))) { hit = true; break } }
    catch (e: any) { errors++; err = String(e?.message ?? e) }
  }
  lastWatch = { polls, errors, lastOk, err, at: Date.now() }
  return { hit, polls, errors, lastOk, err }
}

export async function runBlade(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('BLADE is paper-only; refusing live execution')
  const now = Date.now(), params = state.bot_params || {}, prev = params.blade_cycle || {}
  const open = await openBook(db), mine = open.filter(t => t.strategy === 'BLADE')
  const closes: any[] = [], legs: any[] = [], ratchets: any[] = [], entries: any[] = [], marks: Record<string, number> = {}
  // 1a. paper exits
  await pool<any>(mine, 3, async t => {
    const m = t.scalp_meta?.blade, P = pairOfPerp(m.perp), pos: BladePos = m.pos
    try {
      const from = Number(m.chk ?? pos.openedAt) + 1, tr = await aggTrades(P, from, now)
      let mark: number | null = null, qts = now
      if (now - pos.openedAt >= pos.maxMs) { const bk = await book(P); mark = pos.side > 0 ? bk.bids[0][0] : bk.asks[0][0]; qts = bk.E }
      const r = bladeStep(pos, tr.trades, now, mark), sizeOrig = Number(t.scalp_meta?.notional0) / Number(t.entry_price)
      const chk = tr.trades.at(-1)?.T ?? m.chk ?? pos.openedAt
      for (const f of r.fills) if (f.why === 'SCALE')
        legs.push({ id: t.id, qty: sizeOrig * f.frac, price: f.px, reason: 'SCALE', quote_ts: f.T, stage: 1, stop_after: r.pos.stop, meta: r.done ? undefined : { blade: { ...m, pos: r.pos, chk } } })
      const last = r.fills.at(-1)
      if (r.done && last) {
        const px = last.why !== 'TARGET' ? last.px * (1 - pos.side * BLADE.slip) : last.px
        const fs = await fundingSum(P.s, pos.openedAt, now)
        closes.push({ id: t.id, price: px, reason: last.why, quote_ts: last.why === 'TIMEOUT' ? qts : last.T, funding: fs === null ? 0 : pos.side * fs * Number(t.entry_price) * Number(t.size), funding_missing: fs === null,
          fill: { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: last.T, trigger_px: last.px, lag_ms: now - last.T } })
      } else if (!r.fills.length) ratchets.push({ id: t.id, stop: r.pos.stop, meta: { blade: { ...m, pos: r.pos, chk } } })
      marks[t.sym] = tr.trades.at(-1)?.p ?? Number(t.entry_price)
    } catch { /* next cycle */ }
  })
  // 1b. shadow virtual exits (journal only, no money)
  const { data: shadows } = await db.from('blade_events').select('*').eq('status', 'open').eq('mode', 'shadow').throwOnError()
  await pool<any>(shadows ?? [], 3, async (e: any) => {
    const pos: BladePos = e.pos, P = pairOfPerp(e.perp)
    try {
      const tr = await aggTrades(P, Number(e.chk ?? pos.openedAt) + 1, now)
      let mark: number | null = null
      if (now - pos.openedAt >= pos.maxMs) { const bk = await book(P); mark = pos.side > 0 ? bk.bids[0][0] : bk.asks[0][0] }
      const r = bladeStep(pos, tr.trades, now, mark), fills = [...(e.fills ?? []), ...r.fills]
      if (r.done) await db.from('blade_events').update({ status: 'closed', fills, net: fills.reduce((s: number, f: any) => s + fillNet(pos.side, pos.entry, f), 0), closed_at: new Date(now).toISOString(), pos: r.pos }).eq('id', e.id)
      else await db.from('blade_events').update({ pos: r.pos, fills, chk: tr.trades.at(-1)?.T ?? e.chk }).eq('id', e.id)
    } catch { /* next cycle */ }
  })
  // 2. level from the record
  const { data: past } = await db.from('blade_events').select('mode,net,closed_at,detect_lag_ms,rule,ann_key').in('status', ['closed']).order('closed_at').limit(500).throwOnError()
  const { data: paperRows } = await db.from('bot_trades').select('pnl,closed_at,scalp_meta').eq('strategy', 'BLADE').neq('status', 'OPEN').order('closed_at').limit(500).throwOnError()
  const evts: BladeEvt[] = [...(past ?? []).filter((e: any) => e.mode === 'shadow').map((e: any) => ({ net: Number(e.net), closedAt: Date.parse(e.closed_at), paper: false })),
    ...(paperRows ?? []).map((t: any) => ({ net: Number(t.pnl) / Math.max(1, Number(t.scalp_meta?.notional0) || 1), closedAt: Date.parse(t.closed_at), paper: true }))]
  const day0 = new Date(now); day0.setUTCHours(0, 0, 0, 0)
  const paperToday = (paperRows ?? []).filter((t: any) => Date.parse(t.closed_at) >= day0.getTime()).reduce((s: number, t: any) => s + Number(t.pnl || 0), 0)
  const cash = Number(state.balance), equity = cash + open.reduce((s, t) => s + marginOf(t), 0)
  const halt = haltReason(paperToday, equity, lossStreak((paperRows ?? []).map((t: any) => Number(t.pnl))))
  const lags: number[] = Array.isArray(prev.list_lags) ? prev.list_lags : []
  const lvl = effectiveLevel(earnedLevel(evts), bladeShimMax(), lags, halt)
  // 3. detection
  let seen: Record<string, any> = prev.seen && typeof prev.seen === 'object' ? { ...prev.seen } : {}
  const seeded = Object.keys(seen).length > 0
  const pollDue = now - (Number(prev.poll_ts) || 0) >= BLADE_SCAN.pollGapMs
  let pollErr: string | null = null, fresh: { releaseDate: number; title: string; firstSeen: number }[] = [], articles = 0
  if (pollDue) {
    try {
      for (const a of await cmsArticles()) {
        articles++
        if (seen[a.key]) continue
        seen[a.key] = { first: now, rel: a.rel, lag: seeded ? detectLag(now, a.rel) : null, title: a.title.slice(0, 120) }
        if (seeded) fresh.push({ releaseDate: a.rel, title: a.title, firstSeen: now })
      }
    } catch (e: any) { pollErr = String(e?.message ?? e) }
    const keys = Object.keys(seen).sort((a, b) => seen[b].rel - seen[a].rel).slice(0, 60); seen = Object.fromEntries(keys.map(k => [k, seen[k]]))
  }
  // 4. gates on fresh parsed candidates
  const decisions: any[] = []
  const newLags = [...lags]
  if (fresh.length) {
    let perps = new Set<string>(), liquid = new Set<string>()
    try { const prem = await json('https://fapi.binance.com/fapi/v1/premiumIndex'); perps = new Set(prem.map((p: any) => String(p.symbol))) } catch (e: any) { pollErr = `premiumIndex: ${e?.message ?? e}` }
    try { const { data } = await db.from('market_cache').select('data').eq('key', 'universe').throwOnError(); for (const p of data?.[0]?.data?.pairs ?? []) liquid.add(String(p.s)) } catch { /* empty = no delist shorts */ }
    let room = BLADE.maxOpen[lvl.level] - mine.length + closes.length, cashLeft = cash
    for (const a of fresh) {
      const cands = bladeCandidates(a.title, a.releaseDate, c => perpOf(c, perps), p => liquid.has(p))
      if (cands.length && cands[0].kind === 'LIST') newLags.push(detectLag(a.firstSeen, a.releaseDate))
      for (const c of cands) {
        const P = pairOfPerp(c.perp), sym = symOfPerp(c.perp), lag = detectLag(a.firstSeen, a.releaseDate)
        const base = { ann_key: `${c.releaseDate}:${c.coin}`, rule: c.id, coin: c.coin, perp: c.perp, side: c.side, title: c.title.slice(0, 200),
          release_at: new Date(c.releaseDate).toISOString(), seen_at: new Date(a.firstSeen).toISOString(), detect_lag_ms: Number.isFinite(lag) ? Math.round(lag) : null, level: lvl.level }
        let bk: any = null, atr1m = NaN
        try { bk = await book(P) } catch { /* gate reports stale_quote */ }
        try { const k = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${P.s}&interval=1m&limit=16`)
          const b = k.slice(0, -1).map((x: any) => ({ h: +x[2] / P.k, l: +x[3] / P.k, c: +x[4] / P.k })); let s = 0
          for (let i = 1; i < b.length; i++) s += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); atr1m = s / Math.max(1, b.length - 1) } catch { /* trail 0 = hard stop only */ }
        // gate at the size ATTACK would trade, so the book is tested at real size even while sizing is 0
        const attack = bladeSize('ATTACK', c.id, equity, Math.max(cash, equity)), used = bladeSize(lvl.level, c.id, equity, cashLeft)
        const lvSide = c.side > 0 ? bk?.asks : bk?.bids, w = lvSide ? walkBook(lvSide, Math.max(attack.notional, 100)) : { vwap: NaN, impact: NaN, depthUsd: 0, beyond: true }
        const gate = sleeveOff(params, 'BLADE') ? 'brake' : bladeGate({ kind: c.kind, releaseDate: c.releaseDate, now: Date.now(), quoteTs: bk?.E ?? 0, bid: bk?.bids?.[0]?.[0] ?? 0, ask: bk?.asks?.[0]?.[0] ?? 0, walkImpact: w.impact, walkBeyond: w.beyond })
        const wUsed = lvSide && used.notional > 0 ? walkBook(lvSide, used.notional) : w
        const entry = wUsed.vwap, pos = Number.isFinite(entry) ? bladeOpen(c.id, c.side, entry, atr1m, Date.now()) : null
        const note = { spread_bps: bk ? +((bk.asks[0][0] / bk.bids[0][0] - 1) * 1e4).toFixed(2) : null, impact_bps: Number.isFinite(w.impact) ? +(w.impact * 1e4).toFixed(1) : null,
          depth_usd: Math.round(w.depthUsd), atr1m, level_why: lvl.why, attack_notional: Math.round(attack.notional) }
        if (gate || !pos) { decisions.push({ ...base, gate: gate ?? 'no_price', mode: 'skipped', status: 'skipped', note }); continue }
        if ((lvl.level === 'PROBE' || lvl.level === 'ATTACK') && used.notional >= 20 && room > 0 && !open.some(t => t.sym === sym)) {
          entries.push({ sym, side: c.side > 0 ? 'LONG' : 'SHORT', price: entry, notional: used.notional, lev: BLADE.lev, stop: pos.stop, target: pos.target, quote_ts: bk.E, source: 'binance-futures',
            release_at: base.release_at, meta: { blade: { rule: c.id, ann_key: base.ann_key, perp: c.perp, pos, chk: bk.E, title: c.title.slice(0, 160), detect_lag_ms: base.detect_lag_ms } } })
          decisions.push({ ...base, gate: null, mode: 'paper', status: 'closed', entry_px: entry, pos, note: { ...note, paper_notional: Math.round(used.notional) } })
          room--; cashLeft -= used.margin * (1 + BLADE.lev * BLADE.fee)
        } else decisions.push({ ...base, gate: null, mode: 'shadow', status: 'open', entry_px: entry, pos, chk: bk.E, note })
      }
    }
  }
  if (decisions.length) await db.from('blade_events').upsert(decisions, { onConflict: 'ann_key,rule', ignoreDuplicates: true })
  const changed = closes.length + legs.length + entries.length > 0 || fresh.length > 0 || ratchets.length > 0
  const beat = now - (Number(prev.ts_ms) || 0) >= BLADE_SCAN.beatMs
  if (!changed && !beat) return { changed: false, level: lvl.level, open: mine.length }
  const lagsOut = newLags.filter(Number.isFinite).slice(-BLADE.lagWindow)
  const w = lastWatch, ownPoll = pollDue && !pollErr ? now : Number(prev.poll_ts) || 0
  const note = { ts_ms: now, poll_ts: Math.max(ownPoll, w?.lastOk ?? 0) || null, poll_error: pollErr ?? w?.err ?? null, scan_ms: BLADE_SCAN.watchGapMs, watch: w ? { polls: w.polls, errors: w.errors, at: w.at } : null, articles, seen, marks, marks_ts: new Date(now).toISOString(), list_lags: lagsOut, level_why: lvl.why, halt, shadow_open: (shadows ?? []).length,
    decisions: decisions.map(d => ({ rule: d.rule, coin: d.coin, gate: d.gate, mode: d.mode, lag: d.detect_lag_ms })) }
  const { data: result } = await db.rpc('blade_commit_cycle', { p_lease: lease, p_sleeve: 'BLADE', p_closes: closes, p_legs: legs, p_ratchets: ratchets, p_entries: entries,
    p_marks: marks, p_note: note, p_level: lvl.level, p_max_open: BLADE.maxOpen[lvl.level], p_snapshot: false }).throwOnError()
  return { changed, level: lvl.level, ...result, fresh: fresh.length, decisions: note.decisions, poll_error: pollErr }
}

// ───────────────────────────────────────────── DONCH4H ─────────────────────────────────────────────
export const DONCHX = { riskMult: 1.25 / 1.75, entryWindowMs: 15 * 60_000, barMs: 4 * 3600_000, makerWindowMs: 90_000, snapshotMs: 15 * 60_000 } as const
interface Ladder { stage: 0 | 1 | 2; stopPx: number; sizeOrig: number; sizeLeft: number; origSlDist: number; chk: number }
export async function runDonch(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('DONCH4H is paper-only; refusing live execution')
  const now = Date.now(), params = state.bot_params || {}, prev = params.donch_cycle || {}
  const open = await openBook(db), mine = open.filter(t => t.strategy === 'DONCH4H')
  const closes: any[] = [], legs: any[] = [], ratchets: any[] = [], entries: any[] = [], marks: Record<string, number> = {}
  // exits: every print since the last check through the shared ladder state machine
  await pool<any>(mine, 4, async t => {
    const P = pairOf(t.sym), L: Ladder = t.scalp_meta?.ladder, side = t.side as S.Side, opened = Date.parse(t.opened_at)
    try {
      const tr = await aggTrades(P, Number(L.chk) + 1, now)
      const pos: S.LadderPos = { side, entry: Number(t.entry_price), origSlDist: L.origSlDist, stage: L.stage, stopPx: L.stopPx, sizeLeft: Number(t.size), sizeOrig: L.sizeOrig }
      let done = false, lastT = Number(L.chk), stopBefore = pos.stopPx
      const legOut: any[] = []
      for (const x of tr.trades) {
        lastT = x.T
        const a = S.ladderStep(pos, x.p, x.p, x.T - opened)
        if (a.kind === 'leg') { legOut.push({ qty: a.qty, price: a.px, stage: a.stage, T: x.T, stop_after: a.stopPx }); pos.stage = a.stage; pos.stopPx = a.stopPx; pos.sizeLeft -= a.qty }
        else if (a.kind === 'close') {
          const fs = await fundingSum(P.s, opened, now), dirM = side === 'LONG' ? 1 : -1
          for (const l of legOut) legs.push({ id: t.id, qty: l.qty, price: l.price, reason: `LEG${l.stage}`, quote_ts: l.T, stage: l.stage, stop_after: l.stop_after })
          closes.push({ id: t.id, price: a.px, reason: a.reason.toUpperCase(), quote_ts: x.T, funding: fs === null ? 0 : dirM * fs * Number(t.entry_price) * L.sizeOrig, funding_missing: fs === null,
            fill: { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: x.T, trigger_px: x.p, lag_ms: now - x.T } })
          done = true; break
        } else pos.stopPx = a.stopPx
      }
      // time limit with no print in the window
      if (!done && now - opened > S.MAX_HOLD_MS) {
        const bk = await book(P), px = side === 'LONG' ? bk.bids[0][0] * (1 - S.SLIP) : bk.asks[0][0] * (1 + S.SLIP)
        for (const l of legOut) legs.push({ id: t.id, qty: l.qty, price: l.price, reason: `LEG${l.stage}`, quote_ts: l.T, stage: l.stage, stop_after: l.stop_after })
        closes.push({ id: t.id, price: px, reason: 'TIMEOUT', quote_ts: bk.E }); done = true
      }
      if (!done) {
        const ladder: Ladder = { ...L, stage: pos.stage, stopPx: pos.stopPx, sizeLeft: pos.sizeLeft, chk: lastT }
        legOut.forEach((l, i) => legs.push({ id: t.id, qty: l.qty, price: l.price, reason: `LEG${l.stage}`, quote_ts: l.T, stage: l.stage, stop_after: l.stop_after, meta: i === legOut.length - 1 ? { ladder } : undefined }))
        // maker-post experiment: judge the virtual limit once its 90 s window has passed
        const mk = t.scalp_meta?.maker, meta: any = { ladder }
        if (mk && mk.filled === null && now - mk.t0 >= DONCHX.makerWindowMs) {
          try { const w = await aggTrades(P, mk.t0, mk.t0 + DONCHX.makerWindowMs); meta.maker = { ...mk, ...makerFilled(side === 'LONG' ? 1 : -1, mk.limit, w.trades, mk.t0) } } catch { /* retry */ }
        }
        if (!legOut.length || meta.maker) ratchets.push({ id: t.id, stop: pos.stopPx !== stopBefore || legOut.length ? pos.stopPx : null, meta })
      }
      marks[t.sym] = tr.trades.at(-1)?.p ?? Number(t.entry_price)
    } catch { /* next cycle */ }
  })
  // entries: once per 4h bar, first 15 minutes after the close
  const bar = Math.floor(now / DONCHX.barMs) * DONCHX.barMs
  const due = now - bar < DONCHX.entryWindowMs && Number(prev.bar) !== bar && !state.hard_halt_at && !sleeveOff(params, 'DONCH4H')
  const decisions: any[] = []
  if (due) {
    const cash0 = Number(state.balance), equity = cash0 + open.reduce((s, t) => s + marginOf(t), 0)
    let openExp = open.reduce((s, t) => s + Number(t.entry_price) * Number(t.size), 0), committed = 0, cash = cash0
    let longExp = mine.filter(t => t.side === 'LONG').reduce((s, t) => s + Number(t.entry_price) * Number(t.size), 0)
    let shortExp = mine.filter(t => t.side === 'SHORT').reduce((s, t) => s + Number(t.entry_price) * Number(t.size), 0)
    const held = new Set(open.map(t => String(t.sym)))
    for (const coin of S.CRYPTO_40) {
      if (entries.length >= S.MAX_NEW_ENTRIES_PER_SCAN) break
      if (held.has(coin)) continue
      const P = pairOf(coin)
      try {
        const k = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${P.s}&interval=4h&limit=100`)
        const completed: S.Bar[] = k.filter((x: any) => Number(x[6]) < now).map((x: any) => ({ t: +x[0], open: +x[1] / P.k, high: +x[2] / P.k, low: +x[3] / P.k, close: +x[4] / P.k, vol: +x[5] * P.k }))
        if (!completed.length || completed[completed.length - 1].t !== bar - DONCHX.barMs) { decisions.push({ coin, why: 'bar_lag' }); continue }
        const sig = S.donchSignal(completed); if (!sig) continue
        const adx = S.gateAdx(completed); if (!(adx > S.ADX_GATE)) { decisions.push({ coin, why: 'adx_gate', adx: +adx.toFixed(1) }); continue }
        const bk = await book(P), touch = sig.side === 'LONG' ? bk.asks[0][0] : bk.bids[0][0]
        const atr = S.entryAtr(completed), sl = S.stopDistance(atr, touch), slPct = sl / touch
        if (slPct > S.SL_MAX_PCT) { decisions.push({ coin, why: 'stop_too_wide' }); continue }
        const sz = S.sizeBreakout({ portfolio: equity, balance: cash, openExposure: openExp, heatCommitted: committed, longExposure: longExp, shortExposure: shortExp, symExposure: 0,
          adx, slPct, side: sig.side, quoteVol24h: 0, riskMult: DONCHX.riskMult })
        if (!sz.ok) { decisions.push({ coin, why: sz.reason }); continue }
        const w = walkBook(sig.side === 'LONG' ? bk.asks : bk.bids, sz.notional)
        if (w.beyond) { decisions.push({ coin, why: 'beyond_book' }); continue }
        // taker at the walked book, never better than the touch plus the model slip
        const dirM = sig.side === 'LONG' ? 1 : -1, entry = dirM > 0 ? Math.max(w.vwap, touch * (1 + S.SLIP)) : Math.min(w.vwap, touch * (1 - S.SLIP))
        const stop = entry - dirM * sl, size = sz.notional / entry
        entries.push({ sym: coin, side: sig.side, price: entry, notional: sz.notional, stop, target: entry + dirM * sl * S.LADDER_TP_R, quote_ts: bk.E, source: 'binance-futures',
          meta: { donch: { adx: +adx.toFixed(2), hiN: sig.hiN, loN: sig.loN, atr, sl_pct: +slPct.toFixed(5), tier: S.adxTierMult(adx), bar: new Date(bar - DONCHX.barMs).toISOString(), impact_bps: +(w.impact * 1e4).toFixed(2) },
            ladder: { stage: 0, stopPx: stop, sizeOrig: size, sizeLeft: size, origSlDist: sl, chk: bk.E } as Ladder,
            maker: { limit: sig.side === 'LONG' ? bk.bids[0][0] : bk.asks[0][0], t0: bk.E, filled: null, T: null } } })
        decisions.push({ coin, why: 'entry', side: sig.side, adx: +adx.toFixed(1), notional: Math.round(sz.notional) })
        held.add(coin); committed += sz.notional; cash -= sz.notional * (1 + S.FEE_TAKER)
        if (sig.side === 'LONG') longExp += sz.notional; else shortExp += sz.notional
      } catch (e: any) { decisions.push({ coin, why: 'feed_error', err: String(e?.message ?? e).slice(0, 60) }) }
    }
  }
  const snap = now - (Number(params.blade_eq_ts) || 0) >= DONCHX.snapshotMs
  const changed = closes.length + legs.length + entries.length + ratchets.length > 0
  if (!changed && !due && !snap) return { changed: false, open: mine.length }
  const note = { bar: due ? bar : prev.bar ?? null, scanned_at: due ? now : prev.scanned_at ?? null, marks, marks_ts: new Date(now).toISOString(), decisions: due ? decisions.slice(0, 60) : prev.decisions ?? [] }
  const { data: result } = await db.rpc('blade_commit_cycle', { p_lease: lease, p_sleeve: 'DONCH4H', p_closes: closes, p_legs: legs, p_ratchets: ratchets, p_entries: entries,
    p_marks: marks, p_note: note, p_level: 'DONCH', p_max_open: 30, p_snapshot: snap }).throwOnError()
  return { changed, ...result, due, entries: entries.length }
}
